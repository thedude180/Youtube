import { appendEvent, getGraphSnapshot, getEventLog, getGraphStats } from "./creator-intelligence-graph";
import { getAdaptiveFeedbackReport, recordOverridePattern, feedOverridesToExperiments, recordReconciliationHealth } from "./adaptive-feedback-loops";
import { assessLearningMaturity } from "./learning-maturity-system";

export interface ExecutionHistoryLookup {
  entityId: string;
  domain: string;
  recentExecutions: { type: string; timestamp: Date; outcome: string; confidence: number }[];
  decisionCount: number;
  overrideCount: number;
  averageConfidence: number;
}

export interface ContinuityStalenessReport {
  packetId: string;
  lastUpdated: Date;
  stalenessMs: number;
  isStale: boolean;
  staleThresholdMs: number;
  staleDomains: string[];
  recommendations: string[];
}

export interface SelfAssessmentReport {
  systemHealth: number;
  graphHealth: number;
  learningMaturity: number;
  adaptiveFeedback: Record<string, any>;
  telemetryEvents: { domain: string; eventCount: number; lastEvent: Date | null }[];
  recommendations: string[];
  assessedAt: Date;
  resolution: "full" | "partial" | "minimal";
}

export function lookupExecutionHistory(
  domain: string,
  entityId: string
): ExecutionHistoryLookup {
  const events = getEventLog().filter((e) => e.domain === domain && e.entityId === entityId);
  const recentExecutions = events.slice(-20).map((e) => ({
    type: e.type,
    timestamp: e.timestamp,
    outcome: e.data.outcome || e.data.status || "completed",
    confidence: e.data.confidence || 0,
  }));

  const overrideEvents = events.filter((e) => e.type.includes("override") || e.data.isOverride);

  return {
    entityId,
    domain,
    recentExecutions,
    decisionCount: events.length,
    overrideCount: overrideEvents.length,
    averageConfidence: recentExecutions.length > 0
      ? recentExecutions.reduce((sum, e) => sum + e.confidence, 0) / recentExecutions.length
      : 0,
  };
}

export function checkContinuityStaleness(
  packetId: string,
  lastUpdated: Date,
  staleThresholdMs: number = 7 * 24 * 60 * 60 * 1000
): ContinuityStalenessReport {
  const stalenessMs = Date.now() - lastUpdated.getTime();
  const isStale = stalenessMs > staleThresholdMs;

  const graphStats = getGraphStats();
  const staleDomains: string[] = [];

  for (const [domain, count] of Object.entries(graphStats.domainCounts)) {
    const domainEvents = getEventLog().filter((e) => e.domain === domain);
    if (domainEvents.length > 0) {
      const lastDomainEvent = domainEvents[domainEvents.length - 1];
      if (Date.now() - lastDomainEvent.timestamp.getTime() > staleThresholdMs) {
        staleDomains.push(domain);
      }
    }
  }

  const recommendations: string[] = [];
  if (isStale) {
    recommendations.push(`Continuity packet is ${(stalenessMs / (24 * 60 * 60 * 1000)).toFixed(1)} days old — update required`);
  }
  if (staleDomains.length > 0) {
    recommendations.push(`Stale domain data: ${staleDomains.join(", ")} — refresh these signals`);
  }

  return {
    packetId,
    lastUpdated,
    stalenessMs,
    isStale,
    staleThresholdMs,
    staleDomains,
    recommendations,
  };
}

export function generateFullSelfAssessment(
  domains: string[] = ["content", "audience", "revenue", "learning", "brand", "distribution", "business", "compliance"]
): SelfAssessmentReport {
  const graphSnapshot = getGraphSnapshot();
  const graphStats = getGraphStats();
  const maturityReport = assessLearningMaturity(domains);
  const feedbackReport = getAdaptiveFeedbackReport();

  const telemetryEvents = domains.map((domain) => {
    const domainEvents = getEventLog().filter((e) => e.domain === domain);
    return {
      domain,
      eventCount: domainEvents.length,
      lastEvent: domainEvents.length > 0 ? domainEvents[domainEvents.length - 1].timestamp : null,
    };
  });

  const systemHealth = (
    graphSnapshot.healthScore * 0.3 +
    maturityReport.overallMaturity * 0.3 +
    (feedbackReport.reconciliationHealth.averageScore || 0.5) * 0.2 +
    (feedbackReport.overridePatterns.experimentsCreated > 0 ? 0.8 : 0.4) * 0.2
  );

  const recommendations: string[] = [];

  if (graphSnapshot.healthScore < 0.5) {
    recommendations.push(`Intelligence Graph health is low (${(graphSnapshot.healthScore * 100).toFixed(0)}%) — increase cross-domain signal emission`);
  }

  if (maturityReport.overallMaturity < 0.4) {
    recommendations.push(`Learning maturity is low (${(maturityReport.overallMaturity * 100).toFixed(0)}%) — ${maturityReport.recommendations[0] || "increase learning signals"}`);
  }

  if (maturityReport.contradictions > maturityReport.freshSignals * 0.3) {
    recommendations.push("High contradiction rate in learning signals — investigate conflicting data sources");
  }

  const inactiveDomains = telemetryEvents.filter((t) => t.eventCount === 0);
  if (inactiveDomains.length > 0) {
    recommendations.push(`No telemetry from: ${inactiveDomains.map((t) => t.domain).join(", ")} — these domains need signal emission`);
  }

  if (feedbackReport.overridePatterns.eligibleForExperiment > 0) {
    recommendations.push(`${feedbackReport.overridePatterns.eligibleForExperiment} override patterns ready for Darwinist experiments`);
  }

  const resolution: SelfAssessmentReport["resolution"] =
    telemetryEvents.filter((t) => t.eventCount > 0).length >= domains.length * 0.8 ? "full" :
    telemetryEvents.filter((t) => t.eventCount > 0).length >= domains.length * 0.4 ? "partial" : "minimal";

  return {
    systemHealth,
    graphHealth: graphSnapshot.healthScore,
    learningMaturity: maturityReport.overallMaturity,
    adaptiveFeedback: feedbackReport,
    telemetryEvents,
    recommendations,
    assessedAt: new Date(),
    resolution,
  };
}

export function runFullV9CapstoneCheck(): {
  selfAssessment: SelfAssessmentReport;
  overrideFeedback: ReturnType<typeof feedOverridesToExperiments>;
  continuityCheck: ContinuityStalenessReport;
  graphStats: ReturnType<typeof getGraphStats>;
  overallScore: number;
} {
  const selfAssessment = generateFullSelfAssessment();
  const overrideFeedback = feedOverridesToExperiments();
  const continuityCheck = checkContinuityStaleness("default", new Date());
  const graphStats = getGraphStats();

  const overallScore = (
    selfAssessment.systemHealth * 0.4 +
    (continuityCheck.isStale ? 0.3 : 0.8) * 0.2 +
    (selfAssessment.resolution === "full" ? 1 : selfAssessment.resolution === "partial" ? 0.6 : 0.2) * 0.2 +
    selfAssessment.learningMaturity * 0.2
  );

  return { selfAssessment, overrideFeedback, continuityCheck, graphStats, overallScore };
}
