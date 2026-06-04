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

export function registerViewerVerificationRoutes(app: Express) {
  // GET /api/youtube/viewer-verification
  // Returns last cached scan result; runs fresh if none exists.
  app.get("/api/youtube/viewer-verification", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const cached = await getLastViewerVerification(userId);
      if (cached) return res.json(cached);
      const fresh = await runViewerVerification(userId);
      res.json(fresh);
    } catch (err: any) {
      logger.error("GET /api/youtube/viewer-verification error", { error: err?.message });
      res.status(500).json({ error: "Viewer verification failed" });
    }
  });

  // POST /api/youtube/viewer-verification/refresh
  // Forces a fresh RSS + API scan immediately.
  app.post("/api/youtube/viewer-verification/refresh", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await runViewerVerification(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("POST /api/youtube/viewer-verification/refresh error", { error: err?.message });
      res.status(500).json({ error: "Refresh failed" });
    }
  });
}
