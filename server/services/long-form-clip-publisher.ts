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
import { eq, and, lte, sql, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube } from "../youtube";
import { downloadYouTubeSection } from "../lib/yt-dlp-section-download";
import { recordHeartbeat } from "./engine-heartbeat";
import { MAX_LONGFORM_PER_DAY, countUploadedLongFormForDate, getNextLongFormPublishTime, isLongFormScheduleSaturated, clearLongFormScheduleSaturation } from "./youtube-output-schedule";

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

function runCmd(bin: string, args: string[], timeoutMs = 5_400_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    // Kill the process after timeoutMs (default 90 min) to prevent stuck encodes
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Process timed out after ${Math.round(timeoutMs / 60_000)}m`));
    }, timeoutMs);
    proc.stderr.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(errBufs).toString("utf8").slice(-600)));
    });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
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
  await downloadYouTubeSection({ youtubeId, startSec, endSec, outputPath });
}

// ---------------------------------------------------------------------------
// Main publish function
// ---------------------------------------------------------------------------

export async function runLongFormClipPublisher(): Promise<{ published: number; failed: number; skipped: number; quotaExhausted: boolean }> {
  if (isRunning) {
    logger.debug("Long-form publisher already running — skipping");
    return { published: 0, failed: 0, skipped: 1, quotaExhausted: false };
  }
  isRunning = true;

  let published = 0;
  let failed = 0;
  let skipped = 0;
  let quotaExhausted = false;

  try {
    const now = new Date();
    // Batch window: pick up all long-form clips scheduled in the next 14 days.
    // Upload them all now with publishAt set so YouTube spaces their release.
    const batchWindow = new Date(now.getTime() + BATCH_WINDOW_DAYS * 86400_000);

    const dueItems = await db.select().from(autopilotQueue)
      .where(and(
        // auto-clip = grinder/segmenter long-form; vod-long-form = full-VOD upload path
        sql`${autopilotQueue.type} IN ('auto-clip','vod-long-form')`,
        // Accept 'scheduled' for all types.
        // Also accept 'pending' for auto-clip items that have a sourceYoutubeId —
        // these were created without 'scheduled' status due to a distributor sequencing
        // issue or an older production binary that used 'pending' as the default.
        or(
          eq(autopilotQueue.status, "scheduled"),
          and(
            eq(autopilotQueue.type, "auto-clip"),
            eq(autopilotQueue.status, "pending"),
            sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NOT NULL`,
          ),
        ),
        lte(autopilotQueue.scheduledAt, batchWindow),
        sql`COALESCE(${autopilotQueue.metadata}->>'contentType','long-form-clip') IN ('long-form-clip','vod_long_form')`,
      ))
      // Priority order:
      //   0 — recent live-stream VOD uploads (vod-long-form) — new content first
      //   1 — back-catalog segmented clips (auto-clip long-form) — after new content
      // Within each content-type tier, BF6 items come before all other games.
      // Within the same game+tier, earliest scheduled_at wins.
      .orderBy(
        sql`CASE
          WHEN ${autopilotQueue.type} = 'vod-long-form' THEN 0
          ELSE 1
        END`,
        sql`CASE
          WHEN LOWER(COALESCE(${autopilotQueue.metadata}->>'gameName','')) LIKE '%battlefield 6%'
            OR LOWER(COALESCE(${autopilotQueue.metadata}->>'gameName','')) LIKE '%bf6%'
          THEN 0
          ELSE 1
        END`,
        autopilotQueue.scheduledAt,
      )
      .limit(MAX_PER_RUN * 4);

    if (dueItems.length === 0) return { published: 0, failed: 0, skipped: 0, quotaExhausted: false };

    // ── Live stream gate ──────────────────────────────────────────────────────
    // When a live stream is active, pause all long-form publishing entirely.
    // Long-form uploads are heavy (quota + bandwidth) — during a live stream
    // all resources stay focused on the stream.  Resumes automatically after.
    const { isLiveActive: _isLiveNow } = await import("../lib/live-gate");
    if (_isLiveNow()) {
      logger.info("[LongFormPublisher] Live stream active — long-form publishing paused until stream ends");
      return { published: 0, failed: 0, skipped: dueItems.length, quotaExhausted: false };
    }

    // Check YouTube API quota once — stop the whole batch if tripped
    const { isQuotaBreakerTripped, canAffordOperation } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn("YouTube quota breaker active — skipping long-form batch");
      return { published: 0, failed: 0, skipped: dueItems.length, quotaExhausted: true };
    }

    for (const item of dueItems) {
      if (published >= MAX_PER_RUN) break;

      // Per-upload budget check — stops the batch when remaining quota can no
      // longer cover another upload (1,600 units + 200 safety buffer).
      // .catch(() => true) — quota-tracker DB errors are non-fatal; default to "can afford"
      if (!await canAffordOperation(item.userId, "upload").catch(() => true)) {
        logger.info(`[LongFormPublisher] Upload budget at ceiling — stopping batch (${published} uploaded this run)`);
        quotaExhausted = true;
        break;
      }

      const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
      const startSec = Number(itemMeta.segmentStartSec ?? 0);
      const endSec = Number(itemMeta.segmentEndSec ?? 0);
      const rawDurationSec = Math.min(endSec - startSec, MAX_SEGMENT_SEC);

      // ── Guard: reject anything that is actually a Short being passed as long-form ──
      // 1. No #shorts tag anywhere in pre-built SEO fields — Shorts content
      //    must never appear as a long-form upload.
      const metaShortsFields = [
        String(itemMeta.seoTitle ?? ""),
        String(itemMeta.seoDescription ?? ""),
        String(item.caption ?? ""),
        String(itemMeta.caption ?? ""),
        ...(Array.isArray(itemMeta.seoTags) ? (itemMeta.seoTags as string[]) : []),
        ...(Array.isArray(itemMeta.tags)    ? (itemMeta.tags    as string[]) : []),
      ].join(" ");
      if (/#shorts/i.test(metaShortsFields)) {
        logger.warn(`[LongFormPublisher] Item ${item.id} contains #shorts in metadata — skipping (Shorts must not be promoted as long-form)`);
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "Long-form guard: #shorts found in metadata — item is a Short, not a long-form video" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }
      // 2. Reject style='short-clip' items that somehow reached this publisher.
      if (itemMeta.style === "short-clip" || itemMeta.contentType === "youtube-short") {
        logger.warn(`[LongFormPublisher] Item ${item.id} is flagged as a Short (style/contentType) — skipping`);
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "Long-form guard: item is flagged as a Short (style=short-clip or contentType=youtube-short)" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }
      // 3. Source video must be long enough to be a genuine stream segment (≥30 min).
      //    Back-catalog items carry sourceTotalDurationSec in metadata so we can
      //    check this even when sourceVideoId is null.
      const sourceTotalSec = Number(itemMeta.sourceTotalDurationSec ?? itemMeta.totalDurationSec ?? 0);
      const MIN_SOURCE_SEC = 30 * 60; // 30 minutes — live-stream minimum
      if (sourceTotalSec > 0 && sourceTotalSec < MIN_SOURCE_SEC) {
        logger.warn(`[LongFormPublisher] Item ${item.id} source is only ${Math.round(sourceTotalSec / 60)}m — likely a short clip, not a live stream. Skipping.`);
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: `Long-form guard: source video is only ${Math.round(sourceTotalSec / 60)} min — live-stream segments must be from recordings ≥30 min` })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

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
          const newSlot = isLongFormScheduleSaturated(item.userId)
            ? new Date(Date.now() + 24 * 3_600_000)
            : await getNextLongFormPublishTime(item.userId);
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
              // Source video not in vault — queue a full download in the background
              // (same as downloading the whole video to your hard drive first, then
              // cutting clips locally).  Reset this item to scheduled so the next
              // publisher cycle can use the local file via the vault fast-path above.
              const { queueVaultDownloadForSource } = await import("./video-vault");
              const queueResult = await queueVaultDownloadForSource(resolvedYoutubeId, item.userId);
              logger.info(`[LongFormPublisher] Full-video download ${queueResult} for ${resolvedYoutubeId} — item will retry on next cycle`);
              throw new Error(`__vault_download_pending__: ${resolvedYoutubeId} (${queueResult})`);
            }
          } else {
            throw new Error("No YouTube ID to download segment from");
          }

          if (!fs.existsSync(tmpEncoded)) throw new Error("FFmpeg produced no output");
          encodedPath = tmpEncoded;
        }

        // Use pre-generated SEO from pre-seo service (runs at 8 PM Pacific)
        // Fall back to inline templates if not yet available
        // Strip any #shorts tag that may appear in AI-generated fields — long-form
        // videos must NEVER carry the #Shorts tag or YouTube will classify them as Shorts.
        const stripShortsTag = (s: string) => s.replace(/#shorts\b/gi, "").replace(/\s{2,}/g, " ").trim();

        const title = stripShortsTag(String(
          (typeof itemMeta.seoTitle === "string" && itemMeta.seoTitle.length > 5
            ? itemMeta.seoTitle
            : null)
          ?? item.caption
          ?? `${gameName} Gameplay — ${targetMin} Minutes`,
        ).substring(0, 100));

        const fullVideoUrl = resolvedYoutubeId ? `\n\nFull recording → https://youtu.be/${resolvedYoutubeId}` : "";
        const description = stripShortsTag((
          typeof itemMeta.seoDescription === "string" && itemMeta.seoDescription.length > 5
            ? itemMeta.seoDescription
            : `${item.content || ""}\n\nPS5 no-commentary gameplay.${fullVideoUrl}\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`
        ).substring(0, 5000));

        const rawTagsLF = Array.isArray(itemMeta.seoTags) ? itemMeta.seoTags as string[] : null;
        // Strip "shorts" from any tag — long-form must not have it anywhere
        const preBuiltTagsLF = rawTagsLF
          ? rawTagsLF.filter((t: string) => !/^#?shorts$/i.test(t.trim()))
          : null;

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
          // Sets the YouTube Studio "Game" field so this video appears on the
          // game's YouTube page and benefits from game-specific discovery.
          gameTitle: gameName,
          // AI content disclosure per YouTube policy 2025:
          // Long-form content is real gameplay footage — not AI-generated video or audio.
          // AI was used only for titles/descriptions/segment selection (metadata, not content).
          selfDeclaredMadeWithAI: false,
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
          import("../playlist-manager")
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
        // Clear the long-form saturation cache — a slot just opened up.
        clearLongFormScheduleSaturation(item.userId);

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

        // Full-video download was queued — reset to scheduled so the next
        // publisher cycle retries once the video is downloaded to disk.
        if (errMsg.includes("__vault_download_pending__")) {
          await db.update(autopilotQueue)
            .set({ status: "scheduled", errorMessage: null })
            .where(eq(autopilotQueue.id, item.id));
          skipped++;
        } else {
          logger.warn("Long-form clip publish failed", { queueId: item.id, error: errMsg });
          await db.update(autopilotQueue)
            .set({ status: "failed", errorMessage: errMsg })
            .where(eq(autopilotQueue.id, item.id));
          failed++;
        }
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

  logger.info("Long-form clip publisher cycle complete", { published, failed, skipped, quotaExhausted });
  return { published, failed, skipped, quotaExhausted };
}

// ---------------------------------------------------------------------------
// Initialiser — wired into server startup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Perpetual loop — runs continuously, restarting immediately after each batch.
// Long-form encodes are expensive (up to 60 min of source footage) so the
// idle wait is longer than Shorts to avoid CPU/disk pressure while encoding.
// The daily-cap and quota gate inside runLongFormClipPublisher() are the
// real throttle; the loop itself drives work as fast as those gates allow.
// ---------------------------------------------------------------------------

let _perpetualRunning = false;

export function startPerpetualLongFormLoop(): void {
  if (_perpetualRunning) return;
  _perpetualRunning = true;

  const loop = async () => {
    while (_perpetualRunning) {
      try {
        const result = await runLongFormClipPublisher();

        if (result.quotaExhausted) {
          // YouTube daily quota is spent — sleep until midnight Pacific reset
          const { getNextResetTime } = await import("./youtube-quota-tracker");
          const msUntilReset = Math.max(getNextResetTime().getTime() - Date.now(), 60_000);
          const hUntil = (msUntilReset / 3_600_000).toFixed(1);
          logger.info(`[LongFormPublisher] Quota exhausted — sleeping ${hUntil}h until midnight Pacific reset`);
          await new Promise(r => setTimeout(r, msUntilReset));
        } else if (result.published === 0 && result.failed === 0 && result.skipped === 0) {
          // Queue is genuinely empty — try to resume or recycle before waiting.
          // RESUME: mines any newly indexed/unmined videos (e.g. fresh live-stream VOD).
          // RECYCLE: vault fully exhausted → resets mined flags → re-queues everything
          //          so the channel keeps publishing in a never-ending loop.
          const { runPerpetualRecycler } = await import("./youtube-perpetual-recycler");
          const recycleResult = await runPerpetualRecycler();
          if (recycleResult.triggered) {
            logger.info(
              recycleResult.fullRecycle
                ? "[LongFormPublisher] Full vault recycle complete — all videos re-queued for next cycle"
                : "[LongFormPublisher] Resumed mining — back-catalog engine triggered for remaining videos",
            );
            // Give the engine 60 s to populate the queue before checking again
            await new Promise(r => setTimeout(r, 60_000));
          } else {
            // Uploads are priority-one when not live — retry in 2 min.
            // During a live stream back off to 10 min to save stream resources.
            const { isLiveActive } = await import("../lib/live-gate");
            const idleWaitMs = isLiveActive() ? 10 * 60_000 : 2 * 60_000;
            await new Promise(r => setTimeout(r, idleWaitMs));
          }
        } else {
          // Work was done — short pause then immediately check for more
          await new Promise(r => setTimeout(r, 5_000)); // 5 s breathing room
        }
      } catch (err: any) {
        logger.warn("Perpetual long-form loop error — restarting in 2 min", { error: err?.message?.slice(0, 200) });
        await new Promise(r => setTimeout(r, 2 * 60_000));
      }
    }
  };

  loop().catch(err => logger.error("Perpetual long-form loop crashed", { error: String(err) }));
  logger.info("[LongFormPublisher] Perpetual loop started — will restart immediately after each batch");
}

export function initLongFormClipPublisher(): void {
  // Cron kept as a safety net in case perpetual loop crashes
  cron.schedule("45 */2 * * *", async () => {
    if (_perpetualRunning) return; // perpetual loop already handles this
    try {
      await runLongFormClipPublisher();
    } catch (err: any) {
      logger.error("Long-form publisher cron error", { error: err?.message?.slice(0, 200) });
    }
  });

  // Start perpetual loop after 20-minute warm-up so other services settle first
  setTimeout(() => {
    startPerpetualLongFormLoop();
  }, 20 * 60_000);

  logger.info("Long-Form Clip Publisher initialised — perpetual mode: ON");
}
