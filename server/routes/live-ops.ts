import type { Express, Request, Response } from "express";
import { z } from "zod";
import { detectGame, getGameContext, getGameHistory } from "../live-ops/game-detection";
import { getWarRoomState, triggerLiveEvent, getLiveTimeline } from "../live-ops/war-room";
import { evaluateTriggers, getLiveTriggerLog } from "../live-ops/event-triggers";
import { checkLiveTrustBudget, getLiveTrustStatus } from "../live-ops/live-trust";
import { generateLiveTitle, validateLiveTitle, getLiveTitleHistory } from "../live-ops/live-title";
import { processLiveChatEvent, getLiveChatPolicy } from "../live-ops/live-chat-workflow";
import { captureMoment, scoreMoment, getMomentHistory } from "../live-ops/moment-capture";
import { initiateHandoff, getHandoffStatus, getHandoffChecklist } from "../live-ops/post-stream-handoff";
import { recordLiveLearning, getLiveLearningContext } from "../live-ops/live-learning";
import { attributeLiveRevenue, getLiveRevenueBreakdown } from "../live-ops/live-revenue";
import { getCommerceInsights, getCommerceOpportunities } from "../live-ops/live-commerce";
import { getOptimalMonetizationWindow, scoreMonetizationTiming } from "../live-ops/monetization-timing";
import { predictBurnout, suggestRecovery } from "../live-ops/burnout-prediction";
import { detectCrisis, getCrisisHistory, getReputationStatus } from "../live-ops/crisis-detection";
import { getGeoInsights } from "../live-ops/audience-geo";
import { checkLiveAccessibility } from "../live-ops/live-accessibility";
import { getCoCreationInsights, classifyCoCreationSignal } from "../live-ops/co-creation";
import { checkLiveAuthenticity, amplifyAuthenticitySignal } from "../live-ops/live-authenticity";
import { activateCommunity, getCommunityPulse } from "../live-ops/community-activation";
import { getLiveDegradationPlaybook, getAllLivePlaybooks } from "../live-ops/live-degradation";
import { getWebhookHealth } from "../live-ops/webhook-reliability";
import { getLiveOverridePatterns } from "../live-ops/live-override-learning";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).user?.claims?.sub || null;
}

export function registerLiveOpsRoutes(app: Express) {
  app.post("/api/live-ops/game/detect", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({ streamTitle: z.string().min(1), streamDescription: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "streamTitle is required", details: parsed.error.flatten() });
      const { streamTitle, streamDescription } = parsed.data;
      const detection = detectGame(streamTitle, streamDescription);
      if (detection.gameTitle) {
        const context = getGameContext(detection.gameTitle);
        return res.json({ ...detection, context });
      }
      res.json(detection);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/game/history", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const history = await getGameHistory(userId);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/war-room", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const state = getWarRoomState(userId);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/timeline", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const timeline = await getLiveTimeline(userId, req.query.streamId as string);
      res.json(timeline);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/trust", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      res.json(getLiveTrustStatus(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/live-ops/title/generate", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({ gameTitle: z.string().min(1).default("Game"), viewerCount: z.number().optional(), streamDurationMinutes: z.number().optional(), milestone: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      const { gameTitle, viewerCount, streamDurationMinutes, milestone } = parsed.data;
      const title = generateLiveTitle(gameTitle, { viewerCount, streamDurationMinutes, milestone });
      const validation = validateLiveTitle(userId, title);
      res.json({ title, validation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/title/history", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      res.json(getLiveTitleHistory(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/chat/policy", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      res.json(getLiveChatPolicy(userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/live-ops/moments/capture", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({ streamId: z.string().min(1), momentType: z.string().min(1), timestampSec: z.number().default(0), duration: z.number().optional(), description: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "streamId and momentType required", details: parsed.error.flatten() });
      const { streamId, momentType, timestampSec, duration, description } = parsed.data;
      const id = await captureMoment(userId, streamId, momentType, timestampSec || 0, { duration, description });
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/moments", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const moments = await getMomentHistory(userId, req.query.streamId as string);
      res.json(moments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/learning", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const context = await getLiveLearningContext(userId);
      res.json(context);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/revenue", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const breakdown = await getLiveRevenueBreakdown(userId, req.query.streamId as string);
      res.json(breakdown);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/commerce", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const insights = await getCommerceInsights(userId);
      res.json(insights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/live-ops/burnout/predict", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const schema = z.object({ hoursStreamed: z.number().optional(), streamsThisWeek: z.number().optional(), avgViewerCount: z.number().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid burnout prediction input", details: parsed.error.flatten() });
      const prediction = await predictBurnout(userId, parsed.data);
      res.json(prediction);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/burnout/recovery", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const suggestions = await suggestRecovery(userId);
      res.json({ suggestions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/reputation", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const status = await getReputationStatus(userId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/geo", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const insights = await getGeoInsights(userId);
      res.json(insights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/accessibility", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = checkLiveAccessibility({
        hasCaptions: req.query.captions === "true",
        chatModeration: req.query.moderation === "true",
        thumbnailAltText: req.query.altText === "true",
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/co-creation", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const insights = await getCoCreationInsights(userId);
      res.json(insights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/community/pulse", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const { chatMessages, chatters, viewers } = req.query;
      const pulse = getCommunityPulse(
        Number(chatMessages) || 0,
        Number(chatters) || 0,
        Number(viewers) || 0,
      );
      res.json(pulse);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/playbooks", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    res.json(getAllLivePlaybooks());
  });

  app.get("/api/live-ops/webhooks/health", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const health = await getWebhookHealth(userId);
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/overrides", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const patterns = getLiveOverridePatterns(userId);
      res.json(patterns);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/live-ops/summary", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try {
      const [warRoom, trustStatus, reputation, webhookHealth, overrides] = await Promise.all([
        Promise.resolve(getWarRoomState(userId)),
        Promise.resolve(getLiveTrustStatus(userId)),
        getReputationStatus(userId),
        getWebhookHealth(userId),
        Promise.resolve(getLiveOverridePatterns(userId)),
      ]);

      res.json({
        warRoom,
        trustStatus,
        reputation,
        webhookHealth: {
          successRate: webhookHealth.successRate,
          failedCount: webhookHealth.failedCount,
        },
        overrides: {
          total: overrides.totalOverrides,
          suggestions: overrides.suggestions.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
