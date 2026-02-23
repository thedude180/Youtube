import { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger("loops-routes");

export function registerLoopRoutes(app: Express) {
  app.get("/api/loops/stream/status", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { getStreamLoopStatus } = await import("../streaming-loop-engine");
      const status = await getStreamLoopStatus(userId);
      res.json(status);
    } catch (err: any) {
      logger.error("Failed to get stream loop status", { error: err.message });
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.post("/api/loops/stream/execute", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { executeStreamLoop } = await import("../streaming-loop-engine");
      const result = await executeStreamLoop(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("Failed to execute stream loop", { error: err.message });
      res.status(500).json({ error: "Failed to execute" });
    }
  });

  app.post("/api/loops/stream/cancel", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { cancelStreamLoop } = await import("../streaming-loop-engine");
      const cancelled = await cancelStreamLoop(userId);
      res.json({ cancelled });
    } catch (err: any) {
      logger.error("Failed to cancel stream loop", { error: err.message });
      res.status(500).json({ error: "Failed to cancel" });
    }
  });

  app.get("/api/loops/vod-shorts/status", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { getVodShortsLoopStatus } = await import("../vod-shorts-loop-engine");
      const status = await getVodShortsLoopStatus(userId);
      res.json(status);
    } catch (err: any) {
      logger.error("Failed to get VOD/Shorts loop status", { error: err.message });
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.post("/api/loops/vod-shorts/execute", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { executeVodShortsLoop } = await import("../vod-shorts-loop-engine");
      const result = await executeVodShortsLoop(userId);
      res.json(result);
    } catch (err: any) {
      logger.error("Failed to execute VOD/Shorts loop", { error: err.message });
      res.status(500).json({ error: "Failed to execute" });
    }
  });

  app.post("/api/loops/vod-shorts/cancel", async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { cancelVodShortsLoop } = await import("../vod-shorts-loop-engine");
      const cancelled = await cancelVodShortsLoop(userId);
      res.json({ cancelled });
    } catch (err: any) {
      logger.error("Failed to cancel VOD/Shorts loop", { error: err.message });
      res.status(500).json({ error: "Failed to cancel" });
    }
  });

  logger.info("[Loops] Stream + VOD/Shorts loop routes registered");
}
