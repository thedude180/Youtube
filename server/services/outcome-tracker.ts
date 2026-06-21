/**
 * outcome-tracker.ts
 *
 * Measures the real-world impact of every autonomous action 48 hours after it
 * executes, then feeds the result back into engine accuracy tracking.
 *
 * Flow:
 *   1. scheduleOutcomeMeasurement() — called by action-executor right after a
 *      successful execution.  Inserts an actionOutcomes row with measureAfter
 *      set 48 h in the future.
 *   2. runOutcomeCycle() — runs every ~2 hours.  Picks up all rows where
 *      measureAfter < NOW() AND measuredAt IS NULL, fetches current YouTube
 *      analytics, computes deltas, writes a verdict, then updates engine
 *      accuracy via recordEngineOutcome().
 *   3. startOutcomeTracker() / stopOutcomeTracker() — lifecycle helpers called
 *      from server/index.ts.
 */

import { db } from "../db";
import {
  actionOutcomes,
  engineAccuracy,
  type InsertActionOutcome,
} from "@shared/schema";
import { eq, and, isNull, lt } from "drizzle-orm";
import { fetchVideoAnalytics } from "./youtube-analytics";
import { setJitteredInterval } from "../lib/timer-utils";
import { createLogger } from "../lib/logger";

const logger = createLogger("outcome-tracker");

const CYCLE_INTERVAL_MS = 2 * 3600_000; // 2 hours base, ±20% jitter

let stopTimer: (() => void) | null = null;

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Insert an actionOutcomes row so the outcome cycle picks it up 48 h later.
 * Call this right after a successful autonomous action execution.
 */
export async function scheduleOutcomeMeasurement(
  userId: string,
  actionId: number,
  youtubeVideoId: string,
  engineSource: string,
  baselineViews: number,
  baselineCtr: number,
): Promise<void> {
  const measureAfter = new Date(Date.now() + 48 * 3600_000);

  const row: InsertActionOutcome = {
    userId,
    actionId,
    youtubeVideoId,
    engineSource,
    baselineViews,
    baselineCtr,
    measureAfter,
    measuredAt: null,
  };

  try {
    await db.insert(actionOutcomes).values(row);
    logger.info("Outcome measurement scheduled", {
      userId,
      actionId,
      youtubeVideoId,
      measureAfter: measureAfter.toISOString(),
    });
  } catch (err: any) {
    logger.error("Failed to schedule outcome measurement", {
      userId,
      actionId,
      error: String(err).slice(0, 300),
    });
    throw err;
  }
}

/**
 * Process all actionOutcomes rows that are ready to be measured.
 * Runs on a jittered 2-hour cadence.
 */
export async function runOutcomeCycle(): Promise<void> {
  const now = new Date();

  // Fetch all rows ready to measure: measureAfter < NOW AND measuredAt IS NULL
  let pending: (typeof actionOutcomes.$inferSelect)[];
  try {
    pending = await db
      .select()
      .from(actionOutcomes)
      .where(
        and(
          lt(actionOutcomes.measureAfter, now),
          isNull(actionOutcomes.measuredAt),
        ),
      );
  } catch (err: any) {
    logger.error("Failed to query pending outcome rows", {
      error: String(err).slice(0, 300),
    });
    return;
  }

  if (pending.length === 0) {
    logger.info("Outcome cycle — no pending measurements");
    return;
  }

  logger.info(`Outcome cycle — measuring ${pending.length} action(s)`);

  for (const row of pending) {
    if (!row.youtubeVideoId) {
      // No video ID — skip, mark measured so we don't re-visit forever
      await db
        .update(actionOutcomes)
        .set({ measuredAt: new Date(), verdict: "neutral" })
        .where(eq(actionOutcomes.id, row.id))
        .catch(err =>
          logger.warn("Failed to mark no-video row as measured", {
            rowId: row.id,
            error: String(err).slice(0, 200),
          }),
        );
      continue;
    }

    // Fetch current analytics from YouTube
    let analytics: Awaited<ReturnType<typeof fetchVideoAnalytics>>;
    try {
      analytics = await fetchVideoAnalytics(row.userId, row.youtubeVideoId);
    } catch (err: any) {
      logger.warn("fetchVideoAnalytics failed — skipping row", {
        rowId: row.id,
        youtubeVideoId: row.youtubeVideoId,
        error: String(err).slice(0, 200),
      });
      continue;
    }

    const outcomeViews = analytics.views ?? 0;
    // YouTube Analytics API does not directly return CTR; use a fallback of 0
    // so the delta calculation is still meaningful for the views dimension.
    const outcomeCtr = 0;

    const baseline = row.baselineViews ?? 0;
    const baselineCtr = row.baselineCtr ?? 0;

    const deltaViewsPct =
      (outcomeViews - baseline) / Math.max(baseline, 1);
    const deltaCtrPct =
      outcomeCtr === 0 && baselineCtr === 0
        ? 0
        : (outcomeCtr - baselineCtr) / Math.max(baselineCtr, 0.001);

    const verdict: "positive" | "negative" | "neutral" =
      deltaViewsPct > 0.15 || deltaCtrPct > 0.1
        ? "positive"
        : deltaViewsPct < -0.15 || deltaCtrPct < -0.1
        ? "negative"
        : "neutral";

    // Write outcome back to the row
    try {
      await db
        .update(actionOutcomes)
        .set({
          outcomeViews,
          outcomeCtr,
          outcomeAvgViewDuration: analytics.averageViewDurationSec ?? null,
          deltaViewsPct,
          deltaCtrPct,
          verdict,
          measuredAt: new Date(),
        })
        .where(eq(actionOutcomes.id, row.id));
    } catch (err: any) {
      logger.error("Failed to update outcome row", {
        rowId: row.id,
        error: String(err).slice(0, 300),
      });
      continue;
    }

    // Feed the verdict back into engine accuracy tracking
    if (row.engineSource) {
      await recordEngineOutcome(row.userId, row.engineSource, verdict === "positive").catch(
        err =>
          logger.warn("recordEngineOutcome failed", {
            engineSource: row.engineSource,
            error: String(err).slice(0, 200),
          }),
      );
    }

    logger.info("Outcome measured", {
      rowId: row.id,
      userId: row.userId,
      youtubeVideoId: row.youtubeVideoId,
      engineSource: row.engineSource,
      verdict,
      deltaViewsPct: deltaViewsPct.toFixed(3),
      deltaCtrPct: deltaCtrPct.toFixed(3),
    });
  }
}

/** Start the recurring outcome measurement loop. Called from server/index.ts. */
export function startOutcomeTracker(): void {
  if (stopTimer) return; // already running

  logger.info("Outcome tracker starting — measuring action impact every ~2 h");

  stopTimer = setJitteredInterval(async () => {
    await runOutcomeCycle().catch(err =>
      logger.error("Outcome cycle error", { error: String(err).slice(0, 300) }),
    );
  }, CYCLE_INTERVAL_MS);
}

/** Stop the recurring outcome measurement loop. Called from server/index.ts on shutdown. */
export function stopOutcomeTracker(): void {
  if (stopTimer) {
    stopTimer();
    stopTimer = null;
    logger.info("Outcome tracker stopped");
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────────

/**
 * Upsert the engineAccuracy row for (userId, engineName).
 * Increments totalPredictions; increments correctPredictions only when
 * `wasPositive` is true.  Recomputes accuracyRate as a running mean.
 *
 * This lives here rather than in strategy-brain because outcome-tracker.ts
 * owns the feedback loop — strategy-brain reads the accuracy table, it does
 * not write it.
 */
async function recordEngineOutcome(
  userId: string,
  engineName: string,
  wasPositive: boolean,
): Promise<void> {
  // Try update first — if the row exists, increment in place
  const existing = await db
    .select()
    .from(engineAccuracy)
    .where(
      and(
        eq(engineAccuracy.userId, userId),
        eq(engineAccuracy.engineName, engineName),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    const newTotal = row.totalPredictions + 1;
    const newCorrect = row.correctPredictions + (wasPositive ? 1 : 0);
    const newRate = newCorrect / newTotal;

    await db
      .update(engineAccuracy)
      .set({
        totalPredictions: newTotal,
        correctPredictions: newCorrect,
        accuracyRate: newRate,
        lastUpdatedAt: new Date(),
      })
      .where(eq(engineAccuracy.id, row.id));
  } else {
    // Insert new row
    await db.insert(engineAccuracy).values({
      userId,
      engineName,
      totalPredictions: 1,
      correctPredictions: wasPositive ? 1 : 0,
      accuracyRate: wasPositive ? 1.0 : 0.0,
      lastUpdatedAt: new Date(),
    });
  }
}
