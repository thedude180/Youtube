import { recordDecision } from "./decision-theater";
import { emitDomainEvent } from "./index";

export interface AgentOutput {
  agentName: string;
  actionType: string;
  payload: Record<string, any>;
  confidence: number;
  evidence?: Record<string, any>[];
  risk?: "low" | "medium" | "high" | "critical";
  reasoning?: Record<string, any>;
}

export interface RoutedOutput {
  band: "GREEN" | "YELLOW" | "RED";
  autoApproved: boolean;
  decisionId: number;
  output: AgentOutput;
}

const CONFIDENCE_THRESHOLDS = {
  GREEN: 0.7,
  YELLOW: 0.4,
};

export async function routeByConfidence(userId: string, output: AgentOutput): Promise<RoutedOutput> {
  const risk = output.risk || "low";
  const confidence = output.confidence;
  const evidence = output.evidence || [];

  let band: "GREEN" | "YELLOW" | "RED";
  if (risk === "critical" || risk === "high") {
    band = "RED";
  } else if (confidence >= CONFIDENCE_THRESHOLDS.GREEN && risk !== "medium") {
    band = "GREEN";
  } else if (confidence >= CONFIDENCE_THRESHOLDS.YELLOW) {
    band = "YELLOW";
  } else {
    band = "RED";
  }

  const decisionId = await recordDecision(userId, {
    agentName: output.agentName,
    actionType: output.actionType,
    evidence,
    confidence,
    risk: risk as any,
    signalCount: evidence.length,
    recency: Date.now(),
    reasoning: output.reasoning || { method: "confidence-routing", threshold: CONFIDENCE_THRESHOLDS.GREEN },
  });

  const autoApproved = band === "GREEN";

  await emitDomainEvent(userId, "confidence.routed", {
    decisionId,
    agentName: output.agentName,
    actionType: output.actionType,
    band,
    confidence,
    autoApproved,
  });

  return { band, autoApproved, decisionId, output };
}

export function validateExplanationContract(output: AgentOutput): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!output.actionType) missing.push("actionType");
  if (output.confidence == null) missing.push("confidence");
  if (!output.evidence || output.evidence.length === 0) missing.push("evidence");
  if (!output.risk) missing.push("risk");

  return { valid: missing.length === 0, missing };
}
