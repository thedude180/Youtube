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
import cron from "node-cron";
import { db } from "../db";
import { recordPublishOutcome } from "../lib/outcome-recorder";
import { autopilotQueue, videos, channels } from "@shared/schema";
import { eq, and, lte, sql, or, asc, gt, inArray } from "drizzle-orm";
import { getFocusGame } from "../lib/game-focus";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube, verifyUploadedToYouTube } from "../youtube";
import { recordHeartbeat } from "./engine-heartbeat";
import { MAX_LONGFORM_PER_DAY, countUploadedLongFormForDate, getNextLongFormPublishTime, isLongFormScheduleSaturated, clearLongFormScheduleSaturation } from "./youtube-output-schedule";

const logger = createLogger("long-form-publisher");

const MAX_PER_RUN = 50; // quota is the real gate; 50 works through a deep queue efficiently
const BATCH_WINDOW_DAYS = 365; // 365-day window — shadow schedule is unlimited; quota + MAX_PER_RUN cap actual uploads per night
const MAX_SEGMENT_SEC = 3600; // 60 min hard ceiling
const MIN_LONG_FORM_SEC = 480; // 8 min — YouTube mid-roll monetization threshold
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

let isRunning = false;

// ---------------------------------------------------------------------------
// Main publish function
// ---------------------------------------------------------------------------

export async function runLongFormClipPublisher(opts?: { bypassBreakerCheck?: boolean }): Promise<{ published: number; failed: number; skipped: number; quotaExhausted: boolean }> {
  if (isRunning) {
    logger.debug("Long-form publisher already running — skipping");
    return { published: 0, failed: 0, skipped: 1, quotaExhausted: false };
  }
  isRunning = true;

  let published = 0;
  let failed = 0;
  let skipped = 0;
  let quotaExhausted = false;
  let cycleUserId = ""; // captured from dueItems for outcome recording outside try block

  try {
    const now = new Date();
    // Batch window: pick up all long-form clips scheduled in the next 14 days.
    // Upload them all now with publishAt set so YouTube spaces their release.
    const batchWindow = new Date(now.getTime() + BATCH_WINDOW_DAYS * 86400_000);

    // Dynamic focus-game priority — updates automatically when setFocusGame() fires
    const focusGame    = await getFocusGame().catch(() => "Battlefield 6");
    const focusPattern = `%${focusGame.toLowerCase()}%`;

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
        sql`COALESCE(${autopilotQueue.metadata}->>'contentType','long-form-clip') IN ('long-form-clip','long-form','vod_long_form','long-form-compilation')`,
      ))
      // Priority order:
      //   0 — recent live-stream VOD uploads (vod-long-form) — new content first
      //   1 — back-catalog segmented clips (auto-clip long-form) — after new content
      // Within each content-type tier, current focus game items come before all other games.
      // Within the same game+tier, earliest scheduled_at wins.
      .orderBy(
        sql`CASE
          WHEN ${autopilotQueue.type} = 'vod-long-form' THEN 0
          ELSE 1
        END`,
        sql`CASE WHEN LOWER(COALESCE(${autopilotQueue.metadata}->>'gameName','')) LIKE ${focusPattern} THEN 0 ELSE 1 END`,
        autopilotQueue.scheduledAt,
      )
      .limit(1); // One upload per cycle — the perpetual loop calls us again immediately for the next
    cycleUserId = dueItems[0]?.userId ?? "";

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

    // Check YouTube API quota once — stop the whole batch if tripped.
    // bypassBreakerCheck=true is only passed by the midnight quota-reset cron, which
    // has already cleared the breaker.  We skip this gate because a concurrent service
    // (e.g. quota-reset-audit) can re-trip the breaker in the same clock-second as the
    // reset, causing the midnight publish window to be silently skipped every night.
    const { isQuotaBreakerTripped, canAffordOperation } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped() && !opts?.bypassBreakerCheck) {
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
      let rawDurationSec = Math.min(endSec - startSec, MAX_SEGMENT_SEC);

      // For vod-long-form items created by the VOD-engine with sourceVideoId but no
      // explicit segment bounds, rawDurationSec will be 0.  Read the actual duration
      // from the videos table so the item proceeds to the pre-encoder wait path
      // instead of being immediately failed as "Segment too short".
      if (rawDurationSec === 0 && item.type === "vod-long-form" && item.sourceVideoId) {
        try {
          const [srcVid] = await db
            .select({ durationSec: sql<number | null>`(${videos.metadata}->>'durationSec')::int` })
            .from(videos)
            .where(eq(videos.id, item.sourceVideoId))
            .limit(1);
          if (srcVid?.durationSec && srcVid.durationSec > 0) {
            rawDurationSec = Math.min(srcVid.durationSec, MAX_SEGMENT_SEC);
          }
        } catch { /* non-fatal — fall through to guard below */ }
      }

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

      let encodedPath: string | null = null;

      try {
        // Pre-encoder has already built this file — just upload it.
        // Publishers NEVER download or encode inline: all that heavy work is
        // done by the pre-encoder running in the background so that restarts
        // are upload-only with zero wait time.
        const preBuiltPath = typeof itemMeta.preEncodedPath === "string"
          ? (itemMeta.preEncodedPath as string) : null;
        if (preBuiltPath && fs.existsSync(preBuiltPath)) {
          encodedPath = preBuiltPath;
          logger.info(`[LongFormPublisher] Pre-encoded file ready for item ${item.id} — uploading`);
        }

        if (!encodedPath) {
          // File not ready yet — skip and let the pre-encoder build it.
          // If the path was set but the file is gone (purged after 7 days),
          // clear the metadata so the pre-encoder will re-encode on its next cycle.
          if (preBuiltPath) {
            await db.update(autopilotQueue)
              .set({ metadata: { ...itemMeta, preEncodedPath: null, preEncodedAt: null } as any })
              .where(eq(autopilotQueue.id, item.id));
            logger.info(`[LongFormPublisher] Pre-encoded file was purged for item ${item.id} — cleared, pre-encoder will rebuild`);
          } else {
            logger.info(`[LongFormPublisher] Item ${item.id} not yet pre-encoded — skipping until pre-encoder processes it`);
          }
          // Reset to scheduled so the next publisher cycle picks it up once pre-encoded
          await db.update(autopilotQueue)
            .set({ status: "scheduled", errorMessage: null })
            .where(eq(autopilotQueue.id, item.id));
          skipped++;
          continue;
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
        const baseDescription = stripShortsTag((
          typeof itemMeta.seoDescription === "string" && itemMeta.seoDescription.length > 5
            ? itemMeta.seoDescription
            : `${item.content || ""}\n\nPS5 no-commentary gameplay.${fullVideoUrl}\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`
        ));
        // Append chapter markers built by the pre-encoder (Tier 3 intelligence).
        // These are YouTube-format timestamps derived from scene-change detection
        // on the actual encoded clip, so they are accurate to the uploaded video.
        const preEncoderChapters = typeof itemMeta.chapterDescription === "string" && itemMeta.chapterDescription.length > 5
          ? itemMeta.chapterDescription
          : null;
        const description = (preEncoderChapters
          ? `${baseDescription}\n\n${preEncoderChapters}`
          : baseDescription
        ).substring(0, 5000);

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
          // Set true when the pre-encoder mixed AI-generated music from the creative library.
          selfDeclaredMadeWithAI: !!(itemMeta?.hasAiMusic),
        });

        if (lfIsScheduled) {
          logger.info(`[YouTubeSchedule] Long-form uploaded as private scheduled publish — publishAt ${lfScheduledAt!.toISOString()}`);
        } else {
          logger.info("[YouTubeSchedule] Long-form published immediately as public");
        }

        if (!uploadResult?.youtubeId) throw new Error("Upload returned no YouTube ID");

        // ── Verify the video is actually present on YouTube ───────────────────
        // Polls videos.list up to 3× (6-second gaps) to confirm YouTube indexed
        // the upload.  A "processing" uploadStatus is fine — video was accepted.
        // Non-blocking: if YouTube doesn't respond in time we log a warning but
        // still mark the item published (the insert API already confirmed it).
        {
          const verifyYtId = uploadResult.youtubeId;
          try {
            const verifyResult = await verifyUploadedToYouTube(ytChannel.id, verifyYtId);
            if (verifyResult.verified) {
              logger.info(
                `[LongFormPublisher] ✓ Verified on YouTube — videoId=${verifyYtId}` +
                ` uploadStatus=${verifyResult.uploadStatus ?? "unknown"}` +
                ` privacy=${verifyResult.privacyStatus ?? "unknown"}`,
              );
            } else {
              logger.warn(
                `[LongFormPublisher] ⚠ Upload accepted by API but video not yet visible via videos.list — ` +
                `videoId=${verifyYtId} (YouTube may still be processing — check Studio)`,
              );
            }
          } catch (vErr: any) {
            logger.warn(`[LongFormPublisher] verifyUploadedToYouTube threw: ${vErr?.message?.slice(0, 120)}`);
          }
        }

        // Add to game-specific long-form playlist immediately after upload.
        // Non-fatal — playlist failure never blocks the status update.
        {
          const lfYtIdForPlaylist = uploadResult.youtubeId;
          import("../playlist-manager")
            .then(({ addUploadToPlaylist }) =>
              addUploadToPlaylist(item.userId, ytChannel.id, lfYtIdForPlaylist, gameName, "longform")
            )
            .catch(e => logger.warn(`[LongFormPublisher] Playlist assignment failed for ${lfYtIdForPlaylist}: ${e?.message}`));
          // Also add to the mixed funnel playlist immediately (Shorts → Long-form watch path)
          if (gameName) {
            import("./youtube-playlist-funnel")
              .then(({ addToFunnelPlaylistImmediate }) =>
                addToFunnelPlaylistImmediate(item.userId, ytChannel.id, lfYtIdForPlaylist, gameName, false)
              )
              .catch(e => logger.warn(`[LongFormPublisher] Funnel add failed (non-fatal) for ${lfYtIdForPlaylist}: ${e?.message}`));
          }
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
            import("../lib/event-log").then(({ logEvent }) =>
              logEvent({
                eventType: "publish",
                service:   "long-form-publisher",
                title:     `Long-form published: ${((item.metadata as any)?.title ?? item.content ?? "untitled").slice(0, 120)}`,
                detail: {
                  youtubeVideoId:      lfYtId,
                  queueId:             item.id,
                  gameName:            gameName.substring(0, 100),
                  experimentDurationMin,
                  durationSec:         experimentDurationSec,
                  postingWindow:       postWin,
                  scheduledAt:         lfScheduledAt?.toISOString(),
                  contentType:         item.type ?? "long-form-clip",
                },
                userId:   item.userId,
                severity: "info",
              })
            ),
          ]).catch(() => {});
          // Fire-and-forget audience soul model calibration — records a pending
          // calibration signal that the brain's daily cycle will follow up on
          // after 48 h when YouTube analytics become available.
          import("./audience-intelligence-engine").then(({ calibrateAudienceSoulModel }) =>
            calibrateAudienceSoulModel(item.userId, lfYtId)
          ).catch(() => {});
        }
      } catch (err: any) {
        const errMsg = err?.message?.slice(0, 500) ?? "unknown error";
        logger.warn("Long-form clip publish failed", { queueId: item.id, error: errMsg });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: errMsg })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        import("../lib/event-log").then(({ logEvent }) =>
          logEvent({
            eventType: "error",
            service:   "longform-publisher",
            title:     `Long-form publish failed: ${errMsg.slice(0, 120)}`,
            detail:    { queueId: item.id, error: errMsg.slice(0, 300) },
            userId:    item.userId,
            severity:  "warn",
          })
        ).catch(() => {});
      } finally {
        // Clean up the pre-encoded file after upload (success or failure)
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

  // Feed publish outcomes back to the learning brain
  await recordPublishOutcome({
    engine:      "long-form-publisher",
    userId:      cycleUserId,
    published,
    failed,
    skipped,
    contentType: "long-form-clip",
    quotaExhausted,
  }).catch(() => {});

  import("../lib/event-log").then(({ logServiceCycle }) =>
    logServiceCycle("long-form-publisher", cycleUserId || null, {
      processed: published + failed + skipped,
      succeeded: published,
      failed,
      skipped,
      keyInsight: quotaExhausted ? "quota exhausted" : `published=${published}`,
    })
  ).catch(() => {});

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

// ─── Smart idle sleep ─────────────────────────────────────────────────────────
// Instead of a fixed 2-minute poll, calculate exactly when the next long-form
// item is due and sleep until 3 minutes before that time.  Eliminates hundreds
// of unnecessary DB queries per hour when the schedule is fully pre-staged.
async function msUntilNextScheduledLongForm(): Promise<number> {
  try {
    const now = new Date();
    const [next] = await db
      .select({ scheduledAt: autopilotQueue.scheduledAt })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.status, "scheduled"),
          gt(autopilotQueue.scheduledAt, now),
          inArray(autopilotQueue.type, ["vod-long-form", "long-form-clip", "youtube_long_form"]),
        ),
      )
      .orderBy(asc(autopilotQueue.scheduledAt))
      .limit(1);
    if (!next?.scheduledAt) return 10 * 60_000; // nothing scheduled → check in 10 min
    const msUntilDue = new Date(next.scheduledAt).getTime() - Date.now();
    // Wake up 3 min early; clamp between 2 min and 30 min
    const sleepMs = msUntilDue - 3 * 60_000;
    return Math.max(Math.min(sleepMs, 30 * 60_000), 2 * 60_000);
  } catch {
    return 10 * 60_000;
  }
}

let _perpetualRunning = false;

export function startPerpetualLongFormLoop(): void {
  if (_perpetualRunning) return;
  _perpetualRunning = true;

  // Record that the publisher actually started executing (not just scheduled)
  import("../lib/boot-registry").then(({ recordBootStart }) => recordBootStart("longform-publisher")).catch(() => {});

  const loop = async () => {
    while (_perpetualRunning) {
      try {
        // Memory gate: long-form videos are large files (often >1 GB).
        // If the container is under pressure, pause before attempting the upload
        // rather than OOM-crashing mid-transfer and leaving the item stuck.
        const { getContainerMemory } = await import("../lib/container-memory");
        const { freeBytes } = getContainerMemory();
        if (freeBytes < 150 * 1024 * 1024) {
          logger.warn(
            `[LongFormPublisher] Low memory (${Math.round(freeBytes / 1024 / 1024)}MB free) — ` +
            `pausing 5 min before next upload attempt`,
          );
          await new Promise(r => setTimeout(r, 5 * 60_000));
          continue;
        }

        // IO gate — only one upload or download at a time across the whole system.
        // Waits for any active vault download or shorts upload to finish first.
        const { acquireIOSlot, releaseIOSlot } = await import("../lib/io-gate");
        await acquireIOSlot("longform-publisher");
        const result = await runLongFormClipPublisher().finally(() => releaseIOSlot("longform-publisher"));

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
            // Smart sleep: wake up exactly when the next long-form item is due (−3 min).
            // Falls back to 10 min live / 10 min idle when nothing is scheduled.
            const { isLiveActive } = await import("../lib/live-gate");
            const idleWaitMs = isLiveActive() ? 10 * 60_000 : await msUntilNextScheduledLongForm();
            logger.info(`[LongFormPublisher] Queue idle — smart sleep ${(idleWaitMs / 60_000).toFixed(1)}m until next item`);
            await new Promise(r => setTimeout(r, idleWaitMs));
          }
        } else if (result.published === 0 && result.failed === 0) {
          // All pending items were skipped (no OAuth token / already-running guard).
          // CRITICAL: do NOT treat this as "work done" — that creates a 5-second
          // hot-spin loop hammering the DB until the channel reconnects.
          // Back off the same as an idle queue and wait for the token to return.
          logger.info(
            `[LongFormPublisher] ${result.skipped} item(s) skipped (no OAuth token or already running) — ` +
            `backing off to wait for channel reconnect`,
          );
          const { isLiveActive } = await import("../lib/live-gate");
          const idleWaitMs = isLiveActive() ? 10 * 60_000 : await msUntilNextScheduledLongForm();
          await new Promise(r => setTimeout(r, idleWaitMs));
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
