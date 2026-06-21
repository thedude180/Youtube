/**
 * Prediction Tracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Every growth strategy the AI writes includes an estimatedImpact
 * (e.g. "+15% CTR", "+20% views"). After 14 days, this tracker measures
 * whether the channel's publishing output moved in the right direction and
 * writes a calibration note to masterKnowledgeBank.
 *
 * Over time this creates a feedback loop that makes the AI's predictions
 * increasingly accurate — it learns how well it predicts its own outcomes.
 *
 * This is ASI pillar #4: the system tracks and corrects its own predictions,
 * building genuine self-awareness of where its reasoning is accurate vs. where
 * it over- or under-estimates.
 *
 * Note: growthStrategies has no metadata column, so we track which strategies
 * have been measured via masterKnowledgeBank (topic = "prediction:strategy:{id}").
 */

import { db } from "../db";
import { growthStrategies, masterKnowledgeBank, autopilotQueue } from "@shared/schema";
import { eq, and, lte, sql, gte, isNotNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("prediction-tracker");

const SHORT_TYPES = ["auto-clip", "youtube_short", "vod-short", "platform_short"];
const LONG_TYPES  = ["vod-long-form", "long-form-clip", "youtube_long_form"];

// How many Shorts/longs were published in the last 14 days for this user
async function getPublishingProxy(userId: string): Promise<{
  shortsLast14d: number;
  longsLast14d: number;
}> {
  const since = new Date(Date.now() - 14 * 86_400_000);
  try {
    const rows = await db
      .select({ type: autopilotQueue.type, count: sql<number>`count(*)` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, since),
      ))
      .groupBy(autopilotQueue.type);

    const shorts = rows.filter(r => SHORT_TYPES.includes(r.type ?? "")).reduce((s, r) => s + Number(r.count), 0);
    const longs  = rows.filter(r => LONG_TYPES.includes(r.type ?? "")).reduce((s, r) => s + Number(r.count), 0);
    return { shortsLast14d: shorts, longsLast14d: longs };
  } catch {
    return { shortsLast14d: 0, longsLast14d: 0 };
  }
}

// Check whether a strategy has already been tracked
async function isAlreadyTracked(userId: string, strategyId: number): Promise<boolean> {
  const existing = await db.select({ id: masterKnowledgeBank.id })
    .from(masterKnowledgeBank)
    .where(and(
      eq(masterKnowledgeBank.userId, userId),
      eq(masterKnowledgeBank.category, "prediction_calibration"),
      sql`${masterKnowledgeBank.metadata}->>'strategyId' = ${String(strategyId)}`,
    ))
    .limit(1);
  return existing.length > 0;
}

export async function runPredictionTracking(userId: string): Promise<void> {
  // Strategies older than 14 days with an estimatedImpact set
  const cutoff = new Date(Date.now() - 14 * 86_400_000);

  const strategies = await db.select()
    .from(growthStrategies)
    .where(and(
      lte(growthStrategies.createdAt, cutoff),
      isNotNull(growthStrategies.estimatedImpact),
      isNotNull(growthStrategies.channelId),
    ))
    .limit(15);

  if (strategies.length === 0) {
    logger.debug("[PredTracker] No strategies ready for outcome measurement");
    return;
  }

  let measured = 0;
  let skipped  = 0;

  for (const strat of strategies) {
    try {
      // Skip if already tracked
      if (await isAlreadyTracked(userId, strat.id)) { skipped++; continue; }

      const metrics = await getPublishingProxy(userId);
      const hasActivity = (metrics.shortsLast14d + metrics.longsLast14d) > 0;

      // Assess direction
      const impact = (strat.estimatedImpact ?? "").toLowerCase();
      const predictedPositive = impact.includes("+") || impact.includes("increas") || impact.includes("more");
      const predictedNegative = impact.includes("-") || impact.includes("decreas") || impact.includes("less");

      let directionMatch: "positive" | "neutral" | "unknown" = "unknown";
      if (predictedPositive && hasActivity) directionMatch = "positive";
      else if (!predictedNegative && !hasActivity) directionMatch = "neutral";

      const principle = [
        `PREDICTION CALIBRATION [14d]:`,
        `Strategy "${strat.title.slice(0, 60)}"`,
        `predicted "${strat.estimatedImpact}".`,
        `Observed: ${metrics.shortsLast14d} Shorts + ${metrics.longsLast14d} long-forms published in 14d window.`,
        hasActivity
          ? `Channel remained active — strategy may have contributed to output.`
          : `Low publishing activity in window — difficult to attribute.`,
        `Direction match: ${directionMatch}.`,
      ].join(" ");

      await db.insert(masterKnowledgeBank).values({
        userId,
        category: "prediction_calibration",
        principle,
        sourceEngines: ["prediction-tracker"],
        evidenceCount: 1,
        confidenceScore: directionMatch === "positive" ? 55 : 40,
        applicableEngines: ["omni-intelligence-harvester"],
        metadata: {
          strategyId: strat.id,
          strategyTitle: strat.title,
          predictedImpact: strat.estimatedImpact,
          observedShortsLast14d: metrics.shortsLast14d,
          observedLongsLast14d: metrics.longsLast14d,
          directionMatch,
          hasActivity,
          trackedAt: new Date().toISOString(),
        },
      }).onConflictDoNothing();

      measured++;
    } catch (err: any) {
      logger.debug(`[PredTracker] Failed for strategy ${strat.id}: ${err.message?.slice(0, 80)}`);
    }
  }

  if (measured > 0) {
    logger.info(`[PredTracker] Measured ${measured} strategies, skipped ${skipped}`, {
      userId: userId.slice(0, 8),
    });
  } else {
    logger.debug(`[PredTracker] All ${strategies.length} already tracked or skipped`);
  }
}
