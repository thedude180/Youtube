import { db } from "../db";
import { revenueRecords, channels, videos } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface SocialCommerceOpportunity {
  platform: string;
  checkoutCapability: "native" | "link-based" | "none";
  estimatedConversionRate: number;
  readiness: "ready" | "setup-needed" | "not-available";
  setupSteps: string[];
  estimatedMonthlyRevenue: number;
}

export interface OfferProfile {
  offerType: string;
  suitability: number;
  estimatedRevenue: number;
  implementationEffort: "low" | "medium" | "high";
  description: string;
}

export interface CommerceIntelligence {
  socialCommerceOpportunities: SocialCommerceOpportunity[];
  nativeCheckoutReadiness: number;
  offerOperatingSystem: {
    activeOffers: OfferProfile[];
    recommendedOffers: OfferProfile[];
    conversionOptimizations: string[];
  };
  commerceMetrics: {
    totalCommerceRevenue: number;
    commerceRevenueShare: number;
    topCommerceSource: string;
    avgOrderValue: number;
  };
  revenueConfidence: {
    commerceRevenue: number;
    verifiedAmount: number;
    confidenceLabel: string;
  };
  recommendations: string[];
}

const PLATFORM_COMMERCE: Record<string, { checkoutCapability: SocialCommerceOpportunity["checkoutCapability"]; conversionRate: number }> = {
  youtube: { checkoutCapability: "link-based", conversionRate: 0.02 },
  twitch: { checkoutCapability: "link-based", conversionRate: 0.015 },
  kick: { checkoutCapability: "link-based", conversionRate: 0.01 },
  tiktok: { checkoutCapability: "native", conversionRate: 0.03 },
  discord: { checkoutCapability: "link-based", conversionRate: 0.04 },
  x: { checkoutCapability: "link-based", conversionRate: 0.01 },
  rumble: { checkoutCapability: "none", conversionRate: 0.005 },
};

const OFFER_TYPES: Array<{ type: string; baseRevenue: number; effort: OfferProfile["implementationEffort"]; description: string }> = [
  { type: "Merchandise", baseRevenue: 500, effort: "medium", description: "Branded gaming merchandise (apparel, accessories, collectibles)" },
  { type: "Digital Products", baseRevenue: 300, effort: "low", description: "Gaming guides, wallpapers, overlays, presets" },
  { type: "Membership / Subscription", baseRevenue: 800, effort: "medium", description: "Exclusive content, early access, member-only streams" },
  { type: "Coaching / Consulting", baseRevenue: 1000, effort: "high", description: "1-on-1 gaming coaching, channel growth consulting" },
  { type: "Affiliate Products", baseRevenue: 400, effort: "low", description: "Affiliate links for gaming gear, software, and services" },
  { type: "Courses / Tutorials", baseRevenue: 1200, effort: "high", description: "In-depth gaming strategy courses, content creation tutorials" },
];

export async function analyzeCommerceIntelligence(userId: string): Promise<CommerceIntelligence> {
  const [records, userChannels, userVideos] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .limit(200),
  ]);

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);

  const commerceKeywords = ["merch", "merchandise", "product", "affiliate", "commission", "course", "membership", "coaching"];
  const commerceRecords = records.filter(r =>
    commerceKeywords.some(k => r.source.toLowerCase().includes(k))
  );
  const allConfidence = computeRevenueConfidence(records);
  const commerceConfidence = computeRevenueConfidence(commerceRecords);

  const totalRevenue = allConfidence.totalRevenue;
  const totalCommerceRevenue = commerceConfidence.totalRevenue;
  const commerceRevenueShare = totalRevenue > 0 ? Math.round((totalCommerceRevenue / totalRevenue) * 100) : 0;

  const revenueBySource = new Map<string, number>();
  for (const r of commerceRecords) {
    revenueBySource.set(r.source, (revenueBySource.get(r.source) || 0) + r.amount);
  }
  const topCommerceSource = revenueBySource.size > 0
    ? Array.from(revenueBySource.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : "None";
  const avgOrderValue = commerceRecords.length > 0
    ? Math.round(totalCommerceRevenue / commerceRecords.length) : 0;

  const socialCommerceOpportunities: SocialCommerceOpportunity[] = userChannels.map(c => {
    const commerce = PLATFORM_COMMERCE[c.platform] || { checkoutCapability: "none" as const, conversionRate: 0.005 };
    const monthlyViews = (c.viewCount || 0) / Math.max(1, Math.floor((Date.now() - (c.createdAt?.getTime() || Date.now())) / (30 * 24 * 60 * 60 * 1000)));
    const estimatedMonthlyRevenue = Math.round(monthlyViews * commerce.conversionRate * avgOrderValue || monthlyViews * commerce.conversionRate * 15);

    return {
      platform: c.platform,
      checkoutCapability: commerce.checkoutCapability,
      estimatedConversionRate: commerce.conversionRate,
      readiness: commerce.checkoutCapability === "native" ? "ready" as const :
        commerce.checkoutCapability === "link-based" ? "setup-needed" as const : "not-available" as const,
      setupSteps: commerce.checkoutCapability === "native"
        ? ["Enable shop integration in platform settings", "Link product catalog", "Add checkout button to content"]
        : commerce.checkoutCapability === "link-based"
          ? ["Add affiliate/product links to video descriptions", "Use pinned comments for product links", "Add link-in-bio page"]
          : ["Platform does not support commerce — use external links"],
      estimatedMonthlyRevenue,
    };
  });

  const nativeCheckoutReadiness = socialCommerceOpportunities.length > 0
    ? Math.round(socialCommerceOpportunities.filter(o => o.readiness !== "not-available").length / socialCommerceOpportunities.length * 100)
    : 0;

  const audienceMultiplier = Math.min(3, Math.max(0.5, totalSubs / 10000));
  const activeOffers: OfferProfile[] = OFFER_TYPES
    .filter(ot => commerceRecords.some(r => r.source.toLowerCase().includes(ot.type.toLowerCase().split(" ")[0])))
    .map(ot => ({
      offerType: ot.type,
      suitability: Math.min(100, Math.round(60 + audienceMultiplier * 10)),
      estimatedRevenue: Math.round(ot.baseRevenue * audienceMultiplier),
      implementationEffort: ot.effort,
      description: ot.description,
    }));

  const recommendedOffers: OfferProfile[] = OFFER_TYPES
    .filter(ot => !activeOffers.some(a => a.offerType === ot.type))
    .map(ot => ({
      offerType: ot.type,
      suitability: Math.min(100, Math.round(50 + audienceMultiplier * 10 + (ot.effort === "low" ? 10 : 0))),
      estimatedRevenue: Math.round(ot.baseRevenue * audienceMultiplier),
      implementationEffort: ot.effort,
      description: ot.description,
    }))
    .sort((a, b) => b.suitability - a.suitability);

  const conversionOptimizations = [
    "Add clear CTAs in video descriptions linking to products",
    "Use pinned comments on popular videos for product promotion",
    "Create dedicated 'shop' or 'gear' pages on your website",
    "Offer exclusive discounts to subscribers/members",
    "Test different price points and bundle offers",
  ];

  const recommendations: string[] = [];
  if (commerceRevenueShare < 10) recommendations.push("Commerce revenue is underrepresented — explore merchandise and digital products");
  if (socialCommerceOpportunities.some(o => o.readiness === "ready" && o.estimatedMonthlyRevenue > 100)) {
    recommendations.push("Native checkout opportunities are available — prioritize TikTok Shop or similar integrations");
  }
  if (activeOffers.length < 2) recommendations.push("Expand offer portfolio — start with low-effort affiliate products and digital downloads");
  if (avgOrderValue < 10 && commerceRecords.length > 0) recommendations.push("Average order value is low — consider bundling products or offering premium tiers");
  recommendations.push("Track conversion rates per platform to identify highest-performing commerce channels");

  return {
    socialCommerceOpportunities,
    nativeCheckoutReadiness,
    offerOperatingSystem: {
      activeOffers,
      recommendedOffers,
      conversionOptimizations,
    },
    commerceMetrics: {
      totalCommerceRevenue: Math.round(totalCommerceRevenue),
      commerceRevenueShare,
      topCommerceSource,
      avgOrderValue,
    },
    revenueConfidence: {
      commerceRevenue: Math.round(commerceConfidence.totalRevenue),
      verifiedAmount: Math.round(commerceConfidence.verifiedRevenue),
      confidenceLabel: commerceConfidence.confidenceLabel,
    },
    recommendations,
  };
}
