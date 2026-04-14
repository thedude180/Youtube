import { db } from "../db";
import { revenueRecords, channels, videos, equipmentRoi } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

import { createLogger } from "../lib/logger";

const logger = createLogger("capital-allocation");
export interface AllocationBucket {
  category: string;
  currentAllocation: number;
  recommendedAllocation: number;
  recommendedPercent: number;
  rationale: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface CapitalAllocationPlan {
  totalBudget: number;
  allocations: AllocationBucket[];
  emergencyReserve: { amount: number; monthsCovered: number; adequate: boolean };
  reinvestmentRate: number;
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
  budgetHealth: "healthy" | "stretched" | "underfunded" | "critical";
  recommendations: string[];
}

const ALLOCATION_TARGETS: Record<string, { minPercent: number; maxPercent: number; priority: AllocationBucket["priority"] }> = {
  "Content Production": { minPercent: 20, maxPercent: 40, priority: "critical" },
  "Equipment & Software": { minPercent: 10, maxPercent: 20, priority: "high" },
  "Marketing & Growth": { minPercent: 10, maxPercent: 25, priority: "high" },
  "Team & Contractors": { minPercent: 5, maxPercent: 30, priority: "medium" },
  "Emergency Reserve": { minPercent: 10, maxPercent: 20, priority: "critical" },
  "Education & Training": { minPercent: 3, maxPercent: 10, priority: "low" },
  "Business Operations": { minPercent: 5, maxPercent: 15, priority: "medium" },
};

export async function computeCapitalAllocation(userId: string): Promise<CapitalAllocationPlan> {
  const [records, userChannels, equipment] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(equipmentRoi)
      .where(eq(equipmentRoi.userId, userId))
      .orderBy(desc(equipmentRoi.createdAt))
      .limit(50),
  ]);

  const confidence = computeRevenueConfidence(records);
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);

  const byPeriod = new Map<string, number>();
  for (const r of records) {
    const period = r.period || "unknown";
    byPeriod.set(period, (byPeriod.get(period) || 0) + r.amount);
  }
  const periods = Array.from(byPeriod.values());
  const monthlyRevenue = periods.length > 0 ? periods.reduce((a, b) => a + b, 0) / periods.length : 0;
  const totalBudget = Math.round(monthlyRevenue);

  const equipmentSpend = equipment.reduce((s, e) => s + (e.purchasePrice || 0), 0);
  const monthlyEquipmentAmortized = equipment.length > 0 ? Math.round(equipmentSpend / Math.max(equipment.length * 12, 1)) : 0;

  const channelCount = userChannels.length;
  const growthStage = totalSubs >= 100000 ? "scale" : totalSubs >= 10000 ? "growth" : "startup";

  const allocations: AllocationBucket[] = Object.entries(ALLOCATION_TARGETS).map(([category, target]) => {
    let recommendedPercent: number;

    if (category === "Content Production") {
      recommendedPercent = growthStage === "startup" ? 35 : growthStage === "growth" ? 30 : 25;
    } else if (category === "Equipment & Software") {
      recommendedPercent = monthlyEquipmentAmortized > totalBudget * 0.15 ? 15 : 10;
    } else if (category === "Marketing & Growth") {
      recommendedPercent = growthStage === "startup" ? 20 : growthStage === "growth" ? 15 : 10;
    } else if (category === "Team & Contractors") {
      recommendedPercent = growthStage === "scale" ? 25 : growthStage === "growth" ? 15 : 5;
    } else if (category === "Emergency Reserve") {
      recommendedPercent = 15;
    } else if (category === "Education & Training") {
      recommendedPercent = 5;
    } else {
      recommendedPercent = 10;
    }

    recommendedPercent = Math.max(target.minPercent, Math.min(target.maxPercent, recommendedPercent));
    const recommendedAllocation = Math.round(totalBudget * recommendedPercent / 100);

    return {
      category,
      currentAllocation: 0,
      recommendedAllocation,
      recommendedPercent,
      rationale: getAllocationRationale(category, growthStage, recommendedPercent),
      priority: target.priority,
    };
  });

  const reserveAlloc = allocations.find(a => a.category === "Emergency Reserve");
  const reserveAmount = reserveAlloc?.recommendedAllocation || 0;
  const monthsCovered = monthlyRevenue > 0 ? Math.round((reserveAmount * 6) / monthlyRevenue * 10) / 10 : 0;

  const budgetHealth: CapitalAllocationPlan["budgetHealth"] =
    totalBudget >= 1000 ? "healthy" : totalBudget >= 500 ? "stretched" : totalBudget > 0 ? "underfunded" : "critical";

  const reinvestmentRate = 100 - (reserveAlloc?.recommendedPercent || 15);

  const recommendations: string[] = [];
  if (growthStage === "startup") recommendations.push("Prioritize content production and marketing to build audience before scaling team");
  if (budgetHealth === "underfunded" || budgetHealth === "critical") recommendations.push("Revenue is too low for meaningful budget allocation — focus on revenue growth first");
  if (monthlyEquipmentAmortized > totalBudget * 0.2) recommendations.push("Equipment spend is high relative to revenue — maximize ROI on existing gear before buying more");
  if (channelCount < 2) recommendations.push("Allocate marketing budget toward platform diversification");
  recommendations.push(`Current growth stage: ${growthStage} — adjust allocations as you scale`);

  const plan = {
    totalBudget,
    allocations,
    emergencyReserve: { amount: reserveAmount, monthsCovered, adequate: monthsCovered >= 3 },
    reinvestmentRate,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    budgetHealth,
    recommendations,
  };

  try {
    const { recordFinancialAudit } = await import("../services/financial-audit");
    await recordFinancialAudit(
      userId, "capital_allocation_computed", "capital_plan", null,
      {},
      { totalBudget, budgetHealth, growthStage, reinvestmentRate, allocationCount: allocations.length },
      "capital-allocation",
    );
  } catch (err: any) {
    logger.warn("[capital-allocation] audit trail write failed:", err?.message);
  }

  return plan;
}

function getAllocationRationale(category: string, stage: string, percent: number): string {
  const rationales: Record<string, string> = {
    "Content Production": `${percent}% for content — ${stage === "startup" ? "highest priority for building audience" : "maintaining content quality and cadence"}`,
    "Equipment & Software": `${percent}% for gear/tools — invest in quality that directly improves content`,
    "Marketing & Growth": `${percent}% for growth — ${stage === "startup" ? "critical for audience building" : "sustaining and accelerating reach"}`,
    "Team & Contractors": `${percent}% for team — ${stage === "scale" ? "scaling operations requires more hands" : "start with freelancers for editing and design"}`,
    "Emergency Reserve": `${percent}% reserve — always maintain 3-6 months of operating runway`,
    "Education & Training": `${percent}% for learning — courses, conferences, and skill development`,
    "Business Operations": `${percent}% for ops — accounting, legal, insurance, and admin costs`,
  };
  return rationales[category] || `${percent}% allocated based on ${stage} stage priorities`;
}
