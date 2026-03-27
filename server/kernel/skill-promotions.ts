import { appendEvent } from "./creator-intelligence-graph";
import { evaluateExperiment } from "./experiment-engine";

export type PromotionStatus = "candidate" | "evaluating" | "promoted" | "rejected" | "rolled_back";

export interface SkillPromotion {
  id: string;
  skillName: string;
  fromLevel: "experimental" | "shadow" | "assisted";
  toLevel: "shadow" | "assisted" | "supervised" | "autonomous";
  status: PromotionStatus;
  evidenceScore: number;
  requiredEvidenceThreshold: number;
  experimentId?: string;
  promotedAt?: Date;
  rolledBackAt?: Date;
  auditTrail: PromotionAuditEntry[];
  createdAt: Date;
}

export interface PromotionAuditEntry {
  action: string;
  timestamp: Date;
  details: Record<string, any>;
  actor: string;
}

const promotionStore = new Map<string, SkillPromotion>();

const EVIDENCE_THRESHOLDS: Record<string, number> = {
  "experimental→shadow": 0.3,
  "shadow→assisted": 0.5,
  "assisted→supervised": 0.7,
  "shadow→supervised": 0.7,
  "supervised→autonomous": 0.9,
  "experimental→assisted": 0.5,
  "assisted→autonomous": 0.9,
};

export function proposePromotion(
  skillName: string,
  fromLevel: SkillPromotion["fromLevel"],
  toLevel: SkillPromotion["toLevel"],
  evidenceScore: number,
  experimentId?: string
): SkillPromotion {
  const id = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const thresholdKey = `${fromLevel}→${toLevel}`;
  const requiredThreshold = EVIDENCE_THRESHOLDS[thresholdKey] || 0.7;

  const promotion: SkillPromotion = {
    id,
    skillName,
    fromLevel,
    toLevel,
    status: "candidate",
    evidenceScore: Math.max(0, Math.min(1, evidenceScore)),
    requiredEvidenceThreshold: requiredThreshold,
    experimentId,
    auditTrail: [{
      action: "proposed",
      timestamp: new Date(),
      details: { evidenceScore, requiredThreshold, fromLevel, toLevel },
      actor: "skill-promotions",
    }],
    createdAt: new Date(),
  };

  promotionStore.set(id, promotion);
  return promotion;
}

export function evaluatePromotion(promotionId: string): { eligible: boolean; reason: string } {
  const promo = promotionStore.get(promotionId);
  if (!promo) return { eligible: false, reason: "Promotion not found" };
  if (promo.status !== "candidate") return { eligible: false, reason: `Promotion already ${promo.status}` };

  promo.status = "evaluating";
  promo.auditTrail.push({
    action: "evaluation_started",
    timestamp: new Date(),
    details: {},
    actor: "skill-promotions",
  });

  if (promo.evidenceScore < promo.requiredEvidenceThreshold) {
    promo.status = "rejected";
    promo.auditTrail.push({
      action: "rejected_insufficient_evidence",
      timestamp: new Date(),
      details: { evidenceScore: promo.evidenceScore, required: promo.requiredEvidenceThreshold },
      actor: "skill-promotions",
    });
    return { eligible: false, reason: `Evidence score ${promo.evidenceScore.toFixed(2)} below threshold ${promo.requiredEvidenceThreshold}` };
  }

  if (promo.experimentId) {
    const result = evaluateExperiment(promo.experimentId);
    if (result.recommendation !== "promote") {
      promo.status = "rejected";
      promo.auditTrail.push({
        action: "rejected_experiment_not_promoting",
        timestamp: new Date(),
        details: { experimentResult: result.recommendation },
        actor: "skill-promotions",
      });
      return { eligible: false, reason: `Experiment recommends: ${result.recommendation}` };
    }
  }

  return { eligible: true, reason: "Meets all promotion criteria" };
}

export function executePromotion(promotionId: string): boolean {
  const promo = promotionStore.get(promotionId);
  if (!promo) return false;

  const evaluation = evaluatePromotion(promotionId);
  if (!evaluation.eligible) return false;

  promo.status = "promoted";
  promo.promotedAt = new Date();
  promo.auditTrail.push({
    action: "promoted",
    timestamp: new Date(),
    details: { fromLevel: promo.fromLevel, toLevel: promo.toLevel },
    actor: "skill-promotions",
  });

  appendEvent("experiment.promoted", "skill", promo.skillName, {
    fromLevel: promo.fromLevel,
    toLevel: promo.toLevel,
    evidenceScore: promo.evidenceScore,
  }, "skill-promotions");

  return true;
}

export function rollbackPromotion(promotionId: string, reason: string): boolean {
  const promo = promotionStore.get(promotionId);
  if (!promo || promo.status !== "promoted") return false;

  promo.status = "rolled_back";
  promo.rolledBackAt = new Date();
  promo.auditTrail.push({
    action: "rolled_back",
    timestamp: new Date(),
    details: { reason },
    actor: "skill-promotions",
  });

  return true;
}

export function getPromotion(id: string): SkillPromotion | undefined {
  return promotionStore.get(id);
}

export function getPromotionsBySkill(skillName: string): SkillPromotion[] {
  return Array.from(promotionStore.values()).filter((p) => p.skillName === skillName);
}

export function getActivePromotions(): SkillPromotion[] {
  return Array.from(promotionStore.values()).filter((p) => p.status === "promoted");
}

export function getPendingPromotions(): SkillPromotion[] {
  return Array.from(promotionStore.values()).filter((p) => p.status === "candidate" || p.status === "evaluating");
}
