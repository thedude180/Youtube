import { db } from "../db";
import { contentVelocityMetrics } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function measureVelocity(
  userId: string,
  period: string,
  contentCount: number,
  qualityAvg: number,
  engagementAvg: number,
): Promise<{ velocityScore: number; trend: string }> {
  const publishRate = contentCount / (period === "weekly" ? 7 : period === "monthly" ? 30 : 1);
  const velocityScore = publishRate * 0.3 + qualityAvg * 0.4 + engagementAvg * 0.3;

  const previous = await db.select().from(contentVelocityMetrics)
    .where(eq(contentVelocityMetrics.userId, userId))
    .orderBy(desc(contentVelocityMetrics.measuredAt))
    .limit(1);

  const prevScore = previous.length > 0 ? previous[0].velocityScore || 0 : velocityScore;
  const trend = velocityScore > prevScore + 0.05 ? "accelerating" :
    velocityScore < prevScore - 0.05 ? "decelerating" : "stable";

  await db.insert(contentVelocityMetrics).values({
    userId,
    period,
    contentCount,
    publishRate,
    qualityAvg,
    engagementAvg,
    velocityScore,
    trend,
  });

  return { velocityScore, trend };
}

export async function getVelocityTrend(userId: string, limit = 10) {
  return db.select().from(contentVelocityMetrics)
    .where(eq(contentVelocityMetrics.userId, userId))
    .orderBy(desc(contentVelocityMetrics.measuredAt))
    .limit(limit);
}
