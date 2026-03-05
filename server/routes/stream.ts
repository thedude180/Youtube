import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { requireAuth, requireTier, parseNumericId, asyncHandler } from "./helpers";
import { cached } from "../lib/cache";
import {
  generateStreamSeo,
  postStreamOptimize,
  generateThumbnailPrompt,
  runComplianceCheck,
} from "../ai-engine";
import { pivotToStream, resumeFromStream } from "../backlog-engine";
import { processGoLiveAnnouncements, processPostStreamHighlights } from "../autopilot-engine";
import { processLiveChatMessage, getLiveChatFeed, getLiveChatStats, getMultiStreamStatus } from "../live-chat-engine";
import { createPipelineForStream } from "./pipeline";
import { pauseForLive, resumeAfterStream } from "../backlog-manager";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { sendSSEEvent } from "./events";
import { getQuotaStatus } from "../services/youtube-quota-tracker";
import { fireAgentEvent } from "../services/agent-events";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

async function checkYouTubeLiveViaWatchPage(channelId: string): Promise<boolean> {
  const result = await detectYouTubeLiveFromChannel(channelId);
  return result.isLive;
}


export function registerStreamRoutes(app: Express) {
  app.get(api.streamDestinations.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const destinations = await storage.getStreamDestinations(userId);
    res.json(destinations);
  }));

  app.post(api.streamDestinations.create.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      platform: z.string().min(1),
      label: z.string().min(1),
      rtmpUrl: z.string().default(""),
      streamKey: z.string().optional(),
      enabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const dest = await storage.createStreamDestination(input);
      await storage.createAuditLog({
        userId,
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
      console.error("Error creating stream destination:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.streamDestinations.update.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const existing = await storage.getStreamDestination(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Destination not found" });
    }
    const schema = z.object({
      platform: z.string().min(1).optional(),
      label: z.string().min(1).optional(),
      rtmpUrl: z.string().optional(),
      streamKey: z.string().optional(),
      enabled: z.boolean().optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const dest = await storage.updateStreamDestination(id, parsed.data);
    res.json(dest);
  }));

  app.delete(api.streamDestinations.delete.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const existing = await storage.getStreamDestination(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Destination not found" });
    }
    await storage.deleteStreamDestination(id);
    res.sendStatus(204);
  }));

  app.get(api.streams.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamList = await storage.getStreams(userId);
    res.json(streamList);
  }));

  app.get(api.streams.get.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });
    res.json(stream);
  }));

  app.post(api.streams.create.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      platforms: z.array(z.string()).optional(),
      scheduledFor: z.string().optional().nullable(),
      status: z.string().optional(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId: userId };
      const stream = await storage.createStream(input);
      await storage.createAuditLog({
        userId,
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
      console.error("Error creating stream:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.streams.update.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const existing = await storage.getStream(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Stream not found" });
    }
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      platforms: z.array(z.string()).optional(),
      status: z.string().optional(),
      scheduledFor: z.string().optional().nullable(),
    }).passthrough();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const stream = await storage.updateStream(id, parsed.data);
    res.json(stream);
  }));

  app.post(api.streams.optimizeSeo.path, asyncHandler(async (req, res) => {
    const userId = requireTier(req, res, "pro", "Stream SEO Optimization");
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });

    try {
      const seoData = await generateStreamSeo({
        title: stream.title,
        description: stream.description,
        category: stream.category,
        platforms: (stream.platforms as string[]) || ['youtube'],
      });

      await storage.updateStream(stream.id, { seoData });
      await storage.createAuditLog({
        userId,
        action: "stream_seo_optimized",
        target: stream.title,
        riskLevel: "low",
      });

      res.json({ success: true, seoData });
    } catch (error: any) {
      console.error("Stream SEO error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.streams.goLive.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'planned') {
      return res.status(400).json({ message: `Cannot go live from '${stream.status}' status. Stream must be in 'planned' state.` });
    }

    try {
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'live',
        startedAt: new Date(),
      });

      pauseForLive(userId, stream.id);

      pivotToStream(userId, stream.id).catch(err =>
        console.error("Stream pivot error:", err)
      );

      processGoLiveAnnouncements(
        userId,
        stream.id,
        stream.title,
        stream.description || "",
        (stream.platforms as string[]) || ["youtube"],
      ).catch(err => console.error("[Autopilot] Go-live announcement error:", err));

      createPipelineForStream(userId, stream.title).catch(err =>
        console.error("[Pipeline] Auto-pipeline on go-live error:", err)
      );

      await storage.createNotification({
        userId,
        type: "stream_live",
        title: "Stream is LIVE",
        message: `"${stream.title}" — all platform automations triggered`,
        severity: "info",
      });

      sendSSEEvent(userId, "stream_update", { type: "live_detected", streamId: stream.id, title: stream.title });
      sendSSEEvent(userId, "notification", { type: "new" });
      sendSSEEvent(userId, "backlog_update", { state: "paused_for_live", streamId: stream.id });

      const tasks = [
        { name: "seo_optimization", status: "pending" },
        { name: "thumbnail_generation", status: "pending" },
        { name: "compliance_check", status: "pending" },
      ];

      // AUDIT FIX: Normalize platforms before job creation so DB payload never stores undefined
      const platforms = (stream.platforms as string[]) || ["youtube"];

      const job = await storage.createJob({
        type: "stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_went_live",
        target: stream.title,
        details: { platforms, automationJobId: job.id },
        riskLevel: "low",
      });

      (async () => {
        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

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
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.streams.endStream.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });
    if (stream.status !== 'live') {
      return res.status(400).json({ message: `Cannot end stream from '${stream.status}' status. Stream must be 'live'.` });
    }

    try {
      const endedAt = new Date();
      const updatedStream = await storage.updateStream(stream.id, {
        status: 'ended',
        endedAt,
      });

      fireAgentEvent("stream.ended", userId, {
        platform: (stream.platforms as string[])?.[0] || "youtube",
        streamTitle: stream.title,
        streamId: stream.id,
      });

      resumeFromStream(userId, stream.id).catch(err =>
        console.error("Stream resume error:", err)
      );

      processPostStreamHighlights(
        userId,
        stream.id,
        stream.title,
        stream.description || "",
        (stream.platforms as string[]) || ["youtube"],
      ).catch(err => console.error("[Autopilot] Post-stream highlights error:", err));

      createPipelineForStream(userId, stream.title, "replay").catch(err =>
        console.error("[Pipeline] REPLAY pipeline for ended stream error:", err)
      );

      resumeAfterStream(userId).catch(err =>
        console.error("[Backlog] Resume after manual stream end error:", err)
      );

      await storage.createNotification({
        userId,
        type: "stream_ended",
        title: "Stream Ended",
        message: `"${stream.title}" — REPLAY pipeline started, backlog will resume automatically`,
        severity: "info",
      });

      sendSSEEvent(userId, "stream_update", { type: "stream_ended", streamId: stream.id, title: stream.title });
      sendSSEEvent(userId, "notification", { type: "new" });
      sendSSEEvent(userId, "backlog_update", { state: "waiting_for_replay" });

      const tasks = [
        { name: "vod_optimization", status: "pending" },
        { name: "vod_thumbnail", status: "pending" },
      ];

      // AUDIT FIX: Normalize platforms before job creation so DB payload never stores undefined
      const platforms = (stream.platforms as string[]) || ["youtube"];

      const job = await storage.createJob({
        type: "post_stream_automation",
        status: "processing",
        priority: 1,
        payload: { streamId: stream.id, platforms, tasks },
      });

      await storage.createAuditLog({
        userId,
        action: "stream_ended",
        target: stream.title,
        details: {
          platforms,
          postProcessJobId: job.id,
          duration: stream.startedAt ? Math.round((endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000) : null,
        },
        riskLevel: "low",
      });

      (async () => {
        const duration = stream.startedAt
          ? (endedAt.getTime() - new Date(stream.startedAt).getTime()) / 1000
          : undefined;

        const persistTasks = async (progress: number) => {
          await storage.updateJobPayload(job.id, { streamId: stream.id, platforms, tasks });
          await storage.updateJobProgress(job.id, progress);
        };

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
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.streams.automationStatus.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const streamId = parseNumericId(req.params.id, res);
    if (streamId === null) return;
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
  }));

  app.post(api.streams.postStreamProcess.path, asyncHandler(async (req, res) => {
    const userId = requireTier(req, res, "pro", "Post-Stream Processing");
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });

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
        userId,
        action: "post_stream_processed",
        target: stream.title,
        details: { seoScore: result.seoScore },
        riskLevel: "low",
      });

      res.json({ success: true, result });
    } catch (error: any) {
      console.error("Post-stream processing error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/multi-status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const status = await getMultiStreamStatus(userId, id);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/chat", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const messages = await getLiveChatFeed(id, limit);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/chat/stats", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const stats = await getLiveChatStats(id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/streams/:id/chat", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      platform: z.string().min(1),
      author: z.string().min(1),
      message: z.string().min(1),
      metadata: z.any().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const result = await processLiveChatMessage(
        userId,
        id,
        parsed.data.platform,
        parsed.data.author,
        parsed.data.message,
        parsed.data.metadata,
      );
      res.json({ stored: true, aiResponse: result });
    } catch (error: any) {
      console.error("Live chat error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/youtube/live-status", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await cached(`youtube-live-status:${userId}`, 10, async () => {
        const channels = await storage.getChannelsByUser(userId);
        const ytChannel = channels.find(c => c.platform === "youtube" && c.accessToken);
        if (!ytChannel) {
          return { connected: false, broadcasts: [], activeStream: null };
        }

        const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
        let broadcasts: any[] = [];
        let detectionMethod = "api";
        if (quota.remaining > 5) {
          broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
        } else if (ytChannel.channelId) {
          detectionMethod = "rss";
          const isLive = await checkYouTubeLiveViaWatchPage(ytChannel.channelId);
          if (isLive) broadcasts = [{ broadcastId: "rss_live", title: "Live Stream", status: "active" }];
        }
        const streamList = await storage.getStreams(userId);
        const liveStream = streamList.find((s: any) => s.status === "live");

        return {
          connected: true,
          channelName: ytChannel.channelName,
          broadcasts,
          activeStream: liveStream || null,
          detectionMethod,
        };
      });
      res.json(result);
    } catch (error: any) {
      console.error("[YouTube] Live status error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/youtube/detect-live", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
      if (!ytChannel) {
        return res.json({ detected: false, reason: "YouTube not connected" });
      }

      const streamList = await storage.getStreams(userId);
      const existingLive = streamList.find((s: any) => s.status === "live");

      const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
      let broadcasts: any[] = [];
      let detectionMethod = "db";
      if (quota.remaining > 5) {
        broadcasts = await checkYouTubeLiveBroadcasts(ytChannel.id);
        detectionMethod = "api";
      } else if (ytChannel.channelId) {
        detectionMethod = "rss";
        const isLive = await checkYouTubeLiveViaWatchPage(ytChannel.channelId);
        if (isLive) broadcasts = [{ broadcastId: "rss_live", title: "Live Stream", status: "active" }];
      }

      return res.json({
        detected: broadcasts.length > 0 || !!existingLive,
        detectionMethod,
        broadcasts,
        activeStream: existingLive || null,
        message: "Live detection runs automatically every 2 minutes.",
      });
    } catch (error: any) {
      console.error("[YouTube] Detect live error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));
}
