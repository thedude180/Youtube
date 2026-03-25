import { db } from "../db";
import { trendingTopics, trendPredictions, trendArbitrageOpportunities, competitorTracks } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type ArbitrageOpportunity = {
  topic: string;
  platform: string;
  opportunityScore: number;
  saturationLevel: number;
  windowRemainingHours: number;
  competitorCount: number;
  recommended: boolean;
  reasoning: string;
};

type ArbitrageAnalysis = {
  userId: string;
  opportunities: ArbitrageOpportunity[];
  topPick: ArbitrageOpportunity | null;
  totalOpportunities: number;
  avgWindowHours: number;
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "trend-arbitrage", 3);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function estimateWindowHours(velocity: string | null, trendScore: number | null, firstSeenAt: Date | null): number {
  const score = trendScore || 0.5;
  const vel = velocity || "stable";

  let baseHours = 72;
  if (vel === "rising") baseHours = 48;
  else if (vel === "exploding") baseHours = 24;
  else if (vel === "declining") baseHours = 8;
  else if (vel === "stable") baseHours = 96;

  if (firstSeenAt) {
    const ageHours = (Date.now() - firstSeenAt.getTime()) / 3600000;
    baseHours = Math.max(4, baseHours - ageHours * 0.5);
  }

  return Math.round(baseHours * (1 - score * 0.3));
}

function calculateSaturation(competitorCount: number, trendScore: number): number {
  return Math.min(1, (competitorCount * 0.15) + (trendScore * 0.2));
}

export async function findArbitrageOpportunities(userId: string, platforms?: string[]): Promise<ArbitrageAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, opportunities: [], topPick: null, totalOpportunities: 0, avgWindowHours: 0 };
  }

  const trends = await db.select().from(trendingTopics)
    .where(and(
      eq(trendingTopics.userId, userId),
      gte(trendingTopics.createdAt, daysAgo(7))
    ))
    .orderBy(desc(trendingTopics.trendScore))
    .limit(50);

  const predictions = await db.select().from(trendPredictions)
    .where(and(
      eq(trendPredictions.userId, userId),
      gte(trendPredictions.createdAt, daysAgo(14))
    ))
    .limit(30);

  const competitors = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .limit(50);

  const competitorTopics = new Set<string>();
  for (const c of competitors) {
    if (c.strengths) {
      for (const s of c.strengths) competitorTopics.add(s.toLowerCase());
    }
  }

  const opportunities: ArbitrageOpportunity[] = [];

  for (const trend of trends) {
    const platform = trend.platform || "youtube";
    if (platforms && !platforms.includes(platform)) continue;

    const trendScore = trend.trendScore || 0.5;
    const topicLower = trend.topic.toLowerCase();
    const competitorOverlap = competitors.filter(c =>
      c.strengths?.some(s => topicLower.includes(s.toLowerCase()) || s.toLowerCase().includes(topicLower))
    ).length;

    const saturation = calculateSaturation(competitorOverlap, trendScore);
    const windowHours = estimateWindowHours(trend.velocity, trendScore, trend.firstSeenAt);

    const opportunityScore = Math.max(0, Math.min(1,
      (trendScore * 0.4) + ((1 - saturation) * 0.35) + (windowHours > 24 ? 0.25 : windowHours / 96)
    ));

    const recommended = opportunityScore > 0.5 && saturation < 0.7 && windowHours > 8;

    let reasoning = `Trend "${trend.topic}" (${trend.velocity || "stable"})`;
    if (saturation < 0.3) reasoning += " — low competition, strong first-mover advantage";
    else if (saturation < 0.6) reasoning += " — moderate competition, differentiation needed";
    else reasoning += " — high saturation, consider unique angle";

    const opp: ArbitrageOpportunity = {
      topic: trend.topic,
      platform,
      opportunityScore,
      saturationLevel: saturation,
      windowRemainingHours: windowHours,
      competitorCount: competitorOverlap,
      recommended,
      reasoning,
    };
    opportunities.push(opp);

    await db.insert(trendArbitrageOpportunities).values({
      userId,
      topic: trend.topic,
      platform,
      saturationLevel: saturation,
      opportunityScore,
      windowRemainingHours: windowHours,
      competitorCount: competitorOverlap,
      recommended,
      expiresAt: new Date(Date.now() + windowHours * 3600000),
    }).catch(() => {});
  }

  for (const pred of predictions) {
    if (!pred.outcome && pred.confidence && pred.confidence > 0.6) {
      const platform = pred.platform || "youtube";
      if (platforms && !platforms.includes(platform)) continue;

      const alreadyTrending = trends.some(t => t.topic.toLowerCase() === pred.topic.toLowerCase());
      if (alreadyTrending) continue;

      opportunities.push({
        topic: pred.topic,
        platform,
        opportunityScore: pred.confidence * 0.8,
        saturationLevel: 0.1,
        windowRemainingHours: 120,
        competitorCount: 0,
        recommended: true,
        reasoning: `Predicted trend "${pred.topic}" — early first-mover window (confidence: ${pred.confidence.toFixed(2)})`,
      });
    }
  }

  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const topPick = opportunities.length > 0 ? opportunities[0] : null;
  const avgWindowHours = opportunities.length > 0
    ? opportunities.reduce((s, o) => s + o.windowRemainingHours, 0) / opportunities.length
    : 0;

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "trend.arbitrage.analyzed", {
      opportunityCount: opportunities.length, topPick: topPick?.topic,
    }, "trend-arbitrage", "analysis");
  } catch {}

  return {
    userId,
    opportunities,
    topPick,
    totalOpportunities: opportunities.length,
    avgWindowHours: Math.round(avgWindowHours),
  };
}

export async function getFirstMoverWindow(userId: string, topic: string, platform: string): Promise<{
  windowRemainingHours: number;
  saturationLevel: number;
  viability: "strong" | "moderate" | "closing" | "expired";
  competitorCount: number;
}> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { windowRemainingHours: 0, saturationLevel: 1, viability: "expired", competitorCount: 0 };
  }

  const trend = await db.select().from(trendingTopics)
    .where(and(
      eq(trendingTopics.userId, userId),
      eq(trendingTopics.topic, topic)
    ))
    .orderBy(desc(trendingTopics.createdAt))
    .limit(1);

  const competitors = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .limit(50);

  const topicLower = topic.toLowerCase();
  const competitorCount = competitors.filter(c =>
    c.strengths?.some(s => topicLower.includes(s.toLowerCase()))
  ).length;

  const trendData = trend[0];
  const trendScore = trendData?.trendScore || 0.5;
  const windowHours = trendData
    ? estimateWindowHours(trendData.velocity, trendScore, trendData.firstSeenAt)
    : 48;
  const saturation = calculateSaturation(competitorCount, trendScore);

  let viability: "strong" | "moderate" | "closing" | "expired" = "moderate";
  if (windowHours > 48 && saturation < 0.3) viability = "strong";
  else if (windowHours > 16 && saturation < 0.6) viability = "moderate";
  else if (windowHours > 4) viability = "closing";
  else viability = "expired";

  return { windowRemainingHours: windowHours, saturationLevel: saturation, viability, competitorCount };
}
