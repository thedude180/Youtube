import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getUserId, requireAuth } from "./helpers";

export function registerDistributionRoutes(app: Express) {
  app.post("/api/distribution/distribute", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({
        platform: z.enum(["youtube", "twitch", "kick", "tiktok", "discord", "rumble", "x"]),
        contentId: z.string().min(1),
        contentType: z.enum(["video", "short", "post", "live"]),
        title: z.string().min(1),
        description: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        hasDisclosure: z.boolean().optional(),
        copyrightCleared: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { distributeContent } = await import("../distribution/platform-adapter");
      const result = await distributeContent({ userId, ...parsed.data });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Distribution failed" });
    }
  });

  app.get("/api/distribution/history", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { getDistributionHistory } = await import("../distribution/platform-adapter");
      const history = await getDistributionHistory(userId, req.query.platform as string | undefined);
      res.json(history);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get history" });
    }
  });

  app.get("/api/distribution/stats", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { getDistributionStats } = await import("../distribution/platform-adapter");
      const stats = await getDistributionStats(userId);
      res.json(stats);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get stats" });
    }
  });

  app.get("/api/distribution/platforms", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { getSupportedPlatforms } = await import("../distribution/platform-adapter");
      res.json({ platforms: getSupportedPlatforms() });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/connection-health", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { getConnectionHealth } = await import("../distribution/connection-health");
      const platform = req.query.platform as string;
      if (!platform) return res.status(400).json({ error: "platform query param required" });
      const health = getConnectionHealth(platform);
      res.json(health);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/brand-recognition", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { scoreBrandConsistency } = await import("../distribution/brand-recognition");
      const result = await scoreBrandConsistency(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/cadence", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeCadence } = await import("../distribution/cadence-intelligence");
      const result = await analyzeCadence(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/cadence-resilience", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { enforceMinimumCadence } = await import("../distribution/cadence-resilience");
      const result = await enforceMinimumCadence(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/content-timing", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const platform = req.query.platform as string || "youtube";
      const { analyzeContentTiming } = await import("../distribution/content-timing");
      const result = await analyzeContentTiming(userId, platform);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/competitor-intel", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeCompetitors } = await import("../distribution/competitor-intelligence");
      const result = await analyzeCompetitors(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/algorithm-relationships", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeAlgorithmRelationships } = await import("../distribution/algorithm-relationship");
      const result = await analyzeAlgorithmRelationships(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/trend-arbitrage", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { findArbitrageOpportunities } = await import("../distribution/trend-arbitrage");
      const result = await findArbitrageOpportunities(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/format-innovation", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeFormatInnovations } = await import("../distribution/format-innovation");
      const result = await analyzeFormatInnovations(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.post("/api/distribution/cultural-sensitivity", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().default(""),
        tags: z.array(z.string()).default([]),
        game: z.string().optional(),
        targetRegions: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { scoreCulturalSensitivity } = await import("../distribution/cultural-intelligence");
      const result = await scoreCulturalSensitivity(userId, parsed.data, parsed.data.targetRegions);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.post("/api/distribution/geopolitical-check", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().default(""),
        tags: z.array(z.string()).default([]),
        game: z.string().optional(),
        targetRegions: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { checkGeopoliticalSafety } = await import("../distribution/geopolitical-safety");
      const result = await checkGeopoliticalSafety(userId, parsed.data, parsed.data.targetRegions);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/platform-independence", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { assessPlatformIndependence } = await import("../distribution/platform-independence");
      const result = await assessPlatformIndependence(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/content-preservation", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { assessContentPreservation } = await import("../distribution/content-preservation");
      const result = await assessContentPreservation(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/data-vault", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { scaffoldDataVault } = await import("../distribution/content-preservation");
      const vault = scaffoldDataVault(userId);
      res.json(vault);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/regulatory-horizon", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { scanRegulatoryHorizon } = await import("../distribution/regulatory-horizon");
      const platforms = req.query.platforms ? (req.query.platforms as string).split(",") : undefined;
      const result = await scanRegulatoryHorizon(userId, platforms);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/global-monetization", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeGlobalMonetization } = await import("../distribution/global-monetization");
      const result = await analyzeGlobalMonetization(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.post("/api/distribution/safety-gate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({
        platform: z.enum(["youtube", "twitch", "kick", "tiktok", "discord", "rumble", "x"]),
        title: z.string().min(1),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        game: z.string().optional(),
        targetRegions: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { runDistributionSafetyGate } = await import("../distribution/distribution-safety-gate");
      const result = await runDistributionSafetyGate({ userId, ...parsed.data });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.post("/api/distribution/cross-platform-packaging", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().default(""),
        tags: z.array(z.string()).default([]),
        game: z.string().optional(),
        platforms: z.array(z.string()).min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      const { packageForAllPlatforms } = await import("../distribution/cross-platform-packaging");
      const result = await packageForAllPlatforms(userId, parsed.data, parsed.data.platforms);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/regional-opportunity", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { analyzeRegionalOpportunities } = await import("../distribution/regional-opportunity");
      const result = await analyzeRegionalOpportunities(userId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  app.get("/api/distribution/summary", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const [stats, platforms] = await Promise.all([
        import("../distribution/platform-adapter").then(m => m.getDistributionStats(userId)),
        import("../distribution/platform-adapter").then(m => m.getSupportedPlatforms()),
      ]);

      let brandScore = 0;
      try { brandScore = (await import("../distribution/brand-recognition").then(m => m.scoreBrandConsistency(userId))).overallScore; } catch {}

      let cadenceSummary = { burnoutRisk: 0, overallHealth: "unknown" };
      try { cadenceSummary = await import("../distribution/cadence-intelligence").then(m => m.analyzeCadence(userId)).then(r => ({ burnoutRisk: r.burnoutRisk, overallHealth: r.burnoutRisk < 0.3 ? "healthy" : r.burnoutRisk < 0.6 ? "moderate" : "at_risk" })); } catch {}

      let regulatoryUrgent = 0;
      try { regulatoryUrgent = (await import("../distribution/regulatory-horizon").then(m => m.scanRegulatoryHorizon(userId))).urgentCount; } catch {}

      let safetyScore = 1;
      try { safetyScore = (await import("../distribution/geopolitical-safety").then(m => m.checkGeopoliticalSafety(userId, { title: "", description: "", tags: [] }))).overallSafety; } catch {}

      res.json({
        stats,
        supportedPlatforms: platforms,
        brandConsistency: brandScore,
        cadence: cadenceSummary,
        regulatoryAlerts: regulatoryUrgent,
        globalSafety: safetyScore,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });
}
