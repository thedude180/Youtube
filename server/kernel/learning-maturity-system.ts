import { appendEvent } from "./creator-intelligence-graph";

export interface LearningSignalRecord {
  id: string;
  signalType: string;
  domain: string;
  value: number;
  confidence: number;
  source: string;
  timestamp: Date;
  freshnessScore: number;
  contradicts?: string[];
}

export interface MaturityDimension {
  name: string;
  domain: string;
  signalCount: number;
  signalQuality: number;
  freshness: number;
  contradictionRate: number;
  maturityScore: number;
  automationGate: "blocked" | "shadow" | "assisted" | "supervised" | "autonomous";
}

export interface LearningMaturityReport {
  dimensions: MaturityDimension[];
  overallMaturity: number;
  overallAutomationLevel: "blocked" | "shadow" | "assisted" | "supervised" | "autonomous";
  freshSignals: number;
  staleSignals: number;
  contradictions: number;
  recommendations: string[];
  assessedAt: Date;
}

const signalStore: LearningSignalRecord[] = [];
const FRESHNESS_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const MATURITY_THRESHOLDS = { blocked: 0, shadow: 0.2, assisted: 0.4, supervised: 0.6, autonomous: 0.8 };

export function recordLearningSignal(
  signalType: string,
  domain: string,
  value: number,
  confidence: number,
  source: string
): LearningSignalRecord {
  const signal: LearningSignalRecord = {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    signalType,
    domain,
    value,
    confidence: Math.max(0, Math.min(1, confidence)),
    source,
    timestamp: new Date(),
    freshnessScore: 1.0,
  };

  const contradicting = signalStore.filter(
    (s) => s.signalType === signalType && s.domain === domain &&
    Math.abs(s.value - value) > 0.5 && s.freshnessScore > 0.3
  );

  if (contradicting.length > 0) {
    signal.contradicts = contradicting.map((c) => c.id);
    appendEvent("learning.contradiction_detected", "learning", domain, {
      signalType,
      newValue: value,
      contradictingValues: contradicting.map((c) => c.value),
      contradictionCount: contradicting.length,
    }, "learning-maturity");
  }

  signalStore.push(signal);

  appendEvent("learning.signal_emitted", "learning", domain, {
    signalType,
    value,
    confidence,
    source,
    hasContradictions: (signal.contradicts?.length || 0) > 0,
  }, "learning-maturity");

  return signal;
}

export function updateFreshness(): void {
  const now = Date.now();
  for (const signal of signalStore) {
    const age = now - signal.timestamp.getTime();
    signal.freshnessScore = Math.pow(0.5, age / FRESHNESS_HALF_LIFE_MS);
  }
}

export function getSignalsByDomain(domain: string): LearningSignalRecord[] {
  return signalStore.filter((s) => s.domain === domain);
}

function computeDimensionMaturity(domain: string): MaturityDimension {
  updateFreshness();
  const signals = getSignalsByDomain(domain);
  const fresh = signals.filter((s) => s.freshnessScore > 0.5);
  const stale = signals.filter((s) => s.freshnessScore <= 0.5);
  const contradictions = signals.filter((s) => s.contradicts && s.contradicts.length > 0);

  const signalCount = signals.length;
  const signalQuality = signals.length > 0
    ? signals.reduce((sum, s) => sum + s.confidence * s.freshnessScore, 0) / signals.length
    : 0;
  const freshness = signals.length > 0
    ? signals.reduce((sum, s) => sum + s.freshnessScore, 0) / signals.length
    : 0;
  const contradictionRate = signals.length > 0 ? contradictions.length / signals.length : 0;

  const rawMaturity = (
    Math.min(1, signalCount / 50) * 0.3 +
    signalQuality * 0.3 +
    freshness * 0.2 +
    (1 - contradictionRate) * 0.2
  );

  const maturityScore = Math.max(0, Math.min(1, rawMaturity));

  let automationGate: MaturityDimension["automationGate"] = "blocked";
  if (maturityScore >= MATURITY_THRESHOLDS.autonomous) automationGate = "autonomous";
  else if (maturityScore >= MATURITY_THRESHOLDS.supervised) automationGate = "supervised";
  else if (maturityScore >= MATURITY_THRESHOLDS.assisted) automationGate = "assisted";
  else if (maturityScore >= MATURITY_THRESHOLDS.shadow) automationGate = "shadow";

  return {
    name: domain,
    domain,
    signalCount,
    signalQuality,
    freshness,
    contradictionRate,
    maturityScore,
    automationGate,
  };
}

export function assessLearningMaturity(domains: string[]): LearningMaturityReport {
  const dimensions = domains.map((d) => computeDimensionMaturity(d));
  const overallMaturity = dimensions.length > 0
    ? dimensions.reduce((sum, d) => sum + d.maturityScore, 0) / dimensions.length
    : 0;

  let overallAutomationLevel: LearningMaturityReport["overallAutomationLevel"] = "blocked";
  if (overallMaturity >= MATURITY_THRESHOLDS.autonomous) overallAutomationLevel = "autonomous";
  else if (overallMaturity >= MATURITY_THRESHOLDS.supervised) overallAutomationLevel = "supervised";
  else if (overallMaturity >= MATURITY_THRESHOLDS.assisted) overallAutomationLevel = "assisted";
  else if (overallMaturity >= MATURITY_THRESHOLDS.shadow) overallAutomationLevel = "shadow";

  updateFreshness();
  const freshSignals = signalStore.filter((s) => s.freshnessScore > 0.5).length;
  const staleSignals = signalStore.filter((s) => s.freshnessScore <= 0.5).length;
  const contradictions = signalStore.filter((s) => s.contradicts && s.contradicts.length > 0).length;

  const recommendations: string[] = [];
  const weakDimensions = dimensions.filter((d) => d.maturityScore < 0.3);
  if (weakDimensions.length > 0) {
    recommendations.push(`Low maturity domains: ${weakDimensions.map((d) => d.name).join(", ")} — need more learning signals`);
  }
  if (staleSignals > freshSignals) {
    recommendations.push("More stale signals than fresh — system learning may be degrading");
  }
  if (contradictions > signalStore.length * 0.2) {
    recommendations.push("High contradiction rate — investigate conflicting signals");
  }

  return {
    dimensions,
    overallMaturity,
    overallAutomationLevel,
    freshSignals,
    staleSignals,
    contradictions,
    recommendations,
    assessedAt: new Date(),
  };
}

export function canAutomate(domain: string, requiredLevel: MaturityDimension["automationGate"]): boolean {
  const dimension = computeDimensionMaturity(domain);
  const levels: MaturityDimension["automationGate"][] = ["blocked", "shadow", "assisted", "supervised", "autonomous"];
  return levels.indexOf(dimension.automationGate) >= levels.indexOf(requiredLevel);
}

export function getConfidenceForDomain(domain: string): number {
  const dimension = computeDimensionMaturity(domain);
  return dimension.maturityScore;
}

export function getAllSignals(): readonly LearningSignalRecord[] {
  return signalStore;
}
