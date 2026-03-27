import { db } from "../db";
import { creatorInterruptEvents, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const INTERRUPT_TYPES = [
  "chat_pattern_shift", "moderation_emergency", "sponsor_timing_window",
  "trust_risk_warning", "platform_failure", "opportunity_moment",
  "gameplay_highlight", "viewer_milestone", "revenue_spike",
  "audience_drop", "technical_degradation"
] as const;

const VALUE_THRESHOLDS: Record<string, number> = {
  moderation_emergency: 0.3,
  platform_failure: 0.3,
  trust_risk_warning: 0.4,
  sponsor_timing_window: 0.5,
  chat_pattern_shift: 0.6,
  opportunity_moment: 0.5,
  gameplay_highlight: 0.7,
  viewer_milestone: 0.6,
  revenue_spike: 0.5,
  audience_drop: 0.6,
  technical_degradation: 0.4,
};

const SEVERITY_MAP: Record<string, string> = {
  moderation_emergency: "critical",
  platform_failure: "critical",
  trust_risk_warning: "high",
  sponsor_timing_window: "medium",
  chat_pattern_shift: "medium",
  opportunity_moment: "medium",
  gameplay_highlight: "low",
  viewer_milestone: "low",
  revenue_spike: "medium",
  audience_drop: "high",
  technical_degradation: "high",
};

export async function routeInterrupt(
  sessionId: number, userId: string,
  interruptType: string, source: string,
  title: string, description: string,
  valueScore: number
): Promise<any> {
  const threshold = VALUE_THRESHOLDS[interruptType] ?? 0.5;
  const thresholdPassed = valueScore >= threshold;
  const severity = SEVERITY_MAP[interruptType] ?? "medium";

  if (!thresholdPassed) {
    appendEvent("interrupt_router.suppressed", "live", "interrupt_router", {
      interruptType, valueScore, threshold, reason: "Below value threshold",
    }, "creator-interrupt-router");

    return { suppressed: true, reason: "Below interrupt value threshold", valueScore, threshold };
  }

  const recentInterrupts = await db.select()
    .from(creatorInterruptEvents)
    .where(and(
      eq(creatorInterruptEvents.sessionId, sessionId),
      eq(creatorInterruptEvents.interruptType, interruptType),
      gte(creatorInterruptEvents.firedAt, new Date(Date.now() - 5 * 60 * 1000))
    ));

  if (recentInterrupts.length >= 3 && severity !== "critical") {
    return { suppressed: true, reason: "Rate limited — too many recent interrupts of this type" };
  }

  const [event] = await db.insert(creatorInterruptEvents).values({
    sessionId, userId, interruptType, source, severity,
    title, description, valueScore, thresholdPassed: true,
  }).returning();

  appendEvent("interrupt_router.fired", "live", "interrupt_router", {
    eventId: event.id, interruptType, severity, valueScore,
  }, "creator-interrupt-router");

  return { suppressed: false, event };
}

export async function acknowledgeInterrupt(userId: string, eventId: number, actionTaken?: string): Promise<boolean> {
  const events = await db.select()
    .from(creatorInterruptEvents)
    .where(and(eq(creatorInterruptEvents.id, eventId), eq(creatorInterruptEvents.userId, userId)))
    .limit(1);

  if (events.length === 0 || events[0].acknowledged) return false;

  await db.update(creatorInterruptEvents)
    .set({ acknowledged: true, acknowledgedAt: new Date(), actionTaken })
    .where(eq(creatorInterruptEvents.id, eventId));

  appendEvent("interrupt_router.acknowledged", "live", "interrupt_router", {
    eventId, interruptType: events[0].interruptType, actionTaken,
  }, "creator-interrupt-router");

  return true;
}

export async function getInterruptQueue(sessionId: number, userId: string): Promise<any> {
  const events = await db.select()
    .from(creatorInterruptEvents)
    .where(and(
      eq(creatorInterruptEvents.sessionId, sessionId),
      eq(creatorInterruptEvents.userId, userId)
    ))
    .orderBy(desc(creatorInterruptEvents.firedAt));

  const unacknowledged = events.filter(e => !e.acknowledged);
  const critical = unacknowledged.filter(e => e.severity === "critical" || e.severity === "high");

  return {
    total: events.length,
    unacknowledged: unacknowledged.length,
    critical: critical.length,
    queue: unacknowledged.slice(0, 10),
    recent: events.slice(0, 20),
    interruptRate: events.length > 0
      ? events.length / Math.max(1, (Date.now() - (events[events.length - 1]?.firedAt?.getTime() || Date.now())) / (60 * 1000))
      : 0,
  };
}

export async function getInterruptQualityMetrics(sessionId: number): Promise<any> {
  const events = await db.select()
    .from(creatorInterruptEvents)
    .where(eq(creatorInterruptEvents.sessionId, sessionId));

  const total = events.length;
  const acknowledged = events.filter(e => e.acknowledged).length;
  const thresholdPassed = events.filter(e => e.thresholdPassed).length;
  const avgValue = total > 0
    ? events.reduce((s, e) => s + (e.valueScore || 0), 0) / total
    : 0;

  return {
    total,
    acknowledged,
    acknowledgmentRate: total > 0 ? acknowledged / total : 0,
    thresholdPassRate: total > 0 ? thresholdPassed / total : 1.0,
    avgValueScore: avgValue,
    quality: avgValue >= 0.7 ? "high" : avgValue >= 0.4 ? "medium" : "low",
  };
}
