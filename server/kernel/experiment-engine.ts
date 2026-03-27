import { appendEvent } from "./creator-intelligence-graph";

export type ExperimentStatus = "proposed" | "running" | "paused" | "concluded" | "promoted" | "rolled_back";

export interface ExperimentVariant {
  id: string;
  name: string;
  config: Record<string, any>;
  trafficPercentage: number;
  metrics: Record<string, number>;
  sampleSize: number;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  domain: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  primaryMetric: string;
  secondaryMetrics: string[];
  minSampleSize: number;
  maxDuration: number;
  resourceBudget: number;
  resourceSpent: number;
  startedAt?: Date;
  concludedAt?: Date;
  winningVariant?: string;
  statisticalSignificance?: number;
  createdAt: Date;
  priorityScore: number;
  source: "manual" | "override_pattern" | "learning_signal" | "darwinist";
}

export interface ExperimentResult {
  experimentId: string;
  winningVariant: string | null;
  significance: number;
  improvement: number;
  recommendation: "promote" | "rollback" | "extend" | "inconclusive";
  details: Record<string, any>;
}

const experimentStore = new Map<string, Experiment>();

export function createExperiment(params: {
  name: string;
  hypothesis: string;
  domain: string;
  variants: { name: string; config: Record<string, any>; trafficPercentage: number }[];
  primaryMetric: string;
  secondaryMetrics?: string[];
  minSampleSize?: number;
  maxDuration?: number;
  resourceBudget?: number;
  source?: Experiment["source"];
  priorityScore?: number;
}): Experiment {
  const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const experiment: Experiment = {
    id,
    name: params.name,
    hypothesis: params.hypothesis,
    domain: params.domain,
    status: "proposed",
    variants: params.variants.map((v, i) => ({
      id: `var_${id}_${i}`,
      name: v.name,
      config: v.config,
      trafficPercentage: v.trafficPercentage,
      metrics: {},
      sampleSize: 0,
    })),
    primaryMetric: params.primaryMetric,
    secondaryMetrics: params.secondaryMetrics || [],
    minSampleSize: params.minSampleSize || 100,
    maxDuration: params.maxDuration || 7 * 24 * 60 * 60 * 1000,
    resourceBudget: params.resourceBudget || 100,
    resourceSpent: 0,
    createdAt: new Date(),
    priorityScore: params.priorityScore || 0.5,
    source: params.source || "manual",
  };

  experimentStore.set(id, experiment);

  appendEvent("experiment.started", "experiment", id, {
    name: experiment.name,
    hypothesis: experiment.hypothesis,
    variantCount: experiment.variants.length,
    source: experiment.source,
  }, "experiment-engine");

  return experiment;
}

export function startExperiment(experimentId: string): boolean {
  const exp = experimentStore.get(experimentId);
  if (!exp || exp.status !== "proposed") return false;
  exp.status = "running";
  exp.startedAt = new Date();
  return true;
}

export function recordMetric(experimentId: string, variantId: string, metric: string, value: number): boolean {
  const exp = experimentStore.get(experimentId);
  if (!exp || exp.status !== "running") return false;
  const variant = exp.variants.find((v) => v.id === variantId);
  if (!variant) return false;

  if (!variant.metrics[metric]) variant.metrics[metric] = 0;
  variant.metrics[metric] = (variant.metrics[metric] * variant.sampleSize + value) / (variant.sampleSize + 1);
  variant.sampleSize++;
  exp.resourceSpent += 1;

  return true;
}

export function evaluateExperiment(experimentId: string): ExperimentResult {
  const exp = experimentStore.get(experimentId);
  if (!exp) {
    return { experimentId, winningVariant: null, significance: 0, improvement: 0, recommendation: "inconclusive", details: { error: "not found" } };
  }

  const validVariants = exp.variants.filter((v) => v.sampleSize > 0);
  if (validVariants.length < 2) {
    return { experimentId, winningVariant: null, significance: 0, improvement: 0, recommendation: "extend", details: { reason: "insufficient variants with data" } };
  }

  const totalSamples = validVariants.reduce((sum, v) => sum + v.sampleSize, 0);
  if (totalSamples < exp.minSampleSize) {
    return { experimentId, winningVariant: null, significance: 0, improvement: 0, recommendation: "extend", details: { reason: "insufficient sample size", current: totalSamples, required: exp.minSampleSize } };
  }

  const sorted = [...validVariants].sort((a, b) => (b.metrics[exp.primaryMetric] || 0) - (a.metrics[exp.primaryMetric] || 0));
  const best = sorted[0];
  const second = sorted[1];

  const bestVal = best.metrics[exp.primaryMetric] || 0;
  const secondVal = second.metrics[exp.primaryMetric] || 0;
  const improvement = secondVal !== 0 ? (bestVal - secondVal) / Math.abs(secondVal) : bestVal > 0 ? 1 : 0;

  const pooledN = best.sampleSize + second.sampleSize;
  const significance = Math.min(0.99, 1 - Math.exp(-Math.abs(improvement) * Math.sqrt(pooledN) / 2));

  const recommendation: ExperimentResult["recommendation"] =
    significance >= 0.95 && improvement > 0.05 ? "promote" :
    significance >= 0.95 && improvement < -0.05 ? "rollback" :
    significance < 0.8 ? "extend" : "inconclusive";

  return {
    experimentId,
    winningVariant: best.id,
    significance,
    improvement,
    recommendation,
    details: {
      bestVariant: best.name,
      bestMetric: bestVal,
      secondVariant: second.name,
      secondMetric: secondVal,
    },
  };
}

export function concludeExperiment(experimentId: string): ExperimentResult {
  const result = evaluateExperiment(experimentId);
  const exp = experimentStore.get(experimentId);
  if (exp && exp.status === "running") {
    exp.status = "concluded";
    exp.concludedAt = new Date();
    exp.winningVariant = result.winningVariant || undefined;
    exp.statisticalSignificance = result.significance;

    appendEvent("experiment.concluded", "experiment", experimentId, {
      recommendation: result.recommendation,
      significance: result.significance,
      improvement: result.improvement,
      winningVariant: result.winningVariant,
    }, "experiment-engine");
  }
  return result;
}

export function promoteExperiment(experimentId: string): boolean {
  const exp = experimentStore.get(experimentId);
  if (!exp || exp.status !== "concluded") return false;
  exp.status = "promoted";

  appendEvent("experiment.promoted", "experiment", experimentId, {
    winningVariant: exp.winningVariant,
    significance: exp.statisticalSignificance,
  }, "experiment-engine");

  return true;
}

export function rollbackExperiment(experimentId: string): boolean {
  const exp = experimentStore.get(experimentId);
  if (!exp || (exp.status !== "running" && exp.status !== "concluded")) return false;
  exp.status = "rolled_back";
  return true;
}

export function getExperiment(id: string): Experiment | undefined {
  return experimentStore.get(id);
}

export function getActiveExperiments(): Experiment[] {
  return Array.from(experimentStore.values()).filter((e) => e.status === "running");
}

export function getAllExperiments(): Experiment[] {
  return Array.from(experimentStore.values());
}

export function isWithinBudget(experimentId: string): boolean {
  const exp = experimentStore.get(experimentId);
  if (!exp) return false;
  return exp.resourceSpent < exp.resourceBudget;
}

export function createDarwinistExperiment(
  domain: string,
  overridePatterns: { pattern: string; frequency: number; impact: number }[]
): Experiment | null {
  if (overridePatterns.length === 0) return null;

  const topPattern = overridePatterns.sort((a, b) => (b.frequency * b.impact) - (a.frequency * a.impact))[0];

  return createExperiment({
    name: `Darwinist: ${topPattern.pattern}`,
    hypothesis: `Override pattern "${topPattern.pattern}" (${topPattern.frequency}x) suggests the system default can be improved`,
    domain,
    variants: [
      { name: "current_default", config: { approach: "system_default" }, trafficPercentage: 50 },
      { name: "override_based", config: { approach: "user_override_pattern", pattern: topPattern.pattern }, trafficPercentage: 50 },
    ],
    primaryMetric: "performance_score",
    source: "darwinist",
    priorityScore: Math.min(1, topPattern.frequency * topPattern.impact / 100),
    resourceBudget: 200,
  });
}
