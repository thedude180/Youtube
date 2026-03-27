import { db } from "../db";
import {
  liveCommandCenterSessions, liveCommandCenterActions, liveCommandCenterPanelStates,
  liveChatAggregates, liveCommerceSignals, liveTrustBudgetEvents,
  liveMetadataUpdateReasons, liveRecoveryActions,
  multistreamSessions, multistreamDestinations, liveMetadataVariants,
  livePublishAttempts, liveReconciliationRuns
} from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

const PANELS = [
  "broadcast_state", "metadata_state", "ai_actions", "community_chat",
  "commerce_monetization", "trust_risk", "recovery_exception",
  "whats_running", "decision_theater"
] as const;

export async function startCommandCenterSession(userId: string, multistreamSessionId?: number): Promise<any> {
  const existing = await db.select()
    .from(liveCommandCenterSessions)
    .where(and(eq(liveCommandCenterSessions.userId, userId), eq(liveCommandCenterSessions.status, "active")))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [session] = await db.insert(liveCommandCenterSessions).values({
    userId,
    multistreamSessionId,
    status: "active",
    activePanels: [...PANELS],
  }).returning();

  for (const panel of PANELS) {
    await db.insert(liveCommandCenterPanelStates).values({
      sessionId: session.id,
      panel,
      status: "healthy",
    });
  }

  appendEvent("command_center.session_started", "live", "command_center", {
    sessionId: session.id,
  }, "command-center-service");

  return session;
}

export async function endCommandCenterSession(userId: string): Promise<boolean> {
  const sessions = await db.select()
    .from(liveCommandCenterSessions)
    .where(and(eq(liveCommandCenterSessions.userId, userId), eq(liveCommandCenterSessions.status, "active")));

  for (const s of sessions) {
    await db.update(liveCommandCenterSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(liveCommandCenterSessions.id, s.id));
  }
  return sessions.length > 0;
}

export async function getCommandCenterState(userId: string): Promise<any> {
  const [session] = await db.select()
    .from(liveCommandCenterSessions)
    .where(and(eq(liveCommandCenterSessions.userId, userId), eq(liveCommandCenterSessions.status, "active")))
    .limit(1);

  if (!session) return null;

  const panelStates = await db.select()
    .from(liveCommandCenterPanelStates)
    .where(eq(liveCommandCenterPanelStates.sessionId, session.id));

  const broadcastState = await getBroadcastState(userId);
  const metadataState = await getMetadataState(session.multistreamSessionId);
  const aiActions = await getAIActionsState(userId);
  const chatIntelligence = await getChatIntelligence(session.id);
  const commerceSignalsData = await getCommerceSignals(userId, session.id);
  const trustRisk = await getTrustRiskState(userId, session.id);
  const recoveryState = await getRecoveryState(userId, session.id);
  const whatsRunning = await getWhatsRunningState(userId);

  const scores = computeScores(broadcastState, trustRisk, recoveryState, commerceSignalsData);

  await db.update(liveCommandCenterSessions).set({
    clarityScore: scores.clarityScore,
    opsHealthScore: scores.opsHealthScore,
    destStabilityScore: scores.destStabilityScore,
    monetizationTimingScore: scores.monetizationTimingScore,
    trustPressureScore: scores.trustPressureScore,
    recoveryReadinessScore: scores.recoveryReadinessScore,
  }).where(eq(liveCommandCenterSessions.id, session.id));

  return {
    session: { ...session, ...scores },
    panels: {
      broadcastState,
      metadataState,
      aiActions,
      chatIntelligence,
      commerceSignals: commerceSignalsData,
      trustRisk,
      recovery: recoveryState,
      whatsRunning,
    },
    panelStates,
    scores,
  };
}

async function getBroadcastState(userId: string): Promise<any> {
  const sessions = await db.select()
    .from(multistreamSessions)
    .where(and(eq(multistreamSessions.userId, userId), eq(multistreamSessions.status, "active")))
    .limit(1);

  if (sessions.length === 0) {
    return { active: false, source: null, destinations: [], uptime: 0, health: 1 };
  }

  const session = sessions[0];
  const destinations = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.sessionId, session.id));

  const activeCount = destinations.filter(d => d.status === "active").length;
  const failedCount = destinations.filter(d => d.status === "failed").length;
  const health = destinations.length > 0 ? activeCount / destinations.length : 1;
  const uptime = session.startedAt ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000) : 0;

  return {
    active: true,
    source: { platform: session.sourcePlatform, streamId: session.sourceStreamId },
    destinations: destinations.map(d => ({
      id: d.id, platform: d.platform, status: d.status,
      launchOrder: d.launchOrder, retryCount: d.retryCount,
      failureReason: d.failureReason,
      launchedAt: d.launchedAt,
    })),
    uptime,
    health,
    activeCount,
    failedCount,
    totalCount: destinations.length,
  };
}

async function getMetadataState(multistreamSessionId: number | null | undefined): Promise<any> {
  if (!multistreamSessionId) return { variants: [], updateReasons: [] };

  const variants = await db.select()
    .from(liveMetadataVariants)
    .where(eq(liveMetadataVariants.sessionId, multistreamSessionId));

  const reasons = await db.select()
    .from(liveMetadataUpdateReasons)
    .where(eq(liveMetadataUpdateReasons.sessionId, multistreamSessionId))
    .orderBy(desc(liveMetadataUpdateReasons.appliedAt))
    .limit(20);

  return {
    variants: variants.map(v => ({
      platform: v.platform, title: v.title, category: v.category,
      tags: v.tags, hashtags: v.hashtags, orientation: v.orientation,
      generatedAt: v.generatedAt,
    })),
    updateReasons: reasons,
  };
}

async function getAIActionsState(userId: string): Promise<any> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentActions = await db.select()
    .from(liveCommandCenterActions)
    .where(and(eq(liveCommandCenterActions.userId, userId), gte(liveCommandCenterActions.executedAt, cutoff)))
    .orderBy(desc(liveCommandCenterActions.executedAt))
    .limit(20);

  const active = recentActions.filter(a => a.result && (a.result as any).status === "running");
  const pending = recentActions.filter(a => !a.approved);
  const blocked = recentActions.filter(a => a.approvalClass === "red" && !a.approved);

  return {
    recentActions: recentActions.map(a => ({
      id: a.id, actionType: a.actionType, panel: a.panel,
      approvalClass: a.approvalClass, approved: a.approved,
      reason: a.reason, executedAt: a.executedAt,
    })),
    activeCount: active.length,
    pendingCount: pending.length,
    blockedCount: blocked.length,
  };
}

async function getChatIntelligence(sessionId: number): Promise<any> {
  const aggregates = await db.select()
    .from(liveChatAggregates)
    .where(eq(liveChatAggregates.sessionId, sessionId))
    .orderBy(desc(liveChatAggregates.windowStart))
    .limit(10);

  const totalMessages = aggregates.reduce((sum, a) => sum + (a.messageCount || 0), 0);
  const avgSentiment = aggregates.length > 0
    ? aggregates.reduce((sum, a) => sum + (a.sentimentScore || 0), 0) / aggregates.length
    : 0;
  const totalModAlerts = aggregates.reduce((sum, a) => sum + (a.moderationAlerts || 0), 0);

  const allQuestions: string[] = [];
  for (const a of aggregates) {
    if (a.topQuestions) allQuestions.push(...(a.topQuestions as string[]));
  }

  return {
    aggregates: aggregates.map(a => ({
      platform: a.platform, messageCount: a.messageCount,
      uniqueUsers: a.uniqueUsers, sentimentScore: a.sentimentScore,
      topQuestions: a.topQuestions, moderationAlerts: a.moderationAlerts,
      windowStart: a.windowStart,
    })),
    summary: { totalMessages, avgSentiment, totalModAlerts, topQuestions: [...new Set(allQuestions)].slice(0, 5) },
  };
}

async function getCommerceSignals(userId: string, sessionId: number): Promise<any> {
  const signals = await db.select()
    .from(liveCommerceSignals)
    .where(and(eq(liveCommerceSignals.userId, userId), eq(liveCommerceSignals.sessionId, sessionId)))
    .orderBy(desc(liveCommerceSignals.detectedAt))
    .limit(10);

  const avgFatigue = signals.length > 0
    ? signals.reduce((sum, s) => sum + (s.ctaFatigueRisk || 0), 0) / signals.length
    : 0;

  return {
    signals: signals.map(s => ({
      signalType: s.signalType, opportunity: s.opportunity,
      confidence: s.confidence, ctaFatigueRisk: s.ctaFatigueRisk,
      sponsorSafe: s.sponsorSafe, revenueIntent: s.revenueIntent,
      detectedAt: s.detectedAt,
    })),
    avgCtaFatigueRisk: avgFatigue,
    activeOpportunities: signals.filter(s => (s.confidence || 0) > 0.6).length,
  };
}

async function getTrustRiskState(userId: string, sessionId: number): Promise<any> {
  const events = await db.select()
    .from(liveTrustBudgetEvents)
    .where(and(eq(liveTrustBudgetEvents.userId, userId), eq(liveTrustBudgetEvents.sessionId, sessionId)))
    .orderBy(desc(liveTrustBudgetEvents.occurredAt))
    .limit(20);

  const latestBudget = events.length > 0 ? (events[0].budgetAfter || 100) : 100;
  const totalCost = events.reduce((sum, e) => sum + (e.cost || 0), 0);
  const pressure = Math.max(0, Math.min(1, 1 - latestBudget / 100));

  return {
    events: events.map(e => ({
      eventType: e.eventType, budgetBefore: e.budgetBefore,
      budgetAfter: e.budgetAfter, cost: e.cost,
      source: e.source, reason: e.reason, occurredAt: e.occurredAt,
    })),
    currentBudget: latestBudget,
    totalCost,
    pressure,
    warnings: pressure > 0.7 ? ["Trust budget critically low — restrict automations"] : [],
  };
}

async function getRecoveryState(userId: string, sessionId: number): Promise<any> {
  const actions = await db.select()
    .from(liveRecoveryActions)
    .where(and(eq(liveRecoveryActions.userId, userId), eq(liveRecoveryActions.sessionId, sessionId)))
    .orderBy(desc(liveRecoveryActions.requestedAt))
    .limit(20);

  const pending = actions.filter(a => a.status === "pending").length;
  const completed = actions.filter(a => a.status === "completed").length;
  const failed = actions.filter(a => a.status === "failed").length;

  return {
    actions: actions.map(a => ({
      id: a.id, actionType: a.actionType, targetPlatform: a.targetPlatform,
      status: a.status, approvalRequired: a.approvalRequired,
      approved: a.approved, requestedAt: a.requestedAt,
    })),
    pending, completed, failed,
    readiness: failed === 0 && pending <= 2 ? 1 : pending > 5 ? 0.3 : 0.7,
  };
}

async function getWhatsRunningState(userId: string): Promise<any> {
  const activeSessions = await db.select()
    .from(multistreamSessions)
    .where(and(eq(multistreamSessions.userId, userId), eq(multistreamSessions.status, "active")));

  return {
    activeWorkflows: activeSessions.length,
    relayTasks: activeSessions.length > 0 ? activeSessions.length : 0,
    metadataUpdateTasks: 0,
    clippingTasks: 0,
    postStreamReady: activeSessions.length === 0,
    tasks: activeSessions.map(s => ({
      type: "multistream_session",
      id: s.id,
      sourcePlatform: s.sourcePlatform,
      status: s.status,
      destinations: s.destinationCount,
    })),
  };
}

function computeScores(broadcast: any, trust: any, recovery: any, commerce: any): any {
  const opsHealthScore = broadcast.active ? broadcast.health : 1;
  const destStabilityScore = broadcast.active
    ? (broadcast.totalCount > 0 ? (broadcast.totalCount - broadcast.failedCount) / broadcast.totalCount : 1)
    : 1;
  const trustPressureScore = trust.pressure || 0;
  const recoveryReadinessScore = recovery.readiness || 1;
  const monetizationTimingScore = commerce.activeOpportunities > 0 ? Math.min(1, commerce.activeOpportunities * 0.25) : 0;
  const clarityScore = Math.min(1,
    opsHealthScore * 0.25 + destStabilityScore * 0.2 +
    (1 - trustPressureScore) * 0.2 + recoveryReadinessScore * 0.2 +
    0.15
  );

  return { clarityScore, opsHealthScore, destStabilityScore, monetizationTimingScore, trustPressureScore, recoveryReadinessScore };
}

export async function executeCommandCenterAction(
  userId: string,
  actionType: string,
  panel: string,
  targetType?: string,
  targetId?: string,
  reason?: string
): Promise<any> {
  const [session] = await db.select()
    .from(liveCommandCenterSessions)
    .where(and(eq(liveCommandCenterSessions.userId, userId), eq(liveCommandCenterSessions.status, "active")))
    .limit(1);

  if (!session) return { success: false, error: "No active command center session" };

  const APPROVAL_MAP: Record<string, string> = {
    retry_destination: "yellow",
    isolate_destination: "yellow",
    suppress_metadata_update: "green",
    pause_automation_lane: "yellow",
    approve_red_band: "red",
    approve_yellow_band: "yellow",
    trigger_post_stream: "green",
    export_incident: "green",
  };

  const approvalClass = APPROVAL_MAP[actionType] || "yellow";
  const approved = approvalClass === "green";

  const [action] = await db.insert(liveCommandCenterActions).values({
    sessionId: session.id,
    userId,
    actionType,
    targetType,
    targetId,
    panel,
    approvalClass,
    approved,
    reason: reason || `Manual ${actionType} action`,
    result: { status: approved ? "executed" : "pending_approval" },
  }).returning();

  if (approved && (actionType === "retry_destination" || actionType === "isolate_destination")) {
    await db.insert(liveRecoveryActions).values({
      sessionId: session.id,
      userId,
      actionType,
      targetPlatform: targetType,
      targetDestinationId: targetId ? parseInt(targetId) : undefined,
      status: "pending",
      approvalRequired: approvalClass !== "green",
      approved,
    });
  }

  appendEvent(`command_center.action_${actionType}`, "live", panel, {
    sessionId: session.id, actionId: action.id,
    approvalClass, approved,
  }, "command-center-service");

  return { success: true, action, approved, approvalClass };
}

export async function getRecentActions(userId: string, limit: number = 30): Promise<any[]> {
  return db.select()
    .from(liveCommandCenterActions)
    .where(eq(liveCommandCenterActions.userId, userId))
    .orderBy(desc(liveCommandCenterActions.executedAt))
    .limit(limit);
}

export async function getCommandCenterScores(userId: string): Promise<any> {
  const [session] = await db.select()
    .from(liveCommandCenterSessions)
    .where(and(eq(liveCommandCenterSessions.userId, userId), eq(liveCommandCenterSessions.status, "active")))
    .limit(1);

  if (!session) return {
    clarityScore: 1, opsHealthScore: 1, destStabilityScore: 1,
    monetizationTimingScore: 0, trustPressureScore: 0, recoveryReadinessScore: 1,
  };

  return {
    clarityScore: session.clarityScore,
    opsHealthScore: session.opsHealthScore,
    destStabilityScore: session.destStabilityScore,
    monetizationTimingScore: session.monetizationTimingScore,
    trustPressureScore: session.trustPressureScore,
    recoveryReadinessScore: session.recoveryReadinessScore,
  };
}
