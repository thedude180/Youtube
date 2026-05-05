import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import { getUploadWatcherStatus } from "../services/youtube-upload-watcher";
import { startContentSweep, cancelContentSweep, getContentSweepStatus } from "../services/content-sweep";
import { getConsistencyAgentStatus, applyAISuggestion, triggerManualRun } from "../services/content-consistency-agent";

export function registerContentAutomationRoutes(app: Express): void {
  app.get("/api/content-automation/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json({
        uploadWatcher: getUploadWatcherStatus(userId),
        sweep: getContentSweepStatus(userId),
        consistencyAgent: getConsistencyAgentStatus(userId),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-automation/sweep/start", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await startContentSweep(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-automation/sweep/cancel", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      cancelContentSweep(userId);
      res.json({ cancelled: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-automation/upload-watcher/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json(getUploadWatcherStatus(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/content-automation/consistency/status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      res.json(getConsistencyAgentStatus(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-automation/consistency/run", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await triggerManualRun(userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/content-automation/consistency/apply/:videoId", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const videoId = parseInt(req.params.videoId as string);
    if (isNaN(videoId)) return res.status(400).json({ error: "Invalid video ID" });
    try {
      const result = await applyAISuggestion(userId, videoId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
