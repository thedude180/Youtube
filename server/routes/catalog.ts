import type { Express, Request, Response } from "express";
import { syncFullCatalog, processUnprocessedCatalog, getCatalogStatus, retryFailedCatalogItems } from "../services/channel-catalog-sync";

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

  app.post("/api/catalog/sync", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await syncFullCatalog(userId);
      res.json({ success: true, ...result });
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

      const syncResult = await syncFullCatalog(userId);
      const processResult = await processUnprocessedCatalog(userId);

      res.json({
        success: true,
        sync: syncResult,
        processing: processResult,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
