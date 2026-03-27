import { appendEvent } from "./creator-intelligence-graph";

export type EvalVerdict = "pass" | "warn" | "fail" | "block";

export interface AgentOutput {
  agentId: string;
  agentName: string;
  outputType: string;
  content: any;
  confidence: number;
  reasoning?: string;
  hasExplanation: boolean;
  signalsUsed: number;
  executionTimeMs: number;
  domain: string;
}

export interface EvalCriterion {
  name: string;
  weight: number;
  threshold: number;
  evaluator: (output: AgentOutput) => number;
}

export interface EnforcementResult {
  agentId: string;
  outputType: string;
  verdict: EvalVerdict;
  overallScore: number;
  criteriaResults: { name: string; score: number; passed: boolean; weight: number }[];
  violations: string[];
  recommendations: string[];
  evaluatedAt: Date;
}

const evalHistory: EnforcementResult[] = [];

const DEFAULT_CRITERIA: EvalCriterion[] = [
  { name: "confidence_present", weight: 0.15, threshold: 0.5, evaluator: (o) => o.confidence > 0 ? 1 : 0 },
  { name: "explanation_contract", weight: 0.2, threshold: 0.5, evaluator: (o) => o.hasExplanation ? 1 : 0 },
  { name: "signal_evidence", weight: 0.2, threshold: 0.5, evaluator: (o) => Math.min(1, o.signalsUsed / 3) },
  { name: "confidence_calibration", weight: 0.15, threshold: 0.3, evaluator: (o) => o.confidence >= 0.1 && o.confidence <= 0.99 ? 1 : 0.3 },
  { name: "reasoning_present", weight: 0.15, threshold: 0.5, evaluator: (o) => o.reasoning && o.reasoning.length > 10 ? 1 : 0 },
  { name: "execution_efficiency", weight: 0.15, threshold: 0.3, evaluator: (o) => o.executionTimeMs < 5000 ? 1 : o.executionTimeMs < 15000 ? 0.6 : 0.2 },
];

const customCriteria = new Map<string, EvalCriterion[]>();

export function registerCustomCriteria(agentId: string, criteria: EvalCriterion[]): void {
  customCriteria.set(agentId, criteria);
}

export function enforceAgentOutput(output: AgentOutput, criteria?: EvalCriterion[]): EnforcementResult {
  const activeCriteria = criteria || customCriteria.get(output.agentId) || DEFAULT_CRITERIA;

  const criteriaResults = activeCriteria.map((c) => {
    const score = c.evaluator(output);
    return { name: c.name, score, passed: score >= c.threshold, weight: c.weight };
  });

  const overallScore = criteriaResults.reduce((sum, cr) => sum + cr.score * cr.weight, 0);

  const violations: string[] = [];
  const recommendations: string[] = [];

  for (const cr of criteriaResults) {
    if (!cr.passed) {
      violations.push(`${cr.name}: score ${cr.score.toFixed(2)} below threshold`);
    }
  }

  if (!output.hasExplanation) violations.push("Agent Explanation Contract violation");
  if (output.confidence === 0) recommendations.push("Provide calibrated confidence");
  if (output.signalsUsed === 0) recommendations.push("Consume available learning signals");

  const failCount = criteriaResults.filter((cr) => !cr.passed).length;
  let verdict: EvalVerdict;
  if (overallScore >= 0.8 && failCount === 0) verdict = "pass";
  else if (overallScore >= 0.5 && failCount <= 2) verdict = "warn";
  else if (overallScore >= 0.3) verdict = "fail";
  else verdict = "block";

  const result: EnforcementResult = {
    agentId: output.agentId,
    outputType: output.outputType,
    verdict,
    overallScore,
    criteriaResults,
    violations,
    recommendations,
    evaluatedAt: new Date(),
  };

  evalHistory.push(result);

  if (verdict === "block" || verdict === "fail") {
    appendEvent("learning.signal_emitted", "agent_eval", output.agentId, {
      verdict,
      overallScore,
      violations,
      outputType: output.outputType,
    }, "agent-evals-cop");
  }

  return result;
}

export function shouldBlockOutput(output: AgentOutput): { blocked: boolean; reason?: string; result: EnforcementResult } {
  const result = enforceAgentOutput(output);
  if (result.verdict === "block") {
    return { blocked: true, reason: `Agent output blocked: ${result.violations.join("; ")}`, result };
  }
  return { blocked: false, result };
}

export function getEvalHistory(agentId?: string): EnforcementResult[] {
  if (agentId) return evalHistory.filter((e) => e.agentId === agentId);
  return [...evalHistory];
}

export function getAgentEvalSummary(agentId: string): {
  totalEvals: number;
  passRate: number;
  avgScore: number;
  commonViolations: string[];
  trend: "improving" | "stable" | "declining";
} {
  const evals = evalHistory.filter((e) => e.agentId === agentId);
  if (evals.length === 0) return { totalEvals: 0, passRate: 0, avgScore: 0, commonViolations: [], trend: "stable" };

  const passRate = evals.filter((e) => e.verdict === "pass").length / evals.length;
  const avgScore = evals.reduce((sum, e) => sum + e.overallScore, 0) / evals.length;

  const violationCounts: Record<string, number> = {};
  for (const e of evals) {
    for (const v of e.violations) {
      const key = v.split(":")[0];
      violationCounts[key] = (violationCounts[key] || 0) + 1;
    }
  }
  const commonViolations = Object.entries(violationCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([v]) => v);

  let trend: "improving" | "stable" | "declining" = "stable";
  if (evals.length >= 4) {
    const half = Math.floor(evals.length / 2);
    const avgFirst = evals.slice(0, half).reduce((s, e) => s + e.overallScore, 0) / half;
    const avgSecond = evals.slice(half).reduce((s, e) => s + e.overallScore, 0) / (evals.length - half);
    if (avgSecond > avgFirst + 0.05) trend = "improving";
    else if (avgSecond < avgFirst - 0.05) trend = "declining";
  }

  return { totalEvals: evals.length, passRate, avgScore, commonViolations, trend };
}
