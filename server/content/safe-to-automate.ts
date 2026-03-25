import { db } from "../db";
import { safeToAutomateScores } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface SafetyFactors {
  contentRisk: number;
  brandAlignment: number;
  historicalSuccess: number;
  audienceSensitivity: number;
  monetizationImpact: number;
}

export async function calculateSafetyScore(
  userId: string,
  actionType: string,
  factors: Partial<SafetyFactors>,
): Promise<{ score: number; autoApproved: boolean }> {
  const weights = {
    contentRisk: 0.25,
    brandAlignment: 0.2,
    historicalSuccess: 0.2,
    audienceSensitivity: 0.2,
    monetizationImpact: 0.15,
  };

  let score = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = factors[key as keyof SafetyFactors];
    if (value != null) {
      score += value * weight;
      totalWeight += weight;
    }
  }

  score = totalWeight > 0 ? score / totalWeight : 0.5;

  const threshold = getSafetyThreshold(actionType);
  const autoApproved = score >= threshold;

  await db.insert(safeToAutomateScores).values({
    userId,
    actionType,
    score,
    factors: factors as Record<string, number>,
    threshold,
    autoApproved,
  });

  return { score, autoApproved };
}

export function getSafetyThreshold(actionType: string): number {
  const thresholds: Record<string, number> = {
    "publish_video": 0.8,
    "update_title": 0.7,
    "update_description": 0.6,
    "update_tags": 0.5,
    "generate_thumbnail": 0.6,
    "schedule_post": 0.65,
    "create_clip": 0.5,
    "create_short": 0.7,
    "respond_comment": 0.75,
    "send_community_post": 0.7,
  };
  return thresholds[actionType] || 0.7;
}

export async function getSafetyHistory(userId: string, actionType?: string, limit = 20) {
  const conditions = [eq(safeToAutomateScores.userId, userId)];
  if (actionType) conditions.push(eq(safeToAutomateScores.actionType, actionType));

  return db.select().from(safeToAutomateScores)
    .where(and(...conditions))
    .orderBy(desc(safeToAutomateScores.createdAt))
    .limit(limit);
}
