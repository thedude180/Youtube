/**
 * revenue-attribution-engine.ts
 *
 * Collects per-video revenue metrics from YouTube Analytics and aggregates
 * them into the revenue_attribution table so content decisions (game selection,
 * duration, publish time) can be driven by actual earnings data.
 *
 * Runs every 12 hours (±20% jitter).  Gracefully no-ops when:
 *   - The channel is not yet monetized (all revenue nulls → skipped)
 *   - YouTube Analytics quota is exhausted
 *   - No YouTube channel is connected
 */

import { storage } from "../storage";
import { db } from "../db";
import { videos, channels } from "@shared/schema";
import type { InsertRevenueAttribution } from "@shared/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { canAffordOperation, trackQuotaUsage } from "./youtube-quota-tracker";
import { getVideoRevenueMetrics } from "./youtube-analytics";

const logger = createLogger("revenue-attribution-engine");

const COLLECTION_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const VIDEOS_LOOKBACK = 90; // last 90 published videos
const BATCH_SIZE = 20; // videos per Analytics API call

// Duration buckets in minutes (long-form experiment buckets)
const DURATION_BUCKETS_MIN = [8, 10, 15, 20, 30] as const;

function bucketDuration(durationSec: number): number {
  const durationMin = durationSec / 60;
  // Find the nearest bucket
  let nearest: number = DURATION_BUCKETS_MIN[0];
  let minDiff = Math.abs(durationMin - DURATION_BUCKETS_MIN[0]);
  for (const bucket of DURATION_BUCKETS_MIN) {
    const diff = Math.abs(durationMin - bucket);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = bucket;
    }
  }
  return nearest;
}

function extractGameFromTitle(title: string, metaGameName?: string): string {
  if (metaGameName && metaGameName.trim()) return metaGameName.trim();
  // Basic heuristic: title often starts with game name or has it after a dash/colon
  const cleaned = title.replace(/\s*[-|:]\s*.+$/, "").trim();
  return cleaned || "Unknown";
}

/**
 * Main collection function — fetches revenue metrics for the last N published
 * videos and upserts aggregated rows into revenue_attribution.
 */
export async function updateRevenueAttribution(userId: string): Promise<void> {
  logger.info(`[${userId}] Starting revenue attribution update`);

  // Get the user's YouTube channel with a valid access token
  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find(
    c => c.platform === "youtube" && c.accessToken && c.accessToken !== "dev_api_key_mode",
  );

  if (!ytChannel || !ytChannel.accessToken) {
    logger.info(`[${userId}] No connected YouTube channel — skipping revenue attribution`);
    return;
  }

  const accessToken = ytChannel.accessToken;
  const channelYtId = ytChannel.channelId || "MINE";

  // Fetch the last VIDEOS_LOOKBACK published videos that have a youtubeId
  const allVideos = await storage.getVideosByUser(userId, 1, VIDEOS_LOOKBACK);
  const publishedVideos = allVideos.filter(v => {
    const meta = (v.metadata as any) || {};
    return meta.youtubeId || meta.youtubeVideoId;
  });

  if (publishedVideos.length === 0) {
    logger.info(`[${userId}] No published YouTube videos found — skipping`);
    return;
  }

  // Build a map from youtubeId → video row
  type VideoWithYtId = { youtubeId: string; video: (typeof publishedVideos)[number] };
  const videoMap: VideoWithYtId[] = publishedVideos.map(v => {
    const meta = (v.metadata as any) || {};
    return { youtubeId: (meta.youtubeId || meta.youtubeVideoId) as string, video: v };
  });

  logger.info(`[${userId}] Collecting revenue for ${videoMap.length} videos in batches of ${BATCH_SIZE}`);

  // Aggregation map: key → aggregated stats
  interface AggBucket {
    gameTitle: string;
    format: string;
    durationBucketMin: number;
    dayOfWeek: number;
    publishHour: number;
    totalRevenue: number;
    totalRpm: number;
    totalCpm: number;
    totalViews: number;
    sampleCount: number;
    rpmSamples: number; // only videos where rpm is not null
    cpmSamples: number;
  }
  const aggMap = new Map<string, AggBucket>();

  let anyRevenue = false;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < videoMap.length; i += BATCH_SIZE) {
    const batch = videoMap.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(b => b.youtubeId);

    // Quota gate before each Analytics call
    const canAfford = await canAffordOperation(userId, "read").catch(() => true);
    if (!canAfford) {
      logger.info(`[${userId}] Quota exhausted — stopping revenue collection at batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      break;
    }

    let metrics: Awaited<ReturnType<typeof getVideoRevenueMetrics>>;
    try {
      metrics = await getVideoRevenueMetrics(accessToken, batchIds, channelYtId);
      await trackQuotaUsage(userId, "read").catch(() => {});
    } catch (err: any) {
      logger.warn(`[${userId}] Revenue metrics fetch failed: ${err?.message?.slice(0, 100)}`);
      continue;
    }

    for (const metric of metrics) {
      if (metric.estimatedRevenue == null && metric.cpm == null) continue; // not monetized or no data
      anyRevenue = true;

      // Find the matching video
      const entry = batch.find(b => b.youtubeId === metric.videoId);
      if (!entry) continue;
      const video = entry.video;
      const meta = (video.metadata as any) || {};

      // Extract categorization fields
      const gameTitle = extractGameFromTitle(video.title, meta.gameName ?? meta.redetectedGame);
      const durationSec = Number(meta.durationSec ?? meta.duration ?? 0);
      const format = durationSec > 0 && durationSec < 60 ? "shorts" : "long_form";
      const durationBucketMin = durationSec > 0 ? bucketDuration(durationSec) : 10; // default to 10 min bucket

      // Day-of-week and hour from publishedAt
      const publishedAtStr = meta.publishedAt || (video.publishedAt ? video.publishedAt.toISOString() : null);
      let dayOfWeek = 0;
      let publishHour = 0;
      if (publishedAtStr) {
        const dt = new Date(publishedAtStr);
        if (!isNaN(dt.getTime())) {
          dayOfWeek = dt.getUTCDay();
          publishHour = dt.getUTCHours();
        }
      }

      const aggKey = `${gameTitle}|${format}|${durationBucketMin}|${dayOfWeek}|${publishHour}`;
      const existing = aggMap.get(aggKey);
      if (existing) {
        existing.totalRevenue += metric.estimatedRevenue ?? 0;
        existing.totalViews += metric.views;
        existing.sampleCount += 1;
        if (metric.rpm != null) { existing.totalRpm += metric.rpm; existing.rpmSamples += 1; }
        if (metric.cpm != null) { existing.totalCpm += metric.cpm; existing.cpmSamples += 1; }
      } else {
        aggMap.set(aggKey, {
          gameTitle,
          format,
          durationBucketMin,
          dayOfWeek,
          publishHour,
          totalRevenue: metric.estimatedRevenue ?? 0,
          totalRpm: metric.rpm ?? 0,
          totalCpm: metric.cpm ?? 0,
          totalViews: metric.views,
          sampleCount: 1,
          rpmSamples: metric.rpm != null ? 1 : 0,
          cpmSamples: metric.cpm != null ? 1 : 0,
        });
      }
    }
  }

  if (!anyRevenue) {
    logger.info(`[${userId}] No monetized revenue data found — channel may not be in YPP yet`);
    return;
  }

  // Upsert aggregated buckets into revenue_attribution
  let upserted = 0;
  for (const [, bucket] of aggMap) {
    const avgRpm = bucket.rpmSamples > 0 ? bucket.totalRpm / bucket.rpmSamples : null;
    const avgCpm = bucket.cpmSamples > 0 ? bucket.totalCpm / bucket.cpmSamples : null;

    const payload: InsertRevenueAttribution = {
      userId,
      contentId: `${bucket.gameTitle}|${bucket.format}|${bucket.durationBucketMin}|${bucket.dayOfWeek}|${bucket.publishHour}`,
      contentTitle: bucket.gameTitle,
      platform: "youtube",
      revenueType: "ad_revenue",
      amount: bucket.totalRevenue,
      currency: "USD",
      attributionModel: "aggregated",
      metadata: {
        gameTitle: bucket.gameTitle,
        format: bucket.format,
        durationBucketMin: bucket.durationBucketMin,
        dayOfWeek: bucket.dayOfWeek,
        publishHour: bucket.publishHour,
        avgRpm,
        avgCpm,
        totalViews: bucket.totalViews,
        sampleCount: bucket.sampleCount,
        collectedAt: new Date().toISOString(),
      },
      period: new Date().toISOString().slice(0, 7), // YYYY-MM
    };

    await storage.upsertRevenueAttribution(payload).catch(err =>
      logger.warn(`[${userId}] Upsert failed for bucket ${payload.contentId}: ${err?.message?.slice(0, 100)}`),
    );
    upserted++;
  }

  logger.info(`[${userId}] Revenue attribution updated — ${upserted} buckets upserted from ${aggMap.size} unique combinations`);
}

// ── Decision-support query functions ─────────────────────────────────────────

/**
 * Returns the game title with the highest average RPM across all attribution
 * rows for this user.  Requires at least 3 samples to qualify.
 */
export async function getHighestRevenueGame(userId: string): Promise<string | null> {
  try {
    const rows = await storage.getRevenueAttributions(userId);
    if (rows.length === 0) return null;

    const gameRpm = new Map<string, { totalRpm: number; count: number }>();
    for (const row of rows) {
      const meta = (row.metadata as any) || {};
      const game = meta.gameTitle as string | undefined;
      const avgRpm = meta.avgRpm as number | null | undefined;
      if (!game || avgRpm == null) continue;
      const existing = gameRpm.get(game) || { totalRpm: 0, count: 0 };
      existing.totalRpm += avgRpm;
      existing.count += 1;
      gameRpm.set(game, existing);
    }

    let bestGame: string | null = null;
    let bestRpm = -Infinity;
    for (const [game, { totalRpm, count }] of gameRpm) {
      if (count < 3) continue; // need at least 3 samples
      const rpm = totalRpm / count;
      if (rpm > bestRpm) {
        bestRpm = rpm;
        bestGame = game;
      }
    }
    return bestGame;
  } catch (err: any) {
    logger.warn(`getHighestRevenueGame error: ${err?.message?.slice(0, 100)}`);
    return null;
  }
}

/**
 * Returns the duration bucket (in minutes) with the highest average RPM.
 * Optionally filtered to a specific game title.
 */
export async function getHighestRevenueDuration(
  userId: string,
  gameTitle?: string,
): Promise<number | null> {
  try {
    const rows = await storage.getRevenueAttributions(userId, gameTitle ? { gameTitle } : undefined);
    if (rows.length === 0) return null;

    const durationRpm = new Map<number, { totalRpm: number; count: number }>();
    for (const row of rows) {
      const meta = (row.metadata as any) || {};
      const bucket = meta.durationBucketMin as number | undefined;
      const avgRpm = meta.avgRpm as number | null | undefined;
      if (bucket == null || avgRpm == null) continue;
      const existing = durationRpm.get(bucket) || { totalRpm: 0, count: 0 };
      existing.totalRpm += avgRpm;
      existing.count += 1;
      durationRpm.set(bucket, existing);
    }

    let bestBucket: number | null = null;
    let bestRpm = -Infinity;
    for (const [bucket, { totalRpm, count }] of durationRpm) {
      const rpm = totalRpm / count;
      if (rpm > bestRpm) {
        bestRpm = rpm;
        bestBucket = bucket;
      }
    }
    return bestBucket;
  } catch (err: any) {
    logger.warn(`getHighestRevenueDuration error: ${err?.message?.slice(0, 100)}`);
    return null;
  }
}

/**
 * Returns the day+hour combination (UTC) with the highest average revenue.
 * Requires at least 3 samples to qualify.
 */
export async function getHighestRevenueTimeSlot(
  userId: string,
): Promise<{ dayOfWeek: number; hour: number } | null> {
  try {
    const rows = await storage.getRevenueAttributions(userId);
    if (rows.length === 0) return null;

    const slotRevenue = new Map<string, { totalRevenue: number; count: number; day: number; hour: number }>();
    for (const row of rows) {
      const meta = (row.metadata as any) || {};
      const day = meta.dayOfWeek as number | undefined;
      const hour = meta.publishHour as number | undefined;
      if (day == null || hour == null) continue;
      const key = `${day}:${hour}`;
      const existing = slotRevenue.get(key) || { totalRevenue: 0, count: 0, day, hour };
      existing.totalRevenue += row.amount;
      existing.count += 1;
      slotRevenue.set(key, existing);
    }

    let bestSlot: { dayOfWeek: number; hour: number } | null = null;
    let bestRevenue = -Infinity;
    for (const [, { totalRevenue, count, day, hour }] of slotRevenue) {
      if (count < 3) continue;
      const avg = totalRevenue / count;
      if (avg > bestRevenue) {
        bestRevenue = avg;
        bestSlot = { dayOfWeek: day, hour };
      }
    }
    return bestSlot;
  } catch (err: any) {
    logger.warn(`getHighestRevenueTimeSlot error: ${err?.message?.slice(0, 100)}`);
    return null;
  }
}

/**
 * Returns a single summary object with the top performing content dimensions.
 * hasData=false when no attribution data exists yet.
 */
export async function getRevenueInsightSummary(userId: string): Promise<{
  topGame: string | null;
  topDuration: number | null;
  topDayOfWeek: number | null;
  topHour: number | null;
  hasData: boolean;
}> {
  try {
    const [topGame, topDuration, timeSlot] = await Promise.all([
      getHighestRevenueGame(userId),
      getHighestRevenueDuration(userId),
      getHighestRevenueTimeSlot(userId),
    ]);

    const hasData = topGame !== null || topDuration !== null || timeSlot !== null;
    return {
      topGame,
      topDuration,
      topDayOfWeek: timeSlot?.dayOfWeek ?? null,
      topHour: timeSlot?.hour ?? null,
      hasData,
    };
  } catch (err: any) {
    logger.warn(`getRevenueInsightSummary error: ${err?.message?.slice(0, 100)}`);
    return { topGame: null, topDuration: null, topDayOfWeek: null, topHour: null, hasData: false };
  }
}

// ── Service lifecycle ─────────────────────────────────────────────────────────

let stopFn: (() => void) | null = null;

export function startRevenueAttributionEngine(): void {
  if (stopFn) {
    logger.info("Revenue attribution engine already running");
    return;
  }

  logger.info("Starting revenue attribution engine (12h cycle)");

  stopFn = setJitteredInterval(async () => {
    try {
      // Run for all users that have a YouTube channel
      const allChannels = await storage.getChannels();
      const userIds = [...new Set(allChannels
        .filter(c => c.platform === "youtube" && c.userId && c.accessToken && c.accessToken !== "dev_api_key_mode")
        .map(c => c.userId!)
      )];

      for (const userId of userIds) {
        try {
          await updateRevenueAttribution(userId);
        } catch (err: any) {
          logger.warn(`[${userId}] Revenue attribution cycle failed: ${err?.message?.slice(0, 100)}`);
        }
      }
    } catch (err: any) {
      logger.error(`Revenue attribution engine cycle error: ${err?.message?.slice(0, 100)}`);
    }
  }, COLLECTION_INTERVAL_MS);
}

export function stopRevenueAttributionEngine(): void {
  if (stopFn) {
    stopFn();
    stopFn = null;
    logger.info("Revenue attribution engine stopped");
  }
}
