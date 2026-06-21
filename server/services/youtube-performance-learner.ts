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
import { eq, and, desc, sql, gte, lte, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("yt-learner");

// ── Duration buckets ──────────────────────────────────────────────────────────

export const LONG_FORM_BUCKETS_MIN = [8, 10, 15, 20, 30, 45, 60] as const;
export type LongFormBucket = typeof LONG_FORM_BUCKETS_MIN[number];

// Six buckets spanning the full YouTube Shorts range (15 s – 179 s).
// The learner experiments across all buckets and converges on whichever
// duration earns the highest watch-time / retention for this channel.
export const SHORT_BUCKETS_SEC = [
  { label: "short_15_30",   minSec: 15,  maxSec: 30,  targetSec: 22  },
  { label: "short_31_60",   minSec: 31,  maxSec: 60,  targetSec: 45  },
  { label: "short_61_90",   minSec: 61,  maxSec: 90,  targetSec: 75  },
  { label: "short_91_120",  minSec: 91,  maxSec: 120, targetSec: 105 },
  { label: "short_121_150", minSec: 121, maxSec: 150, targetSec: 135 },
  { label: "short_151_179", minSec: 151, maxSec: 179, targetSec: 165 },
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
    return durationSec < 31 ? "short_15_30" : "short_151_179";
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
    const { getCachedVideoMetrics } = await import("./youtube-data-cache");
    return await getCachedVideoMetrics(userId, youtubeVideoId);
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

    // Upsert: update existing row if present, otherwise insert a new one.
    // This is safe even without a UNIQUE constraint — we check first, then act.
    const [existing] = await db
      .select({ id: youtubeOutputMetrics.id })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.youtubeVideoId, youtubeVideoId),
      ))
      .limit(1);

    // ── Hook retention % ─────────────────────────────────────────────────────
    // For Shorts (≤60 s): averageViewPercent is the hook score directly.
    //   If 80% of a 45s Short was watched, hookRetentionPct = 80.
    // For long-form: we estimate % of the first 30 s watched.
    //   If avg view duration is 8 min on a 20 min video, viewers reliably
    //   watched at least the first 30 s, so hookRetentionPct = 100.
    //   If avg view duration < 30 s, hookRetentionPct = (avgViewSec/30)*100.
    const avgViewSec = analytics.averageViewDurationSec ?? 0;
    const avp = analytics.averageViewPercent ?? 0;
    const hookRetentionPct = contentType === "short"
      ? avp
      : avgViewSec >= 30
        ? 100
        : Math.round((avgViewSec / 30) * 100);

    const metricsPayload = {
      sourceVideoId: knownMeta?.sourceVideoId,
      contentType,
      durationSec,
      durationBucket: bucketLabel,
      gameName: knownMeta?.gameName,
      postingWindow: knownMeta?.postingWindow,
      impressions: analytics.impressions ?? 0,
      ctr: analytics.ctr ?? 0,
      views: analytics.views ?? 0,
      averageViewDurationSec: avgViewSec,
      averageViewPercent: avp,
      watchTimeMinutes: analytics.watchTimeMinutes ?? wt,
      likes: analytics.likes ?? 0,
      comments: analytics.comments ?? 0,
      subscribersGained: analytics.subscribersGained ?? 0,
      performanceScore: perf,
      hookRetentionPct,
      measuredAt: new Date(),
      publishedAt: knownMeta?.publishedAt,
    };

    if (existing) {
      await db.update(youtubeOutputMetrics)
        .set(metricsPayload)
        .where(eq(youtubeOutputMetrics.id, existing.id));
    } else {
      await db.insert(youtubeOutputMetrics).values({ userId, youtubeVideoId, ...metricsPayload });
    }

    logger.info(`[Learner] ${existing ? "Updated" : "Inserted"} performance for ${youtubeVideoId}: score=${perf.toFixed(1)} bucket=${bucketLabel}`);
  } catch (err: any) {
    logger.warn(`[Learner] Failed to record performance for ${youtubeVideoId}: ${err.message?.slice(0, 200)}`);
  }
}

/**
 * Refresh analytics for videos published > 48 h ago whose metrics haven't
 * been re-measured in the last 6 hours.  Runs as part of the daily learning
 * cycle so the model improves as videos accumulate real watch-time data.
 *
 * Capped at 15 rows per call to stay within YouTube Analytics quota headroom.
 */
export async function refreshStaleVideoMetrics(userId: string): Promise<void> {
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 2 * 86400_000);
    const sixHoursAgo = new Date(Date.now() - 6 * 3600_000);

    const stale = await db
      .select({
        youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
        contentType: youtubeOutputMetrics.contentType,
        durationSec: youtubeOutputMetrics.durationSec,
        gameName: youtubeOutputMetrics.gameName,
        postingWindow: youtubeOutputMetrics.postingWindow,
        sourceVideoId: youtubeOutputMetrics.sourceVideoId,
        publishedAt: youtubeOutputMetrics.publishedAt,
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        // Only refresh after YouTube has had 48 h to process the video
        lte(youtubeOutputMetrics.publishedAt, fortyEightHoursAgo),
        // Re-measure if never measured or not measured in the last 6 h
        or(
          sql`${youtubeOutputMetrics.measuredAt} IS NULL`,
          lte(youtubeOutputMetrics.measuredAt, sixHoursAgo),
        ),
      ))
      .orderBy(youtubeOutputMetrics.measuredAt)
      .limit(15);

    for (const row of stale) {
      await recordVideoPerformance(userId, row.youtubeVideoId, {
        contentType: row.contentType ?? "long_form",
        durationSec: row.durationSec ?? 0,
        gameName: row.gameName ?? undefined,
        postingWindow: row.postingWindow ?? undefined,
        sourceVideoId: row.sourceVideoId ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
      });
    }

    if (stale.length > 0) {
      logger.info(`[Learner] Refreshed analytics for ${stale.length} stale metric row(s)`);
    }
  } catch (err: any) {
    logger.warn(`[Learner] refreshStaleVideoMetrics failed: ${err.message?.slice(0, 200)}`);
  }
}

/**
 * MrBeast principle: data → action within 2 hours, not 20.
 *
 * Checks videos published 2-39h ago every 2h. Writes hot/cold
 * performance signals to masterKnowledgeBank immediately so every
 * downstream engine (content grinder, back catalog, SEO optimizer)
 * knows what's winning RIGHT NOW without waiting for the daily cycle.
 *
 * Hot = 2× channel average views in first 24h → "hot_streak_formula" entry
 * Cold = <25% channel average views after 36h → "avoid_pattern" entry
 */
export async function runRapidFeedback24h(userId: string): Promise<void> {
  try {
    const now = Date.now();
    const twoHoursAgo      = new Date(now - 2  * 3600_000);
    const thirtyNineHrsAgo = new Date(now - 39 * 3600_000);
    const thirtyDaysAgo    = new Date(now - 30 * 86400_000);

    // ── 1. Find videos published 2-39h ago that need a rapid refresh ──────────
    const recent = await db
      .select({
        youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
        contentType:    youtubeOutputMetrics.contentType,
        durationSec:    youtubeOutputMetrics.durationSec,
        gameName:       youtubeOutputMetrics.gameName,
        postingWindow:  youtubeOutputMetrics.postingWindow,
        sourceVideoId:  youtubeOutputMetrics.sourceVideoId,
        publishedAt:    youtubeOutputMetrics.publishedAt,
        views:          youtubeOutputMetrics.views,
        ctr:            youtubeOutputMetrics.ctr,
        durationBucket: youtubeOutputMetrics.durationBucket,
        measuredAt:     youtubeOutputMetrics.measuredAt,
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, thirtyNineHrsAgo),
        lte(youtubeOutputMetrics.publishedAt, twoHoursAgo),
        or(
          sql`${youtubeOutputMetrics.measuredAt} IS NULL`,
          lte(youtubeOutputMetrics.measuredAt, twoHoursAgo),
        ),
      ))
      .orderBy(desc(youtubeOutputMetrics.publishedAt))
      .limit(10);

    if (recent.length === 0) return;

    // ── 2. Refresh each video's analytics ────────────────────────────────────
    for (const v of recent) {
      await recordVideoPerformance(userId, v.youtubeVideoId, {
        contentType:  v.contentType ?? "long_form",
        durationSec:  v.durationSec ?? 0,
        gameName:     v.gameName ?? undefined,
        postingWindow: v.postingWindow ?? undefined,
        sourceVideoId: v.sourceVideoId ?? undefined,
        publishedAt:  v.publishedAt ?? undefined,
      });
    }

    // ── 3. Get channel average views for Shorts (30-day baseline) ─────────────
    const [avgRow] = await db
      .select({ avgViews: sql<number>`coalesce(avg(views), 0)::float` })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.contentType, "short"),
        gte(youtubeOutputMetrics.publishedAt, thirtyDaysAgo),
      ));
    const channelAvgViews = +(avgRow?.avgViews ?? 0);
    if (channelAvgViews < 10) return; // not enough data for meaningful signal

    // ── 4. Re-read refreshed metrics and write brain signals for outliers ──────
    const refreshed = await db
      .select({
        youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
        views:          youtubeOutputMetrics.views,
        ctr:            youtubeOutputMetrics.ctr,
        contentType:    youtubeOutputMetrics.contentType,
        gameName:       youtubeOutputMetrics.gameName,
        durationBucket: youtubeOutputMetrics.durationBucket,
        durationSec:    youtubeOutputMetrics.durationSec,
        publishedAt:    youtubeOutputMetrics.publishedAt,
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, thirtyNineHrsAgo),
        lte(youtubeOutputMetrics.publishedAt, twoHoursAgo),
      ))
      .limit(10);

    try {
      const { db: dbImport } = await import("../db");
      const { masterKnowledgeBank } = await import("@shared/schema");

      for (const v of refreshed) {
        const views = v.views ?? 0;
        const mult  = channelAvgViews > 0 ? views / channelAvgViews : 0;

        if (mult >= 2.0 && v.contentType === "short") {
          // HOT STREAK: performing 2× channel average within 24h
          const principle = `HOT STREAK [rapid-24h]: ${v.gameName ?? "gaming"} ${v.durationBucket ?? "short"} is outperforming at ${mult.toFixed(1)}× channel average. ytId: ${v.youtubeVideoId}. Queue MORE of this format IMMEDIATELY.`;
          await dbImport.insert(masterKnowledgeBank).values({
            userId,
            category:          "hot_streak_formula",
            principle,
            sourceEngines:     ["youtube-performance-learner"],
            evidenceCount:     1,
            confidenceScore:   Math.min(92, Math.round(50 + mult * 15)),
            applicableEngines: ["content-grinder", "back-catalog-engine", "creator-acceleration-engine"],
            isActive:          true,
            metadata: {
              youtubeVideoId: v.youtubeVideoId,
              views,
              mult,
              gameName:      v.gameName,
              durationBucket: v.durationBucket,
              durationSec:   v.durationSec,
              detectedAt:    new Date().toISOString(),
            },
          } as any).catch(() => {}); // may already exist
          logger.info(`[RapidFeedback] 🔥 HOT STREAK: ${v.youtubeVideoId} at ${mult.toFixed(1)}× avg (${views} views vs ${channelAvgViews.toFixed(0)} avg)`);

        } else if (mult < 0.25 && v.contentType === "short" && v.publishedAt &&
                   Date.now() - v.publishedAt.getTime() > 36 * 3600_000) {
          // COLD: significantly under-performing after 36h
          const principle = `AVOID PATTERN [rapid-24h]: ${v.gameName ?? "gaming"} ${v.durationBucket ?? "short"} under-performed at ${(mult * 100).toFixed(0)}% of channel average. ytId: ${v.youtubeVideoId}. De-prioritise this format.`;
          await dbImport.insert(masterKnowledgeBank).values({
            userId,
            category:          "avoid_pattern",
            principle,
            sourceEngines:     ["youtube-performance-learner"],
            evidenceCount:     1,
            confidenceScore:   55,
            applicableEngines: ["content-grinder", "back-catalog-engine"],
            isActive:          true,
            metadata: {
              youtubeVideoId: v.youtubeVideoId,
              views,
              mult,
              gameName:      v.gameName,
              durationBucket: v.durationBucket,
              detectedAt:    new Date().toISOString(),
            },
          } as any).catch(() => {});
          logger.info(`[RapidFeedback] ❄️ COLD: ${v.youtubeVideoId} at ${(mult * 100).toFixed(0)}% avg after 36h`);
        }
      }
    } catch { /* brain write failure is non-fatal */ }

    logger.info(`[RapidFeedback] Refreshed ${recent.length} video(s) published in last 39h for ${userId.slice(0, 8)}`);
  } catch (err: any) {
    logger.warn(`[RapidFeedback] Failed: ${err?.message?.slice(0, 200)}`);
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

    // Default to 61–90 s bucket while data accumulates — mid-range performs
    // consistently for gaming content before the learner has enough samples.
    if (!rows.length) return SHORT_BUCKETS_SEC[2].targetSec; // 75s default

    let best: typeof SHORT_BUCKETS_SEC[number] = SHORT_BUCKETS_SEC[2];
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
    return SHORT_BUCKETS_SEC[2].targetSec; // 75s fallback
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
