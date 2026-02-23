import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import { storage } from "../storage";

const syncState = new Map<string, { startedAt: number; status: "syncing" | "complete" | "error" }>();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of Array.from(syncState)) {
    if (val.startedAt < cutoff) syncState.delete(key);
  }
}, 60_000);

export function registerSyncRoutes(app: Express): void {
  app.post("/api/sync/login", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = syncState.get(userId);
    if (existing && existing.status === "syncing") {
      return res.json({ status: "syncing", message: "Sync already in progress", alreadyRunning: true });
    }

    syncState.set(userId, { startedAt: Date.now(), status: "syncing" });

    const results: Record<string, string> = {};

    try {
      const userChannels = await storage.getChannelsByUser(userId);
      results.connectedPlatforms = String(userChannels.length);

      if (userChannels.length === 0) {
        syncState.set(userId, { startedAt: Date.now(), status: "complete" });
        return res.json({ status: "complete", message: "No platforms connected", results });
      }

      try {
        const { refreshAllUserChannelStats } = await import("../youtube");
        await refreshAllUserChannelStats(userId);
        results.channelStats = "synced";
      } catch (err: any) {
        console.error(`[LoginSync] Channel stats sync failed for ${userId}:`, err.message);
        results.channelStats = "error";
      }

      try {
        const { refreshExpiringTokens } = await import("../token-refresh");
        const tokenResult = await refreshExpiringTokens();
        results.tokenRefresh = `${tokenResult.refreshed} refreshed`;
      } catch (err: any) {
        results.tokenRefresh = "skipped";
      }

      (async () => {
        try {
          const { syncAllRevenue } = await import("../revenue-sync-engine");
          await syncAllRevenue(userId);
          results.revenue = "synced";
          console.log(`[LoginSync] Revenue sync complete for ${userId}`);
        } catch (err: any) {
          console.error(`[LoginSync] Revenue sync failed for ${userId}:`, err.message);
          results.revenue = "error";
        }

        try {
          const { runMultiPlatformLiveDetection } = await import("../services/live-detection");
          await runMultiPlatformLiveDetection();
          results.liveDetection = "checked";
        } catch (err: any) {
          results.liveDetection = "skipped";
        }

        syncState.set(userId, { startedAt: Date.now(), status: "complete" });
        console.log(`[LoginSync] Full sync complete for ${userId}:`, JSON.stringify(results));
      })();

      res.json({ status: "syncing", message: "Sync started", results });
    } catch (err: any) {
      console.error(`[LoginSync] Sync failed for ${userId}:`, err.message);
      syncState.set(userId, { startedAt: Date.now(), status: "error" });
      res.status(500).json({ error: "Sync failed", message: err.message });
    }
  });

  app.get("/api/sync/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const state = syncState.get(userId);
    if (!state) {
      return res.json({ status: "idle", message: "No recent sync" });
    }

    const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
    res.json({ status: state.status, elapsedSeconds: elapsed });
  });
}
