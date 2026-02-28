import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import {
  getCopyrightGuardianStatus,
  getCopyrightGuardianIssues,
  triggerCopyrightScan,
  applyCopyrightFix,
  dismissCopyrightIssue,
  startCopyrightGuardian,
} from "../services/copyright-guardian";

export function registerCopyrightGuardianRoutes(app: Express): void {
  app.get("/api/copyright-guardian/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json(getCopyrightGuardianStatus(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/copyright-guardian/issues", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const issues = getCopyrightGuardianIssues(userId);
      res.json({ issues, total: issues.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/copyright-guardian/scan", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await startCopyrightGuardian(userId);
      const result = await triggerCopyrightScan(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/copyright-guardian/apply/:videoId", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const videoId = parseInt(req.params.videoId);
    if (isNaN(videoId)) return res.status(400).json({ error: "Invalid video ID" });
    try {
      const result = await applyCopyrightFix(userId, videoId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/copyright-guardian/dismiss/:videoId", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const videoId = parseInt(req.params.videoId);
    if (isNaN(videoId)) return res.status(400).json({ error: "Invalid video ID" });
    try {
      dismissCopyrightIssue(userId, videoId);
      res.json({ dismissed: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
