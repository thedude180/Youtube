/**
 * youtube-data-cache.ts
 *
 * Central hub for all YouTube READ data.
 *
 * Design rule: this is the ONLY place in the codebase that should call YouTube
 * Analytics / YouTube Data API for read-only purposes.  Every other background
 * engine that needs channel stats, video metrics, CTR, or analytics data must
 * call the getters here — which read from the database — instead of hitting the
 * API directly.
 *
 *   WRITES to YouTube API (uploads, metadata updates, playlist ops) — NOT here.
 *   These stay in youtube.ts / playlist-manager.ts as before.
 *
 *   LIVE API calls that must be real-time — NOT here.
 *   pipeline-tracer.ts (verify published status) and stream-operator.ts (live
 *   video status during a stream) need live data and are exempt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage mapping
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Per-video metrics  → youtube_output_metrics  (measuredAt = freshness stamp)
 *  • Channel stats      → channels  (subscriberCount, viewCount, videoCount,
 *                                    lastSyncAt)  — already kept fresh by the
 *                                    platform-sync-engine every 12 h
 *  • Channel CTR        → system_settings  key = "ytcache:ctr:{userId}"
 *                                           val = JSON { ctr, impressions, ts }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────────────────────
 *  getCachedVideoMetrics(userId, youtubeVideoId)
 *      Returns analytics from youtube_output_metrics if row exists and measuredAt
 *      is within VIDEO_METRICS_TTL_MS.  If stale / missing, fetches from YouTube
 *      Analytics API, upserts the row, and returns the result.
 *      Zero quota cost when cache is warm.
 *
 *  getCachedChannelStats(channelId)
 *      Reads subscriberCount / viewCount / videoCount directly from the channels
 *      table.  Zero quota — the platform-sync engine keeps this table current.
 *
 *  getCachedChannelCTR(userId)
 *      Returns { ctr, impressions } from system_settings if stored within
 *      CTR_TTL_MS.  Otherwise calls fetchChannelCTR once and stores the result.
 *
 *  initYouTubeDataCache()
 *      Schedules a batch proactive refresh every 4 hours.  The refresh fetches
 *      analytics for all videos published in the last 30 days (capped at 25 per
 *      channel) and also refreshes channel CTR.  Runs at T+45 min so it does not
 *      collide with the back-catalog / grinder / publisher convergence window.
 */

import { db } from "../db";
import { youtubeOutputMetrics, systemSettings, channels } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped, canAffordOperation } from "./youtube-quota-tracker";
import { storage } from "../storage";

const logger = createLogger("youtube-data-cache");

const VIDEO_METRICS_TTL_MS = 4 * 60 * 60_000;   // 4 hours
const CTR_TTL_MS           = 6 * 60 * 60_000;   // 6 hours
const REFRESH_BATCH        = 25;                 // max videos refreshed per channel per cycle
const REFRESH_INTERVAL_MS  = 4 * 60 * 60_000;   // 4 hours between batch refreshes

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSystemSettingJson<T>(key: string): Promise<T | null> {
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (!row) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function setSystemSettingJson(key: string, value: unknown): Promise<void> {
  const str = JSON.stringify(value);
  await db
    .insert(systemSettings)
    .values({ key, value: str })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: str, updatedAt: new Date() } });
}

// ── getCachedVideoMetrics ─────────────────────────────────────────────────────

export type CachedVideoMetrics = {
  views: number;
  impressions: number;
  ctr: number;
  averageViewDurationSec: number;
  averageViewPercent: number;
  watchTimeMinutes: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  performanceScore: number | null;
  measuredAt: Date | null;
  fromCache: boolean;
};

/**
 * Returns per-video analytics from the DB cache if the row is < 4 h old.
 * If stale or missing, fetches from the YouTube Analytics API, writes to
 * youtube_output_metrics, and returns the fresh result.
 *
 * Callers never need to know whether the data came from the cache or the API.
 * They always get the same shape back.
 */
export async function getCachedVideoMetrics(
  userId: string,
  youtubeVideoId: string,
): Promise<Partial<CachedVideoMetrics>> {
  // 1. Check the DB cache first.
  const cutoff = new Date(Date.now() - VIDEO_METRICS_TTL_MS);
  const [cached] = await db
    .select()
    .from(youtubeOutputMetrics)
    .where(
      and(
        eq(youtubeOutputMetrics.userId,         userId),
        eq(youtubeOutputMetrics.youtubeVideoId, youtubeVideoId),
        gte(youtubeOutputMetrics.measuredAt,    cutoff),
      ),
    )
    .orderBy(desc(youtubeOutputMetrics.measuredAt))
    .limit(1);

  if (cached) {
    return {
      views:                  cached.views        ?? 0,
      impressions:            cached.impressions   ?? 0,
      ctr:                    Number(cached.ctr)   ?? 0,
      averageViewDurationSec: cached.averageViewDurationSec ?? 0,
      averageViewPercent:     Number(cached.averageViewPercent) ?? 0,
      watchTimeMinutes:       Number(cached.watchTimeMinutes)   ?? 0,
      likes:                  cached.likes         ?? 0,
      comments:               cached.comments      ?? 0,
      subscribersGained:      cached.subscribersGained ?? 0,
      performanceScore:       Number(cached.performanceScore) ?? null,
      measuredAt:             cached.measuredAt ?? undefined,
      fromCache:              true,
    };
  }

  // 2. Cache miss — fetch from API if quota allows.
  if (isQuotaBreakerTripped()) {
    logger.info(`[YTCache] Quota breaker active — returning empty metrics for ${youtubeVideoId}`);
    return {};
  }
  const canAfford = await canAffordOperation(userId, "read");
  if (!canAfford) {
    logger.info(`[YTCache] Quota reserved for uploads — skipping analytics fetch for ${youtubeVideoId}`);
    return {};
  }

  try {
    const { fetchVideoAnalytics } = await import("./youtube-analytics");
    const raw = await fetchVideoAnalytics(userId, youtubeVideoId);
    if (!raw || Object.keys(raw).length === 0) return {};

    // 3. Write to cache so the next caller pays zero quota.
    await _upsertVideoMetrics(userId, youtubeVideoId, raw);

    return { ...raw, measuredAt: new Date(), fromCache: false };
  } catch (err: any) {
    logger.warn(`[YTCache] fetchVideoAnalytics failed for ${youtubeVideoId}: ${err?.message?.slice(0, 120)}`);
    return {};
  }
}

// ── getCachedChannelStats ─────────────────────────────────────────────────────

export type CachedChannelStats = {
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  channelName: string;
  lastSyncAt: Date | null;
};

/**
 * Reads channel stats from the channels table.
 * Zero quota — the platform-sync engine already keeps this table fresh every 12h.
 * Do not call YouTube API here; that is the platform-sync engine's job.
 */
export async function getCachedChannelStats(channelId: number): Promise<CachedChannelStats | null> {
  const [ch] = await db
    .select({
      subscriberCount: channels.subscriberCount,
      viewCount:       channels.viewCount,
      videoCount:      channels.videoCount,
      channelName:     channels.channelName,
      lastSyncAt:      channels.lastSyncAt,
    })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!ch) return null;
  return {
    subscriberCount: Number(ch.subscriberCount ?? 0),
    viewCount:       Number(ch.viewCount       ?? 0),
    videoCount:      ch.videoCount             ?? 0,
    channelName:     ch.channelName            ?? "",
    lastSyncAt:      ch.lastSyncAt             ?? null,
  };
}

// ── getCachedChannelCTR ───────────────────────────────────────────────────────

export type CachedChannelCTR = {
  ctr: number | null;
  impressions: number | null;
  fetchedAt: string;
  fromCache: boolean;
};

/**
 * Returns channel-wide 28-day CTR from system_settings cache.
 * Only calls YouTube Analytics API if the cached value is > 6 h old.
 */
export async function getCachedChannelCTR(userId: string): Promise<CachedChannelCTR> {
  const cacheKey = `ytcache:ctr:${userId}`;
  const stored = await getSystemSettingJson<{ ctr: number | null; impressions: number | null; fetchedAt: string }>(cacheKey);

  if (stored) {
    const age = Date.now() - new Date(stored.fetchedAt).getTime();
    if (age < CTR_TTL_MS) {
      return { ...stored, fromCache: true };
    }
  }

  // Cache miss or stale — fetch from API.
  if (isQuotaBreakerTripped()) return { ctr: stored?.ctr ?? null, impressions: stored?.impressions ?? null, fetchedAt: stored?.fetchedAt ?? new Date().toISOString(), fromCache: true };
  const canAfford = await canAffordOperation(userId, "read");
  if (!canAfford) return { ctr: stored?.ctr ?? null, impressions: stored?.impressions ?? null, fetchedAt: stored?.fetchedAt ?? new Date().toISOString(), fromCache: true };

  try {
    const { fetchChannelCTR } = await import("./youtube-analytics");
    const result = await fetchChannelCTR(userId);
    const payload = { ctr: result.ctr, impressions: result.impressions, fetchedAt: new Date().toISOString() };
    await setSystemSettingJson(cacheKey, payload);
    return { ...payload, fromCache: false };
  } catch (err: any) {
    logger.warn(`[YTCache] fetchChannelCTR failed for ${userId}: ${err?.message?.slice(0, 100)}`);
    return { ctr: stored?.ctr ?? null, impressions: stored?.impressions ?? null, fetchedAt: new Date().toISOString(), fromCache: true };
  }
}

// ── Internal upsert ───────────────────────────────────────────────────────────

async function _upsertVideoMetrics(
  userId: string,
  youtubeVideoId: string,
  raw: Partial<{
    views: number; impressions: number; ctr: number;
    averageViewDurationSec: number; averageViewPercent: number;
    watchTimeMinutes: number; likes: number; comments: number;
    subscribersGained: number;
  }>,
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: youtubeOutputMetrics.id })
      .from(youtubeOutputMetrics)
      .where(
        and(
          eq(youtubeOutputMetrics.userId,         userId),
          eq(youtubeOutputMetrics.youtubeVideoId, youtubeVideoId),
        ),
      )
      .limit(1);

    const payload = {
      impressions:            raw.impressions            ?? 0,
      ctr:                    raw.ctr                    ?? 0,
      views:                  raw.views                  ?? 0,
      averageViewDurationSec: raw.averageViewDurationSec ?? 0,
      averageViewPercent:     raw.averageViewPercent     ?? 0,
      watchTimeMinutes:       raw.watchTimeMinutes       ?? 0,
      likes:                  raw.likes                  ?? 0,
      comments:               raw.comments               ?? 0,
      subscribersGained:      raw.subscribersGained      ?? 0,
      measuredAt:             new Date(),
    };

    if (existing) {
      await db
        .update(youtubeOutputMetrics)
        .set(payload)
        .where(eq(youtubeOutputMetrics.id, existing.id));
    } else {
      await db
        .insert(youtubeOutputMetrics)
        .values({ userId, youtubeVideoId, ...payload } as any);
    }
  } catch (err: any) {
    logger.warn(`[YTCache] upsert failed for ${youtubeVideoId}: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Batch refresh ─────────────────────────────────────────────────────────────

/**
 * Proactively refresh analytics for all recently published videos for a given user.
 * Called by the scheduled background cycle — NOT by individual engines.
 * Capped at REFRESH_BATCH (25) videos per call to keep quota predictable.
 * Each video costs ~10 YouTube Analytics API quota units.
 * 25 videos × 10 = ~250 units per 4h cycle per user.
 */
async function refreshUserVideoMetrics(userId: string): Promise<void> {
  if (isQuotaBreakerTripped()) return;
  const canAfford = await canAffordOperation(userId, "read");
  if (!canAfford) return;

  // Find recently published videos from autopilot_queue that have a YouTube ID.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  // Collect YouTube video IDs from output_metrics rows that are stale (> 4h old).
  const staleRows = await db
    .select({ youtubeVideoId: youtubeOutputMetrics.youtubeVideoId })
    .from(youtubeOutputMetrics)
    .where(
      and(
        eq(youtubeOutputMetrics.userId, userId),
        sql`${youtubeOutputMetrics.measuredAt} < NOW() - INTERVAL '4 hours'`,
        gte(youtubeOutputMetrics.publishedAt!, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(youtubeOutputMetrics.publishedAt))
    .limit(REFRESH_BATCH);

  if (staleRows.length === 0) {
    logger.info(`[YTCache] All video metrics are fresh for ${userId.slice(0, 8)} — skipping batch refresh`);
    return;
  }

  logger.info(`[YTCache] Batch refresh for ${userId.slice(0, 8)}: ${staleRows.length} stale metrics`);

  const { fetchVideoAnalytics } = await import("./youtube-analytics");
  let refreshed = 0;

  for (const row of staleRows) {
    if (isQuotaBreakerTripped()) break;
    try {
      const raw = await fetchVideoAnalytics(userId, row.youtubeVideoId);
      if (raw && Object.keys(raw).length > 0) {
        await _upsertVideoMetrics(userId, row.youtubeVideoId, raw);
        refreshed++;
      }
    } catch {
      // Non-fatal — skip this video
    }
  }

  // Also refresh CTR in the same pass.
  try {
    const { fetchChannelCTR } = await import("./youtube-analytics");
    const ctrData = await fetchChannelCTR(userId);
    const cacheKey = `ytcache:ctr:${userId}`;
    await setSystemSettingJson(cacheKey, {
      ctr: ctrData.ctr,
      impressions: ctrData.impressions,
      fetchedAt: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  logger.info(`[YTCache] Batch refresh complete for ${userId.slice(0, 8)}: ${refreshed}/${staleRows.length} videos updated`);
}

// ── Scheduled init ────────────────────────────────────────────────────────────

let _cacheTimer: ReturnType<typeof setInterval> | null = null;

async function runCacheRefreshCycle(): Promise<void> {
  try {
    const allUsers = await db.execute(
      sql`SELECT DISTINCT user_id FROM channels WHERE platform = 'youtube' AND access_token IS NOT NULL AND access_token != 'dev_api_key_mode' LIMIT 10`,
    );
    const rows = (allUsers as unknown as { rows?: { user_id: string }[] }).rows ?? [];
    for (const row of rows) {
      try {
        await refreshUserVideoMetrics(row.user_id);
      } catch (err: any) {
        logger.warn(`[YTCache] Refresh failed for ${String(row.user_id).slice(0, 8)}: ${err?.message?.slice(0, 80)}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[YTCache] Refresh cycle error: ${err?.message?.slice(0, 100)}`);
  }
}

/**
 * Wire up the scheduled background cache refresh.
 * Call once from server/index.ts during the startup wave sequence.
 * First refresh fires at T+45 min (well after publishers, grinder, orchestrator
 * have settled) then every 4 hours thereafter.
 */
export function initYouTubeDataCache(): void {
  // Called from Wave 11 (T+40 min). A 5-min internal delay pushes the first
  // refresh to T+45 min — safely after publishers, grinder, and back-catalog
  // have settled, but before the T+54 min shadow-analytics sweep.
  logger.info("[YTCache] YouTube data cache initialised — first refresh in 5 min, then every 4h");

  setTimeout(() => {
    runCacheRefreshCycle().catch(err =>
      logger.warn(`[YTCache] Initial refresh failed: ${err?.message?.slice(0, 100)}`),
    );
  }, 5 * 60_000);

  _cacheTimer = setInterval(() => {
    runCacheRefreshCycle().catch(err =>
      logger.warn(`[YTCache] Scheduled refresh failed: ${err?.message?.slice(0, 100)}`),
    );
  }, REFRESH_INTERVAL_MS);
}

export function stopYouTubeDataCache(): void {
  if (_cacheTimer) {
    clearInterval(_cacheTimer);
    _cacheTimer = null;
  }
}
