import { db } from "../db";
import { liveOriginEvents, multistreamSessions, channels } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";
import { checkIdempotency, recordIdempotency } from "../kernel/idempotency-ledger";

export interface SourceLiveEvent {
  userId: string;
  platform: string;
  streamId: string;
  channelId?: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface OriginDetectionResult {
  detected: boolean;
  electedAsSource: boolean;
  duplicateSuppressed: boolean;
  originEventId: number | null;
  sessionId: number | null;
  reason: string;
}

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

async function checkDuplicateSource(userId: string, platform: string, streamId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const existing = await db.select()
    .from(liveOriginEvents)
    .where(and(
      eq(liveOriginEvents.userId, userId),
      eq(liveOriginEvents.sourcePlatform, platform),
      eq(liveOriginEvents.sourceStreamId, streamId),
      eq(liveOriginEvents.electedAsSource, true),
      gte(liveOriginEvents.detectedAt, cutoff)
    ))
    .limit(1);

  return existing.length > 0;
}

async function hasActiveSession(userId: string): Promise<boolean> {
  const active = await db.select()
    .from(multistreamSessions)
    .where(and(
      eq(multistreamSessions.userId, userId),
      eq(multistreamSessions.status, "active")
    ))
    .limit(1);

  return active.length > 0;
}

export async function detectLiveOrigin(event: SourceLiveEvent): Promise<OriginDetectionResult> {
  const idempotencyKey = `live-origin:${event.userId}:${event.platform}:${event.streamId}`;
  const idempotencyCheck = await checkIdempotency(idempotencyKey);
  if (idempotencyCheck.isDuplicate) {
    return {
      detected: true,
      electedAsSource: false,
      duplicateSuppressed: true,
      originEventId: idempotencyCheck.cachedResult?.originEventId || null,
      sessionId: idempotencyCheck.cachedResult?.sessionId || null,
      reason: "Duplicate source event suppressed by idempotency ledger",
    };
  }

  const isDuplicate = await checkDuplicateSource(event.userId, event.platform, event.streamId);
  if (isDuplicate) {
    const [suppressed] = await db.insert(liveOriginEvents).values({
      userId: event.userId,
      sourcePlatform: event.platform,
      sourceStreamId: event.streamId,
      sourceChannelId: event.channelId,
      eventType: "live_start",
      electedAsSource: false,
      duplicateSuppressed: true,
      metadata: event.metadata || {},
      processedAt: new Date(),
    }).returning();

    return {
      detected: true,
      electedAsSource: false,
      duplicateSuppressed: true,
      originEventId: suppressed.id,
      sessionId: null,
      reason: "Duplicate source event for same stream within window",
    };
  }

  const hasActive = await hasActiveSession(event.userId);

  const [originEvent] = await db.insert(liveOriginEvents).values({
    userId: event.userId,
    sourcePlatform: event.platform,
    sourceStreamId: event.streamId,
    sourceChannelId: event.channelId,
    eventType: "live_start",
    electedAsSource: !hasActive,
    duplicateSuppressed: false,
    metadata: { ...event.metadata, title: event.title },
    processedAt: new Date(),
  }).returning();

  let sessionId: number | null = null;

  if (!hasActive) {
    const [session] = await db.insert(multistreamSessions).values({
      userId: event.userId,
      originEventId: originEvent.id,
      sourcePlatform: event.platform,
      sourceStreamId: event.streamId,
      status: "initializing",
      metadata: { title: event.title },
    }).returning();

    sessionId = session.id;

    appendEvent("multistream.origin_elected", "live", event.platform, {
      originEventId: originEvent.id,
      sessionId: session.id,
      sourcePlatform: event.platform,
      sourceStreamId: event.streamId,
    }, "live-origin-detector");
  }

  await recordIdempotency(idempotencyKey, `${event.platform}:${event.streamId}`, {
    originEventId: originEvent.id,
    sessionId,
  }, DUPLICATE_WINDOW_MS);

  return {
    detected: true,
    electedAsSource: !hasActive,
    duplicateSuppressed: false,
    originEventId: originEvent.id,
    sessionId,
    reason: hasActive ? "Another session is already active — not elected" : "Elected as source — session created",
  };
}

export async function detectLiveEnd(userId: string, platform: string, streamId: string): Promise<{ processed: boolean; sessionEnded: boolean }> {
  const [event] = await db.insert(liveOriginEvents).values({
    userId,
    sourcePlatform: platform,
    sourceStreamId: streamId,
    eventType: "live_end",
    electedAsSource: false,
    duplicateSuppressed: false,
    metadata: {},
    processedAt: new Date(),
  }).returning();

  const activeSessions = await db.select()
    .from(multistreamSessions)
    .where(and(
      eq(multistreamSessions.userId, userId),
      eq(multistreamSessions.sourcePlatform, platform),
      eq(multistreamSessions.sourceStreamId, streamId),
      eq(multistreamSessions.status, "active")
    ));

  let sessionEnded = false;
  for (const session of activeSessions) {
    await db.update(multistreamSessions)
      .set({ status: "stopping", endedAt: new Date() })
      .where(eq(multistreamSessions.id, session.id));
    sessionEnded = true;

    appendEvent("multistream.source_ended", "live", platform, {
      sessionId: session.id,
      sourceStreamId: streamId,
    }, "live-origin-detector");
  }

  return { processed: true, sessionEnded };
}

export async function getRecentOriginEvents(userId: string, limit: number = 20): Promise<any[]> {
  return db.select()
    .from(liveOriginEvents)
    .where(eq(liveOriginEvents.userId, userId))
    .orderBy(desc(liveOriginEvents.detectedAt))
    .limit(limit);
}
