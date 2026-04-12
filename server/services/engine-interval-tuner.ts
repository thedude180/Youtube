import { db } from "../db";
import { engineIntervalConfigs, engineKnowledge, users } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";

const logger = createLogger("engine-interval-tuner");

const TUNING_CYCLE_MS = 30 * 60_000;

const tunerStore = createEngineStore("engine-interval-tuner", 10 * 60_000);

const ENGINE_DEFAULTS: Record<string, { defaultMs: number; minMs: number; maxMs: number }> = {
  "self-improvement": { defaultMs: 45 * 60_000, minMs: 15 * 60_000, maxMs: 120 * 60_000 },
  "infinite-evolution": { defaultMs: 60 * 60_000, minMs: 30 * 60_000, maxMs: 180 * 60_000 },
  "growth-flywheel": { defaultMs: 30 * 60_000, minMs: 15 * 60_000, maxMs: 90 * 60_000 },
  "analytics-intelligence": { defaultMs: 60 * 60_000, minMs: 20 * 60_000, maxMs: 120 * 60_000 },
  "media-command": { defaultMs: 45 * 60_000, minMs: 15 * 60_000, maxMs: 90 * 60_000 },
  "content-grinder": { defaultMs: 30 * 60_000, minMs: 10 * 60_000, maxMs: 90 * 60_000 },
  "performance-feedback": { defaultMs: 45 * 60_000, minMs: 20 * 60_000, maxMs: 120 * 60_000 },
  "empire-brain": { defaultMs: 60 * 60_000, minMs: 30 * 60_000, maxMs: 180 * 60_000 },
  "trend-rider": { defaultMs: 30 * 60_000, minMs: 10 * 60_000, maxMs: 60 * 60_000 },
  "competitive-intel": { defaultMs: 60 * 60_000, minMs: 30 * 60_000, maxMs: 180 * 60_000 },
};

function ensureUserRegistered(userId: string) {
  registerUserQueries(tunerStore, userId, {
    configs: () => db.select().from(engineIntervalConfigs)
      .where(eq(engineIntervalConfigs.userId, userId)),
    recent_knowledge: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 2 * 3600_000)),
      ))
      .orderBy(desc(engineKnowledge.createdAt)).limit(200),
  });
}

export function initEngineIntervalTuner(): ReturnType<typeof setInterval> {
  logger.info("Engine Interval Tuner initialized — self-adjusting engine speeds");

  setTimeout(() => {
    runTuningCycle().catch(err => logger.error("Initial tuning failed", { err: String(err) }));
  }, 120_000);

  return setInterval(() => {
    runTuningCycle().catch(err => logger.error("Tuning cycle failed", { err: String(err) }));
  }, TUNING_CYCLE_MS);
}

export async function runTuningCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await tuneEnginesForUser(user.id);
    } catch (err) {
      logger.error(`Tuning failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function tuneEnginesForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const configs = await getUserData(tunerStore, userId, "configs") as any[];
  const recentKnowledge = await getUserData(tunerStore, userId, "recent_knowledge") as any[];

  for (const [engineName, defaults] of Object.entries(ENGINE_DEFAULTS)) {
    let config = configs?.find((c: any) => c.engineName === engineName);

    if (!config) {
      try {
        await db.insert(engineIntervalConfigs).values({
          userId,
          engineName,
          currentIntervalMs: defaults.defaultMs,
          defaultIntervalMs: defaults.defaultMs,
          minIntervalMs: defaults.minMs,
          maxIntervalMs: defaults.maxMs,
        }).onConflictDoNothing();
        continue;
      } catch {
        continue;
      }
    }

    const engineOutput = recentKnowledge?.filter((k: any) => k.engineName === engineName) || [];
    const outputCount = engineOutput.length;
    const avgConfidence = engineOutput.length > 0
      ? Math.round(engineOutput.reduce((sum: number, k: any) => sum + (k.confidenceScore || 50), 0) / engineOutput.length)
      : 50;

    let newInterval = config.currentIntervalMs;
    let reason = "no_change";

    if (outputCount === 0 && config.wastedCycles >= 3) {
      newInterval = Math.min(config.currentIntervalMs * 1.3, config.maxIntervalMs);
      reason = `slowing_down: ${config.wastedCycles} wasted cycles, no output`;
    } else if (outputCount >= 5 && avgConfidence >= 65) {
      newInterval = Math.max(config.currentIntervalMs * 0.8, config.minIntervalMs);
      reason = `speeding_up: ${outputCount} high-quality outputs (avg confidence ${avgConfidence})`;
    } else if (outputCount >= 3 && avgConfidence >= 50) {
      newInterval = Math.max(config.currentIntervalMs * 0.9, config.minIntervalMs);
      reason = `slightly_faster: ${outputCount} good outputs`;
    } else if (outputCount <= 1 && avgConfidence < 40) {
      newInterval = Math.min(config.currentIntervalMs * 1.15, config.maxIntervalMs);
      reason = `slightly_slower: low output quality (confidence ${avgConfidence})`;
    }

    newInterval = Math.round(newInterval);

    const wasProductive = outputCount > 0;
    const wastedDelta = wasProductive ? 0 : 1;
    const productiveDelta = wasProductive ? 1 : 0;

    if (newInterval !== config.currentIntervalMs || wasProductive !== (config.wastedCycles === 0)) {
      await db.update(engineIntervalConfigs)
        .set({
          currentIntervalMs: newInterval,
          outputQualityScore: avgConfidence,
          outputVolumeLastCycle: outputCount,
          wastedCycles: wasProductive ? 0 : (config.wastedCycles || 0) + wastedDelta,
          productiveCycles: (config.productiveCycles || 0) + productiveDelta,
          lastTunedAt: new Date(),
          tuningReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(engineIntervalConfigs.userId, userId), eq(engineIntervalConfigs.engineName, engineName)));

      if (reason !== "no_change") {
        const oldMinutes = Math.round(config.currentIntervalMs / 60_000);
        const newMinutes = Math.round(newInterval / 60_000);
        await recordEngineKnowledge(
          "engine-interval-tuner", userId, "interval_adjustment",
          `${engineName}_tuning`,
          `Adjusted ${engineName} from ${oldMinutes}min to ${newMinutes}min: ${reason}`,
          `output_count=${outputCount}, avg_confidence=${avgConfidence}, wasted=${config.wastedCycles}`,
          Math.min(90, 50 + outputCount * 5),
        );

        logger.info(`Tuned ${engineName}: ${oldMinutes}min → ${newMinutes}min (${reason})`, { userId: userId.substring(0, 8) });
      }
    }
  }

  invalidateUserData(tunerStore, userId, "configs");
}

export async function getEngineInterval(userId: string, engineName: string): Promise<number | null> {
  const configs = await db.select({ currentIntervalMs: engineIntervalConfigs.currentIntervalMs })
    .from(engineIntervalConfigs)
    .where(and(eq(engineIntervalConfigs.userId, userId), eq(engineIntervalConfigs.engineName, engineName)))
    .limit(1);
  return configs[0]?.currentIntervalMs ?? null;
}

export async function reportEngineOutput(userId: string, engineName: string, qualityScore: number): Promise<void> {
  await db.update(engineIntervalConfigs)
    .set({
      outputQualityScore: qualityScore,
      outputVolumeLastCycle: sql`${engineIntervalConfigs.outputVolumeLastCycle} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(engineIntervalConfigs.userId, userId), eq(engineIntervalConfigs.engineName, engineName)));
}
