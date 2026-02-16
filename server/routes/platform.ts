import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { linkedChannels, streamDestinations, subscriptions } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { PLATFORM_INFO } from "@shared/schema";
import { requireAuth, getUserId } from "./helpers";
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
} from "../youtube";

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
    }).passthrough();
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
      throw err;
    }
  });

  app.put(api.community.update.path, async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { content, platform, type, status, publishedAt, aiGenerated, scheduledAt, engagement } = req.body || {};
    const post = await storage.updateCommunityPost(Number(req.params.id), { content, platform, type, status, publishedAt, aiGenerated, scheduledAt, engagement });
    res.json(post);
  });

  app.get("/api/youtube/auth", (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const acceptHeader = req.headers.accept || "";
      if (acceptHeader.includes("application/json")) {
        res.json({ url: "/api/auth/google" });
      } else {
        res.redirect("/api/auth/google");
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      return res.redirect("/channels?error=" + encodeURIComponent("Missing authorization code from Google. Please try connecting again."));
    }
    if (!userId) {
      return res.redirect("/channels?error=" + encodeURIComponent("Session expired. Please log in and try connecting YouTube again."));
    }
    try {
      const result = await handleCallback(code, userId);
      delete (req.session as any).youtubeOAuthUserId;
      res.redirect(`/channels?connected=youtube&channel=${encodeURIComponent(result.ytChannel.title || "")}`);
    } catch (error: any) {
      console.error("YouTube OAuth callback error:", error);
      res.redirect(`/channels?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get("/api/youtube/channel/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const info = await fetchYouTubeChannelInfo(Number(req.params.channelId));
      res.json(info);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/youtube/videos/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const videos = await fetchYouTubeVideos(Number(req.params.channelId), Number(req.query.maxResults) || 200);
      res.json(videos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube/sync/:channelId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const result = await syncYouTubeVideosToLibrary(Number(req.params.channelId), userId);
      res.json({ synced: result.synced.length, newVideos: result.newVideos.length, videos: result.synced });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/youtube/video/:channelId/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const channel = await storage.getChannel(Number(req.params.channelId));
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });
      const result = await updateYouTubeVideo(
        Number(req.params.channelId),
        req.params.videoId,
        req.body
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube/push-optimization/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const video = await storage.getVideo(Number(req.params.videoId));
      if (!video) return res.status(404).json({ error: "Video not found" });
      if (!video.channelId) return res.status(400).json({ error: "Video has no channel" });
      if (!video.metadata?.youtubeId) return res.status(400).json({ error: "Video has no YouTube ID" });

      const channel = await storage.getChannel(video.channelId);
      if (!channel || channel.userId !== userId) return res.status(403).json({ error: "Not authorized" });

      const updates: any = {};
      if (video.title) updates.title = video.title;
      if (video.description) updates.description = video.description;
      if (video.metadata?.tags) updates.tags = video.metadata.tags;

      const result = await updateYouTubeVideo(video.channelId, video.metadata.youtubeId, updates);
      await storage.createAuditLog({
        action: "youtube_push",
        target: video.title,
        riskLevel: "medium",
        details: { videoId: video.id, youtubeId: video.metadata.youtubeId, updates },
        userId,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    }).passthrough();
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
    const [existing] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, Number(req.params.id)), eq(subscriptions.userId, userId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const sub = await storage.updateSubscription(Number(req.params.id), req.body);
    res.json(sub);
  });

  app.get("/api/ab-tests", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const videoId = req.query.videoId ? Number(req.query.videoId) : undefined;
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
      const platforms = ["youtube", "tiktok", "x", "discord", "twitch", "kick"];
      const audienceData: Record<string, any> = {};
      let hasAnyData = false;

      for (const platform of platforms) {
        try {
          const result = await getOptimalPostingTimes(userId, platform);
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
        } catch {
          audienceData[platform] = { source: "none", topSlots: [], peakHour: null, peakDay: null };
        }
      }

      const { getGuardrailStatus } = await import("../stealth-guardrails");
      let stealthStatus = null;
      try {
        stealthStatus = await getGuardrailStatus(userId);
      } catch {}

      res.json({
        hasAudienceData: hasAnyData,
        platforms: audienceData,
        stealthStatus,
        dataSource: hasAnyData ? "real-viewer-data" : "optimized-defaults",
      });
    } catch (error: any) {
      console.error("Audience analytics error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
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
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/shorts/status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getShortsPipelineStatus(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/pause", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await pauseShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/resume", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await resumeShortsPipeline(userId);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/extract/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await extractClipsFromVideo(userId, Number(req.params.videoId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/hook/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await generateClipHook(userId, Number(req.params.clipId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/virality/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await predictClipVirality(userId, Number(req.params.clipId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/shorts/clips", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await getClipsByVideo(userId, req.query.videoId ? Number(req.query.videoId) : undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/auto-reel", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await compileAutoReel(userId, req.body.theme);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/shorts/track-performance/:clipId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await trackClipPerformance(userId, Number(req.params.clipId), req.body);
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/optimization/health-score", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getOptimizationHealthScore(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/sub-engines", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getSubEngineStatuses(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/metadata/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await runMetadataOptimizer(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/ab-test/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await runAbTestEngine(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/inject-trend", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await injectTrendingTopic(userId, req.body.videoId, req.body.topicId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/decay-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getDecayAlerts(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/viral-score/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await predictViralScore(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/hashtag-health", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await analyzeHashtagHealth(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/sentiment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await analyzeSentiment(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/algorithm-alerts", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectAlgorithmChanges(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/lifecycle/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await manageContentLifecycle(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/evergreen", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectEvergreenContent(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/cannibalization", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await detectContentCannibalization(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/trend-predictions", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await predictTrends(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/content-dna", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await buildContentDna(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/ctr/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await optimizeCtr(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/trending-topics", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getTrendingTopics(userId, req.query.platform as string | undefined); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/viral-leaderboard", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getViralLeaderboard(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/content-gaps", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getContentGaps(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/optimization/algorithm-cheatsheet/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getAlgorithmCheatSheet(userId, req.params.platform); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/optimization/full-pass/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await runFullOptimizationPass(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/playlist", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await createManagedPlaylist(userId, req.body); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/youtube-manager/playlists", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getPlaylists(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/auto-organize", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await autoOrganizePlaylists(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/playlist/:playlistId/add", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await addToPlaylist(Number(req.params.playlistId), req.body.videoId, req.body.position); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/youtube-manager/playlist/:playlistId/seo", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getPlaylistSeoScore(Number(req.params.playlistId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/pinned-comment/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await generatePinnedComment(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/youtube-manager/description-links", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await buildDescriptionLinks(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/multi-language/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await generateMultiLanguageMetadata(userId, Number(req.params.videoId), req.body.languages); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/youtube-manager/batch-push", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await batchPushOptimizations(userId, req.body.videoIds); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/repurpose/generate", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await repurposeVideo(userId, req.body.videoId, req.body.formats); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/repurpose/content", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getRepurposedContent(userId, req.query.videoId ? Number(req.query.videoId) : undefined); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/repurpose/template", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await createScriptTemplate(userId, req.body); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/repurpose/templates", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getScriptTemplates(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/repurpose/b-roll/:videoId", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await suggestBRoll(userId, Number(req.params.videoId)); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/repurpose/formats", async (_req, res) => {
    try { const result = getRepurposeFormats(); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/scheduler/optimal-times/:platform", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getOptimalPostingTimes(userId, req.params.platform); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/scheduler/activity-patterns", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await updateActivityPatterns(userId, req.body.platform, req.body.data); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/scheduler/cadence", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getUploadCadence(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.post("/api/scheduler/auto-schedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await autoScheduleContent(userId, req.body.videoId, req.body.platforms); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
  });

  app.get("/api/scheduler/recommendations", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try { const result = await getScheduleRecommendations(userId); res.json(result); }
    catch (error: any) { console.error("Error:", error); res.status(500).json({ message: error.message }); }
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
  }

  app.get("/api/oauth/status", async (_req, res) => {
    const allOAuth = getAllOAuthPlatforms();
    const status: Record<string, { hasOAuth: boolean; configured: boolean }> = {};
    for (const p of allOAuth) {
      status[p] = { hasOAuth: true, configured: isPlatformOAuthConfigured(p) };
    }
    status["youtube"] = { hasOAuth: true, configured: true };
    status["youtubeshorts"] = { hasOAuth: true, configured: true };
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
    console.log(`[OAuth ${platform}] Auth URL:`, authUrl);
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("application/json")) {
      res.json({ url: authUrl });
    } else {
      res.redirect(authUrl);
    }
  });

  app.get("/api/oauth/:platform/callback", async (req, res) => {
    const platform = req.params.platform as Platform;
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      return res.redirect(`/channels?error=${encodeURIComponent("Missing authorization code. Please try again.")}`);
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
      return res.redirect(`/channels?error=${encodeURIComponent("Session expired. Please log in and try again.")}`);
    }

    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return res.redirect(`/channels?error=${encodeURIComponent(`Unknown platform: ${platform}`)}`);
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
        console.error(`[OAuth ${platform}] Token exchange failed:`, errText);
        return res.redirect(`/channels?error=${encodeURIComponent(`Failed to connect ${config.label}. Please try again.`)}`);
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
          console.error(`[OAuth ${platform}] User info fetch failed:`, e);
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
        console.error(`[OAuth ${platform}] Platform data fetch failed:`, e);
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
          platformData: { ...((existing.platformData as any) || {}), ...platformDataObj, lastFetchedAt: new Date().toISOString() },
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
          platformData: { ...platformDataObj, lastFetchedAt: new Date().toISOString() },
          settings: { preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
        });
      }

      if (streamKey || rtmpUrl) {
        const platformInfo = (await import("@shared/schema")).PLATFORM_INFO;
        const info = platformInfo[platform as Platform];
        const finalRtmpUrl = rtmpUrl || info?.rtmpUrlTemplate || "";

        const existingDest = await db.select().from(streamDestinations).where(
          and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform))
        );

        if (existingDest.length === 0) {
          await db.insert(streamDestinations).values({
            userId,
            platform,
            label: `${channelName} (${config.label})`,
            rtmpUrl: finalRtmpUrl,
            streamKey: streamKey || null,
            enabled: true,
            settings: { resolution: "1080p", bitrate: "6000", fps: 60, autoStart: true },
          });
        } else {
          await db.update(streamDestinations)
            .set({ rtmpUrl: finalRtmpUrl, streamKey: streamKey || existingDest[0].streamKey, label: `${channelName} (${config.label})` })
            .where(and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform)));
        }
      }

      const existingLinked = await db.select().from(linkedChannels).where(
        and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform))
      );
      if (existingLinked.length === 0) {
        await db.insert(linkedChannels).values({
          userId,
          platform,
          username: channelName,
          profileUrl: profileUrl || null,
          isConnected: true,
          connectionType: "oauth",
          followerCount: fetchedFollowerCount || null,
        });
      } else {
        await db.update(linkedChannels)
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

      res.redirect(`/channels?connected=${platform}&channel=${encodeURIComponent(channelName)}`);
    } catch (error: any) {
      console.error(`[OAuth ${platform}] Callback error:`, error);
      res.redirect(`/channels?error=${encodeURIComponent(`Failed to connect ${config.label}: ${error.message}`)}`);
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

      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/linked-channels", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await db.select().from(linkedChannels)
        .where(eq(linkedChannels.userId, userId));
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const [result] = await db.update(linkedChannels)
        .set(req.body)
        .where(and(eq(linkedChannels.id, Number(req.params.id)), eq(linkedChannels.userId, userId)))
        .returning();
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/oauth/:platform/disconnect", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const platform = req.params.platform;
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const platformChannels = userChannels.filter(c => c.platform === platform);
      for (const ch of platformChannels) {
        await storage.deleteChannel(ch.id);
      }
      await db.delete(linkedChannels)
        .where(and(eq(linkedChannels.userId, userId), eq(linkedChannels.platform, platform)));
      await db.delete(streamDestinations)
        .where(and(eq(streamDestinations.userId, userId), eq(streamDestinations.platform, platform)));
      await storage.createAuditLog({
        userId,
        action: "platform_disconnected",
        target: platform,
        details: { platform },
        riskLevel: "medium",
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error(`[OAuth ${platform}] Disconnect error:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/linked-channels/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await db.delete(linkedChannels)
        .where(and(eq(linkedChannels.id, Number(req.params.id)), eq(linkedChannels.userId, userId)));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error:", error);
      res.status(500).json({ message: error.message });
    }
  });
}
