import { db } from "../db";
import { momentGenomeClassifications } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export type MomentType = "boss_fight" | "clutch_play" | "exploration" | "cutscene" | "death" | "achievement" | "transition" | "ambient";

const MOMENT_TAXONOMY: Record<MomentType, { label: string; avgIntensity: number; clipPotential: number }> = {
  boss_fight: { label: "Boss Fight", avgIntensity: 0.9, clipPotential: 0.95 },
  clutch_play: { label: "Clutch Play", avgIntensity: 0.85, clipPotential: 0.9 },
  achievement: { label: "Achievement", avgIntensity: 0.7, clipPotential: 0.75 },
  death: { label: "Death/Fail", avgIntensity: 0.6, clipPotential: 0.65 },
  cutscene: { label: "Cutscene", avgIntensity: 0.5, clipPotential: 0.5 },
  exploration: { label: "Exploration", avgIntensity: 0.3, clipPotential: 0.35 },
  transition: { label: "Transition", avgIntensity: 0.2, clipPotential: 0.15 },
  ambient: { label: "Ambient", avgIntensity: 0.1, clipPotential: 0.1 },
};

export async function classifyMoment(
  userId: string,
  sourceVideoId: number,
  momentType: MomentType,
  timestamp: number,
  duration: number,
  intensity: number,
  tags: string[] = [],
): Promise<number> {
  const taxonomy = MOMENT_TAXONOMY[momentType] || MOMENT_TAXONOMY.ambient;

  const [row] = await db.insert(momentGenomeClassifications).values({
    userId,
    sourceVideoId,
    momentType,
    timestamp,
    duration,
    intensity,
    tags,
    genome: {
      ...taxonomy,
      adjustedIntensity: intensity,
      clipScore: intensity * taxonomy.clipPotential,
    },
  }).returning();

  return row.id;
}

export function getMomentTaxonomy(): typeof MOMENT_TAXONOMY {
  return { ...MOMENT_TAXONOMY };
}

export async function getMoments(userId: string, sourceVideoId?: number, limit = 50) {
  if (sourceVideoId) {
    return db.select().from(momentGenomeClassifications)
      .where(eq(momentGenomeClassifications.sourceVideoId, sourceVideoId))
      .orderBy(desc(momentGenomeClassifications.createdAt))
      .limit(limit);
  }
  return db.select().from(momentGenomeClassifications)
    .where(eq(momentGenomeClassifications.userId, userId))
    .orderBy(desc(momentGenomeClassifications.createdAt))
    .limit(limit);
}
