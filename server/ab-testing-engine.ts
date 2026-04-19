import { db } from "./db";
import { experiments } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "./lib/logger";

const logger = createLogger("ab-testing-engine");

export type ExperimentRecord = typeof experiments.$inferSelect;

export async function getActiveExperiments(userId: string): Promise<ExperimentRecord[]> {
  return db.select().from(experiments)
    .where(and(eq(experiments.userId, userId), eq(experiments.status, "running")))
    .orderBy(desc(experiments.startedAt))
    .limit(50);
}

export async function getExperimentResults(userId: string): Promise<ExperimentRecord[]> {
  return db.select().from(experiments)
    .where(and(eq(experiments.userId, userId), eq(experiments.status, "completed")))
    .orderBy(desc(experiments.completedAt))
    .limit(50);
}

export async function createExperiment(
  userId: string,
  experimentType: string,
  variants: Record<string, any>[],
  contentId?: number,
): Promise<ExperimentRecord> {
  const [experiment] = await db.insert(experiments).values({
    userId,
    experimentType,
    variants,
    contentId: contentId ?? null,
    status: "running",
    autoApply: true,
  }).returning();
  if (!experiment) throw new Error("Failed to create experiment");
  logger.info("[ABTesting] Created experiment", { userId, experimentType, id: experiment.id });
  return experiment;
}

export async function evaluateExperiment(experimentId: number | string, _userId?: string): Promise<{
  experiment: ExperimentRecord;
  winnerId: string | null;
  summary: string;
}> {
  const id = typeof experimentId === "string" ? parseInt(experimentId, 10) : experimentId;
  const [experiment] = await db.select().from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);

  if (!experiment) throw new Error(`Experiment ${id} not found`);

  if (experiment.status === "completed") {
    return {
      experiment,
      winnerId: experiment.winnerId,
      summary: `Experiment completed. Winner: ${experiment.winnerId ?? "none"}`,
    };
  }

  const variants = (experiment.variants ?? []) as Record<string, any>[];
  let winnerId: string | null = null;
  let bestScore = -Infinity;

  for (const variant of variants) {
    const score = typeof variant.score === "number" ? variant.score : 0;
    if (score > bestScore) {
      bestScore = score;
      winnerId = variant.id ?? null;
    }
  }

  const [updated] = await db.update(experiments).set({
    status: "completed",
    winnerId,
    completedAt: new Date(),
    winnerMetrics: winnerId ? { score: bestScore } : null,
  }).where(eq(experiments.id, id)).returning();

  logger.info("[ABTesting] Evaluated experiment", { experimentId: id, winnerId });
  return {
    experiment: updated ?? experiment,
    winnerId,
    summary: winnerId
      ? `Experiment evaluated. Variant "${winnerId}" won with score ${bestScore}.`
      : "Experiment evaluated. No winner determined — all variants scored equally.",
  };
}
