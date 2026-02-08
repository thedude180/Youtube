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
  getContentStrategyAdvice,
  generateStreamSeo,
  postStreamOptimize,
  generateThumbnailPrompt,
  runAgentTask,
  generateCommunityPost,
} from "./ai-engine";
import { AI_AGENTS } from "@shared/schema";

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

  // AI Metadata Generation
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

  // === STREAM DESTINATIONS ===
  app.get(api.streamDestinations.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any)?.claims?.sub;
    const destinations = await storage.getStreamDestinations(userId);
    res.json(destinations);
  });

  app.post(api.streamDestinations.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
      const dest = await storage.createStreamDestination(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "stream_destination_created",
        target: dest.label,
        details: { platform: dest.platform },
        riskLevel: "low",
      });
      res.status(201).json(dest);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.streamDestinations.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const dest = await storage.updateStreamDestination(Number(req.params.id), req.body);
    res.json(dest);
  });

  app.delete(api.streamDestinations.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteStreamDestination(Number(req.params.id));
    res.sendStatus(204);
  });

  // === STREAMS ===
  app.get(api.streams.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any)?.claims?.sub;
    const streamList = await storage.getStreams(userId);
    res.json(streamList);
  });

  app.get(api.streams.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    res.json(stream);
  });

  app.post(api.streams.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
      const stream = await storage.createStream(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "stream_created",
        target: stream.title,
        details: { platforms: stream.platforms },
        riskLevel: "low",
      });
      res.status(201).json(stream);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.streams.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.updateStream(Number(req.params.id), req.body);
    res.json(stream);
  });

  // Stream SEO Optimization
  app.post(api.streams.optimizeSeo.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });

    try {
      const seoData = await generateStreamSeo({
        title: stream.title,
        description: stream.description,
        category: stream.category,
        platforms: (stream.platforms as string[]) || ['youtube'],
      });

      await storage.updateStream(stream.id, { seoData });
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "stream_seo_optimized",
        target: stream.title,
        riskLevel: "low",
      });

      res.json({ success: true, seoData });
    } catch (error: any) {
      console.error("Stream SEO error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === GO LIVE - Automated Stream Lifecycle ===
  app.post(api.streams.goLive.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'planned') {
      return res.status(400).json({ message: `Cannot go live from '${stream.status}' status. Stream must be in 'planned' state.` });
    }

    try {
      const userId = (req.user as any)?.claims?.sub;
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'live',
        startedAt: new Date(),
      });

      const tasks = [
        { name: "seo_optimization", status: "pending" },
        { name: "thumbnail_generation", status: "pending" },
        { name: "compliance_check", status: "pending" },
      ];

      const job = await storage.createJob({
        type: "stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms: stream.platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_went_live",
        target: stream.title,
        details: { platforms: stream.platforms, automationJobId: job.id },
        riskLevel: "low",
      });

      (async () => {
        const platforms = (stream.platforms as string[]) || ['youtube'];

        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms: stream.platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

        // Task 1: SEO Optimization
        try {
          tasks[0].status = "running";
          await persistTasks(10);

          const seoData = await generateStreamSeo({
            title: stream.title,
            description: stream.description,
            category: stream.category,
            platforms,
          });

          await storage.updateStream(stream.id, { seoData });
          tasks[0].status = "completed";
          (tasks[0] as any).result = { platformCount: Object.keys(seoData.platformSpecific || {}).length };
          await persistTasks(40);
        } catch (err) {
          console.error("Auto SEO failed:", err);
          tasks[0].status = "failed";
          (tasks[0] as any).error = (err as Error).message;
          await persistTasks(40);
        }

        // Task 2: Thumbnail Generation
        try {
          tasks[1].status = "running";
          await persistTasks(45);

          const thumbData = await generateThumbnailPrompt({
            title: stream.title,
            description: stream.description,
            platform: platforms[0],
            type: 'stream',
          });

          await storage.createThumbnail({
            videoId: null,
            streamId: stream.id,
            prompt: thumbData.prompt,
            platform: platforms[0],
            resolution: '1280x720',
            status: 'generated',
          });
          tasks[1].status = "completed";
          (tasks[1] as any).result = { style: thumbData.style };
          await persistTasks(70);
        } catch (err) {
          console.error("Auto thumbnail failed:", err);
          tasks[1].status = "failed";
          (tasks[1] as any).error = (err as Error).message;
          await persistTasks(70);
        }

        // Task 3: Compliance Check
        try {
          tasks[2].status = "running";
          await persistTasks(75);

          const recentLogs = await storage.getAuditLogs();
          const userLogs = recentLogs
            .filter(l => l.userId === userId)
            .slice(0, 20)
            .map(l => ({ action: l.action, target: l.target, details: l.details }));

          const complianceResult = await runComplianceCheck({
            channelName: stream.title,
            platform: platforms[0],
            recentActions: userLogs,
            settings: { streamType: 'live', category: stream.category },
          });

          tasks[2].status = "completed";
          (tasks[2] as any).result = { overallScore: complianceResult.overallScore, checks: complianceResult.checks?.length || 0 };
          await persistTasks(100);
        } catch (err) {
          console.error("Auto compliance failed:", err);
          tasks[2].status = "failed";
          (tasks[2] as any).error = (err as Error).message;
          await persistTasks(100);
        }

        const anyFailed = tasks.some((t: any) => t.status === 'failed');
        await storage.updateJobStatus(
          job.id,
          anyFailed ? 'completed_with_errors' : 'completed',
          { tasks, completedAt: new Date().toISOString() }
        );
      })();

      res.json({ success: true, stream: updatedStream, automationJobId: job.id });
    } catch (error: any) {
      console.error("Go live error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === END STREAM - Triggers Post-Stream Automation ===
  app.post(api.streams.endStream.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'live') {
      return res.status(400).json({ message: `Cannot end stream from '${stream.status}' status. Stream must be 'live'.` });
    }

    try {
      const userId = (req.user as any)?.claims?.sub;
      const endedAt = new Date();
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'ended',
        endedAt,
      });

      const tasks = [
        { name: "vod_optimization", status: "pending" },
        { name: "vod_thumbnail", status: "pending" },
      ];

      const job = await storage.createJob({
        type: "post_stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms: stream.platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_ended",
        target: stream.title,
        details: {
          platforms: stream.platforms,
          postProcessJobId: job.id,
          duration: stream.startedAt ? Math.round((endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000) : null,
        },
        riskLevel: "low",
      });

      (async () => {
        const platforms = (stream.platforms as string[]) || ['youtube'];
        const duration = stream.startedAt
          ? (endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000
          : undefined;

        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms: stream.platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

        // Task 1: VOD Optimization
        try {
          tasks[0].status = "running";
          await persistTasks(10);

          const result = await postStreamOptimize({
            title: stream.title,
            description: stream.description,
            category: stream.category,
            platforms,
            duration,
            stats: stream.streamStats,
          });

          await storage.updateStream(stream.id, {
            status: 'processed',
            seoData: {
              ...(stream.seoData as any),
              vodOptimization: result,
            },
          });

          tasks[0].status = "completed";
          (tasks[0] as any).result = { seoScore: result.seoScore };
          await persistTasks(60);
        } catch (err) {
          console.error("Auto VOD optimization failed:", err);
          tasks[0].status = "failed";
          (tasks[0] as any).error = (err as Error).message;
          await persistTasks(60);
        }

        // Task 2: VOD Thumbnail
        try {
          tasks[1].status = "running";
          await persistTasks(65);

          const thumbData = await generateThumbnailPrompt({
            title: stream.title,
            description: stream.description,
            platform: platforms[0],
            type: 'vod',
          });

          await storage.createThumbnail({
            videoId: null,
            streamId: stream.id,
            prompt: thumbData.prompt,
            platform: platforms[0],
            resolution: '1280x720',
            status: 'generated',
          });

          tasks[1].status = "completed";
          (tasks[1] as any).result = { style: thumbData.style };
          await persistTasks(100);
        } catch (err) {
          console.error("Auto VOD thumbnail failed:", err);
          tasks[1].status = "failed";
          (tasks[1] as any).error = (err as Error).message;
          await persistTasks(100);
        }

        const anyFailed = tasks.some((t: any) => t.status === 'failed');
        await storage.updateJobStatus(
          job.id,
          anyFailed ? 'completed_with_errors' : 'completed',
          { tasks, completedAt: new Date().toISOString() }
        );
      })();

      res.json({ success: true, stream: updatedStream, postProcessJobId: job.id });
    } catch (error: any) {
      console.error("End stream error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === STREAM AUTOMATION STATUS ===
  app.get(api.streams.automationStatus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const streamId = Number(req.params.id);
    const allJobs = await storage.getJobs();
    const streamJobs = allJobs.filter(j =>
      (j.type === 'stream_automation' || j.type === 'post_stream_automation') &&
      (j.payload as any)?.streamId === streamId
    );

    const tasks = streamJobs.flatMap(j => {
      const payload = j.payload as any;
      return (payload?.tasks || []).map((t: any) => ({
        ...t,
        jobId: j.id,
        jobType: j.type,
        jobStatus: j.status,
        progress: j.progress,
      }));
    });

    res.json({ jobs: streamJobs, tasks });
  });

  // Post-Stream Processing (manual)
  app.post(api.streams.postStreamProcess.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const stream = await storage.getStream(Number(req.params.id));
    if (!stream) return res.status(404).json({ message: "Stream not found" });

    try {
      const duration = stream.startedAt && stream.endedAt
        ? (stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000
        : undefined;

      const result = await postStreamOptimize({
        title: stream.title,
        description: stream.description,
        category: stream.category,
        platforms: (stream.platforms as string[]) || ['youtube'],
        duration,
        stats: stream.streamStats,
      });

      await storage.updateStream(stream.id, {
        status: 'processed',
        seoData: {
          ...(stream.seoData as any),
          vodOptimization: result,
        },
      });

      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "post_stream_processed",
        target: stream.title,
        details: { seoScore: result.seoScore },
        riskLevel: "low",
      });

      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Post-stream processing error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === BACKLOG OPTIMIZER ===
  app.post(api.backlog.optimize.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { channelId, videoIds } = req.body;

      let videosToOptimize;
      if (videoIds && videoIds.length > 0) {
        const allVideos = await storage.getVideos();
        videosToOptimize = allVideos.filter(v => videoIds.includes(v.id));
      } else if (channelId) {
        videosToOptimize = await storage.getVideosByChannel(channelId);
      } else {
        videosToOptimize = await storage.getVideos();
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

      // Process videos asynchronously (but in this request for now)
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
        userId: (req.user as any)?.claims?.sub,
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
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const allVideos = await storage.getVideos();
    const optimized = allVideos.filter(v => v.metadata?.aiOptimized).length;
    const allJobs = await storage.getJobs();
    const activeJob = allJobs.find(j => j.type === 'backlog_optimize' && j.status === 'processing') || null;

    res.json({
      totalVideos: allVideos.length,
      optimized,
      pending: allVideos.length - optimized,
      activeJob,
    });
  });

  // === THUMBNAILS ===
  app.post(api.thumbnails.generate.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { videoId, streamId, platform, title, description } = req.body;

      const thumbnailData = await generateThumbnailPrompt({
        title,
        description,
        platform: platform || 'youtube',
        type: streamId ? 'stream' : 'video',
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
        userId: (req.user as any)?.claims?.sub,
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

  // === AI AGENTS ===
  app.get(api.agents.activities.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agentId = req.query.agentId as string | undefined;
    const activities = await storage.getAgentActivities(agentId, 100);
    res.json(activities);
  });

  app.get(api.agents.status.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const activities = await storage.getAgentActivities(undefined, 200);
    const agentStatus = AI_AGENTS.map(agent => {
      const agentActs = activities.filter(a => a.agentId === agent.id);
      const lastActivity = agentActs[0];
      const todayCount = agentActs.filter(a => {
        const d = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const today = new Date(); today.setHours(0,0,0,0);
        return d >= today;
      }).length;
      return {
        ...agent,
        status: todayCount > 0 ? 'active' : 'idle',
        lastActivity: lastActivity ? {
          action: lastActivity.action,
          target: lastActivity.target,
          time: lastActivity.createdAt,
        } : null,
        todayActions: todayCount,
        totalActions: agentActs.length,
      };
    });
    res.json(agentStatus);
  });

  app.post(api.agents.trigger.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { agentId } = req.params;
    const userId = (req.user as any)?.claims?.sub;
    const agent = AI_AGENTS.find(a => a.id === agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    try {
      const channels = await storage.getChannels();
      const videos = await storage.getVideos();
      const result = await runAgentTask(agentId, {
        channelName: channels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: videos.slice(0, 5).map(v => v.title),
      });

      const activity = await storage.createAgentActivity({
        userId,
        agentId,
        action: result.action,
        target: result.target,
        status: "completed",
        details: {
          description: result.description,
          impact: result.impact,
          recommendations: result.recommendations,
          humanized: true,
          delayMs: Math.floor(Math.random() * 420000) + 60000,
        },
      });

      await storage.createAuditLog({
        userId,
        action: `agent_${agentId}_task`,
        target: result.target,
        details: { agentName: agent.name, action: result.action },
        riskLevel: "low",
      });

      res.json({ success: true, activity });
    } catch (error: any) {
      console.error(`Agent ${agentId} error:`, error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // === AUTOMATION RULES ===
  app.get(api.automation.rules.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const rules = await storage.getAutomationRules();
    res.json(rules);
  });

  app.post(api.automation.createRule.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
      const rule = await storage.createAutomationRule(input);
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.automation.updateRule.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const rule = await storage.updateAutomationRule(Number(req.params.id), req.body);
    res.json(rule);
  });

  app.delete(api.automation.deleteRule.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteAutomationRule(Number(req.params.id));
    res.sendStatus(204);
  });

  // === SCHEDULE ===
  app.get(api.schedule.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const items = await storage.getScheduleItems(undefined, from, to);
    res.json(items);
  });

  app.post(api.schedule.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
      const item = await storage.createScheduleItem(input);
      await storage.createAuditLog({
        userId: (req.user as any)?.claims?.sub,
        action: "schedule_item_created",
        target: item.title,
        riskLevel: "low",
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.schedule.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const item = await storage.updateScheduleItem(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete(api.schedule.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteScheduleItem(Number(req.params.id));
    res.sendStatus(204);
  });

  // === REVENUE ===
  app.get(api.revenue.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const platform = req.query.platform as string | undefined;
    const records = await storage.getRevenueRecords(undefined, platform);
    res.json(records);
  });

  app.post(api.revenue.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
    const record = await storage.createRevenueRecord(input);
    res.status(201).json(record);
  });

  app.get(api.revenue.summary.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const summary = await storage.getRevenueSummary();
    res.json(summary);
  });

  // === COMMUNITY ===
  app.get(api.community.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const platform = req.query.platform as string | undefined;
    const posts = await storage.getCommunityPosts(undefined, platform);
    res.json(posts);
  });

  app.post(api.community.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = { ...req.body, userId: (req.user as any)?.claims?.sub };
      if (req.body.aiGenerate) {
        const channels = await storage.getChannels();
        const videos = await storage.getVideos();
        const generated = await generateCommunityPost({
          platform: input.platform,
          channelName: channels[0]?.channelName || "My Channel",
          recentTitles: videos.slice(0, 5).map(v => v.title),
          type: input.type || 'engagement',
        });
        input.content = generated.content;
        input.aiGenerated = true;
      }
      const post = await storage.createCommunityPost(input);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.community.update.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const post = await storage.updateCommunityPost(Number(req.params.id), req.body);
    res.json(post);
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

    await storage.createChannel({
      userId: "demo",
      platform: "twitch",
      channelName: "GrowthLab_Live",
      channelId: "twitch_demo",
      settings: { preset: "normal", autoUpload: false, minShortsPerDay: 0, maxEditsPerDay: 2, cooldownMinutes: 60 },
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
