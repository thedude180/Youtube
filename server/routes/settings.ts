import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import { brandAssets, competitorTracks, knowledgeMilestones, gettingStartedChecklist, channels, videos } from "@shared/schema";
import { requireAuth, requireTier, EMPIRE_TIER_GATES, parseNumericId } from "./helpers";
import {
  runStyleScan,
  recordFeedback,
} from "../creator-intelligence";
import {
  generateDailyBriefing, getHealthScore, processActionItems,
  updateAgentScorecard, generateGrowthPrediction, getContentDnaProfile,
} from "../learning-engine";
import {
  getUserGrowthPrograms, generateGrowthRecommendations,
  updateProgramMetrics, autoDetectAndUpdateMetrics,
  toggleAutoApply, updateApplicationStatus, generateApplicationGuide,
  activateMonetization, runComplianceCheck,
} from "../growth-programs-engine";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/notifications", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const notifications = await storage.getNotifications(userId);
    res.json(notifications);
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    await storage.markRead(id);
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.markAllRead(userId);
    res.json({ success: true });
  });

  app.post("/api/notifications/mark-all-read", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.markAllRead(userId);
    res.json({ success: true });
  });

  app.get("/api/notifications/preferences", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const prefs = await storage.getNotificationPreferences(userId);
      res.json(prefs || {
        emailEnabled: true,
        pushEnabled: true,
        smsEnabled: false,
        discordWebhookUrl: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: "UTC",
        digestFrequency: "none",
        categories: {},
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get notification preferences" });
    }
  });

  app.put("/api/notifications/preferences", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const prefs = await storage.upsertNotificationPreferences(userId, req.body);
      res.json(prefs);
    } catch (err) {
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  app.post("/api/style-scan/:channelId", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Style Scanner");
    if (!userId) return;
    try {
      const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
      if (channelId === null) return;
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const profile = await runStyleScan(userId, channelId);
      await storage.createAuditLog({
        userId,
        action: "style_scan_completed",
        target: channel.channelName,
        riskLevel: "low",
      });
      res.json({ success: true, profile });
    } catch (error: any) {
      console.error("Style scan error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/creator-memory", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Creator Memory");
    if (!userId) return;
    const memoryType = req.query.type as string | undefined;
    const memories = await storage.getCreatorMemory(userId, memoryType);
    res.json(memories);
  });

  app.get("/api/learning-insights", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const insights = await storage.getLearningInsights(userId);
    res.json(insights);
  });

  app.get("/api/brand-assets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const assets = await storage.getBrandAssets(userId);
    res.json(assets);
  });

  app.post("/api/brand-assets", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      type: z.string().min(1),
      name: z.string().min(1),
      value: z.string().optional(),
      url: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const asset = await storage.createBrandAsset({ ...parsed.data, userId } as any);
    res.status(201).json(asset);
  });

  app.put("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(brandAssets).where(and(eq(brandAssets.id, id), eq(brandAssets.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateSchema = z.object({
      type: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      value: z.string().optional(),
      url: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const asset = await storage.updateBrandAsset(id, parsed.data);
    res.json(asset);
  });

  app.delete("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(brandAssets).where(and(eq(brandAssets.id, id), eq(brandAssets.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteBrandAsset(id);
    res.sendStatus(204);
  });

  app.get("/api/competitors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const competitors = await storage.getCompetitorTracks(userId);
    res.json(competitors);
  });

  app.post("/api/competitors", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1),
      platform: z.string().optional(),
      channelUrl: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const competitor = await storage.createCompetitorTrack({ ...parsed.data, userId } as any);
    res.status(201).json(competitor);
  });

  app.put("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(competitorTracks).where(and(eq(competitorTracks.id, id), eq(competitorTracks.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      platform: z.string().optional(),
      channelUrl: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const competitor = await storage.updateCompetitorTrack(id, parsed.data);
    res.json(competitor);
  });

  app.delete("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(competitorTracks).where(and(eq(competitorTracks.id, id), eq(competitorTracks.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteCompetitorTrack(id);
    res.sendStatus(204);
  });

  app.get("/api/knowledge", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestones = await storage.getKnowledgeMilestones(userId);
    res.json(milestones);
  });

  app.post("/api/knowledge", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1),
      category: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const milestone = await storage.createKnowledgeMilestone({ ...parsed.data, userId } as any);
    res.status(201).json(milestone);
  });

  app.put("/api/knowledge/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(knowledgeMilestones).where(and(eq(knowledgeMilestones.id, id), eq(knowledgeMilestones.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updateSchema = z.object({
      title: z.string().min(1).optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = updateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const milestone = await storage.updateKnowledgeMilestone(id, parsed.data);
    res.json(milestone);
  });

  app.get("/api/learning/briefing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateDailyBriefing(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/learning/health-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getHealthScore(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/learning/action-items", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await processActionItems(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/learning/agent-scorecard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const scorecardSchema = z.object({
        agentId: z.string().min(1).max(100),
        taskResult: z.record(z.unknown()),
      });
      const parsed = scorecardSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const result = await updateAgentScorecard(userId, parsed.data.agentId, parsed.data.taskResult);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/learning/growth-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateGrowthPrediction(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/learning/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getContentDnaProfile(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/learning/skill-progress", async (req, res) => {
    const gate = EMPIRE_TIER_GATES["skill-progress"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    try {
      const { getSkillLevelFromVideosCreated, getCreatorVideosCreated, getYouTubeResearch } = await import("../youtube-learning-engine");
      const videosCreated = await getCreatorVideosCreated(userId);
      const skill = getSkillLevelFromVideosCreated(videosCreated);
      const research = await getYouTubeResearch(userId);
      res.json({
        videosCreated,
        ...skill,
        hasYouTubeResearch: !!research,
        nicheResearched: research ? "yes" : "not yet",
      });
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/learning/youtube-research", async (req, res) => {
    const gate = EMPIRE_TIER_GATES["youtube-research"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    try {
      const nicheSchema = z.object({ niche: z.string().min(1).max(500) });
      const parsed = nicheSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { niche } = parsed.data;
      const { researchYouTubeNiche } = await import("../youtube-learning-engine");
      const research = await researchYouTubeNiche(userId, niche);
      res.json({ success: true, research });
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/learning/analyze-video", async (req, res) => {
    const gate = EMPIRE_TIER_GATES["analyze-video"];
    const userId = await requireTier(req, res, gate.minTier, gate.label);
    if (!userId) return;
    try {
      const videoIdSchema = z.object({ videoId: z.union([z.string().min(1), z.number()]) });
      const parsedVideo = videoIdSchema.safeParse(req.body);
      if (!parsedVideo.success) return res.status(400).json({ error: "Invalid input", details: parsedVideo.error.flatten() });
      const { videoId } = parsedVideo.data;
      const { analyzeVideoPerformanceAndLearn } = await import("../youtube-learning-engine");
      const analysis = await analyzeVideoPerformanceAndLearn(userId, videoId);
      res.json({ success: true, analysis });
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/growth-programs", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await autoDetectAndUpdateMetrics(userId);
      const programs = await getUserGrowthPrograms(userId);
      res.json(programs);
    } catch (error: any) {
      console.error("Growth programs error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/recommendations", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Programs");
    if (!userId) return;
    try {
      const recommendations = await generateGrowthRecommendations(userId);
      res.json(recommendations || { prioritizedPrograms: [], crossPlatformStrategy: "", quickWins: [], longTermGoals: [] });
    } catch (error: any) {
      console.error("Growth recommendations error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.put("/api/growth-programs/:id/metrics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      metrics: z.array(z.object({
        metric: z.string(),
        current: z.number(),
      })),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const updated = await updateProgramMetrics(userId, id, parsed.data.metrics);
      if (!updated) return res.status(404).json({ message: "Program not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Update metrics error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/:id/auto-apply", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({ enabled: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const updated = await toggleAutoApply(userId, id, parsed.data.enabled);
      if (!updated) return res.status(404).json({ message: "Program not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Auto-apply toggle error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/:id/application-status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      status: z.enum(["not_applied", "ready_to_apply", "applied", "pending_review", "approved", "rejected"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid status" });
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const updated = await updateApplicationStatus(userId, id, parsed.data.status);
      if (!updated) return res.status(404).json({ message: "Program not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Application status error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/:id/generate-guide", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const programs = await getUserGrowthPrograms(userId);
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const program = programs.find(p => p.id === id);
      if (!program) return res.status(404).json({ message: "Program not found" });

      const guide = await generateApplicationGuide(program.platform, program.programName, program.applicationUrl || "");

      const { db } = await import("../db");
      const { platformGrowthPrograms } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(platformGrowthPrograms)
        .set({ applicationGuide: guide })
        .where(eq(platformGrowthPrograms.id, program.id));

      res.json(guide);
    } catch (error: any) {
      console.error("Guide generation error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/enable-all-auto-apply", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const programs = await getUserGrowthPrograms(userId);
      for (const program of programs) {
        await toggleAutoApply(userId, program.id, true);
      }
      res.json({ success: true, count: programs.length });
    } catch (error: any) {
      console.error("Enable all auto-apply error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/growth-programs/:id/activate-monetization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const updated = await activateMonetization(userId, id);
      if (!updated) return res.status(404).json({ message: "Program not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Activate monetization error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/growth-programs/compliance", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const results = await runComplianceCheck(userId);
      res.json(results);
    } catch (error: any) {
      console.error("Compliance check error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  const exportRateLimit = new Map<string, number>();

  app.post("/api/settings/export-data", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const lastExport = exportRateLimit.get(userId);
      if (lastExport && Date.now() - lastExport < 3600_000) {
        return res.status(429).json({ error: "You can only export data once per hour. Please try again later." });
      }
      const [user, userChannels, userVideos, notifications, revenueRecords, communityPosts] = await Promise.all([
        storage.getUser(userId),
        storage.getChannelsByUser(userId),
        storage.getVideosByUser(userId),
        storage.getNotifications(userId),
        storage.getRevenueRecords(userId),
        storage.getCommunityPosts(userId),
      ]);
      exportRateLimit.set(userId, Date.now());
      await storage.createAuditLog({
        userId,
        action: "data_export",
        target: "user_data",
        riskLevel: "low",
      });
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: user ? { id: user.id, role: user.role, tier: user.tier, contentNiche: user.contentNiche, email: user.email } : null,
        channels: userChannels,
        videos: userVideos,
        notifications,
        revenueRecords,
        communityPosts,
      };
      res.setHeader("Content-Disposition", "attachment; filename=creatoros-data-export.json");
      res.setHeader("Content-Type", "application/json");
      res.json(exportData);
    } catch (e: any) {
      console.error("Data export error:", e);
      res.status(500).json({ error: "Failed to export data. Please try again." });
    }
  });

  app.post("/api/settings/request-deletion", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await storage.createAuditLog({
        userId,
        action: "account_deletion_requested",
        target: "user_account",
        riskLevel: "high",
      });
      await storage.createNotification({
        userId,
        type: "system",
        title: "Account Deletion Requested",
        message: "Your account deletion request has been received. Your account and all associated data will be permanently deleted after a 30-day grace period. You can cancel this request by contacting support.",
      });
      res.json({
        success: true,
        message: "Account deletion request received. Your account will be permanently deleted after a 30-day grace period. You can cancel this request by contacting support.",
        gracePeriodDays: 30,
        scheduledDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (e: any) {
      console.error("Deletion request error:", e);
      res.status(500).json({ error: "Failed to process deletion request. Please try again." });
    }
  });

  app.get("/api/business-details", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const details = await storage.getBusinessDetails(userId);
      res.json(details || null);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/business-details", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const schema = z.object({
        hasExistingBusiness: z.boolean(),
        country: z.string().min(1),
        businessName: z.string().optional().nullable(),
        entityType: z.string().optional().nullable(),
        registrationNumber: z.string().optional().nullable(),
        taxId: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        stateProvince: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        registrationStatus: z.string().optional(),
        registrationSteps: z.any().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const result = await storage.upsertBusinessDetails(userId, parsed.data);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.put("/api/business-details/steps", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const details = await storage.getBusinessDetails(userId);
      if (!details) return res.status(404).json({ message: "No business details found" });
      const stepsSchema = z.object({ steps: z.array(z.unknown()) });
      const parsedSteps = stepsSchema.safeParse(req.body);
      if (!parsedSteps.success) return res.status(400).json({ error: "Invalid input", details: parsedSteps.error.flatten() });
      const { steps } = parsedSteps.data;
      const result = await storage.updateBusinessDetailsSteps(details.id, steps);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const checks = await storage.getWellnessChecks(userId);
      res.json(checks);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const wellnessSchema = z.object({
        mood: z.number().min(1).max(10),
        energy: z.number().min(1).max(10),
        stress: z.number().min(1).max(10),
        hoursWorked: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      });
      const parsedWellness = wellnessSchema.safeParse(req.body);
      if (!parsedWellness.success) return res.status(400).json({ error: "Invalid input", details: parsedWellness.error.flatten() });

      const check = await storage.createWellnessCheck({
        userId,
        ...parsedWellness.data,
      });
      res.status(201).json(check);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  const CHECKLIST_STEP_IDS = ['connect_youtube', 'connect_platform', 'set_niche', 'enable_autopilot', 'first_content'];

  app.get("/api/onboarding/checklist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const user = await storage.getUser(userId);
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const channelIds = userChannels.map(c => c.id);
      const userVideos = channelIds.length > 0
        ? await db.select().from(videos).where(inArray(videos.channelId, channelIds)).limit(1)
        : [];

      const autoDetections: Record<string, boolean> = {
        connect_youtube: userChannels.some(c => c.platform === 'youtube'),
        connect_platform: userChannels.length > 0,
        set_niche: !!(user?.contentNiche),
        enable_autopilot: !!(user?.autopilotActive),
        first_content: userVideos.length > 0,
      };

      const existing = await db.select().from(gettingStartedChecklist).where(eq(gettingStartedChecklist.userId, userId));
      const existingMap = new Map(existing.map(e => [e.stepId, e]));

      for (const [stepId, detected] of Object.entries(autoDetections)) {
        if (detected && !existingMap.get(stepId)?.completed) {
          const existingEntry = existingMap.get(stepId);
          if (existingEntry) {
            await db.update(gettingStartedChecklist)
              .set({ completed: true, completedAt: new Date() })
              .where(eq(gettingStartedChecklist.id, existingEntry.id));
          } else {
            await db.insert(gettingStartedChecklist).values({
              userId,
              stepId,
              completed: true,
              completedAt: new Date(),
            });
          }
        }
      }

      const updated = await db.select().from(gettingStartedChecklist).where(eq(gettingStartedChecklist.userId, userId));
      const updatedMap = new Map(updated.map(e => [e.stepId, e]));

      const steps = CHECKLIST_STEP_IDS.map(stepId => ({
        stepId,
        completed: updatedMap.get(stepId)?.completed || false,
        completedAt: updatedMap.get(stepId)?.completedAt || null,
      }));

      res.json({ steps, completedCount: steps.filter(s => s.completed).length, totalCount: steps.length });
    } catch (error: any) {
      console.error("[Onboarding] Checklist fetch error:", error);
      res.status(500).json({ message: "Failed to fetch checklist" });
    }
  });

  app.post("/api/onboarding/checklist/:stepId/complete", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { stepId } = req.params;
    if (!CHECKLIST_STEP_IDS.includes(stepId)) {
      return res.status(400).json({ error: "Invalid step ID" });
    }
    try {
      const [existing] = await db.select().from(gettingStartedChecklist)
        .where(and(eq(gettingStartedChecklist.userId, userId), eq(gettingStartedChecklist.stepId, stepId)));

      if (existing) {
        await db.update(gettingStartedChecklist)
          .set({ completed: true, completedAt: new Date() })
          .where(eq(gettingStartedChecklist.id, existing.id));
      } else {
        await db.insert(gettingStartedChecklist).values({
          userId,
          stepId,
          completed: true,
          completedAt: new Date(),
        });
      }
      res.json({ success: true, stepId, completed: true });
    } catch (error: any) {
      console.error("[Onboarding] Step complete error:", error);
      res.status(500).json({ message: "Failed to mark step complete" });
    }
  });
}
