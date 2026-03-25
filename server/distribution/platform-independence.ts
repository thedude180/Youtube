import { db } from "../db";
import { platformDependencyScores, platformIndependenceScores, distributionEvents } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type DependencyAssessment = {
  platform: string;
  dependencyScore: number;
  revenueShare: number;
  audienceShare: number;
  contentShare: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  migrationReadiness: number;
  recommendations: string[];
};

type IndependenceRoadmap = {
  userId: string;
  overallScore: number;
  singlePlatformRisk: number;
  diversificationScore: number;
  dataSovereigntyScore: number;
  dependencies: DependencyAssessment[];
  roadmap: string[];
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "platform-independence", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

export async function assessPlatformIndependence(userId: string): Promise<IndependenceRoadmap> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, overallScore: 0, singlePlatformRisk: 1, diversificationScore: 0, dataSovereigntyScore: 0, dependencies: [], roadmap: [] };
  }

  const depScores = await db.select().from(platformDependencyScores)
    .where(eq(platformDependencyScores.userId, userId))
    .orderBy(desc(platformDependencyScores.dependencyScore))
    .limit(10);

  const recentEvents = await db.select().from(distributionEvents)
    .where(and(eq(distributionEvents.userId, userId), gte(distributionEvents.createdAt, daysAgo(30))))
    .limit(500);

  const platformEventCounts: Record<string, number> = {};
  for (const e of recentEvents) {
    platformEventCounts[e.platform] = (platformEventCounts[e.platform] || 0) + 1;
  }
  const totalEvents = Object.values(platformEventCounts).reduce((a, b) => a + b, 0) || 1;

  const dependencies: DependencyAssessment[] = [];

  if (depScores.length > 0) {
    for (const d of depScores) {
      const eventShare = (platformEventCounts[d.platform] || 0) / totalEvents;
      const depScore = d.dependencyScore ?? 0;
      const riskLevel = depScore > 0.8 ? "critical" : depScore > 0.6 ? "high" : depScore > 0.3 ? "medium" : "low";
      const recs: string[] = d.recommendations || [];
      if (depScore > 0.7) recs.push(`Reduce ${d.platform} dependency — diversify to other platforms`);
      if (eventShare > 0.7) recs.push(`${d.platform} accounts for ${(eventShare * 100).toFixed(0)}% of activity — spread distribution`);

      dependencies.push({
        platform: d.platform,
        dependencyScore: depScore,
        revenueShare: d.revenueShare ?? 0,
        audienceShare: d.audienceShare ?? 0,
        contentShare: d.contentShare ?? eventShare,
        riskLevel: riskLevel as any,
        migrationReadiness: d.migrationReadiness ?? 0,
        recommendations: recs,
      });
    }
  } else {
    for (const [platform, count] of Object.entries(platformEventCounts)) {
      const share = count / totalEvents;
      dependencies.push({
        platform,
        dependencyScore: share,
        revenueShare: share,
        audienceShare: share,
        contentShare: share,
        riskLevel: share > 0.8 ? "critical" : share > 0.6 ? "high" : share > 0.3 ? "medium" : "low",
        migrationReadiness: 0.3,
        recommendations: share > 0.6 ? [`High dependency on ${platform} — consider diversification`] : [],
      });
    }
  }

  const maxDep = dependencies.length > 0 ? Math.max(...dependencies.map(d => d.dependencyScore)) : 0;
  const singlePlatformRisk = maxDep;
  const uniquePlatforms = dependencies.filter(d => d.contentShare > 0.05).length;
  const diversificationScore = Math.min(1, uniquePlatforms / 5);
  const dataSovereigntyScore = dependencies.length > 0
    ? dependencies.reduce((s, d) => s + d.migrationReadiness, 0) / dependencies.length : 0;
  const overallScore = (1 - singlePlatformRisk) * 0.4 + diversificationScore * 0.3 + dataSovereigntyScore * 0.3;

  const roadmap: string[] = [];
  if (singlePlatformRisk > 0.7) roadmap.push("URGENT: Single platform dependency exceeds 70% — prioritize multi-platform distribution");
  if (diversificationScore < 0.4) roadmap.push("Expand to at least 3 active platforms within 30 days");
  if (dataSovereigntyScore < 0.3) roadmap.push("Set up content backup and data export capabilities");
  if (dependencies.some(d => d.migrationReadiness < 0.2)) roadmap.push("Build migration tooling for platforms with low readiness");
  if (overallScore > 0.7) roadmap.push("Platform independence is strong — maintain current diversification");

  await db.insert(platformIndependenceScores).values({
    userId,
    overallScore,
    singlePlatformRisk,
    diversificationScore,
    dataSovereigntyScore,
    roadmap,
    platformBreakdown: Object.fromEntries(dependencies.map(d => [d.platform, { dep: d.dependencyScore, risk: d.riskLevel }])),
  }).catch(() => {});

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "independence.assessed", {
      overallScore, singlePlatformRisk, platformCount: dependencies.length,
    }, "platform-independence", "assessment");
  } catch {}

  return { userId, overallScore, singlePlatformRisk, diversificationScore, dataSovereigntyScore, dependencies, roadmap };
}
