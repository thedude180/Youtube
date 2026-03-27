import { db } from "../db";
import { liveMomentMarkers, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export async function detectMoment(
  sessionId: number, userId: string, streamId: number,
  markerType: string, timestampStart: number,
  intensityScore: number, triggerSignal: string,
  title?: string, timestampEnd?: number
): Promise<any> {
  const shouldClip = intensityScore >= 0.7;
  const shouldArchive = intensityScore >= 0.4;
  const shouldReplay = intensityScore >= 0.8;

  const [marker] = await db.insert(liveMomentMarkers).values({
    sessionId, userId, streamId, markerType, title,
    timestampStart, timestampEnd,
    intensityScore, clipTriggered: shouldClip,
    archiveMarker: shouldArchive, replayQueued: shouldReplay,
    triggerSignal,
  }).returning();

  appendEvent("moment_producer.moment_detected", "live", "moment_producer", {
    markerId: marker.id, markerType, intensityScore,
    clipTriggered: shouldClip, replayQueued: shouldReplay,
  }, "moment-producer-service");

  return marker;
}

export async function triggerClip(
  userId: string, markerId: number
): Promise<boolean> {
  const markers = await db.select()
    .from(liveMomentMarkers)
    .where(and(eq(liveMomentMarkers.id, markerId), eq(liveMomentMarkers.userId, userId)))
    .limit(1);

  if (markers.length === 0) return false;

  await db.update(liveMomentMarkers)
    .set({ clipTriggered: true })
    .where(eq(liveMomentMarkers.id, markerId));

  appendEvent("moment_producer.clip_triggered", "live", "moment_producer", {
    markerId, markerType: markers[0].markerType,
  }, "moment-producer-service");

  return true;
}

export async function addArchiveMarker(
  sessionId: number, userId: string, streamId: number,
  timestampStart: number, title: string
): Promise<any> {
  const [marker] = await db.insert(liveMomentMarkers).values({
    sessionId, userId, streamId,
    markerType: "archive_point", title,
    timestampStart, intensityScore: 0.3,
    archiveMarker: true, triggerSignal: "manual_archive",
  }).returning();

  return marker;
}

export async function getMomentQueue(sessionId: number, userId: string): Promise<any> {
  const markers = await db.select()
    .from(liveMomentMarkers)
    .where(and(
      eq(liveMomentMarkers.sessionId, sessionId),
      eq(liveMomentMarkers.userId, userId)
    ))
    .orderBy(desc(liveMomentMarkers.detectedAt));

  return {
    total: markers.length,
    clipQueue: markers.filter(m => m.clipTriggered),
    replayQueue: markers.filter(m => m.replayQueued),
    archiveMarkers: markers.filter(m => m.archiveMarker),
    topMoments: markers.sort((a, b) => (b.intensityScore || 0) - (a.intensityScore || 0)).slice(0, 5),
    avgIntensity: markers.length > 0
      ? markers.reduce((s, m) => s + (m.intensityScore || 0), 0) / markers.length
      : 0,
  };
}

export async function getPostStreamAssetReadiness(sessionId: number, userId?: string): Promise<any> {
  const conditions = [eq(liveMomentMarkers.sessionId, sessionId)];
  if (userId) conditions.push(eq(liveMomentMarkers.userId, userId));

  const markers = await db.select()
    .from(liveMomentMarkers)
    .where(and(...conditions));

  const clips = markers.filter(m => m.clipTriggered);
  const archives = markers.filter(m => m.archiveMarker);
  const replays = markers.filter(m => m.replayQueued);

  return {
    clipCount: clips.length,
    archiveCount: archives.length,
    replayCount: replays.length,
    readyForPostStream: clips.length > 0 || archives.length > 0,
    highlightCandidates: markers
      .filter(m => (m.intensityScore || 0) >= 0.6)
      .sort((a, b) => (b.intensityScore || 0) - (a.intensityScore || 0))
      .slice(0, 10),
  };
}
