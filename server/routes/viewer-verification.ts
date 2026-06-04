import type { Express, Request, Response } from "express";
import { getUserId } from "./helpers";
import { createLogger } from "../lib/logger";
import {
  runViewerVerification,
  getLastViewerVerification,
} from "../services/youtube-viewer-verifier";

const logger = createLogger("viewer-verification-routes");

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.sendStatus(401);
    return null;
  }
  return getUserId(req);
}

// Track in-progress scans per user so we don't double-fire
const scanningUsers = new Set<string>();

function fireScanInBackground(userId: string) {
  if (scanningUsers.has(userId)) return;
  scanningUsers.add(userId);
  runViewerVerification(userId)
    .catch((err) => logger.warn("Background viewer scan error", { error: err?.message?.substring(0, 120) }))
    .finally(() => scanningUsers.delete(userId));
}

export function registerViewerVerificationRoutes(app: Express) {
  // GET /api/youtube/viewer-verification
  // Returns last cached result immediately (never blocks).
  // Always fires a background scan so the cache stays fresh.
  app.get("/api/youtube/viewer-verification", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const cached = await getLastViewerVerification(userId);
      // Hand off — never block the HTTP response on the scan
      fireScanInBackground(userId);
      res.json(cached ?? { scanning: true, rssVideos: [], recentPublished: [], stats: { totalPublished: 0, confirmedVisible: 0, processing: 0, missing: 0, unconfirmed: 0 } });
    } catch (err: any) {
      logger.error("GET /api/youtube/viewer-verification error", { error: err?.message });
      res.status(500).json({ error: "Viewer verification failed" });
    }
  });

  // POST /api/youtube/viewer-verification/refresh
  // Hands off a fresh scan to the background — returns immediately.
  app.post("/api/youtube/viewer-verification/refresh", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const alreadyRunning = scanningUsers.has(userId);
    fireScanInBackground(userId);
    res.json({ ok: true, scanning: true, alreadyRunning });
  });

  // GET /api/youtube/viewer-verification/status
  // Returns whether a scan is currently in progress for this user.
  app.get("/api/youtube/viewer-verification/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json({ scanning: scanningUsers.has(userId) });
  });
}
