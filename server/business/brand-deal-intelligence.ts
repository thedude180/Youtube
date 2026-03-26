import { db } from "../db";
import { revenueRecords, sponsorshipDeals, channels, videos } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface DealPerformance {
  dealId: number;
  brandName: string;
  dealValue: number;
  status: string;
  performanceScore: number;
  renewalLikelihood: number;
  marketRateComparison: "above" | "at" | "below";
}

export interface SponsorLifecycleStage {
  stage: "prospect" | "outreach" | "negotiation" | "active" | "delivery" | "completed" | "renewal";
  deals: number;
  avgValue: number;
}

export interface BrandDealIntelligence {
  dealPerformance: DealPerformance[];
  lifecycleOverview: SponsorLifecycleStage[];
  totalDealValue: number;
  avgDealValue: number;
  completionRate: number;
  renewalRate: number;
  topBrands: Array<{ brand: string; totalValue: number; deals: number }>;
  revenueConfidence: {
    sponsorRevenue: number;
    verifiedAmount: number;
    confidenceLabel: string;
    note: string;
  };
  pipelineHealth: {
    activeDeals: number;
    pendingDeals: number;
    totalPipelineValue: number;
    avgTimeToClose: string;
  };
  recommendations: string[];
}

const STATUS_TO_LIFECYCLE: Record<string, SponsorLifecycleStage["stage"]> = {
  prospect: "prospect",
  outreach: "outreach",
  negotiating: "negotiation",
  negotiation: "negotiation",
  active: "active",
  in_progress: "delivery",
  completed: "completed",
  renewed: "renewal",
};

export async function analyzeBrandDeals(userId: string): Promise<BrandDealIntelligence> {
  const [deals, records, userChannels] = await Promise.all([
    db.select().from(sponsorshipDeals)
      .where(eq(sponsorshipDeals.userId, userId))
      .orderBy(desc(sponsorshipDeals.createdAt))
      .limit(200),
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
  ]);

  const sponsorRecords = records.filter(r =>
    r.source.toLowerCase().includes("sponsor") || r.source.toLowerCase().includes("brand")
  );
  const confidence = computeRevenueConfidence(sponsorRecords);

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const marketFlatRate = totalSubs > 0 ? totalSubs * 0.01 : 100;

  const dealPerformance: DealPerformance[] = deals.map(d => {
    const dealVal = d.dealValue || 0;
    const performanceScore = Math.min(100, Math.round(
      (dealVal > 0 ? 30 : 0) +
      (d.status === "completed" ? 40 : d.status === "active" ? 30 : 10) +
      Math.min(30, dealVal / Math.max(marketFlatRate, 1) * 30)
    ));

    const completedOrRenewed = d.status === "completed" || d.status === "renewed";
    const renewalLikelihood = completedOrRenewed ? 60 : d.status === "active" ? 40 : 20;

    const comparison: DealPerformance["marketRateComparison"] =
      dealVal > marketFlatRate * 1.1 ? "above" : dealVal < marketFlatRate * 0.9 ? "below" : "at";

    return {
      dealId: d.id,
      brandName: d.brandName || "Unknown",
      dealValue: dealVal,
      status: d.status || "unknown",
      performanceScore,
      renewalLikelihood,
      marketRateComparison: comparison,
    };
  });

  const lifecycleMap = new Map<string, { deals: number; totalValue: number }>();
  for (const d of deals) {
    const stage = STATUS_TO_LIFECYCLE[d.status || "prospect"] || "prospect";
    const entry = lifecycleMap.get(stage) || { deals: 0, totalValue: 0 };
    entry.deals++;
    entry.totalValue += d.dealValue || 0;
    lifecycleMap.set(stage, entry);
  }

  const lifecycleOverview: SponsorLifecycleStage[] = Array.from(lifecycleMap.entries()).map(([stage, data]) => ({
    stage: stage as SponsorLifecycleStage["stage"],
    deals: data.deals,
    avgValue: data.deals > 0 ? Math.round(data.totalValue / data.deals) : 0,
  }));

  const totalDealValue = deals.reduce((s, d) => s + (d.dealValue || 0), 0);
  const avgDealValue = deals.length > 0 ? Math.round(totalDealValue / deals.length) : 0;
  const completedDeals = deals.filter(d => d.status === "completed" || d.status === "renewed");
  const completionRate = deals.length > 0 ? Math.round((completedDeals.length / deals.length) * 100) : 0;
  const renewedDeals = deals.filter(d => d.status === "renewed");
  const renewalRate = completedDeals.length > 0 ? Math.round((renewedDeals.length / completedDeals.length) * 100) : 0;

  const brandMap = new Map<string, { totalValue: number; deals: number }>();
  for (const d of deals) {
    const brand = d.brandName || "Unknown";
    const entry = brandMap.get(brand) || { totalValue: 0, deals: 0 };
    entry.totalValue += d.dealValue || 0;
    entry.deals++;
    brandMap.set(brand, entry);
  }
  const topBrands = Array.from(brandMap.entries())
    .map(([brand, data]) => ({ brand, ...data }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 5);

  const activeDeals = deals.filter(d => d.status === "active" || d.status === "in_progress").length;
  const pendingDeals = deals.filter(d => d.status === "prospect" || d.status === "outreach" || d.status === "negotiating").length;
  const totalPipelineValue = deals
    .filter(d => d.status !== "completed" && d.status !== "cancelled")
    .reduce((s, d) => s + (d.dealValue || 0), 0);

  const recommendations: string[] = [];
  if (deals.length === 0) recommendations.push("Start building sponsor relationships — create a media kit showcasing audience metrics");
  if (completionRate < 50 && deals.length > 2) recommendations.push("Deal completion rate is low — review negotiation process and deliverable expectations");
  if (renewalRate < 30 && completedDeals.length > 3) recommendations.push("Low renewal rate — focus on exceeding deliverables and providing performance reports to sponsors");
  if (avgDealValue < marketFlatRate * 0.8 && deals.length > 0) recommendations.push("Deals are below market rate — use audience metrics to negotiate higher rates");
  if (pendingDeals > activeDeals * 2) recommendations.push("Pipeline is heavy on prospects — focus on converting existing leads before adding more");
  recommendations.push("Send performance reports to sponsors after each campaign to increase renewal likelihood");

  return {
    dealPerformance,
    lifecycleOverview,
    totalDealValue: Math.round(totalDealValue),
    avgDealValue,
    completionRate,
    renewalRate,
    topBrands,
    revenueConfidence: {
      sponsorRevenue: Math.round(confidence.totalRevenue),
      verifiedAmount: Math.round(confidence.verifiedRevenue),
      confidenceLabel: confidence.confidenceLabel,
      note: confidence.confidenceNote,
    },
    pipelineHealth: {
      activeDeals,
      pendingDeals,
      totalPipelineValue: Math.round(totalPipelineValue),
      avgTimeToClose: deals.length > 5 ? "2-4 weeks" : "Unknown — insufficient data",
    },
    recommendations,
  };
}
