import { db } from "../db";
import { liveCrisisEvents } from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

export type CrisisType = "copyright_claim" | "community_strike" | "hate_raid" | "mass_unsubscribe" | "api_failure" | "stream_disruption" | "reputation_attack" | "technical_failure";

export async function detectCrisis(
  userId: string,
  streamId: string | null,
  indicators: {
    copyrightClaim?: boolean;
    communityStrike?: boolean;
    suddenViewerDrop?: number;
    negativeCommentRate?: number;
    apiErrors?: number;
    streamDropped?: boolean;
  },
): Promise<{ crisisDetected: boolean; crisisType: CrisisType | null; severity: string; description: string }> {
  if (indicators.copyrightClaim) {
    const [row] = await db.insert(liveCrisisEvents).values({
      userId,
      streamId,
      crisisType: "copyright_claim",
      severity: "critical",
      description: "Copyright claim detected during live stream",
      reputationImpact: -0.3,
    }).returning();

    return { crisisDetected: true, crisisType: "copyright_claim", severity: "critical", description: "Copyright claim on live content — may need to mute or switch game" };
  }

  if (indicators.negativeCommentRate && indicators.negativeCommentRate > 0.5) {
    const severity = indicators.negativeCommentRate > 0.8 ? "critical" : "high";
    await db.insert(liveCrisisEvents).values({
      userId,
      streamId,
      crisisType: "hate_raid",
      severity,
      description: `Negative comment rate at ${(indicators.negativeCommentRate * 100).toFixed(0)}%`,
      reputationImpact: -0.15,
    });

    return { crisisDetected: true, crisisType: "hate_raid", severity, description: "Possible hate raid detected — enabling strict moderation" };
  }

  if (indicators.streamDropped) {
    await db.insert(liveCrisisEvents).values({
      userId,
      streamId,
      crisisType: "stream_disruption",
      severity: "high",
      description: "Stream dropped unexpectedly",
      reputationImpact: -0.05,
    });

    return { crisisDetected: true, crisisType: "stream_disruption", severity: "high", description: "Stream dropped — check connection and restart" };
  }

  if (indicators.apiErrors && indicators.apiErrors > 5) {
    await db.insert(liveCrisisEvents).values({
      userId,
      streamId,
      crisisType: "api_failure",
      severity: "medium",
      description: `${indicators.apiErrors} API errors in recent window`,
      reputationImpact: 0,
    });

    return { crisisDetected: true, crisisType: "api_failure", severity: "medium", description: "Multiple API failures — some automations may be degraded" };
  }

  return { crisisDetected: false, crisisType: null, severity: "none", description: "No crisis detected" };
}

export async function getCrisisHistory(userId: string, limit = 20) {
  return db.select().from(liveCrisisEvents)
    .where(eq(liveCrisisEvents.userId, userId))
    .orderBy(desc(liveCrisisEvents.createdAt))
    .limit(limit);
}

export async function getReputationStatus(userId: string): Promise<{ score: number; trend: string; activeCrises: number }> {
  const events = await db.select().from(liveCrisisEvents)
    .where(eq(liveCrisisEvents.userId, userId))
    .orderBy(desc(liveCrisisEvents.createdAt))
    .limit(50);

  const activeCrises = events.filter(e => !e.resolvedAt).length;
  const totalImpact = events.reduce((sum, e) => sum + (e.reputationImpact || 0), 0);
  const score = Math.max(0, Math.min(1, 1 + totalImpact));

  const recent = events.slice(0, 10);
  const older = events.slice(10, 20);
  const recentAvg = recent.length > 0 ? recent.reduce((s, e) => s + (e.reputationImpact || 0), 0) / recent.length : 0;
  const olderAvg = older.length > 0 ? older.reduce((s, e) => s + (e.reputationImpact || 0), 0) / older.length : 0;

  const trend = recentAvg > olderAvg + 0.01 ? "declining" : recentAvg < olderAvg - 0.01 ? "improving" : "stable";

  return { score, trend, activeCrises };
}
