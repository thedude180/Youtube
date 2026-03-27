import { assessLearningMaturity, canAutomate, getConfidenceForDomain } from "./learning-maturity-system";
import { appendEvent } from "./creator-intelligence-graph";

export interface AdaptiveConfig {
  domain: string;
  automationLevel: "manual" | "shadow" | "assisted" | "supervised" | "autonomous";
  confidenceThreshold: number;
  riskAdjustment: number;
  maturityGate: number;
  overrides: Record<string, any>;
}

export interface AdaptiveDecision {
  domain: string;
  action: string;
  automationLevel: AdaptiveConfig["automationLevel"];
  confidence: number;
  approved: boolean;
  reason: string;
  riskScore: number;
  timestamp: Date;
}

const configStore = new Map<string, AdaptiveConfig>();
const decisionLog: AdaptiveDecision[] = [];

const DEFAULT_CONFIG: Omit<AdaptiveConfig, "domain"> = {
  automationLevel: "shadow",
  confidenceThreshold: 0.5,
  riskAdjustment: 0,
  maturityGate: 0.3,
  overrides: {},
};

export function configureAdaptiveLayer(domain: string, config: Partial<AdaptiveConfig>): AdaptiveConfig {
  const existing = configStore.get(domain) || { ...DEFAULT_CONFIG, domain };
  const updated: AdaptiveConfig = { ...existing, ...config, domain };
  configStore.set(domain, updated);
  return updated;
}

export function getAdaptiveConfig(domain: string): AdaptiveConfig {
  return configStore.get(domain) || { ...DEFAULT_CONFIG, domain };
}

export function adaptiveGate(
  domain: string,
  action: string,
  riskLevel: number = 0.5
): AdaptiveDecision {
  const config = getAdaptiveConfig(domain);
  const domainConfidence = getConfidenceForDomain(domain);
  const adjustedRisk = riskLevel + config.riskAdjustment;

  const levels: AdaptiveConfig["automationLevel"][] = ["manual", "shadow", "assisted", "supervised", "autonomous"];
  const currentLevelIndex = levels.indexOf(config.automationLevel);

  let approved = false;
  let reason = "";

  if (domainConfidence < config.maturityGate) {
    reason = `Domain maturity ${(domainConfidence * 100).toFixed(0)}% below gate ${(config.maturityGate * 100).toFixed(0)}%`;
  } else if (domainConfidence < config.confidenceThreshold) {
    reason = `Domain confidence ${(domainConfidence * 100).toFixed(0)}% below threshold ${(config.confidenceThreshold * 100).toFixed(0)}%`;
  } else if (adjustedRisk > 0.8 && config.automationLevel !== "manual") {
    reason = `High risk action (${(adjustedRisk * 100).toFixed(0)}%) requires manual approval`;
  } else if (currentLevelIndex >= 3) {
    approved = true;
    reason = `Automation level ${config.automationLevel} permits action`;
  } else if (currentLevelIndex >= 2 && adjustedRisk < 0.5) {
    approved = true;
    reason = `Assisted mode permits low-risk action`;
  } else if (currentLevelIndex >= 1) {
    reason = `Shadow mode — action logged but not executed`;
  } else {
    reason = `Manual mode — requires explicit approval`;
  }

  const decision: AdaptiveDecision = {
    domain,
    action,
    automationLevel: config.automationLevel,
    confidence: domainConfidence,
    approved,
    reason,
    riskScore: adjustedRisk,
    timestamp: new Date(),
  };

  decisionLog.push(decision);
  return decision;
}

export function getAdaptiveReport(): {
  domains: { domain: string; config: AdaptiveConfig; confidence: number }[];
  recentDecisions: AdaptiveDecision[];
  approvalRate: number;
  averageConfidence: number;
} {
  const domains = Array.from(configStore.entries()).map(([domain, config]) => ({
    domain,
    config,
    confidence: getConfidenceForDomain(domain),
  }));

  const recent = decisionLog.slice(-50);
  const approvalRate = recent.length > 0 ? recent.filter((d) => d.approved).length / recent.length : 0;
  const averageConfidence = recent.length > 0
    ? recent.reduce((sum, d) => sum + d.confidence, 0) / recent.length
    : 0;

  return { domains, recentDecisions: recent, approvalRate, averageConfidence };
}

export function adjustAutomationFromMaturity(domains: string[]): { domain: string; from: string; to: string }[] {
  const adjustments: { domain: string; from: string; to: string }[] = [];
  const levels: AdaptiveConfig["automationLevel"][] = ["manual", "shadow", "assisted", "supervised", "autonomous"];

  for (const domain of domains) {
    const config = getAdaptiveConfig(domain);
    const confidence = getConfidenceForDomain(domain);

    let targetLevel: AdaptiveConfig["automationLevel"] = "manual";
    if (confidence >= 0.8) targetLevel = "autonomous";
    else if (confidence >= 0.6) targetLevel = "supervised";
    else if (confidence >= 0.4) targetLevel = "assisted";
    else if (confidence >= 0.2) targetLevel = "shadow";

    if (targetLevel !== config.automationLevel) {
      const from = config.automationLevel;
      configureAdaptiveLayer(domain, { automationLevel: targetLevel });
      adjustments.push({ domain, from, to: targetLevel });

      appendEvent("system.health_change", "adaptive", domain, {
        previousLevel: from,
        newLevel: targetLevel,
        confidence,
      }, "adaptive-operating-layer");
    }
  }

  return adjustments;
}

export function getDecisionLog(): readonly AdaptiveDecision[] {
  return decisionLog;
}
