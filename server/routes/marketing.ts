import { Request, Response, Express } from "express";
import { requireAuth } from "./helpers";
import { z } from "zod";

const configUpdateSchema = z.object({
  paidAdsEnabled: z.boolean().optional(),
  monthlyAdBudget: z.number().min(0).max(100000).optional(),
  organicStrategies: z.record(z.boolean()).optional(),
  adPlatforms: z.object({
    youtubeAds: z.boolean().optional(),
    googleAds: z.boolean().optional(),
    tiktokAds: z.boolean().optional(),
    xAds: z.boolean().optional(),
  }).optional(),
  targetAudience: z.object({
    ageRange: z.string().optional(),
    interests: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    demographics: z.string().optional(),
  }).optional(),
}).strict();

const togglePaidAdsSchema = z.object({
  enable: z.boolean(),
  monthlyBudget: z.number().min(0).max(100000).optional(),
});

export function registerMarketingRoutes(app: Express) {
  app.get("/api/marketing/dashboard", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getMarketingDashboard } = await import("../marketer-engine");
      const dashboard = await getMarketingDashboard(userId);
      res.json(dashboard);
    } catch (err) {
      console.error("[Marketing] Dashboard error:", err);
      res.status(500).json({ error: "Failed to get marketing dashboard" });
    }
  });

  app.get("/api/marketing/config", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { getOrCreateMarketingConfig } = await import("../marketer-engine");
      const config = await getOrCreateMarketingConfig(userId);
      res.json(config);
    } catch (err) {
      console.error("[Marketing] Config error:", err);
      res.status(500).json({ error: "Failed to get marketing config" });
    }
  });

  app.put("/api/marketing/config", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = configUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid config", details: parsed.error.issues });
      }
      const { updateMarketingConfig } = await import("../marketer-engine");
      const updated = await updateMarketingConfig(userId, parsed.data);
      res.json(updated);
    } catch (err) {
      console.error("[Marketing] Config update error:", err);
      res.status(500).json({ error: "Failed to update marketing config" });
    }
  });

  app.post("/api/marketing/toggle-paid-ads", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const parsed = togglePaidAdsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      const { togglePaidAds } = await import("../marketer-engine");
      const result = await togglePaidAds(userId, parsed.data.enable, parsed.data.monthlyBudget);
      res.json({ success: true, config: result });
    } catch (err) {
      console.error("[Marketing] Toggle paid ads error:", err);
      res.status(500).json({ error: "Failed to toggle paid ads" });
    }
  });

  app.post("/api/marketing/run-cycle", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { runMarketingCycle } = await import("../marketer-engine");
      const result = await runMarketingCycle(userId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Marketing] Run cycle error:", err);
      res.status(500).json({ error: "Failed to run marketing cycle" });
    }
  });

  app.get("/api/marketing/campaigns", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { db } = await import("../db");
      const { marketingCampaigns } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const campaigns = await db.select().from(marketingCampaigns)
        .where(eq(marketingCampaigns.userId, userId))
        .orderBy(desc(marketingCampaigns.createdAt))
        .limit(20);
      res.json(campaigns);
    } catch (err) {
      console.error("[Marketing] Campaigns error:", err);
      res.status(500).json({ error: "Failed to get campaigns" });
    }
  });

  app.patch("/api/marketing/campaigns/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { db } = await import("../db");
      const { marketingCampaigns } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const campaignId = parseInt(req.params.id);
      const { status } = req.body;

      if (!["active", "paused", "completed", "draft"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [updated] = await db.update(marketingCampaigns)
        .set({ status })
        .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.userId, userId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Campaign not found" });
      res.json(updated);
    } catch (err) {
      console.error("[Marketing] Campaign update error:", err);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });
}
