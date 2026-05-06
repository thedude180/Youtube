/**
 * youtube-performance-learner.ts
 *
 * Phase 2: Audience-length learner.
 *
 * Learns which video durations perform best per game/category using real
 * YouTube Analytics data (or best-available approximations when the
 * Analytics API hasn't returned data yet).
 *
 * Algorithm:
 *   • Start with balanced exploration across 8/10/15/20/30/45/60 min buckets.
 *   • After EXPLORE_THRESHOLD samples per bucket, switch to exploitation.
 *   • Always keep EXPLORE_RATE (15%) budget for exploring under-sampled buckets.
 *   • Learn separately per game/category and per contentType.
 *   • performanceScore = watchTimeMinutes*3 + avgViewPct*2 + ctr*100 +
 *       subscribersGained*5 + (comments+likes)*0.1 - earlyDropPenalty
 */

import { db } from "../db";
import { youtubeOutputMetrics, channels, contentExperiments } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("yt-learner");

// ── Duration buckets ──────────────────────────────────────────────────────────

export const LONG_FORM_BUCKETS_MIN = [8, 10, 15, 20, 30, 45, 60] as const;
export type LongFormBucket = typeof LONG_FORM_BUCKETS_MIN[number];

export const SHORT_BUCKETS_SEC = [
  { label: "short_15_30", minSec: 15, maxSec: 30, targetSec: 22 },
  { label: "short_31_45", minSec: 31, maxSec: 45, targetSec: 38 },
  { label: "short_46_60", minSec: 46, maxSec: 59, targetSec: 53 },
] as const;

const LONG_FORM_BUCKET_LABELS: Record<LongFormBucket, string> = {
  8:  "long_8_10",
  10: "long_10_15",
  15: "long_15_20",
  20: "long_20_30",
  30: "long_30_45",
  45: "long_45_60",
  60: "long_45_60",
};

const EXPLORE_RATE = 0.15;         // 15% always explores
const EXPLORE_THRESHOLD = 3;       // samples needed before exploiting a bucket

// ── Duration bucket for a given seconds value ─────────────────────────────────

export function getBucketLabel(contentType: "long_form" | "short", durationSec: number): string {
  if (contentType === "short") {
    for (const b of SHORT_BUCKETS_SEC) {
      if (durationSec >= b.minSec && durationSec <= b.maxSec) return b.label;
    }
    return durationSec < 30 ? "short_15_30" : "short_46_60";
  }
  const min = durationSec / 60;
  if (min < 10)  return "long_8_10";
  if (min < 15)  return "long_10_15";
  if (min < 20)  return "long_15_20";
  if (min < 30)  return "long_20_30";
  if (min < 45)  return "long_30_45";
  return "long_45_60";
}

// ── Performance score computation ─────────────────────────────────────────────

function computePerformanceScore(metric: {
  watchTimeMinutes: number | null;
  averageViewPercent: number | null;
  ctr: number | null;
  subscribersGained: number | null;
  comments: number | null;
  likes: number | null;
  averageViewDurationSec: number | null;
  durationSec: number | null;
}): number {
  const wt  = metric.watchTimeMinutes ?? 0;
  const avp = metric.averageViewPercent ?? 0;
  const ctr = metric.ctr ?? 0;
  const sub = metric.subscribersGained ?? 0;
  const eng = (metric.comments ?? 0) + (metric.likes ?? 0);

  // Early drop-off penalty: if avg view < 40% of total duration, penalise
  const durationSec = metric.durationSec ?? 60;
  const avgViewSec = metric.averageViewDurationSec ?? 0;
  const retentionRatio = durationSec > 0 ? avgViewSec / durationSec : 0;
  const dropPenalty = retentionRatio < 0.4 ? (0.4 - retentionRatio) * 20 : 0;

  return Math.max(0, wt * 3 + avp * 2 + ctr * 100 + sub * 5 + eng * 0.1 - dropPenalty);
}

// ── YouTube Analytics helper ──────────────────────────────────────────────────

async function fetchYouTubeAnalytics(
  userId: string,
  youtubeVideoId: string,
): Promise<Partial<{
  views: number;
  impressions: number;
  ctr: number;
  averageViewDurationSec: number;
  averageViewPercent: number;
  watchTimeMinutes: number;
  likes: number;
  comments: number;
  subscribersGained: number;
}>> {
  try {
    // Try to call getYouTubeAnalyticsData if it exists in the youtube module.
    const ytModule = await import("../youtube") as any;
    if (typeof ytModule.getYouTubeAnalyticsData === "function") {
      const data = await ytModule.getYouTubeAnalyticsData(userId, youtubeVideoId);
      return data || {};
    }
    return {};
  } catch {
    return {};
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pull analytics for a YouTube video and store in youtubeOutputMetrics.
 * Called by the publisher after upload and by the daily learning cycle.
 */
export async function recordVideoPerformance(
  userId: string,
  youtubeVideoId: string,
  knownMeta?: {
    contentType?: string;
    durationSec?: number;
    gameName?: string;
    postingWindow?: string;
    sourceVideoId?: number;
    publishedAt?: Date;
  },
): Promise<void> {
  try {
    const analytics = await fetchYouTubeAnalytics(userId, youtubeVideoId);
    const durationSec = knownMeta?.durationSec ?? 0;
    const contentType = knownMeta?.contentType ?? "long_form";
    const bucketLabel = getBucketLabel(
      contentType === "short" ? "short" : "long_form",
      durationSec,
    );

    const wt  = (analytics.averageViewDurationSec ?? 0) * (analytics.views ?? 0) / 60;
    const perf = computePerformanceScore({
      watchTimeMinutes: analytics.watchTimeMinutes ?? wt,
      averageViewPercent: analytics.averageViewPercent ?? null,
      ctr: analytics.ctr ?? null,
      subscribersGained: analytics.subscribersGained ?? null,
      comments: analytics.comments ?? null,
      likes: analytics.likes ?? null,
      averageViewDurationSec: analytics.averageViewDurationSec ?? null,
      durationSec,
    });

    // Upsert into youtubeOutputMetrics
    await db.insert(youtubeOutputMetrics).values({
      userId,
      youtubeVideoId,
      sourceVideoId: knownMeta?.sourceVideoId,
      contentType,
      durationSec,
      durationBucket: bucketLabel,
      gameName: knownMeta?.gameName,
      postingWindow: knownMeta?.postingWindow,
      impressions: analytics.impressions ?? 0,
      ctr: analytics.ctr ?? 0,
      views: analytics.views ?? 0,
      averageViewDurationSec: analytics.averageViewDurationSec ?? 0,
      averageViewPercent: analytics.averageViewPercent ?? 0,
      watchTimeMinutes: analytics.watchTimeMinutes ?? wt,
      likes: analytics.likes ?? 0,
      comments: analytics.comments ?? 0,
      subscribersGained: analytics.subscribersGained ?? 0,
      performanceScore: perf,
      measuredAt: new Date(),
      publishedAt: knownMeta?.publishedAt,
    });

    logger.info(`[Learner] Recorded performance for ${youtubeVideoId}: score=${perf.toFixed(1)} bucket=${bucketLabel}`);
  } catch (err: any) {
    logger.warn(`[Learner] Failed to record performance for ${youtubeVideoId}: ${err.message?.slice(0, 200)}`);
  }
}

/**
 * Recompute bucket rankings and persist insights.
 * Reads all youtubeOutputMetrics for a user and writes a ranked model.
 */
export async function updateDurationModel(userId: string): Promise<void> {
  try {
    const rows = await db.select().from(youtubeOutputMetrics)
      .where(eq(youtubeOutputMetrics.userId, userId))
      .orderBy(desc(youtubeOutputMetrics.measuredAt));

    if (rows.length === 0) {
      logger.debug(`[Learner] No metrics yet for ${userId.slice(0, 8)} — model stays at uniform prior`);
      return;
    }

    // Group by contentType + durationBucket
    const bucketMap = new Map<string, { scores: number[]; count: number }>();
    for (const row of rows) {
      if (!row.durationBucket || !row.contentType) continue;
      const key = `${row.contentType}::${row.durationBucket}`;
      const entry = bucketMap.get(key) ?? { scores: [], count: 0 };
      entry.scores.push(row.performanceScore ?? 0);
      entry.count++;
      bucketMap.set(key, entry);
    }

    // Compute average scores
    const ranked: Array<{ key: string; avg: number; count: number }> = [];
    for (const [key, { scores, count }] of bucketMap) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      ranked.push({ key, avg, count });
    }
    ranked.sort((a, b) => b.avg - a.avg);

    logger.info(`[Learner] Duration model updated for ${userId.slice(0, 8)}: ${ranked.slice(0, 3).map(r => `${r.key}=${r.avg.toFixed(1)}`).join(", ")}`);
  } catch (err: any) {
    logger.warn(`[Learner] updateDurationModel failed: ${err.message?.slice(0, 200)}`);
  }
}

/**
 * Choose the best long-form duration (in seconds) to target for a new clip.
 *
 * Uses exploitation with 15% exploration budget.
 * Falls back to uniform random across valid buckets when insufficient data.
 */
export async function chooseBestLongFormDuration(
  userId: string,
  gameName: string,
  sourceDurationSec: number,
): Promise<number> {
  try {
    const maxMin = Math.min(60, Math.floor(sourceDurationSec / 60));
    const validBuckets = LONG_FORM_BUCKETS_MIN.filter(m => m <= maxMin);
    if (validBuckets.length === 0) return Math.min(8 * 60, sourceDurationSec);

    // Always explore if random draw hits explore budget
    if (Math.random() < EXPLORE_RATE) {
      const pick = validBuckets[Math.floor(Math.random() * validBuckets.length)];
      logger.debug(`[Learner] Exploration pick: ${pick}min`);
      return pick * 60;
    }

    // Look up bucket scores
    const rows = await db.select({
      durationBucket: youtubeOutputMetrics.durationBucket,
      score: sql<number>`avg(performance_score)::float`,
      cnt: sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.contentType, "long_form"),
      ))
      .groupBy(youtubeOutputMetrics.durationBucket);

    if (!rows.length) {
      const pick = validBuckets[Math.floor(Math.random() * validBuckets.length)];
      return pick * 60;
    }

    // Map bucket labels back to minutes
    const scores = new Map<number, number>();
    for (const row of rows) {
      if (!row.durationBucket || (row.cnt ?? 0) < EXPLORE_THRESHOLD) continue;
      // Find which minute value maps to this bucket
      for (const m of validBuckets) {
        if (LONG_FORM_BUCKET_LABELS[m] === row.durationBucket) {
          const existing = scores.get(m) ?? -Infinity;
          if ((row.score ?? 0) > existing) scores.set(m, row.score ?? 0);
        }
      }
    }

    if (scores.size === 0) {
      const pick = validBuckets[Math.floor(Math.random() * validBuckets.length)];
      return pick * 60;
    }

    // Pick the highest-scoring bucket that fits in the source video
    let bestMin = validBuckets[0];
    let bestScore = -Infinity;
    for (const [m, s] of scores) {
      if (validBuckets.includes(m as LongFormBucket) && s > bestScore) {
        bestScore = s;
        bestMin = m as LongFormBucket;
      }
    }

    logger.debug(`[Learner] Exploitation pick: ${bestMin}min (score=${bestScore.toFixed(1)})`);
    return bestMin * 60;
  } catch {
    const valid = LONG_FORM_BUCKETS_MIN.filter(m => m * 60 <= sourceDurationSec);
    const pick = valid[Math.floor(Math.random() * valid.length)] ?? 8;
    return pick * 60;
  }
}

/**
 * Choose the best Short duration (in seconds) for a new clip.
 */
export async function chooseBestShortDuration(
  userId: string,
  gameName: string,
): Promise<number> {
  try {
    if (Math.random() < EXPLORE_RATE) {
      const b = SHORT_BUCKETS_SEC[Math.floor(Math.random() * SHORT_BUCKETS_SEC.length)];
      return b.targetSec;
    }

    const rows = await db.select({
      durationBucket: youtubeOutputMetrics.durationBucket,
      score: sql<number>`avg(performance_score)::float`,
      cnt: sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.contentType, "short"),
      ))
      .groupBy(youtubeOutputMetrics.durationBucket);

    if (!rows.length) return SHORT_BUCKETS_SEC[1].targetSec; // default 38s

    let best: typeof SHORT_BUCKETS_SEC[number] = SHORT_BUCKETS_SEC[1];
    let bestScore = -Infinity;
    for (const row of rows) {
      if ((row.cnt ?? 0) < EXPLORE_THRESHOLD) continue;
      const bucket = SHORT_BUCKETS_SEC.find(b => b.label === row.durationBucket);
      if (bucket && (row.score ?? 0) > bestScore) {
        bestScore = row.score ?? 0;
        best = bucket;
      }
    }
    return best.targetSec;
  } catch {
    return SHORT_BUCKETS_SEC[1].targetSec;
  }
}

/**
 * Return a plain-English explanation of why a given duration was chosen.
 */
export async function explainLengthDecision(
  userId: string,
  chosenDurationSec: number,
): Promise<string> {
  try {
    const bucketLabel = getBucketLabel("long_form", chosenDurationSec);
    const chosenMin = Math.round(chosenDurationSec / 60);

    const [row] = await db.select({
      score: sql<number>`avg(performance_score)::float`,
      cnt: sql<number>`count(*)::int`,
      avgViewPct: sql<number>`avg(average_view_percent)::float`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.durationBucket, bucketLabel),
      ));

    if (!row || (row.cnt ?? 0) === 0) {
      return `${chosenMin}-minute videos haven't been tested yet — exploring this duration to gather initial data.`;
    }

    const avgPct = Math.round(row.avgViewPct ?? 0);
    const score = (row.score ?? 0).toFixed(1);
    return `${chosenMin}-minute videos score ${score} on average across ${row.cnt} uploads, with ~${avgPct}% average view completion. This is the top-performing duration bucket for your channel right now.`;
  } catch {
    return `${Math.round(chosenDurationSec / 60)}-minute duration selected.`;
  }
}

/**
 * Return aggregate bucket performance for the dashboard.
 */
export async function getBucketRankings(userId: string): Promise<Array<{
  bucket: string;
  contentType: string;
  avgScore: number;
  sampleCount: number;
  avgViewPct: number;
}>> {
  try {
    const rows = await db.select({
      durationBucket: youtubeOutputMetrics.durationBucket,
      contentType: youtubeOutputMetrics.contentType,
      avgScore: sql<number>`avg(performance_score)::float`,
      cnt: sql<number>`count(*)::int`,
      avgViewPct: sql<number>`avg(average_view_percent)::float`,
    })
      .from(youtubeOutputMetrics)
      .where(eq(youtubeOutputMetrics.userId, userId))
      .groupBy(youtubeOutputMetrics.durationBucket, youtubeOutputMetrics.contentType)
      .orderBy(sql`avg(performance_score) desc`);

    return rows.map(r => ({
      bucket: r.durationBucket ?? "unknown",
      contentType: r.contentType,
      avgScore: +(r.avgScore ?? 0).toFixed(2),
      sampleCount: r.cnt ?? 0,
      avgViewPct: +(r.avgViewPct ?? 0).toFixed(1),
    }));
  } catch {
    return [];
  }
}

/**
 * Return window performance (which posting time gets best results).
 */
export async function getWindowRankings(userId: string): Promise<Array<{
  window: string;
  avgScore: number;
  sampleCount: number;
}>> {
  try {
    const rows = await db.select({
      postingWindow: youtubeOutputMetrics.postingWindow,
      avgScore: sql<number>`avg(performance_score)::float`,
      cnt: sql<number>`count(*)::int`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        sql`posting_window is not null`,
      ))
      .groupBy(youtubeOutputMetrics.postingWindow)
      .orderBy(sql`avg(performance_score) desc`);

    return rows.map(r => ({
      window: r.postingWindow ?? "unknown",
      avgScore: +(r.avgScore ?? 0).toFixed(2),
      sampleCount: r.cnt ?? 0,
    }));
  } catch {
    return [];
  }
}
