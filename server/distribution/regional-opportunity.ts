import { db } from "../db";
import { liveAudienceGeo, trendingTopics, competitorTracks } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type RegionalOpportunity = {
  country: string;
  region: string | null;
  audiencePercentage: number;
  viewerCount: number;
  trendingTopics: string[];
  underservedNiches: string[];
  opportunityScore: number;
  recommendation: string;
};

type RegionalAnalysis = {
  userId: string;
  regions: RegionalOpportunity[];
  topRegion: RegionalOpportunity | null;
  geoDiversity: number;
  recommendations: string[];
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "regional-opportunity", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function analyzeRegionalOpportunities(userId: string): Promise<RegionalAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, regions: [], topRegion: null, geoDiversity: 0, recommendations: [] };
  }

  const geoData = await db.select().from(liveAudienceGeo)
    .where(eq(liveAudienceGeo.userId, userId))
    .orderBy(desc(liveAudienceGeo.viewerCount))
    .limit(50);

  const trends = await db.select().from(trendingTopics)
    .where(eq(trendingTopics.userId, userId))
    .orderBy(desc(trendingTopics.trendScore))
    .limit(30);

  const competitors = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .limit(30);

  const countryAgg: Record<string, { viewerCount: number; percentage: number; region: string | null }> = {};
  for (const g of geoData) {
    const existing = countryAgg[g.country] || { viewerCount: 0, percentage: 0, region: g.region };
    existing.viewerCount += g.viewerCount ?? 0;
    existing.percentage += g.percentage ?? 0;
    countryAgg[g.country] = existing;
  }

  const regions: RegionalOpportunity[] = [];
  const recommendations: string[] = [];

  for (const [country, data] of Object.entries(countryAgg)) {
    const regionalTrends = trends
      .filter(t => {
        const relatedKw = t.relatedKeywords || [];
        return relatedKw.some(k => k.toLowerCase().includes(country.toLowerCase()));
      })
      .map(t => t.topic);

    const competitorCoverage = competitors.filter(c =>
      c.strengths?.some(s => s.toLowerCase().includes(country.toLowerCase()))
    ).length;

    const underservedNiches: string[] = [];
    if (competitorCoverage === 0) {
      underservedNiches.push(`No tracked competitors targeting ${country}`);
    }
    if (data.viewerCount > 100 && data.percentage > 5) {
      underservedNiches.push(`Significant audience (${data.percentage.toFixed(1)}%) with localization potential`);
    }

    const opportunityScore = Math.min(1,
      (data.percentage / 100) * 0.4 +
      (regionalTrends.length > 0 ? 0.3 : 0) +
      (competitorCoverage === 0 ? 0.3 : 0.1)
    );

    let recommendation = "";
    if (opportunityScore > 0.5) {
      recommendation = `${country}: High-value regional audience — consider localized titles/tags`;
    } else if (data.percentage > 3) {
      recommendation = `${country}: Growing audience segment — monitor for content opportunities`;
    } else {
      recommendation = `${country}: Niche audience — low priority for targeted content`;
    }

    regions.push({
      country,
      region: data.region,
      audiencePercentage: data.percentage,
      viewerCount: data.viewerCount,
      trendingTopics: regionalTrends,
      underservedNiches,
      opportunityScore,
      recommendation,
    });
  }

  if (regions.length === 0) {
    recommendations.push("No audience geography data available — enable geo tracking for regional insights");
  }

  regions.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const topRegion = regions.length > 0 ? regions[0] : null;

  for (const r of regions.slice(0, 3)) {
    if (r.opportunityScore > 0.4) {
      recommendations.push(r.recommendation);
    }
  }

  const uniqueCountries = new Set(regions.map(r => r.country));
  const geoDiversity = Math.min(1, uniqueCountries.size / 10);

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "regional.opportunity.analyzed", {
      regionCount: regions.length, geoDiversity, topCountry: topRegion?.country,
    }, "regional-opportunity", "analysis");
  } catch {}

  return { userId, regions, topRegion, geoDiversity, recommendations };
}

export async function getRegionalTrends(userId: string, country: string): Promise<string[]> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) return [];

  const trends = await db.select().from(trendingTopics)
    .where(eq(trendingTopics.userId, userId))
    .orderBy(desc(trendingTopics.trendScore))
    .limit(30);

  return trends
    .filter(t => {
      const relatedKw = t.relatedKeywords || [];
      return relatedKw.some(k => k.toLowerCase().includes(country.toLowerCase()));
    })
    .map(t => t.topic);
}
