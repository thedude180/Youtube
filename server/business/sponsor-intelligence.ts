import { db } from "../db";
import { revenueRecords, channels, videos, sponsorshipDeals } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface SponsorFitScore {
  overallFit: number;
  audienceAlignment: number;
  brandSafety: number;
  dealValuePotential: number;
  contentFit: number;
  recommendation: string;
}

export interface SponsorIntelligence {
  sponsorFitScores: Array<{
    category: string;
    fitScore: SponsorFitScore;
    estimatedDealRange: { low: number; high: number };
    idealDealStructure: string;
  }>;
  marketRates: {
    cpm: { estimated: number; marketAvg: number; premium: boolean };
    flatRate: { estimated: number; basis: string };
    performanceBased: { estimatedCpv: number; basis: string };
  };
  audienceProfile: {
    totalSubscribers: number;
    totalViews: number;
    platformBreakdown: Array<{ platform: string; subscribers: number; views: number }>;
    niche: string;
    avgViewsPerVideo: number;
  };
  brandSafetyScore: number;
  optimalDealStructures: string[];
  revenueConfidence: {
    sponsorshipRevenue: number;
    verifiedSponsorRevenue: number;
    confidenceLabel: string;
  };
  pipelineForecast: {
    estimatedQuarterlyValue: number;
    potentialDeals: number;
    confidence: string;
  };
}

const SPONSOR_CATEGORIES = [
  { category: "Gaming Hardware", baseCpm: 30, audienceMultiplier: 1.2 },
  { category: "Gaming Accessories", baseCpm: 25, audienceMultiplier: 1.1 },
  { category: "Energy Drinks / Snacks", baseCpm: 20, audienceMultiplier: 1.0 },
  { category: "VPN / Software", baseCpm: 35, audienceMultiplier: 0.9 },
  { category: "Mobile Games", baseCpm: 40, audienceMultiplier: 0.8 },
  { category: "Subscription Services", baseCpm: 28, audienceMultiplier: 1.0 },
];

export async function analyzeSponsorIntelligence(userId: string): Promise<SponsorIntelligence> {
  const [records, userChannels, userVideos, deals] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(200),
    db.select().from(sponsorshipDeals)
      .where(eq(sponsorshipDeals.userId, userId))
      .orderBy(desc(sponsorshipDeals.createdAt))
      .limit(100),
  ]);

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const avgViewsPerVideo = userVideos.length > 0
    ? userVideos.reduce((s, v) => s + (v.metadata?.viewCount || v.metadata?.stats?.views || 0), 0) / userVideos.length
    : 0;

  const niche = userChannels[0]?.contentNiche || "gaming";

  const platformBreakdown = userChannels.map(c => ({
    platform: c.platform,
    subscribers: c.subscriberCount || 0,
    views: c.viewCount || 0,
  }));

  const sponsorRecords = records.filter(r =>
    r.source.toLowerCase().includes("sponsor") || r.source.toLowerCase().includes("brand")
  );
  const confidence = computeRevenueConfidence(sponsorRecords);

  const brandSafetyScore = Math.min(100, 70 + (userVideos.length > 20 ? 10 : 0) + (userChannels.length > 1 ? 10 : 0) + (totalSubs > 5000 ? 10 : 0));

  const baseCpm = avgViewsPerVideo > 0 ? Math.max(15, Math.min(60, (totalSubs / 1000) * 0.5 + 15)) : 20;
  const flatRate = avgViewsPerVideo * (baseCpm / 1000);
  const cpv = avgViewsPerVideo > 0 ? Math.max(0.02, Math.min(0.15, flatRate / Math.max(avgViewsPerVideo, 1))) : 0.05;

  const sponsorFitScores = SPONSOR_CATEGORIES.map(cat => {
    const audienceAlignment = Math.min(100, Math.round(70 + (niche === "gaming" ? 20 : 0) + Math.min(10, totalSubs / 10000)));
    const contentFit = Math.min(100, Math.round(60 + (userVideos.length > 50 ? 20 : userVideos.length > 20 ? 10 : 0) + (niche === "gaming" ? 10 : 0)));
    const dealValuePotential = Math.min(100, Math.round(Math.min(avgViewsPerVideo / 500, 50) + Math.min(totalSubs / 5000, 50)));
    const overallFit = Math.round(audienceAlignment * 0.3 + brandSafetyScore * 0.2 + dealValuePotential * 0.3 + contentFit * 0.2);

    const estimatedDealValue = flatRate * cat.audienceMultiplier;
    return {
      category: cat.category,
      fitScore: {
        overallFit,
        audienceAlignment,
        brandSafety: brandSafetyScore,
        dealValuePotential,
        contentFit,
        recommendation: overallFit >= 70 ? "Strong fit — actively pursue" : overallFit >= 50 ? "Moderate fit — consider selectively" : "Low fit — deprioritize",
      },
      estimatedDealRange: {
        low: Math.round(estimatedDealValue * 0.7),
        high: Math.round(estimatedDealValue * 1.5),
      },
      idealDealStructure: estimatedDealValue > 500 ? "Flat fee + performance bonus" : "Flat fee per video",
    };
  });

  const completedDeals = deals.filter(d => d.status === "completed" || d.status === "active");
  const avgDealValue = completedDeals.length > 0
    ? completedDeals.reduce((s, d) => s + (d.dealValue || 0), 0) / completedDeals.length : flatRate;

  return {
    sponsorFitScores,
    marketRates: {
      cpm: { estimated: Math.round(baseCpm * 100) / 100, marketAvg: 25, premium: baseCpm > 25 },
      flatRate: { estimated: Math.round(flatRate), basis: `${Math.round(avgViewsPerVideo)} avg views × $${baseCpm.toFixed(2)} CPM` },
      performanceBased: { estimatedCpv: Math.round(cpv * 1000) / 1000, basis: `Based on ${Math.round(avgViewsPerVideo)} avg views` },
    },
    audienceProfile: {
      totalSubscribers: totalSubs,
      totalViews: totalViews,
      platformBreakdown,
      niche,
      avgViewsPerVideo: Math.round(avgViewsPerVideo),
    },
    brandSafetyScore,
    optimalDealStructures: [
      "Dedicated video sponsorship (30-60s integration)",
      "Pre-roll mention with CTA",
      "Product placement during gameplay",
      "Multi-video package deal (3-5 videos)",
      "Affiliate link + flat fee hybrid",
    ],
    revenueConfidence: {
      sponsorshipRevenue: Math.round(confidence.totalRevenue),
      verifiedSponsorRevenue: Math.round(confidence.verifiedRevenue),
      confidenceLabel: confidence.confidenceLabel,
    },
    pipelineForecast: {
      estimatedQuarterlyValue: Math.round(avgDealValue * Math.max(completedDeals.length * 0.3, 1)),
      potentialDeals: Math.max(1, Math.round(completedDeals.length * 0.5)),
      confidence: completedDeals.length >= 5 ? "high" : completedDeals.length >= 2 ? "medium" : "low",
    },
  };
}
