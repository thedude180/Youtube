import { db } from "../db";
import { liveModerationEvents, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const SPAM_PATTERNS = [
  /(.)\1{10,}/i,
  /buy.*followers/i,
  /free.*v-?bucks/i,
  /check.*my.*channel/i,
  /sub.*4.*sub/i,
  /f(o|0)ll(o|0)w.*me/i,
];

const HARASSMENT_KEYWORDS = [
  "kys", "kill yourself", "die", "swat", "doxx",
];

export async function detectSpam(
  sessionId: number, userId: string, platform: string,
  message: string, author: string
): Promise<any | null> {
  const isSpam = SPAM_PATTERNS.some(p => p.test(message));
  if (!isSpam) return null;

  const [event] = await db.insert(liveModerationEvents).values({
    sessionId, userId, platform,
    eventType: "spam_detected", targetUser: author,
    targetContent: message.substring(0, 500),
    detectionMethod: "pattern_match", severity: "low",
    actionTaken: "flagged", confidenceScore: 0.85,
    status: "detected",
  }).returning();

  appendEvent("moderation_captain.spam_detected", "live", "moderation_captain", {
    eventId: event.id, platform, author,
  }, "moderation-captain-service");

  return event;
}

export async function detectHarassment(
  sessionId: number, userId: string, platform: string,
  message: string, author: string
): Promise<any | null> {
  const lower = message.toLowerCase();
  const isHarassment = HARASSMENT_KEYWORDS.some(k => lower.includes(k));
  if (!isHarassment) return null;

  const [event] = await db.insert(liveModerationEvents).values({
    sessionId, userId, platform,
    eventType: "harassment_detected", targetUser: author,
    targetContent: message.substring(0, 500),
    detectionMethod: "keyword_match", severity: "high",
    actionTaken: "escalated", escalated: true,
    escalationReason: "Harassment keyword detected — requires manual review",
    confidenceScore: 0.9,
    status: "escalated",
  }).returning();

  appendEvent("moderation_captain.harassment_detected", "live", "moderation_captain", {
    eventId: event.id, platform, author, severity: "high",
  }, "moderation-captain-service");

  return event;
}

export async function detectBadActor(
  sessionId: number, userId: string, platform: string,
  author: string, messageCount: number, flagCount: number
): Promise<any | null> {
  const ratio = flagCount / Math.max(messageCount, 1);
  if (ratio < 0.3 || flagCount < 3) return null;

  const severity = ratio > 0.7 ? "high" : "medium";

  const [event] = await db.insert(liveModerationEvents).values({
    sessionId, userId, platform,
    eventType: "bad_actor_detected", targetUser: author,
    detectionMethod: "behavioral_analysis", severity,
    actionTaken: severity === "high" ? "escalated" : "flagged",
    escalated: severity === "high",
    escalationReason: severity === "high" ? `High flag ratio (${(ratio * 100).toFixed(0)}%)` : undefined,
    confidenceScore: Math.min(ratio + 0.2, 1.0),
    status: severity === "high" ? "escalated" : "detected",
    metadata: { messageCount, flagCount, ratio },
  }).returning();

  return event;
}

export async function suggestSlowMode(
  sessionId: number, userId: string, platform: string,
  messageRate: number, threshold: number = 50
): Promise<any | null> {
  if (messageRate < threshold) return null;

  const [event] = await db.insert(liveModerationEvents).values({
    sessionId, userId, platform,
    eventType: "slow_mode_recommended",
    detectionMethod: "rate_analysis", severity: "low",
    actionTaken: "recommended",
    confidenceScore: Math.min(messageRate / (threshold * 2), 1.0),
    status: "detected",
    metadata: { messageRate, threshold },
  }).returning();

  return event;
}

export async function resolveEvent(
  userId: string, eventId: number, resolution: string
): Promise<boolean> {
  const events = await db.select()
    .from(liveModerationEvents)
    .where(and(
      eq(liveModerationEvents.id, eventId),
      eq(liveModerationEvents.userId, userId)
    ))
    .limit(1);

  if (events.length === 0) return false;

  await db.update(liveModerationEvents)
    .set({ status: "resolved", actionTaken: resolution, resolvedAt: new Date() })
    .where(eq(liveModerationEvents.id, eventId));

  appendEvent("moderation_captain.event_resolved", "live", "moderation_captain", {
    eventId, resolution,
  }, "moderation-captain-service");

  return true;
}

export async function getModerationSummary(sessionId: number, userId: string): Promise<any> {
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const events = await db.select()
    .from(liveModerationEvents)
    .where(and(
      eq(liveModerationEvents.sessionId, sessionId),
      eq(liveModerationEvents.userId, userId),
      gte(liveModerationEvents.detectedAt, since)
    ))
    .orderBy(desc(liveModerationEvents.detectedAt));

  return {
    total: events.length,
    byType: {
      spam: events.filter(e => e.eventType === "spam_detected").length,
      harassment: events.filter(e => e.eventType === "harassment_detected").length,
      badActor: events.filter(e => e.eventType === "bad_actor_detected").length,
      slowMode: events.filter(e => e.eventType === "slow_mode_recommended").length,
    },
    escalated: events.filter(e => e.escalated).length,
    resolved: events.filter(e => e.status === "resolved").length,
    pending: events.filter(e => e.status === "detected" || e.status === "escalated").length,
    avgConfidence: events.length > 0
      ? events.reduce((s, e) => s + (e.confidenceScore || 0), 0) / events.length
      : 0,
  };
}
