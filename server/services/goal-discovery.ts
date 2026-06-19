/**
 * Goal Discovery Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Questions whether the current goals are optimal and reformulates them when
 * evidence is strong enough. The goal planner uses hardcoded defaults (3 Shorts/
 * day, 1 long-form/day) — but those defaults are only correct if they maximise
 * channel growth per unit of quota spent. Goal Discovery checks this assumption
 * every 30 days.
 *
 * The engine asks:
 *   • Quota units per published Short vs per long-form — what's the ROI?
 *   • Watch time per Short vs per long-form — which drives subscriber growth?
 *   • If long-form drives 4× more watch time per quota unit, should we do 2/day?
 *   • Are we bottlenecked by quota, AI slots, or vault downloads?
 *
 * When the evidence crosses a confidence threshold, it writes updated goals to
 * service_state("goal_planner", "goals:{userId}") — the same key the goal
 * planner reads. It also writes a rationale to masterKnowledgeBank.
 *
 * Safety: never reduces below minimum viable output (1 Short/day, 1 LF/week).
 * Always stays within quota budget (≤8000 units/day).
 */

import { db } from "../db";
import { autopilotQueue, shadowVideoAnalytics, masterKnowledgeBank } from "@shared/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("goal-discovery");

const SERVICE_KEY    = "goal-discovery";
const RUN_INTERVAL   = 30 * 24 * 60 * 60_000; // 30 days

// ── Safety guardrails ────────────────────────────────────────────────────────
const MIN_SHORTS_PER_DAY     = 1;
const MAX_SHORTS_PER_DAY     = 6;
const MIN_LONGFORM_PER_DAY   = 0.14; // 1/week minimum
const MAX_LONGFORM_PER_DAY   = 3;
const MIN_DATA_POINTS        = 20; // need ≥20 published videos to make goals change

// ── ROI computation ──────────────────────────────────────────────────────────

interface ContentROI {
  contentType:   string;
  count:         number;
  avgViews:      number;
  avgWatchPct:   number;
  avgCtr:        number;
  quotaPerItem:  number; // estimated
  watchTimeScore: number; // composite
}

async function computeROI(userId: string): Promise<ContentROI[]> {
  const SHORT_TYPES  = ["youtube_short", "auto-clip", "vod-short", "platform_short"];
  const LF_TYPES     = ["long-form-clip", "long-form", "vod_long_form", "long-form-compilation"];

  const rows = await db.select({
    contentType: sql<string>`${autopilotQueue}.content_type`,
    viewCount:   shadowVideoAnalytics.views,
    avgViewPct:  shadowVideoAnalytics.averageViewPercent,
    ctr:         shadowVideoAnalytics.impressionsCtr,
  })
    .from(autopilotQueue)
    .innerJoin(
      shadowVideoAnalytics,
      sql`${shadowVideoAnalytics}.video_id = ${autopilotQueue}.metadata->>'youtubeVideoId'`,
    )
    .where(and(
      sql`${autopilotQueue}.user_id = ${userId}`,
      sql`${autopilotQueue}.status = 'published'`,
      gte(sql`${autopilotQueue}.published_at`, sql`NOW() - INTERVAL '60 days'`),
      sql`${shadowVideoAnalytics}.view_count > 0`,
    ))
    .limit(200);

  const aggregate = (types: string[], quotaPerItem: number): ContentROI => {
    const matching = rows.filter(r => types.some(t => (r.contentType ?? "").includes(t)));
    if (matching.length === 0) return { contentType: types[0] ?? "unknown", count: 0, avgViews: 0, avgWatchPct: 0, avgCtr: 0, quotaPerItem, watchTimeScore: 0 };
    const avgViews    = matching.reduce((s, r) => s + (r.viewCount ?? 0), 0) / matching.length;
    const avgWatchPct = matching.reduce((s, r) => s + (r.avgViewPct ?? 0), 0) / matching.length;
    const avgCtr      = matching.reduce((s, r) => s + (r.ctr ?? 0), 0) / matching.length;
    const watchTimeScore = avgViews * avgWatchPct * 0.01; // view_count × avg_view_percent
    return { contentType: types[0]!, count: matching.length, avgViews: Math.round(avgViews), avgWatchPct: +avgWatchPct.toFixed(1), avgCtr: +avgCtr.toFixed(3), quotaPerItem, watchTimeScore: Math.round(watchTimeScore) };
  };

  return [
    aggregate(SHORT_TYPES, 450),  // ~450 quota units per Short upload
    aggregate(LF_TYPES,    1600), // ~1600 quota units per long-form upload
  ];
}

// ── Goal reformulation ───────────────────────────────────────────────────────

export async function runGoalDiscovery(userId: string): Promise<void> {
  const lastRun = await getState(SERVICE_KEY, "last_run") as any;
  if (lastRun?.at && Date.now() - new Date(lastRun.at).getTime() < RUN_INTERVAL) return;

  logger.info(`[GoalDiscovery] Running 30-day goal optimisation pass for ${userId.slice(0, 8)}`);

  try {
    const roi = await computeROI(userId);
    const shortROI  = roi[0]!;
    const lfROI     = roi[1]!;

    await setState(SERVICE_KEY, "last_run", { at: new Date().toISOString() });

    if (shortROI.count + lfROI.count < MIN_DATA_POINTS) {
      logger.info(`[GoalDiscovery] Insufficient data (${shortROI.count + lfROI.count} items) — goals unchanged`);
      return;
    }

    // Current goals
    const currentGoals = await getState("goal_planner", `goals:${userId}`) as any ?? {};
    const currentShortsPerDay   = currentGoals.targetShortsPerDay   ?? 3;
    const currentLFPerDay       = currentGoals.targetLongFormPerDay  ?? 1;

    // Ask AI whether goals should change
    const result = await executeRoutedAICall(
      { taskType: "learning", userId, maxTokens: 800 },
      "You are a channel growth strategist. You analyse content performance data and recommend optimal publishing goals that maximise subscriber growth within quota constraints. Return only valid JSON.",
      `Analyse this channel's performance data and decide whether publishing goals should be adjusted.

CURRENT GOALS:
  Shorts/day: ${currentShortsPerDay}
  Long-form/day: ${currentLFPerDay}

SHORTS PERFORMANCE (last 60 days, ${shortROI.count} videos):
  Avg views: ${shortROI.avgViews.toLocaleString()}
  Avg watch %: ${shortROI.avgWatchPct}%
  Avg CTR: ${(shortROI.avgCtr * 100).toFixed(1)}%
  Watch-time score: ${shortROI.watchTimeScore.toLocaleString()} per video

LONG-FORM PERFORMANCE (last 60 days, ${lfROI.count} videos):
  Avg views: ${lfROI.avgViews.toLocaleString()}
  Avg watch %: ${lfROI.avgWatchPct}%
  Avg CTR: ${(lfROI.avgCtr * 100).toFixed(1)}%
  Watch-time score: ${lfROI.watchTimeScore.toLocaleString()} per video

CONSTRAINTS:
  Daily quota budget: 8000 units
  Approx quota per Short upload: 450 units
  Approx quota per long-form upload: 1600 units
  Min Shorts/day: ${MIN_SHORTS_PER_DAY}, Max: ${MAX_SHORTS_PER_DAY}
  Min long-form/week: 1, Max long-form/day: ${MAX_LONGFORM_PER_DAY}

TASK: Should publishing goals change? Consider watch-time per quota unit, subscriber growth correlation, and algorithm preferences.
Only recommend a change if the data strongly supports it (not marginal differences).

Return JSON:
{
  "shouldChange": true/false,
  "recommendedShortsPerDay": <number or keep current>,
  "recommendedLFPerDay": <number or keep current>,
  "rationale": "2-3 sentences explaining the recommendation",
  "confidence": <0-100>
}`,
    );

    const parsed = safeParseJSON<{
      shouldChange?: boolean;
      recommendedShortsPerDay?: number;
      recommendedLFPerDay?: number;
      rationale?: string;
      confidence?: number;
    } | null>(result.content, null);

    if (!parsed?.shouldChange || !parsed.rationale) {
      logger.info("[GoalDiscovery] AI recommends keeping current goals unchanged");
      return;
    }

    const confidence = parsed.confidence ?? 50;
    if (confidence < 70) {
      logger.info(`[GoalDiscovery] Confidence ${confidence}% too low to change goals — threshold 70%`);
      return;
    }

    // Apply guardrails
    const newShortsPerDay = Math.max(MIN_SHORTS_PER_DAY, Math.min(MAX_SHORTS_PER_DAY,
      Math.round(parsed.recommendedShortsPerDay ?? currentShortsPerDay),
    ));
    const newLFPerDay = Math.max(MIN_LONGFORM_PER_DAY, Math.min(MAX_LONGFORM_PER_DAY,
      parseFloat((parsed.recommendedLFPerDay ?? currentLFPerDay).toFixed(2)),
    ));

    if (newShortsPerDay === currentShortsPerDay && Math.abs(newLFPerDay - currentLFPerDay) < 0.1) {
      logger.info("[GoalDiscovery] Goals already optimal — no change needed");
      return;
    }

    // Write new goals
    await setState("goal_planner", `goals:${userId}`, {
      targetShortsPerDay:   newShortsPerDay,
      targetLongFormPerDay: newLFPerDay,
      updatedAt:            new Date().toISOString(),
      updatedBy:            "goal-discovery",
      rationale:            parsed.rationale,
      confidence,
    });

    // Write to masterKnowledgeBank
    await db.insert(masterKnowledgeBank).values({
      userId,
      category:         "goal_optimization",
      principle:        `GOAL UPDATE (confidence ${confidence}%): Adjusted targets to ${newShortsPerDay} Shorts/day and ${newLFPerDay} long-form/day. Rationale: ${parsed.rationale}`,
      sourceEngines:    ["goal-discovery"],
      evidenceCount:    shortROI.count + lfROI.count,
      confidenceScore:  confidence,
      applicableEngines: ["youtube-ai-orchestrator", "goal-planner"],
      isActive:         true,
      metadata:         { newShortsPerDay, newLFPerDay, roiData: roi } as any,
    } as any).onConflictDoNothing();

    logger.info(`[GoalDiscovery] Goals updated — ${currentShortsPerDay}→${newShortsPerDay} Shorts/day, ${currentLFPerDay}→${newLFPerDay} LF/day (confidence ${confidence}%)`);
  } catch (err: any) {
    logger.debug(`[GoalDiscovery] Discovery pass non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initGoalDiscovery(userId: string): ReturnType<typeof setInterval> {
  setTimeout(() => runGoalDiscovery(userId).catch(() => {}), 15 * 60_000);
  return setInterval(() => runGoalDiscovery(userId).catch(() => {}), RUN_INTERVAL);
}
