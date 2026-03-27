import { db } from "../db";
import {
  liveProductionCrewSessions, liveCommunityActions, liveModerationEvents,
  liveSeoActions, liveCrewThumbnailActions, liveMomentMarkers,
  liveCtaRecommendations, creatorInterruptEvents, liveChatIntentClusters,
  liveEngagementPrompts, liveCommandCenterSessions
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const CREW_ROLES = [
  "live_director", "community_host", "moderation_captain",
  "live_seo_producer", "thumbnail_producer", "moment_producer",
  "commerce_cta_producer", "platform_packaging_producer", "clip_replay_handoff"
] as const;

const LOW_RISK_AUTO_ACTIONS = [
  "greeting", "faq_reply", "poll_launch", "community_prompt",
  "milestone_acknowledgement", "clip_hype", "generic_thanks", "moment_chat_prompt"
] as const;

const HIGH_RISK_ESCALATION_TOPICS = [
  "controversy", "accusation", "conflict_resolution", "legal_privacy",
  "sponsor_commitment", "personal_advice", "regulatory", "reputation_sensitive"
] as const;

export async function startCrewSession(
  userId: string,
  commandCenterSessionId?: number,
  streamId?: number,
  config?: Record<string, any>
): Promise<any> {
  const existing = await db.select()
    .from(liveProductionCrewSessions)
    .where(and(
      eq(liveProductionCrewSessions.userId, userId),
      eq(liveProductionCrewSessions.status, "active")
    ))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [session] = await db.insert(liveProductionCrewSessions).values({
    userId,
    commandCenterSessionId,
    streamId,
    status: "active",
    activeRoles: [...CREW_ROLES],
    crewConfig: config || {},
    interruptPolicy: "standard",
    scores: {},
  }).returning();

  appendEvent("production_crew.session_started", "live", "production_crew", {
    sessionId: session.id, roles: CREW_ROLES,
  }, "live-production-crew");

  return session;
}

export async function endCrewSession(userId: string): Promise<boolean> {
  const sessions = await db.select()
    .from(liveProductionCrewSessions)
    .where(and(
      eq(liveProductionCrewSessions.userId, userId),
      eq(liveProductionCrewSessions.status, "active")
    ));

  if (sessions.length === 0) return false;

  const scores = await computeCrewScores(userId, sessions[0].id);

  await db.update(liveProductionCrewSessions)
    .set({ status: "ended", endedAt: new Date(), scores })
    .where(eq(liveProductionCrewSessions.id, sessions[0].id));

  appendEvent("production_crew.session_ended", "live", "production_crew", {
    sessionId: sessions[0].id, finalScores: scores,
  }, "live-production-crew");

  return true;
}

export async function getCrewState(userId: string): Promise<any> {
  const session = await db.select()
    .from(liveProductionCrewSessions)
    .where(and(
      eq(liveProductionCrewSessions.userId, userId),
      eq(liveProductionCrewSessions.status, "active")
    ))
    .limit(1);

  if (session.length === 0) {
    return { active: false, session: null, roles: [], scores: {}, panels: {} };
  }

  const sess = session[0];
  const since = new Date(Date.now() - 30 * 60 * 1000);

  const [communityState, moderationState, seoState, thumbnailState, momentState, ctaState, interruptState, intentState, promptState] = await Promise.all([
    getCommunityState(sess.id, since),
    getModerationState(sess.id, since),
    getSeoState(sess.id, since),
    getThumbnailState(sess.id, since),
    getMomentState(sess.id, since),
    getCtaState(sess.id, since),
    getInterruptState(sess.id, since),
    getIntentClusterState(sess.id, since),
    getEngagementPromptState(sess.id, since),
  ]);

  const scores = await computeCrewScores(userId, sess.id);

  await db.update(liveProductionCrewSessions)
    .set({ scores })
    .where(eq(liveProductionCrewSessions.id, sess.id));

  return {
    active: true,
    session: sess,
    roles: sess.activeRoles,
    scores,
    panels: {
      community: communityState,
      moderation: moderationState,
      seo: seoState,
      thumbnails: thumbnailState,
      moments: momentState,
      commerce: ctaState,
      interrupts: interruptState,
      intentClusters: intentState,
      engagementPrompts: promptState,
    },
  };
}

async function getCommunityState(sessionId: number, since: Date) {
  const actions = await db.select()
    .from(liveCommunityActions)
    .where(and(
      eq(liveCommunityActions.sessionId, sessionId),
      gte(liveCommunityActions.createdAt, since)
    ))
    .orderBy(desc(liveCommunityActions.createdAt))
    .limit(20);

  const total = actions.length;
  const autoApproved = actions.filter(a => a.autoApproved).length;
  const pending = actions.filter(a => a.status === "pending").length;
  const executed = actions.filter(a => a.status === "executed").length;
  const highRisk = actions.filter(a => a.riskLevel === "high").length;

  return {
    recentActions: actions.slice(0, 10),
    stats: { total, autoApproved, pending, executed, highRisk },
    posture: highRisk > 2 ? "elevated" : pending > 5 ? "busy" : "normal",
  };
}

async function getModerationState(sessionId: number, since: Date) {
  const events = await db.select()
    .from(liveModerationEvents)
    .where(and(
      eq(liveModerationEvents.sessionId, sessionId),
      gte(liveModerationEvents.detectedAt, since)
    ))
    .orderBy(desc(liveModerationEvents.detectedAt))
    .limit(20);

  const total = events.length;
  const escalated = events.filter(e => e.escalated).length;
  const highSeverity = events.filter(e => e.severity === "high" || e.severity === "critical").length;
  const resolved = events.filter(e => e.status === "resolved").length;

  return {
    recentEvents: events.slice(0, 10),
    stats: { total, escalated, highSeverity, resolved },
    confidence: total === 0 ? 1.0 : Math.max(0.3, 1.0 - (escalated * 0.15) - (highSeverity * 0.1)),
    status: highSeverity > 0 ? "alert" : escalated > 0 ? "escalated" : "clear",
  };
}

async function getSeoState(sessionId: number, since: Date) {
  const actions = await db.select()
    .from(liveSeoActions)
    .where(and(
      eq(liveSeoActions.sessionId, sessionId),
      gte(liveSeoActions.proposedAt, since)
    ))
    .orderBy(desc(liveSeoActions.proposedAt))
    .limit(15);

  const total = actions.length;
  const applied = actions.filter(a => a.status === "applied").length;
  const pending = actions.filter(a => a.status === "proposed").length;
  const totalTrustCost = actions.reduce((sum, a) => sum + (a.trustCost || 0), 0);

  return {
    recentActions: actions.slice(0, 8),
    stats: { total, applied, pending, totalTrustCost },
    volatility: total > 5 ? "high" : total > 2 ? "moderate" : "low",
  };
}

async function getThumbnailState(sessionId: number, since: Date) {
  const actions = await db.select()
    .from(liveCrewThumbnailActions)
    .where(and(
      eq(liveCrewThumbnailActions.sessionId, sessionId),
      gte(liveCrewThumbnailActions.proposedAt, since)
    ))
    .orderBy(desc(liveCrewThumbnailActions.proposedAt))
    .limit(10);

  return {
    recentActions: actions.slice(0, 5),
    stats: {
      total: actions.length,
      applied: actions.filter(a => a.status === "applied").length,
      proposed: actions.filter(a => a.status === "proposed").length,
      honestyCompliant: actions.filter(a => a.honestyCompliant).length,
    },
  };
}

async function getMomentState(sessionId: number, since: Date) {
  const markers = await db.select()
    .from(liveMomentMarkers)
    .where(and(
      eq(liveMomentMarkers.sessionId, sessionId),
      gte(liveMomentMarkers.detectedAt, since)
    ))
    .orderBy(desc(liveMomentMarkers.detectedAt))
    .limit(20);

  return {
    recentMoments: markers.slice(0, 10),
    stats: {
      total: markers.length,
      clipsTriggered: markers.filter(m => m.clipTriggered).length,
      archived: markers.filter(m => m.archiveMarker).length,
      replayQueued: markers.filter(m => m.replayQueued).length,
      avgIntensity: markers.length > 0
        ? markers.reduce((s, m) => s + (m.intensityScore || 0), 0) / markers.length
        : 0,
    },
  };
}

async function getCtaState(sessionId: number, since: Date) {
  const recs = await db.select()
    .from(liveCtaRecommendations)
    .where(and(
      eq(liveCtaRecommendations.sessionId, sessionId),
      gte(liveCtaRecommendations.proposedAt, since)
    ))
    .orderBy(desc(liveCtaRecommendations.proposedAt))
    .limit(10);

  const total = recs.length;
  const approved = recs.filter(r => r.approved).length;
  const highFatigue = recs.filter(r => r.fatigueRisk === "high").length;
  const totalTrustCost = recs.reduce((s, r) => s + (r.trustCost || 0), 0);

  return {
    recentRecommendations: recs.slice(0, 5),
    stats: { total, approved, highFatigue, totalTrustCost },
    fatigueLevel: highFatigue > 2 ? "high" : highFatigue > 0 ? "moderate" : "low",
  };
}

async function getInterruptState(sessionId: number, since: Date) {
  const events = await db.select()
    .from(creatorInterruptEvents)
    .where(and(
      eq(creatorInterruptEvents.sessionId, sessionId),
      gte(creatorInterruptEvents.firedAt, since)
    ))
    .orderBy(desc(creatorInterruptEvents.firedAt))
    .limit(10);

  return {
    recentInterrupts: events.slice(0, 5),
    stats: {
      total: events.length,
      acknowledged: events.filter(e => e.acknowledged).length,
      unacknowledged: events.filter(e => !e.acknowledged).length,
      highSeverity: events.filter(e => e.severity === "high" || e.severity === "critical").length,
    },
    queue: events.filter(e => !e.acknowledged),
  };
}

async function getIntentClusterState(sessionId: number, since: Date) {
  const clusters = await db.select()
    .from(liveChatIntentClusters)
    .where(and(
      eq(liveChatIntentClusters.sessionId, sessionId),
      gte(liveChatIntentClusters.detectedAt, since)
    ))
    .orderBy(desc(liveChatIntentClusters.detectedAt))
    .limit(10);

  return {
    clusters: clusters.slice(0, 8),
    stats: {
      total: clusters.length,
      actionable: clusters.filter(c => c.actionable).length,
      autoResponseEligible: clusters.filter(c => c.autoResponseEligible).length,
    },
  };
}

async function getEngagementPromptState(sessionId: number, since: Date) {
  const prompts = await db.select()
    .from(liveEngagementPrompts)
    .where(and(
      eq(liveEngagementPrompts.sessionId, sessionId),
      gte(liveEngagementPrompts.createdAt, since)
    ))
    .orderBy(desc(liveEngagementPrompts.createdAt))
    .limit(10);

  return {
    recentPrompts: prompts.slice(0, 5),
    stats: {
      total: prompts.length,
      deployed: prompts.filter(p => p.deployed).length,
      autoDeployable: prompts.filter(p => p.autoDeployable).length,
      ready: prompts.filter(p => p.status === "ready").length,
    },
  };
}

export async function verifySessionOwnership(sessionId: number, userId: string): Promise<boolean> {
  const session = await db.select()
    .from(liveProductionCrewSessions)
    .where(and(eq(liveProductionCrewSessions.id, sessionId), eq(liveProductionCrewSessions.userId, userId)))
    .limit(1);
  return session.length > 0;
}

export async function computeCrewScores(userId: string, sessionId: number): Promise<Record<string, number>> {
  const owns = await verifySessionOwnership(sessionId, userId);
  if (!owns) return {};

  const since = new Date(Date.now() - 60 * 60 * 1000);

  const [communityActions, modEvents, seoActs, moments, ctaRecs, interrupts] = await Promise.all([
    db.select().from(liveCommunityActions)
      .where(and(eq(liveCommunityActions.sessionId, sessionId), eq(liveCommunityActions.userId, userId), gte(liveCommunityActions.createdAt, since))),
    db.select().from(liveModerationEvents)
      .where(and(eq(liveModerationEvents.sessionId, sessionId), eq(liveModerationEvents.userId, userId), gte(liveModerationEvents.detectedAt, since))),
    db.select().from(liveSeoActions)
      .where(and(eq(liveSeoActions.sessionId, sessionId), eq(liveSeoActions.userId, userId), gte(liveSeoActions.proposedAt, since))),
    db.select().from(liveMomentMarkers)
      .where(and(eq(liveMomentMarkers.sessionId, sessionId), eq(liveMomentMarkers.userId, userId), gte(liveMomentMarkers.detectedAt, since))),
    db.select().from(liveCtaRecommendations)
      .where(and(eq(liveCtaRecommendations.sessionId, sessionId), eq(liveCtaRecommendations.userId, userId), gte(liveCtaRecommendations.proposedAt, since))),
    db.select().from(creatorInterruptEvents)
      .where(and(eq(creatorInterruptEvents.sessionId, sessionId), eq(creatorInterruptEvents.userId, userId), gte(creatorInterruptEvents.firedAt, since))),
  ]);

  const communityTotal = communityActions.length;
  const communityExecuted = communityActions.filter(a => a.status === "executed").length;
  const communityHealthScore = communityTotal === 0 ? 0.8 : Math.min(1.0, communityExecuted / Math.max(communityTotal, 1));

  const communityHighRisk = communityActions.filter(a => a.riskLevel === "high").length;
  const engagementQuality = communityTotal === 0 ? 0.7 :
    Math.max(0.2, 1.0 - (communityHighRisk * 0.15) - Math.max(0, (communityTotal - 20) * 0.02));

  const modTotal = modEvents.length;
  const modEscalated = modEvents.filter(e => e.escalated).length;
  const modHighSev = modEvents.filter(e => e.severity === "high" || e.severity === "critical").length;
  const moderationConfidence = modTotal === 0 ? 0.9 :
    Math.max(0.3, 1.0 - (modEscalated * 0.12) - (modHighSev * 0.08));

  const seoTotal = seoActs.length;
  const seoApplied = seoActs.filter(a => a.status === "applied").length;
  const seoTrustCost = seoActs.reduce((s, a) => s + (a.trustCost || 0), 0);
  const seoQuality = seoTotal === 0 ? 0.75 :
    Math.max(0.2, (seoApplied / Math.max(seoTotal, 1)) - (seoTrustCost * 0.05));

  const momentsTotal = moments.length;
  const clipsTriggered = moments.filter(m => m.clipTriggered).length;
  const thumbnailPerformance = momentsTotal === 0 ? 0.7 :
    Math.min(1.0, 0.5 + (clipsTriggered * 0.1));

  const interruptsTotal = interrupts.length;
  const interruptsPassed = interrupts.filter(i => i.thresholdPassed).length;
  const interruptQuality = interruptsTotal === 0 ? 0.9 :
    Math.max(0.3, interruptsPassed / Math.max(interruptsTotal, 1));

  const ctaTotal = ctaRecs.length;
  const ctaHighFatigue = ctaRecs.filter(r => r.fatigueRisk === "high").length;
  const commerceTiming = ctaTotal === 0 ? 0.7 :
    Math.max(0.2, 1.0 - (ctaHighFatigue * 0.2));

  return {
    communityHealthScore: Math.round(communityHealthScore * 100) / 100,
    engagementQualityScore: Math.round(engagementQuality * 100) / 100,
    moderationConfidenceScore: Math.round(moderationConfidence * 100) / 100,
    seoQualityScore: Math.round(seoQuality * 100) / 100,
    thumbnailPerformanceScore: Math.round(thumbnailPerformance * 100) / 100,
    interruptQualityScore: Math.round(interruptQuality * 100) / 100,
    commerceTimingScore: Math.round(commerceTiming * 100) / 100,
  };
}

export async function getCrewActions(userId: string, sessionId: number, limit = 50): Promise<any[]> {
  const session = await db.select()
    .from(liveProductionCrewSessions)
    .where(and(
      eq(liveProductionCrewSessions.id, sessionId),
      eq(liveProductionCrewSessions.userId, userId)
    ))
    .limit(1);

  if (session.length === 0) return [];

  const actions = await db.select()
    .from(liveCommunityActions)
    .where(eq(liveCommunityActions.sessionId, sessionId))
    .orderBy(desc(liveCommunityActions.createdAt))
    .limit(limit);

  return actions;
}

export function isLowRiskAction(actionType: string): boolean {
  return (LOW_RISK_AUTO_ACTIONS as readonly string[]).includes(actionType);
}

export function isHighRiskTopic(topic: string): boolean {
  return (HIGH_RISK_ESCALATION_TOPICS as readonly string[]).includes(topic);
}
