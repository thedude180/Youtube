import { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { requireAuth, requireTier, asyncHandler, rateLimitEndpoint } from "./helpers";

const logger = createLogger("loops-routes");

export function registerLoopRoutes(app: Express) {
  app.get("/api/loops/stream/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { getStreamLoopStatus } = await import("../streaming-loop-engine");
    const status = await getStreamLoopStatus(userId);
    res.json(status);
  }));

  app.post("/api/loops/stream/execute", rateLimitEndpoint(3, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Streaming Loop");
    if (!userId) return;

    const { executeStreamLoop } = await import("../streaming-loop-engine");
    const result = await executeStreamLoop(userId);
    res.json(result);
  }));

  app.post("/api/loops/stream/cancel", rateLimitEndpoint(5, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { cancelStreamLoop } = await import("../streaming-loop-engine");
    const cancelled = await cancelStreamLoop(userId);
    res.json({ cancelled });
  }));

  app.get("/api/loops/vod-shorts/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { getVodShortsLoopStatus } = await import("../vod-shorts-loop-engine");
    const status = await getVodShortsLoopStatus(userId);
    res.json(status);
  }));

  app.post("/api/loops/vod-shorts/execute", rateLimitEndpoint(3, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "VOD & Shorts Loop");
    if (!userId) return;

    const { executeVodShortsLoop } = await import("../vod-shorts-loop-engine");
    const result = await executeVodShortsLoop(userId);
    res.json(result);
  }));

  app.post("/api/loops/vod-shorts/cancel", rateLimitEndpoint(5, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { cancelVodShortsLoop } = await import("../vod-shorts-loop-engine");
    const cancelled = await cancelVodShortsLoop(userId);
    res.json({ cancelled });
  }));

  logger.info("[Loops] Stream + VOD/Shorts loop routes registered");
}
