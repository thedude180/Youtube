import type { Express } from "express";
import { z } from "zod";
import { eq, and, desc, inArray, isNotNull, gte, sql, lt } from "drizzle-orm";
import { api } from "@shared/routes";
import {
  contentPipeline, contentIdeas, videos, scheduleItems,
  autopilotQueue, communityPosts, uploadQueue, streams,
  reengagementCampaigns, streamPipelines, channels,
  keywordInsights, trafficStrategies, videoUpdateHistory,
  contentInsights, complianceRecords, growthStrategies,
  aiAgentTasks,
} from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, requireTier, parseNumericId, asyncHandler, rateLimitEndpoint, getUserEmail, getUserFirstName, getUserLastName } from "./helpers";
import { cached } from "../lib/cache";
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
  reprocessBackCatalog,
  viralOptimizeVideo,
} from "../backlog-engine";
import * as fs from "fs";
import { packageForAllPlatforms } from "../distribution/cross-platform-packaging";
import { detectGameFromFrames } from "../smart-edit-engine";
import { downloadSourceVideo } from "../clip-video-processor";
import { VIDEO_PLATFORMS, type Platform } from "@shared/schema";

import { createLogger } from "../lib/logger";

const logger = createLogger("content");
async function generatePlatformOptimizations(
  userId: string,
  videoTitle: string,
  videoDescription: string,
  videoTags: string[],
  videoPlatform: string,
  videoType: string,
): Promise<Record<string, any>> {
  const targetPlatforms = VIDEO_PLATFORMS.filter(p => p !== videoPlatform);
  if (targetPlatforms.length === 0) return {};

  try {
    const packaged = await packageForAllPlatforms(
      userId,
      { title: videoTitle, description: videoDescription || "", tags: videoTags || [] },
      targetPlatforms,
    );
    const result: Record<string, any> = {};
    for (const pkg of packaged) {
      result[pkg.platform] = {
        title: pkg.title,
        description: pkg.description,
        tags: pkg.tags,
        format: pkg.format,
        aspectRatio: pkg.aspectRatio,
        contentTypeLabel: pkg.contentTypeLabel,
        maxDurationSeconds: pkg.maxDurationSeconds,
        platformNotes: pkg.platformNotes,
        optimizedAt: new Date().toISOString(),
      };
    }
    return result;
  } catch (err) {
    logger.error("[cross-platform-optimization] Failed:", err);
    return {};
  }
}

function generateEndScreen(videoTitle: string) {
  return {
    enabled: true,
    elements: [
      {
        type: "video" as const,
        position: "bottom-left",
        timing: "last 20 seconds",
        text: "Watch Next",
      },
      {
        type: "playlist" as const,
        position: "bottom-right",
        timing: "last 20 seconds",
        text: `More ${videoTitle.split(/[-–—|]/)[0]?.trim() || "Gaming"}`,
      },
      {
        type: "subscribe" as const,
        position: "top-right",
        timing: "last 15 seconds",
        text: "Subscribe for more no-commentary gameplay",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

function isShortType(type: string): boolean {
  return type === "short" || type === "short_video";
}

export function registerContentRoutes(app: Express) {
  const contentRateLimit = rateLimitEndpoint(10, 60000);
  const writeRateLimit = rateLimitEndpoint(30, 60000);
  const deleteRateLimit = rateLimitEndpoint(10, 60000);
  const bulkRateLimit = rateLimitEndpoint(5, 60000);

  app.post("/api/auto-connect-youtube", writeRateLimit, asyncHandler(async (req, res) => {
    if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    const userId = requireAuth(req, res);
    if (!userId) return;
    const email = getUserEmail(req);
    const firstName = getUserFirstName(req);
    const lastName = getUserLastName(req);

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
      logger.error("Auto-connect YouTube error:", err);
      res.status(500).json({ message: "Failed to auto-connect YouTube" });
    }
  }));

  app.post("/api/content/bulk-seo-optimize", writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "SEO Optimizer");
    if (!userId) return;

    const schema = z.object({
      videoIds: z.array(z.number()),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { videoIds } = parsed.data;

    try {
      const allUserVideos = await storage.getVideosByUser(userId, 1, 200);
      const videoList = allUserVideos.filter(v => videoIds.includes(v.id));

      if (videoList.length === 0) {
        return res.status(404).json({ message: "No valid videos found" });
      }

      const tasks = videoList.map(video => ({
        ownerId: userId,
        agentRole: "ai-seo-manager",
        taskType: "seo_optimize",
        title: `Optimize SEO for: ${video.title}`,
        status: "queued" as const,
        priority: 5,
        payload: {
          videoId: video.id,
          videoTitle: video.title,
          videoDescription: video.description,
          platform: video.platform,
          metadata: video.metadata,
        },
      }));

      await db.insert(aiAgentTasks).values(tasks);

      await storage.createAuditLog({
        userId,
        action: "bulk_seo_optimized_queued",
        target: `${videoList.length} videos`,
        details: { videoIds },
        riskLevel: "low",
      });

      res.json({ success: true, count: videoList.length });
    } catch (err: any) {
      logger.error("Bulk SEO optimization error:", err);
      res.status(500).json({ message: "Failed to queue bulk SEO optimization" });
    }
  }));

  app.post("/api/content/catalog-redetect", writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "SEO Optimizer");
    if (!userId) return;

    try {
      const allVideos = await storage.getVideosByUser(userId, 1, 500);
      if (allVideos.length === 0) {
        return res.json({ success: true, total: 0, message: "No videos found" });
      }

      const [agentTask] = await db.insert(aiAgentTasks).values({
        ownerId: userId,
        agentRole: "ai-editor",
        taskType: "catalog_game_redetect",
        title: `Re-detecting games across ${allVideos.length} videos`,
        status: "in_progress",
        startedAt: new Date(),
        payload: { totalVideos: allVideos.length },
      }).returning();

      res.json({ success: true, total: allVideos.length, taskId: agentTask.id });

      (async () => {
        let processed = 0;
        let updated = 0;
        let errors = 0;

        for (const video of allVideos) {
          try {
            const meta = (video.metadata || {}) as any;
            const youtubeVideoId = meta?.youtubeVideoId || meta?.youtube_id;
            if (!youtubeVideoId) {
              processed++;
              continue;
            }

            let sourcePath: string | null = null;
            try {
              sourcePath = await downloadSourceVideo(youtubeVideoId, userId);
            } catch {
              processed++;
              errors++;
              continue;
            }

            const oldGame = meta?.gameName || "Unknown";
            const newGame = await detectGameFromFrames(
              sourcePath,
              video.title || "",
              video.description || "",
            );

            if (newGame && newGame !== "Unknown") {
              try {
                const { persistGameToDatabase } = await import("../services/web-game-lookup");
                await persistGameToDatabase(newGame, "vision-redetect");
              } catch {}
            }

            if (newGame !== oldGame) {
              await db.update(videos).set({
                metadata: {
                  ...meta,
                  gameName: newGame,
                  gameDetectionMethod: "vision",
                  previousGameName: oldGame,
                  gameRedetectedAt: new Date().toISOString(),
                },
              }).where(eq(videos.id, video.id));
              updated++;
            }

            await db.insert(aiAgentTasks).values({
              ownerId: userId,
              agentRole: "ai-seo-manager",
              taskType: "seo_optimize",
              title: `Re-optimize SEO (${newGame}): ${(video.title || "").slice(0, 60)}`,
              status: "queued",
              priority: 5,
              payload: {
                videoId: video.id,
                videoTitle: video.title,
                videoDescription: video.description,
                platform: video.platform,
                metadata: { ...meta, gameName: newGame },
                redetectedGame: newGame,
              },
            });

            try { if (sourcePath) fs.unlinkSync(sourcePath); } catch { }
            processed++;
          } catch (err: any) {
            logger.error(`Catalog redetect error for video ${video.id}:`, String(err).substring(0, 200));
            errors++;
            processed++;
          }
        }

        await db.update(aiAgentTasks).set({
          status: "completed",
          completedAt: new Date(),
          result: { processed, updated, errors, total: allVideos.length },
        }).where(eq(aiAgentTasks.id, agentTask.id));
      })().catch(err => {
        logger.error("Catalog redetect background job failed:", err);
        db.update(aiAgentTasks).set({
          status: "failed",
          completedAt: new Date(),
          result: { error: String(err).substring(0, 500) },
        }).where(eq(aiAgentTasks.id, agentTask.id)).catch(() => {});
      });

    } catch (err: any) {
      logger.error("Catalog redetect error:", err);
      res.status(500).json({ message: "Failed to start catalog redetection" });
    }
  }));

  app.get("/api/content/game-library", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;

    try {
      const { getAllDiscoveredGames, getDiscoveredGamesCount } = await import("../services/web-game-lookup");
      const [games, count] = await Promise.all([
        getAllDiscoveredGames(),
        getDiscoveredGamesCount(),
      ]);

      res.json({
        total: count,
        games,
      });
    } catch (err: any) {
      logger.error("Failed to fetch game library", { error: err.message });
      res.status(500).json({ message: "Failed to fetch game library" });
    }
  }));

  app.get(api.channels.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Channel Management");
    if (!userId) return;
    const userChannels = await storage.getChannelsByUser(userId);
    const now = new Date();
    const enriched = userChannels.map(ch => {
      const pd = (ch.platformData || {}) as any;
      const tokenExpired = ch.tokenExpiresAt && ch.tokenExpiresAt < now;
      const hasNoToken = !ch.accessToken && !ch.refreshToken;
      const guardianStatus = pd._connectionStatus;
      let connectionStatus: string;
      if (hasNoToken) {
        connectionStatus = "disconnected";
      } else if (tokenExpired) {
        connectionStatus = "expired";
      } else if (guardianStatus === "degraded") {
        connectionStatus = "degraded";
      } else if (guardianStatus === "expired") {
        connectionStatus = "expired";
      } else if (guardianStatus === "disconnected") {
        connectionStatus = "disconnected";
      } else {
        connectionStatus = "healthy";
      }
      return {
        ...ch,
        connectionStatus,
        lastVerifiedAt: pd._lastVerifiedAt || null,
        failureCount: pd._reconnectFailures || 0,
      };
    });
    res.json(enriched);
  }));

  app.post(api.channels.create.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Channel Management");
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
      logger.error("Error creating channel:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.channels.update.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Channel Management");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string as string, res);
    if (id === null) return;
    try {
      const existing = await storage.getChannel(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ error: "Not found" });
      const channelUpdateSchema = z.object({
        channelName: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        avatarUrl: z.string().url().optional().nullable(),
        bannerUrl: z.string().url().optional().nullable(),
        streamKey: z.string().max(500).optional().nullable(),
        metadata: z.record(z.unknown()).optional(),
      });
      const parsed = channelUpdateSchema.parse(req.body);
      const channel = await storage.updateChannel(id, parsed);
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
      logger.error("Error updating channel:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.delete("/api/channels/:id", deleteRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Channel Management");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string as string, res);
    if (id === null) return;
    const channel = await storage.getChannel(id);
    if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await storage.deleteChannel(id);
    await storage.createAuditLog({
      userId,
      action: "channel_deleted",
      target: channel.channelName,
      details: { platform: channel.platform },
      riskLevel: "medium",
    });
    res.json({ success: true });
  }));

  app.get(api.videos.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const paginated = await storage.getVideosByUser(userId, page, limit);
    res.json(paginated);
  }));

  app.post(api.videos.create.path, contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const input = api.videos.create.input.parse(req.body);
      // Force userId to authenticated user to prevent IDOR
      (input as any).userId = userId;
      if (!isShortType(input.type)) {
        const existingMeta = (input as any).metadata || {};
        if (!existingMeta.endScreen) {
          (input as any).metadata = { ...existingMeta, endScreen: generateEndScreen(input.title) };
        }
      }
      const video = await storage.createVideo(input);
      await storage.createAuditLog({
        userId,
        action: "video_created",
        target: video.title,
        details: { type: video.type, status: video.status, endScreenAdded: !isShortType(video.type) },
        riskLevel: "low",
      });
      sendSSEEvent(userId, "content-update", { type: "video" });
      res.status(201).json(video);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      logger.error("Error creating video:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/videos/updated", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const syncLogs = await storage.getAuditLogsByUser(userId, "platform_sync_push");
      res.json(syncLogs);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/videos/update-history", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const youtubeVideoId = req.query.youtubeVideoId as string | undefined;
      let history = await storage.getVideoUpdateHistory(userId, youtubeVideoId);

      if (history.length === 0) {
        try {
          const allUserPipelines = await db.select().from(contentPipeline)
            .where(eq(contentPipeline.userId, userId));

          const videoIds = allUserPipelines
            .map(p => p.videoId)
            .filter((id): id is number => id !== null);

          let candidateVideos: typeof videos.$inferSelect[] = [];
          if (videoIds.length > 0) {
            candidateVideos = await db.select().from(videos)
              .where(and(
                inArray(videos.id, videoIds),
                sql`${videos.metadata}::text LIKE '%aiOptimized%'`,
              ));
          }

          if (candidateVideos.length > 0) {
            const existing = await db.select({ videoId: videoUpdateHistory.videoId })
              .from(videoUpdateHistory).where(eq(videoUpdateHistory.userId, userId));
            const alreadyBackfilled = new Set(existing.map(e => e.videoId));

            const pipelineByVideoId = new Map<number, any>();
            for (const p of allUserPipelines) {
              if (p.videoId && (!pipelineByVideoId.has(p.videoId) || p.id > pipelineByVideoId.get(p.videoId).id)) {
                pipelineByVideoId.set(p.videoId, p);
              }
            }

            const backfillEntries: any[] = [];
            for (const vid of candidateVideos) {
              if (alreadyBackfilled.has(vid.id)) continue;
              const meta = vid.metadata as any;
              if (!meta?.aiOptimized) continue;

              const ytId = meta?.youtubeVideoId || `pending-${vid.id}`;
              const studioUrl = meta?.youtubeVideoId
                ? `https://studio.youtube.com/video/${meta.youtubeVideoId}/edit`
                : null;

              const pipeline = pipelineByVideoId.get(vid.id);
              const stepResults = pipeline?.stepResults as any || {};

              const originalTitle = meta?.originalTitle || pipeline?.videoTitle || vid.title;
              const aiTitle = stepResults?.title?.titles?.[0]?.title || stepResults?.title?.titles?.[0] || vid.title;

              if (originalTitle !== aiTitle) {
                backfillEntries.push({
                  userId, videoId: vid.id, youtubeVideoId: ytId, videoTitle: vid.title,
                  field: "title", oldValue: originalTitle, newValue: aiTitle,
                  source: "ai-pipeline", status: "optimized", youtubeStudioUrl: studioUrl,
                });
              }

              const aiDesc = stepResults?.description?.description || vid.description;
              if (aiDesc) {
                backfillEntries.push({
                  userId, videoId: vid.id, youtubeVideoId: ytId, videoTitle: vid.title,
                  field: "description", oldValue: "(no description before optimization)", newValue: aiDesc,
                  source: "ai-pipeline", status: "optimized", youtubeStudioUrl: studioUrl,
                });
              }

              const aiTags = stepResults?.tags?.tags || meta?.tags;
              if (aiTags && Array.isArray(aiTags)) {
                backfillEntries.push({
                  userId, videoId: vid.id, youtubeVideoId: ytId, videoTitle: vid.title,
                  field: "tags", oldValue: "(no tags before optimization)", newValue: JSON.stringify(aiTags),
                  source: "ai-pipeline", status: "optimized", youtubeStudioUrl: studioUrl,
                });
              }
            }

            if (backfillEntries.length > 0) {
              await db.insert(videoUpdateHistory).values(backfillEntries);
              history = await storage.getVideoUpdateHistory(userId, youtubeVideoId);
            }
          }
        } catch (backfillErr: any) {
          logger.error(`[UpdateHistory] Backfill error:`, backfillErr.message);
        }
      }

      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/videos/processing", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
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
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.videos.get.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const videoId = parseNumericId(req.params.id as string as string, res, "video ID");
    if (videoId === null) return;
    const video = await storage.getVideo(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    // FIX 6 — Video GET IDOR
    if ((video as any).userId && (video as any).userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    if (video.channelId) {
      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(404).json({ error: "Not found" });
    }
    res.json(video);
  }));

  app.put(api.videos.update.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const vidId = parseNumericId(req.params.id as string as string, res, "video ID");
    if (vidId === null) return;
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      platform: z.string().optional(),
      channelId: z.number().optional(),
      scheduledFor: z.string().optional().nullable(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const existingVideo = await storage.getVideo(vidId);
      if (!existingVideo) return res.status(404).json({ message: "Video not found" });

      // Primary ownership guard
      if ((existingVideo as any).userId && (existingVideo as any).userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (existingVideo.channelId) {
        const channel = await storage.getChannel(existingVideo.channelId);
        if (!channel || channel.userId !== userId) return res.status(404).json({ error: "Not found" });
      }
      const resolvedType = parsed.data.type || existingVideo.type;
      if (!isShortType(resolvedType)) {
        const existingMeta = (existingVideo.metadata as any) || {};
        const incomingMeta = parsed.data.metadata || {};
        if (!existingMeta.endScreen && !incomingMeta.endScreen) {
          const title = parsed.data.title || existingVideo.title;
          parsed.data.metadata = { ...incomingMeta, endScreen: generateEndScreen(title) };
        }
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
  }));

  app.delete(api.videos.delete.path, deleteRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const delId = parseNumericId(req.params.id as string as string, res, "video ID");
    if (delId === null) return;
    const video = await storage.getVideo(delId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    // Primary ownership guard
    if ((video as any).userId && (video as any).userId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

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
  }));

  app.post(api.videos.generateMetadata.path, contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Metadata Generation");
    if (!userId) return;
    const videoId = parseNumericId(req.params.id as string as string, res);
    if (videoId === null) return;
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

      const optimizedTags = suggestions.suggestedTags || video.metadata?.tags || [];
      const optimizedDesc = suggestions.descriptionTemplate || video.description || "";

      const platformOptimizations = await generatePlatformOptimizations(
        userId,
        video.title,
        optimizedDesc,
        optimizedTags,
        video.platform || "youtube",
        video.type,
      );

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
        tags: optimizedTags,
        platformOptimizations: {
          ...(video.metadata?.platformOptimizations || {}),
          ...platformOptimizations,
        },
      };

      await storage.updateVideo(videoId, { metadata: newMetadata });
      await storage.createAuditLog({
        userId,
        action: "ai_metadata_generated",
        target: video.title,
        details: { seoScore: suggestions.seoScore, platformsOptimized: Object.keys(platformOptimizations) },
        riskLevel: "low",
      });

      res.json({ success: true, suggestions, platformOptimizations });
    } catch (error: any) {
      logger.error("AI metadata generation error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.jobs.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const jobs = await storage.getJobs();
    res.json(jobs);
  }));

  app.post(api.jobs.create.path, writeRateLimit, asyncHandler(async (req, res) => {
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
      logger.error("Error creating job:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.dashboard.stats.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await storage.getStats(userId);
    res.json(stats);
  }));

  app.get(api.auditLogs.list.path, asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const logs = await storage.getAuditLogs();
    res.json(logs);
  }));

  app.get(api.insights.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Tools");
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    if (channelId !== undefined && isNaN(channelId)) return res.status(400).json({ error: "Invalid channelId" });
    const insights = await storage.getContentInsights(channelId);
    res.json(insights);
  }));

  app.post(api.insights.generate.path, contentRateLimit, asyncHandler(async (req, res) => {
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

      const insightValues = (result.insights || []).map((insight: any) => ({
        channelId: channelId || null,
        insightType: insight.insightType,
        category: insight.category,
        data: {
          finding: insight.finding,
          confidence: insight.confidence,
          recommendation: insight.recommendation,
          evidence: insight.evidence || [],
        },
      }));
      if (insightValues.length > 0) {
        await db.insert(contentInsights).values(insightValues);
      }

      await storage.createAuditLog({
        userId,
        action: "insights_generated",
        target: channelId ? `channel_${channelId}` : "all",
        riskLevel: "low",
      });

      res.json({ success: true, insights: result.insights, weeklyReport: result.weeklyReport });
    } catch (error: any) {
      logger.error("Insights generation error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.compliance.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "free", "Compliance Checks");
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    if (channelId !== undefined && isNaN(channelId)) return res.status(400).json({ error: "Invalid channelId" });
    const records = await storage.getComplianceRecords(channelId);
    res.json(records);
  }));

  app.post(api.compliance.run.path, contentRateLimit, asyncHandler(async (req, res) => {
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

      const checkValues = (result.checks || []).map((check: any) => ({
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
      }));
      if (checkValues.length > 0) {
        await db.insert(complianceRecords).values(checkValues);
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
      logger.error("Compliance check error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.strategies.list.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Strategies");
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    if (channelId !== undefined && isNaN(channelId)) return res.status(400).json({ error: "Invalid channelId" });
    const strategies = await storage.getGrowthStrategies(channelId);
    res.json(strategies);
  }));

  app.post(api.strategies.generate.path, contentRateLimit, asyncHandler(async (req, res) => {
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

      const strategyValues = (result.strategies || []).map((strategy: any) => ({
        channelId: channel.id,
        title: strategy.title,
        description: strategy.description,
        category: strategy.category,
        priority: strategy.priority,
        actionItems: strategy.actionItems || [],
        estimatedImpact: strategy.estimatedImpact,
        status: "pending",
        aiGenerated: true,
      }));
      if (strategyValues.length > 0) {
        await db.insert(growthStrategies).values(strategyValues);
      }

      await storage.createAuditLog({
        userId,
        action: "strategies_generated",
        target: channel.channelName,
        riskLevel: "low",
      });

      res.json({ success: true, strategies: result.strategies });
    } catch (error: any) {
      logger.error("Strategy generation error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.put(api.strategies.updateStatus.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Strategies");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string as string, res);
    if (id === null) return;
    const schema = z.object({
      status: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const strategy = await storage.updateGrowthStrategy(id, { status: parsed.data.status });
    res.json(strategy);
  }));

  app.post(api.advisor.ask.path, contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Tools");
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
      logger.error("Advisor error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.backlog.optimize.path, bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
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

            const optimizedTags = suggestions.suggestedTags || video.metadata?.tags || [];
            const optimizedDesc = suggestions.descriptionTemplate || video.description || "";

            const platformOpts = await generatePlatformOptimizations(
              userId,
              video.title,
              optimizedDesc,
              optimizedTags,
              video.platform || "youtube",
              video.type,
            );

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
              tags: optimizedTags,
              aiOptimized: true,
              aiOptimizedAt: new Date().toISOString(),
              platformOptimizations: {
                ...(video.metadata?.platformOptimizations || {}),
                ...platformOpts,
              },
            };

            await storage.updateVideo(video.id, { metadata: newMetadata });
            completed++;
            const progress = Math.round((completed / unoptimized.length) * 100);
            await storage.updateJobProgress(job.id, progress);
          } catch (err) {
            logger.error(`Failed to optimize video ${video.id}:`, err);
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
      logger.error("Backlog optimization error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.backlog.status.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
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
      logger.error("[Backlog] Status error:", err);
      res.status(500).json({ error: "Failed to get backlog status" });
    }
  }));

  app.post(api.backlog.autoStart.path, bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
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
      logger.error("Auto backlog start error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.backlog.engineStatus.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const status = await getBacklogStatus(userId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.backlog.pause.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const success = await pauseBacklog(userId);
    res.json({ success });
  }));

  app.post(api.backlog.resume.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const success = await resumeBacklog(userId);
    res.json({ success });
  }));

  app.get(api.backlog.videoScores.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const scores = await getVideosWithScores(userId);
    res.json(scores);
  }));

  app.post(api.backlog.bulkOptimize.path, bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
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
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.post(api.backlog.autoSchedule.path, bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const scheduled = await autoScheduleOptimizedContent(userId);
      res.json({ success: true, scheduled });
    } catch (error: any) {
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get(api.backlog.staleVideos.path, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const stale = await getStaleVideos(userId);
    res.json(stale);
  }));

  app.post(api.backlog.viralReprocess.path, bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const result = await reprocessBackCatalog(userId);
      if (!result.alreadyRunning) {
        await storage.createAuditLog({
          userId,
          action: "viral_back_catalog_started",
          target: `${result.totalVideos} videos queued for viral optimization`,
          details: { jobId: result.jobId },
          riskLevel: "low",
        });
      }
      res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error("Viral reprocess error:", error);
      res.status(500).json({ success: false, message: "Failed to start viral reprocess" });
    }
  }));

  app.post(api.backlog.viralOptimizeSingle.path, writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const schema = z.object({ videoId: z.number() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const result = await viralOptimizeVideo(userId, parsed.data.videoId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error("Viral optimize error:", error);
      res.status(500).json({ success: false, message: "Failed to viral-optimize video" });
    }
  }));

  app.post(api.thumbnails.generate.path, contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Thumbnail Concepts");
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
      logger.error("Thumbnail generation error:", error);
      res.status(500).json({ success: false, message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/content-ideas", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Calendar");
    if (!userId) return;
    const status = req.query.status as string | undefined;
    const ideas = await storage.getContentIdeas(userId, status);
    res.json(ideas);
  }));

  app.post("/api/content-ideas", contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Calendar");
    if (!userId) return;
    const schema = z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      category: z.string().max(200).optional(),
      status: z.string().max(50).optional(),
      platform: z.string().max(50).optional(),
      tags: z.array(z.string().max(100)).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const idea = await storage.createContentIdea({ ...parsed.data, userId } as any);
      res.status(201).json(idea);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.put("/api/content-ideas/:id", writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Calendar");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string as string, res);
    if (id === null) return;
    const schema = z.object({
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(5000).optional(),
      category: z.string().max(200).optional(),
      status: z.string().max(50).optional(),
      platform: z.string().max(50).optional(),
      tags: z.array(z.string().max(100)).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const [existing] = await db.select().from(contentIdeas).where(and(eq(contentIdeas.id, id), eq(contentIdeas.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const idea = await storage.updateContentIdea(id, parsed.data as any);
    res.json(idea);
  }));

  app.delete("/api/content-ideas/:id", deleteRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Content Calendar");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(contentIdeas).where(and(eq(contentIdeas.id, id), eq(contentIdeas.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await storage.deleteContentIdea(id);
    res.sendStatus(204);
  }));

  app.get("/api/video-versions/:videoId", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string as string, res, "video ID");
    if (videoId === null) return;
    const versions = await storage.getVideoVersions(videoId);
    res.json(versions);
  }));

  app.get("/api/content-clips", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const sourceVideoId = req.query.sourceVideoId ? Number(req.query.sourceVideoId) : undefined;
    if (sourceVideoId !== undefined && isNaN(sourceVideoId)) return res.status(400).json({ error: "Invalid sourceVideoId" });
    const clips = await storage.getContentClips(userId, sourceVideoId);
    res.json(clips);
  }));

  app.post("/api/content-clips", contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const schema = z.object({
      sourceVideoId: z.number().optional(),
      title: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      platform: z.string().max(50).optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      status: z.string().max(50).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const clip = await storage.createContentClip({ ...parsed.data, userId });
      res.status(201).json(clip);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/collaboration-leads", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Collaboration Manager");
    if (!userId) return;
    const leads = await storage.getCollaborationLeads(userId);
    res.json(leads);
  }));

  app.post("/api/collaboration-leads", writeRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Collaboration Manager");
    if (!userId) return;
    const schema = z.object({
      name: z.string().min(1).max(500),
      platform: z.string().max(50).optional(),
      channelUrl: z.string().max(2000).optional(),
      email: z.string().max(500).optional(),
      status: z.string().max(50).optional(),
      notes: z.string().max(5000).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const lead = await storage.createCollaborationLead({ ...parsed.data, userId } as any);
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/compliance-rules", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "free", "Compliance Checks");
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const rules = await storage.getComplianceRules(platform);
    res.json(rules);
  }));

  app.get("/api/localization/recommendations", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Content Localization");
    if (!userId) return;
    try {
      const rec = await storage.getLocalizationRecommendations(userId);
      res.json(rec || { recommendedLanguages: [], trafficData: {}, source: "none" });
    } catch (e: any) { logger.error("Localization recommendations error:", e); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  }));

  app.get("/api/calendar/uploads", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Content Calendar");
    if (!userId) return;
    try {
      const cleaned = await cached(`calendar-uploads:${userId}`, 10, async () => {
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

      const VIDEO_CONTENT_TYPES = new Set(["video", "short", "stream", "auto-clip", "clip"]);
      const TEXT_CONTENT_TYPES = new Set(["post", "cross-post", "campaign", "community"]);
      const VIDEO_PLATFORMS = new Set(["youtube", "tiktok"]);
      const TEXT_ONLY_PLATFORMS = new Set(["discord"]);

      function resolveContentCategory(contentType: string, platform: string, metadata?: any): "video" | "text" {
        if (metadata?.contentCategory) return metadata.contentCategory;
        if (TEXT_ONLY_PLATFORMS.has(platform)) return "text";
        if (VIDEO_CONTENT_TYPES.has(contentType)) return "video";
        if (TEXT_CONTENT_TYPES.has(contentType)) return "text";
        if (VIDEO_PLATFORMS.has(platform)) return "video";
        return "text";
      }

      for (const vid of userVideos) {
        const date = vid.scheduledTime || vid.publishedAt;
        if (!date) continue;
        seenVideoIds.add(vid.id);
        const ct = vid.type || "video";
        const plat = vid.platform || "youtube";
        entries.push({
          id: `vid-${vid.id}`,
          title: vid.title,
          date,
          platform: plat,
          contentType: ct,
          contentCategory: resolveContentCategory(ct, plat),
          status: (vid.status === "published" || vid.status === "public") ? "uploaded" : "scheduled",
          gameName: (vid.metadata as any)?.gameName || null,
        });
      }

      for (const item of schedItems) {
        if (!item.scheduledAt) continue;
        if (item.videoId && seenVideoIds.has(item.videoId)) continue;
        const ct = item.type || "video";
        const plat = item.platform || "youtube";
        const meta = item.metadata as any;
        entries.push({
          id: `sched-${item.id}`,
          title: item.title,
          date: item.scheduledAt,
          platform: plat,
          contentType: ct,
          contentCategory: resolveContentCategory(ct, plat, meta),
          status: item.status === "completed" ? "uploaded" : "scheduled",
          canDelete: true,
          rawId: item.id,
          gameName: meta?.gameName || null,
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
          contentCategory: "video" as const,
          status: p.status === "completed" ? "uploaded" : "scheduled",
        });
      }

      for (const p of livePipes) {
        const date = p.scheduledStartAt || p.startedAt;
        if (!date) continue;
        const ct = p.pipelineType === "live" ? "stream" : "video";
        entries.push({
          id: `live-${p.id}`,
          title: p.sourceTitle,
          date,
          platform: "youtube",
          contentType: ct,
          contentCategory: "video" as const,
          status: p.status === "completed" ? "uploaded" : "scheduled",
        });
      }

      for (const item of autopilotItems) {
        const date = item.scheduledAt;
        if (!date) continue;
        const ct = item.type || "post";
        const plat = item.targetPlatform || "youtube";
        const meta = item.metadata as any;
        entries.push({
          id: `ap-${item.id}`,
          title: item.caption || item.content?.slice(0, 60) || "Autopilot Post",
          date,
          platform: plat,
          contentType: ct,
          contentCategory: resolveContentCategory(ct, plat, meta),
          status: item.status === "published" ? "uploaded" : "scheduled",
        });
      }

      for (const post of communityItems) {
        if (!post.scheduledAt) continue;
        const plat = post.platform || "youtube";
        entries.push({
          id: `cp-${post.id}`,
          title: post.content?.slice(0, 60) || "Community Post",
          date: post.scheduledAt,
          platform: plat,
          contentType: "post",
          contentCategory: "text" as const,
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
          contentCategory: "video" as const,
          status: uq.status === "uploaded" ? "uploaded" : "scheduled",
        });
      }

      for (const s of streamItems) {
        const date = s.startedAt || s.createdAt;
        if (!date) continue;
        if (s.status === "planned" && !s.startedAt) continue;
        const plat = (s.platforms as string[])?.[0] || "youtube";
        entries.push({
          id: `stream-${s.id}`,
          title: s.title,
          date,
          platform: plat,
          contentType: "stream",
          contentCategory: "video" as const,
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
          contentCategory: "text" as const,
          status: c.status === "executed" ? "uploaded" : "scheduled",
        });
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const filtered = entries.filter((e) => {
        const entryDate = new Date(e.date);
        if (e.status === "uploaded") return false;
        if (entryDate < todayStart) return false;
        return true;
      });

      filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return filtered;
      });
      res.json(cleaned);
    } catch (err: any) {
      logger.error("[Calendar Uploads] Error:", err);
      res.status(500).json({ error: "Failed to load upload calendar" });
    }
  }));

  app.get("/api/calendar/horizon", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "starter", "Content Calendar");
    if (!userId) return;
    const now = new Date();
    const items = await db.select({
      id: autopilotQueue.id,
      targetPlatform: autopilotQueue.targetPlatform,
      type: autopilotQueue.type,
      caption: autopilotQueue.caption,
      content: autopilotQueue.content,
      status: autopilotQueue.status,
      scheduledAt: autopilotQueue.scheduledAt,
    })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      isNotNull(autopilotQueue.scheduledAt),
      gte(autopilotQueue.scheduledAt, now),
    ))
    .orderBy(desc(autopilotQueue.scheduledAt));

    if (items.length === 0) {
      return res.json({ totalItems: 0, furthestDate: null, daysAhead: 0, byPlatform: {}, pendingApproval: [] });
    }

    const furthestDate = items[0].scheduledAt!;
    const daysAhead = Math.ceil((furthestDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const byPlatform: Record<string, number> = {};
    for (const item of items) {
      const plat = item.targetPlatform || "other";
      byPlatform[plat] = (byPlatform[plat] || 0) + 1;
    }
    const pendingApproval = items
      .filter(item => item.status === "pending")
      .slice(0, 20)
      .map(item => ({
        id: item.id,
        platform: item.targetPlatform,
        type: item.type,
        title: item.caption || (item.content ? item.content.slice(0, 80) : null) || "AI-Generated Post",
        scheduledAt: item.scheduledAt,
      }));
    res.json({ totalItems: items.length, furthestDate, daysAhead, byPlatform, pendingApproval });
  }));

  app.patch("/api/calendar/approve/:id", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "starter", "Content Calendar");
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const { action } = req.body;
    const newStatus = action === "approve" ? "scheduled" : "cancelled";
    await db.update(autopilotQueue)
      .set({ status: newStatus })
      .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
    res.json({ success: true, status: newStatus });
  }));

  app.get("/api/keywords/insights", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Keyword Research");
    if (!userId) return;
    try {
      const keywords = await db.select().from(keywordInsights)
        .where(eq(keywordInsights.userId, userId))
        .orderBy(desc(keywordInsights.score))
        .limit(50);
      res.json(keywords);
    } catch (err: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/keywords/analyze", contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "AI Keyword Research");
    if (!userId) return;
    try {
      const { analyzeChannelKeywords } = await import("../services/keyword-learning-engine");
      const result = await analyzeChannelKeywords(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("[Keywords] Analyze error:", err);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.get("/api/traffic/strategies", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Strategies");
    if (!userId) return;
    try {
      const strategies = await db.select().from(trafficStrategies)
        .where(eq(trafficStrategies.userId, userId))
        .orderBy(desc(trafficStrategies.priority))
        .limit(30);
      res.json(strategies);
    } catch (err: any) {
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/traffic/generate", contentRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Growth Strategies");
    if (!userId) return;
    try {
      const { generateTrafficStrategies } = await import("../services/traffic-growth-engine");
      const result = await generateTrafficStrategies(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("[Traffic] Generate error:", err);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  }));

  app.post("/api/calendar/schedule-pipelines", bulkRateLimit, asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "starter", "Content Calendar");
    if (!userId) return;
    try {
      const { startDate } = req.body;
      const scheduleStart = startDate ? new Date(startDate) : new Date();
      scheduleStart.setHours(0, 0, 0, 0);

      const pipelines = await db.select().from(streamPipelines)
        .where(and(
          eq(streamPipelines.userId, userId),
          eq(streamPipelines.pipelineType, "vod"),
        ))
        .orderBy(streamPipelines.id)
        .limit(500);

      if (pipelines.length === 0) {
        return res.json({ success: true, message: "No pipelines found to schedule", scheduled: 0 });
      }

      const [firstChannel] = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId)).limit(1);
      if (!firstChannel) {
        return res.json({ success: true, scheduled: 0, message: "No channels found" });
      }

      const existingVideos = await db.select({ id: videos.id, title: videos.title })
        .from(videos)
        .where(sql`${videos.title} IN (${sql.join(pipelines.map(p => sql`${p.sourceTitle}`), sql`, `)})`);
      const existingTitles = new Set(existingVideos.map(v => v.title));

      const platforms = ["youtube", "tiktok", "discord"];
      const peakHours = [9, 11, 13, 15, 17, 19];
      const created: any[] = [];
      let slotIndex = 0;

      for (const pipeline of pipelines) {
        if (existingTitles.has(pipeline.sourceTitle)) continue;

        const stepResults = pipeline.stepResults as any || {};
        const descData = stepResults.description || {};
        const tagsData = stepResults.tags || {};

        const videoDescription = typeof descData === 'string' ? descData :
          descData.description || pipeline.sourceTitle;
        const videoTags = Array.isArray(tagsData) ? tagsData :
          (tagsData.tags || tagsData.hashtags || []);

        const dayOffset = Math.floor(slotIndex / 3);
        const hourSlot = peakHours[slotIndex % peakHours.length];
        const videoSchedDate = new Date(scheduleStart);
        videoSchedDate.setDate(videoSchedDate.getDate() + dayOffset);
        videoSchedDate.setHours(hourSlot, Math.floor(Math.random() * 30), 0, 0);

        const cleanTags = Array.isArray(videoTags) ? videoTags.slice(0, 15).map(String) : [];
        const crossPlatform = platforms.filter(p => p !== "youtube").slice(0, 3);

        const { videoRecord, crossPosts } = await db.transaction(async (tx) => {
          const [videoRecord] = await tx.insert(videos).values({
            channelId: firstChannel.id,
            title: pipeline.sourceTitle,
            description: typeof videoDescription === 'string' ? videoDescription.substring(0, 5000) : pipeline.sourceTitle,
            type: "vod",
            status: "scheduled",
            platform: "youtube",
            metadata: {
              tags: cleanTags,
              seoScore: descData.seoScore || 85,
              aiOptimized: true,
              aiOptimizedAt: new Date().toISOString(),
            },
            scheduledTime: videoSchedDate,
          }).returning();

          await tx.insert(scheduleItems).values({
            userId,
            title: pipeline.sourceTitle,
            type: "vod",
            platform: "youtube",
            scheduledAt: videoSchedDate,
            status: "scheduled",
            videoId: videoRecord.id,
            metadata: {
              description: typeof videoDescription === 'string' ? videoDescription.substring(0, 2000) : undefined,
              tags: cleanTags,
              autoPublish: true,
              aiOptimized: true,
            },
          });

          for (let cpIdx = 0; cpIdx < crossPlatform.length; cpIdx++) {
            const cpDate = new Date(videoSchedDate);
            cpDate.setMinutes(cpDate.getMinutes() + (cpIdx + 1) * 45);
            await tx.insert(scheduleItems).values({
              userId,
              title: `${pipeline.sourceTitle} — ${crossPlatform[cpIdx]} clip`,
              type: "clip",
              platform: crossPlatform[cpIdx],
              scheduledAt: cpDate,
              status: "scheduled",
              videoId: videoRecord.id,
              metadata: {
                autoPublish: true,
                aiOptimized: true,
                crossPost: [crossPlatform[cpIdx]],
              },
            });
          }

          return { videoRecord, crossPosts: crossPlatform.length };
        });

        created.push({
          pipelineId: pipeline.id,
          videoId: videoRecord.id,
          title: pipeline.sourceTitle,
          scheduledAt: videoSchedDate.toISOString(),
          crossPosts,
        });

        slotIndex++;
      }

      await storage.createNotification({
        userId,
        type: "info",
        title: "Content Scheduled",
        message: `${created.length} videos scheduled starting ${scheduleStart.toLocaleDateString()}. ${created.reduce((sum, c) => sum + c.crossPosts, 0)} cross-platform posts queued.`,
      });

      res.json({
        success: true,
        scheduled: created.length,
        items: created,
        startDate: scheduleStart.toISOString(),
      });
    } catch (err: any) {
      logger.error("[Calendar] Schedule pipelines error:", err);
      res.status(500).json({ success: false, message: "Failed to schedule pipeline content." });
    }
  }));

  app.get("/api/content/export/videos", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const allVideos = await storage.getVideosByUser(userId);
    const csvHeader = "id,title,platform,channelId,type,status,createdAt\n";
    const csvRows = allVideos.map(v =>
      `${v.id},"${(v.title || "").replace(/"/g, '""')}","${v.platform || ""}","${v.channelId || ""}","${v.type || ""}","${v.status || ""}","${v.createdAt || ""}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=content-videos.csv");
    res.send(csvHeader + csvRows);
  }));

  app.get("/api/content/export/analytics", asyncHandler(async (req, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    const allVideos = await storage.getVideosByUser(userId);
    const platformBreakdown: Record<string, { count: number }> = {};
    allVideos.forEach(v => {
      const p = v.platform || "unknown";
      if (!platformBreakdown[p]) platformBreakdown[p] = { count: 0 };
      platformBreakdown[p].count++;
    });
    res.json({
      totalVideos: allVideos.length,
      platformBreakdown,
      exportedAt: new Date().toISOString(),
    });
  }));

  app.post("/api/content/bulk-update", bulkRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const bulkSchema = z.object({ videoIds: z.array(z.number()).min(1).max(50), updates: z.object({ tags: z.array(z.string()).optional(), addTags: z.array(z.string()).optional(), status: z.string().optional() }).optional().default({}) });
      const parsed = bulkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      const { videoIds, updates } = parsed.data;
      
      let updated = 0;
      for (const videoId of videoIds) {
        const video = await storage.getVideo(videoId);
        if (!video || (video as any).userId !== userId) continue;
        
        const updateData: any = {};
        if (updates.tags) updateData.metadata = { ...(video.metadata || {}), tags: updates.tags };
        if (updates.status) updateData.status = updates.status;
        if (updates.addTags && Array.isArray(updates.addTags)) {
          const existing = ((video.metadata as any)?.tags || []) as string[];
          updateData.metadata = { ...(video.metadata || {}), tags: [...new Set([...existing, ...updates.addTags])] };
        }
        
        if (Object.keys(updateData).length > 0) {
          await db.update(videos).set(updateData).where(eq(videos.id, videoId));
          updated++;
        }
      }
      
      await storage.createAuditLog({ userId, action: "bulk_content_update", target: `${updated} videos`, details: { videoIds, updates }, riskLevel: "medium" });
      res.json({ success: true, updated, total: videoIds.length });
    } catch (e: any) {
      res.status(500).json({ error: "Bulk update failed" });
    }
  }));

  app.post("/api/content/bulk-optimize", bulkRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "SEO Optimizer");
    if (!userId) return;
    try {
      const { videoIds } = req.body;
      if (!Array.isArray(videoIds) || videoIds.length === 0) return res.status(400).json({ error: "No videos selected" });
      if (videoIds.length > 20) return res.status(400).json({ error: "Maximum 20 videos per bulk optimization" });
      
      const results: any[] = [];
      for (const videoId of videoIds) {
        const video = await storage.getVideo(videoId);
        if (!video || (video as any).userId !== userId) continue;
        results.push({ videoId, title: video.title, status: "queued" });
      }
      
      res.json({ success: true, queued: results.length, results });
    } catch (e: any) {
      res.status(500).json({ error: "Bulk optimization failed" });
    }
  }));

  app.post("/api/content/optimize-shorts-crossplatform", bulkRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const allVideos: any[] = [];
      let page = 1;
      while (true) {
        const batch = await storage.getVideosByUser(userId, page, 100);
        if (batch.length === 0) break;
        allVideos.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      const shorts = allVideos.filter(v =>
        v.type === "short" || v.type === "short_video"
      );

      if (shorts.length === 0) {
        return res.json({ success: true, message: "No shorts found to optimize", optimized: 0, platforms: [] });
      }

      const { optimizeShortsForAllPlatforms } = await import("../youtube");
      const result = await optimizeShortsForAllPlatforms(userId, shorts);

      await storage.createAuditLog({
        userId,
        action: "shorts_crossplatform_optimized",
        target: `${result.optimized} shorts`,
        details: { totalShorts: shorts.length, optimized: result.optimized, platforms: result.platforms },
        riskLevel: "low",
      });

      res.json({
        success: true,
        totalShorts: shorts.length,
        optimized: result.optimized,
        platforms: result.platforms,
      });
    } catch (e: any) {
      logger.error("Shorts cross-platform optimization error:", e);
      res.status(500).json({ error: "Failed to optimize shorts for other platforms" });
    }
  }));

  app.post("/api/content/create-approval", writeRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const { contentType, contentId, title, generatedContent } = req.body;
      const { contentApprovals } = await import("@shared/schema");
      await db.insert(contentApprovals).values({ userId, contentType, contentId, title, generatedContent, status: "pending" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to create approval" });
    }
  }));

  app.post("/api/ab-tests/create", writeRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const { videoId, variantA, variantB, testType } = req.body;
      if (!variantA || !variantB) return res.status(400).json({ error: "Both variants required" });
      const { abTestResults } = await import("@shared/schema");
      await db.insert(abTestResults).values({ userId, videoId, variantA, variantB, testType: testType || "title", status: "active" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to create A/B test" });
    }
  }));

  app.post("/api/ab-tests/:id/resolve", writeRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const { winnerVariant, variantAMetrics, variantBMetrics } = req.body;
      const { abTestResults } = await import("@shared/schema");
      await db.update(abTestResults).set({ winnerVariant, variantAMetrics, variantBMetrics, status: "resolved", resolvedAt: new Date() }).where(and(eq(abTestResults.id, parseInt(req.params.id as string)), eq(abTestResults.userId, userId)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to resolve A/B test" });
    }
  }));

  app.post("/api/content/from-url", writeRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Pipeline Execution");
    if (!userId) return;
    try {
      const urlSchema = z.object({
        url: z.string().min(1).max(500),
        autoSchedule: z.boolean().optional().default(true),
      });
      const parsed = urlSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { parseYouTubeVideoId, ingestVideoFromYouTubeUrl } = await import("../shorts-pipeline-engine");
      const ytId = parseYouTubeVideoId(parsed.data.url);
      if (!ytId) {
        return res.status(400).json({
          error: "Invalid YouTube URL. Paste a YouTube share link like youtu.be/xxx or youtube.com/watch?v=xxx",
        });
      }

      const { video, alreadyExisted } = await ingestVideoFromYouTubeUrl(userId, ytId);
      const meta = video.metadata as any;
      const durationRaw = meta?.duration || "";
      let durationSec = 0;
      if (typeof durationRaw === "number") {
        durationSec = durationRaw;
      } else if (typeof durationRaw === "string" && durationRaw.startsWith("PT")) {
        const hMatch = durationRaw.match(/(\d+)H/);
        const mMatch = durationRaw.match(/(\d+)M/);
        const sMatch = durationRaw.match(/(\d+)S/);
        durationSec = (parseInt(hMatch?.[1] || "0") * 3600)
          + (parseInt(mMatch?.[1] || "0") * 60)
          + parseInt(sMatch?.[1] || "0");
      }

      if (durationSec > 0 && durationSec < 900) {
        return res.status(400).json({
          error: `This video is ${Math.round(durationSec / 60)} minutes long. The long-form pipeline requires videos over 15 minutes. Use the Shorts pipeline instead for shorter content.`,
          videoId: video.id,
          duration: durationSec,
        });
      }

      if (durationSec > 0 && !meta?.durationSec) {
        await db.update(videos)
          .set({ metadata: { ...meta, durationSec, duration: durationSec } })
          .where(eq(videos.id, video.id));
      }

      const existingSmartEdits = await db.select({ id: autopilotQueue.id, status: autopilotQueue.status })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.type, "smart-edit"),
          eq(autopilotQueue.sourceVideoId, video.id),
        ))
        .orderBy(desc(autopilotQueue.id))
        .limit(1);

      const activeJob = existingSmartEdits.find(j => j.status === "pending" || j.status === "processing" || j.status === "done");
      if (activeJob) {
        return res.json({
          success: true,
          alreadyExisted: true,
          message: `"${video.title}" is already ${activeJob.status === "done" ? "processed" : "queued for processing"}.`,
          video: { id: video.id, title: video.title, youtubeId: ytId, thumbnailUrl: video.thumbnailUrl },
          smartEditJobId: activeJob.id,
          smartEditStatus: activeJob.status,
          durationSec,
        });
      }

      const { queueVideoForSmartEdit, processSmartEditQueue } = await import("../smart-edit-engine");
      const jobId = await queueVideoForSmartEdit(userId, video.id);

      if (jobId) {
        const correlationId = (req as any).correlationId;
        processSmartEditQueue(userId, correlationId).catch(() => undefined);
      }

      const { vodSEOOptimizer } = await import("../services/vod-seo-optimizer");
      vodSEOOptimizer.optimize(userId, video.id).catch(() => undefined);

      const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
      generateThumbnailForNewVideo(userId, video.id).catch(() => undefined);

      let scheduledAt: Date | null = null;
      if (parsed.data.autoSchedule) {
        try {
          const { getAudienceDrivenTime, addHumanMicroDelay } = await import("../human-behavior-engine");
          scheduledAt = await getAudienceDrivenTime({
            platform: "youtube",
            userId,
            contentType: "new-video",
            urgency: "low",
          });
          const dayOffset = 1 + Math.floor(Math.random() * 2);
          scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
          const microDelay = addHumanMicroDelay();
          const jitter = Math.floor(Math.random() * 2 * 60 * 60 * 1000);
          scheduledAt = new Date(scheduledAt.getTime() + microDelay + jitter);
        } catch {
          scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 1);
          scheduledAt.setHours(12 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
        }

        await db.insert(autopilotQueue).values({
          userId,
          type: "vod-schedule",
          targetPlatform: "youtube",
          content: `Scheduled VOD upload: ${video.title}`,
          status: "scheduled",
          sourceVideoId: video.id,
          scheduledAt,
          metadata: {
            youtubeId: ytId,
            schedulingMethod: "from-url-pipeline",
            style: "human",
            humanScore: 0.95,
          },
        }).catch(() => undefined);
      }

      res.json({
        success: true,
        alreadyExisted: false,
        message: `"${video.title}" ingested and queued for AI smart editing, SEO optimization, and thumbnail generation.${scheduledAt ? ` Scheduled for ${scheduledAt.toLocaleDateString()}.` : ""}`,
        video: { id: video.id, title: video.title, youtubeId: ytId, thumbnailUrl: video.thumbnailUrl },
        smartEditJobId: jobId,
        durationSec,
        scheduledAt: scheduledAt?.toISOString() || null,
        pipeline: {
          smartEdit: jobId ? "queued" : (durationSec === 0 ? "pending-duration" : "skipped"),
          seoOptimization: "running",
          thumbnailGeneration: "running",
          scheduling: scheduledAt ? "scheduled" : "manual",
        },
      });
    } catch (e: any) {
      logger.error("[content/from-url] Error:", e.message);
      res.status(500).json({ error: "Failed to process video URL" });
    }
  }));

  app.post("/api/content/videos/:id/smart-edit", writeRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Pipeline Execution");
    if (!userId) return;
    try {
      const videoId = parseNumericId(req.params.id as string, res);
      if (!videoId) return res.status(400).json({ error: "Invalid video ID" });

      const video = await storage.getVideo(videoId);
      if (!video || (video as any).userId !== userId) return res.status(404).json({ error: "Video not found" });

      const meta = video.metadata as any;
      const duration = meta?.duration || (video as any).duration || 0;
      if (duration < 900) return res.status(400).json({ error: "Video must be longer than 15 minutes" });

      const { queueVideoForSmartEdit, processSmartEditQueue } = await import("../smart-edit-engine");
      const jobId = await queueVideoForSmartEdit(userId, videoId);
      if (!jobId) return res.status(409).json({ error: "Already queued or video too short" });

      const correlationId = (req as any).correlationId;
      processSmartEditQueue(userId, correlationId).catch(() => undefined);

      res.json({ queued: true, jobId, correlationId });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to queue smart edit" });
    }
  }));

  app.get("/api/content/smart-edit/jobs", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "youtube", "Content Library");
    if (!userId) return;
    try {
      const { getSmartEditJobs } = await import("../smart-edit-engine");
      const jobs = await getSmartEditJobs(userId, 30);
      res.json(jobs);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to fetch smart edit jobs" });
    }
  }));

  app.post("/api/content/smart-edit/batch", bulkRateLimit, asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Pipeline Execution");
    if (!userId) return;
    try {
      const { initSmartEditForAllLongVideos } = await import("../smart-edit-engine");
      const result = await initSmartEditForAllLongVideos(userId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to batch queue smart edits" });
    }
  }));

  app.get("/api/seo/scores/me", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "pro", "SEO Optimizer");
      if (!userId) return;
      const videos = await storage.getVideosByUser(userId);
      const scores = videos.slice(0, 20).map((v: any) => ({
        id: v.id,
        title: v.title || "Untitled",
        overallScore: v.seoScore ?? 0,
        titleScore: v.titleScore ?? 0,
        descriptionScore: v.descriptionScore ?? 0,
        tagScore: v.tagScore ?? 0,
        thumbnailScore: v.thumbnailScore ?? 0,
      }));
      res.json(scores);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/seo/rankings/me", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "pro", "SEO Optimizer");
      if (!userId) return;
      res.json([]);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/seo/rankings", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "pro", "SEO Optimizer");
      if (!userId) return;
      const { keyword } = req.body || {};
      if (!keyword) return res.status(400).json({ error: "Keyword required" });
      res.json({ keyword, position: null, tracked: true });
    } catch {
      res.status(500).json({ error: "Failed to track keyword" });
    }
  });

  app.get("/api/seo/opportunities/me", async (req: any, res) => {
    try {
      const userId = await requireTier(req, res, "pro", "SEO Optimizer");
      if (!userId) return;
      res.json([]);
    } catch {
      res.json([]);
    }
  });
}
