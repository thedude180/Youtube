import type { Express } from "express";
import { requireAuth, asyncHandler } from "./helpers";
import { computeSellabilityScore } from "../business/sellability-score";
import { computeDynamicValuation } from "../business/dynamic-valuation";
import { assessSovereignExit } from "../business/sovereign-exit";
import { computeFounderDependency } from "../business/founder-dependency";
import { analyzeSponsorIntelligence } from "../business/sponsor-intelligence";
import { analyzeBrandDeals } from "../business/brand-deal-intelligence";
import { analyzeCommerceIntelligence } from "../business/commerce-intelligence";
import { analyzeMonetizationTiming } from "../business/monetization-timing";
import { analyzeRevenueDiversification } from "../business/revenue-diversification";
import { computeCapitalAllocation } from "../business/capital-allocation";
import { computeContentAssetValuation } from "../business/content-asset-valuation";
import { computeRiskIntelligence } from "../business/risk-intelligence";
import { computeRevenueVelocity } from "../business/revenue-velocity";
import { computeEstatePlan } from "../business/estate-succession";
import { computeBusinessLearning } from "../business/business-learning";
import { getRevenueTruthSummary } from "../business/revenue-reconciliation";

export function registerBusinessIntelligenceRoutes(app: Express) {

  app.get("/api/business/revenue-truth", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await getRevenueTruthSummary(userId);
    res.json(result);
  }));

  app.get("/api/business/sellability-score", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeSellabilityScore(userId);
    res.json(result);
  }));

  app.get("/api/business/dynamic-valuation", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeDynamicValuation(userId);
    res.json(result);
  }));

  app.get("/api/business/sovereign-exit", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await assessSovereignExit(userId);
    res.json(result);
  }));

  app.get("/api/business/founder-dependency", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeFounderDependency(userId);
    res.json(result);
  }));

  app.get("/api/business/sponsor-intelligence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await analyzeSponsorIntelligence(userId);
    res.json(result);
  }));

  app.get("/api/business/brand-deal-intelligence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await analyzeBrandDeals(userId);
    res.json(result);
  }));

  app.get("/api/business/commerce-intelligence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await analyzeCommerceIntelligence(userId);
    res.json(result);
  }));

  app.get("/api/business/monetization-timing", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await analyzeMonetizationTiming(userId);
    res.json(result);
  }));

  app.get("/api/business/revenue-diversification", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await analyzeRevenueDiversification(userId);
    res.json(result);
  }));

  app.get("/api/business/capital-allocation", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeCapitalAllocation(userId);
    res.json(result);
  }));

  app.get("/api/business/content-asset-valuation", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeContentAssetValuation(userId);
    res.json(result);
  }));

  app.get("/api/business/risk-intelligence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeRiskIntelligence(userId);
    res.json(result);
  }));

  app.get("/api/business/revenue-velocity", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeRevenueVelocity(userId);
    res.json(result);
  }));

  app.get("/api/business/estate-succession", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeEstatePlan(userId);
    res.json(result);
  }));

  app.get("/api/business/business-learning", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const result = await computeBusinessLearning(userId);
    res.json(result);
  }));

  app.get("/api/business/continuity-packet", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const [estate, valuation, risk, velocity, learning] = await Promise.all([
      computeEstatePlan(userId),
      computeDynamicValuation(userId),
      computeRiskIntelligence(userId),
      computeRevenueVelocity(userId),
      computeBusinessLearning(userId),
    ]);
    res.json({
      exportedAt: new Date().toISOString(),
      estate,
      valuation,
      riskProfile: risk.overallRiskProfile,
      aiDisplacement: risk.aiDisplacement,
      humanValueMoat: risk.humanValueMoat,
      infrastructure: velocity.infrastructure,
      maturity: learning.maturityAssessment,
      feedbackLoops: learning.feedbackLoops,
    });
  }));

  app.get("/api/business/dashboard-summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const [truth, sellability, valuation, risk, velocity, capital] = await Promise.all([
      getRevenueTruthSummary(userId),
      computeSellabilityScore(userId),
      computeDynamicValuation(userId),
      computeRiskIntelligence(userId),
      computeRevenueVelocity(userId),
      computeCapitalAllocation(userId),
    ]);
    res.json({
      revenueTruth: {
        totalRevenue: truth.totalRevenue,
        verifiedRevenue: truth.verifiedRevenue,
        verificationRate: truth.verificationRate,
        confidenceLabel: truth.confidenceLabel,
      },
      sellability: {
        overallScore: sellability.overallScore,
        grade: sellability.grade,
      },
      valuation: {
        estimatedValue: valuation.estimatedValue,
        valuationRange: valuation.valueRange,
        methodology: valuation.methodologies?.[0]?.name || "SDE Multiple",
      },
      riskProfile: { level: risk.overallRiskProfile, score: 0 },
      aiDisplacementRisk: risk.aiDisplacement.riskLevel,
      moatStrength: risk.humanValueMoat.moatLevel,
      wellnessLevel: risk.creatorWellness.level,
      velocityMetrics: {
        revenuePerContentDay: velocity.velocity.revenuePerContentDay,
        maturityLevel: velocity.infrastructure.maturityLevel,
      },
      capitalHealth: capital.budgetHealth,
    });
  }));

  app.get("/api/business/full-intelligence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const [
      truth, sellability, valuation, sovereignExit, founderDep,
      sponsor, brandDeal, commerce, timing, diversification,
      capital, contentAsset, risk, velocity, estate, learning,
    ] = await Promise.all([
      getRevenueTruthSummary(userId),
      computeSellabilityScore(userId),
      computeDynamicValuation(userId),
      assessSovereignExit(userId),
      computeFounderDependency(userId),
      analyzeSponsorIntelligence(userId),
      analyzeBrandDeals(userId),
      analyzeCommerceIntelligence(userId),
      analyzeMonetizationTiming(userId),
      analyzeRevenueDiversification(userId),
      computeCapitalAllocation(userId),
      computeContentAssetValuation(userId),
      computeRiskIntelligence(userId),
      computeRevenueVelocity(userId),
      computeEstatePlan(userId),
      computeBusinessLearning(userId),
    ]);
    res.json({
      generatedAt: new Date().toISOString(),
      truth, sellability, valuation, sovereignExit, founderDep,
      sponsor, brandDeal, commerce, timing, diversification,
      capital, contentAsset, risk, velocity, estate, learning,
    });
  }));
}
