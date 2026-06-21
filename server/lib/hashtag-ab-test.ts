/**
 * hashtag-ab-test.ts
 *
 * Manages the lifetime of the hashtags-vs-no-hashtags A/B experiment for YouTube Shorts.
 *
 * What is being tested:
 *   Variant A "hashtags"    — current behaviour: description ends with #Battlefield6 #BF6 etc.
 *   Variant B "no-hashtags" — description has ZERO #tags (title still keeps #Shorts for
 *                              YouTube classification; that is NOT part of the test)
 *
 * Assignment:
 *   Deterministic 50/50 by autopilot_queue item ID (even → "hashtags", odd → "no-hashtags").
 *   Once a winner is declared the winner is always returned, locking in the best variant
 *   permanently for all future Shorts with zero manual intervention.
 *
 * Data flow:
 *   1. Publisher calls getVariantForItem(itemId) → gets "hashtags" | "no-hashtags"
 *   2. Publisher stores variant in autopilot_queue.metadata.hashtagVariant (fire-and-forget)
 *   3. Existing code stores youtube_video_id in autopilot_queue.metadata.youtubeVideoId
 *   4. Daily learning brain calls evaluateHashtagExperiment(userId)
 *      → JOINs autopilot_queue (has variant) with youtube_output_metrics (has CTR)
 *      → Compares average CTR between the two arms
 *   5. When one arm leads by ≥ 15% CTR with ≥ 20 measured videos per side → winner declared
 *   6. Winner is written to the `experiments` table and cached; future items always use winner
 *
 * The test intentionally tests only the DESCRIPTION field.  The title always keeps #Shorts
 * (YouTube requires it for Short classification).  Keeping the title stable across variants
 * ensures the only variable is the presence of hashtags in the description.
 */

import { db } from "../db";
import { experiments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createLogger } from "./logger";
import { logSystemIncident } from "./incident-log";

const logger = createLogger("hashtag-ab-test");

export const HASHTAG_EXPERIMENT_TYPE = "hashtags_description";
const MIN_SAMPLE_PER_ARM = 20;
const MIN_CTR_DELTA_PCT  = 15; // one arm must beat the other by ≥15% relative CTR to declare a winner

export type HashtagVariant = "hashtags" | "no-hashtags";

// ── In-memory winner cache ────────────────────────────────────────────────────
let _cachedWinner: HashtagVariant | null | undefined = undefined;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadWinner(): Promise<HashtagVariant | null> {
  const now = Date.now();
  if (_cachedWinner !== undefined && now - _cacheTs < CACHE_TTL_MS) return _cachedWinner;
  try {
    const [exp] = await db.select()
      .from(experiments)
      .where(and(
        eq(experiments.experimentType, HASHTAG_EXPERIMENT_TYPE),
        eq(experiments.status, "completed"),
      ))
      .limit(1);
    _cachedWinner = (exp?.winnerId as HashtagVariant | null | undefined) ?? null;
    _cacheTs = now;
    return _cachedWinner;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the hashtag variant to use for this autopilot_queue item.
 * After a winner is declared every item gets the winner.
 * Before that: even IDs → "hashtags", odd IDs → "no-hashtags" (perfect 50/50).
 */
export async function getVariantForItem(itemId: number): Promise<HashtagVariant> {
  const winner = await loadWinner();
  if (winner) return winner;
  return itemId % 2 === 0 ? "hashtags" : "no-hashtags";
}

/**
 * Strip all #HashtagTokens from a description string.
 * Never removes #Shorts — YouTube needs that in the title for Short classification.
 * (The title is handled separately; this helper is only called on the description.)
 */
export function stripDescriptionHashtags(text: string): string {
  return text
    .replace(/#(?!shorts\b)\w+/gi, "")  // remove every #Word except #Shorts
    .replace(/[ \t]{2,}/g, " ")          // collapse multi-spaces
    .replace(/\n[ \t]+/g, "\n")          // strip leading spaces on lines
    .replace(/\n{3,}/g, "\n\n")          // collapse triple newlines
    .trim();
}

/**
 * Ensure the experiment row exists in the `experiments` table.
 * Idempotent — safe to call on every boot or from the publisher.
 */
export async function ensureHashtagExperimentRegistered(userId: string): Promise<void> {
  try {
    const [existing] = await db.select()
      .from(experiments)
      .where(eq(experiments.experimentType, HASHTAG_EXPERIMENT_TYPE))
      .limit(1);
    if (existing) return;
    await db.insert(experiments).values({
      userId,
      experimentType: HASHTAG_EXPERIMENT_TYPE,
      status: "running",
      variants: [
        { id: "hashtags",    label: "With hashtags in description",    score: 0, sampleSize: 0 },
        { id: "no-hashtags", label: "Without hashtags in description", score: 0, sampleSize: 0 },
      ],
      autoApply: true,
    });
    logger.info("[HashtagAB] Experiment registered: hashtags_description");
  } catch (err: any) {
    logger.warn(`[HashtagAB] Could not register experiment (non-fatal): ${err?.message?.slice(0, 100)}`);
  }
}

/**
 * Evaluate the hashtag experiment.  Call this from the daily learning brain cycle.
 *
 * Algorithm:
 *   1. JOIN autopilot_queue (has hashtagVariant) with youtube_output_metrics (has CTR)
 *   2. Only include rows where measured_at is set (YouTube Analytics data arrived)
 *      AND measured_at < NOW() - 48h (give each video time to accumulate impressions)
 *   3. GROUP BY variant → compare average CTR
 *   4. If both arms have ≥ MIN_SAMPLE_PER_ARM and one leads by ≥ MIN_CTR_DELTA_PCT → declare winner
 *   5. Write winner to `experiments` table + log a system incident
 */
export async function evaluateHashtagExperiment(userId: string): Promise<void> {
  try {
    // Skip if the experiment has already been concluded
    const [done] = await db.select()
      .from(experiments)
      .where(and(
        eq(experiments.experimentType, HASHTAG_EXPERIMENT_TYPE),
        eq(experiments.status, "completed"),
      ))
      .limit(1);
    if (done) {
      logger.info(`[HashtagAB] Already concluded — winner: ${done.winnerId}`);
      return;
    }

    // JOIN to get per-arm aggregates
    const rows = await db.execute(
      sql`
        SELECT
          aq.metadata->>'hashtagVariant'   AS variant,
          COUNT(*)::int                    AS sample_size,
          AVG(m.ctr)                       AS avg_ctr,
          AVG(m.views)                     AS avg_views,
          AVG(m.average_view_percent)      AS avg_retention
        FROM autopilot_queue aq
        JOIN youtube_output_metrics m
          ON m.youtube_video_id = aq.metadata->>'youtubeVideoId'
        WHERE aq.user_id          = ${userId}
          AND aq.metadata->>'hashtagVariant' IS NOT NULL
          AND m.measured_at       IS NOT NULL
          AND m.measured_at        < NOW() - INTERVAL '48 hours'
          AND m.ctr               IS NOT NULL
        GROUP BY aq.metadata->>'hashtagVariant'
      `
    );

    const data = (rows as any)?.rows ?? [];
    if (data.length < 2) {
      logger.info(`[HashtagAB] Not enough variant data yet — found ${data.length} arm(s), need 2`);
      return;
    }

    const armA = data.find((r: any) => r.variant === "hashtags");
    const armB = data.find((r: any) => r.variant === "no-hashtags");
    if (!armA || !armB) {
      logger.info("[HashtagAB] Missing one arm — still collecting data");
      return;
    }

    const sizeA = Number(armA.sample_size);
    const sizeB = Number(armB.sample_size);
    const ctrA  = Number(armA.avg_ctr ?? 0);
    const ctrB  = Number(armB.avg_ctr ?? 0);

    logger.info(
      `[HashtagAB] hashtags n=${sizeA} CTR=${(ctrA * 100).toFixed(2)}% | ` +
      `no-hashtags n=${sizeB} CTR=${(ctrB * 100).toFixed(2)}%`
    );

    // Update the running experiment record with current progress
    await _upsertRunningProgress(userId, { ctrA, ctrB, sizeA, sizeB });

    if (sizeA < MIN_SAMPLE_PER_ARM || sizeB < MIN_SAMPLE_PER_ARM) {
      logger.info(
        `[HashtagAB] Waiting for min sample of ${MIN_SAMPLE_PER_ARM} per arm ` +
        `— hashtags: ${sizeA}, no-hashtags: ${sizeB}`
      );
      return;
    }

    const baseline = Math.max(ctrA, ctrB);
    if (baseline === 0) return;
    const deltaPct = Math.abs(ctrA - ctrB) / baseline * 100;

    if (deltaPct < MIN_CTR_DELTA_PCT) {
      logger.info(
        `[HashtagAB] No clear winner yet — CTR delta ${deltaPct.toFixed(1)}% < ${MIN_CTR_DELTA_PCT}% threshold. ` +
        `Continuing test.`
      );
      return;
    }

    const winner: HashtagVariant = ctrA >= ctrB ? "hashtags" : "no-hashtags";
    const winnerCtr = winner === "hashtags" ? ctrA : ctrB;
    const loserCtr  = winner === "hashtags" ? ctrB : ctrA;

    // Write the winner
    await _declareWinner(userId, winner, { ctrA, ctrB, sizeA, sizeB, deltaPct });

    const msg =
      `[HashtagAB] 🏆 WINNER: "${winner}" — ` +
      `CTR ${(winnerCtr * 100).toFixed(2)}% vs ${(loserCtr * 100).toFixed(2)}%, ` +
      `n=${sizeA}+${sizeB}, delta ${deltaPct.toFixed(1)}%`;
    logger.info(msg);

    await logSystemIncident({
      category: "other",
      severity: "low",
      service: "hashtag-ab-test",
      rootCause: `A/B experiment concluded after ${sizeA + sizeB} measured videos`,
      lesson: msg,
      status: "resolved",
      tags: ["ab-test", "hashtags", winner],
    }).catch(() => {});

  } catch (err: any) {
    logger.warn(`[HashtagAB] Evaluation error (non-fatal): ${err?.message?.slice(0, 200)}`);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _upsertRunningProgress(
  userId: string,
  metrics: { ctrA: number; ctrB: number; sizeA: number; sizeB: number }
): Promise<void> {
  try {
    const [existing] = await db.select()
      .from(experiments)
      .where(eq(experiments.experimentType, HASHTAG_EXPERIMENT_TYPE))
      .limit(1);
    if (existing) {
      await db.update(experiments)
        .set({
          variants: [
            { id: "hashtags",    label: "With hashtags in description",    score: metrics.ctrA, sampleSize: metrics.sizeA },
            { id: "no-hashtags", label: "Without hashtags in description", score: metrics.ctrB, sampleSize: metrics.sizeB },
          ],
        })
        .where(eq(experiments.id, existing.id));
    }
  } catch { /* non-fatal */ }
}

async function _declareWinner(
  userId: string,
  winner: HashtagVariant,
  metrics: { ctrA: number; ctrB: number; sizeA: number; sizeB: number; deltaPct: number }
): Promise<void> {
  const payload = {
    status: "completed" as const,
    winnerId: winner,
    completedAt: new Date(),
    winnerMetrics: metrics,
    variants: [
      { id: "hashtags",    label: "With hashtags in description",    score: metrics.ctrA, sampleSize: metrics.sizeA },
      { id: "no-hashtags", label: "Without hashtags in description", score: metrics.ctrB, sampleSize: metrics.sizeB },
    ],
  };

  const [existing] = await db.select()
    .from(experiments)
    .where(eq(experiments.experimentType, HASHTAG_EXPERIMENT_TYPE))
    .limit(1);

  if (existing) {
    await db.update(experiments).set(payload).where(eq(experiments.id, existing.id));
  } else {
    await db.insert(experiments).values({ userId, experimentType: HASHTAG_EXPERIMENT_TYPE, autoApply: true, ...payload });
  }

  // Bust the cache so the next call to getVariantForItem picks up the winner immediately
  _cachedWinner = winner;
  _cacheTs = Date.now();
}
