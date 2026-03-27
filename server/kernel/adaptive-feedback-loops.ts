import { appendEvent } from "./creator-intelligence-graph";
import { createDarwinistExperiment, getActiveExperiments } from "./experiment-engine";

export interface OverridePattern {
  pattern: string;
  domain: string;
  frequency: number;
  impact: number;
  firstSeen: Date;
  lastSeen: Date;
  experimentCreated: boolean;
}

export interface RolloutDecision {
  rolloutId: string;
  feature: string;
  action: "promote" | "rollback" | "hold" | "extend";
  confidence: number;
  evidence: string[];
  timestamp: Date;
}

export interface ReconciliationHealthImpact {
  domain: string;
  reconciliationScore: number;
  healthContribution: number;
  buyerReadinessImpact: number;
  lastReconciled: Date;
}

const overridePatterns: OverridePattern[] = [];
const rolloutDecisions: RolloutDecision[] = [];
const reconciliationHealth: ReconciliationHealthImpact[] = [];

export function recordOverridePattern(
  pattern: string,
  domain: string,
  impact: number
): OverridePattern {
  const existing = overridePatterns.find((p) => p.pattern === pattern && p.domain === domain);
  if (existing) {
    existing.frequency++;
    existing.impact = (existing.impact + impact) / 2;
    existing.lastSeen = new Date();
    return existing;
  }

  const newPattern: OverridePattern = {
    pattern,
    domain,
    frequency: 1,
    impact: Math.max(0, Math.min(1, impact)),
    firstSeen: new Date(),
    lastSeen: new Date(),
    experimentCreated: false,
  };
  overridePatterns.push(newPattern);
  return newPattern;
}

export function feedOverridesToExperiments(): { experimentsCreated: number; patterns: string[] } {
  const eligiblePatterns = overridePatterns
    .filter((p) => p.frequency >= 3 && p.impact >= 0.3 && !p.experimentCreated)
    .sort((a, b) => (b.frequency * b.impact) - (a.frequency * a.impact));

  const maxNewExperiments = 3 - getActiveExperiments().length;
  const toCreate = eligiblePatterns.slice(0, Math.max(0, maxNewExperiments));
  const created: string[] = [];

  for (const pattern of toCreate) {
    const exp = createDarwinistExperiment(pattern.domain, [pattern]);
    if (exp) {
      pattern.experimentCreated = true;
      created.push(pattern.pattern);

      appendEvent("experiment.started", "override_feedback", pattern.domain, {
        pattern: pattern.pattern,
        frequency: pattern.frequency,
        impact: pattern.impact,
        experimentId: exp.id,
      }, "adaptive-feedback-loops");
    }
  }

  return { experimentsCreated: created.length, patterns: created };
}

export function recordRolloutDecision(
  rolloutId: string,
  feature: string,
  action: RolloutDecision["action"],
  confidence: number,
  evidence: string[]
): RolloutDecision {
  const decision: RolloutDecision = {
    rolloutId,
    feature,
    action,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
    timestamp: new Date(),
  };
  rolloutDecisions.push(decision);

  if (action === "promote" || action === "rollback") {
    appendEvent("distribution.platform_change", "rollout", feature, {
      action,
      confidence,
      rolloutId,
    }, "adaptive-feedback-loops");
  }

  return decision;
}

export function recordReconciliationHealth(
  domain: string,
  reconciliationScore: number
): ReconciliationHealthImpact {
  const healthContribution = reconciliationScore * 0.15;
  const buyerReadinessImpact = reconciliationScore * 0.1;

  const existing = reconciliationHealth.find((r) => r.domain === domain);
  if (existing) {
    existing.reconciliationScore = reconciliationScore;
    existing.healthContribution = healthContribution;
    existing.buyerReadinessImpact = buyerReadinessImpact;
    existing.lastReconciled = new Date();
    return existing;
  }

  const impact: ReconciliationHealthImpact = {
    domain,
    reconciliationScore,
    healthContribution,
    buyerReadinessImpact,
    lastReconciled: new Date(),
  };
  reconciliationHealth.push(impact);
  return impact;
}

export function getAdaptiveFeedbackReport(): {
  overridePatterns: { total: number; eligibleForExperiment: number; experimentsCreated: number; topPatterns: OverridePattern[] };
  rolloutIntelligence: { totalDecisions: number; promotions: number; rollbacks: number; holds: number };
  reconciliationHealth: { domains: ReconciliationHealthImpact[]; averageScore: number; totalBuyerReadinessImpact: number };
} {
  const eligible = overridePatterns.filter((p) => p.frequency >= 3 && p.impact >= 0.3 && !p.experimentCreated);
  const created = overridePatterns.filter((p) => p.experimentCreated);

  const promotions = rolloutDecisions.filter((d) => d.action === "promote").length;
  const rollbacks = rolloutDecisions.filter((d) => d.action === "rollback").length;
  const holds = rolloutDecisions.filter((d) => d.action === "hold").length;

  const avgReconciliation = reconciliationHealth.length > 0
    ? reconciliationHealth.reduce((sum, r) => sum + r.reconciliationScore, 0) / reconciliationHealth.length
    : 0;
  const totalBuyerReadiness = reconciliationHealth.reduce((sum, r) => sum + r.buyerReadinessImpact, 0);

  return {
    overridePatterns: {
      total: overridePatterns.length,
      eligibleForExperiment: eligible.length,
      experimentsCreated: created.length,
      topPatterns: overridePatterns.sort((a, b) => (b.frequency * b.impact) - (a.frequency * a.impact)).slice(0, 5),
    },
    rolloutIntelligence: { totalDecisions: rolloutDecisions.length, promotions, rollbacks, holds },
    reconciliationHealth: { domains: [...reconciliationHealth], averageScore: avgReconciliation, totalBuyerReadinessImpact: totalBuyerReadiness },
  };
}

export function getOverridePatterns(): readonly OverridePattern[] {
  return overridePatterns;
}

export function getRolloutDecisions(): readonly RolloutDecision[] {
  return rolloutDecisions;
}
