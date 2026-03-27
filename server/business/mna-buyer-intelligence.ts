import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface BuyerProfile {
  buyerType: "media_company" | "gaming_company" | "mcn" | "private_equity" | "strategic_acquirer";
  interestLevel: number;
  valuationMultiple: number;
  preferredMetrics: string[];
  dealBreakers: string[];
}

export interface MnAReadinessAssessment {
  channelId: string;
  overallReadiness: number;
  potentialBuyers: BuyerProfile[];
  strengths: string[];
  weaknesses: string[];
  valuationRange: { low: number; mid: number; high: number };
  timeToReady: string;
  recommendations: string[];
  assessedAt: Date;
}

const DEFAULT_BUYER_PROFILES: BuyerProfile[] = [
  { buyerType: "media_company", interestLevel: 0, valuationMultiple: 3.5, preferredMetrics: ["subscriber_count", "monthly_views", "brand_safety"], dealBreakers: ["copyright_issues", "brand_controversy"] },
  { buyerType: "gaming_company", interestLevel: 0, valuationMultiple: 4.0, preferredMetrics: ["gaming_audience", "engagement_rate", "content_catalog_size"], dealBreakers: ["non_gaming_focus", "declining_views"] },
  { buyerType: "mcn", interestLevel: 0, valuationMultiple: 2.5, preferredMetrics: ["subscriber_growth", "content_consistency", "monetization_rate"], dealBreakers: ["exclusive_contracts", "low_upload_frequency"] },
  { buyerType: "private_equity", interestLevel: 0, valuationMultiple: 5.0, preferredMetrics: ["revenue_growth", "profit_margin", "founder_dependency_score"], dealBreakers: ["high_founder_dependency", "single_revenue_stream"] },
  { buyerType: "strategic_acquirer", interestLevel: 0, valuationMultiple: 6.0, preferredMetrics: ["unique_ip", "audience_demographics", "technology_stack"], dealBreakers: ["no_proprietary_content", "legal_issues"] },
];

export function assessMnAReadiness(
  channelId: string,
  metrics: {
    monthlyRevenue: number;
    subscriberCount: number;
    monthlyViews: number;
    contentCount: number;
    founderDependencyScore: number;
    revenueStreamCount: number;
    brandSafetyScore: number;
  }
): MnAReadinessAssessment {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (metrics.monthlyRevenue > 5000) strengths.push("Strong monthly revenue");
  else weaknesses.push("Revenue below typical acquisition threshold");

  if (metrics.subscriberCount > 100000) strengths.push("Large subscriber base");
  else if (metrics.subscriberCount > 10000) strengths.push("Growing subscriber base");
  else weaknesses.push("Subscriber count below acquisition interest level");

  if (metrics.founderDependencyScore < 0.4) strengths.push("Low founder dependency — transferable operations");
  else weaknesses.push("High founder dependency — acquisition risk");

  if (metrics.revenueStreamCount >= 3) strengths.push("Diversified revenue streams");
  else weaknesses.push("Revenue stream concentration");

  if (metrics.brandSafetyScore > 0.8) strengths.push("High brand safety score");
  if (metrics.contentCount > 200) strengths.push("Large content catalog");

  const readinessFactors = [
    Math.min(1, metrics.monthlyRevenue / 10000) * 0.25,
    Math.min(1, metrics.subscriberCount / 100000) * 0.2,
    (1 - metrics.founderDependencyScore) * 0.2,
    Math.min(1, metrics.revenueStreamCount / 4) * 0.15,
    metrics.brandSafetyScore * 0.1,
    Math.min(1, metrics.contentCount / 300) * 0.1,
  ];
  const overallReadiness = readinessFactors.reduce((a, b) => a + b, 0);

  const potentialBuyers = DEFAULT_BUYER_PROFILES.map((bp) => ({
    ...bp,
    interestLevel: Math.min(1, overallReadiness * bp.valuationMultiple / 5),
  }));

  const annualRevenue = metrics.monthlyRevenue * 12;
  const valuationRange = {
    low: annualRevenue * 2,
    mid: annualRevenue * 3.5,
    high: annualRevenue * 6,
  };

  if (overallReadiness < 0.3) recommendations.push("Focus on reducing founder dependency before considering acquisition");
  if (metrics.revenueStreamCount < 3) recommendations.push("Diversify revenue streams to increase attractiveness");
  if (weaknesses.length > strengths.length) recommendations.push("Address weaknesses before approaching potential buyers");

  const timeToReady = overallReadiness >= 0.7 ? "Ready now" :
    overallReadiness >= 0.5 ? "6-12 months" :
    overallReadiness >= 0.3 ? "12-24 months" : "24+ months";

  appendEvent("business.valuation_change", "business", channelId, {
    mnaReadiness: overallReadiness,
    valuationMid: valuationRange.mid,
    buyerTypesInterested: potentialBuyers.filter((b) => b.interestLevel > 0.5).length,
  }, "mna-buyer-intelligence");

  return {
    channelId,
    overallReadiness,
    potentialBuyers,
    strengths,
    weaknesses,
    valuationRange,
    timeToReady,
    recommendations,
    assessedAt: new Date(),
  };
}
