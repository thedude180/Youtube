import { db } from "../db";
import {
  learningSignals,
  learningMaturityScores,
  narrativePromises,
  licensingExchangeAssets,
  overrideLearningRecords,
  signalContradictions,
  domainEvents,
} from "@shared/schema";
import { eq, and, desc, lte, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("learning-governance");

const SIGNAL_HALF_LIVES: Record<string, number> = {
  engagement: 7 * 24 * 60 * 60 * 1000,
  content: 14 * 24 * 60 * 60 * 1000,
  revenue: 30 * 24 * 60 * 60 * 1000,
  audience: 21 * 24 * 60 * 60 * 1000,
  distribution: 10 * 24 * 60 * 60 * 1000,
  default: 14 * 24 * 60 * 60 * 1000,
};

const DOMAINS = ["content", "revenue", "audience", "distribution"] as const;
type Domain = (typeof DOMAINS)[number];

export function computeDecayFactor(ageMs: number, category: string): number {
  const halfLife = SIGNAL_HALF_LIVES[category] || SIGNAL_HALF_LIVES.default;
  return Math.pow(0.5, ageMs / halfLife);
}

export function getSignalHalfLife(category: string): number {
  return SIGNAL_HALF_LIVES[category] || SIGNAL_HALF_LIVES.default;
}

export function setSignalHalfLife(category: string, halfLifeMs: number): void {
  SIGNAL_HALF_LIVES[category] = halfLifeMs;
}

export async function ingestLearningSignal(
  userId: string,
  category: string,
  signalType: string,
  value: Record<string, any>,
  confidence: number,
  sourceAgent: string,
  bandClass: string = "GREEN",
  sampleSize: number = 1,
): Promise<{ signalId: number; governed: boolean; contradictions: number }> {
  if (confidence < 0 || confidence > 1) {
    throw new Error("Confidence must be between 0 and 1");
  }
  if (!category || !signalType) {
    throw new Error("Category and signalType are required for governance");
  }
  if (!sourceAgent) {
    throw new Error("Source agent provenance is required");
  }

  const [signal] = await db.insert(learningSignals).values({
    userId,
    category,
    signalType,
    bandClass,
    value,
    confidence,
    sampleSize,
    sourceAgent,
  }).returning();

  const contradictions = await detectContradictions(userId, category, signal.id, signalType, value);

  await updateMaturityScore(userId, category);

  return { signalId: signal.id, governed: true, contradictions: contradictions.length };
}

export async function getDecayedSignals(
  userId: string,
  category?: string,
  limit: number = 50,
): Promise<Array<{
  id: number;
  signalType: string;
  category: string;
  value: Record<string, any>;
  rawConfidence: number;
  decayedConfidence: number;
  decayFactor: number;
  ageMs: number;
  fresh: boolean;
}>> {
  const conditions = [eq(learningSignals.userId, userId)];
  if (category) conditions.push(eq(learningSignals.category, category));

  const signals = await db.select().from(learningSignals)
    .where(and(...conditions))
    .orderBy(desc(learningSignals.emittedAt))
    .limit(limit);

  const now = Date.now();
  return signals.map(s => {
    const ageMs = now - new Date(s.emittedAt!).getTime();
    const decayFactor = computeDecayFactor(ageMs, s.category);
    const decayedConfidence = s.confidence * decayFactor;
    const halfLife = getSignalHalfLife(s.category);
    return {
      id: s.id,
      signalType: s.signalType,
      category: s.category,
      value: (s.value as Record<string, any>) || {},
      rawConfidence: s.confidence,
      decayedConfidence: Math.round(decayedConfidence * 1000) / 1000,
      decayFactor: Math.round(decayFactor * 1000) / 1000,
      ageMs,
      fresh: ageMs < halfLife,
    };
  });
}

export function computeMaturityScore(
  signalCount: number,
  avgFreshness: number,
  contradictionRate: number,
  consistency: number,
): number {
  const volumeScore = Math.min(30, signalCount * 1.5);
  const freshnessScore = avgFreshness * 25;
  const consistencyScore = consistency * 25;
  const contradictionPenalty = contradictionRate * 20;

  return Math.max(0, Math.min(100, Math.round(
    volumeScore + freshnessScore + consistencyScore - contradictionPenalty
  )));
}

export async function updateMaturityScore(userId: string, category: string): Promise<{
  score: number;
  signalCount: number;
  maturityLevel: string;
}> {
  const signals = await getDecayedSignals(userId, category, 100);
  const signalCount = signals.length;

  const avgFreshness = signalCount > 0
    ? signals.filter(s => s.fresh).length / signalCount
    : 0;

  const openContradictions = await db.select({ id: signalContradictions.id })
    .from(signalContradictions)
    .where(and(
      eq(signalContradictions.userId, userId),
      eq(signalContradictions.domain, category),
      eq(signalContradictions.status, "open"),
    ));
  const contradictionRate = signalCount > 0
    ? Math.min(1, openContradictions.length / signalCount)
    : 0;

  const confidenceValues = signals.map(s => s.decayedConfidence);
  const avgConf = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0;
  const variance = confidenceValues.length > 1
    ? confidenceValues.reduce((sum, c) => sum + Math.pow(c - avgConf, 2), 0) / confidenceValues.length
    : 0;
  const consistency = Math.max(0, 1 - Math.sqrt(variance));

  const score = computeMaturityScore(signalCount, avgFreshness, contradictionRate, consistency);
  const maturityLevel = score >= 70 ? "mature" : score >= 40 ? "developing" : "nascent";

  const [existing] = await db.select().from(learningMaturityScores)
    .where(and(eq(learningMaturityScores.userId, userId), eq(learningMaturityScores.category, category)))
    .limit(1);

  if (existing) {
    await db.update(learningMaturityScores)
      .set({ score, signalCount, lastUpdatedAt: new Date() })
      .where(eq(learningMaturityScores.id, existing.id));
  } else {
    await db.insert(learningMaturityScores).values({ userId, category, score, signalCount });
  }

  return { score, signalCount, maturityLevel };
}

export async function getMaturityScores(userId: string): Promise<Record<string, {
  score: number;
  signalCount: number;
  maturityLevel: string;
}>> {
  const scores = await db.select().from(learningMaturityScores)
    .where(eq(learningMaturityScores.userId, userId));

  const result: Record<string, { score: number; signalCount: number; maturityLevel: string }> = {};
  for (const s of scores) {
    const level = (s.score ?? 0) >= 70 ? "mature" : (s.score ?? 0) >= 40 ? "developing" : "nascent";
    result[s.category] = { score: s.score ?? 0, signalCount: s.signalCount ?? 0, maturityLevel: level };
  }
  return result;
}

export function computeGovernedConfidence(
  baseConfidence: number,
  maturityScore: number,
  decayFactor: number,
  contradictionPenalty: number = 0,
): number {
  const maturityMultiplier = 0.5 + (maturityScore / 200);
  const adjusted = baseConfidence * decayFactor * maturityMultiplier * (1 - contradictionPenalty);
  return Math.max(0, Math.min(1, Math.round(adjusted * 1000) / 1000));
}

export async function getGovernedConfidenceForDomain(userId: string, domain: string): Promise<{
  confidence: number;
  maturityScore: number;
  signalCount: number;
  freshSignalCount: number;
  contradictionCount: number;
  maturityLevel: string;
}> {
  const signals = await getDecayedSignals(userId, domain, 100);
  const freshSignals = signals.filter(s => s.fresh);

  const scores = await getMaturityScores(userId);
  const domainScore = scores[domain] || { score: 0, signalCount: 0, maturityLevel: "nascent" };

  const openContradictions = await db.select({ id: signalContradictions.id })
    .from(signalContradictions)
    .where(and(
      eq(signalContradictions.userId, userId),
      eq(signalContradictions.domain, domain),
      eq(signalContradictions.status, "open"),
    ));

  const contradictionPenalty = Math.min(0.5, openContradictions.length * 0.1);

  const avgDecay = signals.length > 0
    ? signals.reduce((s, sig) => s + sig.decayFactor, 0) / signals.length
    : 0;

  const baseConf = signals.length > 0
    ? signals.reduce((s, sig) => s + sig.rawConfidence, 0) / signals.length
    : 0;

  const confidence = computeGovernedConfidence(baseConf, domainScore.score, avgDecay, contradictionPenalty);

  return {
    confidence,
    maturityScore: domainScore.score,
    signalCount: signals.length,
    freshSignalCount: freshSignals.length,
    contradictionCount: openContradictions.length,
    maturityLevel: domainScore.maturityLevel,
  };
}

export async function detectContradictions(
  userId: string,
  domain: string,
  newSignalId: number,
  signalType: string,
  value: Record<string, any>,
): Promise<Array<{ id: number; description: string }>> {
  const CONTRADICTION_RULES: Record<string, { opposites: string[]; description: string }> = {
    increase_frequency: { opposites: ["decrease_frequency", "burnout_risk", "slow_down"], description: "Frequency increase contradicts burnout/slowdown signals" },
    decrease_frequency: { opposites: ["increase_frequency", "grow_fast"], description: "Frequency decrease contradicts growth acceleration signals" },
    expand_reach: { opposites: ["reduce_exposure", "minimize_risk"], description: "Reach expansion contradicts risk minimization signals" },
    monetize_aggressively: { opposites: ["audience_first", "reduce_monetization"], description: "Aggressive monetization contradicts audience-first signals" },
    burnout_risk: { opposites: ["increase_frequency", "grow_fast"], description: "Burnout risk contradicts growth/frequency increase signals" },
  };

  const rule = CONTRADICTION_RULES[signalType];
  if (!rule) return [];

  const recentSignals = await db.select().from(learningSignals)
    .where(and(
      eq(learningSignals.userId, userId),
      eq(learningSignals.category, domain),
    ))
    .orderBy(desc(learningSignals.emittedAt))
    .limit(50);

  const found: Array<{ id: number; description: string }> = [];

  for (const existing of recentSignals) {
    if (existing.id === newSignalId) continue;
    if (rule.opposites.includes(existing.signalType)) {
      const ageMs = Date.now() - new Date(existing.emittedAt!).getTime();
      const decayFactor = computeDecayFactor(ageMs, domain);
      if (decayFactor < 0.1) continue;

      const [contradiction] = await db.insert(signalContradictions).values({
        userId,
        domain,
        signalAId: newSignalId,
        signalBId: existing.id,
        description: rule.description,
        severity: decayFactor > 0.7 ? "high" : "medium",
      }).returning();

      found.push({ id: contradiction.id, description: rule.description });
    }
  }

  return found;
}

export async function resolveContradiction(
  contradictionId: number,
  resolution: string,
): Promise<boolean> {
  const [updated] = await db.update(signalContradictions)
    .set({ status: "resolved", resolution, resolvedAt: new Date() })
    .where(eq(signalContradictions.id, contradictionId))
    .returning();
  return !!updated;
}

export async function getOpenContradictions(
  userId: string,
  domain?: string,
): Promise<Array<{
  id: number;
  domain: string;
  signalAId: number;
  signalBId: number;
  description: string;
  severity: string;
  createdAt: Date | null;
}>> {
  const conditions = [eq(signalContradictions.userId, userId), eq(signalContradictions.status, "open")];
  if (domain) conditions.push(eq(signalContradictions.domain, domain));

  return db.select().from(signalContradictions)
    .where(and(...conditions))
    .orderBy(desc(signalContradictions.createdAt));
}

export async function createNarrativePromise(
  userId: string,
  promiseType: string,
  title: string,
  description?: string,
  deadline?: Date,
  metadata: Record<string, any> = {},
): Promise<number> {
  const [promise] = await db.insert(narrativePromises).values({
    userId,
    promiseType,
    title,
    description,
    deadline,
    metadata,
  }).returning();
  return promise.id;
}

export async function updatePromiseProgress(
  promiseId: number,
  progress: number,
): Promise<void> {
  const riskLevel = progress >= 0.8 ? "low" : progress >= 0.5 ? "medium" : "high";
  const status = progress >= 1.0 ? "fulfilled" : "active";
  await db.update(narrativePromises)
    .set({ deliveryProgress: progress, riskLevel, status, updatedAt: new Date() })
    .where(eq(narrativePromises.id, promiseId));
}

export async function checkAtRiskPromises(userId: string): Promise<Array<{
  id: number;
  title: string;
  promiseType: string;
  deadline: Date | null;
  deliveryProgress: number;
  riskLevel: string;
  daysUntilDeadline: number | null;
}>> {
  const promises = await db.select().from(narrativePromises)
    .where(and(
      eq(narrativePromises.userId, userId),
      eq(narrativePromises.status, "active"),
    ))
    .orderBy(narrativePromises.deadline);

  const now = Date.now();
  const atRisk: Array<{
    id: number;
    title: string;
    promiseType: string;
    deadline: Date | null;
    deliveryProgress: number;
    riskLevel: string;
    daysUntilDeadline: number | null;
  }> = [];

  for (const p of promises) {
    let daysUntilDeadline: number | null = null;
    let isAtRisk = false;

    if (p.deadline) {
      daysUntilDeadline = Math.ceil((new Date(p.deadline).getTime() - now) / (24 * 60 * 60 * 1000));
      if (daysUntilDeadline <= 7 && p.deliveryProgress < 0.8) isAtRisk = true;
      if (daysUntilDeadline <= 3 && p.deliveryProgress < 0.95) isAtRisk = true;
      if (daysUntilDeadline <= 0) isAtRisk = true;
    }

    if (p.riskLevel === "high") isAtRisk = true;

    if (isAtRisk) {
      atRisk.push({
        id: p.id,
        title: p.title,
        promiseType: p.promiseType,
        deadline: p.deadline,
        deliveryProgress: p.deliveryProgress,
        riskLevel: p.riskLevel,
        daysUntilDeadline,
      });
    }
  }

  return atRisk;
}

export async function getUserPromises(userId: string, status?: string): Promise<Array<{
  id: number;
  promiseType: string;
  title: string;
  description: string | null;
  deadline: Date | null;
  status: string;
  deliveryProgress: number;
  riskLevel: string;
}>> {
  const conditions = [eq(narrativePromises.userId, userId)];
  if (status) conditions.push(eq(narrativePromises.status, status));

  return db.select().from(narrativePromises)
    .where(and(...conditions))
    .orderBy(desc(narrativePromises.createdAt));
}

export async function recordOverrideLearning(
  userId: string,
  actionType: string,
  originalValue: Record<string, any>,
  overrideValue: Record<string, any>,
  reason: string,
): Promise<number> {
  const [record] = await db.insert(overrideLearningRecords).values({
    patternDetected: `${actionType}: user override`,
    suggestedRuleChange: { actionType, originalValue, overrideValue, reason },
    confidenceScore: 0.5,
    metadata: { userId, actionType, reason, timestamp: Date.now() },
  }).returning();

  await ingestLearningSignal(
    userId,
    inferDomainFromAction(actionType),
    `override_${actionType}`,
    { original: originalValue, override: overrideValue, reason },
    0.7,
    "override-learning",
    "YELLOW",
  );

  return record.id;
}

export async function getOverridePatterns(userId: string): Promise<Array<{
  actionType: string;
  count: number;
  commonReason: string;
  suggestAutoAdjust: boolean;
}>> {
  const records = await db.select().from(overrideLearningRecords)
    .where(sql`${overrideLearningRecords.metadata}->>'userId' = ${userId}`)
    .orderBy(desc(overrideLearningRecords.createdAt))
    .limit(100);

  const byAction = new Map<string, { count: number; reasons: string[] }>();
  for (const r of records) {
    const change = r.suggestedRuleChange as Record<string, any> | null;
    const actionType = change?.actionType || "unknown";
    const reason = change?.reason || "unknown";
    if (!byAction.has(actionType)) byAction.set(actionType, { count: 0, reasons: [] });
    const entry = byAction.get(actionType)!;
    entry.count++;
    entry.reasons.push(reason);
  }

  return Array.from(byAction.entries()).map(([actionType, data]) => {
    const reasonCounts = new Map<string, number>();
    for (const r of data.reasons) reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
    const commonReason = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
    return {
      actionType,
      count: data.count,
      commonReason,
      suggestAutoAdjust: data.count >= 3,
    };
  }).sort((a, b) => b.count - a.count);
}

export async function registerLicensingAsset(
  userId: string,
  assetType: string,
  assetId: string,
  title: string,
  metadata: Record<string, any> = {},
): Promise<number> {
  const [asset] = await db.insert(licensingExchangeAssets).values({
    userId,
    assetType,
    assetId,
    title,
    metadata,
  }).returning();
  return asset.id;
}

export async function updateLicensingStatus(
  id: number,
  licensingStatus: string,
  rightsVerified: boolean,
): Promise<void> {
  const readinessScore = computeLicensingReadiness(licensingStatus, rightsVerified);
  await db.update(licensingExchangeAssets)
    .set({ licensingStatus, rightsVerified, readinessScore, updatedAt: new Date() })
    .where(eq(licensingExchangeAssets.id, id));
}

function computeLicensingReadiness(status: string, rightsVerified: boolean): number {
  let score = 0;
  if (rightsVerified) score += 40;
  switch (status) {
    case "fully_licensed": score += 60; break;
    case "partially_licensed": score += 35; break;
    case "pending_review": score += 15; break;
    case "unlicensed": score += 0; break;
  }
  return Math.min(100, score);
}

export async function getLicensingReadiness(userId: string): Promise<{
  totalAssets: number;
  readyAssets: number;
  avgReadinessScore: number;
  byStatus: Record<string, number>;
  exchangeReady: boolean;
}> {
  const assets = await db.select().from(licensingExchangeAssets)
    .where(eq(licensingExchangeAssets.userId, userId));

  const byStatus: Record<string, number> = {};
  let totalReadiness = 0;
  let readyCount = 0;

  for (const a of assets) {
    byStatus[a.licensingStatus] = (byStatus[a.licensingStatus] || 0) + 1;
    totalReadiness += a.readinessScore;
    if (a.readinessScore >= 80) readyCount++;
  }

  const avgReadinessScore = assets.length > 0 ? Math.round(totalReadiness / assets.length) : 0;

  return {
    totalAssets: assets.length,
    readyAssets: readyCount,
    avgReadinessScore,
    byStatus,
    exchangeReady: assets.length > 0 && avgReadinessScore >= 70 && readyCount >= Math.ceil(assets.length * 0.5),
  };
}

function inferDomainFromAction(actionType: string): string {
  if (actionType.includes("content") || actionType.includes("video") || actionType.includes("publish")) return "content";
  if (actionType.includes("revenue") || actionType.includes("monetiz") || actionType.includes("sponsor")) return "revenue";
  if (actionType.includes("audience") || actionType.includes("subscriber") || actionType.includes("community")) return "audience";
  if (actionType.includes("distribut") || actionType.includes("platform") || actionType.includes("cross_post")) return "distribution";
  return "content";
}
