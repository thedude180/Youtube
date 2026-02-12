import type { Express, Request, Response } from "express";
import { db } from "../db";
import { autopilotQueue, commentResponses, autopilotConfig } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getAutopilotStats,
  getAutopilotActivity,
  updateAutopilotFeatureConfig,
  processNewVideoUpload,
  processCommentResponses,
  processContentRecycling,
} from "../autopilot-engine";
import { getUserId } from "./helpers";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

export function registerAutopilotRoutes(app: Express) {
  app.get("/api/autopilot/stats", async (req, res) => {
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activity = await getAutopilotActivity(userId, limit);
      res.json(activity);
    } catch (err) {
      console.error("[Autopilot] Activity error:", err);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/api/autopilot/queue", async (req, res) => {
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { feature, enabled, settings } = req.body;
      const validFeatures = ["auto-clip", "smart-schedule", "comment-responder", "discord-announce", "content-recycler"];
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
    const userId = requireAuth(req, res);
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
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      await processCommentResponses(userId);
      res.json({ success: true, message: "Comment responder triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger comment responder" });
    }
  });

  app.post("/api/autopilot/trigger/recycle", async (req, res) => {
    const userId = requireAuth(req, res);
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
      const id = parseInt(req.params.id);
      await db.delete(autopilotQueue)
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete queue item" });
    }
  });

  app.post("/api/autopilot/queue/:id/publish-now", async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(autopilotQueue)
        .set({ status: "published", publishedAt: new Date() })
        .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to publish" });
    }
  });
}
