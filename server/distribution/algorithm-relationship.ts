import { db } from "../db";
import { algorithmRelationships, distributionEvents } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type AlgorithmModel = {
  platform: string;
  contentType: string;
  ctrResponse: number;
  retentionResponse: number;
  recommendationRate: number;
  algorithmFavor: number;
  patterns: Record<string, any>;
  insight: string;
};

type AlgorithmAnalysis = {
  userId: string;
  models: AlgorithmModel[];
  platformRankings: Record<string, number>;
  bestContentTypes: string[];
  recommendations: string[];
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "algorithm-relationship", 3);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

export async function analyzeAlgorithmRelationships(userId: string, platforms?: string[]): Promise<AlgorithmAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, models: [], platformRankings: {}, bestContentTypes: [], recommendations: [] };
  }

  const relationships = await db.select().from(algorithmRelationships)
    .where(eq(algorithmRelationships.userId, userId))
    .orderBy(desc(algorithmRelationships.algorithmFavor))
    .limit(50);

  const recentEvents = await db.select().from(distributionEvents)
    .where(and(
      eq(distributionEvents.userId, userId),
      gte(distributionEvents.createdAt, daysAgo(30))
    ))
    .limit(200);

  const eventSuccessRates: Record<string, { success: number; total: number }> = {};
  for (const e of recentEvents) {
    const key = `${e.platform}:${e.eventType}`;
    const entry = eventSuccessRates[key] || { success: 0, total: 0 };
    entry.total++;
    if (e.status === "published" || e.status === "approved") entry.success++;
    eventSuccessRates[key] = entry;
  }

  const filtered = platforms
    ? relationships.filter(r => platforms.includes(r.platform))
    : relationships;

  const models: AlgorithmModel[] = filtered.map(r => {
    const favor = r.algorithmFavor ?? 0.5;
    let insight = "";
    if (favor > 0.7) insight = `Algorithm strongly favors ${r.contentType} on ${r.platform}`;
    else if (favor > 0.5) insight = `Algorithm is neutral toward ${r.contentType} on ${r.platform}`;
    else insight = `Algorithm underperforms for ${r.contentType} on ${r.platform} — consider format changes`;

    return {
      platform: r.platform,
      contentType: r.contentType,
      ctrResponse: r.ctrResponse ?? 0,
      retentionResponse: r.retentionResponse ?? 0,
      recommendationRate: r.recommendationRate ?? 0,
      algorithmFavor: favor,
      patterns: r.patterns || {},
      insight,
    };
  });

  const platformRankings: Record<string, number> = {};
  const platformModels: Record<string, AlgorithmModel[]> = {};
  for (const m of models) {
    if (!platformModels[m.platform]) platformModels[m.platform] = [];
    platformModels[m.platform].push(m);
  }
  for (const [plat, mods] of Object.entries(platformModels)) {
    platformRankings[plat] = mods.reduce((s, m) => s + m.algorithmFavor, 0) / mods.length;
  }

  const bestContentTypes = models
    .filter(m => m.algorithmFavor > 0.6)
    .sort((a, b) => b.algorithmFavor - a.algorithmFavor)
    .slice(0, 5)
    .map(m => `${m.contentType} (${m.platform})`);

  const recommendations: string[] = [];
  for (const m of models) {
    if (m.algorithmFavor < 0.4) {
      recommendations.push(`Consider reducing ${m.contentType} on ${m.platform} — low algorithm favor`);
    }
    if (m.ctrResponse > 0.8 && m.retentionResponse < 0.4) {
      recommendations.push(`${m.contentType} on ${m.platform}: High CTR but low retention — improve content depth`);
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "algorithm.analyzed", {
      modelCount: models.length, platformCount: Object.keys(platformRankings).length,
    }, "algorithm-relationship", "analysis");
  } catch {}

  return { userId, models, platformRankings, bestContentTypes, recommendations };
}

export async function updateAlgorithmSignal(
  userId: string,
  platform: string,
  contentType: string,
  signal: { ctrResponse?: number; retentionResponse?: number; recommendationRate?: number }
): Promise<void> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) return;

  const existing = await db.select().from(algorithmRelationships)
    .where(and(
      eq(algorithmRelationships.userId, userId),
      eq(algorithmRelationships.platform, platform),
      eq(algorithmRelationships.contentType, contentType)
    ))
    .limit(1);

  const ctr = signal.ctrResponse ?? existing[0]?.ctrResponse ?? 0.5;
  const retention = signal.retentionResponse ?? existing[0]?.retentionResponse ?? 0.5;
  const recommendation = signal.recommendationRate ?? existing[0]?.recommendationRate ?? 0.5;
  const algorithmFavor = (ctr * 0.3 + retention * 0.4 + recommendation * 0.3);

  if (existing.length > 0) {
    await db.update(algorithmRelationships)
      .set({
        ctrResponse: ctr,
        retentionResponse: retention,
        recommendationRate: recommendation,
        algorithmFavor,
        updatedAt: new Date(),
      })
      .where(eq(algorithmRelationships.id, existing[0].id));
  } else {
    await db.insert(algorithmRelationships).values({
      userId,
      platform,
      contentType,
      ctrResponse: ctr,
      retentionResponse: retention,
      recommendationRate: recommendation,
      algorithmFavor,
    }).catch(() => {});
  }
}
