import { Express, Request, Response } from "express";
import { asyncHandler, requireAuth, requireAdmin, requireTier, parseNumericId } from "./helpers";

import {
  startCommunityAudienceEngine, runCommunityAudienceScan, getCommunityEngineStatus,
  computeAudienceSegments, computeChurnRisk, checkFanMilestones
} from "../services/community-audience-engine";

import {
  startCreatorEducationEngine, runEducationScan, getEducationEngineStatus,
  refreshLearningPath, generateCoachingTips, generateCreatorInsights, checkSkillMilestones
} from "../services/creator-education-engine";

import {
  startBrandPartnershipsEngine, runBrandPartnershipsScan, getBrandEngineStatus,
  computeSponsorshipReadiness, generateMediaKit, findCollabMatches, runBrandSafetyCheck
} from "../services/brand-partnerships-engine";

import {
  startAnalyticsIntelligenceEngine, runAnalyticsScan, getAnalyticsEngineStatus,
  aggregateUnifiedMetrics, computeAlgorithmHealth, generatePerformanceBenchmarks
} from "../services/analytics-intelligence-engine";

import {
  startComplianceLegalEngine, runComplianceScan, getComplianceEngineStatus,
  runPolicyComplianceCheck, monitorCopyrightClaims, checkDisclosureRequirements, analyzeFairUse
} from "../services/compliance-legal-engine";

import { db } from "../db";
import {
  audienceSegments, churnRiskScores, reengagementCampaigns, fanMilestones, communityActions,
  learningPaths, coachingTips, creatorInsights, skillMilestones,
  sponsorshipScores, mediaKits, brandDeals, collabMatches, brandSafetyChecks,
  unifiedMetrics, trendForecasts, competitorSnapshots, algorithmHealth, performanceBenchmarks,
  complianceChecks, copyrightClaims, licensingAudits, disclosureRequirements, fairUseReviews
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export function registerPillarRoutes(app: Express): void {

  // ==========================================
  // PILLAR 6: COMMUNITY & AUDIENCE ENGINE
  // Segments, milestones, actions = FREE
  // Churn risk, campaigns, scan = STARTER+
  // ==========================================

  app.get("/api/community/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getCommunityEngineStatus());
  }));

  app.get("/api/community/segments", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const segments = await db.select().from(audienceSegments)
      .where(eq(audienceSegments.userId, userId))
      .orderBy(desc(audienceSegments.updatedAt))
      .limit(limit)
      .offset(offset);
    res.json(segments);
  }));

  app.get("/api/community/churn-risk", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Churn Risk Analysis");
    if (!userId) return;
    const risks = await db.select().from(churnRiskScores)
      .where(eq(churnRiskScores.userId, userId))
      .orderBy(desc(churnRiskScores.lastComputedAt))
      .limit(500);
    res.json(risks);
  }));

  app.get("/api/community/campaigns", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Re-engagement Campaigns");
    if (!userId) return;
    const campaigns = await db.select().from(reengagementCampaigns)
      .where(eq(reengagementCampaigns.userId, userId))
      .orderBy(desc(reengagementCampaigns.createdAt))
      .limit(20);
    res.json(campaigns);
  }));

  app.get("/api/community/milestones", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestones = await db.select().from(fanMilestones)
      .where(eq(fanMilestones.userId, userId))
      .orderBy(desc(fanMilestones.achievedAt))
      .limit(500);
    res.json(milestones);
  }));

  app.get("/api/community/actions", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const actions = await db.select().from(communityActions)
      .where(eq(communityActions.userId, userId))
      .orderBy(desc(communityActions.createdAt))
      .limit(50);
    res.json(actions);
  }));

  app.post("/api/community/scan", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Manual Community Scan");
    if (!userId) return;
    await computeAudienceSegments(userId);
    await computeChurnRisk(userId);
    await checkFanMilestones(userId);
    res.json({ success: true, message: "Community scan complete" });
  }));

  // ==========================================
  // PILLAR 7: CREATOR EDUCATION & SKILL GROWTH
  // Status = FREE
  // Learning path, milestones = YOUTUBE+
  // Coaching, insights, refresh = STARTER+
  // ==========================================

  app.get("/api/education/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getEducationEngineStatus());
  }));

  app.get("/api/education/learning-path", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "youtube", "Learning Path");
    if (!userId) return;
    const paths = await db.select().from(learningPaths)
      .where(eq(learningPaths.userId, userId))
      .orderBy(desc(learningPaths.lastUpdatedAt))
      .limit(1);
    res.json(paths[0] || null);
  }));

  app.get("/api/education/coaching-tips", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "AI Coaching Tips");
    if (!userId) return;
    const tips = await db.select().from(coachingTips)
      .where(and(eq(coachingTips.userId, userId), eq(coachingTips.dismissed, false)))
      .orderBy(desc(coachingTips.createdAt))
      .limit(10);
    res.json(tips);
  }));

  app.get("/api/education/insights", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Creator Insights");
    if (!userId) return;
    const insights = await db.select().from(creatorInsights)
      .where(eq(creatorInsights.userId, userId))
      .orderBy(desc(creatorInsights.createdAt))
      .limit(10);
    res.json(insights);
  }));

  app.get("/api/education/milestones", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "youtube", "Skill Milestones");
    if (!userId) return;
    const milestones = await db.select().from(skillMilestones)
      .where(eq(skillMilestones.userId, userId))
      .orderBy(desc(skillMilestones.achievedAt))
      .limit(500);
    res.json(milestones);
  }));

  app.post("/api/education/refresh", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Manual Education Refresh");
    if (!userId) return;
    await refreshLearningPath(userId);
    await generateCoachingTips(userId);
    await generateCreatorInsights(userId);
    await checkSkillMilestones(userId);
    res.json({ success: true, message: "Education scan complete" });
  }));

  app.post("/api/education/dismiss-tip/:id", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "AI Coaching Tips");
    if (!userId) return;
    const tipId = parseNumericId(req.params.id as string, res, "tip ID");
    if (tipId === null) return;
    const [tip] = await db.select().from(coachingTips).where(and(eq(coachingTips.id, tipId), eq(coachingTips.userId, userId)));
    if (!tip) return res.status(404).json({ error: "Tip not found" });
    await db.update(coachingTips).set({ dismissed: true }).where(eq(coachingTips.id, tipId));
    res.json({ success: true });
  }));

  // ==========================================
  // PILLAR 8: BRAND & PARTNERSHIPS
  // ALL features = PRO+ (monetization tier)
  // ==========================================

  app.get("/api/brand/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Brand Engine");
    if (!userId) return;
    res.json(getBrandEngineStatus());
  }));

  app.get("/api/brand/sponsorship-score", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Sponsorship Readiness Score");
    if (!userId) return;
    const scores = await db.select().from(sponsorshipScores)
      .where(eq(sponsorshipScores.userId, userId))
      .orderBy(desc(sponsorshipScores.updatedAt))
      .limit(1);
    res.json(scores[0] || null);
  }));

  app.get("/api/brand/media-kit", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "AI Media Kit Generator");
    if (!userId) return;
    const kits = await db.select().from(mediaKits)
      .where(eq(mediaKits.userId, userId))
      .orderBy(desc(mediaKits.generatedAt))
      .limit(1);
    res.json(kits[0] || null);
  }));

  app.get("/api/brand/deals", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Brand Deal Tracker");
    if (!userId) return;
    const deals = await db.select().from(brandDeals)
      .where(eq(brandDeals.userId, userId))
      .orderBy(desc(brandDeals.lastTouchedAt))
      .limit(500);
    res.json(deals);
  }));

  app.get("/api/brand/collab-matches", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Collaboration Matchmaker");
    if (!userId) return;
    const matches = await db.select().from(collabMatches)
      .where(eq(collabMatches.userId, userId))
      .orderBy(desc(collabMatches.score))
      .limit(20);
    res.json(matches);
  }));

  app.get("/api/brand/safety", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Brand Safety Scanner");
    if (!userId) return;
    const checks = await db.select().from(brandSafetyChecks)
      .where(eq(brandSafetyChecks.userId, userId))
      .orderBy(desc(brandSafetyChecks.scannedAt))
      .limit(10);
    res.json(checks);
  }));

  app.post("/api/brand/scan", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Manual Brand Scan");
    if (!userId) return;
    await computeSponsorshipReadiness(userId);
    await generateMediaKit(userId);
    await findCollabMatches(userId);
    await runBrandSafetyCheck(userId);
    res.json({ success: true, message: "Brand scan complete" });
  }));

  // ==========================================
  // PILLAR 9: ANALYTICS & INTELLIGENCE
  // Status, basic metrics = FREE
  // Forecasts, competitors, algorithm, benchmarks, scan = STARTER+
  // ==========================================

  app.get("/api/intelligence/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getAnalyticsEngineStatus());
  }));

  app.get("/api/intelligence/metrics", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const metrics = await db.select().from(unifiedMetrics)
      .where(eq(unifiedMetrics.userId, userId))
      .orderBy(desc(unifiedMetrics.windowEnd))
      .limit(limit)
      .offset(offset);
    res.json(metrics);
  }));

  app.get("/api/intelligence/forecasts", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Trend Forecasts");
    if (!userId) return;
    const forecasts = await db.select().from(trendForecasts)
      .where(eq(trendForecasts.userId, userId))
      .orderBy(desc(trendForecasts.generatedAt))
      .limit(20);
    res.json(forecasts);
  }));

  app.get("/api/intelligence/competitors", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Competitor Benchmarks");
    if (!userId) return;
    const snapshots = await db.select().from(competitorSnapshots)
      .where(eq(competitorSnapshots.userId, userId))
      .orderBy(desc(competitorSnapshots.scannedAt))
      .limit(30);
    res.json(snapshots);
  }));

  app.get("/api/intelligence/algorithm-health", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Algorithm Health");
    if (!userId) return;
    const health = await db.select().from(algorithmHealth)
      .where(eq(algorithmHealth.userId, userId))
      .orderBy(desc(algorithmHealth.scannedAt))
      .limit(10);
    res.json(health);
  }));

  app.get("/api/intelligence/benchmarks", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Performance Benchmarks");
    if (!userId) return;
    const benchmarks = await db.select().from(performanceBenchmarks)
      .where(eq(performanceBenchmarks.userId, userId))
      .orderBy(desc(performanceBenchmarks.generatedAt))
      .limit(500);
    res.json(benchmarks);
  }));

  app.post("/api/intelligence/scan", asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Manual Analytics Scan");
    if (!userId) return;
    await aggregateUnifiedMetrics(userId);
    await computeAlgorithmHealth(userId);
    await generatePerformanceBenchmarks(userId);
    res.json({ success: true, message: "Analytics scan complete" });
  }));

  // ==========================================
  // PILLAR 10: COMPLIANCE & LEGAL SHIELD
  // ALL features = FREE (baseline protection for everyone)
  // ==========================================

  app.get("/api/compliance/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(getComplianceEngineStatus());
  }));

  app.get("/api/compliance/checks", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const checks = await db.select().from(complianceChecks)
      .where(eq(complianceChecks.userId, userId))
      .orderBy(desc(complianceChecks.checkedAt))
      .limit(30);
    res.json(checks);
  }));

  app.get("/api/compliance/copyright-claims", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const claims = await db.select().from(copyrightClaims)
      .where(eq(copyrightClaims.userId, userId))
      .orderBy(desc(copyrightClaims.detectedAt))
      .limit(500);
    res.json(claims);
  }));

  app.get("/api/compliance/licensing", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const audits = await db.select().from(licensingAudits)
      .where(eq(licensingAudits.userId, userId))
      .orderBy(desc(licensingAudits.checkedAt))
      .limit(20);
    res.json(audits);
  }));

  app.get("/api/compliance/disclosures", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const disclosures = await db.select().from(disclosureRequirements)
      .where(eq(disclosureRequirements.userId, userId))
      .orderBy(desc(disclosureRequirements.checkedAt))
      .limit(20);
    res.json(disclosures);
  }));

  app.get("/api/compliance/fair-use", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const reviews = await db.select().from(fairUseReviews)
      .where(eq(fairUseReviews.userId, userId))
      .orderBy(desc(fairUseReviews.reviewedAt))
      .limit(20);
    res.json(reviews);
  }));

  app.post("/api/compliance/scan", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await runPolicyComplianceCheck(userId);
    await monitorCopyrightClaims(userId);
    await checkDisclosureRequirements(userId);
    await analyzeFairUse(userId);
    res.json({ success: true, message: "Compliance scan complete" });
  }));

  // ==========================================
  // ADMIN: ALL ENGINES STATUS
  // ==========================================

  app.get("/api/admin/pillar-engines", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({
      community: getCommunityEngineStatus(),
      education: getEducationEngineStatus(),
      brand: getBrandEngineStatus(),
      analytics: getAnalyticsEngineStatus(),
      compliance: getComplianceEngineStatus(),
    });
  }));

  app.post("/api/admin/pillar-engines/scan-all", requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
    await Promise.allSettled([
      runCommunityAudienceScan(),
      runEducationScan(),
      runBrandPartnershipsScan(),
      runAnalyticsScan(),
      runComplianceScan(),
    ]);
    res.json({ success: true, message: "All pillar engine scans triggered" });
  }));
}
