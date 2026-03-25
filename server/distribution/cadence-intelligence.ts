import { db } from "../db";
import { cadenceIntelligence, distributionEvents, algorithmRelationships } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

type CadenceRecommendation = {
  platform: string;
  currentFrequency: number;
  optimalFrequency: number;
  direction: "increase" | "decrease" | "maintain";
  confidence: number;
  reasoning: string;
  bufferDays: number;
};

type CadenceAnalysis = {
  userId: string;
  recommendations: CadenceRecommendation[];
  overallHealth: number;
  burnoutRisk: number;
  algorithmAlignment: number;
};

const PLATFORM_IDEAL_CADENCE: Record<string, { min: number; max: number; ideal: number }> = {
  youtube: { min: 1, max: 7, ideal: 3 },
  tiktok: { min: 3, max: 21, ideal: 7 },
  x: { min: 7, max: 35, ideal: 14 },
  twitch: { min: 2, max: 7, ideal: 4 },
  kick: { min: 2, max: 7, ideal: 4 },
  discord: { min: 3, max: 14, ideal: 7 },
  rumble: { min: 1, max: 5, ideal: 2 },
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

async function checkTrustBudgetForCadence(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    const result = await checkTrustBudget(userId, "cadence-intelligence", 2);
    return { allowed: !result.blocked, remaining: result.remaining };
  } catch {
    return { allowed: false, remaining: 0 };
  }
}

export async function analyzeCadence(userId: string, platforms?: string[]): Promise<CadenceAnalysis> {
  const trustCheck = await checkTrustBudgetForCadence(userId);
  if (!trustCheck.allowed) {
    return {
      userId,
      recommendations: [],
      overallHealth: 0,
      burnoutRisk: 0,
      algorithmAlignment: 0,
    };
  }

  const thirtyDaysAgo = daysAgo(30);

  const recentEvents = await db.select().from(distributionEvents)
    .where(and(
      eq(distributionEvents.userId, userId),
      gte(distributionEvents.createdAt, thirtyDaysAgo)
    ))
    .orderBy(desc(distributionEvents.createdAt))
    .limit(200);

  const algRelationships = await db.select().from(algorithmRelationships)
    .where(eq(algorithmRelationships.userId, userId))
    .limit(20);

  const platformCounts: Record<string, number> = {};
  const successCounts: Record<string, number> = {};
  for (const e of recentEvents) {
    platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
    if (e.status === "published" || e.status === "approved") {
      successCounts[e.platform] = (successCounts[e.platform] || 0) + 1;
    }
  }

  const targetPlatforms = platforms || Object.keys(platformCounts);
  const recommendations: CadenceRecommendation[] = [];
  let totalAlignment = 0;
  let totalBurnout = 0;

  for (const platform of targetPlatforms) {
    const cadence = PLATFORM_IDEAL_CADENCE[platform] || PLATFORM_IDEAL_CADENCE.youtube;
    const currentWeekly = (platformCounts[platform] || 0) / 4.3;
    const successRate = platformCounts[platform]
      ? (successCounts[platform] || 0) / platformCounts[platform] : 0;

    const algRel = algRelationships.find(a => a.platform === platform);
    const algFavor = algRel?.algorithmFavor ?? 0.5;

    let optimalFrequency = cadence.ideal;
    if (algFavor > 0.7) {
      optimalFrequency = Math.min(cadence.max, cadence.ideal + 1);
    } else if (algFavor < 0.3) {
      optimalFrequency = Math.max(cadence.min, cadence.ideal - 1);
    }

    if (successRate > 0.8) optimalFrequency = Math.min(cadence.max, optimalFrequency + 0.5);
    if (successRate < 0.5) optimalFrequency = Math.max(cadence.min, optimalFrequency - 0.5);

    let direction: "increase" | "decrease" | "maintain" = "maintain";
    if (currentWeekly < optimalFrequency - 0.5) direction = "increase";
    else if (currentWeekly > optimalFrequency + 0.5) direction = "decrease";

    const confidence = Math.min(1, (platformCounts[platform] || 0) / 10);

    let reasoning = `${platform}: ${currentWeekly.toFixed(1)}/week (optimal: ${optimalFrequency.toFixed(1)}/week)`;
    if (direction === "increase") reasoning += " — room to post more without audience fatigue";
    else if (direction === "decrease") reasoning += " — reduce frequency to prevent audience fatigue";
    else reasoning += " — cadence is well-calibrated";

    const burnoutFactor = currentWeekly > cadence.max ? (currentWeekly - cadence.max) / cadence.max : 0;
    totalBurnout += burnoutFactor;
    totalAlignment += algFavor;

    const bufferDays = Math.max(0, Math.ceil(7 / optimalFrequency) - 1);

    recommendations.push({
      platform,
      currentFrequency: Math.round(currentWeekly * 10) / 10,
      optimalFrequency: Math.round(optimalFrequency * 10) / 10,
      direction,
      confidence,
      reasoning,
      bufferDays,
    });

    await db.insert(cadenceIntelligence).values({
      userId,
      platform,
      optimalFrequency,
      currentFrequency: currentWeekly,
      audienceRetention: successRate,
      algorithmScore: algFavor,
      bufferDays,
      recommendations: [reasoning],
    }).catch(() => {});
  }

  const overallHealth = recommendations.length > 0
    ? 1 - (recommendations.filter(r => r.direction !== "maintain").length / recommendations.length) * 0.5
    : 0.5;
  const burnoutRisk = Math.min(1, totalBurnout / Math.max(1, targetPlatforms.length));
  const algorithmAlignment = targetPlatforms.length > 0 ? totalAlignment / targetPlatforms.length : 0.5;

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "cadence.analyzed", {
      platformCount: recommendations.length, overallHealth, burnoutRisk,
    }, "cadence-intelligence", "analysis");
  } catch {}

  return { userId, recommendations, overallHealth, burnoutRisk, algorithmAlignment };
}

export async function getCadenceHistory(userId: string, platform?: string, limit = 30): Promise<any[]> {
  if (platform) {
    return db.select().from(cadenceIntelligence)
      .where(and(eq(cadenceIntelligence.userId, userId), eq(cadenceIntelligence.platform, platform)))
      .orderBy(desc(cadenceIntelligence.createdAt))
      .limit(limit);
  }
  return db.select().from(cadenceIntelligence)
    .where(eq(cadenceIntelligence.userId, userId))
    .orderBy(desc(cadenceIntelligence.createdAt))
    .limit(limit);
}
