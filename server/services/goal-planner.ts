/**
 * Goal-Aware Planner
 * ─────────────────────────────────────────────────────────────────────────────
 * Sets 30-day output targets, measures real progress every daily cycle,
 * and produces a gap-analysis string that the AI orchestrator injects into
 * its execution plan. When the channel is behind target, the orchestrator
 * automatically re-weights its task priorities.
 *
 * This is ASI pillar #5: the system always knows where it wants to be,
 * measures where it actually is, and re-plans accordingly — continuously.
 *
 * Targets are stored in system_settings and refresh every 30 days.
 * Progress is measured from autopilot_queue (published rows).
 */

import { db } from "../db";
import { systemSettings, autopilotQueue } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("goal-planner");

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChannelGoals {
  targetShortsPerWeek: number;  // default: 21 (3/day)
  targetLongsPerWeek: number;   // default:  7 (1/day)
  targetSubscriberGain30d: number;
  targetViewGain30d: number;
  setAt: string;
  expiresAt: string;
}

export interface GoalProgress {
  goals: ChannelGoals;
  shortsPublishedLast30d: number;
  longsPublishedLast30d: number;
  shortsProgressPct: number;
  longsProgressPct: number;
  overallProgressPct: number;
  gaps: string[];
  isOnTrack: boolean;
  urgentActions: string[];
}

// ─── Defaults (conservative for a ~6K channel) ───────────────────────────────

const DEFAULT_GOALS: Omit<ChannelGoals, "setAt" | "expiresAt"> = {
  targetShortsPerWeek:    21,    // 3 Shorts / day
  targetLongsPerWeek:      7,    // 1 long-form / day
  targetSubscriberGain30d: 200,
  targetViewGain30d:    50_000,
};

// ─── Persistence ──────────────────────────────────────────────────────────────

async function loadGoals(userId: string): Promise<ChannelGoals> {
  try {
    const row = await db.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, `goal_planner:goals:${userId}`))
      .limit(1);

    if (row[0]?.value) {
      const saved = JSON.parse(row[0].value) as ChannelGoals;
      if (new Date(saved.expiresAt) > new Date()) return saved;
    }
  } catch { /* first run */ }

  // Set fresh goals
  const goals: ChannelGoals = {
    ...DEFAULT_GOALS,
    setAt:     new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
  await persistGoals(userId, goals);
  return goals;
}

async function persistGoals(userId: string, goals: ChannelGoals): Promise<void> {
  try {
    await db.insert(systemSettings)
      .values({ key: `goal_planner:goals:${userId}`, value: JSON.stringify(goals) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify(goals) },
      });
  } catch { /* non-critical */ }
}

// ─── Progress measurement ─────────────────────────────────────────────────────

const SHORT_TYPES = ["auto-clip", "youtube_short", "vod-short", "platform_short"];
const LONG_TYPES  = ["vod-long-form", "long-form-clip", "youtube_long_form"];

async function measureProgress(userId: string, goals: ChannelGoals): Promise<GoalProgress> {
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  let shortsPublished = 0;
  let longsPublished  = 0;

  const counts = await db
    .select({ type: autopilotQueue.type, count: sql<number>`count(*)` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.publishedAt, since30d),
    ))
    .groupBy(autopilotQueue.type);

  for (const row of counts) {
    if (SHORT_TYPES.includes(row.type ?? "")) shortsPublished += Number(row.count);
    if (LONG_TYPES.includes(row.type ?? ""))  longsPublished  += Number(row.count);
  }

  const targetShortsMonth = goals.targetShortsPerWeek * 4;
  const targetLongsMonth  = goals.targetLongsPerWeek  * 4;

  const shortsProgressPct  = targetShortsMonth > 0 ? Math.round((shortsPublished / targetShortsMonth) * 100) : 100;
  const longsProgressPct   = targetLongsMonth  > 0 ? Math.round((longsPublished  / targetLongsMonth)  * 100) : 100;
  const overallProgressPct = Math.round((shortsProgressPct + longsProgressPct) / 2);

  const gaps: string[]          = [];
  const urgentActions: string[] = [];

  if (shortsPublished < targetShortsMonth * 0.70) {
    gaps.push(`Shorts: ${shortsPublished}/${targetShortsMonth} published (${shortsProgressPct}% of monthly target)`);
    if (shortsPublished < targetShortsMonth * 0.40) {
      urgentActions.push("URGENT: Shorts pipeline severely behind — prioritise vault health, clip encoding, and queue refill");
    }
  }
  if (longsPublished < targetLongsMonth * 0.70) {
    gaps.push(`Long-form: ${longsPublished}/${targetLongsMonth} published (${longsProgressPct}% of monthly target)`);
    if (longsPublished < targetLongsMonth * 0.40) {
      urgentActions.push("URGENT: Long-form pipeline severely behind — prioritise segment downloads and pre-encoder queue");
    }
  }

  return {
    goals,
    shortsPublishedLast30d: shortsPublished,
    longsPublishedLast30d:  longsPublished,
    shortsProgressPct,
    longsProgressPct,
    overallProgressPct,
    gaps,
    isOnTrack: gaps.length === 0,
    urgentActions,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a compact goal-status string for injection into the orchestrator's
 * execution plan context.  Empty string if measurement fails.
 */
export async function getGoalContext(userId: string): Promise<string> {
  try {
    const goals    = await loadGoals(userId);
    const progress = await measureProgress(userId, goals);
    const game     = await getFocusGame();

    const lines: string[] = [
      `── 30-Day Goal Progress (${game}) ──`,
      `Overall: ${progress.overallProgressPct}% of output targets`,
      `Shorts: ${progress.shortsPublishedLast30d} published / ${goals.targetShortsPerWeek * 4} target (${progress.shortsProgressPct}%)`,
      `Long-form: ${progress.longsPublishedLast30d} published / ${goals.targetLongsPerWeek * 4} target (${progress.longsProgressPct}%)`,
    ];

    if (progress.gaps.length > 0) {
      lines.push(`Gaps: ${progress.gaps.join(" | ")}`);
    }
    for (const action of progress.urgentActions) {
      lines.push(`⚠️  ${action}`);
    }
    if (progress.isOnTrack) {
      lines.push("✓ On track with all output targets");
    }

    return lines.join("\n");
  } catch (err: any) {
    logger.debug(`[GoalPlanner] getGoalContext failed: ${err.message?.slice(0, 80)}`);
    return "";
  }
}

/**
 * Full measurement + logging — called from the daily learning cycle.
 */
export async function measureAndLogGoalProgress(userId: string): Promise<GoalProgress | null> {
  try {
    const goals    = await loadGoals(userId);
    const progress = await measureProgress(userId, goals);

    logger.info("[GoalPlanner] Progress measured", {
      userId: userId.slice(0, 8),
      overall: `${progress.overallProgressPct}%`,
      shorts:  `${progress.shortsPublishedLast30d}/${goals.targetShortsPerWeek * 4}`,
      longs:   `${progress.longsPublishedLast30d}/${goals.targetLongsPerWeek * 4}`,
      onTrack: progress.isOnTrack,
    });

    if (progress.urgentActions.length > 0) {
      for (const action of progress.urgentActions) {
        logger.warn(`[GoalPlanner] ${action}`);
      }
    }

    return progress;
  } catch (err: any) {
    logger.warn(`[GoalPlanner] measureAndLogGoalProgress failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}
