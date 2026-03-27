import { appendEvent } from "../kernel/creator-intelligence-graph";
import { canAutomate, getConfidenceForDomain } from "../kernel/learning-maturity-system";

export type PromotionLevel = "shadow" | "assisted" | "supervised" | "active";

export interface PredictiveContentState {
  currentLevel: PromotionLevel;
  evidenceScore: number;
  shadowAccuracy: number;
  predictionCount: number;
  correctPredictions: number;
  lastPromotionCheck: Date;
  promotionHistory: { from: PromotionLevel; to: PromotionLevel; timestamp: Date; reason: string }[];
}

export interface ContentPrediction {
  id: string;
  contentType: string;
  predictedPerformance: number;
  confidence: number;
  factors: { factor: string; weight: number; value: number }[];
  level: PromotionLevel;
  timestamp: Date;
  actualPerformance?: number;
  accurate?: boolean;
}

const EVIDENCE_THRESHOLDS = {
  "shadow→assisted": { accuracy: 0.5, minPredictions: 20, maturityRequired: 0.4 },
  "assisted→supervised": { accuracy: 0.65, minPredictions: 50, maturityRequired: 0.6 },
  "supervised→active": { accuracy: 0.75, minPredictions: 100, maturityRequired: 0.8 },
};

let state: PredictiveContentState = {
  currentLevel: "shadow",
  evidenceScore: 0,
  shadowAccuracy: 0,
  predictionCount: 0,
  correctPredictions: 0,
  lastPromotionCheck: new Date(),
  promotionHistory: [],
};

const predictions: ContentPrediction[] = [];

export function getPromotionState(): PredictiveContentState {
  return { ...state };
}

export function makePrediction(
  contentType: string,
  factors: { factor: string; weight: number; value: number }[]
): ContentPrediction {
  const predictedPerformance = factors.reduce((sum, f) => sum + f.weight * f.value, 0);
  const domainConfidence = getConfidenceForDomain("content");
  const confidence = Math.min(0.95, domainConfidence * 0.7 + 0.3);

  const prediction: ContentPrediction = {
    id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    contentType,
    predictedPerformance,
    confidence,
    factors,
    level: state.currentLevel,
    timestamp: new Date(),
  };

  predictions.push(prediction);
  state.predictionCount++;

  return prediction;
}

export function recordActualPerformance(predictionId: string, actualPerformance: number): boolean {
  const prediction = predictions.find((p) => p.id === predictionId);
  if (!prediction) return false;

  prediction.actualPerformance = actualPerformance;
  const tolerance = 0.2;
  const diff = Math.abs(prediction.predictedPerformance - actualPerformance);
  prediction.accurate = diff <= tolerance * Math.max(1, actualPerformance);

  if (prediction.accurate) state.correctPredictions++;
  state.shadowAccuracy = state.predictionCount > 0 ? state.correctPredictions / state.predictionCount : 0;
  state.evidenceScore = state.shadowAccuracy;

  return true;
}

export function checkPromotion(): { promoted: boolean; from?: PromotionLevel; to?: PromotionLevel; reason: string } {
  state.lastPromotionCheck = new Date();

  if (state.currentLevel === "active") {
    return { promoted: false, reason: "Already at active level" };
  }

  const nextLevel: Record<PromotionLevel, PromotionLevel> = {
    shadow: "assisted",
    assisted: "supervised",
    supervised: "active",
    active: "active",
  };

  const target = nextLevel[state.currentLevel];
  const thresholdKey = `${state.currentLevel}→${target}` as keyof typeof EVIDENCE_THRESHOLDS;
  const threshold = EVIDENCE_THRESHOLDS[thresholdKey];

  if (!threshold) return { promoted: false, reason: "No threshold defined" };

  if (state.predictionCount < threshold.minPredictions) {
    return { promoted: false, reason: `Insufficient predictions: ${state.predictionCount}/${threshold.minPredictions}` };
  }

  if (state.shadowAccuracy < threshold.accuracy) {
    return { promoted: false, reason: `Accuracy too low: ${(state.shadowAccuracy * 100).toFixed(1)}% < ${(threshold.accuracy * 100).toFixed(1)}%` };
  }

  const requiredAutoLevel = state.currentLevel === "shadow" ? "assisted" : state.currentLevel === "assisted" ? "supervised" : "autonomous";
  if (!canAutomate("content", requiredAutoLevel)) {
    return { promoted: false, reason: `Domain maturity insufficient for ${requiredAutoLevel} level` };
  }

  const maturityScore = getConfidenceForDomain("content");
  if (maturityScore < threshold.maturityRequired) {
    return { promoted: false, reason: `Domain maturity ${(maturityScore * 100).toFixed(1)}% below required ${(threshold.maturityRequired * 100).toFixed(1)}%` };
  }

  const from = state.currentLevel;
  state.currentLevel = target;
  state.promotionHistory.push({ from, to: target, timestamp: new Date(), reason: `Evidence threshold met: accuracy=${(state.shadowAccuracy * 100).toFixed(1)}%, predictions=${state.predictionCount}` });

  appendEvent("experiment.promoted", "content", "predictive-intelligence", {
    from,
    to: target,
    accuracy: state.shadowAccuracy,
    predictionCount: state.predictionCount,
  }, "predictive-content-promotion");

  return { promoted: true, from, to: target, reason: `Promoted based on ${state.predictionCount} predictions with ${(state.shadowAccuracy * 100).toFixed(1)}% accuracy` };
}

export function demoteToShadow(reason: string): void {
  const from = state.currentLevel;
  state.currentLevel = "shadow";
  state.promotionHistory.push({ from, to: "shadow", timestamp: new Date(), reason: `Demotion: ${reason}` });
}

export function getPredictions(limit: number = 20): ContentPrediction[] {
  return predictions.slice(-limit);
}

export function getPredictionAccuracy(): { overall: number; byType: Record<string, number> } {
  const evaluated = predictions.filter((p) => p.accurate !== undefined);
  const overall = evaluated.length > 0 ? evaluated.filter((p) => p.accurate).length / evaluated.length : 0;

  const byType: Record<string, number> = {};
  const types = [...new Set(evaluated.map((p) => p.contentType))];
  for (const type of types) {
    const typeEvals = evaluated.filter((p) => p.contentType === type);
    byType[type] = typeEvals.filter((p) => p.accurate).length / typeEvals.length;
  }

  return { overall, byType };
}
