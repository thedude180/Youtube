import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import { startMultistream, stopMultistream, getMultistreamStatus } from "../services/multistream-engine";

export function registerMultistreamRoutes(app: Express): void {
  app.get("/api/multistream/status", isAuthenticated, (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.json(getMultistreamStatus(userId));
  });

  app.post("/api/multistream/start", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { videoId } = req.body;
    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ error: "videoId is required" });
    }
    try {
      const result = await startMultistream(userId, videoId, false);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/stop", isAuthenticated, (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    stopMultistream(userId);
    res.json({ stopped: true });
  });
}
