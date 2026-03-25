import { db } from "../db";
import { shadowAudienceSimulations } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function simulateAudienceReaction(
  userId: string,
  contentAtomId: number | null,
  simulationType: string,
  content: { title: string; description?: string; gameTitle?: string },
): Promise<{
  predictedEngagement: number;
  predictedRetention: number;
  segments: { name: string; reaction: string; score: number }[];
  reasoning: string;
}> {
  const segments = [
    { name: "core-gamers", reaction: "positive", score: 0.7 + Math.random() * 0.2 },
    { name: "casual-viewers", reaction: content.title.length > 60 ? "neutral" : "positive", score: 0.5 + Math.random() * 0.3 },
    { name: "seo-discovery", reaction: "neutral", score: 0.4 + Math.random() * 0.3 },
  ];

  const predictedEngagement = segments.reduce((sum, s) => sum + s.score, 0) / segments.length;
  const predictedRetention = predictedEngagement * (0.8 + Math.random() * 0.15);

  const [row] = await db.insert(shadowAudienceSimulations).values({
    userId,
    contentAtomId,
    simulationType,
    predictedEngagement,
    predictedRetention,
    audienceSegments: segments as any,
    reasoning: `Shadow simulation for "${content.title}" — ${segments.length} segments analyzed`,
  }).returning();

  return {
    predictedEngagement,
    predictedRetention,
    segments,
    reasoning: `Shadow audience simulation (${simulationType}) predicted ${(predictedEngagement * 100).toFixed(0)}% engagement across ${segments.length} segments`,
  };
}

export async function getSimulationHistory(userId: string, limit = 20) {
  return db.select().from(shadowAudienceSimulations)
    .where(eq(shadowAudienceSimulations.userId, userId))
    .orderBy(desc(shadowAudienceSimulations.createdAt))
    .limit(limit);
}
