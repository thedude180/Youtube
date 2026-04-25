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
import { getAISemaphoreStats } from "../lib/ai-semaphore";
import { pivotToStream, resumeFromStream } from "../backlog-engine";
import { processGoLiveAnnouncements, processPostStreamHighlights } from "../autopilot-engine";
import { processLiveChatMessage, getLiveChatFeed, getLiveChatStats, getMultiStreamStatus } from "../live-chat-engine";
import { getChatBridgeStatus } from "../services/chat-bridge";
import { createPipelineForStream } from "./pipeline";
import { pauseForLive, resumeAfterStream } from "../backlog-manager";
import { checkYouTubeLiveBroadcasts } from "../youtube";
import { sendSSEEvent } from "./events";
import {
  getQuotaStatus,
  trackQuotaUsage,
  isQuotaBreakerTripped,
  markQuotaErrorFromResponse,
  cacheLiveChatId,
  getCachedLiveChatId,
} from "../services/youtube-quota-tracker";
import { fireAgentEvent } from "../services/agent-events";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";
import { db } from "../db";
import { videos, channels, streams } from "@shared/schema";
import { eq, and, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { enqueueAgentTask } from "../ai-team-engine";
import { aiAgentTasks } from "@shared/schema";

import { createLogger } from "../lib/logger";

const logger = createLogger("stream");
async function checkYouTubeLiveViaWatchPage(channelId: string): Promise<boolean> {
  const result = await detectYouTubeLiveFromChannel(channelId);
  return result.isLive;
}


export function registerStreamRoutes(app: Express) {
  app.get(api.streamDestinations.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const destinations = await storage.getStreamDestinations(userId);
    res.json(destinations);
  }));

  app.post(api.streamDestinations.create.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
      logger.error("Error creating stream destination:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.streamDestinations.update.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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

  app.get("/api/stream/command-center", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const streamList = await storage.getStreams(userId);
    const activeStream = streamList.find((s: any) => s.status === "live" || s.status === "starting");
    res.json({
      sessionId: activeStream?.id || null,
      status: activeStream?.status || "offline",
      activeStream: activeStream || null,
      totalStreams: streamList.length,
    });
  }));

  app.get(api.streams.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const streamList = await storage.getStreams(userId);
    res.json(streamList);
  }));

  app.get(api.streams.get.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });
    res.json(stream);
  }));

  app.post(api.streams.create.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
      logger.error("Error creating stream:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.streams.update.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
    const userId = await requireTier(req, res, "pro", "Stream SEO Optimization");
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });

    if (getAISemaphoreStats().rateLimitedUntil > Date.now()) {
      return res.status(503).json({ success: false, message: "AI is temporarily rate-limited. Please try again in a few minutes.", retryAfter: Math.ceil((getAISemaphoreStats().rateLimitedUntil - Date.now()) / 1000) });
    }

    try {
      const seoData = await Promise.race([
        generateStreamSeo({
          title: stream.title,
          description: stream.description,
          category: stream.category,
          platforms: (stream.platforms as string[]) || ['youtube'],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("SEO timeout"), { isTimeout: true })), 10_000)
        ),
      ]);

      await storage.updateStream(stream.id, { seoData });
      await storage.createAuditLog({
        userId,
        action: "stream_seo_optimized",
        target: stream.title,
        riskLevel: "low",
      });

      res.json({ success: true, seoData });
    } catch (error: any) {
      if (error?.isTimeout) {
        return res.status(503).json({ success: false, message: "AI is currently busy. SEO will be auto-applied when AI becomes available." });
      }
      logger.error("Stream SEO error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.streams.goLive.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
        logger.error("Stream pivot error:", err)
      );

      processGoLiveAnnouncements(
        userId,
        stream.id,
        stream.title,
        stream.description || "",
        (stream.platforms as string[]) || ["youtube"],
      ).catch(err => logger.error("[Autopilot] Go-live announcement error:", err));

      createPipelineForStream(userId, stream.title).catch(err =>
        logger.error("[Pipeline] Auto-pipeline on go-live error:", err)
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
          logger.error("Auto SEO failed:", err);
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
          logger.error("Auto thumbnail failed:", err);
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
          logger.error("Auto compliance failed:", err);
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
      logger.error("Go live error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.streams.endStream.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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
        logger.error("Stream resume error:", err)
      );

      processPostStreamHighlights(
        userId,
        stream.id,
        stream.title,
        stream.description || "",
        (stream.platforms as string[]) || ["youtube"],
      ).catch(err => logger.error("[Autopilot] Post-stream highlights error:", err));

      createPipelineForStream(userId, stream.title, "replay").catch(err =>
        logger.error("[Pipeline] REPLAY pipeline for ended stream error:", err)
      );

      resumeAfterStream(userId).catch(err =>
        logger.error("[Backlog] Resume after manual stream end error:", err)
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
          logger.error("Auto VOD optimization failed:", err);
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
          logger.error("Auto VOD thumbnail failed:", err);
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
      logger.error("End stream error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.streams.automationStatus.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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

  app.get("/api/agents/tasks/:taskId/result", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const taskId = parseNumericId(req.params.taskId, res);
    if (taskId === null) return;

    const [task] = await db.select().from(aiAgentTasks).where(and(eq(aiAgentTasks.id, taskId), eq(aiAgentTasks.ownerId, userId))).limit(1);
    if (!task) return res.status(404).json({ error: "Task not found" });

    res.json(task.result || {});
  }));

  app.get("/api/notifications/vapid-public-key", asyncHandler(async (req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return res.status(500).json({ error: "VAPID public key not configured" });
    res.json({ publicKey });
  }));

  app.post("/api/notifications/subscribe", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription" });
    }

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const prefs = user.userPreferences || {};
    const subs = prefs.pushSubscriptions || [];

    // Avoid duplicates
    if (!subs.find((s: any) => s.endpoint === subscription.endpoint)) {
      subs.push(subscription);
    }

    await storage.updateUserProfile(userId, {
      userPreferences: {
        ...prefs,
        pushSubscriptions: subs
      }
    } as any);

    res.json({ success: true });
  }));

  app.post(api.streams.postStreamProcess.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Post-Stream Processing");
    if (!userId) return;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    const stream = await storage.getStream(id);
    if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Stream not found" });

    if (getAISemaphoreStats().rateLimitedUntil > Date.now()) {
      return res.status(503).json({ success: false, message: "AI is temporarily rate-limited. Post-stream analysis will run automatically when AI becomes available.", retryAfter: Math.ceil((getAISemaphoreStats().rateLimitedUntil - Date.now()) / 1000) });
    }

    try {
      const duration = stream.startedAt && stream.endedAt
        ? (stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000
        : undefined;

      const result = await Promise.race([
        postStreamOptimize({
          title: stream.title,
          description: stream.description,
          category: stream.category,
          platforms: (stream.platforms as string[]) || ['youtube'],
          duration,
          stats: stream.streamStats,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("Post-process timeout"), { isTimeout: true })), 10_000)
        ),
      ]);

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
      if (error?.isTimeout) {
        return res.status(503).json({ success: false, message: "AI is currently busy. Post-stream analysis will run automatically when AI becomes available." });
      }
      logger.error("Post-stream processing error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/multi-status", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
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

  app.get("/api/chat-bridge/status", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Stream Chat Management");
    if (!userId) return;
    try {
      const status = getChatBridgeStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/chat", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Stream Chat Management");
    if (!userId) return;
    try {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const [stream] = await db.select({ userId: streams.userId }).from(streams).where(eq(streams.id, id));
      if (!stream || stream.userId !== userId) return res.status(403).json({ message: "Access denied" });
      const messages = await getLiveChatFeed(id, limit);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/streams/:id/chat/stats", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Stream Chat Management");
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id, res);
      if (id === null) return;
      const [stream] = await db.select({ userId: streams.userId }).from(streams).where(eq(streams.id, id));
      if (!stream || stream.userId !== userId) return res.status(403).json({ message: "Access denied" });
      const stats = await getLiveChatStats(id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/streams/:id/chat", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Stream Chat Management");
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
      const [stream] = await db.select({ userId: streams.userId }).from(streams).where(eq(streams.id, id));
      if (!stream || stream.userId !== userId) return res.status(403).json({ message: "Access denied" });
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
      logger.error("Live chat error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/youtube/live-status", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    try {
      // 5-minute cache — was 10 seconds, which caused a liveBroadcasts.list call (50 units)
      // on every frontend poll (every 3 min) = 24,000+ units/day. Now: scraping-first,
      // API only when live is confirmed and quota is healthy.
      const result = await cached(`youtube-live-status:${userId}`, 300, async () => {
        const userChannels = await storage.getChannelsByUser(userId);
        const ytChannelAuth = userChannels.find(c => c.platform === "youtube" && c.accessToken);
        const ytChannelAny = userChannels.find(c => c.platform === "youtube");

        const streamList = await storage.getStreams(userId);
        const liveStream = streamList.find((s: any) => s.status === "live");

        const channelId = ytChannelAuth?.channelId || ytChannelAny?.channelId;

        // Step 1: always try scraping first — zero quota cost
        let isScrapedLive = false;
        let scrapedVideoId: string | undefined;
        let scrapedTitle: string | undefined;
        if (channelId) {
          try {
            const scraped = await detectYouTubeLiveFromChannel(channelId);
            isScrapedLive = scraped.isLive;
            scrapedVideoId = scraped.videoId ?? undefined;
            scrapedTitle = scraped.title ?? undefined;
          } catch { /* non-fatal */ }
        }

        if (!ytChannelAuth) {
          const broadcasts = isScrapedLive
            ? [{ broadcastId: scrapedVideoId || "scrape_live", title: scrapedTitle || "Live Stream", status: "active", videoId: scrapedVideoId }]
            : [];
          return {
            connected: false,
            oauthRequired: true,
            channelName: ytChannelAny?.channelName,
            broadcasts,
            activeStream: liveStream || null,
            detectionMethod: "scrape_public",
          };
        }

        // Step 2: if scraping says live AND we have auth AND quota is healthy,
        // call liveBroadcasts.list (50 units) ONCE to get the liveChatId we need for chat.
        // We NEVER call the API just to confirm not-live status — scraping handles that for free.
        let broadcasts: any[] = [];
        let detectionMethod = "scrape";
        let liveStreamId: string | null = null;

        if (isScrapedLive) {
          // Check shared cache first — other services may have already resolved this
          const cached = getCachedLiveChatId(ytChannelAuth.id);
          if (cached.hit && cached.liveChatId) {
            broadcasts = [{
              broadcastId: scrapedVideoId || "cached_live",
              title: scrapedTitle || "Live Stream",
              status: "active",
              videoId: scrapedVideoId,
              liveChatId: cached.liveChatId,
            }];
            liveStreamId = scrapedVideoId || null;
            detectionMethod = "scrape+cache";
          } else if (!isQuotaBreakerTripped()) {
            const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
            // Only spend 50 units on the broadcast lookup when we have ample budget
            if (quota.remaining >= 500) {
              try {
                const apiBroadcasts = await checkYouTubeLiveBroadcasts(ytChannelAuth.id);
                await trackQuotaUsage(userId, "broadcast");
                if (apiBroadcasts.length > 0) {
                  broadcasts = apiBroadcasts;
                  liveStreamId = (apiBroadcasts[0] as any).broadcastId || scrapedVideoId || null;
                  // Cache the liveChatId for other services
                  const liveChatId = (apiBroadcasts[0] as any).liveChatId || null;
                  cacheLiveChatId(ytChannelAuth.id, liveChatId, liveStreamId || undefined);
                  detectionMethod = "scrape+api";
                } else {
                  // API returned nothing — stream starting up, use scrape result
                  cacheLiveChatId(ytChannelAuth.id, null);
                  broadcasts = [{ broadcastId: scrapedVideoId || "scrape_live", title: scrapedTitle || "Live Stream", status: "active", videoId: scrapedVideoId }];
                  liveStreamId = scrapedVideoId || null;
                }
              } catch (err: any) {
                markQuotaErrorFromResponse(err);
                // Fallback to scrape result even if API fails
                broadcasts = [{ broadcastId: scrapedVideoId || "scrape_live", title: scrapedTitle || "Live Stream", status: "active", videoId: scrapedVideoId }];
                liveStreamId = scrapedVideoId || null;
              }
            } else {
              // Low quota — use scrape result only
              broadcasts = [{ broadcastId: scrapedVideoId || "scrape_live", title: scrapedTitle || "Live Stream", status: "active", videoId: scrapedVideoId }];
              liveStreamId = scrapedVideoId || null;
              detectionMethod = "scrape_low_quota";
            }
          } else {
            // Quota breaker tripped — scrape only
            broadcasts = [{ broadcastId: scrapedVideoId || "scrape_live", title: scrapedTitle || "Live Stream", status: "active", videoId: scrapedVideoId }];
            liveStreamId = scrapedVideoId || null;
            detectionMethod = "scrape_quota_tripped";
          }
        }

        return {
          connected: true,
          channelName: ytChannelAuth.channelName,
          broadcasts,
          liveStreamId,
          activeStream: liveStream || null,
          detectionMethod,
        };
      });
      res.json(result);
    } catch (error: any) {
      logger.error("[YouTube] Live status error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/youtube/detect-live", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannelAuth = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
      const ytChannelAny = userChannels.find((c: any) => c.platform === "youtube");

      const streamList = await storage.getStreams(userId);
      const existingLive = streamList.find((s: any) => s.status === "live");

      if (!ytChannelAuth) {
        // No OAuth — fall back to public watch-page detection using stored channel ID
        if (ytChannelAny?.channelId) {
          const isLive = await checkYouTubeLiveViaWatchPage(ytChannelAny.channelId);
          const broadcasts = isLive
            ? [{ broadcastId: "rss_live", title: "Live Stream", status: "active" }]
            : [];
          return res.json({
            detected: isLive || !!existingLive,
            detectionMethod: "rss_public",
            oauthRequired: true,
            broadcasts,
            activeStream: existingLive || null,
            message: "Connect YouTube in Settings for full live detection.",
          });
        }
        return res.json({ detected: false, oauthRequired: true, reason: "YouTube not connected" });
      }

      const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
      let broadcasts: any[] = [];
      let detectionMethod = "db";
      if (quota.remaining > 5) {
        broadcasts = await checkYouTubeLiveBroadcasts(ytChannelAuth.id);
        detectionMethod = "api";
      } else if (ytChannelAuth.channelId) {
        detectionMethod = "rss";
        const isLive = await checkYouTubeLiveViaWatchPage(ytChannelAuth.channelId);
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
      logger.error("[YouTube] Detect live error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  // --- UNEDITED STREAMS ---

  app.get("/api/stream/unedited-vods", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
      const channelIds = userChannels.map((c) => c.id);

      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Source 1: videos table — stream VODs that are still in "ingested" state after 24h
      const uneditedVideoRows = channelIds.length > 0
        ? await db.select().from(videos).where(
            and(
              inArray(videos.channelId, channelIds),
              eq(videos.type, "stream_vod"),
              eq(videos.status, "ingested"),
              lt(videos.publishedAt, cutoff24h)
            )
          )
        : [];

      // Source 2: streams table — ended streams with no linked VOD video, within last 30 days
      const uneditedStreamRows = await db.select().from(streams).where(
        and(
          eq(streams.userId, userId),
          isNotNull(streams.endedAt),
          isNull(streams.vodVideoId),
          lt(streams.createdAt, cutoff24h)
        )
      ).then((rows) => rows.filter((s) => s.endedAt && s.endedAt > cutoff30d));

      // Build a unified list
      const seenYouTubeIds = new Set<string>();
      const result: any[] = [];

      for (const v of uneditedVideoRows) {
        const meta = v.metadata as any;
        const ytId = meta?.youtubeId;
        if (ytId) seenYouTubeIds.add(ytId);
        result.push({
          id: v.id,
          source: "video",
          title: v.title,
          thumbnailUrl: v.thumbnailUrl || null,
          streamedAt: meta?.streamStartedAt || v.publishedAt?.toISOString() || null,
          durationMs: meta?.streamDurationMs || null,
          youtubeId: ytId || null,
          youtubeUrl: ytId ? `https://youtube.com/watch?v=${ytId}` : null,
        });
      }

      for (const s of uneditedStreamRows) {
        result.push({
          id: s.id,
          source: "stream",
          title: s.title,
          thumbnailUrl: s.thumbnailUrl || null,
          streamedAt: s.startedAt?.toISOString() || s.endedAt?.toISOString() || null,
          durationMs: s.startedAt && s.endedAt
            ? s.endedAt.getTime() - s.startedAt.getTime()
            : null,
          youtubeId: null,
          youtubeUrl: null,
        });
      }

      // Sort newest first
      result.sort((a, b) => {
        const ta = a.streamedAt ? new Date(a.streamedAt).getTime() : 0;
        const tb = b.streamedAt ? new Date(b.streamedAt).getTime() : 0;
        return tb - ta;
      });

      res.json(result);
    } catch (error: any) {
      logger.error("[UnEditedVODs] Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.patch("/api/stream/unedited-vods/:id/mark-uploaded", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Stream Center");
    if (!userId) return;
    const { source } = req.query;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    try {
      if (source === "stream") {
        const stream = await storage.getStream(id);
        if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Not found" });
        // Mark stream as having a "manual" VOD reference so it leaves the list
        await storage.updateStream(id, { vodVideoId: -1 } as any);
      } else {
        const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
        const channelIds = userChannels.map((c) => c.id);
        const [video] = await db.select().from(videos).where(
          and(eq(videos.id, id), channelIds.length > 0 ? inArray(videos.channelId, channelIds) : eq(videos.id, -1))
        );
        if (!video) return res.status(404).json({ message: "Not found" });
        await storage.updateVideo(id, { status: "uploaded" } as any);
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error("[UnEditedVODs] Mark uploaded error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/stream/unedited-vods/:id/start-pipeline", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Pipeline Execution");
    if (!userId) return;
    const { source } = req.query;
    const id = parseNumericId(req.params.id, res);
    if (id === null) return;
    try {
      let title = "Stream VOD";
      let youtubeId: string | null = null;
      let durationMs: number | null = null;

      if (source === "stream") {
        const stream = await storage.getStream(id);
        if (!stream || stream.userId !== userId) return res.status(404).json({ message: "Not found" });
        title = stream.title;
        durationMs = stream.startedAt && stream.endedAt
          ? stream.endedAt.getTime() - stream.startedAt.getTime()
          : null;
        // Mark as processing so it leaves the unedited list
        await storage.updateStream(id, { vodVideoId: -2 } as any);
      } else {
        const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
        const channelIds = userChannels.map((c) => c.id);
        const [video] = await db.select().from(videos).where(
          and(eq(videos.id, id), channelIds.length > 0 ? inArray(videos.channelId, channelIds) : eq(videos.id, -1))
        );
        if (!video) return res.status(404).json({ message: "Not found" });
        title = video.title;
        const meta = video.metadata as any;
        youtubeId = meta?.youtubeId || null;
        durationMs = meta?.streamDurationMs || null;
        await storage.updateVideo(id, { status: "processing" } as any);
      }

      const payload = { title, youtubeId, durationMs, sourceId: id, source };

      // Queue Kenji (editor) and Jamie (catalog director) in parallel
      await Promise.all([
        enqueueAgentTask(userId, "ai-editor", "edit_stream_vod",
          `Edit stream VOD: ${title}`, payload, 7),
        enqueueAgentTask(userId, "ai-catalog-director", "catalog_vod_repurpose",
          `Repurpose stream VOD into clips/compilations: ${title}`, payload, 8),
      ]);

      res.json({ success: true, agentsQueued: ["ai-editor", "ai-catalog-director"] });
    } catch (error: any) {
      logger.error("[UnEditedVODs] Start pipeline error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/stream-upgrades/highlights", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "youtube", "Stream Center");
      if (!userId) return;
      res.json([]);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/stream-upgrades/chat-sentiment", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "starter", "Stream Chat Management");
      if (!userId) return;
      res.json({
        overallScore: 0,
        moods: { positive: 0, neutral: 0, negative: 0 },
        trendingTopics: [],
      });
    } catch {
      res.json({ overallScore: 0, moods: { positive: 0, neutral: 0, negative: 0 }, trendingTopics: [] });
    }
  });

  app.get("/api/stream-upgrades/overlay", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "youtube", "Stream Center");
      if (!userId) return;
      res.json([]);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/stream-upgrades/overlay", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "youtube", "Stream Center");
      if (!userId) return;
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update overlay" });
    }
  });

  app.get("/api/stream-upgrades/schedule", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "youtube", "Stream Center");
      if (!userId) return;
      res.json([]);
    } catch {
      res.json([]);
    }
  });
}
