import { db } from "../db";
import { competitorTracks, contentGapSuggestions, trendingTopics } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

type CompetitorInsight = {
  competitor: string;
  platform: string;
  subscriberTier: string;
  uploadCadence: string;
  strengths: string[];
  opportunities: string[];
  contentGaps: string[];
  threatLevel: "low" | "medium" | "high";
};

type CompetitorAnalysis = {
  userId: string;
  competitors: CompetitorInsight[];
  contentGaps: string[];
  publishingPatternInsights: string[];
  topicOpportunities: string[];
  overallCompetitivePosition: number;
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "competitor-intelligence", 3);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

function classifySubscriberTier(subs: number | null): string {
  if (!subs) return "unknown";
  if (subs >= 1000000) return "mega";
  if (subs >= 100000) return "large";
  if (subs >= 10000) return "medium";
  if (subs >= 1000) return "small";
  return "micro";
}

function assessThreatLevel(competitor: typeof competitorTracks.$inferSelect): "low" | "medium" | "high" {
  const subs = competitor.subscribers || 0;
  const avgViews = competitor.avgViews || 0;
  if (subs > 100000 && avgViews > 10000) return "high";
  if (subs > 10000 || avgViews > 5000) return "medium";
  return "low";
}

export async function analyzeCompetitors(userId: string): Promise<CompetitorAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return {
      userId,
      competitors: [],
      contentGaps: [],
      publishingPatternInsights: [],
      topicOpportunities: [],
      overallCompetitivePosition: 0,
    };
  }

  const tracks = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .orderBy(desc(competitorTracks.lastAnalyzedAt))
    .limit(50);

  const gaps = await db.select().from(contentGapSuggestions)
    .where(eq(contentGapSuggestions.userId, userId))
    .orderBy(desc(contentGapSuggestions.priority))
    .limit(20);

  const competitors: CompetitorInsight[] = tracks.map(t => ({
    competitor: t.competitorName,
    platform: t.platform,
    subscriberTier: classifySubscriberTier(t.subscribers),
    uploadCadence: t.uploadFrequency || "unknown",
    strengths: t.strengths || [],
    opportunities: t.opportunities || [],
    contentGaps: [],
    threatLevel: assessThreatLevel(t),
  }));

  const contentGapsList = gaps.map(g => g.topic);

  const publishingPatternInsights: string[] = [];
  const cadenceGroups: Record<string, number> = {};
  for (const t of tracks) {
    const cadence = t.uploadFrequency || "unknown";
    cadenceGroups[cadence] = (cadenceGroups[cadence] || 0) + 1;
  }
  for (const [cadence, count] of Object.entries(cadenceGroups)) {
    publishingPatternInsights.push(`${count} competitors publish ${cadence}`);
  }

  const topicOpportunities: string[] = [];
  for (const gap of gaps) {
    if (gap.status === "suggested" && (gap.estimatedDemand || 0) > 0.5) {
      topicOpportunities.push(`${gap.topic}: ${gap.suggestedAngle || "explore this topic"} (demand: ${(gap.estimatedDemand || 0).toFixed(1)})`);
    }
  }

  const highThreats = competitors.filter(c => c.threatLevel === "high").length;
  const overallCompetitivePosition = Math.max(0, Math.min(1,
    1 - (highThreats * 0.2) - (competitors.length > 20 ? 0.1 : 0) + (contentGapsList.length * 0.05)
  ));

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "competitor.analyzed", {
      competitorCount: competitors.length, gapCount: contentGapsList.length,
    }, "competitor-intelligence", "analysis");
  } catch {}

  return {
    userId,
    competitors,
    contentGaps: contentGapsList,
    publishingPatternInsights,
    topicOpportunities,
    overallCompetitivePosition,
  };
}

export async function getCompetitorBlindSpots(userId: string, platform?: string): Promise<string[]> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) return [];

  const tracks = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .limit(50);

  const filtered = platform ? tracks.filter(t => t.platform === platform) : tracks;
  const blindSpots: string[] = [];

  for (const t of filtered) {
    if (t.opportunities && t.opportunities.length > 0) {
      blindSpots.push(...t.opportunities.map(o => `${t.competitorName}: ${o}`));
    }
  }

  return blindSpots;
}
