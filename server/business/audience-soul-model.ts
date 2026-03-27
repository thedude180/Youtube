import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface AudienceSoulDimension {
  name: string;
  value: number;
  confidence: number;
  evidenceCount: number;
  evidenceLabel: "verified" | "inferred" | "estimated" | "hypothesized";
  lastUpdated: Date;
}

export interface AudienceSoulModel {
  channelId: string;
  dimensions: AudienceSoulDimension[];
  overallConfidence: number;
  boundedness: number;
  privacySafe: boolean;
  predictions: AudiencePrediction[];
  lastAssessed: Date;
}

export interface AudiencePrediction {
  id: string;
  prediction: string;
  confidence: number;
  evidenceLabel: "verified" | "inferred" | "estimated";
  basis: string[];
  createdAt: Date;
  validatedAt?: Date;
  accurate?: boolean;
}

function labelEvidence(evidenceCount: number, confidence: number): AudienceSoulDimension["evidenceLabel"] {
  if (evidenceCount >= 50 && confidence >= 0.8) return "verified";
  if (evidenceCount >= 20 && confidence >= 0.5) return "inferred";
  if (evidenceCount >= 5) return "estimated";
  return "hypothesized";
}

export function buildAudienceSoulModel(
  channelId: string,
  signals: { dimension: string; value: number; confidence: number }[]
): AudienceSoulModel {
  const dimensionMap = new Map<string, { values: number[]; confidences: number[] }>();

  for (const signal of signals) {
    if (!dimensionMap.has(signal.dimension)) {
      dimensionMap.set(signal.dimension, { values: [], confidences: [] });
    }
    const entry = dimensionMap.get(signal.dimension)!;
    entry.values.push(signal.value);
    entry.confidences.push(signal.confidence);
  }

  const dimensions: AudienceSoulDimension[] = [];
  for (const [name, data] of dimensionMap) {
    const avgValue = data.values.reduce((a, b) => a + b, 0) / data.values.length;
    const avgConfidence = data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;
    dimensions.push({
      name,
      value: avgValue,
      confidence: avgConfidence,
      evidenceCount: data.values.length,
      evidenceLabel: labelEvidence(data.values.length, avgConfidence),
      lastUpdated: new Date(),
    });
  }

  const overallConfidence = dimensions.length > 0
    ? dimensions.reduce((sum, d) => sum + d.confidence, 0) / dimensions.length
    : 0;

  const verifiedCount = dimensions.filter((d) => d.evidenceLabel === "verified" || d.evidenceLabel === "inferred").length;
  const boundedness = dimensions.length > 0 ? verifiedCount / dimensions.length : 0;

  return {
    channelId,
    dimensions,
    overallConfidence,
    boundedness,
    privacySafe: true,
    predictions: [],
    lastAssessed: new Date(),
  };
}

export function makeBoundedPrediction(
  model: AudienceSoulModel,
  prediction: string,
  basis: string[]
): AudiencePrediction | null {
  const relevantDimensions = model.dimensions.filter((d) => basis.includes(d.name));
  if (relevantDimensions.length === 0) return null;

  const avgConfidence = relevantDimensions.reduce((sum, d) => sum + d.confidence, 0) / relevantDimensions.length;
  const minEvidenceLabel = relevantDimensions.reduce<AudienceSoulDimension["evidenceLabel"]>(
    (min, d) => {
      const order: AudienceSoulDimension["evidenceLabel"][] = ["hypothesized", "estimated", "inferred", "verified"];
      return order.indexOf(d.evidenceLabel) < order.indexOf(min) ? d.evidenceLabel : min;
    },
    "verified"
  );

  const boundedConfidence = Math.min(avgConfidence, model.boundedness);

  const pred: AudiencePrediction = {
    id: `soul_pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    prediction,
    confidence: boundedConfidence,
    evidenceLabel: minEvidenceLabel === "hypothesized" ? "estimated" : minEvidenceLabel,
    basis,
    createdAt: new Date(),
  };

  model.predictions.push(pred);
  return pred;
}

export function validatePrediction(model: AudienceSoulModel, predictionId: string, accurate: boolean): boolean {
  const pred = model.predictions.find((p) => p.id === predictionId);
  if (!pred) return false;
  pred.validatedAt = new Date();
  pred.accurate = accurate;
  return true;
}

export function getSoulModelAccuracy(model: AudienceSoulModel): {
  totalPredictions: number;
  validatedPredictions: number;
  accuracy: number;
  byEvidenceLabel: Record<string, { count: number; accuracy: number }>;
} {
  const validated = model.predictions.filter((p) => p.validatedAt !== undefined);
  const accuracy = validated.length > 0 ? validated.filter((p) => p.accurate).length / validated.length : 0;

  const byLabel: Record<string, { total: number; correct: number }> = {};
  for (const pred of validated) {
    if (!byLabel[pred.evidenceLabel]) byLabel[pred.evidenceLabel] = { total: 0, correct: 0 };
    byLabel[pred.evidenceLabel].total++;
    if (pred.accurate) byLabel[pred.evidenceLabel].correct++;
  }

  const byEvidenceLabel: Record<string, { count: number; accuracy: number }> = {};
  for (const [label, data] of Object.entries(byLabel)) {
    byEvidenceLabel[label] = { count: data.total, accuracy: data.total > 0 ? data.correct / data.total : 0 };
  }

  return {
    totalPredictions: model.predictions.length,
    validatedPredictions: validated.length,
    accuracy,
    byEvidenceLabel,
  };
}
