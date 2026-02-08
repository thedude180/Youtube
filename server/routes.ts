import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth/index";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  generateVideoMetadata,
  analyzeChannelGrowth,
  runComplianceCheck,
  generateContentInsights,
  getContentStrategyAdvice
} from "./ai-engine";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // === CHANNELS ===
  app.get(api.channels.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channels = await storage.getChannels();
    res.json(channels);
  });

  app.post(api.channels.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.channels.create.input.parse(req.body);
      const channel = await storage.createChannel(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "channel_created",
        target: channel.channelName,
        details: { platform: channel.platform, channelId: channel.channelId },
        riskLevel: "low",
      });
      res.status(201).json(channel);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.channels.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channel = await storage.updateChannel(Number(req.params.id), req.body);
    await storage.createAuditLog({
      userId: (req.user as any)?.claims?.sub,
      action: "channel_updated",
      target: channel.channelName,
      details: req.body,
      riskLevel: "low",
    });
    res.json(channel);
  });

  // === VIDEOS ===
  app.get(api.videos.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const videos = await storage.getVideos();
    res.json(videos);
  });

  app.post(api.videos.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.videos.create.input.parse(req.body);
      const video = await storage.createVideo(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "video_created",
        target: video.title,
        details: { type: video.type, status: video.status },
        riskLevel: "low",
      });
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.videos.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.json(video);
  });

  app.put(api.videos.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const video = await storage.updateVideo(Number(req.params.id), req.body);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "video_updated",
        target: video.title,
        details: req.body,
        riskLevel: "low",
      });
      res.json(video);
    } catch (e) {
      res.status(404).json({ message: "Video not found" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const video = await storage.getVideo(Number(req.params.id));
    if (!video) return res.status(404).json({ message: "Video not found" });
    await storage.deleteVideo(Number(req.params.id));
    await storage.createAuditLog({
      userId: (req.user as any)?.claims?.sub,
      action: "video_deleted",
      target: video.title,
      riskLevel: "medium",
    });
    res.sendStatus(204);
  });

  // AI Metadata Generation (real)
  app.post(api.videos.generateMetadata.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const videoId = Number(req.params.id);
    const video = await storage.getVideo(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    try {
      const suggestions = await generateVideoMetadata({
        title: video.title,
        description: video.description,
        type: video.type,
        metadata: video.metadata,
      });

      const newMetadata = {
        ...video.metadata,
        seoScore: suggestions.seoScore || 0,
        aiSuggestions: {
          titleHooks: suggestions.titleHooks || [],
          descriptionTemplate: suggestions.descriptionTemplate || "",
          thumbnailCritique: suggestions.thumbnailCritique || "",
          seoRecommendations: suggestions.seoRecommendations || [],
          complianceNotes: suggestions.complianceNotes || [],
        },
        tags: suggestions.suggestedTags || video.metadata?.tags || [],
      };

      await storage.updateVideo(videoId, { metadata: newMetadata });
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "ai_metadata_generated",
        target: video.title,
        details: { seoScore: suggestions.seoScore },
        riskLevel: "low",
      });

      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("AI metadata generation error:", error);
      res.status(500).json({ success: false, message: error.message || "AI generation failed" });
    }
  });

  // === JOBS ===
  app.get(api.jobs.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.post(api.jobs.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "job_created",
        target: job.type,
        details: input.payload,
        riskLevel: "low",
      });
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === DASHBOARD ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stats = await storage.getStats();
    res.json(stats);
  });

  // === AUDIT LOGS ===
  app.get(api.auditLogs.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  // === CONTENT INSIGHTS ===
  app.get(api.insights.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const insights = await storage.getContentInsights(channelId);
    res.json(insights);
  });

  app.post(api.insights.generate.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allVideos = await storage.getVideos();
      const videosForAnalysis = channelId
        ? allVideos.filter(v => v.channelId === channelId)
        : allVideos;

      const result = await generateContentInsights(
        videosForAnalysis.map(v => ({
          title: v.title,
          type: v.type,
          metadata: v.metadata,
        }))
      );

      if (channelId) await storage.clearInsights(channelId);

      for (const insight of (result.insights || [])) {
        await storage.createContentInsight({
          channelId: channelId || null,
          insightType: insight.insightType,
          category: insight.category,
          data: {
            finding: insight.finding,
            confidence: insight.confidence,
            recommendation: insight.recommendation,
            evidence: insight.evidence || [],
          },
        });
      }

      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "insights_generated",
        target: channelId ? `channel_${channelId}` : "all",
        riskLevel: "low",
      });

      res.json({ success: true, insights: result.insights, weeklyReport: result.weeklyReport });
    } catch (error: any) {
      console.error("Insights generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === COMPLIANCE ===
  app.get(api.compliance.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const records = await storage.getComplianceRecords(channelId);
    res.json(records);
  });

  app.post(api.compliance.run.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allChannels = await storage.getChannels();
      const targetChannels = channelId
        ? allChannels.filter(c => c.id === channelId)
        : allChannels;

      if (targetChannels.length === 0) {
        return res.json({ success: true, checks: [], overallScore: 100 });
      }

      const recentLogs = await storage.getAuditLogs();
      const channel = targetChannels[0];

      const result = await runComplianceCheck({
        channelName: channel.channelName,
        platform: channel.platform,
        recentActions: recentLogs.map(l => ({
          action: l.action,
          target: l.target,
          details: l.details,
        })),
        settings: channel.settings,
      });

      if (channelId) await storage.clearComplianceRecords(channelId);

      for (const check of (result.checks || [])) {
        await storage.createComplianceRecord({
          channelId: channel.id,
          platform: channel.platform,
          checkType: check.checkType,
          status: check.status,
          details: {
            rule: check.rule,
            description: check.description,
            severity: check.severity,
            recommendation: check.recommendation,
          },
        });
      }

      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "compliance_check_run",
        target: channel.channelName,
        details: { overallScore: result.overallScore },
        riskLevel: "low",
      });

      res.json({ success: true, checks: result.checks, overallScore: result.overallScore || 100, summary: result.summary });
    } catch (error: any) {
      console.error("Compliance check error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === GROWTH STRATEGIES ===
  app.get(api.strategies.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const strategies = await storage.getGrowthStrategies(channelId);
    res.json(strategies);
  });

  app.post(api.strategies.generate.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const channelId = req.body.channelId ? Number(req.body.channelId) : undefined;
      const allChannels = await storage.getChannels();
      const allVideos = await storage.getVideos();

      const channel = channelId
        ? allChannels.find(c => c.id === channelId)
        : allChannels[0];

      if (!channel) {
        return res.json({ success: true, strategies: [] });
      }

      const channelVideos = allVideos.filter(v => v.channelId === channel.id || !v.channelId);

      const result = await analyzeChannelGrowth({
        channelName: channel.channelName,
        platform: channel.platform,
        videoCount: channelVideos.length,
        videos: channelVideos.map(v => ({
          title: v.title,
          type: v.type,
          status: v.status,
          metadata: v.metadata,
        })),
      });

      for (const strategy of (result.strategies || [])) {
        await storage.createGrowthStrategy({
          channelId: channel.id,
          title: strategy.title,
          description: strategy.description,
          category: strategy.category,
          priority: strategy.priority,
          actionItems: strategy.actionItems || [],
          estimatedImpact: strategy.estimatedImpact,
          status: "pending",
          aiGenerated: true,
        });
      }

      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "strategies_generated",
        target: channel.channelName,
        riskLevel: "low",
      });

      res.json({ success: true, strategies: result.strategies });
    } catch (error: any) {
      console.error("Strategy generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put(api.strategies.updateStatus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const strategy = await storage.updateGrowthStrategy(Number(req.params.id), { status: req.body.status });
    res.json(strategy);
  });

  // === AI ADVISOR ===
  app.post(api.advisor.ask.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { question } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });

      const allChannels = await storage.getChannels();
      const allVideos = await storage.getVideos();
      const channel = allChannels[0];

      const answer = await getContentStrategyAdvice(question, {
        channelName: channel?.channelName,
        videoCount: allVideos.length,
        recentTitles: allVideos.slice(0, 10).map(v => v.title),
      });

      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "advisor_consulted",
        target: question.substring(0, 100),
        riskLevel: "low",
      });

      res.json({ answer });
    } catch (error: any) {
      console.error("Advisor error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingVideos = await storage.getVideos();
  if (existingVideos.length > 0) return;

  const existingChannels = await storage.getChannels();
  let channelId: number | undefined;

  if (existingChannels.length === 0) {
    const channel = await storage.createChannel({
      userId: "demo",
      platform: "youtube",
      channelName: "GrowthLab Gaming",
      channelId: "UC_demo_channel",
      settings: { preset: "normal", autoUpload: false, minShortsPerDay: 2, maxEditsPerDay: 3, cooldownMinutes: 60 },
    });
    channelId = channel.id;

    await storage.createChannel({
      userId: "demo",
      platform: "tiktok",
      channelName: "GrowthLab Clips",
      channelId: "tiktok_demo",
      settings: { preset: "aggressive", autoUpload: true, minShortsPerDay: 3, maxEditsPerDay: 5, cooldownMinutes: 30 },
    });
  } else {
    channelId = existingChannels[0].id;
  }

  const sampleVideos = [
    { title: "Top 10 Hidden Mechanics Every Player Misses", type: "vod", status: "uploaded", description: "Discover the game mechanics that most players overlook...", metadata: { tags: ["gaming", "tips", "mechanics"], stats: { views: 45200, likes: 3100, comments: 280, ctr: 8.2, avgWatchTime: 420 } } },
    { title: "I Tried the HARDEST Challenge for 24 Hours", type: "vod", status: "uploaded", description: "Can I survive the ultimate challenge?", metadata: { tags: ["challenge", "gaming"], stats: { views: 128500, likes: 9800, comments: 1240, ctr: 12.1, avgWatchTime: 680 } } },
    { title: "This Glitch Changes Everything", type: "short", status: "uploaded", description: "Quick glitch tutorial", metadata: { tags: ["glitch", "short", "tutorial"], stats: { views: 892000, likes: 45000, comments: 3200, ctr: 15.3, avgWatchTime: 42 } } },
    { title: "Pro vs Noob - Who Wins?", type: "short", status: "scheduled", description: "Watch the ultimate showdown", metadata: { tags: ["pvp", "comparison"], seoScore: 62 } },
    { title: "LIVE: Friday Night Gaming Session", type: "live_replay", status: "ready", description: "Weekly gaming stream replay", metadata: { tags: ["live", "gaming", "stream"], stats: { views: 12300, likes: 890, comments: 560, ctr: 5.4, avgWatchTime: 1200 } } },
    { title: "5 Settings You NEED to Change Right Now", type: "vod", status: "ingested", description: "Optimize your gaming setup with these essential settings", metadata: { tags: ["settings", "optimization"] } },
    { title: "Season Finale - Everything Changes", type: "vod", status: "processing", description: "The biggest update yet...", metadata: { tags: ["update", "season"] } },
  ];

  for (const v of sampleVideos) {
    await storage.createVideo({
      channelId,
      title: v.title,
      type: v.type,
      status: v.status,
      description: v.description,
      metadata: v.metadata as any,
      scheduledTime: v.status === 'scheduled' ? new Date(Date.now() + 86400000) : undefined,
      publishedAt: v.status === 'uploaded' ? new Date(Date.now() - Math.random() * 604800000) : undefined,
    });
  }

  await storage.createJob({ type: "metadata_opt", status: "completed", priority: 1, payload: { videoTitle: "Top 10 Hidden Mechanics", action: "seo_optimization" } });
  await storage.createJob({ type: "clip", status: "processing", priority: 2, payload: { source: "Friday Night Gaming Session", targetClips: 3 } });
  await storage.createJob({ type: "ingest", status: "pending", priority: 0, payload: { filename: "new_upload.mp4", watchFolder: "/content/incoming" } });

  await storage.createAuditLog({ action: "system_started", target: "worker_loop", riskLevel: "low" });
  await storage.createAuditLog({ action: "video_uploaded", target: "This Glitch Changes Everything", riskLevel: "low", details: { platform: "youtube", uploadType: "short" } });
  await storage.createAuditLog({ action: "metadata_updated", target: "Top 10 Hidden Mechanics", riskLevel: "low", details: { field: "description", method: "ai_assisted" } });
}
