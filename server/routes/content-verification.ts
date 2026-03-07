import type { Express } from "express";
import { getUserId, requireTier } from "./helpers";
import { cached } from "../lib/cache";

export function registerContentVerificationRoutes(app: Express) {
  app.get("/api/verification/dashboard", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Content Verification");
    if (!userId) return;

    try {
      const { getVerificationDashboard } = await import("../content-verification-engine");
      const dashboard = await cached(`verification-dashboard:${userId}`, 30, () => getVerificationDashboard(userId));
      res.json(dashboard);
    } catch (err) {
      console.error("[Verification] Dashboard error:", err);
      res.status(500).json({ error: "Failed to load verification dashboard" });
    }
  });

  app.get("/api/verification/live-health", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Live Stream Health");
    if (!userId) return;

    try {
      const { verifyLiveStreamHealth } = await import("../content-verification-engine");
      const health = await cached(`live-health:${userId}`, 15, () => verifyLiveStreamHealth(userId));
      res.json({ streams: health });
    } catch (err) {
      console.error("[Verification] Live health error:", err);
      res.status(500).json({ error: "Failed to check live stream health" });
    }
  });

  app.post("/api/verification/check-content/:id", async (req, res) => {
    const userId = await requireTier(req, res, "pro", "Content Verification");
    if (!userId) return;

    const contentId = parseInt(req.params.id);
    if (isNaN(contentId)) return res.status(400).json({ error: "Invalid content ID" });

    try {
      const { verifyPost } = await import("../publish-verifier");
      const { db } = await import("../db");
      const { autopilotQueue } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const [post] = await db.select().from(autopilotQueue)
        .where(and(eq(autopilotQueue.id, contentId), eq(autopilotQueue.userId, userId)))
        .limit(1);

      if (!post) return res.status(404).json({ error: "Content not found" });
      if (post.status !== "published") return res.status(400).json({ error: "Content must be published before verification" });

      const meta = (post.metadata as any) || {};
      const postId = meta.publishResult?.postId;

      if (!postId && !meta.publishResult?.postUrl) {
        return res.status(400).json({ error: "No platform ID available for verification" });
      }

      if (!postId) {
        const { clearMatchingScheduleItems } = await import("../publish-verifier");
        await clearMatchingScheduleItems(userId, post.targetPlatform, post.sourceVideoId, post.scheduledAt);
        return res.json({ verified: true, status: "url_available", url: meta.publishResult?.postUrl });
      }

      const result = await verifyPost(userId, post.targetPlatform, postId);

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
        .where(eq(autopilotQueue.id, post.id));

      if (result.confirmed) {
        const { clearMatchingScheduleItems } = await import("../publish-verifier");
        await clearMatchingScheduleItems(userId, post.targetPlatform, post.sourceVideoId, post.scheduledAt);
      }

      res.json({
        verified: result.confirmed,
        status: result.platformStatus,
        url: result.platformUrl,
        error: result.error,
      });
    } catch (err) {
      console.error("[Verification] Check error:", err);
      res.status(500).json({ error: "Verification check failed" });
    }
  });

  app.post("/api/verification/sweep", async (req, res) => {
    const userId = await requireTier(req, res, "ultimate", "Full Verification Sweep");
    if (!userId) return;

    try {
      const { verifyAllUserContent } = await import("../content-verification-engine");
      const report = await verifyAllUserContent(userId);
      res.json(report);
    } catch (err) {
      console.error("[Verification] Sweep error:", err);
      res.status(500).json({ error: "Verification sweep failed" });
    }
  });
}
