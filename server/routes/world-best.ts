import type { Express, Request, Response } from "express";
import { requireAuth, requireTier, asyncHandler, rateLimitEndpoint } from "./helpers";
import { getCreatorContext, distillCreatorMemory, learnFromContent, updateCreatorProfile, getMemoryStats } from "../services/creator-memory-engine";
import { executeRoutedAICall, getModelPricing, getRoutingStats } from "../services/ai-model-router";
import { scoreContentQuality, smartSchedule, getPlatformOptimizations, batchScoreContent, getQualityTrend } from "../services/content-quality-engine";
import { generateDashboardInsights, detectTrends, getOpportunityAlerts, getPerformanceSummary, refreshInsights } from "../services/dashboard-intelligence-engine";
import { processCopilotMessage, getCopilotHistory, clearCopilotSession, getCopilotSessions } from "../services/copilot-engine";
import { getPerformanceReport, globalDeduplicator } from "../services/performance-optimizer";
import { storage } from "../storage";

async function verifyVideoOwnership(userId: string, videoId: number, res: Response): Promise<boolean> {
  const video = await storage.getVideo(videoId);
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return false;
  }
  if ((video as any).userId !== userId) {
    res.status(403).json({ error: "Access denied" });
    return false;
  }
  return true;
}

export function registerWorldBestRoutes(app: Express) {
  const memoryRateLimit = rateLimitEndpoint(10, 60000);
  const aiRouterRateLimit = rateLimitEndpoint(20, 60000);
  const qualityRateLimit = rateLimitEndpoint(10, 60000);
  const insightsRateLimit = rateLimitEndpoint(15, 60000);
  const copilotRateLimit = rateLimitEndpoint(30, 60000);

  app.get("/api/memory/context", memoryRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const context = await globalDeduplicator.dedupe(`memory-ctx-${userId}`, () => getCreatorContext(userId), 10000);
    res.json({ context });
  }));

  app.post("/api/memory/distill", memoryRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "AI Memory Distillation");
    if (!userId) return;
    await distillCreatorMemory(userId);
    res.json({ success: true, message: "Memory distillation complete" });
  }));

  app.post("/api/memory/learn", memoryRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { videoId, performance } = req.body;
    if (!videoId || typeof videoId !== "number") return res.status(400).json({ error: "videoId (number) required" });
    if (!(await verifyVideoOwnership(userId, videoId, res))) return;
    await learnFromContent(userId, videoId, performance || {});
    res.json({ success: true });
  }));

  app.post("/api/memory/update-profile", memoryRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await updateCreatorProfile(userId);
    res.json({ success: true, message: "Creator profile updated" });
  }));

  app.get("/api/memory/stats", memoryRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getMemoryStats(userId);
    res.json(stats);
  }));

  app.get("/api/ai-router/pricing", asyncHandler(async (_req: Request, res: Response) => {
    res.json(getModelPricing());
  }));

  app.get("/api/ai-router/stats", aiRouterRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const stats = await getRoutingStats(userId);
    res.json(stats);
  }));

  app.post("/api/ai-router/execute", aiRouterRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "AI Model Router");
    if (!userId) return;
    const { taskType, systemPrompt, userPrompt, priority } = req.body;
    if (!taskType || typeof taskType !== "string") return res.status(400).json({ error: "taskType (string) required" });
    if (!systemPrompt || typeof systemPrompt !== "string") return res.status(400).json({ error: "systemPrompt (string) required" });
    if (!userPrompt || typeof userPrompt !== "string") return res.status(400).json({ error: "userPrompt (string) required" });
    if (systemPrompt.length > 10000 || userPrompt.length > 10000) return res.status(400).json({ error: "Prompt too long (max 10000 chars)" });
    const userTier = await (async () => { const t = req.body.userTier; return t || "free"; })();
    const result = await executeRoutedAICall(
      { taskType, userId, userTier, priority },
      systemPrompt,
      userPrompt
    );
    res.json(result);
  }));

  app.post("/api/quality/score", qualityRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Content Quality Scoring");
    if (!userId) return;
    const { videoId } = req.body;
    if (!videoId || typeof videoId !== "number") return res.status(400).json({ error: "videoId (number) required" });
    if (!(await verifyVideoOwnership(userId, videoId, res))) return;
    const score = await scoreContentQuality(userId, videoId);
    res.json(score);
  }));

  app.post("/api/quality/batch-score", qualityRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "pro", "Batch Content Scoring");
    if (!userId) return;
    const { videoIds } = req.body;
    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) return res.status(400).json({ error: "videoIds array required" });
    if (videoIds.length > 20) return res.status(400).json({ error: "Maximum 20 videos per batch" });
    for (const vid of videoIds) {
      if (typeof vid !== "number") return res.status(400).json({ error: "All videoIds must be numbers" });
      if (!(await verifyVideoOwnership(userId, vid, res))) return;
    }
    const results = await batchScoreContent(userId, videoIds);
    res.json(results);
  }));

  app.get("/api/quality/trend", qualityRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
    const trend = await getQualityTrend(userId, days);
    res.json(trend);
  }));

  app.post("/api/quality/schedule", qualityRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Smart Scheduling");
    if (!userId) return;
    const { contentType, platform } = req.body;
    const validPlatforms = ["youtube"];
    const p = (platform || "youtube").toLowerCase();
    if (!validPlatforms.includes(p)) return res.status(400).json({ error: `Invalid platform. Valid: ${validPlatforms.join(", ")}` });
    const schedule = await smartSchedule(userId, contentType || "video", p);
    res.json(schedule);
  }));

  app.post("/api/quality/platform-optimize", qualityRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { platform, content } = req.body;
    if (!platform || typeof platform !== "string") return res.status(400).json({ error: "platform (string) required" });
    if (!content || typeof content !== "object") return res.status(400).json({ error: "content object required" });
    if (!content.title || typeof content.title !== "string") return res.status(400).json({ error: "content.title (string) required" });
    const optimized = await getPlatformOptimizations(platform, content);
    res.json(optimized);
  }));

  app.get("/api/insights/dashboard", insightsRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Dashboard Intelligence");
    if (!userId) return;
    const insights = await globalDeduplicator.dedupe(`dash-insights-${userId}`, () => generateDashboardInsights(userId), 30000);
    res.json(insights);
  }));

  app.get("/api/insights/trends", insightsRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Trend Detection");
    if (!userId) return;
    const trends = await globalDeduplicator.dedupe(`trends-${userId}`, () => detectTrends(userId), 60000);
    res.json(trends);
  }));

  app.get("/api/insights/alerts", insightsRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const alerts = await getOpportunityAlerts(userId);
    res.json(alerts);
  }));

  app.get("/api/insights/performance", insightsRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const summary = await globalDeduplicator.dedupe(`perf-${userId}`, () => getPerformanceSummary(userId), 15000);
    res.json(summary);
  }));

  app.post("/api/insights/refresh", insightsRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "Insight Refresh");
    if (!userId) return;
    const result = await refreshInsights(userId);
    res.json(result);
  }));

  app.post("/api/copilot/message", copilotRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireTier(req, res, "starter", "AI Co-Pilot");
    if (!userId) return;
    const { sessionId, message } = req.body;
    if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "sessionId (string) required" });
    if (!message || typeof message !== "string") return res.status(400).json({ error: "message (string) required" });
    if (message.length > 5000) return res.status(400).json({ error: "Message too long (max 5000 chars)" });
    if (sessionId.length > 100) return res.status(400).json({ error: "Session ID too long" });
    const result = await processCopilotMessage(userId, sessionId, message);
    res.json(result);
  }));

  app.get("/api/copilot/history/:sessionId", copilotRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const history = await getCopilotHistory(userId, req.params.sessionId as string, limit);
    res.json(history);
  }));

  app.delete("/api/copilot/session/:sessionId", copilotRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await clearCopilotSession(userId, req.params.sessionId as string);
    res.json({ success: true });
  }));

  app.get("/api/copilot/sessions", copilotRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const sessions = await getCopilotSessions(userId);
    res.json(sessions);
  }));

  app.get("/api/system/performance", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const report = getPerformanceReport();
    res.json(report);
  }));

  app.get("/api/system/dedup-stats", asyncHandler(async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    res.json(globalDeduplicator.stats());
  }));
}
