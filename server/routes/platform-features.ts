import { Router } from "express";
import { db } from "../db";
import { platformFeatureEligibility } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { PLATFORM_FEATURES } from "../services/platform-feature-detector";
import { createLogger } from "../lib/logger";
import { runPlatformFeatureDetection } from "../services/platform-feature-detector";

const logger = createLogger("platform-features-routes");

export function registerPlatformFeaturesRoutes(app: any) {
  // GET /api/platform-features
  // Returns all known features enriched with the user's current eligibility status
  app.get("/api/platform-features", async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const rows = await db.select()
        .from(platformFeatureEligibility)
        .where(eq(platformFeatureEligibility.userId, userId))
        .orderBy(desc(platformFeatureEligibility.createdAt));

      // Merge static feature catalogue with live DB state
      const statusMap = new Map(rows.map(r => [r.featureId, r]));
      const features = PLATFORM_FEATURES.map(f => ({
        ...f,
        eligibility: statusMap.get(f.id) ?? null,
      }));

      res.json({ features });
    } catch (err: any) {
      logger.error("GET /api/platform-features", { error: err.message });
      res.status(500).json({ error: "Failed to load platform features" });
    }
  });

  // POST /api/platform-features/:featureId/mark-applied
  // User confirms they submitted an application for a feature
  app.post("/api/platform-features/:featureId/mark-applied", async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { featureId } = req.params;

      const [existing] = await db.select()
        .from(platformFeatureEligibility)
        .where(
          and(
            eq(platformFeatureEligibility.userId, userId),
            eq(platformFeatureEligibility.featureId, featureId),
          )
        )
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Feature not found in your eligibility records" });

      await db.update(platformFeatureEligibility)
        .set({ status: "applied", appliedAt: new Date() })
        .where(eq(platformFeatureEligibility.id, existing.id));

      res.json({ success: true, status: "applied" });
    } catch (err: any) {
      logger.error("POST /api/platform-features/:featureId/mark-applied", { error: err.message });
      res.status(500).json({ error: "Failed to update feature status" });
    }
  });

  // POST /api/platform-features/:featureId/activate
  // Manually mark a feature as active (e.g. user received approval email)
  app.post("/api/platform-features/:featureId/activate", async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { featureId } = req.params;
      const featureDef = PLATFORM_FEATURES.find(f => f.id === featureId);
      if (!featureDef) return res.status(404).json({ error: "Unknown feature" });

      const [existing] = await db.select()
        .from(platformFeatureEligibility)
        .where(
          and(
            eq(platformFeatureEligibility.userId, userId),
            eq(platformFeatureEligibility.featureId, featureId),
          )
        )
        .limit(1);

      if (existing) {
        await db.update(platformFeatureEligibility)
          .set({ status: "active", activatedAt: new Date() })
          .where(eq(platformFeatureEligibility.id, existing.id));
      } else {
        // User manually activating something detector hasn't seen yet
        await db.insert(platformFeatureEligibility).values({
          userId,
          platform: featureDef.platform,
          featureId: featureDef.id,
          featureName: featureDef.name,
          status: "active",
          requiresApplication: featureDef.requiresApplication,
          applicationUrl: featureDef.applicationUrl ?? null,
          activatedAt: new Date(),
          pipelineEffects: featureDef.pipelineEffects,
          lastCheckedAt: new Date(),
        });
      }

      logger.info("Feature manually activated", { userId, featureId });
      res.json({ success: true, status: "active", pipelineEffects: featureDef.pipelineEffects });
    } catch (err: any) {
      logger.error("POST /api/platform-features/:featureId/activate", { error: err.message });
      res.status(500).json({ error: "Failed to activate feature" });
    }
  });

  // POST /api/platform-features/:featureId/dismiss
  // Dismiss a feature notification (not interested)
  app.post("/api/platform-features/:featureId/dismiss", async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { featureId } = req.params;

      await db.update(platformFeatureEligibility)
        .set({ status: "dismissed", dismissedAt: new Date() })
        .where(
          and(
            eq(platformFeatureEligibility.userId, userId),
            eq(platformFeatureEligibility.featureId, featureId),
          )
        );

      res.json({ success: true, status: "dismissed" });
    } catch (err: any) {
      logger.error("POST /api/platform-features/:featureId/dismiss", { error: err.message });
      res.status(500).json({ error: "Failed to dismiss feature" });
    }
  });

  // POST /api/platform-features/scan
  // Manually trigger a detection scan (useful for testing or after adding a channel)
  app.post("/api/platform-features/scan", async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      runPlatformFeatureDetection().catch(() => {});
      res.json({ success: true, message: "Feature scan triggered" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to trigger scan" });
    }
  });
}
