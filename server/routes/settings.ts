import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, getUserId } from "./helpers";
import { sendSSEEvent } from "./events";
import {
  runStyleScan,
  recordFeedback,
} from "../creator-intelligence";
import {
  generateDailyBriefing, getHealthScore, processActionItems,
  updateAgentScorecard, generateGrowthPrediction, getContentDnaProfile,
} from "../learning-engine";
import {
  logWorkload, getWorkloadSummary, checkBurnoutRisk, getBurnoutAlerts,
  acknowledgeBurnoutAlert, suggestDelegation, createTeamTask, getTeamTasks,
  updateTeamTask, getCreativeBlockSuggestions, scanCompliance,
  storeLegalDocument, getLegalDocuments, manageCrm,
} from "../wellness-engine";
import {
  getUserGrowthPrograms, generateGrowthRecommendations,
  updateProgramMetrics, autoDetectAndUpdateMetrics,
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
    await storage.markRead(Number(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.markAllRead(userId);
    res.json({ success: true });
  });

  app.post("/api/style-scan/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const profile = await runStyleScan(userId, Number(req.params.channelId));
      await storage.createAuditLog({
        userId,
        action: "style_scan_completed",
        target: channel.channelName,
        riskLevel: "low",
      });
      res.json({ success: true, profile });
    } catch (error: any) {
      console.error("Style scan error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/feedback", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { targetType, targetId, rating, aiFunction } = req.body;
      await recordFeedback(userId, targetType, targetId, rating, aiFunction);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/creator-memory", async (req, res) => {
    const userId = requireAuth(req, res);
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
    const asset = await storage.createBrandAsset({ ...parsed.data, userId });
    res.status(201).json(asset);
  });

  app.put("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const asset = await storage.updateBrandAsset(Number(req.params.id), req.body);
    res.json(asset);
  });

  app.delete("/api/brand-assets/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteBrandAsset(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const checks = await storage.getWellnessChecks(userId, limit);
    res.json(checks);
  });

  app.post("/api/wellness", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      mood: z.number().optional(),
      energy: z.number().optional(),
      stress: z.number().optional(),
      notes: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const check = await storage.createWellnessCheck({ ...parsed.data, userId });
    res.status(201).json(check);
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
    const competitor = await storage.createCompetitorTrack({ ...parsed.data, userId });
    res.status(201).json(competitor);
  });

  app.put("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const competitor = await storage.updateCompetitorTrack(Number(req.params.id), req.body);
    res.json(competitor);
  });

  app.delete("/api/competitors/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteCompetitorTrack(Number(req.params.id));
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
    const milestone = await storage.createKnowledgeMilestone({ ...parsed.data, userId });
    res.status(201).json(milestone);
  });

  app.put("/api/knowledge/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const milestone = await storage.updateKnowledgeMilestone(Number(req.params.id), req.body);
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/learning/agent-scorecard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await updateAgentScorecard(userId, req.body.agentId, req.body.taskResult);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/workload", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await logWorkload(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/workload", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getWorkloadSummary(userId, req.query.days ? Number(req.query.days) : undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/burnout-check", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await checkBurnoutRisk(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/burnout-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getBurnoutAlerts(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/burnout-acknowledge/:alertId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await acknowledgeBurnoutAlert(userId, Number(req.params.alertId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/delegation", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await suggestDelegation(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/team-task", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await createTeamTask(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/team-tasks", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getTeamTasks(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/wellness/team-task/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await updateTeamTask(Number(req.params.id), req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/creative-block", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getCreativeBlockSuggestions(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/compliance-scan/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await scanCompliance(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/legal-document", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await storeLegalDocument(userId, req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/legal-documents", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getLegalDocuments(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/wellness/crm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await manageCrm(userId, req.body.action, req.body.data);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/wellness/crm", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await manageCrm(userId, "get", {});
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/growth-programs/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const recommendations = await generateGrowthRecommendations(userId);
      res.json(recommendations || { prioritizedPrograms: [], crossPlatformStrategy: "", quickWins: [], longTermGoals: [] });
    } catch (error: any) {
      console.error("Growth recommendations error:", error);
      res.status(500).json({ message: error.message });
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
      const updated = await updateProgramMetrics(userId, Number(req.params.id), parsed.data.metrics);
      if (!updated) return res.status(404).json({ message: "Program not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Update metrics error:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
