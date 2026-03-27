import { db } from "../db";
import { liveCtaRecommendations, liveProductionCrewSessions } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const FATIGUE_WINDOW_MINUTES = 15;
const MAX_CTAS_PER_HOUR = 4;

export async function recommendCta(
  sessionId: number, userId: string, platform: string,
  ctaType: string, content: string,
  triggerSignal: string, audienceTolerance: number = 1.0
): Promise<any> {
  const recentCtas = await db.select()
    .from(liveCtaRecommendations)
    .where(and(
      eq(liveCtaRecommendations.sessionId, sessionId),
      eq(liveCtaRecommendations.status, "executed"),
      gte(liveCtaRecommendations.executedAt, new Date(Date.now() - 60 * 60 * 1000))
    ));

  const recentInWindow = recentCtas.filter(c =>
    c.executedAt && c.executedAt.getTime() > Date.now() - FATIGUE_WINDOW_MINUTES * 60 * 1000
  );

  let fatigueRisk: string = "low";
  if (recentCtas.length >= MAX_CTAS_PER_HOUR) fatigueRisk = "high";
  else if (recentInWindow.length >= 2) fatigueRisk = "high";
  else if (recentInWindow.length >= 1) fatigueRisk = "medium";

  const trustCost = fatigueRisk === "high" ? 0.3 : fatigueRisk === "medium" ? 0.15 : 0.05;
  const approvalClass = fatigueRisk === "high" ? "red" : fatigueRisk === "medium" ? "yellow" : "green";
  const autoApprove = fatigueRisk === "low" && audienceTolerance > 0.6;

  const [rec] = await db.insert(liveCtaRecommendations).values({
    sessionId, userId, ctaType, content, platform,
    triggerSignal, audienceToleranceScore: audienceTolerance,
    sponsorSafe: true, trustCost, fatigueRisk,
    approved: autoApprove, approvalClass,
    status: autoApprove ? "approved" : "proposed",
  }).returning();

  appendEvent("commerce_cta.recommended", "live", "commerce_cta_producer", {
    recId: rec.id, ctaType, fatigueRisk, approvalClass,
  }, "commerce-cta-producer-service");

  return rec;
}

export async function approveCta(userId: string, recId: number): Promise<boolean> {
  const recs = await db.select()
    .from(liveCtaRecommendations)
    .where(and(eq(liveCtaRecommendations.id, recId), eq(liveCtaRecommendations.userId, userId)))
    .limit(1);

  if (recs.length === 0 || recs[0].status !== "proposed") return false;

  await db.update(liveCtaRecommendations)
    .set({ approved: true, status: "approved" })
    .where(eq(liveCtaRecommendations.id, recId));

  return true;
}

export async function executeCta(userId: string, recId: number): Promise<boolean> {
  const recs = await db.select()
    .from(liveCtaRecommendations)
    .where(and(
      eq(liveCtaRecommendations.id, recId),
      eq(liveCtaRecommendations.userId, userId)
    ))
    .limit(1);

  if (recs.length === 0 || recs[0].status !== "approved") return false;

  await db.update(liveCtaRecommendations)
    .set({ status: "executed", executedAt: new Date() })
    .where(eq(liveCtaRecommendations.id, recId));

  appendEvent("commerce_cta.executed", "live", "commerce_cta_producer", {
    recId, ctaType: recs[0].ctaType,
  }, "commerce-cta-producer-service");

  return true;
}

export async function rejectCta(userId: string, recId: number): Promise<boolean> {
  const recs = await db.select()
    .from(liveCtaRecommendations)
    .where(and(eq(liveCtaRecommendations.id, recId), eq(liveCtaRecommendations.userId, userId)))
    .limit(1);

  if (recs.length === 0) return false;

  await db.update(liveCtaRecommendations)
    .set({ status: "rejected" })
    .where(eq(liveCtaRecommendations.id, recId));

  return true;
}

export async function checkSponsorSafeWindow(sessionId: number, userId?: string): Promise<any> {
  const conditions = [
    eq(liveCtaRecommendations.sessionId, sessionId),
    gte(liveCtaRecommendations.proposedAt, new Date(Date.now() - 30 * 60 * 1000))
  ];
  if (userId) conditions.push(eq(liveCtaRecommendations.userId, userId));

  const recentCtas = await db.select()
    .from(liveCtaRecommendations)
    .where(and(...conditions));

  const executed = recentCtas.filter(r => r.status === "executed");
  const highFatigue = recentCtas.filter(r => r.fatigueRisk === "high");
  const totalTrustCost = recentCtas.reduce((s, r) => s + (r.trustCost || 0), 0);

  const isSafe = highFatigue.length === 0 && totalTrustCost < 0.5;

  return {
    sponsorSafe: isSafe,
    reason: !isSafe
      ? (highFatigue.length > 0 ? "Recent high-fatigue CTAs detected" : "Trust cost threshold exceeded")
      : "Window is sponsor-safe",
    recentCtaCount: executed.length,
    totalTrustCost,
    cooldownMinutes: !isSafe ? FATIGUE_WINDOW_MINUTES : 0,
  };
}

export async function getCtaTimingAnalysis(sessionId: number, userId?: string): Promise<any> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const conditions = [
    eq(liveCtaRecommendations.sessionId, sessionId),
    gte(liveCtaRecommendations.proposedAt, hourAgo)
  ];
  if (userId) conditions.push(eq(liveCtaRecommendations.userId, userId));

  const recs = await db.select()
    .from(liveCtaRecommendations)
    .where(and(...conditions))
    .orderBy(desc(liveCtaRecommendations.proposedAt));

  return {
    totalRecommendations: recs.length,
    executed: recs.filter(r => r.status === "executed").length,
    rejected: recs.filter(r => r.status === "rejected").length,
    pending: recs.filter(r => r.status === "proposed" || r.status === "approved").length,
    fatigueBreakdown: {
      low: recs.filter(r => r.fatigueRisk === "low").length,
      medium: recs.filter(r => r.fatigueRisk === "medium").length,
      high: recs.filter(r => r.fatigueRisk === "high").length,
    },
    overMonetizationRisk: recs.filter(r => r.fatigueRisk === "high").length > 2,
  };
}
