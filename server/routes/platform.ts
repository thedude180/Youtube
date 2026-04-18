import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { linkedChannels, streamDestinations, subscriptions, channels, videos } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { PLATFORM_INFO } from "@shared/schema";
import { requireAuth, getUserId, parseNumericId } from "./helpers";
import { cached } from "../lib/cache";
import { sendSSEEvent } from "./events";
import { trackQuotaUsage, getQuotaStatus } from "../services/youtube-quota-tracker";
import { smartPushOrQueue, getBacklogStats, processBacklog, retryFailedItems } from "../services/youtube-push-backlog";
import {
  startShortsPipeline, getShortsPipelineStatus, pauseShortsPipeline,
  resumeShortsPipeline, extractClipsFromVideo, generateClipHook,
  predictClipVirality, getClipsByVideo, compileAutoReel, trackClipPerformance,
} from "../shorts-pipeline-engine";
import {
  getOptimizationHealthScore, getSubEngineStatuses, runMetadataOptimizer,
  runAbTestEngine, injectTrendingTopic, getDecayAlerts, predictViralScore,
  analyzeHashtagHealth, analyzeSentiment, detectAlgorithmChanges,
  manageContentLifecycle, detectEvergreenContent, detectContentCannibalization,
  predictTrends, buildContentDna, optimizeCtr, getTrendingTopics,
  getViralLeaderboard, getContentGaps, getAlgorithmCheatSheet, runFullOptimizationPass,
} from "../optimization-engine";
import {
  createManagedPlaylist, getPlaylists, autoOrganizePlaylists, addToPlaylist,
  getPlaylistSeoScore, generatePinnedComment, buildDescriptionLinks,
  generateMultiLanguageMetadata, batchPushOptimizations,
} from "../youtube-manager";
import {
  repurposeVideo, getRepurposedContent, createScriptTemplate,
  getScriptTemplates, suggestBRoll, getRepurposeFormats,
} from "../repurpose-engine";
import {
  getOptimalPostingTimes, updateActivityPatterns, getUploadCadence,
  autoScheduleContent, getScheduleRecommendations,
} from "../smart-scheduler";
import { generateCommunityPost } from "../ai-engine";
import { z } from "zod";
import { api } from "@shared/routes";
import {
  getAuthUrl, handleCallback, getPendingOAuthUser,
  fetchYouTubeChannelInfo, fetchYouTubeVideos,
  updateYouTubeVideo, syncYouTubeVideosToLibrary,
  syncYouTubeVideosFromPublicFeed,
} from "../youtube";
import { createLogger } from "../lib/logger";
import {
  fetchViewsByDayAndHour,
  fetchMilestoneData,
  fetchGrowthForecast,
  fetchEngagementScore,
  fetchGeoDistribution,
  fetchTopFans,
} from "../services/youtube-analytics";


const logger = createLogger("platform");
export async function registerPlatformRoutes(app: Express) {
  app.get(api.community.list.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.query.platform as string | undefined;
    const posts = await storage.getCommunityPosts(userId, platform);
    res.json(posts);
  });

  app.post(api.community.create.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      content: z.string().min(1),
      platform: z.string().optional(),
      type: z.string().optional(),
      aiGenerate: z.boolean().optional(),
      scheduledFor: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = { ...parsed.data, userId };
      if (parsed.data.aiGenerate) {
        const channels = await storage.getChannelsByUser(userId);
        const videos = await storage.getVideosByUser(userId);
        const generated = await generateCommunityPost({
          platform: input.platform || "youtube",
          channelName: channels[0]?.channelName || "My Channel",
          recentTitles: videos.slice(0, 5).map(v => v.title),
          type: input.type || 'engagement',
        });
        input.content = generated.content;
        (input as any).aiGenerated = true;
      }
      const post = await storage.createCommunityPost(input as any);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      logger.error("Error creating community post:", err);
      return res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.put(api.community.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const { content, platform, type, status, publishedAt, aiGenerated, scheduledAt, engagement } = req.body || {};
    const post = await storage.updateCommunityPost(id, { content, platform, type, status, publishedAt, aiGenerated, scheduledAt, engagement }, userId);
    if (!post) return res.status(403).json({ error: "Not authorized to update this post" });
    res.json(post);
  });

  app.get("/api/youtube/auth", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const url = getAuthUrl(userId);
      const acceptHeader = req.headers.accept || "";
      if (acceptHeader.includes("application/json")) {
        res.json({ url });
      } else {
        res.redirect(url);
      }
    } catch (error: any) {
      logger.error("[YouTube Auth] Error generating auth URL:", error);
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/youtube/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    const sessionUserId = (req.session as any)?.youtubeOAuthUserId
      || (req.isAuthenticated() ? getUserId(req) : null);

    let userId: string | null = null;
    if (state) {
      userId = getPendingOAuthUser(state);
    }
    if (!userId) {
      userId = sessionUserId;
    }

    if (!code) {
      return res.redirect("/?yt_error=" + encodeURIComponent("Missing authorization code from Google. Please try connecting again."));
    }
    if (!userId) {
      return res.redirect("/?yt_error=" + encodeURIComponent("Session expired. Please log in and try connecting YouTube again."));
    }
    try {
      const result = await handleCallback(code, userId);
      delete (req.session as any).youtubeOAuthUserId;
      sendSSEEvent(userId, "content-update", { type: "channel_connected", platform: "youtube" });
      sendSSEEvent(userId, "dashboard-update", { type: "channel_connected", platform: "youtube" });

      // Kick off the upload watcher + initial scan immediately — don't wait for next login
      setImmediate(async () => {
        try {
          const { startUploadWatcher, scanUserNow } = await import("../services/youtube-upload-watcher");
          await startUploadWatcher(userId!);
          await scanUserNow(userId!);
          logger.info(`[YouTube] Upload watcher started and initial scan complete for ${userId}`);
        } catch (e) {
          logger.warn(`[YouTube] Upload watcher post-connect start failed for ${userId}:`, e);
        }
      });

      res.redirect(`/?yt_connected=true&channel=${encodeURIComponent(result?.ytChannel?.title || "YouTube")}`);
    } catch (error: any) {
      logger.error("YouTube OAuth callback error:", error);
      const isNoChannel = error.message?.includes("No YouTube channel found");
      if (isNoChannel) {
        res.redirect("/?yt_no_channel=true");
      } else {
        res.redirect("/?yt_error=" + encodeURIComponent("Failed to connect YouTube. Please try again."));
      }
    }
  });

  function isYouTubeQuotaError(error: any): boolean {
    return error?.code === "QUOTA_EXCEEDED" || error?.code === 403 ||
      (typeof error?.message === "string" && error.message.includes("quota"));
  }

  function handleYouTubeError(res: any, error: any) {
    if (isYouTubeQuotaError(error)) {
      return res.status(429).json({ error: "YouTube API quota exceeded. Your channel is still connected — sync will resume automatically when quota resets (usually within 24 hours).", code: "QUOTA_EXCEEDED" });
    }
    return res.status(500).json({ error: "An internal error occurred. Please try again." });
  }

  app.get("/api/youtube/my-channel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannel = userChannels.find((c: any) => c.platform === "youtube");
      if (!ytChannel) return res.json({ connected: false });
      const pd = (ytChannel.platformData as any) || {};
      res.json({
        connected: true,
        channelId: ytChannel.channelId,
        channelName: ytChannel.channelName,
        subscriberCount: ytChannel.subscriberCount,
        videoCount: ytChannel.videoCount,
        viewCount: ytChannel.viewCount,
        thumbnailUrl: pd.thumbnailUrl ?? null,
        uploadsPlaylistId: pd.uploadsPlaylistId ?? null,
        description: pd.description ?? "",
        customUrl: pd.customUrl ?? "",
        country: pd.country ?? "",
        publishedAt: pd.publishedAt ?? "",
        lastSyncAt: ytChannel.lastSyncAt,
        hasToken: !!ytChannel.accessToken,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load channel info" });
    }
  });

  app.post("/api/youtube/sync-channel-info", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { refreshYouTubeChannelInfo } = await import("../google-auth");
      const result = await refreshYouTubeChannelInfo(userId);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      handleYouTubeError(res, err);
    }
  });

  app.get("/api/youtube/channel/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
    if (channelId === null) return;
    try {
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const info = await fetchYouTubeChannelInfo(channelId);
      trackQuotaUsage(userId, "read", 2);
      res.json(info);
    } catch (error: any) {
      handleYouTubeError(res, error);
    }
  });

  app.get("/api/youtube/videos/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
    if (channelId === null) return;
    try {
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const videos = await fetchYouTubeVideos(channelId, Number(req.query.maxResults) || 200);
      const videoCount = Math.max(1, Math.ceil(videos.length / 50));
      trackQuotaUsage(userId, "read", videoCount + 1);
      res.json(videos);
    } catch (error: any) {
      handleYouTubeError(res, error);
    }
  });

  app.post("/api/youtube/sync/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
    if (channelId === null) return;
    try {
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const result = await syncYouTubeVideosToLibrary(channelId, userId);
      const syncReadOps = Math.max(1, Math.ceil(result.synced.length / 50)) + 1;
      trackQuotaUsage(userId, "read", syncReadOps);
      res.json({ synced: result.synced.length, newVideos: result.newVideos.length, videos: result.synced });
    } catch (error: any) {
      handleYouTubeError(res, error);
    }
  });

  app.post("/api/youtube/sync-public-feed/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
    if (channelId === null) return;
    try {
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      if (channel.platform !== "youtube") return res.status(400).json({ error: "Channel is not a YouTube channel" });
      const result = await syncYouTubeVideosFromPublicFeed(channelId, userId);
      res.json({ synced: result.synced.length, newVideos: result.newVideos.length, videos: result.synced });
    } catch (error: any) {
      logger.error("[YouTube] Public feed sync error:", error?.message || error);
      res.status(500).json({ error: "Public feed sync failed" });
    }
  });

  app.get("/api/vault/stats", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVaultStats } = await import("../services/video-vault");
      const stats = await getVaultStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get vault stats" });
    }
  });

  app.get("/api/vault/games", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVaultGames } = await import("../services/video-vault");
      const games = await getVaultGames(userId);
      res.json(games);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get vault games" });
    }
  });

  app.get("/api/vault/entries", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVaultEntries } = await import("../services/video-vault");
      const gameName = req.query.game as string | undefined;
      const contentType = req.query.type as string | undefined;
      const entries = await getVaultEntries(userId, gameName, contentType);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get vault entries" });
    }
  });

  app.post("/api/vault/sync", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { startVaultSync } = await import("../services/video-vault");
      startVaultSync(userId).catch(err =>
        logger.error("[Vault] Background sync error:", err?.message || err)
      );
      res.json({ message: "Vault sync started — indexing all channel videos and beginning downloads" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to start vault sync" });
    }
  });

  app.get("/api/vault/export-manifest", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const all = await db.select().from(contentVaultBackups).where(eq(contentVaultBackups.userId, userId));
      const header = "id,youtubeId,platform,contentType,title,gameName,duration,status,fileSize,publishedAt,backupUrl\n";
      const rows = all.map(r => {
        const pub = (r.metadata as any)?.publishedAt || "";
        return [
          r.id, r.youtubeId, r.platform, r.contentType,
          `"${(r.title || "").replace(/"/g, '""')}"`,
          `"${(r.gameName || "").replace(/"/g, '""')}"`,
          r.duration, r.status, r.fileSize || 0, pub, r.backupUrl || ""
        ].join(",");
      }).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=vault_manifest.csv");
      res.send(header + rows);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to export manifest" });
    }
  });

  app.get("/api/vault/download-file/:youtubeId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [entry] = await db.select().from(contentVaultBackups).where(and(
        eq(contentVaultBackups.userId, userId),
        eq(contentVaultBackups.youtubeId, req.params.youtubeId),
      ));
      if (!entry || entry.status !== "downloaded" || !entry.filePath) {
        return res.status(404).json({ error: "File not found or not yet downloaded" });
      }
      const fs = await import("fs");
      const path = await import("path");
      if (!fs.existsSync(entry.filePath)) {
        return res.status(404).json({ error: "File missing from disk" });
      }
      const safeName = (entry.title || entry.youtubeId || "video").replace(/[^a-zA-Z0-9_\-. ]/g, "_").substring(0, 100);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.mp4"`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", String(entry.fileSize || fs.statSync(entry.filePath).size));
      const stream = fs.createReadStream(entry.filePath);
      stream.pipe(res);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.get("/api/vault/download-zip", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const fs = await import("fs");
      const archiver = (await import("archiver")).default;
      const gameName = req.query.game as string | undefined;

      const conditions = [
        eq(contentVaultBackups.userId, userId),
        eq(contentVaultBackups.status, "downloaded"),
      ];
      if (gameName) {
        conditions.push(eq(contentVaultBackups.gameName, gameName));
      }
      const entries = await db.select().from(contentVaultBackups).where(and(...conditions));
      const validEntries = entries.filter(e => e.filePath && fs.existsSync(e.filePath));

      if (validEntries.length === 0) {
        return res.status(404).json({ error: "No downloaded files found" });
      }

      const zipName = gameName
        ? `vault_${gameName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`
        : "vault_full_backup.zip";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { store: true });
      archive.on("error", (err: any) => { if (!res.headersSent) res.status(500).end(); });
      archive.pipe(res);

      for (const entry of validEntries) {
        const safeName = (entry.title || entry.youtubeId || "video").replace(/[^a-zA-Z0-9_\-. ]/g, "_").substring(0, 100);
        const folder = (entry.gameName || "Uncategorized").replace(/[^a-zA-Z0-9_\-. ]/g, "_");
        archive.file(entry.filePath!, { name: `${folder}/${safeName}.mp4` });
      }

      await archive.finalize();
    } catch (error: any) {
      if (!res.headersSent) res.status(500).json({ error: "Failed to create zip" });
    }
  });

  app.put("/api/youtube/video/:channelId/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = parseNumericId(req.params.channelId as string, res, "channel ID");
    if (channelId === null) return;
    try {
      const channel = await storage.getChannel(channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const result = await updateYouTubeVideo(
        channelId,
        req.params.videoId,
        req.body
      );
      trackQuotaUsage(userId, "write");
      res.json(result);
    } catch (error: any) {
      handleYouTubeError(res, error);
    }
  });

  app.post("/api/youtube/push-optimization/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const vId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (vId === null) return;
    try {
      const video = await storage.getVideo(vId);
      if (!video) return res.status(404).json({ error: "Video not found" });
      if (!video.channelId) return res.status(400).json({ error: "Video has no channel" });
      if (!video.metadata?.youtubeId) return res.status(400).json({ error: "Video has no YouTube ID" });

      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });

      const { isMonetizationUnlocked } = await import("../services/monetization-check");
      const monetizationEnabled = await isMonetizationUnlocked(userId, "youtube");

      const updates: any = {};
      if (video.title) updates.title = video.title;
      if (video.description) updates.description = video.description;
      if (video.metadata?.tags) updates.tags = video.metadata.tags;
      if (monetizationEnabled) updates.enableMonetization = true;

      const result = await smartPushOrQueue({
        userId,
        videoId: video.id,
        channelId: video.channelId,
        youtubeVideoId: video.metadata.youtubeId,
        updates,
        priority: 3,
      });

      await storage.createAuditLog({
        action: result.pushed ? "youtube_push" : "youtube_push_queued",
        target: video.title,
        riskLevel: "low",
        details: { videoId: video.id, youtubeId: video.metadata.youtubeId, updates, ...result },
        userId,
      });

      res.json({
        ...result,
        message: result.pushed
          ? "Optimization pushed to YouTube successfully"
          : "Optimization queued — will auto-push when YouTube quota resets",
      });
    } catch (error: any) {
      handleYouTubeError(res, error);
    }
  });

  app.get("/api/youtube/quota", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const quota = await getQuotaStatus(userId);
      const backlog = await getBacklogStats(userId);
      res.json({ quota, backlog });
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/youtube/backlog", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const stats = await getBacklogStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/youtube/backlog/process", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await processBacklog();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/youtube/backlog/retry", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const retried = await retryFailedItems(userId);
      res.json({ retried, message: `${retried} failed items re-queued for retry` });
    } catch (error: any) {
      res.status(500).json({ error: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/subscriptions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subscription = await storage.getSubscription(userId);
    res.json(subscription ? [subscription] : []);
  });

  app.post("/api/subscriptions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      plan: z.string().optional(),
      status: z.string().optional(),
      tier: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const sub = await storage.createSubscription({ ...parsed.data, userId });
    res.status(201).json(sub);
  });

  app.put("/api/subscriptions/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseNumericId(req.params.id as string, res);
    if (id === null) return;
    const [existing] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const sub = await storage.updateSubscription(id, req.body);
    res.json(sub);
  });

  app.get("/api/ab-tests", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = req.query.videoId ? Number(req.query.videoId) : undefined;
    if (videoId !== undefined && isNaN(videoId)) return res.status(400).json({ error: "Invalid videoId" });
    const tests = await storage.getAbTests(userId, videoId);
    res.json(tests);
  });

  app.post("/api/ab-tests", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const test = await storage.createAbTest({ ...req.body, userId });
    res.status(201).json(test);
  });

  app.get("/api/audience-analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getOptimalPostingTimes } = await import("../smart-scheduler");
      const platforms = ["youtube", "tiktok", "discord"];
      const audienceData: Record<string, any> = {};
      let hasAnyData = false;

      const results = await Promise.allSettled(
        platforms.map(async (platform) => {
          const result = await getOptimalPostingTimes(userId, platform);
          return { platform, result };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          const { platform, result } = r.value;
          audienceData[platform] = {
            source: result.source,
            topSlots: (result.slots || []).slice(0, 5).map((s: any) => ({
              dayOfWeek: s.dayOfWeek,
              hourOfDay: s.hourOfDay,
              activityLevel: s.activityLevel,
              dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.dayOfWeek ?? 0],
            })),
            peakHour: result.slots?.[0]?.hourOfDay ?? null,
            peakDay: result.slots?.[0]?.dayOfWeek ?? null,
          };
          if (result.source === "data") hasAnyData = true;
        }
      }

      for (const p of platforms) {
        if (!audienceData[p]) {
          audienceData[p] = { source: "none", topSlots: [], peakHour: null, peakDay: null };
        }
      }

      const { getGuardrailStatus } = await import("../stealth-guardrails");
      let stealthStatus = null;
      try {
        stealthStatus = await getGuardrailStatus(userId);
      } catch (e: any) { logger.error("[Platform] Stealth status error:", e?.message); }

      if (!res.headersSent) {
        res.json({
          hasAudienceData: hasAnyData,
          platforms: audienceData,
          stealthStatus,
          dataSource: hasAnyData ? "real-viewer-data" : "optimized-defaults",
        });
      }
    } catch (error: any) {
      logger.error("Audience analytics error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "An internal error occurred. Please try again." });
      }
    }
  });

  app.get("/api/analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    if (channelId !== undefined && isNaN(channelId)) return res.status(400).json({ error: "Invalid channelId" });
    const analytics = await storage.getAnalyticsSnapshots(userId);
    res.json(analytics);
  });

  app.post("/api/analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const record = await storage.createAnalyticsSnapshot({ ...req.body, userId });
    res.status(201).json(record);
  });

  app.get("/api/platform-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const health = await storage.getPlatformHealth(userId);
    res.json(health);
  });

  app.post("/api/shorts/start", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await startShortsPipeline(userId, req.body.mode);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/shorts/status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getShortsPipelineStatus(userId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/pause", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await pauseShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/resume", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await resumeShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/extract/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try {
      const result = await extractClipsFromVideo(userId, videoId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/hook/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;
    try {
      const result = await generateClipHook(userId, clipId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/virality/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;
    try {
      const result = await predictClipVirality(userId, clipId);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/shorts/clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getClipsByVideo(userId, req.query.videoId ? Number(req.query.videoId) : undefined);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/auto-reel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await compileAutoReel(userId, req.body.theme);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.post("/api/shorts/track-performance/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;
    try {
      const result = await trackClipPerformance(userId, clipId, req.body);
      res.json(result);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/optimization/health-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getOptimizationHealthScore(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/sub-engines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getSubEngineStatuses(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/metadata/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await runMetadataOptimizer(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/ab-test/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await runAbTestEngine(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/inject-trend", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await injectTrendingTopic(userId, req.body.videoId, req.body.topicId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/decay-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getDecayAlerts(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/viral-score/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await predictViralScore(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/hashtag-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await analyzeHashtagHealth(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/sentiment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await analyzeSentiment(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/algorithm-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectAlgorithmChanges(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/lifecycle/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await manageContentLifecycle(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/evergreen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectEvergreenContent(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/cannibalization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectContentCannibalization(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/trend-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await predictTrends(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await buildContentDna(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/ctr/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await optimizeCtr(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/trending-topics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getTrendingTopics(userId, req.query.platform as string | undefined); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/viral-leaderboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getViralLeaderboard(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/content-gaps", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getContentGaps(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/optimization/algorithm-cheatsheet/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = String(req.params.platform).toLowerCase().trim();
    if (!platform || platform.length > 50) return res.status(400).json({ error: "Invalid platform" });
    try { const result = await getAlgorithmCheatSheet(userId, platform); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/optimization/full-pass/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await runFullOptimizationPass(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/playlist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await createManagedPlaylist(userId, req.body); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/youtube-manager/playlists", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getPlaylists(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/auto-organize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await autoOrganizePlaylists(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/playlist/:playlistId/add", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const playlistId = parseNumericId(req.params.playlistId as string, res, "playlist ID");
    if (playlistId === null) return;
    try { const result = await addToPlaylist(playlistId, req.body.videoId, req.body.position); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/youtube-manager/playlist/:playlistId/seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const playlistId = parseNumericId(req.params.playlistId as string, res, "playlist ID");
    if (playlistId === null) return;
    try { const result = await getPlaylistSeoScore(playlistId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/pinned-comment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try {
      const result = await generatePinnedComment(userId, videoId);
      if (result?.comment && req.body?.postToYouTube) {
        const video = await storage.getVideo(videoId);
        const meta = video?.metadata as any;
        const youtubeVideoId = meta?.youtubeVideoId;
        if (youtubeVideoId) {
          const ytChannels = await db.select().from(channels)
            .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
          const ytChannel = ytChannels.find((c: any) => c.accessToken);
          if (ytChannel) {
            const { postAndPinComment } = await import("../youtube");
            const pinResult = await postAndPinComment(ytChannel.id, youtubeVideoId, result.comment);
            res.json({ ...result, posted: pinResult.success, commentId: pinResult.commentId, postError: pinResult.error });
            return;
          }
        }
      }
      res.json(result);
    }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/pin-all-videos", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId));
      const channelIds = userChannels.map(c => c.id);
      
      const userVideos = await db.select().from(videos)
        .where(and(inArray(videos.channelId, channelIds), eq(videos.platform, "youtube")))
        .orderBy(desc(videos.createdAt));

      const ytChannels = await db.select().from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
      const ytChannel = ytChannels.find((c: any) => c.accessToken);

      if (!ytChannel) {
        res.json({ success: false, error: "No YouTube channel connected", processed: 0, total: userVideos.length });
        return;
      }

      let processed = 0;
      let pinned = 0;
      let skipped = 0;
      let failed = 0;

      for (const video of userVideos) {
        const meta = video.metadata as any;
        const youtubeVideoId = meta?.youtubeVideoId;
        if (!youtubeVideoId) { skipped++; continue; }
        if (meta?.pinnedCommentId) { skipped++; continue; }

        try {
          const result = await generatePinnedComment(userId, video.id);
          if (!result?.comment) { skipped++; continue; }

          const { postAndPinComment } = await import("../youtube");
          const pinResult = await postAndPinComment(ytChannel.id, youtubeVideoId, result.comment);

          if (pinResult.success) {
            await db.update(videos).set({
              metadata: { ...meta, pinnedCommentId: pinResult.commentId, pinnedCommentText: result.comment },
            }).where(eq(videos.id, video.id));
            pinned++;
          } else {
            failed++;
          }
          processed++;

          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (err: any) {
          logger.error(`[PinAll] Failed for video ${video.id}:`, err.message);
          failed++;
          processed++;
        }
      }

      res.json({ success: true, total: userVideos.length, processed, pinned, skipped, failed });
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/youtube-manager/description-links", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await buildDescriptionLinks(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/multi-language/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await generateMultiLanguageMetadata(userId, videoId, req.body.languages); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/youtube-manager/batch-push", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await batchPushOptimizations(userId, req.body.videoIds); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/repurpose/generate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await repurposeVideo(userId, req.body.videoId, req.body.formats); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/repurpose/content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getRepurposedContent(userId, req.query.videoId ? Number(req.query.videoId) : undefined); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/repurpose/template", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await createScriptTemplate(userId, req.body); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/repurpose/templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getScriptTemplates(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/repurpose/b-roll/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try { const result = await suggestBRoll(userId, videoId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/repurpose/formats", async (_req, res) => {
    try { const result = getRepurposeFormats(); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/scheduler/optimal-times/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = String(req.params.platform).toLowerCase().trim();
    if (!platform || platform.length > 50) return res.status(400).json({ error: "Invalid platform" });
    try { const result = await getOptimalPostingTimes(userId, platform); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/scheduler/activity-patterns", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await updateActivityPatterns(userId, req.body.platform, req.body.data); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/scheduler/cadence", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getUploadCadence(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.post("/api/scheduler/auto-schedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await autoScheduleContent(userId, req.body.videoId, req.body.platforms); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  app.get("/api/scheduler/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getScheduleRecommendations(userId); res.json(result); }
    catch (error: any) { logger.error("Error:", error); res.status(500).json({ message: "An internal error occurred. Please try again." }); }
  });

  const { OAUTH_CONFIGS, getOAuthRedirectUri, isPlatformOAuthConfigured, getAllOAuthPlatforms } = await import("../oauth-config");
  const { fetchPlatformData } = await import("../platform-data-fetcher");
  const crypto = await import("crypto");

  const pendingOAuthStates = new Map<string, { userId: string; platform: string; timestamp: number; codeVerifier?: string }>();

  function cleanupOAuthStates() {
    const now = Date.now();
    for (const [key, val] of Array.from(pendingOAuthStates.entries())) {
      if (now - val.timestamp > 10 * 60 * 1000) pendingOAuthStates.delete(key);
    }
    if (pendingOAuthStates.size > 200) {
      const sorted = Array.from(pendingOAuthStates.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, sorted.length - 200);
      for (const [key] of toRemove) pendingOAuthStates.delete(key);
    }
  }

  app.get("/api/oauth/needs-reconnect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await db.select({
        platform: channels.platform,
        platformData: channels.platformData,
        tokenExpiresAt: channels.tokenExpiresAt,
        refreshToken: channels.refreshToken,
        accessToken: channels.accessToken,
      }).from(channels).where(eq(channels.userId, userId));

      const broken = userChannels.filter(ch => {
        const pd = (ch.platformData || {}) as any;
        if (!ch.accessToken && !ch.refreshToken) return true;
        if (pd._connectionStatus === "expired" || pd._connectionStatus === "disconnected") return true;
        if (ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < new Date() && !ch.refreshToken) return true;
        return false;
      });

      const platforms = [...new Set(broken.map(ch => ch.platform))];
      res.json({ needsReconnect: platforms.length > 0, platforms, count: platforms.length });
    } catch (err) {
      logger.error("[NeedsReconnect] Error:", err);
      res.json({ needsReconnect: false, platforms: [], count: 0 });
    }
  });

  app.get("/api/oauth/status", async (_req, res) => {
    const status = await cached(`oauth-status`, 30, async () => {
      const allOAuth = getAllOAuthPlatforms();
      const result: Record<string, { hasOAuth: boolean; configured: boolean }> = {};
      for (const p of allOAuth) {
        result[p] = { hasOAuth: true, configured: isPlatformOAuthConfigured(p) };
      }
      result["youtube"] = { hasOAuth: true, configured: true };
      result["youtubeshorts"] = { hasOAuth: true, configured: true };
      return result;
    });
    res.json(status);
  });

  app.get("/api/oauth/:platform/auth", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.params.platform as Platform;
    const config = OAUTH_CONFIGS[platform];
    if (!config) return res.status(400).json({ error: `No OAuth config for platform: ${platform}` });

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: `OAuth not configured for ${config.label}. Missing ${config.clientIdEnv} and/or ${config.clientSecretEnv}.` });
    }

    cleanupOAuthStates();
    const state = crypto.randomBytes(32).toString("hex");
    let codeVerifier: string | undefined;

    if (config.requiresPKCE) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
    }

    pendingOAuthStates.set(state, { userId, platform, timestamp: Date.now(), codeVerifier });

    const scopeDelimiter = config.usesClientKey ? "," : " ";
    const params = new URLSearchParams({
      [config.usesClientKey ? "client_key" : "client_id"]: clientId,
      redirect_uri: getOAuthRedirectUri(platform),
      response_type: config.responseType || "code",
      scope: config.scopes.join(scopeDelimiter),
      state,
      ...(config.additionalAuthParams || {}),
    });
    if (config.requiresPKCE && codeVerifier) {
      if (config.pkceChallengeMethod === "S256") {
        const hash = crypto.createHash("sha256").update(codeVerifier).digest();
        const codeChallenge = hash.toString("base64url");
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
      } else {
        params.set("code_challenge", codeVerifier);
        params.set("code_challenge_method", "plain");
      }
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("application/json")) {
      res.json({ url: authUrl });
    } else {
      res.redirect(authUrl);
    }
  });

  const pendingBounceTokens = new Map<string, { authUrl: string; platform: string; timestamp: number }>();

  app.get("/api/oauth/:platform/bounce", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.params.platform as Platform;
    const config = OAUTH_CONFIGS[platform];
    if (!config) return res.status(400).json({ error: `No OAuth config for platform: ${platform}` });

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: `OAuth not configured for ${config.label}.` });
    }

    cleanupOAuthStates();
    const state = crypto.randomBytes(32).toString("hex");
    let codeVerifier: string | undefined;
    if (config.requiresPKCE) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
    }
    pendingOAuthStates.set(state, { userId, platform, timestamp: Date.now(), codeVerifier });

    const scopeDelimiter = config.usesClientKey ? "," : " ";
    const params = new URLSearchParams({
      [config.usesClientKey ? "client_key" : "client_id"]: clientId,
      redirect_uri: getOAuthRedirectUri(platform),
      response_type: config.responseType || "code",
      scope: config.scopes.join(scopeDelimiter),
      state,
      ...(config.additionalAuthParams || {}),
    });
    if (config.requiresPKCE && codeVerifier) {
      if (config.pkceChallengeMethod === "S256") {
        const hash = crypto.createHash("sha256").update(codeVerifier).digest();
        const codeChallenge = hash.toString("base64url");
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
      } else {
        params.set("code_challenge", codeVerifier);
        params.set("code_challenge_method", "plain");
      }
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;

    const bounceToken = crypto.randomBytes(24).toString("hex");
    pendingBounceTokens.set(bounceToken, { authUrl, platform, timestamp: Date.now() });
    const now = Date.now();
    for (const [k, v] of pendingBounceTokens) {
      if (now - v.timestamp > 5 * 60 * 1000) pendingBounceTokens.delete(k);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.send(`<!DOCTYPE html>
<html><head>
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<style>body{background:#0a0a0f;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{text-align:center}.s{width:40px;height:40px;border:3px solid rgba(139,92,246,0.3);border-top-color:#8b5cf6;border-radius:50%;animation:r 1s linear infinite;margin:0 auto}
@keyframes r{to{transform:rotate(360deg)}}.l{margin-top:16px;color:#a78bfa;font-size:14px}
.b{margin-top:16px;background:#8b5cf6;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}</style>
</head><body><div class="c">
<div class="s"></div>
<p class="l">Connecting to ${config.label}...</p>
<form id="bf" method="POST" action="/api/oauth/bounce-redirect">
<input type="hidden" name="t" value="${bounceToken}">
<noscript><button type="submit" class="b">Continue to ${config.label}</button></noscript>
</form>
<script>document.getElementById("bf").submit();</script>
</div></body></html>`);
  });

  app.post("/api/oauth/bounce-redirect", (req, res) => {
    const token = req.body?.t;
    if (!token || !pendingBounceTokens.has(token)) {
      return res.redirect("/?error=" + encodeURIComponent("Session expired. Please try connecting again."));
    }
    const { authUrl } = pendingBounceTokens.get(token)!;
    pendingBounceTokens.delete(token);
    res.redirect(302, authUrl);
  });

  app.get("/api/oauth/:platform/callback", async (req, res) => {
    const platform = req.params.platform as Platform;
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      return res.redirect(`/?error=${encodeURIComponent("Missing authorization code. Please try again.")}`);
    }

    let userId: string | null = null;
    let codeVerifier: string | undefined;
    if (state && pendingOAuthStates.has(state)) {
      const entry = pendingOAuthStates.get(state)!;
      userId = entry.userId;
      codeVerifier = entry.codeVerifier;
      pendingOAuthStates.delete(state);
    }

    if (!userId) {
      userId = req.isAuthenticated() ? getUserId(req) : null;
    }

    if (!userId) {
      return res.redirect(`/?error=${encodeURIComponent("Session expired. Please log in and try again.")}`);
    }

    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return res.redirect(`/?error=${encodeURIComponent(`Unknown platform: ${platform}`)}`);
    }

    const clientId = process.env[config.clientIdEnv]!;
    const clientSecret = process.env[config.clientSecretEnv]!;

    try {
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: getOAuthRedirectUri(platform),
        [config.usesClientKey ? "client_key" : "client_id"]: clientId,
        client_secret: clientSecret,
      };

      if (config.requiresPKCE && codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      };

      if (config.tokenAuthMethod === "header") {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        delete tokenBody.client_id;
        delete tokenBody.client_secret;
      }

      const tokenRes = await fetch(config.tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        logger.error(`[OAuth ${platform}] Token exchange failed:`, errText);
        return res.redirect(`/?error=${encodeURIComponent(`Failed to connect ${config.label}. Please try again.`)}`);
      }

      const tokenData = await tokenRes.json() as any;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const expiresIn = tokenData.expires_in;
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      let channelName = `${config.label} Account`;
      let channelId = accessToken.substring(0, 20);
      let profileUrl: string | undefined;

      if (config.userInfoUrl && config.userInfoHeaders && config.parseUserId) {
        try {
          const userRes = await fetch(config.userInfoUrl, {
            headers: config.userInfoHeaders(accessToken),
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            const parsed = config.parseUserId(userData);
            channelId = parsed.id;
            channelName = parsed.displayName || parsed.username;
            profileUrl = parsed.profileUrl;
          }
        } catch (e) {
          logger.error(`[OAuth ${platform}] User info fetch failed:`, e);
        }
      }

      let streamKey: string | undefined;
      let rtmpUrl: string | undefined;
      let platformDataObj: Record<string, any> = {};
      let fetchedFollowerCount: number | undefined;

      try {
        const fetched = await fetchPlatformData(platform as Platform, accessToken, channelId);
        if (fetched.streamKey) streamKey = fetched.streamKey;
        if (fetched.rtmpUrl) rtmpUrl = fetched.rtmpUrl;
        if (fetched.channelName) channelName = fetched.channelName;
        if (fetched.channelId) channelId = fetched.channelId;
        if (fetched.profileUrl) profileUrl = fetched.profileUrl;
        if (fetched.followerCount !== undefined) fetchedFollowerCount = fetched.followerCount;
        if (fetched.platformData) platformDataObj = fetched.platformData;
      } catch (e) {
        logger.error(`[OAuth ${platform}] Platform data fetch failed:`, e);
      }

      const existingChannels = await storage.getChannelsByUser(userId);
      const existing = existingChannels.find(c => c.platform === platform);

      const fetchedVideoCount = platformDataObj.videoCount
        ? Number(platformDataObj.videoCount)
        : platformDataObj.tweetCount
        ? Number(platformDataObj.tweetCount)
        : platformDataObj.mediaCount
        ? Number(platformDataObj.mediaCount)
        : null;

      if (existing) {
        const mergedPd = { ...((existing.platformData as any) || {}), ...platformDataObj, lastFetchedAt: new Date().toISOString(), _connectionStatus: "healthy", _lastVerifiedAt: Date.now(), _reconnectFailures: 0 };
        await storage.updateChannel(existing.id, {
          accessToken,
          refreshToken,
          tokenExpiresAt,
          channelName,
          channelId,
          streamKey: streamKey || existing.streamKey || null,
          rtmpUrl: rtmpUrl || existing.rtmpUrl || null,
          subscriberCount: fetchedFollowerCount ?? existing.subscriberCount ?? null,
          videoCount: fetchedVideoCount ?? existing.videoCount ?? null,
          lastSyncAt: new Date(),
          platformData: mergedPd,
        });
      } else {
        await storage.createChannel({
          userId,
          platform,
          channelName,
          channelId,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          streamKey: streamKey || null,
          rtmpUrl: rtmpUrl || null,
          subscriberCount: fetchedFollowerCount ?? null,
          videoCount: fetchedVideoCount ?? null,
          platformData: { ...platformDataObj, lastFetchedAt: new Date().toISOString(), _connectionStatus: "healthy", _lastVerifiedAt: Date.now() },
          settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
        });
      }

      await db.transaction(async (tx) => {
        if (streamKey || rtmpUrl) {
          const platformInfo = (await import("@shared/schema")).PLATFORM_INFO;
          const info = platformInfo[platform as Platform];
          const finalRtmpUrl = rtmpUrl || info?.rtmpUrlTemplate || "";

          const existingDest = await tx.select().from(streamDestinations).where(
            and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform))
          );

          if (existingDest.length === 0) {
            await tx.insert(streamDestinations).values({
              userId,
              platform,
              label: `${channelName} (${config.label})`,
              rtmpUrl: finalRtmpUrl,
              streamKey: streamKey || null,
              enabled: true,
              settings: { resolution: "1080p", bitrate: "6000", fps: 60, autoStart: true },
            });
          } else {
            await tx.update(streamDestinations)
              .set({ rtmpUrl: finalRtmpUrl, streamKey: streamKey || existingDest[0].streamKey, label: `${channelName} (${config.label})` })
              .where(and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform)));
          }
        }

        const existingLinked = await tx.select().from(linkedChannels).where(
          and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform))
        );
        if (existingLinked.length === 0) {
          await tx.insert(linkedChannels).values({
            userId,
            platform,
            username: channelName,
            profileUrl: profileUrl || null,
            isConnected: true,
            connectionType: "oauth",
            followerCount: fetchedFollowerCount || null,
          });
        } else {
          await tx.update(linkedChannels)
            .set({
              isConnected: true,
              username: channelName,
              profileUrl: profileUrl || null,
              connectionType: "oauth",
              followerCount: fetchedFollowerCount || existingLinked[0].followerCount,
              lastVerifiedAt: new Date(),
            })
            .where(and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform)));
        }
      });

      sendSSEEvent(userId, "content-update", { type: "channel_connected", platform });
      sendSSEEvent(userId, "dashboard-update", { type: "channel_connected", platform });

      res.redirect(`/?connected=${platform}&channel=${encodeURIComponent(channelName)}`);
    } catch (error: any) {
      logger.error(`[OAuth ${platform}] Callback error:`, error);
      res.redirect(`/?error=${encodeURIComponent(`Failed to connect ${config.label}: ${error.message}`)}`);
    }
  });

  app.post("/api/linked-channels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [result] = await db.insert(linkedChannels).values({
        userId,
        platform: req.body.platform,
        username: req.body.username || null,
        profileUrl: req.body.profileUrl || null,
        isConnected: req.body.isConnected ?? true,
        connectionType: req.body.connectionType || "manual",
        credentials: req.body.credentials || null,
        followerCount: req.body.followerCount || null,
      }).returning();

      const creds = req.body.credentials || {};
      const tokenValue = creds.streamKey || creds.apiKey || req.body.username || "";
      const platformName = req.body.platform;
      const existingChannels = await storage.getChannelsByUser(userId);
      const existingForPlatform = existingChannels.find(c => c.platform === platformName);
      if (!existingForPlatform && tokenValue) {
        const platformInfo = PLATFORM_INFO[platformName as Platform];
        await storage.createChannel({
          userId,
          platform: platformName,
          channelName: req.body.username || `${platformInfo?.label || platformName} Account`,
          channelId: tokenValue,
          accessToken: tokenValue,
          refreshToken: null,
          tokenExpiresAt: null,
          settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
        });
      }

      const { credentials, ...safeResult } = result;
      res.json(safeResult);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.get("/api/linked-channels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const safeResults = await cached(`linked-channels:${userId}`, 30, async () => {
        const result = await db.select().from(linkedChannels)
          .where(eq(linkedChannels.userId, userId));
        return result.map(({ credentials, ...safe }) => safe);
      });
      res.json(safeResults);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.put("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const [result] = await db.update(linkedChannels)
        .set(req.body)
        .where(and(eq(linkedChannels.id, id), eq(linkedChannels.userId, userId)))
        .returning();
      const { credentials, ...safeResult } = result;
      res.json(safeResult);
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.delete("/api/oauth/:platform/disconnect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = String(req.params.platform).toLowerCase().trim();
    if (!platform || platform.length > 50) return res.status(400).json({ error: "Invalid platform" });
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const platformChannels = userChannels.filter(c => c.platform === platform);
      for (const ch of platformChannels) {
        await storage.deleteChannel(ch.id);
      }
      await db.transaction(async (tx) => {
        await tx.delete(linkedChannels)
          .where(and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform)));
        await tx.delete(streamDestinations)
          .where(and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform)));
      });
      await storage.createAuditLog({
        userId,
        action: "platform_disconnected",
        target: platform,
        details: { platform },
        riskLevel: "medium",
      });
      sendSSEEvent(userId, "content-update", { type: "channel_disconnected", platform });
      sendSSEEvent(userId, "dashboard-update", { type: "channel_disconnected", platform });
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`[OAuth ${platform}] Disconnect error:`, error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  app.delete("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      await db.delete(linkedChannels)
        .where(and(eq(linkedChannels.id, id), eq(linkedChannels.userId, userId)));
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error:", error);
      res.status(500).json({ message: "An internal error occurred. Please try again." });
    }
  });

  const audienceHandler = (fetcher: (userId: string) => Promise<any>) => {
    return async (req: any, res: any) => {
      try {
        const userId = requireAuth(req, res);
        if (!userId) return;
        const data = await fetcher(userId);
        res.json(data);
      } catch (err: any) {
        logger.error("Audience endpoint error", { error: err?.message });
        res.json({});
      }
    };
  };

  app.get("/api/audience/heatmap/:uid", audienceHandler(fetchViewsByDayAndHour));
  app.get("/api/audience/heatmap", audienceHandler(fetchViewsByDayAndHour));

  app.get("/api/audience/milestones/:uid", audienceHandler(fetchMilestoneData));
  app.get("/api/audience/milestones", audienceHandler(fetchMilestoneData));

  app.get("/api/audience/growth-forecast/:uid", audienceHandler(fetchGrowthForecast));
  app.get("/api/audience/growth-forecast", audienceHandler(fetchGrowthForecast));

  app.get("/api/audience/engagement-score/:uid", audienceHandler(fetchEngagementScore));
  app.get("/api/audience/engagement-score", audienceHandler(fetchEngagementScore));

  app.get("/api/audience/top-fans/:uid", audienceHandler(fetchTopFans));
  app.get("/api/audience/top-fans", audienceHandler(fetchTopFans));

  app.get("/api/audience/geo-distribution/:uid", audienceHandler(fetchGeoDistribution));
  app.get("/api/audience/geo-distribution", audienceHandler(fetchGeoDistribution));

  app.get("/api/connections/health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getConnectionHealth } = await import("../services/connection-guardian");
      const health = await getConnectionHealth(userId);
      res.json(health);
    } catch (err: any) {
      logger.error("[ConnectionHealth] Error:", err?.message);
      res.status(500).json({ error: "Failed to fetch connection health" });
    }
  });

  app.post("/api/connections/refresh/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.params.platform;
    try {
      const { forceRefreshPlatform } = await import("../services/connection-guardian");
      const result = await forceRefreshPlatform(userId, platform);
      res.json(result);
    } catch (err: any) {
      logger.error("[ConnectionRefresh] Error:", err?.message);
      res.status(500).json({ success: false, error: "Failed to refresh connection" });
    }
  });

  app.post("/api/connections/refresh-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { refreshAllUserChannelStats } = await import("../youtube");
      await refreshAllUserChannelStats(userId);
      const { getConnectionHealth } = await import("../services/connection-guardian");
      const health = await getConnectionHealth(userId);
      res.json({ success: true, health });
    } catch (err: any) {
      logger.error("[ConnectionRefreshAll] Error:", err?.message);
      res.status(500).json({ success: false, error: "Failed to refresh all connections" });
    }
  });
}
