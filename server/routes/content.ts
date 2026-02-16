import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc, inArray, gte, lte, isNotNull } from "drizzle-orm";
import { api } from "@shared/routes";
import {
  contentPipeline, contentIdeas, videos, scheduleItems,
  autopilotQueue, communityPosts, uploadQueue, streams,
  reengagementCampaigns, streamPipelines, channels,
} from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, getUserId, requireTier } from "./helpers";
import { sendSSEEvent } from "./events";
import {
  generateVideoMetadata,
  analyzeChannelGrowth,
  runComplianceCheck,
  generateContentInsights,
  getContentStrategyAdvice,
  generateThumbnailPrompt,
} from "../ai-engine";
import {
  startBacklogProcessing,
  getBacklogStatus,
  pauseBacklog,
  resumeBacklog,
  getVideosWithScores,
  bulkOptimize,
  autoScheduleOptimizedContent,
  getStaleVideos,
} from "../backlog-engine";

export function registerContentRoutes(app: Express) {
  app.post("/api/auto-connect-youtube", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const email = (req.user as any)?.claims?.email;
    const firstName = (req.user as any)?.claims?.first_name;
    const lastName = (req.user as any)?.claims?.last_name;

    try {
      const existingChannels = await storage.getChannelsByUser(userId);
      const hasYoutube = existingChannels.some(c => c.platform === "youtube");
      if (hasYoutube) {
        return res.json({ connected: true, existing: true, channel: existingChannels.find(c => c.platform === "youtube") });
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "My Channel";
      const channelHandle = email?.split("@")[0] || userId.slice(0, 12);

      const channel = await storage.createChannel({
        userId,
        platform: "youtube",
        channelName: `${displayName}'s YouTube`,
        channelId: `UC_${channelHandle}`,
        settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
      });

      await storage.createAuditLog({
        userId,
        action: "youtube_auto_connected",
        target: channel.channelName,
        details: { platform: "youtube", autoConnected: true },
        riskLevel: "low",
      });

      res.json({ connected: true, existing: false, channel });
    } catch (err: any) {
      console.error("Auto-connect YouTube error:", err);
      res.status(500).json({ message: "Failed to auto-connect YouTube" });
    }
  });

  app.get(api.channels.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channels = await storage.getChannelsByUser(userId);
    res.json(channels);
  });

  app.post(api.channels.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.channels.create.input.parse(req.body);
      const channel = await storage.createChannel({ ...input, userId });
      await storage.createAuditLog({
        userId,
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const existing = await storage.getChannel(Number(req.params.id));
      if (!existing || existing.userId !== userId) return res.status(404).json({ error: "Not found" });
      const channelUpdateSchema = z.object({}).passthrough();
      const parsed = channelUpdateSchema.parse(req.body);
      const channel = await storage.updateChannel(Number(req.params.id), parsed);
      await storage.createAuditLog({
        userId,
        action: "channel_updated",
        target: channel.channelName,
        details: parsed,
        riskLevel: "low",
      });
      res.json(channel);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.errors });
      throw err;
    }
  });

  app.delete("/api/channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channel = await storage.getChannel(Number(req.params.id));
    if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await storage.deleteChannel(Number(req.params.id));
    await storage.createAuditLog({
      userId,
      action: "channel_deleted",
      target: channel.channelName,
      details: { platform: channel.platform },
      riskLevel: "medium",
    });
    res.json({ success: true });
  });

  app.get(api.videos.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videos = await storage.getVideosByUser(userId);
    res.json(videos);
  });

  app.post(api.videos.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.videos.create.input.parse(req.body);
      const video = await storage.createVideo(input);
      await storage.createAuditLog({
        userId,
        action: "video_created",
        target: video.title,
        details: { type: video.type, status: video.status },
        riskLevel: "low",
      });
      sendSSEEvent(userId, "content-update", { type: "video" });
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.videos.get.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = Number(req.params.id);
    if (isNaN(videoId)) return res.status(400).json({ message: "Invalid video ID" });
    const video = await storage.getVideo(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });
    if (video.channelId) {
      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(404).json({ error: "Not found" });
    }
    res.json(video);
  });

  app.put(api.videos.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const vidId = Number(req.params.id);
    if (isNaN(vidId)) return res.status(400).json({ message: "Invalid video ID" });
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      platform: z.string().optional(),
      channelId: z.number().optional(),
      scheduledFor: z.string().optional().nullable(),
      metadata: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const existingVideo = await storage.getVideo(vidId);
      if (!existingVideo) return res.status(404).json({ message: "Video not found" });
      if (existingVideo.channelId) {
        const channel = await storage.getChannel(existingVideo.channelId);
        if (!channel || channel.userId !== userId) return res.status(404).json({ error: "Not found" });
      }
      const video = await storage.updateVideo(vidId, parsed.data as any);
      await storage.createAuditLog({
        userId,
        action: "video_updated",
        target: video.title,
        details: parsed.data,
        riskLevel: "low",
      });
      sendSSEEvent(userId, "content-update", { type: "video" });
      res.json(video);
    } catch (e) {
      res.status(404).json({ message: "Video not found" });
    }
  });

  app.delete(api.videos.delete.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const delId = Number(req.params.id);
    if (isNaN(delId)) return res.status(400).json({ message: "Invalid video ID" });
    const video = await storage.getVideo(delId);
    if (!video) return res.status(404).json({ message: "Video not found" });
    if (video.channelId) {
      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(404).json({ error: "Not found" });
    }
    await storage.deleteVideo(delId);
    await storage.createAuditLog({
      userId,
      action: "video_deleted",
      target: video.title,
      riskLevel: "medium",
    });
    sendSSEEvent(userId, "content-update", { type: "video" });
    res.sendStatus(204);
  });

  app.post(api.videos.generateMetadata.path, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Metadata Generation");
    if (!userId) return;
    const videoId = Number(req.params.id);
    const video = await storage.getVideo(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    try {
      const suggestions = await generateVideoMetadata({
        title: video.title,
        description: video.description,
        type: video.type,
        metadata: video.metadata,
        platform: video.platform || undefined,
      }, userId);

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
        userId,
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

  app.get(api.jobs.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.post(api.jobs.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const input = api.jobs.create.input.parse(req.body);
      const job = await storage.createJob(input);
      await storage.createAuditLog({
        userId,
        action: "job_created",
        target: job.type,
        details: input.payload,
        riskLevel: "low",
      });
      sendSSEEvent(userId, "job-complete", { jobId: job.id });
      res.status(201).json(job);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.dashboard.stats.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.get(api.auditLogs.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  app.get("/api/videos/updated", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const syncLogs = await storage.getAuditLogsByUser(userId, "platform_sync_push");
      res.json(syncLogs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/videos/update-history", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const youtubeVideoId = req.query.youtubeVideoId as string | undefined;
      const history = await storage.getVideoUpdateHistory(userId, youtubeVideoId);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/videos/processing", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const pipelines = await db.select().from(contentPipeline)
        .where(and(
          eq(contentPipeline.userId, userId),
          inArray(contentPipeline.status, ["queued", "processing"]),
        ))
        .orderBy(desc(contentPipeline.createdAt));
      res.json(pipelines);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(api.insights.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const insights = await storage.getContentInsights(channelId);
    res.json(insights);
  });

  app.post(api.insights.generate.path, async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Insights");
    if (!userId) return;
    const schema = z.object({
      channelId: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const channelId = parsed.data.channelId;
      const allVideos = await storage.getVideosByUser(userId);
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
        userId,
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

  app.get(api.compliance.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const records = await storage.getComplianceRecords(channelId);
    res.json(records);
  });

  app.post(api.compliance.run.path, async (req, res) => {
    const userId = await requireTier(req, res, "free", "Compliance Checks");
    if (!userId) return;
    const schema = z.object({
      channelId: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const channelId = parsed.data.channelId;
      const allChannels = await storage.getChannelsByUser(userId);
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
        userId,
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

  app.get(api.strategies.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const strategies = await storage.getGrowthStrategies(channelId);
    res.json(strategies);
  });

  app.post(api.strategies.generate.path, async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Strategies");
    if (!userId) return;
    const schema = z.object({
      channelId: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const channelId = parsed.data.channelId;
      const allChannels = await storage.getChannelsByUser(userId);
      const allVideos = await storage.getVideosByUser(userId);

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
        userId,
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      status: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const strategy = await storage.updateGrowthStrategy(Number(req.params.id), { status: parsed.data.status });
    res.json(strategy);
  });

  app.post(api.advisor.ask.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      question: z.string().min(1, "Question is required"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { question } = parsed.data;

      const allChannels = await storage.getChannelsByUser(userId);
      const allVideos = await storage.getVideosByUser(userId);
      const channel = allChannels[0];

      const answer = await getContentStrategyAdvice(question, {
        channelName: channel?.channelName,
        videoCount: allVideos.length,
        recentTitles: allVideos.slice(0, 10).map(v => v.title),
      }, userId);

      await storage.createAuditLog({
        userId,
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

  app.post(api.backlog.optimize.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      channelId: z.number().optional(),
      videoIds: z.array(z.number()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { channelId, videoIds } = parsed.data;

      let videosToOptimize;
      if (videoIds && videoIds.length > 0) {
        const allVideos = await storage.getVideosByUser(userId);
        videosToOptimize = allVideos.filter(v => videoIds.includes(v.id));
      } else if (channelId) {
        videosToOptimize = await storage.getVideosByChannel(channelId);
      } else {
        videosToOptimize = await storage.getVideosByUser(userId);
      }

      const unoptimized = videosToOptimize.filter(v => !v.metadata?.aiOptimized);

      const job = await storage.createJob({
        type: "backlog_optimize",
        status: "processing",
        priority: 1,
        payload: {
          totalVideos: unoptimized.length,
          videoIds: unoptimized.map(v => v.id),
          channelId: channelId || null,
        },
      });

      (async () => {
        let completed = 0;
        for (const video of unoptimized) {
          try {
            const suggestions = await generateVideoMetadata({
              title: video.title,
              description: video.description,
              type: video.type,
              metadata: video.metadata,
              platform: video.platform || undefined,
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
              aiOptimized: true,
              aiOptimizedAt: new Date().toISOString(),
            };

            await storage.updateVideo(video.id, { metadata: newMetadata });
            completed++;
            const progress = Math.round((completed / unoptimized.length) * 100);
            await storage.updateJobProgress(job.id, progress);
          } catch (err) {
            console.error(`Failed to optimize video ${video.id}:`, err);
          }
        }
        await storage.updateJobStatus(job.id, 'completed', { optimized: completed, total: unoptimized.length });
      })();

      await storage.createAuditLog({
        userId,
        action: "backlog_optimization_started",
        target: `${unoptimized.length} videos`,
        riskLevel: "low",
      });

      res.json({ success: true, jobId: job.id });
    } catch (error: any) {
      console.error("Backlog optimization error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.status.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getBacklogStatus } = await import("../backlog-manager");
      const managerStatus = await getBacklogStatus(userId);

      const allVideos = await storage.getVideosByUser(userId);
      const optimized = allVideos.filter(v => v.metadata?.aiOptimized).length;
      const allJobs = await storage.getJobs();
      const activeJob = allJobs.find(j => j.type === 'backlog_optimize' && j.status === 'processing') || null;

      res.json({
        ...managerStatus,
        totalVideos: allVideos.length,
        optimized,
        pending: allVideos.length - optimized,
        activeJob,
      });
    } catch (err: any) {
      console.error("[Backlog] Status error:", err);
      res.status(500).json({ error: "Failed to get backlog status" });
    }
  });

  app.post(api.backlog.autoStart.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      mode: z.enum(["deep", "quick"]).optional().default("deep"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const mode = parsed.data.mode;
      const result = await startBacklogProcessing(userId, mode);
      
      if (!result.alreadyRunning) {
        await storage.createAuditLog({
          userId,
          action: "auto_backlog_started",
          target: `${result.totalVideos} videos queued`,
          details: { mode, jobId: result.jobId },
          riskLevel: "low",
        });
      }

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Auto backlog start error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.engineStatus.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getBacklogStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(api.backlog.pause.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const success = await pauseBacklog(userId);
    res.json({ success });
  });

  app.post(api.backlog.resume.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const success = await resumeBacklog(userId);
    res.json({ success });
  });

  app.get(api.backlog.videoScores.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const scores = await getVideosWithScores(userId);
    res.json(scores);
  });

  app.post(api.backlog.bulkOptimize.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      videoIds: z.array(z.number()).min(1),
      agentIds: z.array(z.string()).min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { videoIds, agentIds } = parsed.data;
      const result = await bulkOptimize(userId, videoIds, agentIds);
      
      await storage.createAuditLog({
        userId,
        action: "bulk_optimize_started",
        target: `${videoIds.length} videos with ${agentIds.length} agents`,
        riskLevel: "low",
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(api.backlog.autoSchedule.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const scheduled = await autoScheduleOptimizedContent(userId);
      res.json({ success: true, scheduled });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(api.backlog.staleVideos.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stale = await getStaleVideos(userId);
    res.json(stale);
  });

  app.post(api.thumbnails.generate.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      videoId: z.number().optional(),
      streamId: z.number().optional(),
      platform: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      gameName: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      brandKeywords: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { videoId, streamId, platform, title, description, gameName, category, brandKeywords } = parsed.data;

      let resolvedGameName = gameName || null;
      let resolvedCategory = category || null;
      let resolvedBrandKeywords = brandKeywords || [];
      if (videoId) {
        const video = await storage.getVideo(videoId);
        if (video?.metadata) {
          resolvedGameName = resolvedGameName || video.metadata.gameName || null;
          resolvedCategory = resolvedCategory || video.metadata.contentCategory || null;
          resolvedBrandKeywords = resolvedBrandKeywords.length ? resolvedBrandKeywords : video.metadata.brandKeywords || [];
        }
      }

      const thumbnailData = await generateThumbnailPrompt({
        title,
        description,
        platform: platform || 'youtube',
        type: streamId ? 'stream' : 'video',
        gameName: resolvedGameName,
        category: resolvedCategory,
        brandKeywords: resolvedBrandKeywords,
      });

      const thumbnail = await storage.createThumbnail({
        videoId: videoId || null,
        streamId: streamId || null,
        prompt: thumbnailData.prompt,
        platform: platform || 'youtube',
        resolution: '1280x720',
        status: 'generated',
      });

      await storage.createAuditLog({
        userId,
        action: "thumbnail_generated",
        target: title,
        details: { platform, style: thumbnailData.style },
        riskLevel: "low",
      });

      res.json({ success: true, thumbnail: { ...thumbnail, aiData: thumbnailData } });
    } catch (error: any) {
      console.error("Thumbnail generation error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/content-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const ideas = await storage.getContentIdeas(userId, status);
    res.json(ideas);
  });

  app.post("/api/content-ideas", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const idea = await storage.createContentIdea({ ...req.body, userId });
      res.status(201).json(idea);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/content-ideas/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const [existing] = await db.select().from(contentIdeas).where(and(eq(contentIdeas.id, Number(req.params.id)), eq(contentIdeas.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const idea = await storage.updateContentIdea(Number(req.params.id), req.body);
    res.json(idea);
  });

  app.delete("/api/content-ideas/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const [existing] = await db.select().from(contentIdeas).where(and(eq(contentIdeas.id, Number(req.params.id)), eq(contentIdeas.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteContentIdea(Number(req.params.id));
    res.sendStatus(204);
  });

  app.get("/api/video-versions/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const versions = await storage.getVideoVersions(Number(req.params.videoId));
    res.json(versions);
  });

  app.get("/api/content-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sourceVideoId = req.query.sourceVideoId ? Number(req.query.sourceVideoId) : undefined;
    const clips = await storage.getContentClips(userId, sourceVideoId);
    res.json(clips);
  });

  app.post("/api/content-clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const clip = await storage.createContentClip({ ...req.body, userId });
      res.status(201).json(clip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/collaboration-leads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const leads = await storage.getCollaborationLeads(userId);
    res.json(leads);
  });

  app.post("/api/collaboration-leads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const lead = await storage.createCollaborationLead({ ...req.body, userId });
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/compliance-rules", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const rules = await storage.getComplianceRules(platform);
    res.json(rules);
  });

  app.get("/api/localization/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const rec = await storage.getLocalizationRecommendations(userId);
      res.json(rec || { recommendedLanguages: [], trafficData: {}, source: "none" });
    } catch (e: any) { console.error("Localization recommendations error:", e); res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calendar/uploads", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const entries: any[] = [];
      const seenVideoIds = new Set<number>();

      const userChannels = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId));
      const channelIds = userChannels.map(c => c.id);

      const [
        userVideos,
        schedItems,
        vodRows,
        livePipes,
        autopilotItems,
        communityItems,
        uploadItems,
        streamItems,
        campaigns,
      ] = await Promise.all([
        channelIds.length > 0
          ? db.select().from(videos)
              .where(inArray(videos.channelId, channelIds))
              .orderBy(desc(videos.createdAt))
              .limit(500)
          : Promise.resolve([]),
        db.select().from(scheduleItems)
          .where(eq(scheduleItems.userId, userId))
          .orderBy(desc(scheduleItems.scheduledAt))
          .limit(500),
        db.select({
          pipeline: contentPipeline,
          videoScheduledTime: videos.scheduledTime,
          videoPublishedAt: videos.publishedAt,
        }).from(contentPipeline)
          .leftJoin(videos, eq(contentPipeline.videoId, videos.id))
          .where(eq(contentPipeline.userId, userId))
          .orderBy(desc(contentPipeline.createdAt))
          .limit(500),
        db.select().from(streamPipelines)
          .where(eq(streamPipelines.userId, userId))
          .orderBy(desc(streamPipelines.createdAt))
          .limit(500),
        db.select().from(autopilotQueue)
          .where(eq(autopilotQueue.userId, userId))
          .orderBy(desc(autopilotQueue.scheduledAt))
          .limit(500),
        db.select().from(communityPosts)
          .where(and(eq(communityPosts.userId, userId), isNotNull(communityPosts.scheduledAt)))
          .orderBy(desc(communityPosts.scheduledAt))
          .limit(500),
        db.select().from(uploadQueue)
          .where(eq(uploadQueue.userId, userId))
          .orderBy(desc(uploadQueue.scheduledAt))
          .limit(500),
        db.select().from(streams)
          .where(eq(streams.userId, userId))
          .orderBy(desc(streams.createdAt))
          .limit(200),
        db.select().from(reengagementCampaigns)
          .where(and(eq(reengagementCampaigns.userId, userId), isNotNull(reengagementCampaigns.scheduledAt)))
          .orderBy(desc(reengagementCampaigns.scheduledAt))
          .limit(200),
      ]);

      for (const vid of userVideos) {
        const date = vid.scheduledTime || vid.publishedAt;
        if (!date) continue;
        seenVideoIds.add(vid.id);
        entries.push({
          id: `vid-${vid.id}`,
          title: vid.title,
          date,
          platform: vid.platform || "youtube",
          contentType: vid.type || "video",
          status: (vid.status === "published" || vid.status === "public") ? "uploaded" : "scheduled",
        });
      }

      for (const item of schedItems) {
        if (!item.scheduledAt) continue;
        if (item.videoId && seenVideoIds.has(item.videoId)) continue;
        entries.push({
          id: `sched-${item.id}`,
          title: item.title,
          date: item.scheduledAt,
          platform: item.platform || "youtube",
          contentType: item.type || "video",
          status: item.status === "completed" ? "uploaded" : "scheduled",
          canDelete: true,
          rawId: item.id,
        });
      }

      for (const row of vodRows) {
        const p = row.pipeline;
        const date = row.videoScheduledTime || row.videoPublishedAt || p.completedAt;
        if (!date) continue;
        if (p.videoId && seenVideoIds.has(p.videoId)) continue;
        entries.push({
          id: `vod-${p.id}`,
          title: p.videoTitle,
          date,
          platform: "youtube",
          contentType: "video",
          status: p.status === "completed" ? "uploaded" : "scheduled",
        });
      }

      for (const p of livePipes) {
        const date = p.scheduledStartAt || p.startedAt;
        if (!date) continue;
        entries.push({
          id: `live-${p.id}`,
          title: p.sourceTitle,
          date,
          platform: "youtube",
          contentType: p.pipelineType === "live" ? "stream" : "video",
          status: p.status === "completed" ? "uploaded" : "scheduled",
        });
      }

      for (const item of autopilotItems) {
        const date = item.scheduledAt;
        if (!date) continue;
        entries.push({
          id: `ap-${item.id}`,
          title: item.caption || item.content?.slice(0, 60) || "Autopilot Post",
          date,
          platform: item.targetPlatform || "youtube",
          contentType: item.type || "post",
          status: item.status === "published" ? "uploaded" : "scheduled",
        });
      }

      for (const post of communityItems) {
        if (!post.scheduledAt) continue;
        entries.push({
          id: `cp-${post.id}`,
          title: post.content?.slice(0, 60) || "Community Post",
          date: post.scheduledAt,
          platform: post.platform || "youtube",
          contentType: "post",
          status: post.status === "published" ? "uploaded" : "scheduled",
        });
      }

      for (const uq of uploadItems) {
        const date = uq.scheduledAt;
        if (!date) continue;
        if (uq.videoId && seenVideoIds.has(uq.videoId)) continue;
        entries.push({
          id: `uq-${uq.id}`,
          title: uq.metadata?.title || "Queued Upload",
          date,
          platform: uq.platform || "youtube",
          contentType: "video",
          status: uq.status === "uploaded" ? "uploaded" : "scheduled",
        });
      }

      for (const s of streamItems) {
        const date = s.startedAt || s.createdAt;
        if (!date) continue;
        if (s.status === "planned" && !s.startedAt) continue;
        entries.push({
          id: `stream-${s.id}`,
          title: s.title,
          date,
          platform: (s.platforms as string[])?.[0] || "youtube",
          contentType: "stream",
          status: s.status === "ended" || s.status === "completed" ? "uploaded" : "scheduled",
        });
      }

      for (const c of campaigns) {
        if (!c.scheduledAt) continue;
        entries.push({
          id: `camp-${c.id}`,
          title: `Re-engagement: ${c.segment}`,
          date: c.scheduledAt,
          platform: c.platform || "youtube",
          contentType: "campaign",
          status: c.status === "executed" ? "uploaded" : "scheduled",
        });
      }

      entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      res.json(entries);
    } catch (err: any) {
      console.error("[Calendar Uploads] Error:", err);
      res.status(500).json({ error: "Failed to load upload calendar" });
    }
  });
}
