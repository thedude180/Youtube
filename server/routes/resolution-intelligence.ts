import type { Express, Request, Response } from "express";
import { getUserId } from "./helpers";
import { requireYouTubeOnly } from "@shared/youtube-only";
import {
  profileSourceQuality,
  getPlatformCapability,
  getEffectiveMaxResolution,
  computeMezzanineMaster,
  evaluateUpscale,
  computeOutputLadder,
  assessQualityGovernor,
  explainQualityDecision,
  getExportQualityRecommendation,
  saveSourceQualityProfile,
  getSourceQualityProfile,
  saveLiveOutputLadder,
  getLiveOutputLadders,
  saveLiveQualitySnapshot,
  saveUpscaleAction,
  saveGovernorEvent,
  saveArchiveMaster,
  getArchiveMaster,
  saveQualityDecisionTrace,
  saveQualityReconciliation,
  getGovernorEvents,
  getQualitySnapshots,
  getDestinationOutputProfile,
  upsertDestinationOutputProfile,
  getUserQualityPreferences,
  getLatestQualityState,
} from "../live-ops/resolution-intelligence";

export function registerResolutionIntelligenceRoutes(app: Express) {
  app.post("/api/resolution/profile-source", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const analysis = profileSourceQuality(req.body);
      const { sessionId, channelId } = req.body;
      if (sessionId) {
        const saved = await saveSourceQualityProfile(userId, sessionId, analysis, channelId);
        return res.json({ analysis, saved });
      }
      res.json({ analysis });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/source-profile/:sessionId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const profile = await getSourceQualityProfile(req.params.sessionId as string);
      if (profile && profile.userId !== userId) return res.sendStatus(403);
      res.json({ profile });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/platform-capability/:platform", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const rawPlatform = req.body.platform ?? req.params.platform ?? "youtube";
      const platform = requireYouTubeOnly(rawPlatform);
      const cap = getPlatformCapability(platform, req.query.region as string);
      res.json(cap);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/compute-ladder", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { source, destinations, latencyMode, headroom, sessionId } = req.body;
      const analysis = profileSourceQuality(source);
      const prefs = await getUserQualityPreferences(userId);
      const ladder = computeOutputLadder(analysis, destinations, latencyMode || "normal", headroom || { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 }, prefs);

      const explanations = ladder.map(entry => explainQualityDecision(analysis, entry, headroom || { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 }));
      const mezzanine = computeMezzanineMaster(analysis, destinations);

      if (sessionId) {
        for (const entry of ladder) {
          await saveLiveOutputLadder(userId, sessionId, entry);
        }
        for (const exp of explanations) {
          await saveQualityDecisionTrace({
            userId, sessionId,
            destinationPlatform: exp.destination,
            sourceResolution: exp.sourceResolution,
            outputResolution: exp.outputResolution,
            nativeOrEnhanced: exp.nativeOrEnhanced,
            latencyMode: exp.latencyMode,
            platformConstraintsUsed: exp.platformConstraints,
            bandwidthFactor: exp.bandwidthFactor,
            headroomFactor: exp.headroomFactor,
            confidence: exp.confidence,
            riskLevel: exp.riskLevel,
            rollbackPath: exp.rollbackPath,
            decisionReason: exp.reasoning,
          });
        }
      }

      res.json({ ladder, explanations, mezzanine, source: analysis });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/evaluate-upscale", async (req: Request, res: Response) => {
    try {
      const { source, destination, latencyMode, headroom } = req.body;
      const analysis = profileSourceQuality(source);
      const decision = evaluateUpscale(analysis, destination, latencyMode || "normal", headroom || { gpu: 0.8, cpu: 0.8, bandwidth: 0.8 });
      res.json(decision);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/governor-assess", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const assessment = assessQualityGovernor(req.body);
      const { sessionId } = req.body;
      if (sessionId && assessment.actions.length > 0) {
        for (const action of assessment.actions) {
          await saveGovernorEvent({
            userId, sessionId,
            eventType: action.type,
            previousState: req.body.previousState,
            newState: assessment.state,
            reason: action.reason,
            metrics: assessment.metrics,
          });
        }
      }
      res.json(assessment);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/quality-snapshot", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { videoId, channelId: snapChannelId, timestamp, ...rest } = req.body;
      const snapshot = await saveLiveQualitySnapshot({ ...rest, videoId: String(videoId ?? ""), channelId: String(snapChannelId ?? ""), timestamp: timestamp ? new Date(timestamp) : new Date(), userId });
      res.json(snapshot);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/quality-state/:sessionId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const state = await getLatestQualityState(userId, req.params.sessionId as string);
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/output-ladders/:sessionId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const ladders = await getLiveOutputLadders(req.params.sessionId as string);
      const filtered = ladders.filter(l => l.userId === userId);
      res.json({ ladders: filtered });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/archive-master", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const record = await saveArchiveMaster({ ...req.body, userId });
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/archive-master/:sessionId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const record = await getArchiveMaster(req.params.sessionId as string);
      if (record && record.userId !== userId) return res.sendStatus(403);
      res.json({ record });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/export-recommendation", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const { source, assetType } = req.body;
      const analysis = profileSourceQuality(source);
      const recommendation = getExportQualityRecommendation(analysis, assetType || "vod");
      res.json(recommendation);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/destination-profile/:platform", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const rawPlatform = req.body.platform ?? req.params.platform ?? "youtube";
      const platform = requireYouTubeOnly(rawPlatform);
      const profile = await getDestinationOutputProfile(userId, platform);
      res.json({ profile });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/resolution/destination-profile/:platform", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const rawPlatform = req.body.platform ?? req.params.platform ?? "youtube";
      const platform = requireYouTubeOnly(rawPlatform);
      const profile = await upsertDestinationOutputProfile(userId, platform, req.body);
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/user-preferences", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const prefs = await getUserQualityPreferences(userId);
      res.json(prefs);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/resolution/reconcile", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const record = await saveQualityReconciliation({ ...req.body, userId });
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/resolution/governor-events/:sessionId", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);
    try {
      const events = await getGovernorEvents(req.params.sessionId as string);
      const filtered = events.filter(e => e.userId === userId);
      res.json({ events: filtered });
    } catch (e: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}