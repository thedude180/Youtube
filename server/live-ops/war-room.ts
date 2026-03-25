import { db } from "../db";
import { liveOpsEvents } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface WarRoomState {
  status: "idle" | "pre_live" | "live" | "post_processing";
  currentStreamId: string | null;
  activeEvents: number;
  threatLevel: "green" | "amber" | "red";
  timeline: any[];
}

const activeStreams = new Map<string, { streamId: string; startedAt: Date; status: string }>();

export function getWarRoomState(userId: string): WarRoomState {
  const active = activeStreams.get(userId);

  return {
    status: active?.status as WarRoomState["status"] || "idle",
    currentStreamId: active?.streamId || null,
    activeEvents: 0,
    threatLevel: "green",
    timeline: [],
  };
}

export async function triggerLiveEvent(
  userId: string,
  eventType: string,
  streamId: string | null,
  payload: Record<string, any> = {},
  source = "system",
  trustCost = 0,
): Promise<number> {
  const [row] = await db.insert(liveOpsEvents).values({
    userId,
    eventType,
    streamId,
    payload,
    source,
    trustCost,
  }).returning();
  return row.id;
}

export async function getLiveTimeline(userId: string, streamId?: string, limit = 50) {
  if (streamId) {
    return db.select().from(liveOpsEvents)
      .where(and(eq(liveOpsEvents.userId, userId), eq(liveOpsEvents.streamId, streamId)))
      .orderBy(desc(liveOpsEvents.createdAt))
      .limit(limit);
  }
  return db.select().from(liveOpsEvents)
    .where(eq(liveOpsEvents.userId, userId))
    .orderBy(desc(liveOpsEvents.createdAt))
    .limit(limit);
}

export function setStreamStatus(userId: string, streamId: string, status: string) {
  activeStreams.set(userId, { streamId, startedAt: new Date(), status });
}

export function clearStreamStatus(userId: string) {
  activeStreams.delete(userId);
}
