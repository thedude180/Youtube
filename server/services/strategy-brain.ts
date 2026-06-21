/**
 * strategy-brain.ts
 *
 * Master signal synthesizer for the CreatorOS autonomous YouTube channel.
 *
 * Runs every 4 hours (±20% jitter). Each tick:
 *  1. Gathers signals from three sub-engines:
 *     - performance-feedback-loop  → game weights, optimal duration, optimal publish hour
 *     - ab-testing-engine          → winning title formula
 *     - revenue-attribution-engine → revenue-weighted game boosts
 *  2. Merges those signals into a single `strategyState` row per user.
 *  3. All content engines read from `strategyState` instead of querying
 *     the raw signal tables themselves.
 *
 * Engine accuracy tracking:
 *  - `recordEngineOutcome()` lets any caller report whether a prediction was correct.
 *  - `getEngineWeights()` returns accuracy-normalized weights so better-performing
 *    engines get more influence in signal synthesis.
 */

import { db } from "../db";
import {
  strategyState,
  engineAccuracy,
  revenueAttribution,
  abTests,
  channels,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import {
  getGameRanking,
  getBestDuration,
  getBestPublishHour,
} from "./performance-feedback-loop";

const logger = createLogger("strategy-brain");

// 4-hour base cycle (setJitteredInterval adds ±20%)
const CYCLE_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Revenue boost applied to games that have positive attributed revenue
const REVENUE_BOOST_FACTOR = 1.3;

// Default strategy returned when no data exists yet
const DEFAULT_STRATEGY = {
  gameWeights: { "PS5 Gameplay": 1.0 } as Record<string, number>,
  optimalDurationMin: 10,
  optimalPublishHour: 15,
  titleFormula: null as string | null,
  thumbnailStyle: null as string | null,
};

let loopStop: (() => void) | null = null;

// ── Public types ──────────────────────────────────────────────────────────────

export type StrategyStateRow = typeof strategyState.$inferSelect;

// ── Core read ─────────────────────────────────────────────────────────────────

/**
 * Returns the current strategy state for a user.
 * If no row exists yet, returns a safe default.
 * Never throws.
 */
export async function getStrategyState(userId: string): Promise<StrategyStateRow> {
  try {
    const rows = await db
      .select()
      .from(strategyState)
      .where(eq(strategyState.userId, userId))
      .limit(1);

    if (rows.length > 0) return rows[0];

    // Return a synthesized default that matches the DB shape
    const now = new Date();
    return {
      id: 0,
      userId,
      gameWeights: DEFAULT_STRATEGY.gameWeights,
      optimalDurationMin: DEFAULT_STRATEGY.optimalDurationMin,
      optimalPublishHour: DEFAULT_STRATEGY.optimalPublishHour,
      titleFormula: DEFAULT_STRATEGY.titleFormula,
      thumbnailStyle: DEFAULT_STRATEGY.thumbnailStyle,
      signalVersions: {},
      engineWeights: {},
      rawSignals: {},
      computedAt: now,
      updatedAt: now,
    } satisfies StrategyStateRow;
  } catch (err: any) {
    logger.warn(`[getStrategyState] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 120)}`);
    const now = new Date();
    return {
      id: 0,
      userId,
      gameWeights: DEFAULT_STRATEGY.gameWeights,
      optimalDurationMin: DEFAULT_STRATEGY.optimalDurationMin,
      optimalPublishHour: DEFAULT_STRATEGY.optimalPublishHour,
      titleFormula: DEFAULT_STRATEGY.titleFormula,
      thumbnailStyle: DEFAULT_STRATEGY.thumbnailStyle,
      signalVersions: {},
      engineWeights: {},
      rawSignals: {},
      computedAt: now,
      updatedAt: now,
    } satisfies StrategyStateRow;
  }
}

// ── Engine accuracy tracking ──────────────────────────────────────────────────

/**
 * Returns accuracy-normalised weights for the three signal engines.
 * Engines with no data yet receive equal weight (0.33 each).
 */
export async function getEngineWeights(userId: string): Promise<Record<string, number>> {
  const engineNames = [
    "performance-feedback-loop",
    "ab-testing-engine",
    "revenue-attribution-engine",
  ];

  try {
    const rows = await db
      .select()
      .from(engineAccuracy)
      .where(eq(engineAccuracy.userId, userId));

    if (rows.length === 0) {
      const equal = 1 / engineNames.length;
      return Object.fromEntries(engineNames.map((n) => [n, equal]));
    }

    // Build accuracy map (default 0.5 for engines not yet tracked)
    const accuracyMap: Record<string, number> = {};
    for (const name of engineNames) {
      accuracyMap[name] = 0.5; // default prior
    }
    for (const row of rows) {
      if (engineNames.includes(row.engineName)) {
        accuracyMap[row.engineName] = row.accuracyRate;
      }
    }

    // Normalize so weights sum to 1.0
    const total = Object.values(accuracyMap).reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      const equal = 1 / engineNames.length;
      return Object.fromEntries(engineNames.map((n) => [n, equal]));
    }

    return Object.fromEntries(
      Object.entries(accuracyMap).map(([k, v]) => [k, v / total]),
    );
  } catch (err: any) {
    logger.warn(`[getEngineWeights] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 120)}`);
    const equal = 1 / engineNames.length;
    return Object.fromEntries(engineNames.map((n) => [n, equal]));
  }
}

/**
 * Records whether an engine's prediction was correct.
 * Upserts the engineAccuracy row and recomputes accuracyRate.
 */
export async function recordEngineOutcome(
  userId: string,
  engineName: string,
  wasCorrect: boolean,
): Promise<void> {
  try {
    await db
      .insert(engineAccuracy)
      .values({
        userId,
        engineName,
        totalPredictions: 1,
        correctPredictions: wasCorrect ? 1 : 0,
        accuracyRate: wasCorrect ? 1.0 : 0.0,
        lastUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [engineAccuracy.userId, engineAccuracy.engineName],
        set: {
          totalPredictions: sql`${engineAccuracy.totalPredictions} + 1`,
          correctPredictions: sql`${engineAccuracy.correctPredictions} + ${wasCorrect ? 1 : 0}`,
          accuracyRate: sql`(${engineAccuracy.correctPredictions} + ${wasCorrect ? 1 : 0})::real / (${engineAccuracy.totalPredictions} + 1)::real`,
          lastUpdatedAt: new Date(),
        },
      });
  } catch (err: any) {
    logger.warn(
      `[recordEngineOutcome] Error for ${userId.slice(0, 8)} / ${engineName}: ${err?.message?.slice(0, 120)}`,
    );
    throw err;
  }
}

// ── Signal helpers ────────────────────────────────────────────────────────────

/**
 * Normalise an array of {item, score} pairs to weights that sum to 1.0.
 * Returns an empty object when the input is empty.
 */
function normaliseToWeights(items: Array<{ key: string; score: number }>): Record<string, number> {
  if (items.length === 0) return {};
  const total = items.reduce((s, i) => s + i.score, 0);
  if (total === 0) {
    const equal = 1 / items.length;
    return Object.fromEntries(items.map((i) => [i.key, equal]));
  }
  return Object.fromEntries(items.map((i) => [i.key, i.score / total]));
}

/**
 * Builds a map of gameTitle → total attributed revenue from the
 * revenueAttribution table.  The `gameTitle` field lives in the metadata JSONB
 * column; `contentTitle` is used as a fallback identifier.
 */
async function getRevenueByGame(
  userId: string,
): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select()
      .from(revenueAttribution)
      .where(eq(revenueAttribution.userId, userId))
      .limit(50);

    const gameRevenue: Record<string, number> = {};
    for (const row of rows) {
      // Primary key: metadata.gameTitle
      const gameTitle: string | null =
        (row.metadata as Record<string, any>)?.gameTitle ??
        row.contentTitle ??
        null;

      if (!gameTitle) continue;
      gameRevenue[gameTitle] = (gameRevenue[gameTitle] ?? 0) + (row.amount ?? 0);
    }
    return gameRevenue;
  } catch (err: any) {
    logger.warn(`[getRevenueByGame] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 120)}`);
    return {};
  }
}

/**
 * Analyse completed A/B tests to extract a title formula.
 *
 * Heuristic: if outcome-first titles (those starting with a verb or a number,
 * e.g. "Destroyed", "Got 30 Kills") win more than half the time, we record
 * that pattern; otherwise fall back to a generic "engaging-title" label.
 *
 * Returns null when no completed tests exist.
 */
async function deriveTitleFormula(userId: string): Promise<string | null> {
  try {
    const tests = await db
      .select()
      .from(abTests)
      .where(
        and(
          eq(abTests.userId, userId),
          eq(abTests.status, "completed"),
        ),
      )
      .limit(20);

    if (tests.length === 0) return null;

    // Outcome-first pattern: title starts with a capital verb or number
    const outcomeFirstRe = /^([A-Z][a-z]+ed|[A-Z][a-z]+ing|\d)/;

    let outcomeFirstWins = 0;
    let totalDecided = 0;

    for (const test of tests) {
      const winner = test.winner; // "a" | "b" | null
      if (!winner) continue;

      const winnerTitle =
        winner === "a"
          ? (test.variantA as { title: string })?.title
          : (test.variantB as { title: string })?.title;

      if (!winnerTitle) continue;
      totalDecided++;
      if (outcomeFirstRe.test(winnerTitle.trim())) outcomeFirstWins++;
    }

    if (totalDecided === 0) return null;

    const ratio = outcomeFirstWins / totalDecided;

    if (ratio >= 0.5) {
      return "outcome-first: start title with past-tense verb or number (e.g. 'Destroyed Every Enemy…', '30 Kill Game…')";
    }
    return "engaging-question: pose a curiosity gap in the title (e.g. 'Can I…?', 'The BEST…')";
  } catch (err: any) {
    logger.warn(`[deriveTitleFormula] Error for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 120)}`);
    return null;
  }
}

// ── Core recompute ────────────────────────────────────────────────────────────

/**
 * Fetches all signals, merges them, and upserts strategyState for userId.
 * Safe to call at any time — uses onConflictDoUpdate for the unique userId index.
 */
export async function recomputeStrategyState(userId: string): Promise<void> {
  logger.info(`[recompute] Starting for user ${userId.slice(0, 8)}`);

  // ── 1. Performance signals ─────────────────────────────────────────────────
  const [gameRanking, optimalDurationMin, optimalPublishHour] = await Promise.all([
    getGameRanking(userId, "long_form"),
    getBestDuration(userId),
    getBestPublishHour(userId),
  ]);

  // Normalise game scores → weights
  let gameWeights = normaliseToWeights(
    gameRanking.map((r) => ({ key: r.game, score: r.score })),
  );

  // Fallback: no performance data yet
  if (Object.keys(gameWeights).length === 0) {
    gameWeights = DEFAULT_STRATEGY.gameWeights;
  }

  // ── 2. Revenue signal — boost games with positive RPM ─────────────────────
  const revenueByGame = await getRevenueByGame(userId);
  if (Object.keys(revenueByGame).length > 0) {
    const boosted: Record<string, number> = { ...gameWeights };
    for (const [game, rev] of Object.entries(revenueByGame)) {
      if (rev > 0 && boosted[game] !== undefined) {
        boosted[game] = boosted[game] * REVENUE_BOOST_FACTOR;
      }
    }
    // Re-normalise after boost
    const total = Object.values(boosted).reduce((s, v) => s + v, 0);
    if (total > 0) {
      gameWeights = Object.fromEntries(
        Object.entries(boosted).map(([k, v]) => [k, v / total]),
      );
    }
  }

  // ── 3. A/B test signal — title formula ────────────────────────────────────
  const titleFormula = await deriveTitleFormula(userId);

  // ── 4. Engine weights ──────────────────────────────────────────────────────
  const engineWeights = await getEngineWeights(userId);

  // ── 5. Persist ────────────────────────────────────────────────────────────
  const now = new Date();
  const rawSignals: Record<string, any> = {
    gameRanking,
    revenueByGame,
    optimalDurationMin,
    optimalPublishHour,
    titleFormula,
  };

  await db
    .insert(strategyState)
    .values({
      userId,
      gameWeights,
      optimalDurationMin,
      optimalPublishHour,
      titleFormula: titleFormula ?? null,
      thumbnailStyle: null,
      signalVersions: {},
      engineWeights,
      rawSignals,
      computedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: strategyState.userId,
      set: {
        gameWeights,
        optimalDurationMin,
        optimalPublishHour,
        titleFormula: titleFormula ?? null,
        engineWeights,
        rawSignals,
        computedAt: now,
        updatedAt: now,
      },
    });

  logger.info(
    `[recompute] Done for ${userId.slice(0, 8)} — ` +
    `games=${Object.keys(gameWeights).length}, ` +
    `duration=${optimalDurationMin}min, hour=${optimalPublishHour}, ` +
    `titleFormula=${titleFormula ? "derived" : "none"}`,
  );
}

// ── Service lifecycle ─────────────────────────────────────────────────────────

/**
 * Starts the 4-hour strategy-recompute loop.
 * Each tick discovers all distinct YouTube channel owners and recomputes
 * their strategy state.
 */
export function startStrategyBrain(): void {
  if (loopStop) {
    logger.warn("[StrategyBrain] Already running — ignoring duplicate start");
    return;
  }

  logger.info("[StrategyBrain] Starting — 4-hour synthesis cycle (±20% jitter)");

  loopStop = setJitteredInterval(async () => {
    logger.info("[StrategyBrain] Cycle tick — discovering YouTube channel owners");

    let userIds: string[];
    try {
      const rows = await db
        .selectDistinct({ userId: channels.userId })
        .from(channels)
        .where(eq(channels.platform, "youtube"));

      userIds = rows.map((r) => r.userId);
    } catch (err: any) {
      logger.error(`[StrategyBrain] Failed to query channel owners: ${err?.message?.slice(0, 120)}`);
      return;
    }

    logger.info(`[StrategyBrain] Recomputing strategy for ${userIds.length} user(s)`);

    for (const userId of userIds) {
      try {
        await recomputeStrategyState(userId);
      } catch (err: any) {
        logger.error(
          `[StrategyBrain] recompute failed for ${userId.slice(0, 8)}: ${err?.message?.slice(0, 120)}`,
        );
      }
    }

    logger.info("[StrategyBrain] Cycle complete");
  }, CYCLE_INTERVAL_MS);
}

/**
 * Stops the strategy-brain loop. Idempotent.
 */
export function stopStrategyBrain(): void {
  if (!loopStop) return;
  loopStop();
  loopStop = null;
  logger.info("[StrategyBrain] Stopped");
}
