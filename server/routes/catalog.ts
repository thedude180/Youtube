import type { Express, Request, Response } from "express";
import {
  syncFullCatalog, processUnprocessedCatalog, getCatalogStatus,
  retryFailedCatalogItems, syncPlatformCatalog, syncAllPlatformCatalogs,
  getCatalogByPlatform, getPlatformCatalogSummary,
} from "../services/channel-catalog-sync";
import { db } from "../db";
import { videoCatalogLinks, videos, contentVaultBackups } from "@shared/schema";
import { eq, and, sql, not, like } from "drizzle-orm";
import { createLogger } from "../lib/logger";


const logger = createLogger("catalog");
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
        logger.warn(`[CatalogSync] Channel stats refresh failed: ${statsErr?.message?.substring(0, 200)}`);
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

  // ── Reconciliation: shows how many videos match across all three tables ─────
  // GET /api/catalog/reconcile
  // Returns a side-by-side count of:
  //   catalogLinks  — videos YouTube API reported for this channel
  //   videos        — rows in main videos table with a real youtubeId
  //   vaultIndexed  — vault entries with a real (non-local_*) youtubeId
  //   vaultDownloaded — vault entries actually on disk
  //   orphanedInVault — vault rows not matched by any catalog link
  //   missingFromVault — catalog videos not yet in vault
  app.get("/api/catalog/reconcile", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const [catalogRows, videosRows, vaultRows] = await Promise.all([
        db.select({ youtubeId: videoCatalogLinks.youtubeId })
          .from(videoCatalogLinks)
          .where(eq(videoCatalogLinks.userId, userId)),
        db.select({ count: sql<number>`count(*)::int` })
          .from(videos)
          .where(and(
            // videos links via channelId; resolve userId via subquery
            sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`,
            sql`COALESCE(${videos.metadata}->>'youtubeId', ${videos.metadata}->>'youtubeVideoId') IS NOT NULL`,
            sql`COALESCE(${videos.metadata}->>'youtubeId', ${videos.metadata}->>'youtubeVideoId') != ''`,
          )),
        db.select({
          youtubeId: contentVaultBackups.youtubeId,
          status: contentVaultBackups.status,
        })
          .from(contentVaultBackups)
          .where(and(
            eq(contentVaultBackups.userId, userId),
            sql`${contentVaultBackups.youtubeId} NOT LIKE 'local_%'`,
            sql`${contentVaultBackups.youtubeId} NOT LIKE 'clip_%'`,
          )),
      ]);

      const catalogIds = new Set(catalogRows.map(r => r.youtubeId));
      const vaultIds = new Set(vaultRows.map(r => r.youtubeId));
      const vaultDownloaded = vaultRows.filter(r => r.status === "downloaded").length;

      const orphanedInVault = vaultRows.filter(r => !catalogIds.has(r.youtubeId)).length;
      const missingFromVault = catalogRows.filter(r => !vaultIds.has(r.youtubeId)).length;

      res.json({
        catalogLinks: catalogRows.length,
        videosTableWithYtId: Number(videosRows[0]?.count ?? 0),
        vaultIndexed: vaultRows.length,
        vaultDownloaded,
        orphanedInVault,
        missingFromVault,
        matchRate: catalogRows.length > 0
          ? `${Math.round((vaultIds.size / catalogRows.length) * 100)}%`
          : "n/a",
      });
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
