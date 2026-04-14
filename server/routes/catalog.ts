import type { Express, Request, Response } from "express";
import {
  syncFullCatalog, processUnprocessedCatalog, getCatalogStatus,
  retryFailedCatalogItems, syncPlatformCatalog, syncAllPlatformCatalogs,
  getCatalogByPlatform, getPlatformCatalogSummary,
} from "../services/channel-catalog-sync";

export function registerCatalogRoutes(app: Express): void {
  app.get("/api/catalog/status", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const status = await getCatalogStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/catalog/summary", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const summary = await getPlatformCatalogSummary(userId);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/catalog/videos", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const platform = req.query.platform as string | undefined;
      const videos = await getCatalogByPlatform(userId, platform);
      res.json(videos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/sync", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

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
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      try {
        const { refreshAllUserChannelStats } = await import("../youtube");
        await refreshAllUserChannelStats(userId);
      } catch (statsErr: any) {
        console.warn(`[CatalogSync] Channel stats refresh failed: ${statsErr?.message?.substring(0, 200)}`);
      }

      const results = await syncAllPlatformCatalogs(userId);
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/process", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await processUnprocessedCatalog(userId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/retry-failed", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const count = await retryFailedCatalogItems(userId);
      res.json({ success: true, retriedCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catalog/sync-and-process", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

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
