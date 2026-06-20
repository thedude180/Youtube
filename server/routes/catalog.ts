import type { Express, Request, Response } from "express";
import {
  syncFullCatalog, processUnprocessedCatalog, getCatalogStatus,
  retryFailedCatalogItems, syncPlatformCatalog, syncAllPlatformCatalogs,
  getCatalogByPlatform, getPlatformCatalogSummary,
} from "../services/channel-catalog-sync";
import { createLogger } from "../lib/logger";
import { requireYouTubeOnly } from "@shared/youtube-only";
import { requireAuth } from "./helpers";


const logger = createLogger("catalog");
export function registerCatalogRoutes(app: Express): void {
  app.get("/api/catalog/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const status = await getCatalogStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/catalog/summary", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const summary = await getPlatformCatalogSummary(userId);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/catalog/videos", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const rawPlatform = req.body?.platform ?? (req.query.platform as string) ?? "youtube";
      const platform = requireYouTubeOnly(rawPlatform);
      const videos = await getCatalogByPlatform(userId, platform);
      res.json(videos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/sync", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { platform } = req.body || {};
      if (platform && platform !== "youtube") {
        const result = await syncPlatformCatalog(userId, platform);
        res.json({ success: true, ...result });
      } else {
        const result = await syncFullCatalog(userId);
        res.json({ success: true, ...result });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/sync-all", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      try {
        const { refreshAllUserChannelStats } = await import("../youtube");
        await refreshAllUserChannelStats(userId);
      } catch (statsErr: any) {
        logger.warn(`[CatalogSync] Channel stats refresh failed: ${statsErr?.message?.substring(0, 200)}`);
      }
      const results = await syncAllPlatformCatalogs(userId);
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/process", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await processUnprocessedCatalog(userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/retry-failed", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const count = await retryFailedCatalogItems(userId);
      res.json({ success: true, retriedCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/sync-and-process", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const syncResults = await syncAllPlatformCatalogs(userId);
      const processResult = await processUnprocessedCatalog(userId);
      res.json({
        success: true,
        sync: syncResults,
        processing: processResult,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
