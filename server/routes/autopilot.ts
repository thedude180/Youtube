import type { Express, Request, Response } from "express";
import { db } from "../db";
import { autopilotQueue, commentResponses, autopilotConfig, channels, videos } from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
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
      const stats = await getAutopilotStats(userId);
      res.json(stats);
    } catch (err) {
      console.error("[Autopilot] Stats error:", err);
      res.status(500).json({ error: "Failed to fetch autopilot stats" });
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
      console.error("[Autopilot] Activity error:", err);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/api/autopilot/queue", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const status = req.query.status as string;
      let query = db.select().from(autopilotQueue)
        .where(eq(autopilotQueue.userId, userId))
        .orderBy(desc(autopilotQueue.createdAt))
        .limit(100);
      const items = await query;
      const filtered = status ? items.filter(i => i.status === status) : items;
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.get("/api/autopilot/comments", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "AI Comment Responder");
    if (!userId) return;
    try {
      const comments = await db.select().from(commentResponses)
        .where(eq(commentResponses.userId, userId))
        .orderBy(desc(commentResponses.createdAt))
        .limit(100);
      res.json(comments);
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
    try {
      const { feature, enabled, settings } = req.body;
      const validFeatures = ["auto-clip", "smart-schedule", "comment-responder", "discord-announce", "content-recycler", "cross-promo", "stealth-mode"];
      if (!feature || !validFeatures.includes(feature)) return res.status(400).json({ error: "Invalid feature" });
      if (typeof enabled !== "boolean" && enabled !== undefined) return res.status(400).json({ error: "enabled must be boolean" });
      const config = await updateAutopilotFeatureConfig(userId, feature, enabled ?? true, settings);
      res.json(config);
    } catch (err) {
      console.error("[Autopilot] Config update error:", err);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  app.post("/api/autopilot/trigger/clip", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Auto-Clip & Post");
    if (!userId) return;
    try {
      const { videoId } = req.body;
      if (!videoId) return res.status(400).json({ error: "videoId is required" });
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

  app.get("/api/autopilot/stealth", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Stealth Mode Scoring");
    if (!userId) return;
    try {
      const report = await getStealthReport(userId);
      res.json(report);
    } catch (err) {
      console.error("[Autopilot] Stealth report error:", err);
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
      const [updated] = await db.update(autopilotQueue)
        .set({ status: "published", publishedAt: new Date() })
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to publish" });
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
      console.error("[Autopilot] YouTube status error:", err);
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
      console.error("[Autopilot] Calendar feed error:", err);
      res.status(500).json({ error: "Failed to fetch calendar feed" });
    }
  });

  app.post("/api/autopilot/activate", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Autopilot Dashboard");
    if (!userId) return;
    try {
      const reseed = req.body?.reseed === true;

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
            .where(and(eq(videos.platform, "youtube"), sql`${videos.channelId} = ANY(${channelIds})`))
            .orderBy(desc(videos.createdAt))
            .limit(5)
        : [];

      const platforms = ["youtube", "tiktok", "x", "discord", "twitch", "kick"];
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
          const postsPerDay = platform === "x" ? 2 : 1;

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
          await db.insert(autopilotQueue).values(batchValues.slice(i, i + 50) as any);
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
    } catch (err) {
      console.error("[Autopilot] Activation error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to activate autopilot" });
    }
  });
}
