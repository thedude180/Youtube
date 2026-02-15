import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getUserId } from "./helpers";

import { detectAndHealFailure, getFailureHistory, getHealingStats } from "../pipeline-healing-engine";
import { getOptimizedRoute, updateRoutingRule, getRoutingRules, analyzeRoutePerformance } from "../pipeline-router";
import { createExperiment, recordVariantMetrics, evaluateExperiment, getActiveExperiments, getExperimentResults } from "../ab-testing-engine";

import { scanForTrends, getPredictedTrends, markTrendActioned, generateTrendContent } from "../trend-predictor";
import { buildDnaProfile, getDnaProfile, updateDnaFromContent, generateInCreatorVoice } from "../creator-dna-engine";
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
import { createOrUpdateCustomerProfile, getCustomerProfile, getAllCustomers, updateCustomerActivity, recordTierChange, getCustomerStats, enrichCustomerProfile, searchCustomers, exportCustomerData, getCustomerTimeline } from "../customer-database-engine";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
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
    const experimentId = parseInt(req.params.id);
    const { variantId, metrics } = req.body;
    await recordVariantMetrics(experimentId, variantId, metrics);
    res.json({ success: true });
  }));

  app.post("/api/experiments/:id/evaluate", asyncHandler(async (req, res) => {
    const experimentId = parseInt(req.params.id);
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
    const trendId = parseInt(req.params.id);
    await markTrendActioned(trendId);
    res.json({ success: true });
  }));

  app.post("/api/intelligence/trends/:id/content", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const trendId = parseInt(req.params.id);
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
      currentTopic: currentTopic || "gaming",
      streamDuration: streamDuration || 0,
    });
    res.json(suggestion);
  }));

  app.get("/api/stream/copilot/history", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamId = req.query.streamId ? parseInt(req.query.streamId as string) : undefined;
    const history = await getSuggestionHistory(userId, streamId);
    res.json(history);
  }));

  app.post("/api/stream/copilot/:id/used", asyncHandler(async (req, res) => {
    const suggestionId = parseInt(req.params.id);
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
    const campaignId = parseInt(req.params.id);
    const { migratedCount, conversionRate } = req.body;
    await updateCampaignMetrics(campaignId, migratedCount, conversionRate);
    res.json({ success: true });
  }));

  app.post("/api/growth/migration/:id/content", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const campaignId = parseInt(req.params.id);
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
    const candidateId = parseInt(req.params.id);
    const draft = await generateOutreachDraft(candidateId);
    res.json(draft);
  }));

  app.post("/api/growth/collabs/:id/status", asyncHandler(async (req, res) => {
    const candidateId = parseInt(req.params.id);
    const { status, responseReceived } = req.body;
    await updateOutreachStatus(candidateId, status, responseReceived);
    res.json({ success: true });
  }));

  app.post("/api/growth/collabs/:id/formats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const candidateId = parseInt(req.params.id);
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
    const jobId = parseInt(req.params.id);
    const result = await executeCompoundingJob(jobId);
    res.json(result);
  }));

  app.post("/api/content/compounding/:id/impact", asyncHandler(async (req, res) => {
    const jobId = parseInt(req.params.id);
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
    const ideaId = parseInt(req.params.id);
    const brief = await generateDesignBrief(ideaId);
    res.json(brief);
  }));

  app.post("/api/money/merch/:id/demand", asyncHandler(async (req, res) => {
    const ideaId = parseInt(req.params.id);
    const demand = await estimateDemand(ideaId);
    res.json(demand);
  }));

  app.post("/api/platform/algorithm/scan", asyncHandler(async (req, res) => {
    const { platform } = req.body;
    const signals = await scanAlgorithmChanges(platform || "youtube");
    res.json(signals);
  }));

  app.get("/api/platform/algorithm/signals", asyncHandler(async (req, res) => {
    const platform = req.query.platform as string | undefined;
    const signals = await getAlgorithmSignals(platform);
    res.json(signals);
  }));

  app.post("/api/platform/algorithm/:id/adapt", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const signalId = parseInt(req.params.id);
    const strategy = await generateAdaptationStrategy(signalId);
    res.json(strategy);
  }));

  app.post("/api/platform/algorithm/:id/auto-adapt", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const signalId = parseInt(req.params.id);
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
    const anomalyId = parseInt(req.params.id);
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
    const jobId = parseInt(req.params.id);
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
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { idea } = req.body;
    if (!idea || typeof idea !== "string" || idea.trim().length < 3) {
      return res.status(400).json({ error: "Please provide a content idea (at least 3 characters)" });
    }
    const blueprint = await buildEmpireFromIdea(userId, idea.trim());
    res.json(blueprint);
  }));

  app.get("/api/empire/blueprint", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const blueprint = await getEmpireBlueprint(userId);
    res.json(blueprint || { message: "No empire blueprint yet. Submit your idea to /api/empire/build" });
  }));

  app.post("/api/empire/content-ideas", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { count } = req.body;
    const ideas = await generateContentIdeasFromEmpire(userId, count || 10);
    res.json(ideas);
  }));

  app.post("/api/empire/expand-pillar", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { pillarIndex } = req.body;
    const expanded = await expandEmpirePillar(userId, pillarIndex ?? 0);
    res.json(expanded);
  }));

  app.post("/api/empire/launch-sequence", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videos = await getVideoCreations(userId);
    res.json(videos);
  }));

  app.get("/api/empire/videos/:videoKey", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const video = await getVideoCreation(userId, req.params.videoKey);
    if (!video) {
      res.status(404).json({ error: "Video creation not found" });
      return;
    }
    res.json(video);
  }));


  app.get("/api/security/dashboard", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const dashboard = await getSecurityDashboard();
    res.json(dashboard);
  }));

  app.get("/api/security/rules", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const rules = await getSecurityRules();
    res.json(rules);
  }));

  app.get("/api/security/blocked-ips", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const ips = await getBlockedIPs();
    res.json(ips);
  }));

  app.post("/api/security/learn/:id", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const eventId = parseInt(req.params.id);
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
    const targetUserId = req.params.id;
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
    const targetUserId = req.params.id;
    const timeline = await getCustomerTimeline(targetUserId);
    res.json(timeline);
  }));

  app.post("/api/customers/:id/tier-change", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const targetUserId = req.params.id;
    const { newTier, reason } = req.body;
    await recordTierChange(targetUserId, newTier, reason);
    res.json({ success: true });
  }));


  const empireLaunchRateLimitEmail = new Map<string, number>();
  const empireLaunchRateLimitIP = new Map<string, number>();

  const empireLaunchSchema = z.object({
    email: z.string().email("Please provide a valid email address").max(320),
    idea: z.string().min(3, "Please provide your content idea (at least 3 characters)").max(1000, "Idea must be under 1000 characters"),
  });

  app.post("/api/empire/launch", asyncHandler(async (req, res) => {
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
    const { buildToken } = req.params;
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
