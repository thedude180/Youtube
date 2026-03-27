import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface CapabilityBaseline {
  capability: string;
  domain: string;
  baselineScore: number;
  currentScore: number;
  measuredAt: Date;
  driftAmount: number;
  driftDirection: "improving" | "stable" | "degrading";
  trendHistory: { score: number; timestamp: Date }[];
}

export interface DriftAlert {
  capability: string;
  severity: "info" | "warning" | "critical";
  driftAmount: number;
  message: string;
  triggeredAt: Date;
  autoResponse?: string;
}

export interface DriftReport {
  baselines: CapabilityBaseline[];
  alerts: DriftAlert[];
  overallDriftScore: number;
  systemStability: number;
  degradingCapabilities: string[];
  improvingCapabilities: string[];
  recommendations: string[];
  reportedAt: Date;
}

const baselineStore = new Map<string, CapabilityBaseline>();
const alertHistory: DriftAlert[] = [];

const DRIFT_THRESHOLDS = {
  warning: 0.15,
  critical: 0.30,
};

export function setBaseline(capability: string, domain: string, score: number): CapabilityBaseline {
  const existing = baselineStore.get(capability);

  const baseline: CapabilityBaseline = {
    capability, domain,
    baselineScore: existing?.baselineScore ?? score,
    currentScore: score,
    measuredAt: new Date(),
    driftAmount: existing ? score - existing.baselineScore : 0,
    driftDirection: "stable",
    trendHistory: existing ? [...existing.trendHistory.slice(-19), { score, timestamp: new Date() }] : [{ score, timestamp: new Date() }],
  };

  if (baseline.driftAmount > 0.05) baseline.driftDirection = "improving";
  else if (baseline.driftAmount < -0.05) baseline.driftDirection = "degrading";

  baselineStore.set(capability, baseline);
  return baseline;
}

export function measureAndDetectDrift(capability: string, domain: string, currentScore: number): {
  baseline: CapabilityBaseline;
  alert?: DriftAlert;
} {
  const baseline = setBaseline(capability, domain, currentScore);
  const absDrift = Math.abs(baseline.driftAmount);
  let alert: DriftAlert | undefined;

  if (baseline.driftDirection === "degrading") {
    if (absDrift >= DRIFT_THRESHOLDS.critical) {
      alert = {
        capability,
        severity: "critical",
        driftAmount: baseline.driftAmount,
        message: `CRITICAL: ${capability} has degraded by ${(absDrift * 100).toFixed(1)}% from baseline`,
        triggeredAt: new Date(),
        autoResponse: `Activating degradation playbook for ${capability}`,
      };
    } else if (absDrift >= DRIFT_THRESHOLDS.warning) {
      alert = {
        capability,
        severity: "warning",
        driftAmount: baseline.driftAmount,
        message: `WARNING: ${capability} showing ${(absDrift * 100).toFixed(1)}% drift from baseline`,
        triggeredAt: new Date(),
      };
    }

    if (alert) {
      alertHistory.push(alert);
      if (alertHistory.length > 500) alertHistory.splice(0, alertHistory.length - 500);

      appendEvent("capability.drift_detected", domain, capability, {
        severity: alert.severity,
        driftAmount: baseline.driftAmount,
        currentScore,
        baselineScore: baseline.baselineScore,
      }, "capability-drift-monitor");
    }
  }

  return { baseline, alert };
}

export function generateDriftReport(): DriftReport {
  const baselines = Array.from(baselineStore.values());
  const recentAlerts = alertHistory.filter(a => Date.now() - a.triggeredAt.getTime() < 24 * 60 * 60 * 1000);

  const degradingCapabilities = baselines.filter(b => b.driftDirection === "degrading").map(b => b.capability);
  const improvingCapabilities = baselines.filter(b => b.driftDirection === "improving").map(b => b.capability);

  const totalDrift = baselines.reduce((sum, b) => sum + Math.abs(b.driftAmount), 0);
  const overallDriftScore = baselines.length > 0 ? totalDrift / baselines.length : 0;
  const systemStability = Math.max(0, 1 - overallDriftScore * 2);

  const recommendations: string[] = [];
  if (degradingCapabilities.length > 0) {
    recommendations.push(`${degradingCapabilities.length} capabilities degrading: ${degradingCapabilities.slice(0, 3).join(", ")}`);
  }
  if (recentAlerts.filter(a => a.severity === "critical").length > 0) {
    recommendations.push("Critical drift alerts active — activate degradation playbooks");
  }
  if (systemStability < 0.5) {
    recommendations.push("System stability below 50% — consider pausing non-essential automations");
  }
  if (systemStability >= 0.9) {
    recommendations.push("System is stable — all capabilities tracking near baseline");
  }

  return {
    baselines,
    alerts: recentAlerts,
    overallDriftScore,
    systemStability,
    degradingCapabilities,
    improvingCapabilities,
    recommendations,
    reportedAt: new Date(),
  };
}

export function getCapabilityBaseline(capability: string): CapabilityBaseline | undefined {
  return baselineStore.get(capability);
}

export function getRecentAlerts(hours: number = 24): DriftAlert[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return alertHistory.filter(a => a.triggeredAt.getTime() > cutoff);
}

export function resetBaseline(capability: string): void {
  const existing = baselineStore.get(capability);
  if (existing) {
    existing.baselineScore = existing.currentScore;
    existing.driftAmount = 0;
    existing.driftDirection = "stable";
    existing.trendHistory = [{ score: existing.currentScore, timestamp: new Date() }];
  }
}
