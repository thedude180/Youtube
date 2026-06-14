import type { Express, Request, Response } from "express";
import { requireAuth, asyncHandler } from "./helpers";
import {
  getPlatformExpansionStatus,
  getPlatformGoals,
  setPlatformGoals,
  adaptContentForPlatform,
  PLATFORM_EXPANSION_QUEUE,
  scoreYouTubeMaturity,
} from "../services/social-expansion-engine";

export function registerSocialExpansionRoutes(app: Express): void {

  // Full expansion status — used by dashboard panel
  app.get("/api/social/expansion-status", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const status = await getPlatformExpansionStatus(userId);
    res.json(status);
  }));

  // YouTube maturity score only (lightweight endpoint)
  app.get("/api/social/youtube-maturity", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const maturity = await scoreYouTubeMaturity(userId);
    res.json(maturity);
  }));

  // Per-platform setup checklist
  app.get("/api/social/platform-checklist/:platform", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const platformId = req.params.platform;
    const cfg = PLATFORM_EXPANSION_QUEUE.find(p => p.id === platformId);
    if (!cfg) return res.status(404).json({ error: "Unknown platform" });
    res.json({
      platform:                cfg.id,
      label:                   cfg.label,
      why:                     cfg.why,
      credentials:             cfg.credentials,
      setupSteps:              cfg.setupSteps,
      estimatedSetupMinutes:   cfg.estimatedSetupMinutes,
      contentStrategy:         cfg.contentStrategy,
    });
  }));

  // Get or set platform goals
  app.get("/api/social/platform-goals/:platform", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const goals = await getPlatformGoals(userId, req.params.platform as string);
    res.json(goals);
  }));

  app.post("/api/social/platform-goals", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { platform, postsPerDay, postsPerWeek, targetFollowers, active } = req.body as {
      platform: string;
      postsPerDay?: number;
      postsPerWeek?: number;
      targetFollowers?: number;
      active?: boolean;
    };
    if (!platform) return res.status(400).json({ error: "platform required" });
    await setPlatformGoals(userId, platform, { postsPerDay, postsPerWeek, targetFollowers, active });
    const updated = await getPlatformGoals(userId, platform);
    res.json(updated);
  }));

  // AI-powered content adaptation for a specific platform
  app.post("/api/social/adapt-content", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { platform, title, description, tags, gameName } = req.body as {
      platform: string;
      title: string;
      description?: string;
      tags?: string[];
      gameName?: string;
    };
    if (!platform || !title) return res.status(400).json({ error: "platform and title are required" });
    const adapted = await adaptContentForPlatform({ title, description, tags, gameName }, platform);
    res.json(adapted);
  }));

  // List all platform configs (for frontend discovery)
  app.get("/api/social/platforms", requireAuth, asyncHandler(async (_req: Request, res: Response) => {
    res.json(PLATFORM_EXPANSION_QUEUE.map(p => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      priority: p.priority,
      why: p.why,
      estimatedSetupMinutes: p.estimatedSetupMinutes,
      postsPerDayDefault: p.postsPerDayDefault,
    })));
  }));
}
