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

  app.get("/api/vod-autopilot/status", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { getVodAutopilotStatus } = await import("../vod-continuous-engine");
    res.json(await getVodAutopilotStatus(userId));
  }));

  app.post("/api/vod-autopilot/enable", rateLimitEndpoint(10, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "VOD Autopilot");
    if (!userId) return;
    const { enableVodAutopilot } = await import("../vod-continuous-engine");
    const settings = req.body || {};
    const status = await enableVodAutopilot(userId, {
      maxLongFormPerDay: settings.maxLongFormPerDay,
      maxShortsPerDay: settings.maxShortsPerDay,
      targetPlatforms: settings.targetPlatforms,
      cycleIntervalHours: settings.cycleIntervalHours,
      minHoursBetweenUploads: settings.minHoursBetweenUploads,
      maxHoursBetweenUploads: settings.maxHoursBetweenUploads,
    });
    res.json({ success: true, status });
  }));

  app.post("/api/vod-autopilot/disable", rateLimitEndpoint(10, 60000), asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { disableVodAutopilot } = await import("../vod-continuous-engine");
    await disableVodAutopilot(userId);
    res.json({ success: true });
  }));

  app.post("/api/vod-autopilot/run-now", rateLimitEndpoint(3, 300000), asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "VOD Autopilot");
    if (!userId) return;
    const { getVodAutopilotStatus } = await import("../vod-continuous-engine");
    const status = await getVodAutopilotStatus(userId);
    if (!status.enabled) {
      return res.status(400).json({ error: "VOD Autopilot is not enabled. Enable it first." });
    }
    if (status.currentStatus === "running") {
      return res.status(409).json({ error: "A cycle is already running." });
    }
    const { triggerCycleNow } = await import("../vod-continuous-engine");
    await triggerCycleNow(userId);
    res.json({ success: true, message: "Cycle started immediately" });
  }));

  logger.info("[Loops] Stream + VOD/Shorts + VOD-Autopilot loop routes registered");
}
