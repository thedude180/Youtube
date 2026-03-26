import { db } from "../db";
import { revenueRecords, channels, videos, distributionEvents } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface MonetizationPressure {
  overallPressure: number;
  pressureLevel: "low" | "moderate" | "high" | "critical";
  trustBudgetUsage: number;
  monetizationDensity: number;
  audienceFatigue: {
    score: number;
    signals: string[];
  };
  recommendedCooldown: string;
  safeToMonetize: boolean;
}

export interface MonetizationBenchmark {
  metric: string;
  yourValue: number;
  benchmarkValue: number;
  percentile: number;
  status: "above" | "at" | "below";
  recommendation: string;
}

export interface MonetizationTimingAnalysis {
  currentPressure: MonetizationPressure;
  benchmarks: MonetizationBenchmark[];
  optimalTimingWindows: Array<{
    window: string;
    reason: string;
    monetizationType: string;
    expectedImpact: string;
  }>;
  revenueConfidence: {
    totalRevenue: number;
    verifiedPercent: number;
    confidenceLabel: string;
  };
  monthlyMonetizationEvents: number;
  recommendedMonthlyLimit: number;
  recommendations: string[];
}

const BENCHMARK_DATA: Record<string, { small: number; medium: number; large: number }> = {
  rpmDollars: { small: 2.0, medium: 5.0, large: 10.0 },
  sponsorRatePerVideo: { small: 100, medium: 500, large: 2000 },
  revenuePerSub: { small: 0.01, medium: 0.05, large: 0.10 },
  monthlyAdsPerVideo: { small: 1, medium: 2, large: 3 },
  commerceConversion: { small: 0.01, medium: 0.025, large: 0.05 },
  diversificationScore: { small: 20, medium: 50, large: 75 },
};

function getChannelSize(subs: number): "small" | "medium" | "large" {
  if (subs >= 100000) return "large";
  if (subs >= 10000) return "medium";
  return "small";
}

export async function analyzeMonetizationTiming(userId: string): Promise<MonetizationTimingAnalysis> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [records, userChannels, userVideos, recentDistEvents] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(200),
    db.select().from(distributionEvents)
      .where(eq(distributionEvents.userId, userId))
      .orderBy(desc(distributionEvents.createdAt))
      .limit(100),
  ]);

  const confidence = computeRevenueConfidence(records);
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const size = getChannelSize(totalSubs);

  const recentMonetizationRecords = records.filter(r =>
    r.recordedAt && r.recordedAt >= thirtyDaysAgo
  );
  const monthlyMonetizationEvents = recentMonetizationRecords.length;

  const sponsoredVideoCount = userVideos.filter(v =>
    v.metadata?.brandKeywords?.length || v.title.toLowerCase().includes("sponsored")
  ).length;

  const monetizationDensity = userVideos.length > 0
    ? Math.round((sponsoredVideoCount / userVideos.length) * 100) : 0;

  const blockedEvents = recentDistEvents.filter(e => e.status === "blocked");
  const trustBudgetUsage = recentDistEvents.length > 0
    ? Math.round((blockedEvents.length / recentDistEvents.length) * 100) : 0;

  const fatigueSignals: string[] = [];
  if (monetizationDensity > 30) fatigueSignals.push("High sponsored content ratio may cause audience fatigue");
  if (monthlyMonetizationEvents > 20) fatigueSignals.push("High frequency of monetization events this month");
  if (trustBudgetUsage > 50) fatigueSignals.push("Trust budget is heavily utilized — slow down distribution");

  const fatigueScore = Math.min(100, monetizationDensity * 0.4 + trustBudgetUsage * 0.3 + Math.min(monthlyMonetizationEvents * 2, 30));

  const overallPressure = Math.round(fatigueScore);
  const pressureLevel: MonetizationPressure["pressureLevel"] =
    overallPressure >= 75 ? "critical" : overallPressure >= 50 ? "high" : overallPressure >= 25 ? "moderate" : "low";

  const safeToMonetize = overallPressure < 60;
  const recommendedCooldown = overallPressure >= 75 ? "7-14 days" :
    overallPressure >= 50 ? "3-5 days" : overallPressure >= 25 ? "1-2 days" : "No cooldown needed";

  const totalRevenue = confidence.totalRevenue;
  const revenuePerSub = totalSubs > 0 ? totalRevenue / totalSubs : 0;
  const rpm = totalViews > 0 ? (totalRevenue / totalViews) * 1000 : 0;
  const sourceCount = new Set(records.map(r => r.source)).size;
  const diversification = Math.min(100, sourceCount * 15 + (sourceCount >= 4 ? 20 : 0));

  const benchmarks: MonetizationBenchmark[] = [
    makeBenchmark("Revenue Per 1K Views (RPM)", Math.round(rpm * 100) / 100, BENCHMARK_DATA.rpmDollars[size]),
    makeBenchmark("Revenue Per Subscriber", Math.round(revenuePerSub * 1000) / 1000, BENCHMARK_DATA.revenuePerSub[size]),
    makeBenchmark("Revenue Diversification", diversification, BENCHMARK_DATA.diversificationScore[size]),
    makeBenchmark("Commerce Conversion Rate", monetizationDensity / 100, BENCHMARK_DATA.commerceConversion[size]),
  ];

  const recommendedMonthlyLimit = Math.max(5, Math.round(20 - overallPressure * 0.15));

  const optimalTimingWindows = [
    { window: "Post-viral content", reason: "Audience engagement is highest after a viral hit", monetizationType: "Merchandise launch", expectedImpact: "2-3x normal conversion" },
    { window: "Subscriber milestone", reason: "Audience goodwill peaks at milestones", monetizationType: "Membership/subscription offer", expectedImpact: "1.5x signup rate" },
    { window: "Game release week", reason: "Search traffic spikes during new game releases", monetizationType: "Sponsored content + affiliate", expectedImpact: "3-5x normal views" },
    { window: "Holiday season (Nov-Dec)", reason: "Gift-buying drives commerce revenue", monetizationType: "Merchandise + affiliate push", expectedImpact: "2-4x commerce revenue" },
  ];

  const recommendations: string[] = [];
  if (overallPressure >= 50) recommendations.push("Reduce monetization frequency — audience fatigue is building");
  if (trustBudgetUsage > 30) recommendations.push("Trust budget is being consumed — space out sponsored and promotional content");
  if (diversification < 40) recommendations.push("Revenue is concentrated — add 2+ new monetization streams");
  if (rpm < BENCHMARK_DATA.rpmDollars[size]) recommendations.push(`RPM ($${rpm.toFixed(2)}) is below benchmark ($${BENCHMARK_DATA.rpmDollars[size]}) — optimize ad placement`);
  recommendations.push("Align monetization with content calendar to maximize impact while minimizing fatigue");

  return {
    currentPressure: {
      overallPressure,
      pressureLevel,
      trustBudgetUsage,
      monetizationDensity,
      audienceFatigue: { score: Math.round(fatigueScore), signals: fatigueSignals },
      recommendedCooldown,
      safeToMonetize,
    },
    benchmarks,
    optimalTimingWindows,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    monthlyMonetizationEvents,
    recommendedMonthlyLimit,
    recommendations,
  };
}

function makeBenchmark(metric: string, yourValue: number, benchmarkValue: number): MonetizationBenchmark {
  const ratio = benchmarkValue > 0 ? yourValue / benchmarkValue : 0;
  const percentile = Math.min(99, Math.max(1, Math.round(ratio * 50)));
  const status: MonetizationBenchmark["status"] = ratio >= 1.1 ? "above" : ratio >= 0.9 ? "at" : "below";

  return {
    metric,
    yourValue,
    benchmarkValue,
    percentile,
    status,
    recommendation: status === "above" ? "Performing well — maintain current strategy" :
      status === "at" ? "On par with similar channels — look for incremental improvements" :
        `Below benchmark — focus on improving ${metric.toLowerCase()}`,
  };
}
