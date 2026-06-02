/**
 * server/services/quota-aware-publisher.ts
 *
 * Quota-Aware YouTube Publisher
 *
 * This service makes ZERO AI calls. All metadata, SEO, and thumbnail concepts
 * are already in the DB (written by shorts-prep-pipeline and longform-prep-pipeline).
 * This service only reads 'ready_to_upload' rows and calls the YouTube API.
 *
 * YouTube Data API v3 daily quota: 10,000 units
 * Quota costs:
 *   videos.insert  = 1,600 units  (upload)
 *   thumbnails.set =    50 units  (custom thumbnail)
 *   Total per Short:    ~1,650 units
 *   Total per longform: ~1,650 units
 *
 * Daily capacity at 10,000 units:
 *   3 Shorts (4,950 units) + 1 longform (1,650 units) = 6,600 units ← safe
 *
 * Quota resets: midnight Pacific Time (07:00 UTC)
 * Schedule:
 *   Checks for ready items every 15 minutes
 *   Uploads begin at 07:05 UTC (5 min after reset, quota always fresh)
 *   Max 3 Shorts + 1 longform per day — enforced via DB counters
 */
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { storage } from "../storage";
import { uploadVideoToYouTube } from "../youtube";

const log = createLogger("quota-aware-publisher");

// ─── Quota config ─────────────────────────────────────────────────────────────
const QUOTA_RESET_HOUR_UTC = 7;
const QUOTA_RESET_BUFFER_MIN = 5;
const MAX_SHORTS_PER_DAY = 3;
const MAX_LONGFORM_PER_DAY = 1;
const QUOTA_COST_UPLOAD = 1600;
const QUOTA_COST_THUMBNAIL = 50;
const SAFE_QUOTA_LIMIT = 8000;

// ─── Quota window helpers ─────────────────────────────────────────────────────
function getQuotaWindowStart(): Date {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(QUOTA_RESET_HOUR_UTC, QUOTA_RESET_BUFFER_MIN, 0, 0);
  if (reset > now) {
    // Reset hasn't happened yet today — window started yesterday
    reset.setUTCDate(reset.getUTCDate() - 1);
  }
  return reset;
}

function isInPublishWindow(): boolean {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const minUTC = now.getUTCMinutes();
  const totalMin = hourUTC * 60 + minUTC;
  const resetMin = QUOTA_RESET_HOUR_UTC * 60 + QUOTA_RESET_BUFFER_MIN;
  return totalMin >= resetMin;
}

// ─── Publish functions ────────────────────────────────────────────────────────
async function publishReadyShort(
  payload: any,
  channelId: number,
  userId: string
): Promise<void> {
  log.info(`[QuotaPublisher] Uploading Short — clip ${payload.clipId}: "${payload.title}"`);

  const filePath = await storage.getClipFilePath(payload.clipId);

  const result = await uploadVideoToYouTube(channelId, {
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    categoryId: payload.categoryId,
    privacyStatus: "public",
    videoFilePath: filePath,
  });

  if (!result?.youtubeId) {
    throw new Error(`Upload returned no YouTube ID for clip ${payload.clipId}`);
  }

  log.info(`[QuotaPublisher] ✅ Short uploaded — YouTube ID: ${result.youtubeId}`);

  await storage.markShortsClipPublished(payload.clipId, {
    youtubeVideoId: result.youtubeId,
    publishedAt: new Date(),
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    thumbnailConcept: payload.thumbnailConcept,
  });
  await storage.incrementDailyPublishCount(userId, "short");
  log.info(`[QuotaPublisher] Clip ${payload.clipId} marked published`);
}

async function publishReadyLongform(
  payload: any,
  channelId: number,
  userId: string
): Promise<void> {
  log.info(
    `[QuotaPublisher] Uploading long-form video ${payload.videoId}: "${payload.title}"`
  );

  const filePath = await storage.getVideoFilePath(payload.videoId);

  const result = await uploadVideoToYouTube(channelId, {
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    categoryId: payload.categoryId,
    privacyStatus: "public",
    videoFilePath: filePath,
  });

  if (!result?.youtubeId) {
    throw new Error(`Upload returned no YouTube ID for video ${payload.videoId}`);
  }

  log.info(`[QuotaPublisher] ✅ Long-form uploaded — YouTube ID: ${result.youtubeId}`);

  await storage.markVideoPublished(payload.videoId, {
    youtubeVideoId: result.youtubeId,
    publishedAt: new Date(),
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    chapters: payload.chapters,
    thumbnailConcept: payload.thumbnailConcept,
  });
  await storage.incrementDailyPublishCount(userId, "longform");
  log.info(`[QuotaPublisher] Video ${payload.videoId} marked published`);
}

// ─── Publish cycle ────────────────────────────────────────────────────────────
export async function runPublishCycle(userId: string, channelId: number): Promise<void> {
  if (!isInPublishWindow()) {
    log.info("[QuotaPublisher] Outside publish window — skipping");
    return;
  }

  const windowStart = getQuotaWindowStart();
  const todayCounts = await storage.getDailyPublishCounts(userId, windowStart);
  const quotaUsed = await storage.getQuotaUsedToday(userId, windowStart);

  log.info(
    `[QuotaPublisher] Daily counts — Shorts: ${todayCounts.short}/${MAX_SHORTS_PER_DAY}, ` +
      `Long-form: ${todayCounts.longform}/${MAX_LONGFORM_PER_DAY}, ` +
      `Quota: ~${quotaUsed}/${SAFE_QUOTA_LIMIT} units`
  );

  if (quotaUsed >= SAFE_QUOTA_LIMIT) {
    log.warn("[QuotaPublisher] Approaching quota limit — pausing until reset");
    return;
  }

  // ── Publish Shorts (up to daily limit) ─────────────────────────────────────
  const shortsRemaining = MAX_SHORTS_PER_DAY - todayCounts.short;
  if (shortsRemaining > 0) {
    const readyShorts = await storage.getReadyShortsPayloads(userId, shortsRemaining);
    log.info(
      `[QuotaPublisher] ${readyShorts.length} Shorts ready to upload (${shortsRemaining} slots remaining)`
    );
    for (const payload of readyShorts) {
      const estimatedCost =
        QUOTA_COST_UPLOAD + (payload.thumbnailFilePath ? QUOTA_COST_THUMBNAIL : 0);
      if (quotaUsed + estimatedCost > SAFE_QUOTA_LIMIT) {
        log.warn("[QuotaPublisher] Quota limit would be exceeded — stopping Short uploads");
        break;
      }
      try {
        await publishReadyShort(payload, channelId, userId);
        await storage.recordQuotaUsage(userId, estimatedCost);
        await new Promise((r) => setTimeout(r, 10_000));
      } catch (err: any) {
        log.error(`[QuotaPublisher] Short upload failed for clip ${payload.clipId}:`, err);
        if (err?.code === 403 || err?.message?.includes("QUOTA_CAP")) {
          log.error("[QuotaPublisher] Quota exceeded — halting all uploads today");
          return;
        }
        await storage.markShortsClipUploadFailed(payload.clipId, err.message);
      }
    }
  }

  // ── Publish Long-form (up to daily limit) ──────────────────────────────────
  const longformRemaining = MAX_LONGFORM_PER_DAY - todayCounts.longform;
  if (longformRemaining > 0) {
    const readyVideos = await storage.getReadyLongformPayloads(userId, longformRemaining);
    log.info(
      `[QuotaPublisher] ${readyVideos.length} long-form videos ready (${longformRemaining} slots remaining)`
    );
    for (const payload of readyVideos) {
      const estimatedCost =
        QUOTA_COST_UPLOAD + (payload.thumbnailFilePath ? QUOTA_COST_THUMBNAIL : 0);
      if (quotaUsed + estimatedCost > SAFE_QUOTA_LIMIT) {
        log.warn(
          "[QuotaPublisher] Quota limit would be exceeded — stopping long-form uploads"
        );
        break;
      }
      try {
        await publishReadyLongform(payload, channelId, userId);
        await storage.recordQuotaUsage(userId, estimatedCost);
        await new Promise((r) => setTimeout(r, 15_000));
      } catch (err: any) {
        log.error(
          `[QuotaPublisher] Long-form upload failed for video ${payload.videoId}:`,
          err
        );
        if (err?.code === 403 || err?.message?.includes("QUOTA_CAP")) {
          log.error("[QuotaPublisher] Quota exceeded — halting all uploads today");
          return;
        }
        await storage.markVideoUploadFailed(payload.videoId, err.message);
      }
    }
  }

  log.info("[QuotaPublisher] Publish cycle complete");
}

// ─── Service lifecycle ────────────────────────────────────────────────────────
let _stopPublisher: (() => void) | null = null;

export function startQuotaAwarePublisher(userId: string, channelId: number): void {
  if (_stopPublisher) {
    log.warn("[QuotaPublisher] Already running — skipping double-start");
    return;
  }
  log.info("[QuotaPublisher] Starting — check interval: ~15 min");

  runPublishCycle(userId, channelId).catch((err) =>
    log.error("[QuotaPublisher] Startup cycle error:", err)
  );

  _stopPublisher = setJitteredInterval(
    () =>
      runPublishCycle(userId, channelId).catch((err) =>
        log.error("[QuotaPublisher] Cycle error:", err)
      ),
    15 * 60 * 1000
  );
}

export function stopQuotaAwarePublisher(): void {
  if (_stopPublisher) {
    _stopPublisher();
    _stopPublisher = null;
    log.info("[QuotaPublisher] Stopped");
  }
}
