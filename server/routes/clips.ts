import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requireTier, parseNumericId, asyncHandler } from "./helpers";
import { storage } from "../storage";
import { db } from "../db";
import { contentClips, autopilotQueue, videos } from "@shared/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import {
  startShortsPipeline,
  getShortsPipelineStatus,
  extractClipsFromVideo,
} from "../shorts-pipeline-engine";
import {
  getAudienceDrivenTime,
  addHumanMicroDelay,
  calculateDailyPostBudget,
} from "../human-behavior-engine";

export function registerClipRoutes(app: Express) {
  app.get("/api/clips/backlog", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const clips = await storage.getContentClips(userId);
      const scheduled = await db
        .select()
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.type, "auto-clip"),
          ),
        )
        .orderBy(desc(autopilotQueue.scheduledAt));

      const scheduledClipIds = new Set(
        scheduled
          .map((s: any) => (s.metadata as any)?.clipId)
          .filter(Boolean),
      );

      const enriched = clips.map((clip) => ({
        ...clip,
        isScheduled: scheduledClipIds.has(clip.id),
        scheduledItem: scheduled.find(
          (s: any) => (s.metadata as any)?.clipId === clip.id,
        ),
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[Clips] Backlog error:", err);
      res.status(500).json({ error: "Failed to fetch clip backlog" });
    }
  }));

  app.get("/api/clips/pipeline-status", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getShortsPipelineStatus(userId);
      res.json(status);
    } catch (err) {
      console.error("[Clips] Pipeline status error:", err);
      res.status(500).json({ error: "Failed to fetch pipeline status" });
    }
  }));

  app.post("/api/clips/run-pipeline", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Clip Editor");
    if (!userId) return;
    try {
      const runPipelineSchema = z.object({
        mode: z.enum(["full", "new-only"]).optional().default("full"),
      });
      const parsed = runPipelineSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const mode = parsed.data.mode;
      const result = await startShortsPipeline(userId, mode);

      if (result.status === "already_running") {
        return res.json({
          success: true,
          message: "Pipeline is already running.",
          ...result,
        });
      }

      res.json({
        success: true,
        message: `Clip pipeline started! Scanning ${result.totalVideos} videos for clip-worthy moments.`,
        ...result,
      });
    } catch (err) {
      console.error("[Clips] Run pipeline error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to start clip pipeline" });
    }
  }));

  app.post("/api/clips/extract/:videoId", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Clip Extraction");
    if (!userId) return;
    const videoId = parseNumericId(req.params.videoId as string, res, "video ID");
    if (videoId === null) return;
    try {
      const video = await storage.getVideo(videoId);
      if (!video) return res.status(404).json({ error: "Video not found" });
      if (video.channelId) {
        const userChannels = await storage.getChannelsByUser(userId);
        const ownsVideo = userChannels.some((ch) => ch.id === video.channelId);
        if (!ownsVideo) return res.status(403).json({ error: "Not your video" });
      }
      const clips = await extractClipsFromVideo(userId, videoId);
      res.json({
        success: true,
        message: `Extracted ${clips.length} clips from video.`,
        clips,
      });
    } catch (err) {
      console.error("[Clips] Extract error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to extract clips" });
    }
  }));

  app.post("/api/clips/schedule-all", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Clip Scheduling");
    if (!userId) return;
    try {
      const allClips = await storage.getContentClips(userId);
      const pendingClips = allClips.filter((c) => c.status === "pending");

      if (pendingClips.length === 0) {
        return res.json({
          success: true,
          message: "No pending clips to schedule. Run the clip pipeline first.",
          scheduled: 0,
        });
      }

      const existingByPlatform = await db
        .select({
          platform: autopilotQueue.targetPlatform,
          count: sql<number>`count(*)::int`,
        })
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.type, "auto-clip"),
            eq(autopilotQueue.status, "scheduled"),
            gte(autopilotQueue.scheduledAt, new Date()),
          ),
        )
        .groupBy(autopilotQueue.targetPlatform);

      const existingPlatformCounts: Record<string, number> = {};
      let existingCount = 0;
      for (const row of existingByPlatform) {
        existingPlatformCounts[row.platform || "unknown"] = row.count;
        existingCount += row.count;
      }

      const sorted = [...pendingClips].sort(
        (a, b) => (b.optimizationScore || 0) - (a.optimizationScore || 0),
      );

      const platforms = ["youtube", "x", "discord", "twitch", "tiktok"];
      const platformBudgets: Record<string, number> = {};
      for (const p of platforms) {
        platformBudgets[p] = calculateDailyPostBudget(p) * 14;
      }

      const now = new Date();
      const batchValues: any[] = [];
      let scheduled = 0;
      const platformCounts: Record<string, number> = {};
      for (const p of platforms) {
        platformCounts[p] = existingPlatformCounts[p] || 0;
      }

      for (const clip of sorted) {
        let platform = clip.targetPlatform || "youtube";
        if (platform === "kick") platform = "tiktok";
        const mappedPlatform = platforms.includes(platform) ? platform : "youtube";

        const budget = platformBudgets[mappedPlatform] || 14;
        if (platformCounts[mappedPlatform] >= budget) continue;

        let scheduledAt: Date;
        try {
          scheduledAt = await getAudienceDrivenTime({
            platform: mappedPlatform,
            userId,
            contentType: "new-video",
            urgency: "low",
          });
        } catch {
          scheduledAt = new Date(now);
          scheduledAt.setHours(12 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
        }

        const dayOffset = Math.floor(scheduled / platforms.length);
        scheduledAt.setDate(now.getDate() + dayOffset + 1);
        const microDelay = addHumanMicroDelay();
        const finalTime = new Date(scheduledAt.getTime() + microDelay);

        batchValues.push({
          userId,
          sourceVideoId: clip.sourceVideoId,
          type: "auto-clip",
          targetPlatform: mappedPlatform,
          content: clip.title,
          caption: clip.description || clip.title,
          status: "scheduled",
          scheduledAt: finalTime,
          metadata: {
            clipId: clip.id,
            clipStart: clip.startTime,
            clipEnd: clip.endTime,
            style: "human",
            schedulingMethod: "clip-editor-pipeline",
            aiModel: "auto-clip",
            humanScore: 0.95,
            viralScore: clip.optimizationScore,
            hashtags: (clip.metadata as any)?.tags || [],
          },
        });

        platformCounts[mappedPlatform]++;
        scheduled++;
      }

      if (batchValues.length > 0) {
        for (let i = 0; i < batchValues.length; i += 50) {
          await db
            .insert(autopilotQueue)
            .values(batchValues.slice(i, i + 50) as any);
        }
      }

      const scheduledClipIds = batchValues.map(
        (v) => v.metadata.clipId as number,
      );
      if (scheduledClipIds.length > 0) {
        await db
          .update(contentClips)
          .set({ status: "scheduled" })
          .where(
            and(
              eq(contentClips.userId, userId),
              inArray(contentClips.id, scheduledClipIds),
            ),
          );
      }

      res.json({
        success: true,
        message: `Scheduled ${scheduled} clips across ${Object.keys(platformCounts).length} platforms over the next 14 days.`,
        scheduled,
        platformBreakdown: platformCounts,
        existingScheduled: existingCount,
      });
    } catch (err) {
      console.error("[Clips] Schedule all error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to schedule clips" });
    }
  }));

  app.post("/api/clips/:clipId/schedule", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "Clip Scheduling");
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;
    try {
      const clips = await storage.getContentClips(userId);
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return res.status(404).json({ error: "Clip not found" });

      const scheduleSchema = z.object({
        platform: z.string().min(1).max(50).optional(),
        scheduleAt: z.string().optional(),
      });
      const parsedBody = scheduleSchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid input", details: parsedBody.error.flatten() });
      }
      const VIDEO_ONLY = ["tiktok", "kick"];
      let platform = parsedBody.data.platform || clip.targetPlatform || "youtube";
      if (VIDEO_ONLY.includes(platform)) platform = "youtube";

      let scheduledAt: Date;
      try {
        scheduledAt = await getAudienceDrivenTime({
          platform,
          userId,
          contentType: "new-video",
          urgency: "low",
        });
      } catch {
        scheduledAt = new Date();
        scheduledAt.setDate(scheduledAt.getDate() + 1);
        scheduledAt.setHours(14, 0, 0, 0);
      }

      const microDelay = addHumanMicroDelay();
      const finalTime = new Date(scheduledAt.getTime() + microDelay);

      const [queued] = await db
        .insert(autopilotQueue)
        .values({
          userId,
          sourceVideoId: clip.sourceVideoId,
          type: "auto-clip",
          targetPlatform: platform,
          content: clip.title,
          caption: clip.description || clip.title,
          status: "scheduled",
          scheduledAt: finalTime,
          metadata: {
            clipId: clip.id,
            clipStart: clip.startTime,
            clipEnd: clip.endTime,
            style: "human",
            schedulingMethod: "clip-editor-single",
            aiModel: "auto-clip",
            humanScore: 0.95,
            viralScore: clip.optimizationScore,
          },
        } as any)
        .returning();

      await storage.updateContentClip(clipId, { status: "scheduled" });

      res.json({
        success: true,
        message: `Clip scheduled for ${platform} at ${finalTime.toISOString()}.`,
        queueItem: queued,
      });
    } catch (err) {
      console.error("[Clips] Schedule single error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to schedule clip" });
    }
  }));

  app.delete("/api/clips/:clipId", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;
    try {
      const clips = await storage.getContentClips(userId);
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return res.status(404).json({ error: "Clip not found" });

      await db.delete(contentClips).where(eq(contentClips.id, clipId));
      res.json({ success: true });
    } catch (err) {
      console.error("[Clips] Delete error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to delete clip" });
    }
  }));

  app.get("/api/clips/stats", asyncHandler(async (req: any, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const allClips = await storage.getContentClips(userId);
      const scheduled = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.type, "auto-clip"),
            eq(autopilotQueue.status, "scheduled"),
            gte(autopilotQueue.scheduledAt, new Date()),
          ),
        );

      const pending = allClips.filter((c) => c.status === "pending").length;
      const scheduledCount = allClips.filter((c) => c.status === "scheduled").length;
      const published = allClips.filter((c) => c.status === "published").length;
      const avgScore =
        allClips.length > 0
          ? Math.round(
              allClips.reduce((s, c) => s + (c.optimizationScore || 0), 0) /
                allClips.length,
            )
          : 0;

      const platformBreakdown: Record<string, number> = {};
      for (const c of allClips) {
        const p = c.targetPlatform || "unknown";
        platformBreakdown[p] = (platformBreakdown[p] || 0) + 1;
      }

      res.json({
        total: allClips.length,
        pending,
        scheduled: scheduledCount,
        published,
        avgViralScore: avgScore,
        queuedInAutopilot: scheduled[0]?.count || 0,
        platformBreakdown,
      });
    } catch (err) {
      console.error("[Clips] Stats error:", err);
      res.status(500).json({ error: "Failed to fetch clip stats" });
    }
  }));

  app.post("/api/clips/:clipId/publish-tiktok", asyncHandler(async (req: any, res) => {
    const userId = await requireTier(req, res, "pro", "TikTok Publishing");
    if (!userId) return;
    const clipId = parseNumericId(req.params.clipId as string, res, "clip ID");
    if (clipId === null) return;

    try {
      const clips = await storage.getContentClips(userId);
      const clip = clips.find(c => c.id === clipId);
      if (!clip) return res.status(404).json({ error: "Clip not found" });

      const { publishClipToTikTok } = await import("../tiktok-publisher");

      const caption = clip.description || clip.title;
      const result = await publishClipToTikTok(clipId, userId, caption);

      if (result.success) {
        await db.update(contentClips)
          .set({ status: "published", publishedAt: new Date() })
          .where(and(eq(contentClips.id, clipId), eq(contentClips.userId, userId)));
      }

      res.json(result);
    } catch (err: any) {
      console.error("[Clips] TikTok publish error:", err);
      res.status(500).json({ error: err.message || "Failed to publish clip to TikTok" });
    }
  }));
}
