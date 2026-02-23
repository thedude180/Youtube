import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getUserId, requireTier, EMPIRE_TIER_GATES, parseNumericId } from "./helpers";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { experiments, predictiveTrends, migrationCampaigns, collabCandidates, compoundingJobs, merchIdeas, localizationJobs, liveCopilotSuggestions } from "@shared/schema";

import { getFailureHistory, getHealingStats } from "../pipeline-healing-engine";
import { getSystemHealthReport, resetSubsystemHealth, getSubsystemNames } from "../self-healing-core";
import { getOptimizedRoute, updateRoutingRule, getRoutingRules, analyzeRoutePerformance } from "../pipeline-router";
import { createExperiment, recordVariantMetrics, evaluateExperiment, getActiveExperiments, getExperimentResults } from "../ab-testing-engine";

import { scanForTrends, getPredictedTrends, markTrendActioned, generateTrendContent } from "../trend-predictor";
import { buildDnaProfile, getDnaProfile, generateInCreatorVoice } from "../creator-dna-engine";
import { analyzeAudience, getAudienceSegments, predictSegmentEngagement, getChurnRisks } from "../audience-mindmap-engine";

import { generateLiveSuggestion, getSuggestionHistory, markSuggestionUsed, generateStreamRecap } from "../copilot-engine";
import { createMigrationCampaign, getCampaigns, updateCampaignMetrics, generateCrossPromotionContent } from "../migration-engine";
import { findCollabCandidates, getCandidates, generateOutreachDraft, updateOutreachStatus, suggestCollabFormats } from "../collab-engine";

import { analyzeRevenueStreams, getRevenueModels, optimizeSponsorshipRate, generateRevenueReport } from "../revenue-maximizer";
import { scanForCompoundingOpportunities, executeCompoundingJob, getCompoundingJobs, measureCompoundingImpact } from "../compounding-engine";
import { scanForMerchOpportunities, getMerchIdeas, generateDesignBrief, estimateDemand } from "../merch-engine";

import { scanAlgorithmChanges, getAlgorithmSignals, generateAdaptationStrategy, autoAdaptPipeline } from "../algorithm-monitor";
import { scanForAnomalies, getAnomalies, generateRecoveryPlan, checkShadowBanStatus } from "../shadowban-detector";
import { createLocalizationJob, processLocalizationJob, getLocalizationJobs, batchLocalize } from "../localization-engine";
import { generateTaxEstimate, getTaxEstimates, analyzeTeamNeeds, getHiringRecommendations, generateHiringRoadmap } from "../business-intel-engine";

import { buildEmpireFromIdea, generateContentIdeasFromEmpire, getEmpireBlueprint, expandEmpirePillar, generateLaunchSequence, createVideoFromIdea, createVideoAndSpawnPipeline, autoLaunchEmpireContent, getVideoCreations, getVideoCreation } from "../idea-empire-engine";
import { launchEmpire, getEmpireBuildStatus } from "../empire-launcher";
import { getSecurityDashboard, learnFromAttack, getBlockedIPs, getSecurityRules, getSecurityStats } from "../security-engine";
import { createOrUpdateCustomerProfile, getCustomerProfile, getAllCustomers, recordTierChange, getCustomerStats, enrichCustomerProfile, searchCustomers, exportCustomerData, getCustomerTimeline } from "../customer-database-engine";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`Ultimate route error [${req.method} ${req.path}]:`, err?.message || err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    });
  };
}

export function registerUltimateRoutes(app: Express) {

  app.get("/api/pipeline/failures", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const failures = await getFailureHistory(userId);
    res.json(failures);
  }));

  app.get("/api/pipeline/healing-stats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getHealingStats(userId);
    res.json(stats);
  }));

  app.get("/api/system/health", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const report = getSystemHealthReport();
    res.json(report);
  }));

  app.post("/api/system/health/reset/:subsystem", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { subsystem } = req.params;
    const success = resetSubsystemHealth(subsystem);
    if (!success) {
      return res.status(404).json({ error: "Subsystem not found", available: getSubsystemNames() });
    }
    res.json({ success: true, message: `Subsystem "${subsystem}" reset to healthy` });
  }));

  app.get("/api/system/subsystems", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ subsystems: getSubsystemNames() });
  }));

  app.get("/api/system/cron-locks", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getCronLockStatus } = await import("../lib/cron-lock");
    const locks = await getCronLockStatus();
    res.json({ locks, instanceId: `inst_${process.pid}` });
  }));

  app.get("/api/system/external-health", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { runAllHealthChecks } = await import("../services/external-health");
    const result = await runAllHealthChecks();
    res.json(result);
  }));

  app.get("/api/system/ai-telemetry", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getAITelemetry } = await import("../lib/openai");
    res.json(getAITelemetry());
  }));

  app.get("/api/pipeline/routing-rules", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rules = await getRoutingRules(userId);
    res.json(rules);
  }));

  app.post("/api/pipeline/routing-rules", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rule = await updateRoutingRule(userId, req.body);
    res.json(rule);
  }));

  app.post("/api/pipeline/optimize-route", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { contentType, platform } = req.body;
    const route = await getOptimizedRoute(userId, contentType || "general", platform || "youtube");
    res.json(route);
  }));

  app.post("/api/pipeline/analyze-performance", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const analysis = await analyzeRoutePerformance(userId);
    res.json(analysis);
  }));

  app.get("/api/experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const experiments = await getActiveExperiments(userId);
    res.json(experiments);
  }));

  app.get("/api/experiments/results", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const results = await getExperimentResults(userId);
    res.json(results);
  }));

  app.post("/api/experiments", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { experimentType, variants, contentId } = req.body;
    const experiment = await createExperiment(userId, experimentType, variants || [], contentId);
    res.json(experiment);
  }));

  app.post("/api/experiments/:id/metrics", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const experimentId = parseNumericId(req.params.id as string, res, "experiment ID");
    if (experimentId === null) return;
    const [experiment] = await db.select().from(experiments).where(and(eq(experiments.id, experimentId), eq(experiments.userId, userId))).limit(1);
    if (!experiment) { res.status(404).json({ error: "Not found" }); return; }
    const { variantId, metrics } = req.body;
    await recordVariantMetrics(experimentId, variantId, metrics);
    res.json({ success: true });
  }));

  app.post("/api/experiments/:id/evaluate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const experimentId = parseNumericId(req.params.id as string, res, "experiment ID");
    if (experimentId === null) return;
    const [experiment] = await db.select().from(experiments).where(and(eq(experiments.id, experimentId), eq(experiments.userId, userId))).limit(1);
    if (!experiment) { res.status(404).json({ error: "Not found" }); return; }
    const result = await evaluateExperiment(experimentId);
    res.json(result);
  }));

  app.post("/api/intelligence/trends/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform } = req.body;
    const trends = await scanForTrends(userId, platform);
    res.json(trends);
  }));

  app.get("/api/intelligence/trends", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const trends = await getPredictedTrends(userId, status);
    res.json(trends);
  }));

  app.post("/api/intelligence/trends/:id/action", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const trendId = parseNumericId(req.params.id as string, res, "trend ID");
    if (trendId === null) return;
    const [trend] = await db.select().from(predictiveTrends).where(and(eq(predictiveTrends.id, trendId), eq(predictiveTrends.userId, userId))).limit(1);
    if (!trend) { res.status(404).json({ error: "Not found" }); return; }
    await markTrendActioned(trendId);
    res.json({ success: true });
  }));

  app.post("/api/intelligence/trends/:id/content", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const trendId = parseNumericId(req.params.id as string, res, "trend ID");
    if (trendId === null) return;
    const [trend] = await db.select().from(predictiveTrends).where(and(eq(predictiveTrends.id, trendId), eq(predictiveTrends.userId, userId))).limit(1);
    if (!trend) { res.status(404).json({ error: "Not found" }); return; }
    const content = await generateTrendContent(userId, trendId);
    res.json(content);
  }));

  app.post("/api/intelligence/dna/build", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const profile = await buildDnaProfile(userId);
    res.json(profile);
  }));

  app.get("/api/intelligence/dna", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const profile = await getDnaProfile(userId);
    res.json(profile || { message: "No DNA profile yet. Run a build first." });
  }));

  app.post("/api/intelligence/dna/generate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { prompt } = req.body;
    const result = await generateInCreatorVoice(userId, prompt || "Write a video title");
    res.json(result);
  }));

  app.post("/api/intelligence/audience/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform } = req.body;
    const segments = await analyzeAudience(userId, platform);
    res.json(segments);
  }));

  app.get("/api/intelligence/audience", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const segments = await getAudienceSegments(userId);
    res.json(segments);
  }));

  app.post("/api/intelligence/audience/predict", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { contentIdea } = req.body;
    const prediction = await predictSegmentEngagement(userId, contentIdea || "");
    res.json(prediction);
  }));

  app.get("/api/intelligence/audience/churn-risks", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const risks = await getChurnRisks(userId);
    res.json(risks);
  }));

  app.post("/api/stream/copilot/suggest", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamId, viewerCount, chatSentiment, currentTopic, streamDuration } = req.body;
    const suggestion = await generateLiveSuggestion(userId, streamId || 0, {
      viewerCount: viewerCount || 0,
      chatSentiment: chatSentiment || "neutral",
      currentTopic: currentTopic || "general",
      streamDuration: streamDuration || 0,
    });
    res.json(suggestion);
  }));

  app.get("/api/stream/copilot/history", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    let streamId: number | undefined;
    if (req.query.streamId) {
      const parsed = parseNumericId(req.query.streamId as string, res, "streamId");
      if (parsed === null) return;
      streamId = parsed;
    }
    const history = await getSuggestionHistory(userId, streamId);
    res.json(history);
  }));

  app.post("/api/stream/copilot/:id/used", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const suggestionId = parseNumericId(req.params.id as string, res, "suggestion ID");
    if (suggestionId === null) return;
    const [suggestion] = await db.select().from(liveCopilotSuggestions).where(and(eq(liveCopilotSuggestions.id, suggestionId), eq(liveCopilotSuggestions.userId, userId))).limit(1);
    if (!suggestion) { res.status(404).json({ error: "Not found" }); return; }
    const { impactScore } = req.body;
    await markSuggestionUsed(suggestionId, impactScore);
    res.json({ success: true });
  }));

  app.post("/api/stream/copilot/recap", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { streamId } = req.body;
    const recap = await generateStreamRecap(userId, streamId || 0);
    res.json(recap);
  }));

  app.post("/api/growth/migration", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { sourcePlatform, targetPlatform } = req.body;
    const campaign = await createMigrationCampaign(userId, sourcePlatform, targetPlatform);
    res.json(campaign);
  }));

  app.get("/api/growth/migration", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const campaigns = await getCampaigns(userId);
    res.json(campaigns);
  }));

  app.post("/api/growth/migration/:id/metrics", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const campaignId = parseNumericId(req.params.id as string, res, "campaign ID");
    if (campaignId === null) return;
    const [campaign] = await db.select().from(migrationCampaigns).where(and(eq(migrationCampaigns.id, campaignId), eq(migrationCampaigns.userId, userId))).limit(1);
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    const { migratedCount, conversionRate } = req.body;
    await updateCampaignMetrics(campaignId, migratedCount, conversionRate);
    res.json({ success: true });
  }));

  app.post("/api/growth/migration/:id/content", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const campaignId = parseNumericId(req.params.id as string, res, "campaign ID");
    if (campaignId === null) return;
    const [campaign] = await db.select().from(migrationCampaigns).where(and(eq(migrationCampaigns.id, campaignId), eq(migrationCampaigns.userId, userId))).limit(1);
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    const content = await generateCrossPromotionContent(userId, campaignId);
    res.json(content);
  }));

  app.post("/api/growth/collabs/find", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform } = req.body;
    const candidates = await findCollabCandidates(userId, platform);
    res.json(candidates);
  }));

  app.get("/api/growth/collabs", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const candidates = await getCandidates(userId);
    res.json(candidates);
  }));

  app.post("/api/growth/collabs/:id/outreach", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const candidateId = parseNumericId(req.params.id as string, res, "candidate ID");
    if (candidateId === null) return;
    const [candidate] = await db.select().from(collabCandidates).where(and(eq(collabCandidates.id, candidateId), eq(collabCandidates.userId, userId))).limit(1);
    if (!candidate) { res.status(404).json({ error: "Not found" }); return; }
    const draft = await generateOutreachDraft(candidateId);
    res.json(draft);
  }));

  app.post("/api/growth/collabs/:id/status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const candidateId = parseNumericId(req.params.id as string, res, "candidate ID");
    if (candidateId === null) return;
    const [candidate] = await db.select().from(collabCandidates).where(and(eq(collabCandidates.id, candidateId), eq(collabCandidates.userId, userId))).limit(1);
    if (!candidate) { res.status(404).json({ error: "Not found" }); return; }
    const { status, responseReceived } = req.body;
    await updateOutreachStatus(candidateId, status, responseReceived);
    res.json({ success: true });
  }));

  app.post("/api/growth/collabs/:id/formats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const candidateId = parseNumericId(req.params.id as string, res, "candidate ID");
    if (candidateId === null) return;
    const [candidate] = await db.select().from(collabCandidates).where(and(eq(collabCandidates.id, candidateId), eq(collabCandidates.userId, userId))).limit(1);
    if (!candidate) { res.status(404).json({ error: "Not found" }); return; }
    const formats = await suggestCollabFormats(userId, candidateId);
    res.json(formats);
  }));

  app.post("/api/money/revenue/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const models = await analyzeRevenueStreams(userId);
    res.json(models);
  }));

  app.get("/api/money/revenue/models", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const models = await getRevenueModels(userId);
    res.json(models);
  }));

  app.post("/api/money/revenue/optimize", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { modelType } = req.body;
    const optimized = await optimizeSponsorshipRate(userId, modelType || "sponsorship");
    res.json(optimized);
  }));

  app.post("/api/money/revenue/report", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const report = await generateRevenueReport(userId);
    res.json(report);
  }));

  app.post("/api/content/compounding/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const jobs = await scanForCompoundingOpportunities(userId);
    res.json(jobs);
  }));

  app.get("/api/content/compounding", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const jobs = await getCompoundingJobs(userId, status);
    res.json(jobs);
  }));

  app.post("/api/content/compounding/:id/execute", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const jobId = parseNumericId(req.params.id as string, res, "job ID");
    if (jobId === null) return;
    const [job] = await db.select().from(compoundingJobs).where(and(eq(compoundingJobs.id, jobId), eq(compoundingJobs.userId, userId))).limit(1);
    if (!job) { res.status(404).json({ error: "Not found" }); return; }
    const result = await executeCompoundingJob(jobId);
    res.json(result);
  }));

  app.post("/api/content/compounding/:id/impact", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const jobId = parseNumericId(req.params.id as string, res, "job ID");
    if (jobId === null) return;
    const [job] = await db.select().from(compoundingJobs).where(and(eq(compoundingJobs.id, jobId), eq(compoundingJobs.userId, userId))).limit(1);
    if (!job) { res.status(404).json({ error: "Not found" }); return; }
    const impact = await measureCompoundingImpact(jobId);
    res.json(impact);
  }));

  app.post("/api/money/merch/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ideas = await scanForMerchOpportunities(userId);
    res.json(ideas);
  }));

  app.get("/api/money/merch/ideas", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ideas = await getMerchIdeas(userId);
    res.json(ideas);
  }));

  app.post("/api/money/merch/:id/design-brief", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const ideaId = parseNumericId(req.params.id as string, res, "merch idea ID");
    if (ideaId === null) return;
    const [idea] = await db.select().from(merchIdeas).where(and(eq(merchIdeas.id, ideaId), eq(merchIdeas.userId, userId))).limit(1);
    if (!idea) { res.status(404).json({ error: "Not found" }); return; }
    const brief = await generateDesignBrief(ideaId);
    res.json(brief);
  }));

  app.post("/api/money/merch/:id/demand", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const ideaId = parseNumericId(req.params.id as string, res, "merch idea ID");
    if (ideaId === null) return;
    const [idea] = await db.select().from(merchIdeas).where(and(eq(merchIdeas.id, ideaId), eq(merchIdeas.userId, userId))).limit(1);
    if (!idea) { res.status(404).json({ error: "Not found" }); return; }
    const demand = await estimateDemand(ideaId);
    res.json(demand);
  }));

  app.post("/api/platform/algorithm/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const { platform } = req.body;
    const signals = await scanAlgorithmChanges(platform || "youtube");
    res.json(signals);
  }));

  app.get("/api/platform/algorithm/signals", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const signals = await getAlgorithmSignals(platform);
    res.json(signals);
  }));

  app.post("/api/platform/algorithm/:id/adapt", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const signalId = parseNumericId(req.params.id as string, res, "signal ID");
    if (signalId === null) return;
    const strategy = await generateAdaptationStrategy(signalId);
    res.json(strategy);
  }));

  app.post("/api/platform/algorithm/:id/auto-adapt", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const signalId = parseNumericId(req.params.id as string, res, "signal ID");
    if (signalId === null) return;
    const result = await autoAdaptPipeline(userId, signalId);
    res.json(result);
  }));

  app.post("/api/platform/shadowban/scan", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform } = req.body;
    const anomalies = await scanForAnomalies(userId, platform || "youtube");
    res.json(anomalies);
  }));

  app.get("/api/platform/shadowban", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const anomalies = await getAnomalies(userId, platform);
    res.json(anomalies);
  }));

  app.post("/api/platform/shadowban/:id/recovery", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const anomalyId = parseNumericId(req.params.id as string, res, "anomaly ID");
    if (anomalyId === null) return;
    const plan = await generateRecoveryPlan(anomalyId);
    res.json(plan);
  }));

  app.post("/api/platform/shadowban/check", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform } = req.body;
    const status = await checkShadowBanStatus(userId, platform || "youtube");
    res.json(status);
  }));

  app.post("/api/content/localization", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { sourceContentId, targetLanguage, targetRegion } = req.body;
    const job = await createLocalizationJob(userId, sourceContentId, targetLanguage, targetRegion);
    res.json(job);
  }));

  app.post("/api/content/localization/:id/process", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res); if (!userId) return;
    const jobId = parseNumericId(req.params.id as string, res, "localization job ID");
    if (jobId === null) return;
    const [locJob] = await db.select().from(localizationJobs).where(and(eq(localizationJobs.id, jobId), eq(localizationJobs.userId, userId))).limit(1);
    if (!locJob) { res.status(404).json({ error: "Not found" }); return; }
    const result = await processLocalizationJob(jobId);
    res.json(result);
  }));

  app.get("/api/content/localization", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const jobs = await getLocalizationJobs(userId, status);
    res.json(jobs);
  }));

  app.post("/api/content/localization/batch", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { sourceContentId, languages } = req.body;
    const jobs = await batchLocalize(userId, sourceContentId, languages || []);
    res.json(jobs);
  }));

  app.post("/api/money/tax/estimate", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { quarter, year } = req.body;
    const estimate = await generateTaxEstimate(userId, quarter || "Q1", year || new Date().getFullYear());
    res.json(estimate);
  }));

  app.get("/api/money/tax/estimates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    let year: number | undefined;
    if (req.query.year) {
      const parsed = parseNumericId(req.query.year as string, res, "year");
      if (parsed === null) return;
      year = parsed;
    }
    const estimates = await getTaxEstimates(userId, year);
    res.json(estimates);
  }));

  app.post("/api/business/team/analyze", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const recommendations = await analyzeTeamNeeds(userId);
    res.json(recommendations);
  }));

  app.get("/api/business/team/recommendations", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const recommendations = await getHiringRecommendations(userId);
    res.json(recommendations);
  }));

  app.post("/api/business/team/roadmap", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const roadmap = await generateHiringRoadmap(userId);
    res.json(roadmap);
  }));

  app.get("/api/ultimate/status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({
      version: "ultimate",
      features: {
        selfHealingPipelines: true,
        dynamicRouting: true,
        abTesting: true,
        predictiveAnalytics: true,
        creatorDna: true,
        audienceMindMapping: true,
        streamCopilot: true,
        audienceMigration: true,
        collaborationNetwork: true,
        revenueMaximizer: true,
        contentCompounding: true,
        smartMerch: true,
        algorithmDecoder: true,
        shadowBanDetection: true,
        multiLanguageEmpire: true,
        taxIntelligence: true,
        teamScalingAdvisor: true,
      },
      engines: 19,
      totalRoutes: 65,
      ideaToEmpire: true,
      hackProofSecurity: true,
      customerDatabase: true,
    });
  }));


  app.post("/api/empire/build", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-blueprint"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const { idea } = req.body;
    if (!idea || typeof idea !== "string" || idea.trim().length < 3) {
      return res.status(400).json({ error: "Please provide a content idea (at least 3 characters)" });
    }
    const blueprint = await buildEmpireFromIdea(userId, idea.trim());
    res.json(blueprint);
  }));

  app.get("/api/empire/blueprint", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-blueprint-view"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const blueprint = await getEmpireBlueprint(userId);
    res.json(blueprint || { message: "No empire blueprint yet. Submit your idea to /api/empire/build" });
  }));

  app.post("/api/empire/content-ideas", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-content-ideas"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const { count } = req.body;
    const ideas = await generateContentIdeasFromEmpire(userId, count || 10);
    res.json(ideas);
  }));

  app.post("/api/empire/expand-pillar", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-expand-pillar"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const { pillarIndex } = req.body;
    const expanded = await expandEmpirePillar(userId, pillarIndex ?? 0);
    res.json(expanded);
  }));

  app.post("/api/empire/launch-sequence", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-launch-sequence"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const sequence = await generateLaunchSequence(userId);
    res.json(sequence);
  }));

  const videoIdeaSchema = z.object({
    title: z.string().min(1, "title is required").max(300),
    description: z.string().max(2000).optional(),
    pillar: z.string().max(200).optional(),
    format: z.enum(["long-form", "short", "live", "stream"]).optional(),
    platform: z.enum(["YouTube", "Twitch", "Kick", "TikTok", "X", "Discord"]).optional(),
  });

  const autoLaunchSchema = z.object({
    count: z.number().int().min(1).max(10).optional().default(3),
  });

  app.post("/api/empire/create-video", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-create-video"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const parsed = videoIdeaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      return;
    }
    const result = await createVideoFromIdea(userId, parsed.data);
    res.json(result);
  }));

  app.post("/api/empire/create-video-pipeline", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-create-video-pipeline"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const parsed = videoIdeaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      return;
    }
    const result = await createVideoAndSpawnPipeline(userId, parsed.data);
    res.json(result);
  }));

  app.post("/api/empire/auto-launch", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-auto-launch"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const parsed = autoLaunchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      return;
    }
    const result = await autoLaunchEmpireContent(userId, parsed.data.count);
    res.json(result);
  }));

  app.get("/api/empire/videos", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-video-list"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const videos = await getVideoCreations(userId);
    res.json(videos);
  }));

  app.get("/api/empire/videos/:videoKey", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-video-detail"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    const video = await getVideoCreation(userId, req.params.videoKey as string);
    if (!video) {
      res.status(404).json({ error: "Video creation not found" });
      return;
    }
    res.json(video);
  }));


  app.get("/api/empire/tier-gates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getUserTier, TIER_RANK } = await import("./helpers");
    const userTier = await getUserTier(userId);
    const userRank = TIER_RANK[userTier] ?? 0;
    const gates: Record<string, { minTier: string; label: string; unlocked: boolean }> = {};
    for (const [key, gate] of Object.entries(EMPIRE_TIER_GATES)) {
      gates[key] = { ...gate, unlocked: userRank >= (TIER_RANK[gate.minTier] ?? 0) };
    }
    res.json({ currentTier: userTier, gates });
  }));

  app.get("/api/app/tier-gates", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getUserTier, TIER_RANK, APP_TIER_GATES: allGates } = await import("./helpers");
    const userTier = await getUserTier(userId);
    const userRank = TIER_RANK[userTier] ?? 0;
    const gates: Record<string, { minTier: string; label: string; category: string; unlocked: boolean }> = {};
    for (const [key, gate] of Object.entries(allGates)) {
      gates[key] = { ...gate, unlocked: userRank >= (TIER_RANK[gate.minTier] ?? 0) };
    }
    const empireGates: Record<string, { minTier: string; label: string; unlocked: boolean }> = {};
    for (const [key, gate] of Object.entries(EMPIRE_TIER_GATES)) {
      empireGates[key] = { ...gate, unlocked: userRank >= (TIER_RANK[gate.minTier] ?? 0) };
    }
    res.json({ currentTier: userTier, gates, empireGates });
  }));

  app.get("/api/security/rules", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rules = await getSecurityRules();
    res.json(rules);
  }));

  app.post("/api/security/learn/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const eventId = parseNumericId(req.params.id as string, res, "event ID");
    if (eventId === null) return;
    const result = await learnFromAttack(eventId);
    res.json(result);
  }));

  app.get("/api/security/stats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getSecurityStats(userId);
    res.json(stats);
  }));


  app.post("/api/customers/profile", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const profile = await createOrUpdateCustomerProfile(userId, req.body);
    res.json(profile);
  }));

  app.get("/api/customers/profile", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const profile = await getCustomerProfile(userId);
    res.json(profile || { message: "No customer profile yet" });
  }));

  app.get("/api/customers", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { tier, sortBy, limit, offset } = req.query;
    const result = await getAllCustomers({
      tier: tier as string,
      sortBy: sortBy as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  }));

  app.get("/api/customers/stats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getCustomerStats();
    res.json(stats);
  }));

  app.post("/api/customers/:id/enrich", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const targetUserId = req.params.id as string;
    const enriched = await enrichCustomerProfile(targetUserId);
    res.json(enriched);
  }));

  app.get("/api/customers/search", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { q } = req.query;
    const results = await searchCustomers((q as string) || "");
    res.json(results);
  }));

  app.get("/api/customers/export", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const data = await exportCustomerData();
    res.json(data);
  }));

  app.get("/api/customers/:id/timeline", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const targetUserId = req.params.id as string;
    const timeline = await getCustomerTimeline(targetUserId);
    res.json(timeline);
  }));

  app.post("/api/customers/:id/tier-change", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const targetUserId = req.params.id as string;
    const { newTier, reason } = req.body;
    await recordTierChange(targetUserId, newTier, reason);
    res.json({ success: true });
  }));


  const empireLaunchRateLimitEmail = new Map<string, number>();
  const empireLaunchRateLimitIP = new Map<string, number>();

  import("../services/cleanup-coordinator").then(m => m.registerCleanup("empireLaunchRateLimit", () => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, ts] of empireLaunchRateLimitEmail) {
      if (ts < cutoff) empireLaunchRateLimitEmail.delete(key);
    }
    for (const [key, ts] of empireLaunchRateLimitIP) {
      if (ts < cutoff) empireLaunchRateLimitIP.delete(key);
    }
  }, 60_000));

  const empireLaunchSchema = z.object({
    email: z.string().email("Please provide a valid email address").max(320),
    idea: z.string().min(3, "Please provide your content idea (at least 3 characters)").max(1000, "Idea must be under 1000 characters"),
  });

  app.post("/api/empire/launch", asyncHandler(async (req, res) => {
    const gate = EMPIRE_TIER_GATES["empire-full-launch"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;

    const parsed = empireLaunchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      return;
    }

    const { email, idea } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";

    const lastEmailRequest = empireLaunchRateLimitEmail.get(normalizedEmail);
    if (lastEmailRequest && Date.now() - lastEmailRequest < 120000) {
      res.status(429).json({ error: "Please wait at least 2 minutes between empire builds for the same email" });
      return;
    }

    const lastIPRequest = empireLaunchRateLimitIP.get(clientIP);
    if (lastIPRequest && Date.now() - lastIPRequest < 30000) {
      res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
      return;
    }

    empireLaunchRateLimitEmail.set(normalizedEmail, Date.now());
    empireLaunchRateLimitIP.set(clientIP, Date.now());

    const result = await launchEmpire(normalizedEmail, idea.trim());
    res.json({
      success: true,
      buildToken: result.buildToken,
      buildId: result.buildId,
      message: "Your empire build has started! AI is now building everything autonomously. You'll only be notified if something critical needs your attention.",
      statusUrl: `/api/empire/launch/${result.buildToken}`,
    });
  }));

  app.get("/api/empire/launch/:buildToken", asyncHandler(async (req, res) => {
    const buildToken = req.params.buildToken as string;
    if (!buildToken || buildToken.length < 10) {
      res.status(400).json({ error: "Invalid build token" });
      return;
    }

    const status = await getEmpireBuildStatus(buildToken);
    if (!status) {
      res.status(404).json({ error: "Build not found" });
      return;
    }

    res.json(status);
  }));
}
