import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";
import { getUserId } from "./helpers";
import { startMultistream, stopMultistream, getMultistreamStatus, getConfiguredDestinations } from "../services/multistream-engine";
import { detectLiveOrigin, detectLiveEnd, getRecentOriginEvents } from "../live-ops/live-origin-detector";
import { buildBroadcastGraph, addDestination, orchestrateLaunch, orchestrateStop, getActiveSessions, updateDestinationState, getDestinationHistory } from "../live-ops/broadcast-graph-orchestrator";
import { publishToDestination, stopPublishing, getRelayStatus } from "../live-ops/relay-publish-manager";
import { assessLaunchReliability, generateGuardReport, getRetryPolicies, recordFailure, recordSuccess } from "../live-ops/multistream-reliability-guard";
import { checkAllDestinations, getMultistreamReadinessScore } from "../live-ops/live-capability-integration";
import { generateAndStoreMetadataVariants, generateAndStoreThumbnailVariants, getPlatformTemplates } from "../distribution/destination-packaging-service";
import { runReconciliation, getReconciliationHistory, getDriftRecords, getLiveDriftHealthScore } from "../services/live-reconciliation-service";
import { generateHealthSurface } from "../live-ops/multistream-scores";
import { db } from "../db";
import { multistreamSessions, multistreamDestinations, liveReconciliationRuns } from "@shared/schema";
import { eq, and } from "drizzle-orm";

async function verifySessionOwnership(sessionId: number, userId: string): Promise<boolean> {
  const [session] = await db.select()
    .from(multistreamSessions)
    .where(and(eq(multistreamSessions.id, sessionId), eq(multistreamSessions.userId, userId)))
    .limit(1);
  return !!session;
}

async function verifyDestinationOwnership(destId: number, userId: string): Promise<boolean> {
  const [dest] = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.id, destId))
    .limit(1);
  if (!dest || !dest.sessionId) return false;
  return verifySessionOwnership(dest.sessionId, userId);
}

async function verifyRunOwnership(runId: number, userId: string): Promise<boolean> {
  const [run] = await db.select()
    .from(liveReconciliationRuns)
    .where(eq(liveReconciliationRuns.id, runId))
    .limit(1);
  if (!run || !run.sessionId) return false;
  return verifySessionOwnership(run.sessionId, userId);
}

export function registerMultistreamRoutes(app: Express): void {
  app.get("/api/multistream/status", isAuthenticated, (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.json(getMultistreamStatus(userId));
  });

  app.get("/api/multistream/destinations", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const dests = await getConfiguredDestinations(userId);
      res.json({ destinations: dests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/start", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { videoId } = req.body;
    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ error: "videoId is required — stream must be live on YouTube first" });
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

  app.post("/api/multistream/fabric/origin/detect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { platform, streamId, channelId, title, metadata } = req.body;
      if (!platform || !streamId) return res.status(400).json({ error: "platform and streamId required" });
      const result = await detectLiveOrigin({ userId, platform, streamId, channelId, title, metadata });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/origin/end", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { platform, streamId } = req.body;
      if (!platform || !streamId) return res.status(400).json({ error: "platform and streamId required" });
      const result = await detectLiveEnd(userId, platform, streamId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/origin/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const events = await getRecentOriginEvents(userId);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/session/:sessionId/graph", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const graph = await buildBroadcastGraph(sessionId);
      res.json({ graph });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/session/:sessionId/destination", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const { platform, channelId, streamKey, ingestUrl, launchOrder } = req.body;
      if (!platform) return res.status(400).json({ error: "platform required" });
      const dest = await addDestination(sessionId, platform, channelId, streamKey, ingestUrl, launchOrder || 0);
      res.json({ destination: dest });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/session/:sessionId/launch", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const result = await orchestrateLaunch(sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/session/:sessionId/stop", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const result = await orchestrateStop(sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/destination/:destId/publish", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const destinationId = parseInt(req.params.destId);
      if (!(await verifyDestinationOwnership(destinationId, userId))) return res.status(403).json({ error: "Access denied" });
      const { platform, sessionId, ingestUrl, streamKey } = req.body;
      if (!platform || !sessionId) return res.status(400).json({ error: "platform and sessionId required" });

      const reliability = await assessLaunchReliability(destinationId, platform, sessionId);
      if (!reliability.launchAllowed) {
        return res.status(403).json({ error: reliability.reason, assessment: reliability });
      }

      const result = await publishToDestination(destinationId, platform, sessionId, ingestUrl, streamKey);
      if (result.success) {
        await updateDestinationState(destinationId, "active", "Published successfully", { platformStreamId: `${platform}-live` });
        recordSuccess(platform);
      } else {
        recordFailure(platform);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/destination/:destId/stop", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const destinationId = parseInt(req.params.destId);
      if (!(await verifyDestinationOwnership(destinationId, userId))) return res.status(403).json({ error: "Access denied" });
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });
      const result = await stopPublishing(destinationId, sessionId);
      if (result.success) {
        await updateDestinationState(destinationId, "stopped", "Manually stopped");
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/destination/:destId/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const destinationId = parseInt(req.params.destId);
      if (!(await verifyDestinationOwnership(destinationId, userId))) return res.status(403).json({ error: "Access denied" });
      const history = await getDestinationHistory(destinationId);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/eligibility", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const eligibility = await checkAllDestinations(userId);
      res.json({ eligibility });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/readiness", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const readiness = await getMultistreamReadinessScore(userId);
      res.json(readiness);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/session/:sessionId/package", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const { title, description, category, tags, platforms, thumbnailUrl } = req.body;
      if (!title || !platforms?.length) return res.status(400).json({ error: "title and platforms required" });

      const metadata = await generateAndStoreMetadataVariants(sessionId, title, description || "", category || "gaming", tags || [], platforms);
      let thumbnails: any[] = [];
      if (thumbnailUrl) {
        thumbnails = await generateAndStoreThumbnailVariants(sessionId, thumbnailUrl, platforms);
      }
      res.json({ metadata, thumbnails });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/multistream/fabric/session/:sessionId/reconcile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const result = await runReconciliation(sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/session/:sessionId/reconciliation-history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const history = await getReconciliationHistory(sessionId);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/session/:sessionId/drift-health", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessionId = parseInt(req.params.sessionId);
      if (!(await verifySessionOwnership(sessionId, userId))) return res.status(403).json({ error: "Access denied" });
      const score = await getLiveDriftHealthScore(sessionId);
      res.json({ score });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/relay/status", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(getRelayStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/guard/report", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(generateGuardReport());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/guard/policies", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json({ policies: getRetryPolicies() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/packaging/templates", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json({ templates: getPlatformTemplates() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/sessions/active", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const sessions = await getActiveSessions(userId);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/health", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const surface = generateHealthSurface({
        eligiblePlatforms: 0, totalPlatforms: 4, streamKeysConfigured: 0,
        totalLaunches: 0, successfulLaunches: 0, totalRetries: 0,
        driftsDetected: 0, repairsAttempted: 0, repairsSucceeded: 0,
        metadataVariants: [], thumbnailsCoverage: 0,
      });
      res.json(surface);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/multistream/fabric/drift-records/:runId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runId = parseInt(req.params.runId);
      if (!(await verifyRunOwnership(runId, userId))) return res.status(403).json({ error: "Access denied" });
      const records = await getDriftRecords(runId);
      res.json({ records });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
