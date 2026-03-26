import { db } from "../db";
import {
  trustBudgetRecords, trustBudgetPeriods, approvalMatrixRules, approvalDecisions,
  governanceAuditLogs, channelImmuneEvents, communityTrustSignals,
  operatorOverrideRecords, overrideReasonRecords,
} from "@shared/schema";
import { eq, and, desc, gte, sql, count, avg, lte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("trust-governance");

const BUDGET_VIOLATION_THRESHOLD = 20;
const AUTO_TIGHTEN_THRESHOLD = 40;
const BUDGET_RESET_INTERVAL_HOURS = 24;
const DEFAULT_BUDGET_TOTAL = 100;
const IMMUNE_WINDOW_MS = 3600_000;
const IMMUNE_DISLIKE_SPIKE_THRESHOLD = 5;
const IMMUNE_REPORT_SPIKE_THRESHOLD = 3;
const IMMUNE_SPAM_THRESHOLD = 20;

// ==================== GOVERNANCE AUDIT TRAIL ====================

export async function logGovernanceAction(
  userId: string,
  action: string,
  domain: string,
  details: Record<string, any> = {},
  severity: string = "info",
  outcome: string = "success",
  performedBy: string = "system",
): Promise<void> {
  try {
    await db.insert(governanceAuditLogs).values({
      userId, action, domain, severity, details, outcome, performedBy,
    });
  } catch (err: any) {
    logger.error("Failed to log governance action", { error: err?.message });
  }
}

export async function getGovernanceAuditLogs(
  userId: string,
  options: { domain?: string; limit?: number; offset?: number } = {},
) {
  const { domain, limit = 50, offset = 0 } = options;
  const conditions = [eq(governanceAuditLogs.userId, userId)];
  if (domain) conditions.push(eq(governanceAuditLogs.domain, domain));

  const items = await db.select().from(governanceAuditLogs)
    .where(and(...conditions))
    .orderBy(desc(governanceAuditLogs.createdAt))
    .limit(Math.min(limit, 200))
    .offset(offset);

  const [{ cnt }] = await db.select({ cnt: count() }).from(governanceAuditLogs)
    .where(and(...conditions));

  return { items, total: cnt };
}

// ==================== TRUST BUDGET HARDENING ====================

export async function getOrCreateTrustBudget(userId: string, agentName: string) {
  const [existing] = await db.select().from(trustBudgetRecords)
    .where(and(eq(trustBudgetRecords.userId, userId), eq(trustBudgetRecords.agentName, agentName)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db.insert(trustBudgetRecords).values({
    userId, agentName, budgetTotal: DEFAULT_BUDGET_TOTAL, budgetRemaining: DEFAULT_BUDGET_TOTAL,
  }).returning();

  return created;
}

export async function deductTrustBudget(
  userId: string,
  agentName: string,
  amount: number,
  reason: string,
): Promise<{ allowed: boolean; remaining: number; violation: boolean; autoTightened: boolean }> {
  const budget = await getOrCreateTrustBudget(userId, agentName);
  const newRemaining = Math.max(0, (budget.budgetRemaining ?? DEFAULT_BUDGET_TOTAL) - amount);
  const violation = newRemaining <= BUDGET_VIOLATION_THRESHOLD;
  const autoTightened = newRemaining <= AUTO_TIGHTEN_THRESHOLD && (budget.budgetRemaining ?? DEFAULT_BUDGET_TOTAL) > AUTO_TIGHTEN_THRESHOLD;

  if (newRemaining <= 0) {
    await logGovernanceAction(userId, "trust_budget_exhausted", "trust_budget", {
      agentName, requestedAmount: amount, reason,
    }, "critical", "blocked");

    return { allowed: false, remaining: 0, violation: true, autoTightened: false };
  }

  await db.update(trustBudgetRecords).set({
    budgetRemaining: newRemaining,
    lastDeductionAmount: amount,
    lastDeductionReason: reason,
    updatedAt: new Date(),
  }).where(eq(trustBudgetRecords.id, budget.id));

  if (violation) {
    await logGovernanceAction(userId, "trust_budget_violation", "trust_budget", {
      agentName, remaining: newRemaining, reason,
    }, "high", "warning");
  }

  if (autoTightened) {
    await logGovernanceAction(userId, "trust_budget_auto_tighten", "trust_budget", {
      agentName, remaining: newRemaining, previousRemaining: budget.budgetRemaining,
    }, "warning", "auto_tightened");
  }

  return { allowed: true, remaining: newRemaining, violation, autoTightened };
}

export async function resetTrustBudget(userId: string, agentName: string, newTotal?: number): Promise<void> {
  const budget = await getOrCreateTrustBudget(userId, agentName);
  const total = newTotal ?? budget.budgetTotal ?? DEFAULT_BUDGET_TOTAL;

  await db.insert(trustBudgetPeriods).values({
    userId, agentName,
    periodStart: budget.updatedAt ?? new Date(),
    periodEnd: new Date(),
    startingBudget: budget.budgetTotal ?? DEFAULT_BUDGET_TOTAL,
    endingBudget: budget.budgetRemaining ?? DEFAULT_BUDGET_TOTAL,
    deductionsCount: 0,
    totalDeducted: (budget.budgetTotal ?? DEFAULT_BUDGET_TOTAL) - (budget.budgetRemaining ?? DEFAULT_BUDGET_TOTAL),
  });

  await db.update(trustBudgetRecords).set({
    budgetTotal: total,
    budgetRemaining: total,
    lastDeductionAmount: null,
    lastDeductionReason: null,
    updatedAt: new Date(),
  }).where(eq(trustBudgetRecords.id, budget.id));

  await logGovernanceAction(userId, "trust_budget_reset", "trust_budget", {
    agentName, newTotal: total,
  }, "info", "success");
}

export async function getTrustBudgetHistory(userId: string, agentName?: string, limit: number = 20) {
  const conditions = [eq(trustBudgetPeriods.userId, userId)];
  if (agentName) conditions.push(eq(trustBudgetPeriods.agentName, agentName));

  return db.select().from(trustBudgetPeriods)
    .where(and(...conditions))
    .orderBy(desc(trustBudgetPeriods.createdAt))
    .limit(Math.min(limit, 100));
}

export async function getTrustBudgetStatus(userId: string) {
  const budgets = await db.select().from(trustBudgetRecords)
    .where(eq(trustBudgetRecords.userId, userId))
    .orderBy(trustBudgetRecords.agentName);

  return budgets.map(b => ({
    agentName: b.agentName,
    total: b.budgetTotal,
    remaining: b.budgetRemaining,
    used: (b.budgetTotal ?? DEFAULT_BUDGET_TOTAL) - (b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL),
    percentUsed: Math.round(((b.budgetTotal ?? DEFAULT_BUDGET_TOTAL) - (b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL)) / (b.budgetTotal ?? DEFAULT_BUDGET_TOTAL) * 100),
    violation: (b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL) <= BUDGET_VIOLATION_THRESHOLD,
    autoTightened: (b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL) <= AUTO_TIGHTEN_THRESHOLD,
  }));
}

export function getAutoTightenMultiplier(budgetRemaining: number): number {
  if (budgetRemaining <= BUDGET_VIOLATION_THRESHOLD) return 0;
  if (budgetRemaining <= AUTO_TIGHTEN_THRESHOLD) return 0.5;
  return 1.0;
}

// ==================== APPROVAL MATRIX ====================

const DEFAULT_RULES: Array<{
  actionClass: string; bandClass: string; defaultState: string;
  approver: string; confidenceThreshold: number | null; description: string;
}> = [
  { actionClass: "content_publish", bandClass: "GREEN", defaultState: "auto-approved", approver: "system", confidenceThreshold: null, description: "Publish content to platforms" },
  { actionClass: "title_change", bandClass: "YELLOW", defaultState: "confidence-gate", approver: "system", confidenceThreshold: 0.7, description: "Change video/stream titles" },
  { actionClass: "bulk_action", bandClass: "YELLOW", defaultState: "confidence-gate", approver: "system", confidenceThreshold: 0.8, description: "Bulk operations across content" },
  { actionClass: "account_setting", bandClass: "RED", defaultState: "human-required", approver: "admin", confidenceThreshold: null, description: "Modify account-level settings" },
  { actionClass: "financial_action", bandClass: "RED", defaultState: "human-required", approver: "admin", confidenceThreshold: null, description: "Financial or monetization changes" },
  { actionClass: "automation_toggle", bandClass: "YELLOW", defaultState: "confidence-gate", approver: "system", confidenceThreshold: 0.6, description: "Enable/disable automations" },
  { actionClass: "cross_post", bandClass: "GREEN", defaultState: "auto-approved", approver: "system", confidenceThreshold: null, description: "Cross-post content to other platforms" },
  { actionClass: "seo_optimization", bandClass: "GREEN", defaultState: "auto-approved", approver: "system", confidenceThreshold: null, description: "SEO metadata optimization" },
  { actionClass: "community_moderation", bandClass: "YELLOW", defaultState: "confidence-gate", approver: "system", confidenceThreshold: 0.65, description: "Community moderation actions" },
  { actionClass: "delete_content", bandClass: "RED", defaultState: "human-required", approver: "admin", confidenceThreshold: null, description: "Delete or archive content" },
];

export async function seedApprovalMatrix(): Promise<number> {
  let seeded = 0;
  for (const rule of DEFAULT_RULES) {
    try {
      const result = await db.insert(approvalMatrixRules).values({
        actionClass: rule.actionClass,
        bandClass: rule.bandClass,
        defaultState: rule.defaultState,
        approver: rule.approver,
        confidenceThreshold: rule.confidenceThreshold,
        description: rule.description,
      }).onConflictDoNothing().returning();
      if (result.length > 0) seeded++;
    } catch { continue; }
  }
  return seeded;
}

export async function evaluateApproval(
  userId: string,
  actionClass: string,
  confidence: number = 1.0,
  metadata: Record<string, any> = {},
): Promise<{ decision: "approved" | "denied" | "pending_human"; reason: string; ruleId: number | null }> {
  const [rule] = await db.select().from(approvalMatrixRules)
    .where(eq(approvalMatrixRules.actionClass, actionClass))
    .limit(1);

  if (!rule) {
    const decision = "pending_human" as const;
    await recordApprovalDecision(userId, actionClass, null, decision, "system", "No rule defined — requires human review (fail-safe)", confidence, metadata);
    return { decision, reason: "No rule defined — requires human review (fail-safe)", ruleId: null };
  }

  const budgets = await db.select().from(trustBudgetRecords)
    .where(eq(trustBudgetRecords.userId, userId));
  const budgetRemaining = budgets.length > 0
    ? Math.min(...budgets.map(b => b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL))
    : DEFAULT_BUDGET_TOTAL;
  const tightenMultiplier = getAutoTightenMultiplier(budgetRemaining);

  let decision: "approved" | "denied" | "pending_human";
  let reason: string;

  if (tightenMultiplier === 0) {
    decision = "denied";
    reason = `Trust budget exhausted (${budgetRemaining} remaining) — action blocked`;
  } else if (rule.bandClass === "GREEN") {
    decision = "approved";
    reason = "GREEN band — auto-approved";
  } else if (rule.bandClass === "YELLOW") {
    const effectiveThreshold = (rule.confidenceThreshold ?? 0.7) / tightenMultiplier;
    if (confidence >= Math.min(effectiveThreshold, 1.0)) {
      decision = "approved";
      reason = `YELLOW band — confidence ${confidence.toFixed(2)} >= threshold ${effectiveThreshold.toFixed(2)}`;
    } else {
      decision = "pending_human";
      reason = `YELLOW band — confidence ${confidence.toFixed(2)} < threshold ${effectiveThreshold.toFixed(2)}, requires review`;
    }
  } else {
    decision = "pending_human";
    reason = `RED band — human approval required for ${actionClass}`;
  }

  await recordApprovalDecision(userId, actionClass, rule.id, decision, rule.approver, reason, confidence, metadata);
  await logGovernanceAction(userId, "approval_evaluated", "approval_matrix", {
    actionClass, bandClass: rule.bandClass, decision, confidence, tightenMultiplier,
  }, decision === "denied" ? "high" : "info", decision);

  return { decision, reason, ruleId: rule.id };
}

async function recordApprovalDecision(
  userId: string, actionClass: string, ruleId: number | null,
  decision: string, decidedBy: string, reason: string,
  confidence: number, metadata: Record<string, any>,
) {
  await db.insert(approvalDecisions).values({
    userId, actionClass, ruleId, decision, decidedBy, reason, confidence, metadata,
  });
}

export async function getApprovalHistory(userId: string, limit: number = 50) {
  return db.select().from(approvalDecisions)
    .where(eq(approvalDecisions.userId, userId))
    .orderBy(desc(approvalDecisions.decidedAt))
    .limit(Math.min(limit, 200));
}

export async function getApprovalMatrixRules() {
  return db.select().from(approvalMatrixRules).orderBy(approvalMatrixRules.actionClass);
}

export async function updateApprovalRule(
  actionClass: string,
  updates: { bandClass?: string; confidenceThreshold?: number; description?: string },
) {
  return db.update(approvalMatrixRules).set({
    ...updates,
    updatedAt: new Date(),
  }).where(eq(approvalMatrixRules.actionClass, actionClass));
}

// ==================== TENANT ISOLATION ====================

export function validateTenantAccess(requestUserId: string, resourceUserId: string): boolean {
  return requestUserId === resourceUserId;
}

export function enforceTenantIsolation(
  requestUserId: string,
  resourceUserId: string,
  resourceType: string,
): { allowed: boolean; reason?: string } {
  if (!requestUserId) {
    return { allowed: false, reason: "No authenticated user" };
  }
  if (!resourceUserId) {
    return { allowed: false, reason: "Resource has no owner" };
  }
  if (requestUserId !== resourceUserId) {
    return { allowed: false, reason: `Tenant isolation violation: user ${requestUserId} cannot access ${resourceType} owned by ${resourceUserId}` };
  }
  return { allowed: true };
}

export function buildTenantContext(userId: string): {
  userId: string;
  isolationScope: string;
  aiContextBoundary: string;
} {
  return {
    userId,
    isolationScope: `tenant:${userId}`,
    aiContextBoundary: `Only process data belonging to user ${userId}. Never reference or return data from other users.`,
  };
}

export async function auditTenantAccess(
  requestUserId: string,
  resourceUserId: string,
  resourceType: string,
  allowed: boolean,
) {
  if (!allowed) {
    await logGovernanceAction(requestUserId, "tenant_isolation_violation", "tenant_isolation", {
      resourceUserId, resourceType,
    }, "critical", "blocked");
  }
}

// ==================== CHANNEL IMMUNE SYSTEM ====================

interface ThreatIndicators {
  dislikeRate?: number;
  reportCount?: number;
  spamCommentCount?: number;
  subscriberDropRate?: number;
  viewDropRate?: number;
}

export async function analyzeChannelThreats(
  userId: string,
  channelId: number | null,
  indicators: ThreatIndicators,
): Promise<{ threats: Array<{ type: string; severity: string; description: string }>; defensiveActions: string[] }> {
  const threats: Array<{ type: string; severity: string; description: string }> = [];
  const defensiveActions: string[] = [];

  if ((indicators.dislikeRate ?? 0) > IMMUNE_DISLIKE_SPIKE_THRESHOLD) {
    const severity = (indicators.dislikeRate ?? 0) > IMMUNE_DISLIKE_SPIKE_THRESHOLD * 2 ? "critical" : "high";
    threats.push({ type: "dislike_bomb", severity, description: `Dislike rate spike: ${indicators.dislikeRate}x normal` });
    defensiveActions.push("Hide like/dislike counts temporarily");
    defensiveActions.push("Enable comment moderation hold");
  }

  if ((indicators.reportCount ?? 0) > IMMUNE_REPORT_SPIKE_THRESHOLD) {
    threats.push({ type: "mass_report", severity: "critical", description: `${indicators.reportCount} reports received in monitoring window` });
    defensiveActions.push("Escalate to platform support preemptively");
    defensiveActions.push("Archive content backup");
  }

  if ((indicators.spamCommentCount ?? 0) > IMMUNE_SPAM_THRESHOLD) {
    threats.push({ type: "comment_spam", severity: "high", description: `${indicators.spamCommentCount} spam comments detected` });
    defensiveActions.push("Enable strict comment filtering");
    defensiveActions.push("Temporarily restrict new commenters");
  }

  if ((indicators.subscriberDropRate ?? 0) > 5) {
    threats.push({ type: "subscriber_drop", severity: "medium", description: `Subscriber loss rate: ${indicators.subscriberDropRate}% in window` });
    defensiveActions.push("Analyze recent content for audience mismatch");
  }

  if ((indicators.viewDropRate ?? 0) > 30) {
    threats.push({ type: "view_suppression", severity: "high", description: `View drop: ${indicators.viewDropRate}% below baseline` });
    defensiveActions.push("Check for algorithm suppression indicators");
    defensiveActions.push("Diversify content distribution");
  }

  for (const threat of threats) {
    await db.insert(channelImmuneEvents).values({
      userId,
      channelId,
      threatType: threat.type,
      severity: threat.severity,
      indicators: indicators as Record<string, any>,
      defensiveAction: defensiveActions.join("; "),
      status: "detected",
    });

    await logGovernanceAction(userId, "channel_threat_detected", "channel_immune", {
      threatType: threat.type, severity: threat.severity, channelId,
    }, threat.severity, "detected");
  }

  return { threats, defensiveActions };
}

export async function getChannelImmuneHistory(userId: string, limit: number = 50) {
  return db.select().from(channelImmuneEvents)
    .where(eq(channelImmuneEvents.userId, userId))
    .orderBy(desc(channelImmuneEvents.createdAt))
    .limit(Math.min(limit, 200));
}

export async function resolveChannelThreat(threatId: number, userId: string): Promise<boolean> {
  const result = await db.update(channelImmuneEvents).set({
    status: "resolved",
    resolvedAt: new Date(),
  }).where(and(eq(channelImmuneEvents.id, threatId), eq(channelImmuneEvents.userId, userId))).returning();
  return result.length > 0;
}

// ==================== COMMUNITY TRUST LOOP ====================

export async function ingestCommunitySignal(
  userId: string,
  signalType: string,
  value: number,
  source: string,
  weight: number = 1.0,
  metadata: Record<string, any> = {},
): Promise<void> {
  await db.insert(communityTrustSignals).values({
    userId, signalType, value, weight, source, metadata,
  });
}

export async function computeCommunityTrustScore(userId: string): Promise<{
  score: number;
  signals: Array<{ type: string; avgValue: number; count: number; weight: number }>;
  recommendation: string;
}> {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const signals = await db.select({
    signalType: communityTrustSignals.signalType,
    avgValue: avg(communityTrustSignals.value),
    cnt: count(),
    avgWeight: avg(communityTrustSignals.weight),
  }).from(communityTrustSignals)
    .where(and(eq(communityTrustSignals.userId, userId), gte(communityTrustSignals.createdAt, cutoff)))
    .groupBy(communityTrustSignals.signalType);

  if (signals.length === 0) {
    return { score: 75, signals: [], recommendation: "No community signals yet — keep creating content to build audience trust" };
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;
  const signalDetails: Array<{ type: string; avgValue: number; count: number; weight: number }> = [];

  for (const s of signals) {
    const avgVal = Number(s.avgValue) || 0;
    const w = Number(s.avgWeight) || 1;
    const c = s.cnt || 0;
    totalWeightedScore += avgVal * w;
    totalWeight += w;
    signalDetails.push({ type: s.signalType, avgValue: avgVal, count: c, weight: w });
  }

  const score = totalWeight > 0 ? Math.max(0, Math.min(100, Math.round(totalWeightedScore / totalWeight))) : 75;

  let recommendation = "Community trust is healthy";
  if (score < 30) recommendation = "Community trust is critically low — review recent audience feedback and address concerns";
  else if (score < 50) recommendation = "Community trust needs attention — consider engaging directly with your audience";
  else if (score < 70) recommendation = "Community trust is moderate — continue building positive engagement";

  return { score, signals: signalDetails, recommendation };
}

export async function applyCommunityTrustToBudget(userId: string, agentName: string = "community"): Promise<{
  communityScore: number;
  budgetAdjustment: number;
}> {
  const { score } = await computeCommunityTrustScore(userId);
  let budgetAdjustment = 0;

  if (score >= 80) {
    budgetAdjustment = 5;
  } else if (score < 40) {
    budgetAdjustment = -10;
  } else if (score < 60) {
    budgetAdjustment = -5;
  }

  if (budgetAdjustment !== 0) {
    const budget = await getOrCreateTrustBudget(userId, agentName);
    const newRemaining = Math.max(0, Math.min(
      budget.budgetTotal ?? DEFAULT_BUDGET_TOTAL,
      (budget.budgetRemaining ?? DEFAULT_BUDGET_TOTAL) + budgetAdjustment,
    ));
    await db.update(trustBudgetRecords).set({
      budgetRemaining: newRemaining,
      updatedAt: new Date(),
      metadata: { lastCommunityAdjustment: budgetAdjustment, communityScore: score },
    }).where(eq(trustBudgetRecords.id, budget.id));

    await logGovernanceAction(userId, "community_trust_budget_adjustment", "community_trust", {
      communityScore: score, budgetAdjustment, newRemaining, agentName,
    }, budgetAdjustment < 0 ? "warning" : "info", "success");
  }

  return { communityScore: score, budgetAdjustment };
}

// ==================== TRUST-RISK SIMULATOR ====================

interface SimulationScenario {
  action: string;
  budgetCost: number;
  confidence: number;
  communityImpact: number;
}

export async function simulateTrustRisk(
  userId: string,
  scenarios: SimulationScenario[],
): Promise<{
  results: Array<{
    action: string;
    approvalDecision: string;
    budgetAfter: number;
    riskLevel: string;
    recommendation: string;
  }>;
  overallRisk: string;
}> {
  const budgets = await db.select().from(trustBudgetRecords)
    .where(eq(trustBudgetRecords.userId, userId));

  const currentBudget = budgets.length > 0
    ? budgets.reduce((sum, b) => sum + (b.budgetRemaining ?? DEFAULT_BUDGET_TOTAL), 0) / budgets.length
    : DEFAULT_BUDGET_TOTAL;

  let simulatedBudget = currentBudget;
  const results: Array<{
    action: string; approvalDecision: string; budgetAfter: number;
    riskLevel: string; recommendation: string;
  }> = [];

  for (const scenario of scenarios) {
    simulatedBudget = Math.max(0, simulatedBudget - scenario.budgetCost);
    const tightenMult = getAutoTightenMultiplier(simulatedBudget);

    let approvalDecision: string;
    if (tightenMult === 0) {
      approvalDecision = "denied";
    } else {
      const [rule] = await db.select().from(approvalMatrixRules)
        .where(eq(approvalMatrixRules.actionClass, scenario.action))
        .limit(1);

      if (!rule || rule.bandClass === "GREEN") {
        approvalDecision = "approved";
      } else if (rule.bandClass === "YELLOW") {
        const threshold = (rule.confidenceThreshold ?? 0.7) / tightenMult;
        approvalDecision = scenario.confidence >= Math.min(threshold, 1.0) ? "approved" : "pending_human";
      } else {
        approvalDecision = "pending_human";
      }
    }

    let riskLevel: string;
    if (simulatedBudget <= BUDGET_VIOLATION_THRESHOLD) riskLevel = "critical";
    else if (simulatedBudget <= AUTO_TIGHTEN_THRESHOLD) riskLevel = "high";
    else if (simulatedBudget <= 60) riskLevel = "medium";
    else riskLevel = "low";

    let recommendation = "Proceed normally";
    if (riskLevel === "critical") recommendation = "Do not proceed — budget will be exhausted";
    else if (riskLevel === "high") recommendation = "Caution — this will trigger auto-tightening";
    else if (riskLevel === "medium") recommendation = "Monitor closely after execution";

    results.push({
      action: scenario.action,
      approvalDecision,
      budgetAfter: Math.round(simulatedBudget * 100) / 100,
      riskLevel,
      recommendation,
    });
  }

  let overallRisk: string;
  const worstRisk = results.reduce((worst, r) => {
    const levels = ["low", "medium", "high", "critical"];
    return levels.indexOf(r.riskLevel) > levels.indexOf(worst) ? r.riskLevel : worst;
  }, "low");
  overallRisk = worstRisk;

  await logGovernanceAction(userId, "trust_risk_simulation", "simulator", {
    scenarioCount: scenarios.length, overallRisk, finalBudget: simulatedBudget,
  }, "info", "simulated");

  return { results, overallRisk };
}

// ==================== OVERRIDE PATTERN REPORT ====================

export async function generateOverrideReport(
  userId?: string,
  days: number = 30,
): Promise<{
  totalOverrides: number;
  byType: Record<string, number>;
  byTarget: Record<string, number>;
  topReasons: Array<{ reason: string; count: number }>;
  riskAssessment: string;
  patterns: string[];
}> {
  const cutoff = new Date(Date.now() - days * 86400_000);

  const conditions = [gte(operatorOverrideRecords.createdAt, cutoff)];
  if (userId) conditions.push(eq(operatorOverrideRecords.userId, userId));

  const overrides = await db.select().from(operatorOverrideRecords)
    .where(and(...conditions))
    .orderBy(desc(operatorOverrideRecords.createdAt))
    .limit(500);

  const byType: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};

  for (const o of overrides) {
    byType[o.overrideType] = (byType[o.overrideType] || 0) + 1;
    byTarget[o.targetEntity] = (byTarget[o.targetEntity] || 0) + 1;
    if (o.reason) {
      reasonCounts[o.reason] = (reasonCounts[o.reason] || 0) + 1;
    }
  }

  const topReasons = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  const patterns: string[] = [];
  const totalOverrides = overrides.length;

  if (totalOverrides > 20) patterns.push("High override frequency — consider adjusting automation rules");

  const topType = Object.entries(byType).sort(([, a], [, b]) => b - a)[0];
  if (topType && topType[1] > totalOverrides * 0.5) {
    patterns.push(`Concentrated overrides: ${topType[0]} accounts for ${Math.round(topType[1] / totalOverrides * 100)}% of all overrides`);
  }

  const recentWeek = overrides.filter(o => o.createdAt && o.createdAt > new Date(Date.now() - 7 * 86400_000));
  if (recentWeek.length > totalOverrides * 0.5 && totalOverrides > 5) {
    patterns.push("Override frequency increasing — most overrides occurred in the last week");
  }

  let riskAssessment = "low";
  if (totalOverrides > 50) riskAssessment = "critical";
  else if (totalOverrides > 20) riskAssessment = "high";
  else if (totalOverrides > 10) riskAssessment = "medium";

  return { totalOverrides, byType, byTarget, topReasons, riskAssessment, patterns };
}

export async function recordOverride(
  userId: string,
  overrideType: string,
  targetEntity: string,
  targetId: string | null,
  previousValue: Record<string, any> | null,
  newValue: Record<string, any> | null,
  reason: string,
  performedBy: string,
): Promise<number> {
  const [record] = await db.insert(operatorOverrideRecords).values({
    userId, overrideType, targetEntity,
    targetId: targetId || undefined,
    previousValue, newValue, reason, performedBy,
  }).returning();

  await logGovernanceAction(userId, "override_recorded", "override", {
    overrideType, targetEntity, targetId, reason, performedBy,
  }, "warning", "recorded", performedBy);

  return record.id;
}

// ==================== BUDGET RESET SCHEDULER ====================

let resetIntervalHandle: ReturnType<typeof setInterval> | null = null;

export async function resetExpiredBudgets(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(trustBudgetPeriods)
    .where(
      and(
        lte(trustBudgetPeriods.periodEnd, now),
        sql`${trustBudgetPeriods.metadata}->>'resetProcessed' IS NULL`,
      )
    );

  let resetCount = 0;
  for (const period of expired) {
    await db.update(trustBudgetPeriods)
      .set({ metadata: { ...(period.metadata as Record<string, unknown> ?? {}), resetProcessed: true, processedAt: now.toISOString() } })
      .where(eq(trustBudgetPeriods.id, period.id));

    const periodStart = now;
    const periodEnd = new Date(now.getTime() + BUDGET_RESET_INTERVAL_HOURS * 3600_000);
    await db.insert(trustBudgetPeriods).values({
      userId: period.userId,
      agentName: period.agentName,
      periodStart,
      periodEnd,
      startingBudget: DEFAULT_BUDGET_TOTAL,
      endingBudget: DEFAULT_BUDGET_TOTAL,
      deductionsCount: 0,
      totalDeducted: 0,
      metadata: { previousPeriodId: period.id, resetAt: now.toISOString() },
    });
    resetCount++;
  }

  if (resetCount > 0) {
    logger.info(`Reset ${resetCount} expired trust budget periods`);
  }
  return resetCount;
}

export function startBudgetResetScheduler(): void {
  if (resetIntervalHandle) return;
  const intervalMs = BUDGET_RESET_INTERVAL_HOURS * 3600_000;
  resetIntervalHandle = setInterval(async () => {
    try {
      await resetExpiredBudgets();
    } catch (err) {
      logger.error("Budget reset scheduler failed:", err);
    }
  }, intervalMs);
  logger.info(`Budget reset scheduler started (interval: ${BUDGET_RESET_INTERVAL_HOURS}h)`);
}

export function stopBudgetResetScheduler(): void {
  if (resetIntervalHandle) {
    clearInterval(resetIntervalHandle);
    resetIntervalHandle = null;
  }
}

// ==================== TENANT ISOLATION MIDDLEWARE ====================

import type { Request, Response, NextFunction } from "express";

export function tenantIsolationMiddleware(
  getResourceUserId: (req: Request) => string | null,
  resourceType: string = "resource",
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestUserId = (req as Record<string, unknown>).userId as string | undefined;
    if (!requestUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const resourceUserId = getResourceUserId(req);
    if (resourceUserId === null) {
      return next();
    }
    const isolation = enforceTenantIsolation(requestUserId, resourceUserId, resourceType);
    if (!isolation.allowed) {
      auditTenantAccess(requestUserId, resourceUserId, resourceType, false).catch(() => {});
      return res.status(403).json({ error: "Access denied: tenant isolation violation" });
    }
    next();
  };
}
