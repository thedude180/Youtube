import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface TrustRiskScenario {
  name: string;
  category: "content" | "brand" | "platform" | "legal" | "financial" | "audience";
  probability: number;
  impact: number;
  trustBudgetCost: number;
  mitigations: string[];
}

export interface TrustRiskSimulationResult {
  scenarios: TrustRiskScenario[];
  overallRiskScore: number;
  trustBudgetExposure: number;
  criticalRisks: TrustRiskScenario[];
  recommendations: string[];
  simulatedAt: Date;
}

const SCENARIO_TEMPLATES: Omit<TrustRiskScenario, "probability" | "impact" | "trustBudgetCost">[] = [
  { name: "Controversial content backlash", category: "content", mitigations: ["Content review gate", "Brand safety filter", "Audience sentiment monitoring"] },
  { name: "Platform policy violation", category: "platform", mitigations: ["Policy pre-flight check", "Compliance drift detection", "Multi-platform distribution"] },
  { name: "Sponsor relationship damage", category: "brand", mitigations: ["Brand safety scoring", "Sponsor communication protocol", "Revenue diversification"] },
  { name: "Copyright strike", category: "legal", mitigations: ["Content authenticity gate", "Legal defense readiness", "Fair use analysis"] },
  { name: "Revenue stream loss", category: "financial", mitigations: ["Revenue diversification", "Income acceleration", "Emergency fund buffer"] },
  { name: "Audience trust decline", category: "audience", mitigations: ["Community trust loop", "Transparency reporting", "Audience co-creation"] },
  { name: "Data breach exposure", category: "legal", mitigations: ["First-party data encryption", "Audience identity graph privacy controls", "Incident response plan"] },
  { name: "Algorithm ranking drop", category: "platform", mitigations: ["Multi-platform presence", "SEO diversification", "Content evergreen strategy"] },
];

export function runTrustRiskSimulation(
  currentTrustBudget: number,
  channelMetrics: {
    brandSafetyScore?: number;
    platformDependencyScore?: number;
    revenueConcentration?: number;
    audienceTrustScore?: number;
  }
): TrustRiskSimulationResult {
  const brandSafety = channelMetrics.brandSafetyScore ?? 0.7;
  const platformDep = channelMetrics.platformDependencyScore ?? 0.5;
  const revConcentration = channelMetrics.revenueConcentration ?? 0.6;
  const audienceTrust = channelMetrics.audienceTrustScore ?? 0.7;

  const scenarios: TrustRiskScenario[] = SCENARIO_TEMPLATES.map((template) => {
    let probability = 0.3;
    let impact = 0.5;

    switch (template.category) {
      case "content": probability = 1 - brandSafety; impact = 0.6; break;
      case "platform": probability = platformDep * 0.5; impact = 0.7; break;
      case "brand": probability = (1 - brandSafety) * 0.6; impact = 0.8; break;
      case "legal": probability = 0.15; impact = 0.9; break;
      case "financial": probability = revConcentration * 0.4; impact = 0.85; break;
      case "audience": probability = (1 - audienceTrust) * 0.5; impact = 0.7; break;
    }

    const trustBudgetCost = probability * impact * currentTrustBudget;

    return { ...template, probability, impact, trustBudgetCost };
  });

  const overallRiskScore = scenarios.reduce((sum, s) => sum + s.probability * s.impact, 0) / scenarios.length;
  const trustBudgetExposure = scenarios.reduce((sum, s) => sum + s.trustBudgetCost, 0);
  const criticalRisks = scenarios.filter((s) => s.probability * s.impact > 0.3);

  const recommendations: string[] = [];
  if (overallRiskScore > 0.3) recommendations.push("Activate heightened monitoring across all risk categories");
  if (criticalRisks.length > 2) recommendations.push("Address critical risks before expanding operations");
  if (trustBudgetExposure > currentTrustBudget * 0.5) recommendations.push("Trust budget exposure exceeds 50% — tighten automation gates");

  appendEvent("trust.simulation_completed", "system", "global", {
    overallRiskScore,
    criticalRiskCount: criticalRisks.length,
    trustBudgetExposure,
  }, "trust-risk-simulator");

  return {
    scenarios,
    overallRiskScore,
    trustBudgetExposure,
    criticalRisks,
    recommendations,
    simulatedAt: new Date(),
  };
}
