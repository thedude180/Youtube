/**
 * performance-feedback-loop.ts
 *
 * Reads real YouTube Analytics data for every user's published videos and
 * feeds the results back into content-decision engines so the system learns
 * what actually works for this specific channel.
 *
 * Data pipeline (runs every 6 hours via setJitteredInterval):
 *  1. For each user with an active YouTube channel, fetch last 60 published
 *     videos from the youtubeOutputMetrics table.
 *  2. For videos older than 48 h (YouTube analytics lag) that haven't been
 *     refreshed in 6 hours, call fetchVideoAnalytics() and upsert the row.
 *  3. Aggregate the refreshed rows into per-(game, contentType, durationBucket,
 *     publishHour) performance summaries and cache them in-memory.
 *
 * Decision exports (called by other engines with no quota cost):
 *   getBestGame()         — highest views×watchPct game per format, min 3 samples
 *   getBestDuration()     — best duration bucket, falls back to 10 min if no data
 *   getBestPublishHour()  — best UTC hour by avg views, falls back to 15 (3 PM UTC)
 *   getGameRanking()      — sorted game list for content planning
 *
 * All decision functions read from the youtubeOutputMetrics table (populated by
 * recordVideoPerformance() in youtube-performance-learner) so they always have
 * data even on the first loop cycle.
 */

import { db } from "../db";
import { youtubeOutputMetrics, channels, videoCatalogLinks } from "@shared/schema";
import { eq, and, desc, sql, lte, or, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { isQuotaBreakerTripped, canAffordOperation, trackQuotaUsage } from "./youtube-quota-tracker";
import { recordVideoPerformance } from "./youtube-performance-learner";

const logger = createLogger("performance-feedback-loop");

// Run the data-collection cycle every 6 hours (±20% jitter from setJitteredInterval)
const CYCLE_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Minimum number of samples before we trust a data point for decisions
const MIN_SAMPLE_SIZE = 3;

// Default values returned when there is no data
const DEFAULT_DURATION_MIN = 10;
const DEFAULT_PUBLISH_HOUR_UTC = 15; // 3 PM UTC — solid YouTube peak for US/EU audiences

// ── In-memory performance cache ───────────────────────────────────────────────
// Keyed by userId. Populated/refreshed by the 6-hour collection cycle.
// Decision functions read from the DB directly (no cache race risk).

let loopStop: (() => void) | null = null;

// ── Data collection cycle ─────────────────────────────────────────────────────

/**
 * For a single user: refresh analytics for any videos published > 48 h ago
 * that haven't been measured in the last 6 hours.  Capped at 15 videos per
 * run to avoid burning YouTube Analytics quota in bulk.
 *
 * Uses recordVideoPerformance() from youtube-performance-learner which already
 * handles the full analytics fetch + upsert flow.
 */
async function collectForUser(userId: string): Promise<{ analyzed: number; skipped: number }> {
  let analyzed = 0;
  let skipped = 0;

  try {
    // Gate: quota breaker
    if (isQuotaBreakerTripped()) {
      logger.info(`[${userId.slice(0, 8)}] Quota breaker active — skipping collection`);
      return { analyzed: 0, skipped: 1 };
    }

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600_000);
    const sixHoursAgo        = new Date(Date.now() - 6  * 3600_000);

    // Find up to 15 videos needing a refresh
    const stale = await db.select({
      youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
      contentType:    youtubeOutputMetrics.contentType,
      durationSec:    youtubeOutputMetrics.durationSec,
      gameName:       youtubeOutputMetrics.gameName,
      postingWindow:  youtubeOutputMetrics.postingWindow,
      sourceVideoId:  youtubeOutputMetrics.sourceVideoId,
      publishedAt:    youtubeOutputMetrics.publishedAt,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        lte(youtubeOutputMetrics.publishedAt, fortyEightHoursAgo),
        or(
          sql`${youtubeOutputMetrics.measuredAt} IS NULL`,
          lte(youtubeOutputMetrics.measuredAt, sixHoursAgo),
        ),
      ))
      .orderBy(youtubeOutputMetrics.measuredAt)
      .limit(15);

    for (const row of stale) {
      // Per-video quota gate
      const canAfford = await canAffordOperation(userId, "read");
      if (!canAfford) {
        logger.info(`[${userId.slice(0, 8)}] Analytics quota reserved — stopping at ${analyzed} videos`);
        skipped += stale.length - analyzed;
        break;
      }

      await trackQuotaUsage(userId, "read");

      await recordVideoPerformance(userId, row.youtubeVideoId, {
        contentType:   row.contentType ?? "long_form",
        durationSec:   row.durationSec ?? 0,
        gameName:      row.gameName ?? undefined,
        postingWindow: row.postingWindow ?? undefined,
        sourceVideoId: row.sourceVideoId ?? undefined,
        publishedAt:   row.publishedAt ?? undefined,
      });

      analyzed++;
    }
  } catch (err: any) {
    logger.warn(`[${userId.slice(0, 8)}] Collection error: ${err?.message?.slice(0, 200)}`);
  }

  return { analyzed, skipped };
}

/**
 * Run one full collection cycle across all users that have a YouTube channel.
 */
export async function runCollectionCycle(): Promise<void> {
  try {
    // Get distinct userIds that have a YouTube channel with an access token
    const rows = await db
      .selectDistinct({ userId: channels.userId })
      .from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        sql`${channels.accessToken} IS NOT NULL`,
        sql`${channels.accessToken} != 'dev_api_key_mode'`,
      ));

    if (rows.length === 0) {
      logger.debug("[PerformanceFeedbackLoop] No active YouTube channels found");
      return;
    }

    let totalAnalyzed = 0;
    let totalSkipped  = 0;

    for (const { userId } of rows) {
      const { analyzed, skipped } = await collectForUser(userId);
      totalAnalyzed += analyzed;
      totalSkipped  += skipped;
    }

    logger.info(
      `[PerformanceFeedbackLoop] Cycle complete — ${rows.length} user(s), ` +
      `${totalAnalyzed} videos analyzed, ${totalSkipped} skipped`,
    );
  } catch (err: any) {
    logger.error(`[PerformanceFeedbackLoop] Cycle failed: ${err?.message?.slice(0, 300)}`);
  }
}

// ── Decision export functions ─────────────────────────────────────────────────

/**
 * Returns the game title with the highest views × watchTimePct score for the
 * given format, requiring at least MIN_SAMPLE_SIZE data points.
 *
 * Returns null when there is insufficient data (new channel, no analytics yet).
 */
export async function getBestGame(
  userId: string,
  format: "long_form" | "shorts",
): Promise<string | null> {
  try {
    const contentType = format === "shorts" ? "short" : "long_form";

    const rows = await db.select({
      gameName:         youtubeOutputMetrics.gameName,
      avgViews:         sql<number>`avg(views)::float`,
      avgWatchTimePct:  sql<number>`avg(average_view_percent)::float`,
      sampleSize:       sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.contentType, contentType),
        sql`${youtubeOutputMetrics.gameName} IS NOT NULL`,
        // Only include rows where we have real analytics
        sql`${youtubeOutputMetrics.views} > 0`,
      ))
      .groupBy(youtubeOutputMetrics.gameName)
      .having(sql`count(*) >= ${MIN_SAMPLE_SIZE}`)
      .orderBy(sql`avg(views) * avg(average_view_percent) desc`)
      .limit(1);

    return rows[0]?.gameName ?? null;
  } catch (err: any) {
    logger.warn(`[getBestGame] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 100)}`);
    return null;
  }
}

/**
 * Returns the duration bucket (in minutes) with the best performance score.
 * Falls back to DEFAULT_DURATION_MIN when no data with MIN_SAMPLE_SIZE exists.
 *
 * This complements chooseBestLongFormDuration() in youtube-performance-learner
 * by providing a simple integer (minutes) for callers that don't need the full
 * exploration/exploitation algorithm.
 */
export async function getBestDuration(
  userId: string,
  gameTitle?: string,
): Promise<number> {
  try {
    // Duration bucket label → representative minutes mapping
    const BUCKET_TO_MIN: Record<string, number> = {
      "long_8_10":  8,
      "long_10_15": 10,
      "long_15_20": 15,
      "long_20_30": 20,
      "long_30_45": 30,
      "long_45_60": 45,
    };

    const conditions = [
      eq(youtubeOutputMetrics.userId, userId),
      eq(youtubeOutputMetrics.contentType, "long_form"),
      sql`${youtubeOutputMetrics.durationBucket} IS NOT NULL`,
    ];

    if (gameTitle) {
      conditions.push(sql`lower(${youtubeOutputMetrics.gameName}) = lower(${gameTitle})`);
    }

    const rows = await db.select({
      durationBucket: youtubeOutputMetrics.durationBucket,
      avgScore:       sql<number>`avg(performance_score)::float`,
      sampleSize:     sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(...conditions))
      .groupBy(youtubeOutputMetrics.durationBucket)
      .having(sql`count(*) >= ${MIN_SAMPLE_SIZE}`)
      .orderBy(sql`avg(performance_score) desc`)
      .limit(1);

    if (!rows[0]?.durationBucket) return DEFAULT_DURATION_MIN;

    const minutes = BUCKET_TO_MIN[rows[0].durationBucket];
    return minutes ?? DEFAULT_DURATION_MIN;
  } catch (err: any) {
    logger.warn(`[getBestDuration] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 100)}`);
    return DEFAULT_DURATION_MIN;
  }
}

/**
 * Returns the UTC hour (0–23) with the highest average view count, requiring
 * at least MIN_SAMPLE_SIZE data points per hour.
 *
 * Falls back to DEFAULT_PUBLISH_HOUR_UTC (15 = 3 PM UTC) when no data.
 */
export async function getBestPublishHour(userId: string): Promise<number> {
  try {
    const rows = await db.select({
      publishHour: sql<number>`extract(hour from published_at)::int`,
      avgViews:    sql<number>`avg(views)::float`,
      sampleSize:  sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        sql`${youtubeOutputMetrics.publishedAt} IS NOT NULL`,
        sql`${youtubeOutputMetrics.views} > 0`,
      ))
      .groupBy(sql`extract(hour from published_at)`)
      .having(sql`count(*) >= ${MIN_SAMPLE_SIZE}`)
      .orderBy(sql`avg(views) desc`)
      .limit(1);

    if (rows[0]?.publishHour == null) return DEFAULT_PUBLISH_HOUR_UTC;

    const hour = Number(rows[0].publishHour);
    return Number.isFinite(hour) && hour >= 0 && hour <= 23
      ? hour
      : DEFAULT_PUBLISH_HOUR_UTC;
  } catch (err: any) {
    logger.warn(`[getBestPublishHour] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 100)}`);
    return DEFAULT_PUBLISH_HOUR_UTC;
  }
}

/**
 * Returns all games ranked by performance score (views × watch pct).
 * Games with < MIN_SAMPLE_SIZE data points are excluded.
 *
 * Used by content planning engines to weight game selection.
 * Returns [] when no data exists yet.
 */
export async function getGameRanking(
  userId: string,
  format: "long_form" | "shorts",
): Promise<Array<{ game: string; score: number }>> {
  try {
    const contentType = format === "shorts" ? "short" : "long_form";

    const rows = await db.select({
      gameName:         youtubeOutputMetrics.gameName,
      avgViews:         sql<number>`avg(views)::float`,
      avgWatchTimePct:  sql<number>`avg(average_view_percent)::float`,
      sampleSize:       sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.contentType, contentType),
        sql`${youtubeOutputMetrics.gameName} IS NOT NULL`,
        sql`${youtubeOutputMetrics.views} > 0`,
      ))
      .groupBy(youtubeOutputMetrics.gameName)
      .having(sql`count(*) >= ${MIN_SAMPLE_SIZE}`)
      .orderBy(sql`avg(views) * avg(average_view_percent) desc`);

    return rows
      .filter(r => r.gameName)
      .map(r => ({
        game:  r.gameName!,
        score: +(((r.avgViews ?? 0) * (r.avgWatchTimePct ?? 0))).toFixed(2),
      }));
  } catch (err: any) {
    logger.warn(`[getGameRanking] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 100)}`);
    return [];
  }
}

// ── Service lifecycle ─────────────────────────────────────────────────────────

export function startPerformanceFeedbackLoop(): void {
  if (loopStop) {
    logger.warn("[PerformanceFeedbackLoop] Already running — ignoring duplicate start");
    return;
  }

  logger.info(`[PerformanceFeedbackLoop] Starting — 6-hour collection cycle (±20% jitter)`);

  // Run the first cycle after a 5-minute startup delay so the server is fully
  // initialised before we start hitting the YouTube Analytics API.
  const firstRunTimer = setTimeout(() => {
    runCollectionCycle().catch(err =>
      logger.error(`[PerformanceFeedbackLoop] First-run cycle failed: ${err?.message}`),
    );
  }, 5 * 60_000);

  const stop = setJitteredInterval(
    () => {
      runCollectionCycle().catch(err =>
        logger.error(`[PerformanceFeedbackLoop] Recurring cycle failed: ${err?.message}`),
      );
    },
    CYCLE_INTERVAL_MS,
  );

  loopStop = () => {
    clearTimeout(firstRunTimer);
    stop();
  };
}

export function stopPerformanceFeedbackLoop(): void {
  if (loopStop) {
    loopStop();
    loopStop = null;
    logger.info("[PerformanceFeedbackLoop] Stopped");
  }
}
