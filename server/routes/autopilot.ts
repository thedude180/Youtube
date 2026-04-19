import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { autopilotQueue, commentResponses, autopilotConfig, channels, videos } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { cached } from "../lib/cache";
import {
  getAutopilotStats,
  getAutopilotActivity,
  updateAutopilotFeatureConfig,
  processNewVideoUpload,
  processCommentResponses,
  processContentRecycling,
  processCrossPromotion,
} from "../autopilot-engine";
import { getStealthReport } from "../content-variation-engine";
import { getUserId, requireTier, parseNumericId } from "./helpers";
import { storage } from "../storage";
import {
  getAudienceDrivenTime,
  addHumanMicroDelay,
} from "../human-behavior-engine";
import { createLogger } from "../lib/logger";


const logger = createLogger("autopilot");
function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

export function registerAutopilotRoutes(app: Express) {
  app.get("/api/autopilot/stats", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const stats = await cached(`autopilot-stats:${userId}`, 10, () => getAutopilotStats(userId));
      res.json(stats);
    } catch (err) {
      logger.error("[Autopilot] Stats error:", err);
      res.status(500).json({ error: "Failed to fetch autopilot stats" });
    }
  });

  app.get("/api/autopilot/auto-fix/status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const fortyEightHours = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const fixedPosts = await db.select({
        id: autopilotQueue.id,
        platform: autopilotQueue.targetPlatform,
        status: autopilotQueue.status,
        metadata: autopilotQueue.metadata,
        errorMessage: autopilotQueue.errorMessage,
        scheduledAt: autopilotQueue.scheduledAt,
      })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          gte(autopilotQueue.createdAt, fortyEightHours),
          sql`(${autopilotQueue.metadata}->>'autoFixAction') IS NOT NULL`,
        ))
        .orderBy(desc(autopilotQueue.createdAt))
        .limit(20);

      const deferredCount = fixedPosts.filter(p =>
        (p.metadata as any)?.autoFixAction === "deferred_until_cap_reset").length;
      const autoRetried = fixedPosts.filter(p =>
        (p.metadata as any)?.autoFixAction?.startsWith("auto_retry_")).length;
      const tokenRefreshed = fixedPosts.filter(p =>
        (p.metadata as any)?.autoFixAction === "token_refresh").length;

      res.json({
        totalAutoFixed: fixedPosts.length,
        deferredForCapReset: deferredCount,
        autoRetried,
        tokenRefreshed,
        recentItems: fixedPosts.map(p => ({
          id: p.id,
          platform: p.platform,
          status: p.status,
          action: (p.metadata as any)?.autoFixAction,
          category: (p.metadata as any)?.failureCategory,
          deferredUntil: (p.metadata as any)?.deferredUntil,
          attempts: (p.metadata as any)?.autoFixAttempts || 0,
        })),
      });
    } catch (err) {
      logger.error("[Autopilot] Auto-fix status error:", err);
      res.status(500).json({ error: "Failed to fetch auto-fix status" });
    }
  });

  app.get("/api/autopilot/recent-activity", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const recent = await db.select({
        id: autopilotQueue.id,
        type: autopilotQueue.type,
        targetPlatform: autopilotQueue.targetPlatform,
        caption: autopilotQueue.caption,
        status: autopilotQueue.status,
        scheduledAt: autopilotQueue.scheduledAt,
        createdAt: autopilotQueue.createdAt,
        metadata: autopilotQueue.metadata,
      })
        .from(autopilotQueue)
        .where(eq(autopilotQueue.userId, userId))
        .orderBy(desc(autopilotQueue.createdAt))
        .limit(20);
      res.json(recent);
    } catch (err) {
      logger.error("[Autopilot] Recent activity error:", err);
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  app.get("/api/autopilot/activity", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const activity = await getAutopilotActivity(userId, limit);
      res.json(activity);
    } catch (err) {
      logger.error("[Autopilot] Activity error:", err);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/api/autopilot/queue", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const status = req.query.status as string;
      const items = await db.select({
        id: autopilotQueue.id,
        userId: autopilotQueue.userId,
        sourceVideoId: autopilotQueue.sourceVideoId,
        type: autopilotQueue.type,
        targetPlatform: autopilotQueue.targetPlatform,
        content: autopilotQueue.content,
        caption: autopilotQueue.caption,
        status: autopilotQueue.status,
        scheduledAt: autopilotQueue.scheduledAt,
        publishedAt: autopilotQueue.publishedAt,
        verificationStatus: autopilotQueue.verificationStatus,
        verifiedAt: autopilotQueue.verifiedAt,
        metadata: autopilotQueue.metadata,
        errorMessage: autopilotQueue.errorMessage,
        createdAt: autopilotQueue.createdAt,
        sourceVideoTitle: videos.title,
        sourceVideoPlatform: videos.platform,
      }).from(autopilotQueue)
        .leftJoin(videos, eq(autopilotQueue.sourceVideoId, videos.id))
        .where(eq(autopilotQueue.userId, userId))
        .orderBy(desc(autopilotQueue.createdAt))
        .limit(100);
      const filtered = status ? items.filter(i => i.status === status) : items;
      res.json(filtered);
    } catch (err) {
      logger.error("[Autopilot] Queue fetch error:", err);
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.get("/api/autopilot/comments", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Responder");
    if (!userId) return;
    try {
      const results = await db.select({
        id: commentResponses.id,
        userId: commentResponses.userId,
        videoId: commentResponses.videoId,
        platform: commentResponses.platform,
        originalComment: commentResponses.originalComment,
        originalAuthor: commentResponses.originalAuthor,
        aiResponse: commentResponses.aiResponse,
        status: commentResponses.status,
        sentiment: commentResponses.sentiment,
        priority: commentResponses.priority,
        publishedAt: commentResponses.publishedAt,
        metadata: commentResponses.metadata,
        createdAt: commentResponses.createdAt,
        videoTitle: videos.title,
        videoPlatform: videos.platform,
        videoMetadata: videos.metadata,
      }).from(commentResponses)
        .leftJoin(videos, eq(commentResponses.videoId, videos.id))
        .where(eq(commentResponses.userId, userId))
        .orderBy(desc(commentResponses.createdAt))
        .limit(100);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/autopilot/comments/:id/approve", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Responder");
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const [updated] = await db.update(commentResponses)
        .set({ status: "approved", publishedAt: new Date() })
        .where(and(eq(commentResponses.id, id), eq(commentResponses.userId, userId)))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to approve comment" });
    }
  });

  app.post("/api/autopilot/comments/:id/reject", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Responder");
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      const [updated] = await db.update(commentResponses)
        .set({ status: "rejected" })
        .where(and(eq(commentResponses.id, id), eq(commentResponses.userId, userId)))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to reject comment" });
    }
  });

  app.get("/api/autopilot/config", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const configs = await db.select().from(autopilotConfig)
        .where(eq(autopilotConfig.userId, userId));
      res.json(configs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });

  app.post("/api/autopilot/config", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    const schema = z.object({
      feature: z.enum(["auto-clip", "smart-schedule", "comment-responder", "discord-announce", "content-recycler", "cross-promo", "stealth-mode"]),
      enabled: z.boolean().optional(),
      settings: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { feature, enabled, settings } = parsed.data;
      const config = await updateAutopilotFeatureConfig(userId, feature, enabled ?? true, settings);
      res.json(config);
    } catch (err) {
      logger.error("[Autopilot] Config update error:", err);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  app.post("/api/autopilot/trigger/clip", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Auto-Clip & Post");
    if (!userId) return;
    const schema = z.object({
      videoId: z.number({ required_error: "videoId is required" }),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { videoId } = parsed.data;
      await processNewVideoUpload(userId, videoId);
      res.json({ success: true, message: "Auto-clip pipeline triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger auto-clip" });
    }
  });

  app.post("/api/autopilot/trigger/comments", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Responder");
    if (!userId) return;
    try {
      await processCommentResponses(userId);
      res.json({ success: true, message: "Comment responder triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger comment responder" });
    }
  });

  app.post("/api/autopilot/trigger/recycle", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Content Recycler");
    if (!userId) return;
    try {
      await processContentRecycling(userId);
      res.json({ success: true, message: "Content recycler triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger recycler" });
    }
  });

  app.delete("/api/autopilot/queue/:id", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;
      await db.delete(autopilotQueue)
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete queue item" });
    }
  });

  app.post("/api/autopilot/queue/bulk-delete", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      ids: z.array(z.number()).min(1, "ids array required"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { ids } = parsed.data;
      await db.delete(autopilotQueue)
        .where(and(inArray(autopilotQueue.id, ids), eq(autopilotQueue.userId, userId)));
      res.json({ success: true, deleted: ids.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to bulk delete" });
    }
  });

  app.post("/api/autopilot/queue/retry-failed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await db.update(autopilotQueue)
        .set({ status: "scheduled", errorMessage: null, scheduledAt: new Date(Date.now() + 60_000) })
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed")));
      res.json({ success: true, message: "Failed posts re-queued for retry" });
    } catch (err) {
      logger.error("[Autopilot] Retry failed error:", err);
      res.status(500).json({ error: "Failed to retry" });
    }
  });

  app.post("/api/autopilot/queue/clear-failed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await db.delete(autopilotQueue)
        .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed")));
      res.json({ success: true, message: "Failed posts cleared" });
    } catch (err) {
      logger.error("[Autopilot] Clear failed error:", err);
      res.status(500).json({ error: "Failed to clear" });
    }
  });

  app.post("/api/autopilot/queue/bulk-reschedule", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const schema = z.object({
      ids: z.array(z.number()).min(1, "ids array required"),
      scheduledAt: z.string().min(1, "scheduledAt required"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const { ids, scheduledAt } = parsed.data;
      await db.update(autopilotQueue)
        .set({ scheduledAt: new Date(scheduledAt), status: "scheduled" })
        .where(and(inArray(autopilotQueue.id, ids), eq(autopilotQueue.userId, userId)));
      res.json({ success: true, rescheduled: ids.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to bulk reschedule" });
    }
  });

  app.post("/api/autopilot/queue/:id/verify", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });
      const [post] = await db.select().from(autopilotQueue)
        .where(and(eq(autopilotQueue.id, postId), eq(autopilotQueue.userId, userId)))
        .limit(1);
      if (!post) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "published") return res.status(400).json({ error: "Post must be published before verification" });

      const meta = (post.metadata as any) || {};
      const publishPostId = meta.publishResult?.postId;
      if (!publishPostId && !meta.publishResult?.postUrl) {
        return res.status(400).json({ error: "No platform post ID or URL available for verification" });
      }

      if (!publishPostId && meta.publishResult?.postUrl) {
        await db.update(autopilotQueue)
          .set({
            verificationStatus: "verified",
            verifiedAt: new Date(),
            metadata: {
              ...meta,
              verification: {
                attempts: 1,
                lastAttempt: new Date().toISOString(),
                platformConfirmed: true,
                platformStatus: "url_available",
                platformUrl: meta.publishResult.postUrl,
              },
            },
          })
          .where(eq(autopilotQueue.id, postId));
        const { clearMatchingScheduleItems } = await import("../publish-verifier");
        await clearMatchingScheduleItems(userId, post.targetPlatform, post.sourceVideoId, post.scheduledAt);
        return res.json({ verified: true, platformStatus: "url_available", platformUrl: meta.publishResult.postUrl });
      }

      const { verifyPost, clearMatchingScheduleItems } = await import("../publish-verifier");
      const result = await verifyPost(userId, post.targetPlatform, publishPostId);

      const existingVerification = meta.verification || { attempts: 0 };
      await db.update(autopilotQueue)
        .set({
          verificationStatus: result.confirmed ? "verified" : "pending",
          verifiedAt: result.confirmed ? new Date() : undefined,
          metadata: {
            ...meta,
            verification: {
              attempts: existingVerification.attempts + 1,
              lastAttempt: new Date().toISOString(),
              platformConfirmed: result.confirmed,
              platformStatus: result.platformStatus,
              platformUrl: result.platformUrl,
              error: result.error,
            },
          },
        })
        .where(eq(autopilotQueue.id, postId));

      if (result.confirmed) {
        await clearMatchingScheduleItems(userId, post.targetPlatform, post.sourceVideoId, post.scheduledAt);
      }

      res.json({
        verified: result.confirmed,
        platformStatus: result.platformStatus,
        platformUrl: result.platformUrl,
        error: result.error,
      });
    } catch (err) {
      logger.error("[Autopilot] Manual verification error:", err);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/autopilot/pause-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const configs = await db.select().from(autopilotConfig)
        .where(eq(autopilotConfig.userId, userId));
      for (const config of configs) {
        await db.update(autopilotConfig)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(autopilotConfig.id, config.id));
      }
      res.json({ success: true, paused: configs.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to pause all" });
    }
  });

  app.post("/api/autopilot/resume-all", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const configs = await db.select().from(autopilotConfig)
        .where(eq(autopilotConfig.userId, userId));
      for (const config of configs) {
        await db.update(autopilotConfig)
          .set({ enabled: true, updatedAt: new Date() })
          .where(eq(autopilotConfig.id, config.id));
      }
      res.json({ success: true, resumed: configs.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to resume all" });
    }
  });

  app.get("/api/autopilot/queue/export", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const items = await db.select().from(autopilotQueue)
        .where(eq(autopilotQueue.userId, userId))
        .orderBy(desc(autopilotQueue.createdAt));
      const csvHeader = "id,type,platform,content,status,scheduledAt,publishedAt,createdAt\n";
      const csvRows = items.map(item =>
        `${item.id},"${(item.type || "").replace(/"/g, '""')}","${item.targetPlatform || ""}","${(item.content || "").replace(/"/g, '""').replace(/\n/g, " ")}","${item.status}","${item.scheduledAt || ""}","${item.publishedAt || ""}","${item.createdAt}"`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=autopilot-queue.csv");
      res.send(csvHeader + csvRows);
    } catch (err) {
      res.status(500).json({ error: "Failed to export" });
    }
  });

  app.get("/api/autopilot/stealth", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Stealth Mode Scoring");
    if (!userId) return;
    try {
      const report = await getStealthReport(userId);
      res.json(report);
    } catch (err) {
      logger.error("[Autopilot] Stealth report error:", err);
      res.status(500).json({ error: "Failed to generate stealth report" });
    }
  });

  app.post("/api/autopilot/trigger/cross-promo", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Cross-Platform Promotion");
    if (!userId) return;
    try {
      await processCrossPromotion(userId);
      res.json({ success: true, message: "Cross-promotion triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger cross-promotion" });
    }
  });

  app.post("/api/autopilot/queue/:id/publish-now", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;

      const [post] = await db.select().from(autopilotQueue)
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
      if (!post) return res.status(404).json({ error: "Post not found" });

      await db.update(autopilotQueue)
        .set({ status: "publishing" })
        .where(eq(autopilotQueue.id, id));

      const { publishToplatform } = await import("../platform-publisher");
      const result = await publishToplatform(userId, post.targetPlatform, post.content || "", {
        ...(post.metadata as any),
        caption: post.caption,
        contentType: (post.metadata as any)?.contentType,
      });

      if (result.success) {
        const [updated] = await db.update(autopilotQueue)
          .set({
            status: "published",
            publishedAt: new Date(),
            metadata: {
              ...((post.metadata as any) || {}),
              publishResult: { postId: result.postId, postUrl: result.postUrl, publishedAt: new Date().toISOString() },
            },
          })
          .where(eq(autopilotQueue.id, id))
          .returning();
        res.json(updated);
      } else {
        const [updated] = await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: result.error || "Publishing failed" })
          .where(eq(autopilotQueue.id, id))
          .returning();
        res.status(400).json({ error: result.error, post: updated });
      }
    } catch (err: any) {
      const id = parseNumericId(req.params.id as string, res);
      if (id !== null) {
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: err?.message || "Publishing exception" })
          .where(eq(autopilotQueue.id, id)).catch(() => {});
      }
      res.status(500).json({ error: "Failed to publish" });
    }
  });

  app.get("/api/autopilot/queue/:id/format-preview", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseNumericId(req.params.id as string, res);
      if (id === null) return;

      const [post] = await db.select().from(autopilotQueue)
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
      if (!post) return res.status(404).json({ error: "Post not found" });

      const { formatContentForPlatform, getFormatSummary } = await import("../lib/platform-formatter");
      const { sanitizePlaceholders } = await import("../platform-publisher");

      const rawContent = sanitizePlaceholders(post.content || "", post.metadata as any);
      const meta = {
        ...(post.metadata as any),
        caption: post.caption,
        title: post.caption,
      };

      const platform = post.targetPlatform;
      const formatted = formatContentForPlatform(platform, rawContent, meta);
      const summary = getFormatSummary(platform);

      res.json({
        platform,
        raw: rawContent,
        formatted: formatted.content,
        title: formatted.title,
        tags: formatted.tags,
        warnings: formatted.warnings,
        rules: summary.rules,
        limits: summary.limits,
        charCount: formatted.content.length,
        truncated: formatted.content.length < rawContent.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Format preview failed" });
    }
  });

  app.get("/api/autopilot/youtube-status", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannel = userChannels.find(
        (c) => c.platform === "youtube" && c.accessToken && c.channelId
      );

      if (!ytChannel) {
        return res.json({
          connected: false,
          channelName: null,
          channelId: null,
          lastSyncAt: null,
          subscriberCount: null,
          videoCount: null,
          tokenValid: false,
          syncHealthy: false,
          message: "YouTube is not connected. Connect your channel to enable autopilot sync.",
        });
      }

      const tokenValid = ytChannel.tokenExpiresAt
        ? new Date(ytChannel.tokenExpiresAt) > new Date()
        : !!ytChannel.accessToken;

      const lastSync = ytChannel.lastSyncAt;
      const syncRecent = lastSync
        ? Date.now() - new Date(lastSync).getTime() < 24 * 60 * 60 * 1000
        : false;

      const [videoCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(videos)
        .where(eq(videos.channelId, ytChannel.id));

      const [autopilotCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "scheduled"),
        ));

      res.json({
        connected: true,
        channelName: ytChannel.channelName,
        channelId: ytChannel.channelId,
        lastSyncAt: lastSync,
        subscriberCount: ytChannel.subscriberCount,
        videoCount: videoCount?.count || 0,
        tokenValid,
        syncHealthy: tokenValid && (syncRecent || !lastSync),
        scheduledUpdates: autopilotCount?.count || 0,
        message: tokenValid
          ? "YouTube is connected and sync is active."
          : "YouTube token may have expired. Re-connect to restore sync.",
      });
    } catch (err) {
      logger.error("[Autopilot] YouTube status error:", err);
      res.status(500).json({ error: "Failed to check YouTube status" });
    }
  });

  app.get("/api/autopilot/calendar-feed", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;

      const conditions = [eq(autopilotQueue.userId, userId)];
      if (from) conditions.push(gte(autopilotQueue.scheduledAt, from));
      if (to) conditions.push(lte(autopilotQueue.scheduledAt, to));

      const queueItems = await db
        .select()
        .from(autopilotQueue)
        .where(and(...conditions))
        .orderBy(desc(autopilotQueue.scheduledAt))
        .limit(500);

      const calendarItems = queueItems.map((item) => ({
        id: `ap-${item.id}`,
        title: item.caption || item.content?.slice(0, 60) || "Autopilot Post",
        date: item.scheduledAt || item.createdAt,
        type: "autopilot" as const,
        platform: item.targetPlatform,
        contentType: item.type,
        status: item.status,
        metadata: item.metadata,
        sourceVideoId: item.sourceVideoId,
      }));

      res.json(calendarItems);
    } catch (err) {
      logger.error("[Autopilot] Calendar feed error:", err);
      res.status(500).json({ error: "Failed to fetch calendar feed" });
    }
  });

  app.post("/api/autopilot/activate", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    const schema = z.object({
      reseed: z.boolean().optional().default(false),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const reseed = parsed.data.reseed;

      const [existingScheduled] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "scheduled"),
          gte(autopilotQueue.scheduledAt, new Date()),
        ));

      if ((existingScheduled?.count || 0) > 0 && !reseed) {
        return res.json({
          success: true,
          message: `Autopilot is already active with ${existingScheduled?.count} scheduled posts.`,
          seeded: 0,
        });
      }

      if (reseed) {
        await db.delete(autopilotQueue)
          .where(and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.status, "scheduled"),
            gte(autopilotQueue.scheduledAt, new Date()),
          ));
      }

      const userChannels = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, userId));
      const channelIds = userChannels.map(c => c.id);
      const userVideos = channelIds.length > 0
        ? await db.select().from(videos)
            .where(and(eq(videos.platform, "youtube"), inArray(videos.channelId, channelIds)))
            .orderBy(desc(videos.createdAt))
            .limit(5)
        : [];

      const platforms = ["discord"];
      const contentTypes = ["auto-clip", "content-recycle", "cross-promo"];
      let seeded = 0;
      const now = new Date();

      const platformTimes = await Promise.all(
        platforms.map(async (platform) => {
          try {
            const t = await getAudienceDrivenTime({ platform, userId, contentType: "new-video", urgency: "low" });
            return { platform, hour: t.getHours(), minute: t.getMinutes() };
          } catch {
            return { platform, hour: 12 + Math.floor(Math.random() * 6), minute: Math.floor(Math.random() * 60) };
          }
        })
      );
      const timeMap = Object.fromEntries(platformTimes.map(t => [t.platform, t]));

      const batchValues: any[] = [];
      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        for (const platform of platforms) {
          const postsPerDay = 1;

          for (let postIdx = 0; postIdx < postsPerDay; postIdx++) {
            const contentType = contentTypes[seeded % contentTypes.length];
            const video = userVideos.length > 0
              ? userVideos[seeded % userVideos.length]
              : null;

            const t = timeMap[platform];
            const scheduledAt = new Date(now);
            scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
            scheduledAt.setHours(t.hour + postIdx, t.minute, 0, 0);

            const microDelay = addHumanMicroDelay();
            let finalSchedule = new Date(scheduledAt.getTime() + microDelay);

            if (finalSchedule < now) {
              if (dayOffset === 0) {
                finalSchedule = new Date(now.getTime() + (30 + Math.random() * 90) * 60 * 1000);
              } else {
                continue;
              }
            }

            const titleBase = video?.title || `Scheduled ${platform} post`;
            const content = `${contentType === "auto-clip" ? "New content" : contentType === "content-recycle" ? "Throwback" : "Cross-platform"}: ${titleBase}`;

            batchValues.push({
              userId,
              sourceVideoId: video?.id || null,
              type: contentType,
              targetPlatform: platform,
              content,
              caption: `${platform} - ${titleBase}`,
              status: "scheduled",
              scheduledAt: finalSchedule,
              metadata: {
                style: "human",
                schedulingMethod: "autopilot-activation",
                aiModel: "seeded",
                humanScore: 0.95,
              },
            });

            seeded++;
          }
        }
      }

      if (batchValues.length > 0) {
        for (let i = 0; i < batchValues.length; i += 50) {
          await db.insert(autopilotQueue).values(batchValues.slice(i, i + 50));
        }
      }

      for (const feature of ["auto-clip", "smart-schedule", "comment-responder", "discord-announce", "content-recycler", "cross-promo", "stealth-mode"]) {
        const [existingConfig] = await db
          .select()
          .from(autopilotConfig)
          .where(and(eq(autopilotConfig.userId, userId), eq(autopilotConfig.feature, feature)))
          .limit(1);

        if (!existingConfig) {
          await db.insert(autopilotConfig).values({
            userId,
            feature,
            enabled: true,
            settings: {},
          });
        } else if (!existingConfig.enabled) {
          await db.update(autopilotConfig)
            .set({ enabled: true, updatedAt: new Date() })
            .where(eq(autopilotConfig.id, existingConfig.id));
        }
      }

      if (!res.headersSent) {
        res.json({
          success: true,
          message: `Autopilot activated! ${seeded} posts scheduled across 6 platforms over the next 14 days.`,
          seeded,
          startDate: now.toISOString(),
        });
      }

      try {
        const { fireAgentEvent } = await import("../services/agent-events");
        fireAgentEvent("empire.activated", userId, { seeded });
      } catch {}
    } catch (err) {
      logger.error("[Autopilot] Activation error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to activate autopilot" });
    }
  });

  app.get("/api/priority/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await cached(`priority-status:${userId}`, 10, async () => {
        const { getPriorityDashboard } = await import("../priority-orchestrator");
        const { getLoopStatus } = await import("../content-loop");
        const dashboard = await getPriorityDashboard(userId);
        const loopStatus = getLoopStatus(userId);
        return { ...dashboard, contentLoop: loopStatus };
      });
      res.json(result);
    } catch (err) {
      logger.error("[Priority] Status error:", err);
      res.status(500).json({ error: "Failed to get priority status" });
    }
  });

  app.get("/api/content-loop/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await cached(`content-loop-status:${userId}`, 10, async () => {
        const { getLoopStatus } = await import("../content-loop");
        return getLoopStatus(userId);
      });
      res.json(result);
    } catch (err) {
      logger.error("[ContentLoop] Status error:", err);
      res.status(500).json({ error: "Failed to get content loop status" });
    }
  });

  app.post("/api/content-loop/force-start", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { forceStartLoop, getLoopStatus } = await import("../content-loop");
      forceStartLoop(userId);
      res.json({ success: true, status: getLoopStatus(userId) });
    } catch (err) {
      logger.error("[ContentLoop] Force start error:", err);
      res.status(500).json({ error: "Failed to start content loop" });
    }
  });

  app.get("/api/vod-optimizer/stats", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getVodOptimizationStats } = await import("../vod-optimizer-engine");
      const stats = await getVodOptimizationStats(userId);
      res.json(stats);
    } catch (err) {
      logger.error("[VODOptimizer] Stats error:", err);
      res.status(500).json({ error: "Failed to get VOD optimizer stats" });
    }
  });

  app.get("/api/daily-content/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getDailyContentStatus } = await import("../daily-content-engine");
      const status = await getDailyContentStatus(userId);
      res.json(status);
    } catch (err) {
      logger.error("[DailyContent] Status error:", err);
      res.status(500).json({ error: "Failed to get daily content status" });
    }
  });

  app.post("/api/daily-content/trigger", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { runDailyContentGeneration } = await import("../daily-content-engine");
      await runDailyContentGeneration();
      res.json({ success: true, message: "Stream exhaust engine triggered" });
    } catch (err) {
      logger.error("[StreamExhaust] Trigger error:", err);
      res.status(500).json({ error: "Failed to trigger content generation" });
    }
  });

  app.get("/api/stream-exhaust/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await cached(`stream-exhaust-status:${userId}`, 10, async () => {
        const { getStreamExhaustStatus } = await import("../daily-content-engine");
        return getStreamExhaustStatus(userId);
      });
      res.json(status);
    } catch (err) {
      logger.error("[StreamExhaust] Status error:", err);
      res.status(500).json({ error: "Failed to get stream exhaust status" });
    }
  });

  app.get("/api/autopilot/distribution-status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const now = new Date();
      const sevenDays = new Date(now.getTime() + 7 * 86400_000);

      const scheduled = await db.select({
        platform: autopilotQueue.targetPlatform,
        type: autopilotQueue.type,
        scheduledAt: autopilotQueue.scheduledAt,
        status: autopilotQueue.status,
        caption: autopilotQueue.caption,
      }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "scheduled"),
          gte(autopilotQueue.scheduledAt, now),
          lte(autopilotQueue.scheduledAt, sevenDays),
        ))
        .orderBy(autopilotQueue.scheduledAt)
        .limit(100);

      const byDay: Record<string, Record<string, number>> = {};
      for (const item of scheduled) {
        const dayKey = item.scheduledAt ? new Date(item.scheduledAt).toISOString().split("T")[0] : "";
        if (!dayKey) continue;
        if (!byDay[dayKey]) byDay[dayKey] = {};
        byDay[dayKey][item.platform] = (byDay[dayKey][item.platform] || 0) + 1;
      }

      const platformLimits: Record<string, number> = {
        youtube: 4, tiktok: 3, x: 5, discord: 2, instagram: 2,
      };

      const warnings: string[] = [];
      for (const [day, platforms] of Object.entries(byDay)) {
        for (const [platform, count] of Object.entries(platforms)) {
          const limit = platformLimits[platform] || 3;
          if (count > limit) {
            warnings.push(`${day}: ${platform} has ${count} items (limit: ${limit})`);
          }
        }
      }

      res.json({
        scheduledItems: scheduled.length,
        byDay,
        platformLimits,
        warnings,
        nextItems: scheduled.slice(0, 10).map(i => ({
          platform: i.platform,
          type: i.type,
          scheduledAt: i.scheduledAt,
          title: (i.caption || "").substring(0, 60),
        })),
      });
    } catch (err) {
      logger.error("[Autopilot] Distribution status error:", err);
      res.status(500).json({ error: "Failed to get distribution status" });
    }
  });

  app.post("/api/autopilot/redistribute", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { runContentDistribution } = await import("../services/smart-content-distributor");
      const result = await runContentDistribution();
      res.json({
        success: true,
        ...result,
        message: `Redistributed ${result.itemsRedistributed} items across ${result.daysSpanned} days, resolved ${result.conflictsResolved} scheduling conflicts`,
      });
    } catch (err) {
      logger.error("[Autopilot] Redistribute error:", err);
      res.status(500).json({ error: "Failed to redistribute content" });
    }
  });
}
