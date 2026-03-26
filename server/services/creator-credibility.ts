import { db } from "../db";
import {
  creatorCredibilityScores, complianceChecks, copyrightClaims,
  disclosureRequirements, channels
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("creator-credibility");

let trustDeclineThreshold = parseInt(process.env.TRUST_DECLINE_THRESHOLD || "50", 10);

export function configureTrustDeclineThreshold(threshold: number) {
  trustDeclineThreshold = Math.max(0, Math.min(100, threshold));
}

export function getTrustDeclineThreshold(): number {
  return trustDeclineThreshold;
}

export interface CredibilityAssessment {
  userId: string;
  channelId: number | null;
  overallScore: number;
  complianceRate: number;
  strikeCount: number;
  warningCount: number;
  resolvedDisputeCount: number;
  disclosureComplianceRate: number;
  factors: Record<string, number>;
  tier: "excellent" | "good" | "fair" | "at_risk" | "poor";
  recommendations: string[];
}

export async function computeCreatorCredibility(userId: string, channelId?: number): Promise<CredibilityAssessment> {
  const resolvedChannelId = channelId || null;

  const checksQuery = channelId
    ? db.select().from(complianceChecks)
        .where(and(eq(complianceChecks.userId, userId), eq(complianceChecks.channelId, channelId)))
        .orderBy(desc(complianceChecks.checkedAt)).limit(200)
    : db.select().from(complianceChecks)
        .where(eq(complianceChecks.userId, userId))
        .orderBy(desc(complianceChecks.checkedAt)).limit(200);
  const checks = await checksQuery;

  const claimsQuery = channelId
    ? db.select().from(copyrightClaims)
        .where(and(eq(copyrightClaims.userId, userId), eq(copyrightClaims.channelId, channelId)))
        .orderBy(desc(copyrightClaims.detectedAt)).limit(100)
    : db.select().from(copyrightClaims)
        .where(eq(copyrightClaims.userId, userId))
        .orderBy(desc(copyrightClaims.detectedAt)).limit(100);
  const claims = await claimsQuery;

  const disclosuresQuery = channelId
    ? db.select().from(disclosureRequirements)
        .where(and(eq(disclosureRequirements.userId, userId), eq(disclosureRequirements.channelId, channelId)))
        .limit(100)
    : db.select().from(disclosureRequirements)
        .where(eq(disclosureRequirements.userId, userId))
        .limit(100);
  const disclosures = await disclosuresQuery;

  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.status === "passed").length;
  const violations = checks.filter(c => c.status === "violation");
  const warnings = checks.filter(c => c.status === "warning");
  const complianceRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

  const strikeCount = violations.filter(v => {
    const findings = Array.isArray(v.findings) ? v.findings : [];
    return findings.some((f: Record<string, unknown>) => f && f.severity === "critical");
  }).length;

  const warningCount = warnings.length;

  const resolvedClaims = claims.filter(c => c.status === "resolved");
  const resolvedDisputeCount = resolvedClaims.length;

  const requiredDisclosures = disclosures.filter(d => d.required);
  const compliantDisclosures = requiredDisclosures.filter(d => {
    const guidance = d.guidance && typeof d.guidance === "object" ? d.guidance as Record<string, unknown> : {};
    return guidance.hasProperDisclosure === true;
  });
  const disclosureComplianceRate = requiredDisclosures.length > 0
    ? Math.round((compliantDisclosures.length / requiredDisclosures.length) * 100)
    : 100;

  const factors: Record<string, number> = {};

  factors.complianceHistory = Math.min(30, Math.round(complianceRate * 0.3));
  factors.strikePenalty = -Math.min(25, strikeCount * 10);
  factors.warningPenalty = -Math.min(15, warningCount * 3);
  factors.disputeResolution = Math.min(10, resolvedDisputeCount * 2);
  factors.disclosureCompliance = Math.min(15, Math.round(disclosureComplianceRate * 0.15));
  factors.copyrightHealth = claims.length === 0 ? 10 : Math.max(0, 10 - claims.filter(c => c.status === "detected").length * 3);
  factors.baseScore = 20;

  const rawScore = Object.values(factors).reduce((sum, v) => sum + v, 0);
  const overallScore = Math.max(0, Math.min(100, rawScore));

  let tier: CredibilityAssessment["tier"];
  if (overallScore >= 85) tier = "excellent";
  else if (overallScore >= 70) tier = "good";
  else if (overallScore >= 50) tier = "fair";
  else if (overallScore >= 30) tier = "at_risk";
  else tier = "poor";

  const recommendations: string[] = [];
  if (strikeCount > 0) recommendations.push(`You have ${strikeCount} critical compliance violation(s) — address them immediately to improve credibility`);
  if (disclosureComplianceRate < 80) recommendations.push("Improve disclosure compliance — ensure all sponsored and AI content is properly disclosed");
  if (complianceRate < 70) recommendations.push("Review content compliance — multiple check failures detected");
  if (claims.filter(c => c.status === "detected").length > 0) recommendations.push("Resolve outstanding copyright claims to improve copyright health score");
  if (tier === "poor") recommendations.push("Your credibility score is critically low — automated publishing may be restricted");

  const whereConditions = channelId
    ? and(eq(creatorCredibilityScores.userId, userId), eq(creatorCredibilityScores.channelId, channelId))
    : and(eq(creatorCredibilityScores.userId, userId));

  const existing = await db.select().from(creatorCredibilityScores)
    .where(whereConditions)
    .limit(1);

  if (existing.length > 0) {
    const previousScore = existing[0].overallScore ?? 50;
    const decline = previousScore - overallScore;
    const trustThreshold = getTrustDeclineThreshold();
    if (overallScore < trustThreshold && decline > 0) {
      try {
        const { feedTrustDeclineToExceptionDesk } = await import("./exception-desk");
        await feedTrustDeclineToExceptionDesk({
          userId,
          platform: "all",
          currentScore: overallScore,
          threshold: trustThreshold,
          decline,
        });
      } catch (feedErr: any) {
        logger.error("Failed to feed trust decline to exception desk", { error: feedErr?.message });
      }
      try {
        const { routeNotification } = await import("./notification-system");
        await routeNotification(userId, {
          title: "Trust Score Decline Alert",
          message: `Your creator credibility score dropped by ${decline} points to ${overallScore}. This is below the threshold of ${trustThreshold}.`,
          severity: overallScore < trustThreshold * 0.5 ? "critical" : "warning",
          category: "compliance",
        });
      } catch (notifErr: any) {
        logger.error("Failed to send trust decline notification", { error: notifErr?.message });
      }
    }
    await db.update(creatorCredibilityScores)
      .set({
        overallScore,
        complianceRate,
        strikeCount,
        warningCount,
        resolvedDisputeCount,
        disclosureComplianceRate,
        factors,
        lastCalculatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorCredibilityScores.id, existing[0].id));
  } else {
    await db.insert(creatorCredibilityScores).values({
      userId,
      channelId: resolvedChannelId,
      overallScore,
      complianceRate,
      strikeCount,
      warningCount,
      resolvedDisputeCount,
      disclosureComplianceRate,
      factors,
    });
  }

  return {
    userId,
    channelId: resolvedChannelId,
    overallScore,
    complianceRate,
    strikeCount,
    warningCount,
    resolvedDisputeCount,
    disclosureComplianceRate,
    factors,
    tier,
    recommendations,
  };
}

export async function getCredibilityScore(userId: string, channelId?: number): Promise<(typeof creatorCredibilityScores.$inferSelect) | null> {
  const conditions = channelId
    ? and(eq(creatorCredibilityScores.userId, userId), eq(creatorCredibilityScores.channelId, channelId))
    : eq(creatorCredibilityScores.userId, userId);
  const [score] = await db.select().from(creatorCredibilityScores)
    .where(conditions)
    .orderBy(desc(creatorCredibilityScores.overallScore))
    .limit(1);
  return score || null;
}

export async function getCredibilityScoresForUser(userId: string): Promise<(typeof creatorCredibilityScores.$inferSelect)[]> {
  return db.select().from(creatorCredibilityScores)
    .where(eq(creatorCredibilityScores.userId, userId))
    .orderBy(desc(creatorCredibilityScores.lastCalculatedAt));
}
