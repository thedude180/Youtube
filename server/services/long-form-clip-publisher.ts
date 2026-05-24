/**
 * long-form-clip-publisher.ts
 *
 * Publishes AI-identified long-form clips (8-60 min) that the relentless
 * content grinder queues for length experimentation.  These are regular
 * horizontal (16:9) YouTube videos — not Shorts — cut from the best
 * segment of each source recording.
 *
 * Minimum 8 min enforces the YouTube AdSense mid-roll threshold so every
 * upload is eligible for ad revenue from day one.
 *
 * Each upload tests a different duration (8 / 10 / 15 / 30 / 45 / 60 min)
 * to help discover which video length maximises watch time for the channel.
 *
 * Upload strategy:
 *   Batch-upload all items scheduled within the next 14 days to YouTube NOW,
 *   passing each item's scheduledAt as YouTube's publishAt so YouTube's own
 *   scheduler releases them 48 h apart automatically.  Long-form ffmpeg
 *   encodes are expensive so the batch cap is kept at 5/run.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import cron from "node-cron";
import { db } from "../db";
import { autopilotQueue, videos, channels, contentVaultBackups } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube } from "../youtube";
import { getYtdlpBin } from "../lib/dependency-check";
import { recordHeartbeat } from "./engine-heartbeat";
import { MAX_LONGFORM_PER_DAY, countUploadedLongFormForDate, getNextLongFormPublishTime } from "./youtube-output-schedule";

const logger = createLogger("long-form-publisher");

const MAX_PER_RUN = 50; // quota is the real gate; 50 works through a deep queue efficiently
const BATCH_WINDOW_DAYS = 365; // 365-day window — shadow schedule is unlimited; quota + MAX_PER_RUN cap actual uploads per night
const MAX_SEGMENT_SEC = 3600; // 60 min hard ceiling
const MIN_LONG_FORM_SEC = 480; // 8 min — YouTube mid-roll monetization threshold
const LONG_FORM_TEMP_DIR = path.join(process.cwd(), "data", "longform-tmp");

// Duration experiment buckets (minutes).  Each upload is assigned one bucket
// so we can correlate video length with audience retention / watch-time.
const EXPERIMENT_DURATIONS_MIN = [8, 10, 15, 20, 30, 45, 60] as const;

/**
 * Pick (or honour) an experiment duration for a long-form upload.
 *
 * If the queue item already has `experimentDurationMin` set (assigned at
 * queue time) we always use that so retries stay on the same bucket.
 * Otherwise we draw uniformly at random from the buckets that fit inside
 * the available footage.
 *
 * Returns the chosen duration in **seconds**.
 */
function pickExperimentDurationSec(maxAvailableSec: number, existingMin?: number): number {
  if (existingMin && existingMin >= 8 && existingMin <= 60) {
    return existingMin * 60;
  }
  const available = EXPERIMENT_DURATIONS_MIN.filter(m => m * 60 <= maxAvailableSec);
  if (available.length === 0) return MIN_LONG_FORM_SEC; // nothing fits — use minimum
  const chosen = available[Math.floor(Math.random() * available.length)];
  return chosen * 60;
}

if (!fs.existsSync(LONG_FORM_TEMP_DIR)) {
  fs.mkdirSync(LONG_FORM_TEMP_DIR, { recursive: true });
}

let isRunning = false;

// ---------------------------------------------------------------------------
// FFmpeg / yt-dlp helpers (16:9 horizontal encoding — letterbox to landscape)
// ---------------------------------------------------------------------------

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(errBufs).toString("utf8").slice(-600)));
    });
    proc.on("error", reject);
  });
}

async function extractSegment(
  sourcePath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  await runCmd("ffmpeg", [
    "-y",
    "-ss", String(startSec),
    "-i", sourcePath,
    "-t", String(durationSec),
    // 16:9 horizontal — letterbox to 3840×2160 (4K), keep original aspect ratio (no crop)
    "-vf", "scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
    "-crf", "20",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-threads", "2",
    outputPath,
  ]);
}

async function downloadSegmentFromYouTube(
  youtubeId: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const ytdlp = getYtdlpBin();
  const cookiesPath = path.join(process.cwd(), ".local", "yt-cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;

  const args: string[] = [
    "--download-sections", `*${startSec}-${endSec}`,
    "--force-keyframes-at-cuts",
    // Permissive format chain: prefer 1080p, fall back through lower resolutions
    // to whatever is available so the download never fails on format availability.
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
  ];

  if (hasCookies) args.push("--cookies", cookiesPath);
  args.push(`https://www.youtube.com/watch?v=${youtubeId}`);
  await runCmd(ytdlp, args);
}

// ---------------------------------------------------------------------------
// Main publish function
// ---------------------------------------------------------------------------

export async function runLongFormClipPublisher(): Promise<{ published: number; failed: number; skipped: number }> {
  if (isRunning) {
    logger.debug("Long-form publisher already running — skipping");
    return { published: 0, failed: 0, skipped: 1 };
  }
  isRunning = true;

  let published = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const now = new Date();
    // Batch window: pick up all long-form clips scheduled in the next 14 days.
    // Upload them all now with publishAt set so YouTube spaces their release.
    const batchWindow = new Date(now.getTime() + BATCH_WINDOW_DAYS * 86400_000);

    const dueItems = await db.select().from(autopilotQueue)
      .where(and(
        // auto-clip = grinder/segmenter long-form; vod-long-form = full-VOD upload path
        sql`${autopilotQueue.type} IN ('auto-clip','vod-long-form')`,
        eq(autopilotQueue.status, "scheduled"),
        lte(autopilotQueue.scheduledAt, batchWindow),
        sql`COALESCE(${autopilotQueue.metadata}->>'contentType','long-form-clip') IN ('long-form-clip','vod_long_form')`,
      ))
      .orderBy(autopilotQueue.scheduledAt)
      .limit(MAX_PER_RUN * 4);

    if (dueItems.length === 0) return { published: 0, failed: 0, skipped: 0 };

    // Check YouTube API quota once — stop the whole batch if tripped
    const { isQuotaBreakerTripped, canAffordOperation } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn("YouTube quota breaker active — skipping long-form batch");
      return { published: 0, failed: 0, skipped: dueItems.length };
    }

    for (const item of dueItems) {
      if (published >= MAX_PER_RUN) break;

      // Per-upload budget check — stops the batch when remaining quota can no
      // longer cover another upload (1,600 units + 200 safety buffer).
      if (!await canAffordOperation(item.userId, "upload")) {
        logger.info(`[LongFormPublisher] Upload budget at ceiling — stopping batch (${published} uploaded this run)`);
        break;
      }

      const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
      const startSec = Number(itemMeta.segmentStartSec ?? 0);
      const endSec = Number(itemMeta.segmentEndSec ?? 0);
      const rawDurationSec = Math.min(endSec - startSec, MAX_SEGMENT_SEC);

      // Back-catalog items have sourceVideoId=null but carry sourceYoutubeId in
      // metadata — the publisher yt-dlp downloads directly from YouTube so a
      // local file is not required.  Only fail if BOTH are absent.
      const hasYtSource = typeof itemMeta.sourceYoutubeId === "string" && itemMeta.sourceYoutubeId.length > 0;
      if (rawDurationSec < MIN_LONG_FORM_SEC || (!item.sourceVideoId && !hasYtSource)) {
        const tooShort = (item.sourceVideoId || hasYtSource) && rawDurationSec < MIN_LONG_FORM_SEC;
        await db.update(autopilotQueue)
          .set({
            status: "failed",
            errorMessage: tooShort
              ? `Segment too short for monetization (${Math.round(rawDurationSec / 60)}m) — long-form must be at least 8 minutes`
              : "Invalid segment bounds: no local sourceVideoId and no sourceYoutubeId in metadata",
          })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

      // ── Reschedule past-due items ─────────────────────────────────────────
      // Items blocked by the quota breaker carry a scheduledAt in the past.
      // Publishing them as-is bursts all past content at midnight as immediate
      // public uploads.  Bump each one to the next valid future slot so
      // YouTube holds it and releases at the correct spaced time.
      let effectiveScheduledAt: Date | null = item.scheduledAt ? new Date(item.scheduledAt) : null;
      if (!effectiveScheduledAt || effectiveScheduledAt.getTime() <= Date.now() + 60_000) {
        try {
          const newSlot = await getNextLongFormPublishTime(item.userId);
          await db.update(autopilotQueue)
            .set({ scheduledAt: newSlot })
            .where(eq(autopilotQueue.id, item.id));
          effectiveScheduledAt = newSlot;
          logger.info(`[LongFormPublisher] Past-due item ${item.id} rescheduled to ${newSlot.toISOString()}`);
        } catch (err: any) {
          logger.warn(`[LongFormPublisher] Reschedule failed for item ${item.id}: ${err.message?.slice(0, 100)} — skipping to avoid burst`);
          skipped++;
          continue;
        }
      }

      // Daily cap safety net — max MAX_LONGFORM_PER_DAY long-form uploads per local calendar day.
      // Uses effectiveScheduledAt (the possibly-rescheduled future slot) so the cap
      // check always targets the correct upcoming date, not a stale past date.
      const lfAlreadyDone = await countUploadedLongFormForDate(
        item.userId,
        effectiveScheduledAt,
      );
      if (lfAlreadyDone >= MAX_LONGFORM_PER_DAY) {
        logger.info(`[YouTubeSchedule] Long-form daily cap (${MAX_LONGFORM_PER_DAY}/day) reached for scheduled date — deferring item ${item.id}`);
        skipped++;
        continue;
      }

      // Apply duration — prefer the learner's recommendation once enough data
      // exists; fall back to the random experiment picker otherwise.
      // If the queue item already carries an explicit experimentDurationMin (set
      // at queue time) that value is always honoured so retries stay consistent.
      let experimentDurationSec: number;
      if (itemMeta.experimentDurationMin && Number(itemMeta.experimentDurationMin) >= 8) {
        experimentDurationSec = Number(itemMeta.experimentDurationMin) * 60;
      } else {
        try {
          const { chooseBestLongFormDuration } = await import("./youtube-performance-learner");
          const gameName = (itemMeta.gameName as string) || "Gaming";
          experimentDurationSec = await chooseBestLongFormDuration(
            item.userId,
            gameName,
            rawDurationSec,
          );
        } catch {
          experimentDurationSec = pickExperimentDurationSec(rawDurationSec, undefined);
        }
      }
      const experimentDurationMin = Math.round(experimentDurationSec / 60);
      // Actual cut uses the experiment duration, not the full raw segment
      const durationSec = Math.min(rawDurationSec, experimentDurationSec);
      const targetMin = experimentDurationMin;
      const sourceYoutubeId = typeof itemMeta.sourceYoutubeId === "string" ? itemMeta.sourceYoutubeId : undefined;

      // Mark as processing immediately to prevent double pick-up
      await db.update(autopilotQueue)
        .set({ status: "processing" })
        .where(eq(autopilotQueue.id, item.id));

      // Get source video for metadata
      const [srcVideo] = item.sourceVideoId != null
        ? await db.select().from(videos).where(eq(videos.id, item.sourceVideoId)).limit(1)
        : [];
      const srcMeta = (srcVideo?.metadata ?? {}) as Record<string, unknown>;
      const gameName = (itemMeta.gameName as string) || (srcMeta.gameName as string) || "PS5 Gameplay";
      const tags = Array.isArray(itemMeta.tags) ? (itemMeta.tags as string[]) : [];
      const resolvedYoutubeId = sourceYoutubeId
        || (srcMeta.youtubeId as string | undefined)
        || (srcMeta.youtubeVideoId as string | undefined);

      // Find YouTube channel with a connected token
      const ytChannels = await db.select().from(channels)
        .where(and(eq(channels.userId, item.userId), eq(channels.platform, "youtube")));
      const ytChannel = ytChannels.find((c: any) => c.accessToken) || ytChannels[0];

      if (!ytChannel) {
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "No YouTube channel connected" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

      const runId = `lf_${item.id}_${Date.now()}`;
      const tmpRaw = path.join(LONG_FORM_TEMP_DIR, `raw_${runId}.mp4`);
      const tmpEncoded = path.join(LONG_FORM_TEMP_DIR, `enc_${runId}.mp4`);

      let encodedPath: string | null = null;

      try {
        // Fast path: pre-encoder already built this file ahead of time.
        // Skip download + encode entirely — just use the ready file.
        const preBuiltPath = typeof itemMeta.preEncodedPath === "string"
          ? (itemMeta.preEncodedPath as string) : null;
        if (preBuiltPath && fs.existsSync(preBuiltPath)) {
          encodedPath = preBuiltPath;
          logger.info(`[LongFormPublisher] Pre-encoded file ready for item ${item.id} — skipping download+encode`);
        } else {
          // Prefer local vault file, fall back to yt-dlp
          if (resolvedYoutubeId) {
            const [vaultEntry] = await db.select()
              .from(contentVaultBackups)
              .where(and(
                eq(contentVaultBackups.userId, item.userId),
                eq(contentVaultBackups.youtubeId, resolvedYoutubeId),
                eq(contentVaultBackups.status, "downloaded"),
              ))
              .limit(1);

            if (vaultEntry?.filePath && fs.existsSync(vaultEntry.filePath)) {
              await extractSegment(vaultEntry.filePath, startSec, durationSec, tmpEncoded);
            } else {
              // Cap the download end to startSec + experimentDurationSec so yt-dlp
              // doesn't fetch footage beyond the bucket we're testing.
              const downloadEndSec = startSec + durationSec;
              await downloadSegmentFromYouTube(resolvedYoutubeId, startSec, downloadEndSec, tmpRaw);
              if (!fs.existsSync(tmpRaw)) throw new Error("yt-dlp produced no output");
              await extractSegment(tmpRaw, 0, durationSec, tmpEncoded);
            }
          } else {
            throw new Error("No YouTube ID to download segment from");
          }

          if (!fs.existsSync(tmpEncoded)) throw new Error("FFmpeg produced no output");
          encodedPath = tmpEncoded;
        }

        // Use pre-generated SEO from pre-seo service (runs at 8 PM Pacific)
        // Fall back to inline templates if not yet available
        const title = String(
          (typeof itemMeta.seoTitle === "string" && itemMeta.seoTitle.length > 5
            ? itemMeta.seoTitle
            : null)
          ?? item.caption
          ?? `${gameName} Gameplay — ${targetMin} Minutes`,
        ).substring(0, 100);

        const fullVideoUrl = resolvedYoutubeId ? `\n\nFull recording → https://youtu.be/${resolvedYoutubeId}` : "";
        const description = (
          typeof itemMeta.seoDescription === "string" && itemMeta.seoDescription.length > 5
            ? itemMeta.seoDescription
            : `${item.content || ""}\n\nPS5 no-commentary gameplay.${fullVideoUrl}\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`
        ).substring(0, 5000);

        const preBuiltTagsLF = Array.isArray(itemMeta.seoTags) ? itemMeta.seoTags as string[] : null;

        const lfScheduledAt  = effectiveScheduledAt;
        const lfIsScheduled  = lfScheduledAt && lfScheduledAt.getTime() > Date.now() + 60_000;

        if (lfScheduledAt) {
          logger.info(`[YouTubeSchedule] Long-form scheduled for ${lfScheduledAt.toISOString()}`, { itemId: item.id });
        }

        const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
          title,
          description,
          tags: preBuiltTagsLF ?? [...tags.slice(0, 12), "Gaming", "PS5", "NoCommentary", gameName],
          categoryId: "20",
          // YouTube requires privacyStatus=private for scheduled future uploads.
          // If scheduledAt is past/now, upload immediately as public.
          privacyStatus: lfIsScheduled ? "private" : "public",
          scheduledStartTime: lfScheduledAt ? lfScheduledAt.toISOString() : undefined,
          videoFilePath: encodedPath,
          enableMonetization: true,
        });

        if (lfIsScheduled) {
          logger.info(`[YouTubeSchedule] Long-form uploaded as private scheduled publish — publishAt ${lfScheduledAt!.toISOString()}`);
        } else {
          logger.info("[YouTubeSchedule] Long-form published immediately as public");
        }

        if (!uploadResult?.youtubeId) throw new Error("Upload returned no YouTube ID");

        // Add to game-specific long-form playlist immediately after upload.
        // Non-fatal — playlist failure never blocks the status update.
        {
          const lfYtIdForPlaylist = uploadResult.youtubeId;
          import("../../playlist-manager")
            .then(({ addUploadToPlaylist }) =>
              addUploadToPlaylist(item.userId, ytChannel.id, lfYtIdForPlaylist, gameName, "longform")
            )
            .catch(e => logger.warn(`[LongFormPublisher] Playlist assignment failed for ${lfYtIdForPlaylist}: ${e?.message}`));
        }

        // Upload pre-generated thumbnail immediately after video upload — fire and forget
        {
          const lfYtId = uploadResult.youtubeId;
          const thumbPath = typeof itemMeta.thumbnailPath === "string" ? itemMeta.thumbnailPath : undefined;
          if (thumbPath && fs.existsSync(thumbPath)) {
            fs.promises.readFile(thumbPath).then(buf => {
              if (buf.length < 1000) return;
              return import("../youtube").then(({ setYouTubeThumbnail }) =>
                setYouTubeThumbnail(ytChannel.id, lfYtId, buf, "image/jpeg"),
              );
            }).catch(tErr =>
              logger.warn(`[LongFormPublisher] Thumbnail upload failed for ${lfYtId}: ${String(tErr).slice(0, 100)}`),
            );
          }
        }

        await db.update(autopilotQueue)
          .set({
            status: "published",
            publishedAt: new Date(),
            metadata: {
              ...itemMeta,
              youtubeVideoId: uploadResult.youtubeId,
              publishedAt: new Date().toISOString(),
              // Experiment tracking — use these fields to correlate video
              // length with watch-time / retention in YouTube Analytics.
              experimentDurationMin,
              experimentDurationSec,
              experimentRawAvailableMin: Math.round(rawDurationSec / 60),
            } as any,
          })
          .where(eq(autopilotQueue.id, item.id));

        logger.info("Long-form clip published", {
          queueId: item.id,
          youtubeId: uploadResult.youtubeId,
          experimentDurationMin,
          rawAvailableMin: Math.round(rawDurationSec / 60),
          gameName: gameName.substring(0, 50),
          userId: item.userId.substring(0, 8),
        });
        published++;

        // Seed the metrics row immediately so the learning model has a record
        // even before YouTube processes analytics (which takes 24-48 h).
        // Analytics numbers are refreshed automatically by refreshStaleVideoMetrics.
        {
          const lfYtId = uploadResult.youtubeId;
          const h = (lfScheduledAt ?? new Date()).getUTCHours();
          const postWin = h >= 6 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "late_night";
          Promise.all([
            import("./youtube-performance-learner").then(({ recordVideoPerformance }) =>
              recordVideoPerformance(item.userId, lfYtId, {
                contentType: "long_form",
                durationSec: experimentDurationSec,
                gameName: gameName.substring(0, 100),
                postingWindow: postWin,
                sourceVideoId: item.sourceVideoId ?? undefined,
                publishedAt: lfScheduledAt ?? new Date(),
              })
            ),
            import("./youtube-learning-brain").then(({ recordLearningEvent }) =>
              recordLearningEvent(item.userId, "long_form_published", {
                sourceAgent: "long-form-publisher",
                youtubeVideoId: lfYtId,
                gameName: gameName.substring(0, 100),
                experimentDurationMin,
                queueId: item.id,
              })
            ),
          ]).catch(() => {});
        }
      } catch (err: any) {
        const errMsg = err?.message?.slice(0, 500) ?? "unknown error";
        logger.warn("Long-form clip publish failed", { queueId: item.id, error: errMsg });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: errMsg })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
      } finally {
        if (fs.existsSync(tmpRaw)) fs.unlinkSync(tmpRaw);
        if (encodedPath && fs.existsSync(encodedPath)) fs.unlinkSync(encodedPath);
      }
    }
  } finally {
    isRunning = false;
  }

  if (published > 0) {
    await recordHeartbeat("longFormClipPublisher", "completed").catch(() => {});
  }

  logger.info("Long-form clip publisher cycle complete", { published, failed, skipped });
  return { published, failed, skipped };
}

// ---------------------------------------------------------------------------
// Initialiser — wired into server startup
// ---------------------------------------------------------------------------

export function initLongFormClipPublisher(): void {
  // Run at minute 45 of every even hour (offset from Shorts publisher at :05 / :35)
  cron.schedule("45 */2 * * *", async () => {
    try {
      await runLongFormClipPublisher();
    } catch (err: any) {
      logger.error("Long-form publisher cron error", { error: err?.message?.slice(0, 200) });
    }
  });

  // Warm-up after 20 minutes so other services settle first
  setTimeout(() => {
    runLongFormClipPublisher().catch((err: unknown) =>
      logger.warn("Long-form publisher warm-up error", { error: (err as Error)?.message })
    );
  }, 20 * 60_000);

  logger.info("Long-Form Clip Publisher initialised — runs every 2 h, max 1 upload per run");
}
