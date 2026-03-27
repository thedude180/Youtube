import { db } from "../db";
import { multistreamSessions, multistreamDestinations, liveDestinationStateHistory, channels } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface BroadcastGraph {
  sessionId: number;
  source: { platform: string; streamId: string; status: string };
  destinations: DestinationNode[];
  overallHealth: number;
}

export interface DestinationNode {
  id: number;
  platform: string;
  channelId: string | null;
  status: string;
  launchOrder: number;
  retryCount: number;
  launchedAt: Date | null;
  failureReason: string | null;
}

type DestStatus = "pending" | "launching" | "active" | "failed" | "stopped" | "recovering";

async function recordStateTransition(destinationId: number, previousState: string | null, newState: string, reason: string, triggeredBy: string): Promise<void> {
  await db.insert(liveDestinationStateHistory).values({
    destinationId,
    previousState,
    newState,
    reason,
    triggeredBy,
  });
}

export async function buildBroadcastGraph(sessionId: number): Promise<BroadcastGraph | null> {
  const [session] = await db.select()
    .from(multistreamSessions)
    .where(eq(multistreamSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const destinations = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.sessionId, sessionId))
    .orderBy(multistreamDestinations.launchOrder);

  const destNodes: DestinationNode[] = destinations.map(d => ({
    id: d.id,
    platform: d.platform,
    channelId: d.channelId,
    status: d.status,
    launchOrder: d.launchOrder || 0,
    retryCount: d.retryCount || 0,
    launchedAt: d.launchedAt,
    failureReason: d.failureReason,
  }));

  const activeCount = destNodes.filter(d => d.status === "active").length;
  const totalCount = destNodes.length;
  const overallHealth = totalCount > 0 ? activeCount / totalCount : 0;

  return {
    sessionId,
    source: { platform: session.sourcePlatform, streamId: session.sourceStreamId, status: session.status },
    destinations: destNodes,
    overallHealth,
  };
}

export async function addDestination(
  sessionId: number,
  platform: string,
  channelId: string | null,
  streamKey: string | null,
  ingestUrl: string | null,
  launchOrder: number
): Promise<DestinationNode> {
  const [dest] = await db.insert(multistreamDestinations).values({
    sessionId,
    platform,
    channelId,
    streamKey,
    ingestUrl,
    status: "pending",
    launchOrder,
    metadata: {},
  }).returning();

  await recordStateTransition(dest.id, null, "pending", "Destination added to broadcast graph", "broadcast-graph-orchestrator");

  await db.update(multistreamSessions)
    .set({ destinationCount: (await db.select().from(multistreamDestinations).where(eq(multistreamDestinations.sessionId, sessionId))).length })
    .where(eq(multistreamSessions.id, sessionId));

  appendEvent("multistream.destination_added", "live", platform, {
    sessionId, destinationId: dest.id, launchOrder,
  }, "broadcast-graph-orchestrator");

  return {
    id: dest.id,
    platform,
    channelId,
    status: "pending",
    launchOrder,
    retryCount: 0,
    launchedAt: null,
    failureReason: null,
  };
}

export async function updateDestinationState(
  destinationId: number,
  newState: DestStatus,
  reason: string,
  options?: { failureReason?: string; platformStreamId?: string }
): Promise<void> {
  const [current] = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.id, destinationId))
    .limit(1);

  if (!current) return;

  const updates: Record<string, any> = { status: newState };
  if (newState === "active" && !current.launchedAt) updates.launchedAt = new Date();
  if (newState === "stopped") updates.stoppedAt = new Date();
  if (newState === "failed") {
    updates.failureReason = options?.failureReason || reason;
    updates.retryCount = (current.retryCount || 0) + 1;
  }
  if (options?.platformStreamId) updates.platformStreamId = options.platformStreamId;

  await db.update(multistreamDestinations).set(updates).where(eq(multistreamDestinations.id, destinationId));
  await recordStateTransition(destinationId, current.status, newState, reason, "broadcast-graph-orchestrator");

  if (current.sessionId) {
    await syncSessionCounts(current.sessionId);
  }

  appendEvent(`multistream.destination_${newState}`, "live", current.platform, {
    destinationId, sessionId: current.sessionId, reason,
  }, "broadcast-graph-orchestrator");
}

async function syncSessionCounts(sessionId: number): Promise<void> {
  const destinations = await db.select().from(multistreamDestinations)
    .where(eq(multistreamDestinations.sessionId, sessionId));

  const launched = destinations.filter(d => d.status === "active" || d.status === "launching").length;
  const failed = destinations.filter(d => d.status === "failed").length;

  await db.update(multistreamSessions).set({
    destinationCount: destinations.length,
    launchedDestinations: launched,
    failedDestinations: failed,
  }).where(eq(multistreamSessions.id, sessionId));
}

export async function orchestrateLaunch(sessionId: number): Promise<{ launched: number; failed: number; pending: number }> {
  const destinations = await db.select()
    .from(multistreamDestinations)
    .where(and(
      eq(multistreamDestinations.sessionId, sessionId),
      eq(multistreamDestinations.status, "pending")
    ))
    .orderBy(multistreamDestinations.launchOrder);

  let launched = 0;
  let failed = 0;
  let pending = 0;

  for (const dest of destinations) {
    await updateDestinationState(dest.id, "launching", "Orchestrated launch sequence");
    launched++;
  }

  await db.update(multistreamSessions)
    .set({ status: "active" })
    .where(eq(multistreamSessions.id, sessionId));

  pending = destinations.length - launched - failed;

  appendEvent("multistream.launch_orchestrated", "live", "multistream", {
    sessionId, launched, failed, pending,
  }, "broadcast-graph-orchestrator");

  return { launched, failed, pending };
}

export async function orchestrateStop(sessionId: number): Promise<{ stopped: number }> {
  const destinations = await db.select()
    .from(multistreamDestinations)
    .where(and(
      eq(multistreamDestinations.sessionId, sessionId),
    ));

  let stopped = 0;
  for (const dest of destinations) {
    if (dest.status === "active" || dest.status === "launching") {
      await updateDestinationState(dest.id, "stopped", "Session stop orchestrated");
      stopped++;
    }
  }

  await db.update(multistreamSessions)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(multistreamSessions.id, sessionId));

  appendEvent("multistream.stop_orchestrated", "live", "multistream", {
    sessionId, stopped,
  }, "broadcast-graph-orchestrator");

  return { stopped };
}

export async function getDestinationHistory(destinationId: number): Promise<any[]> {
  return db.select()
    .from(liveDestinationStateHistory)
    .where(eq(liveDestinationStateHistory.destinationId, destinationId))
    .orderBy(desc(liveDestinationStateHistory.changedAt));
}

export async function getActiveSessions(userId: string): Promise<any[]> {
  return db.select()
    .from(multistreamSessions)
    .where(and(
      eq(multistreamSessions.userId, userId),
      eq(multistreamSessions.status, "active")
    ));
}
