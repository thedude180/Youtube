import { Router, Request, Response } from "express";
import {
  startCrewSession, endCrewSession, getCrewState,
  computeCrewScores, getCrewActions, verifySessionOwnership
} from "../live-ops/live-production-crew";
import {
  executeGreeting, executeFaqReply, launchPoll,
  acknowledgeMilestone, createEngagementPrompt,
  escalateHighRiskInteraction, detectIntentClusters
} from "../live-ops/community-host-service";
import {
  detectSpam, detectHarassment, detectBadActor,
  suggestSlowMode, resolveEvent, getModerationSummary
} from "../live-ops/moderation-captain-service";
import {
  proposeTitle, proposeTags, proposeCategory,
  proposeDescription, approveSeoAction, rejectSeoAction, getSeoVolatility
} from "../live-ops/live-seo-producer-service";
import {
  proposePreLiveThumbnail, proposeMidStreamSwap,
  proposePlatformCrop, approveThumbnailAction
} from "../live-ops/thumbnail-producer-service";
import {
  detectMoment, triggerClip, addArchiveMarker, getMomentQueue, getPostStreamAssetReadiness
} from "../live-ops/moment-producer-service";
import {
  recommendCta, approveCta, executeCta, rejectCta,
  checkSponsorSafeWindow, getCtaTimingAnalysis
} from "../live-ops/commerce-cta-producer-service";
import {
  routeInterrupt, acknowledgeInterrupt,
  getInterruptQueue, getInterruptQualityMetrics
} from "../live-ops/creator-interrupt-router";

const router = Router();

function getUserId(req: Request): string | null {
  return (req as any).user?.claims?.sub || (req as any).user?.id || (req as any).userId || null;
}

router.post("/session/start", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const session = await startCrewSession(
      userId, req.body.commandCenterSessionId, req.body.streamId, req.body.config
    );
    res.json(session);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/session/end", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await endCrewSession(userId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/state", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const state = await getCrewState(userId);
    res.json(state);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/scores/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const scores = await computeCrewScores(userId, sessionId);
    res.json(scores);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/actions/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const actions = await getCrewActions(userId, sessionId);
    res.json(actions);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

async function verifyBodySession(req: Request, res: Response, userId: string): Promise<number | null> {
  const sessionId = parseInt(req.body.sessionId);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return null; }
  const owns = await verifySessionOwnership(sessionId, userId);
  if (!owns) { res.status(403).json({ error: "Access denied" }); return null; }
  return sessionId;
}

router.post("/community/greeting", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await executeGreeting(sessionId, userId, req.body.platform, req.body.targetUser);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/faq", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await executeFaqReply(sessionId, userId, req.body.platform, req.body.question, req.body.answer);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/poll", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await launchPoll(sessionId, userId, req.body.platform, req.body.question, req.body.options);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/milestone", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await acknowledgeMilestone(sessionId, userId, req.body.platform, req.body.milestoneType, req.body.details);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/prompt", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const prompt = await createEngagementPrompt(
      sessionId, userId, req.body.platform,
      req.body.promptType, req.body.content, req.body.autoDeployable
    );
    res.json(prompt);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/escalate", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await escalateHighRiskInteraction(
      sessionId, userId, req.body.platform,
      req.body.topic, req.body.content, req.body.targetUser
    );
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/community/intents", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const clusters = await detectIntentClusters(sessionId, userId, req.body.platform, req.body.messages);
    res.json(clusters);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moderation/detect-spam", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const event = await detectSpam(sessionId, userId, req.body.platform, req.body.message, req.body.author);
    res.json(event || { detected: false });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moderation/detect-harassment", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const event = await detectHarassment(sessionId, userId, req.body.platform, req.body.message, req.body.author);
    res.json(event || { detected: false });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moderation/detect-bad-actor", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const event = await detectBadActor(
      sessionId, userId, req.body.platform,
      req.body.author, req.body.messageCount, req.body.flagCount
    );
    res.json(event || { detected: false });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moderation/suggest-slow-mode", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const event = await suggestSlowMode(sessionId, userId, req.body.platform, req.body.messageRate, req.body.threshold);
    res.json(event || { suggested: false });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moderation/resolve", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await resolveEvent(userId, req.body.eventId, req.body.resolution);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/moderation/summary/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const summary = await getModerationSummary(sessionId, userId);
    res.json(summary);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/title", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposeTitle(
      sessionId, userId, req.body.platform,
      req.body.currentTitle, req.body.proposedTitle,
      req.body.triggerSignal, req.body.signalSource
    );
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/tags", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposeTags(
      sessionId, userId, req.body.platform,
      req.body.currentTags, req.body.proposedTags, req.body.triggerSignal
    );
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/category", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposeCategory(
      sessionId, userId, req.body.platform,
      req.body.currentCategory, req.body.proposedCategory, req.body.triggerSignal
    );
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/description", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposeDescription(
      sessionId, userId, req.body.platform,
      req.body.currentDesc, req.body.proposedDesc, req.body.triggerSignal
    );
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/approve", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await approveSeoAction(userId, req.body.actionId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/seo/reject", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await rejectSeoAction(userId, req.body.actionId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/seo/volatility/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const vol = await getSeoVolatility(sessionId, userId);
    res.json(vol);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/thumbnail/pre-live", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposePreLiveThumbnail(sessionId, userId, req.body.platform, req.body.thumbnailUrl, req.body.triggerSignal);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/thumbnail/mid-stream", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposeMidStreamSwap(sessionId, userId, req.body.platform, req.body.newUrl, req.body.previousUrl, req.body.triggerSignal);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/thumbnail/crop", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const action = await proposePlatformCrop(sessionId, userId, req.body.platform, req.body.thumbnailUrl, req.body.aspectRatio);
    res.json(action);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/thumbnail/approve", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await approveThumbnailAction(userId, req.body.actionId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moment/detect", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const marker = await detectMoment(
      sessionId, userId, req.body.streamId,
      req.body.markerType, req.body.timestampStart,
      req.body.intensityScore, req.body.triggerSignal,
      req.body.title, req.body.timestampEnd
    );
    res.json(marker);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moment/clip", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await triggerClip(userId, req.body.markerId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/moment/archive", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const marker = await addArchiveMarker(sessionId, userId, req.body.streamId, req.body.timestampStart, req.body.title);
    res.json(marker);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/moment/queue/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const queue = await getMomentQueue(sessionId, userId);
    res.json(queue);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/moment/readiness/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const readiness = await getPostStreamAssetReadiness(sessionId, userId);
    res.json(readiness);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/cta/recommend", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const rec = await recommendCta(
      sessionId, userId, req.body.platform,
      req.body.ctaType, req.body.content,
      req.body.triggerSignal, req.body.audienceTolerance
    );
    res.json(rec);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/cta/approve", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await approveCta(userId, req.body.recId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/cta/execute", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await executeCta(userId, req.body.recId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/cta/reject", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await rejectCta(userId, req.body.recId);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cta/sponsor-safe/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const result = await checkSponsorSafeWindow(sessionId, userId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cta/timing/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const analysis = await getCtaTimingAnalysis(sessionId, userId);
    res.json(analysis);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/interrupt/route", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = await verifyBodySession(req, res, userId);
    if (sessionId === null) return;
    const result = await routeInterrupt(
      sessionId, userId, req.body.interruptType,
      req.body.source, req.body.title, req.body.description,
      req.body.valueScore
    );
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/interrupt/acknowledge", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const ok = await acknowledgeInterrupt(userId, req.body.eventId, req.body.actionTaken);
    res.json({ success: ok });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/interrupt/queue/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const queue = await getInterruptQueue(sessionId, userId);
    res.json(queue);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/interrupt/quality/:sessionId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const sessionId = parseInt(req.params.sessionId as string);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const owns = await verifySessionOwnership(sessionId, userId);
    if (!owns) return res.status(403).json({ error: "Access denied" });
    const metrics = await getInterruptQualityMetrics(sessionId);
    res.json(metrics);
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
