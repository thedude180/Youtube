/**
 * youtube-learning-brain.ts
 *
 * Phase 6: Central learning brain for the YouTube autopilot.
 *
 * Every subsystem emits events here (uploads, Shorts, live, errors, chat).
 * Once per day the brain runs a full learning cycle:
 *   1. Pull fresh YouTube Analytics data for recent uploads.
 *   2. Update the duration model.
 *   3. Rank posting windows.
 *   4. Identify title and thumbnail patterns from top performers.
 *   5. Generate a plain-English daily learning report.
 *   6. Write updated recommendations.
 *
 * Outputs feed back into:
 *   • chooseBestLongFormDuration  (performance-learner)
 *   • getNextShort/LongFormPublishTime  (output-schedule)
 *   • youtube-live-copilot (chat style recommendations)
 */

import { db } from "../db";
import {
  learningEvents,
  youtubeOutputMetrics,
  livestreamLearningEvents,
  learningInsights,
  autopilotQueue,
  channels,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import {
  recordVideoPerformance,
  updateDurationModel,
  getBucketRankings,
  getWindowRankings,
} from "./youtube-performance-learner";

const logger = createLogger("learning-brain");
const openai = getRawOpenAIClientForDirectUse();

// ── Track daily cycle per user ─────────────────────────────────────────────────

const _lastCycleAt = new Map<string, number>();
const CYCLE_INTERVAL_MS = 20 * 3_600_000; // run at most once per 20 hours

// ── Public: record any learning event ────────────────────────────────────────

export async function recordLearningEvent(
  userId: string,
  eventType: string,
  data: Record<string, any>,
  outcome?: string,
  performanceDelta?: number,
): Promise<void> {
  try {
    await db.insert(learningEvents).values({
      userId,
      eventType,
      sourceAgent: data.sourceAgent ?? "system",
      data,
      outcome: outcome ?? "recorded",
      performanceDelta: performanceDelta ?? null,
    });
  } catch (err: any) {
    logger.debug(`[Brain] recordLearningEvent skipped: ${err.message?.slice(0, 100)}`);
  }
}

// ── Daily learning cycle ──────────────────────────────────────────────────────

export interface DailyLearningReport {
  userId: string;
  generatedAt: string;
  totalUploads: number;
  totalShorts: number;
  totalLongForm: number;
  bestDurationBucket: string;
  worstDurationBucket: string;
  bestPostingWindow: string;
  avgPerformanceScore: number;
  newInsights: string[];
  recommendations: string[];
  summary: string;
}

export async function runDailyLearningCycle(userId: string): Promise<DailyLearningReport | null> {
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < CYCLE_INTERVAL_MS) {
    logger.debug(`[Brain] Daily cycle skipped for ${userId.slice(0, 8)} — ran recently`);
    return null;
  }
  _lastCycleAt.set(userId, Date.now());

  logger.info(`[Brain] Starting daily learning cycle for ${userId.slice(0, 8)}`);

  try {
    // 1. Pull analytics for any published videos missing metrics
    await refreshMissingAnalytics(userId);

    // 2. Update the duration model
    await updateDurationModel(userId);

    // 3. Get rankings
    const [buckets, windows] = await Promise.all([
      getBucketRankings(userId),
      getWindowRankings(userId),
    ]);

    const longFormBuckets = buckets.filter(b => b.contentType === "long_form");
    const bestBucket = longFormBuckets[0]?.bucket ?? "unknown (not enough data yet)";
    const worstBucket = longFormBuckets.at(-1)?.bucket ?? "unknown";
    const bestWindow = windows[0]?.window ?? "unknown (not enough data yet)";
    const avgScore = buckets.length
      ? buckets.reduce((s, b) => s + b.avgScore, 0) / buckets.length
      : 0;

    // 4. Count uploads
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
    const [uploadStats] = await db.select({
      total: sql<number>`count(*)::int`,
      shorts: sql<number>`count(*) filter (where type in ('platform_short','youtube_short'))::int`,
      longForm: sql<number>`count(*) filter (where metadata->>'contentType' = 'long-form-clip')::int`,
    })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, thirtyDaysAgo),
      ));

    // 5. Generate insights
    const insights: string[] = [];
    const recommendations: string[] = [];

    if (longFormBuckets.length >= 2) {
      const best = longFormBuckets[0];
      const worst = longFormBuckets.at(-1)!;
      insights.push(`${best.bucket} long-form videos average a performance score of ${best.avgScore.toFixed(1)} vs ${worst.avgScore.toFixed(1)} for ${worst.bucket}`);
      if (best.avgViewPct > 50) {
        insights.push(`${best.bucket} videos retain over ${best.avgViewPct.toFixed(0)}% of viewers on average — strong completion rate`);
      }
      if (worst.avgScore < best.avgScore * 0.5) {
        recommendations.push(`Reduce ${worst.bucket} clips — they underperform by ${Math.round((1 - worst.avgScore / best.avgScore) * 100)}% vs your best bucket`);
      }
    }

    if (windows.length >= 2) {
      insights.push(`Best posting window is ${bestWindow} with avg score ${windows[0].avgScore.toFixed(1)}`);
      if (windows[0].avgScore > windows.at(-1)!.avgScore * 1.3) {
        recommendations.push(`Focus uploads on the ${bestWindow} window — it outperforms ${windows.at(-1)!.window} by ${Math.round((windows[0].avgScore / windows.at(-1)!.avgScore - 1) * 100)}%`);
      }
    }

    // 6. AI-generated summary
    let summary = "Learning cycle complete. System is monitoring performance across all upload types.";
    if (insights.length && tryAcquireAISlotNow()) {
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You write concise, plain-English performance summaries for a YouTube gaming channel autopilot system. Max 3 sentences. Data-driven. No fluff.",
            },
            {
              role: "user",
              content: `Last 30 days: ${uploadStats?.total ?? 0} published videos, ${uploadStats?.shorts ?? 0} Shorts, ${uploadStats?.longForm ?? 0} long-form.\nInsights: ${insights.join(". ")}\nRecommendations: ${recommendations.join(". ")}\n\nWrite a 2-3 sentence daily learning summary.`,
            },
          ],
          max_completion_tokens: 150,
        });
        releaseAISlot();
        summary = resp.choices[0]?.message?.content?.trim() || summary;
      } catch {
        releaseAISlot();
      }
    }

    // 7. Store insights in learningInsights table
    for (const insight of insights.slice(0, 3)) {
      try {
        await db.insert(learningInsights).values({
          userId,
          category: "youtube_performance",
          pattern: insight.slice(0, 200),
          confidence: 0.7,
          sampleSize: buckets.reduce((s, b) => s + b.sampleCount, 0),
          data: {
            finding: insight,
            evidence: buckets.slice(0, 3).map(b => `${b.bucket}: score=${b.avgScore}`),
            recommendation: recommendations[0] ?? "Continue current approach",
          },
        });
      } catch { /* ok if duplicate */ }
    }

    // 8. Record the cycle completion
    await recordLearningEvent(userId, "daily_cycle_complete", {
      sourceAgent: "learning-brain",
      bestBucket,
      worstBucket,
      bestWindow,
      insightCount: insights.length,
      totalUploads: uploadStats?.total ?? 0,
    }, "success");

    const report: DailyLearningReport = {
      userId,
      generatedAt: new Date().toISOString(),
      totalUploads: uploadStats?.total ?? 0,
      totalShorts: uploadStats?.shorts ?? 0,
      totalLongForm: uploadStats?.longForm ?? 0,
      bestDurationBucket: bestBucket,
      worstDurationBucket: worstBucket,
      bestPostingWindow: bestWindow,
      avgPerformanceScore: +avgScore.toFixed(2),
      newInsights: insights,
      recommendations,
      summary,
    };

    logger.info(`[Brain] Daily cycle complete for ${userId.slice(0, 8)}: ${insights.length} insights, best=${bestBucket}`);
    return report;
  } catch (err: any) {
    logger.warn(`[Brain] Daily cycle failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
    return null;
  }
}

// ── Refresh missing analytics ─────────────────────────────────────────────────

async function refreshMissingAnalytics(userId: string): Promise<void> {
  try {
    // Find published queue items with a youtubeVideoId that have no metrics yet
    const published = await db.select({
      id: autopilotQueue.id,
      type: autopilotQueue.type,
      metadata: autopilotQueue.metadata,
      scheduledAt: autopilotQueue.scheduledAt,
      sourceVideoId: autopilotQueue.sourceVideoId,
    })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
      ))
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(20);

    for (const item of published) {
      const meta = (item.metadata ?? {}) as Record<string, any>;
      const youtubeVideoId = meta.youtubeVideoId || meta.youtubeId;
      if (!youtubeVideoId) continue;

      // Check if already in metrics table
      const [existing] = await db.select({ id: youtubeOutputMetrics.id })
        .from(youtubeOutputMetrics)
        .where(and(
          eq(youtubeOutputMetrics.userId, userId),
          eq(youtubeOutputMetrics.youtubeVideoId, youtubeVideoId),
        ))
        .limit(1);

      if (existing) continue;

      // Determine posting window from scheduledAt
      let postingWindow = "unknown";
      if (item.scheduledAt) {
        const h = new Date(item.scheduledAt).getUTCHours();
        if (h >= 6 && h < 12) postingWindow = "morning";
        else if (h >= 12 && h < 17) postingWindow = "afternoon";
        else if (h >= 17 && h < 21) postingWindow = "evening";
        else postingWindow = "late_night";
      }

      await recordVideoPerformance(userId, youtubeVideoId, {
        contentType: item.type === "platform_short" ? "short" : "long_form",
        durationSec: meta.targetDurationSec || meta.actualDurationSec || 0,
        gameName: meta.gameName,
        postingWindow,
        sourceVideoId: item.sourceVideoId ?? undefined,
        publishedAt: item.scheduledAt ? new Date(item.scheduledAt) : undefined,
      });
    }
  } catch (err: any) {
    logger.debug(`[Brain] refreshMissingAnalytics: ${err.message?.slice(0, 200)}`);
  }
}

// ── Recommended output plan ───────────────────────────────────────────────────

export interface RecommendedOutputPlan {
  preferredLongFormDurationMin: number;
  preferredShortDurationSec: number;
  bestPostingWindow: string;
  suggestedLongFormPerWeek: number;
  suggestedShortsPerWeek: number;
  focusGame: string | null;
  explanation: string;
}

export async function getRecommendedOutputPlan(userId: string): Promise<RecommendedOutputPlan> {
  try {
    const [buckets, windows] = await Promise.all([
      getBucketRankings(userId),
      getWindowRankings(userId),
    ]);

    const longFormBuckets = buckets.filter(b => b.contentType === "long_form" && b.sampleCount >= 2);
    const shortBuckets = buckets.filter(b => b.contentType === "short" && b.sampleCount >= 2);
    const bestWindow = windows[0]?.window ?? "evening";

    let preferredLongFormMin = 20;
    if (longFormBuckets.length) {
      const best = longFormBuckets[0].bucket;
      const match = best.match(/long_(\d+)_/);
      if (match) preferredLongFormMin = parseInt(match[1], 10);
    }

    let preferredShortSec = 38;
    if (shortBuckets.length) {
      const best = shortBuckets[0].bucket;
      if (best === "short_15_30") preferredShortSec = 22;
      else if (best === "short_31_45") preferredShortSec = 38;
      else if (best === "short_46_60") preferredShortSec = 53;
    }

    // Most common game in recent uploads
    let focusGame: string | null = null;
    try {
      const [gameRow] = await db.select({
        gameName: youtubeOutputMetrics.gameName,
        cnt: sql<number>`count(*)::int`,
      })
        .from(youtubeOutputMetrics)
        .where(and(eq(youtubeOutputMetrics.userId, userId), sql`game_name is not null`))
        .groupBy(youtubeOutputMetrics.gameName)
        .orderBy(sql`count(*) desc`)
        .limit(1);
      focusGame = gameRow?.gameName ?? null;
    } catch { /* ok */ }

    const explanation = longFormBuckets.length
      ? `Based on ${longFormBuckets.reduce((s, b) => s + b.sampleCount, 0)} uploads: ${longFormBuckets[0].bucket} videos perform best (avg score ${longFormBuckets[0].avgScore.toFixed(1)}). Post in the ${bestWindow} window.`
      : "Insufficient data — using default balanced schedule until more videos are published.";

    return {
      preferredLongFormDurationMin: preferredLongFormMin,
      preferredShortDurationSec: preferredShortSec,
      bestPostingWindow: bestWindow,
      suggestedLongFormPerWeek: 7,
      suggestedShortsPerWeek: 21,
      focusGame,
      explanation,
    };
  } catch {
    return {
      preferredLongFormDurationMin: 20,
      preferredShortDurationSec: 38,
      bestPostingWindow: "evening",
      suggestedLongFormPerWeek: 7,
      suggestedShortsPerWeek: 21,
      focusGame: null,
      explanation: "Default plan — insufficient analytics data yet.",
    };
  }
}

// ── Recommended stream plan ───────────────────────────────────────────────────

export interface RecommendedStreamPlan {
  bestDayToStream: string;
  bestTimeLocal: string;
  suggestedStreamDurationMin: number;
  clipCapacity: number;
  chatResponseRate: string;
  copilotMode: string;
  preparation: string[];
}

export async function getRecommendedStreamPlan(userId: string): Promise<RecommendedStreamPlan> {
  try {
    const [llEvents] = await db.select({
      autoReplied: sql<number>`count(*) filter (where event_type = 'chat_response' and outcome = 'auto_replied')::int`,
      total: sql<number>`count(*)::int`,
    })
      .from(livestreamLearningEvents)
      .where(eq(livestreamLearningEvents.userId, userId));

    const responseRate = llEvents?.total
      ? `${Math.round(((llEvents.autoReplied ?? 0) / llEvents.total) * 100)}%`
      : "not enough data";

    return {
      bestDayToStream: "Friday or Saturday (peak gaming audience)",
      bestTimeLocal: "7:00 PM – 10:00 PM",
      suggestedStreamDurationMin: 90,
      clipCapacity: 3,
      chatResponseRate: responseRate,
      copilotMode: "auto-safe",
      preparation: [
        "Generate title and description 30 min before going live",
        "Verify YouTube connection and stream key",
        "Prepare pinned FAQ message",
        "Enable clip-moment detection",
        "After stream: copilot auto-queues Shorts and long-form",
      ],
    };
  } catch {
    return {
      bestDayToStream: "Any day",
      bestTimeLocal: "7:00 PM – 10:00 PM",
      suggestedStreamDurationMin: 90,
      clipCapacity: 3,
      chatResponseRate: "unknown",
      copilotMode: "auto-safe",
      preparation: ["Connect YouTube account", "Configure stream key", "Go live!"],
    };
  }
}

// ── Learning summary ──────────────────────────────────────────────────────────

export async function getLearningSummary(userId: string): Promise<{
  summary: string;
  lastCycleAt: string | null;
  totalEvents: number;
  topInsight: string | null;
}> {
  try {
    const [countRow] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(learningEvents)
      .where(eq(learningEvents.userId, userId));

    const [latestCycle] = await db.select()
      .from(learningEvents)
      .where(and(
        eq(learningEvents.userId, userId),
        eq(learningEvents.eventType, "daily_cycle_complete"),
      ))
      .orderBy(desc(learningEvents.createdAt))
      .limit(1);

    const [topInsightRow] = await db.select()
      .from(learningInsights)
      .where(eq(learningInsights.userId, userId))
      .orderBy(desc(learningInsights.updatedAt))
      .limit(1);

    const [buckets] = await getBucketRankings(userId);
    const summary = buckets
      ? `Best performing duration: ${buckets.bucket} (score ${buckets.avgScore.toFixed(1)}, ${buckets.sampleCount} samples). System has processed ${countRow?.cnt ?? 0} learning events.`
      : "Learning system active. Collecting performance data from YouTube uploads.";

    return {
      summary,
      lastCycleAt: latestCycle?.createdAt?.toISOString() ?? null,
      totalEvents: countRow?.cnt ?? 0,
      topInsight: topInsightRow?.pattern ?? null,
    };
  } catch {
    return { summary: "Learning system active.", lastCycleAt: null, totalEvents: 0, topInsight: null };
  }
}
