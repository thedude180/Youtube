import { db } from "../db";
import {
  engineKnowledge, masterKnowledgeBank, crossEngineTeachings,
  users,
} from "@shared/schema";
import { eq, and, desc, gte, sql, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData, getAllStoreStats } from "../lib/engine-store";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("knowledge-mesh");

const MESH_CYCLE_MS = 20 * 60_000;
const CONSOLIDATION_CYCLE_MS = 60 * 60_000;
let meshTimer: ReturnType<typeof setInterval> | null = null;
let consolidationTimer: ReturnType<typeof setInterval> | null = null;

const meshStore = createEngineStore("knowledge-mesh", 5 * 60_000);

const ENGINE_REGISTRY = [
  { name: "self-improvement", domains: ["reflection", "curiosity", "goals", "strategy", "self-awareness"] },
  { name: "growth-flywheel", domains: ["growth", "momentum", "actions", "compound-growth", "execution"] },
  { name: "infinite-evolution", domains: ["system-audit", "meta-improvement", "automation", "cross-domain"] },
  { name: "growth-experiments", domains: ["a-b-testing", "experiment-design", "data-analysis", "hypothesis"] },
  { name: "analytics-intelligence", domains: ["metrics", "trends", "forecasting", "benchmarks", "algorithm"] },
  { name: "empire-brain", domains: ["business-ops", "multi-business", "revenue", "industry-strategy"] },
  { name: "media-command", domains: ["upload-cadence", "content-mix", "channel-health", "compliance"] },
  { name: "content-grinder", domains: ["clip-extraction", "seo", "thumbnails", "exhaustion", "repurpose"] },
  { name: "trend-rider", domains: ["trending-topics", "viral-potential", "timing", "cultural-moments"] },
  { name: "performance-feedback", domains: ["video-performance", "retention", "ctr", "strategy-scoring"] },
  { name: "competitive-intel", domains: ["competitor-analysis", "market-gaps", "emerging-tactics"] },
  { name: "content-originality", domains: ["unique-angles", "research", "differentiation"] },
  { name: "thumbnail-intelligence", domains: ["visual-design", "ctr-optimization", "color-psychology"] },
  { name: "music-composer", domains: ["audio-branding", "mood-matching", "copyright-safety"] },
  { name: "engine-interval-tuner", domains: ["meta-optimization", "interval-tuning", "resource-allocation", "efficiency"] },
  { name: "closed-loop-attribution", domains: ["performance-scoring", "strategy-validation", "content-results", "attribution"] },
  { name: "prompt-evolution", domains: ["prompt-engineering", "ai-quality", "output-improvement", "template-evolution"] },
  { name: "revenue-optimizer", domains: ["rpm-optimization", "monetization", "content-revenue", "game-selection"] },
  { name: "audience-intelligence", domains: ["audience-behavior", "engagement-patterns", "content-gaps", "sentiment"] },
  { name: "predictive-guardian", domains: ["failure-prevention", "health-prediction", "proactive-healing", "system-stability"] },
  { name: "empire-intelligence", domains: ["cross-domain-transfer", "universal-principles", "business-scaling"] },
  { name: "memory-architect", domains: ["knowledge-compression", "memory-management", "forgetting", "consolidation"] },
  { name: "autonomous-experimenter", domains: ["hypothesis-testing", "a-b-testing", "experiment-design", "validation"] },
  { name: "decision-chronicler", domains: ["decision-audit", "transparency", "accountability", "reasoning-trail"] },
] as const;

const TEACHING_PAIRS: Array<{ from: string; to: string; relevance: string }> = [
  { from: "self-improvement", to: "growth-flywheel", relevance: "strategies and goals inform flywheel phases" },
  { from: "growth-flywheel", to: "self-improvement", relevance: "momentum data improves self-assessment" },
  { from: "growth-experiments", to: "self-improvement", relevance: "experiment results validate or kill strategies" },
  { from: "growth-experiments", to: "content-grinder", relevance: "winning formats inform content extraction" },
  { from: "analytics-intelligence", to: "growth-flywheel", relevance: "metric trends guide flywheel actions" },
  { from: "analytics-intelligence", to: "self-improvement", relevance: "performance data grounds self-reflection" },
  { from: "competitive-intel", to: "growth-experiments", relevance: "competitor tactics become experiment ideas" },
  { from: "competitive-intel", to: "content-grinder", relevance: "competitor formats inspire content strategy" },
  { from: "performance-feedback", to: "self-improvement", relevance: "video results drive honest self-assessment" },
  { from: "performance-feedback", to: "growth-experiments", relevance: "performance data validates experiments" },
  { from: "trend-rider", to: "content-grinder", relevance: "trending topics prioritize content extraction" },
  { from: "trend-rider", to: "growth-experiments", relevance: "trends inspire new experiment hypotheses" },
  { from: "thumbnail-intelligence", to: "content-grinder", relevance: "thumbnail patterns improve auto-generation" },
  { from: "content-originality", to: "self-improvement", relevance: "unique angles become strategy candidates" },
  { from: "infinite-evolution", to: "self-improvement", relevance: "system audits reveal improvement priorities" },
  { from: "self-improvement", to: "infinite-evolution", relevance: "goal progress informs system scoring" },
  { from: "empire-brain", to: "analytics-intelligence", relevance: "business KPIs add revenue context to metrics" },
  { from: "media-command", to: "content-grinder", relevance: "cadence rules shape content scheduling" },
  { from: "music-composer", to: "content-grinder", relevance: "music effectiveness improves content quality" },

  { from: "content-grinder", to: "self-improvement", relevance: "distribution results across all platforms reveal what content types and formats actually work" },
  { from: "content-grinder", to: "growth-flywheel", relevance: "cross-platform success data feeds flywheel momentum and compound growth calculations" },
  { from: "content-grinder", to: "growth-experiments", relevance: "platform performance differences inspire new experiments (what works on TikTok vs YouTube vs X)" },
  { from: "content-grinder", to: "analytics-intelligence", relevance: "distribution metrics across platforms give analytics multi-platform trend data" },
  { from: "content-grinder", to: "media-command", relevance: "platform success rates inform upload cadence and content mix decisions per platform" },
  { from: "content-grinder", to: "empire-brain", relevance: "cross-platform revenue and reach data feeds empire-level business strategy" },
  { from: "analytics-intelligence", to: "content-grinder", relevance: "analytics trends tell content grinder which platforms to prioritize" },
  { from: "growth-flywheel", to: "content-grinder", relevance: "flywheel momentum indicates which platforms to double down on" },
  { from: "self-improvement", to: "content-grinder", relevance: "strategy discoveries and curiosity insights shape cross-platform content approach" },
  { from: "trend-rider", to: "media-command", relevance: "trending topics influence optimal posting times and platform selection" },
  { from: "performance-feedback", to: "content-grinder", relevance: "video performance feedback shapes which clips get distributed to which platforms" },
  { from: "performance-feedback", to: "analytics-intelligence", relevance: "individual video performance validates or challenges analytics forecasts" },

  { from: "closed-loop-attribution", to: "self-improvement", relevance: "strategy scores from real results drive honest self-assessment" },
  { from: "closed-loop-attribution", to: "growth-flywheel", relevance: "content performance scores guide flywheel momentum calculations" },
  { from: "closed-loop-attribution", to: "prompt-evolution", relevance: "attribution results show which prompts produce winning content" },
  { from: "closed-loop-attribution", to: "revenue-optimizer", relevance: "performance data reveals which content generates real revenue" },
  { from: "closed-loop-attribution", to: "autonomous-experimenter", relevance: "attribution scores validate or invalidate experiment hypotheses" },

  { from: "prompt-evolution", to: "content-grinder", relevance: "evolved prompts improve content extraction and caption quality" },
  { from: "prompt-evolution", to: "self-improvement", relevance: "prompt improvements feed back into strategy evolution" },
  { from: "prompt-evolution", to: "infinite-evolution", relevance: "prompt quality scores inform system domain audits" },

  { from: "revenue-optimizer", to: "content-grinder", relevance: "revenue data shifts which games and content types get prioritized" },
  { from: "revenue-optimizer", to: "media-command", relevance: "RPM insights guide scheduling and platform allocation" },
  { from: "revenue-optimizer", to: "empire-brain", relevance: "revenue optimization data feeds empire-level business strategy" },

  { from: "audience-intelligence", to: "content-grinder", relevance: "audience preferences shape content extraction priorities" },
  { from: "audience-intelligence", to: "self-improvement", relevance: "audience feedback grounds self-assessment in real viewer reactions" },
  { from: "audience-intelligence", to: "trend-rider", relevance: "audience demand signals identify which trends to ride" },
  { from: "audience-intelligence", to: "growth-flywheel", relevance: "engagement patterns inform flywheel growth strategies" },

  { from: "engine-interval-tuner", to: "predictive-guardian", relevance: "engine slowdowns signal potential systemic health issues" },
  { from: "engine-interval-tuner", to: "infinite-evolution", relevance: "interval efficiency data informs automation domain scoring" },

  { from: "predictive-guardian", to: "self-improvement", relevance: "predicted threats inform proactive strategy adjustments" },
  { from: "predictive-guardian", to: "engine-interval-tuner", relevance: "health predictions guide which engines to speed up or slow down" },

  { from: "empire-intelligence", to: "self-improvement", relevance: "cross-domain patterns expand strategy discovery beyond current domain" },
  { from: "empire-intelligence", to: "growth-flywheel", relevance: "universal principles from other domains accelerate growth" },
  { from: "empire-intelligence", to: "autonomous-experimenter", relevance: "cross-domain patterns suggest new experiment hypotheses" },

  { from: "memory-architect", to: "self-improvement", relevance: "compressed core principles provide cleaner foundation for reflection" },
  { from: "memory-architect", to: "infinite-evolution", relevance: "memory health status informs system efficiency scoring" },

  { from: "autonomous-experimenter", to: "self-improvement", relevance: "experiment results validate or kill strategies with hard evidence" },
  { from: "autonomous-experimenter", to: "growth-flywheel", relevance: "proven experiments become flywheel growth tactics" },
  { from: "autonomous-experimenter", to: "prompt-evolution", relevance: "experiment results guide which prompt variations work best" },

  { from: "decision-chronicler", to: "self-improvement", relevance: "decision patterns reveal blind spots in autonomous reasoning" },
  { from: "decision-chronicler", to: "infinite-evolution", relevance: "decision quality trends inform overall system health scoring" },
];

function ensureMeshUserRegistered(userId: string) {
  registerUserQueries(meshStore, userId, {
    local_knowledge: () => db.select().from(engineKnowledge)
      .where(and(eq(engineKnowledge.userId, userId), eq(engineKnowledge.isActive, true)))
      .orderBy(desc(engineKnowledge.confidenceScore)).limit(100),
    master_bank: () => db.select().from(masterKnowledgeBank)
      .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
      .orderBy(desc(masterKnowledgeBank.confidenceScore)).limit(50),
    recent_teachings: () => db.select().from(crossEngineTeachings)
      .where(eq(crossEngineTeachings.userId, userId))
      .orderBy(desc(crossEngineTeachings.createdAt)).limit(30),
  });
}

export async function recordEngineKnowledge(
  engineName: string,
  userId: string,
  knowledgeType: string,
  topic: string,
  insight: string,
  evidence?: string,
  confidence?: number,
  meta?: Record<string, any>,
): Promise<number | null> {
  try {
    const existing = await db.select({ id: engineKnowledge.id, timesValidated: engineKnowledge.timesValidated, confidenceScore: engineKnowledge.confidenceScore })
      .from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.engineName, engineName),
        eq(engineKnowledge.userId, userId),
        eq(engineKnowledge.topic, topic),
        eq(engineKnowledge.isActive, true),
      )).limit(1);

    if (existing.length > 0) {
      const newConfidence = Math.min(100, (existing[0].confidenceScore || 50) + 3);
      await db.update(engineKnowledge).set({
        timesValidated: sql`${engineKnowledge.timesValidated} + 1`,
        confidenceScore: newConfidence,
        evidence: evidence || undefined,
        updatedAt: new Date(),
      }).where(eq(engineKnowledge.id, existing[0].id));
      return existing[0].id;
    }

    const [inserted] = await db.insert(engineKnowledge).values({
      engineName,
      userId,
      knowledgeType,
      topic,
      insight,
      evidence: evidence || "",
      confidenceScore: Math.min(100, Math.max(0, confidence || 50)),
      metadata: meta || {},
    }).returning({ id: engineKnowledge.id });

    invalidateUserData(meshStore, userId, "local_knowledge");
    return inserted?.id || null;
  } catch (err: any) {
    logger.warn(`[${engineName}] Failed to record knowledge: ${err.message?.substring(0, 150)}`);
    return null;
  }
}

export async function getEngineKnowledgeForContext(engineName: string, userId: string, limit = 10): Promise<Array<{ topic: string; insight: string; confidence: number }>> {
  try {
    ensureMeshUserRegistered(userId);
    const allKnowledge = await getUserData<any>(meshStore, userId, "local_knowledge");
    const engineSpecific = allKnowledge
      .filter((k: any) => k.engineName === engineName)
      .slice(0, limit);

    const masterWisdom = await getUserData<any>(meshStore, userId, "master_bank");
    const applicableFromMaster = masterWisdom
      .filter((m: any) => (m.applicableEngines || []).includes(engineName))
      .slice(0, 5);

    const combined = [
      ...engineSpecific.map((k: any) => ({ topic: k.topic, insight: k.insight, confidence: k.confidenceScore || 50 })),
      ...applicableFromMaster.map((m: any) => ({ topic: `[MASTER] ${m.category}`, insight: m.principle, confidence: m.confidenceScore || 50 })),
    ];

    return combined.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  } catch {
    return [];
  }
}

export async function getMasterKnowledgeForPrompt(userId: string, maxItems = 8): Promise<string> {
  try {
    ensureMeshUserRegistered(userId);
    const masterWisdom = await getUserData<any>(meshStore, userId, "master_bank");
    if (masterWisdom.length === 0) return "";

    const top = masterWisdom.slice(0, maxItems);
    return "MASTER KNOWLEDGE BANK (proven principles from all engines):\n" +
      top.map((m: any) => `• [${m.confidenceScore}%] ${m.principle} (from: ${(m.sourceEngines || []).join(",")})`).join("\n");
  } catch {
    return "";
  }
}

async function runMeshCycle(): Promise<void> {
  logger.info("Knowledge Mesh cycle — cross-pollinating engine wisdom");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(50);

    for (const user of allUsers) {
      try {
        await crossPollinateForUser(user.id);
      } catch (err: any) {
        logger.warn(`Mesh cycle failed for user ${user.id.substring(0, 8)}: ${err.message?.substring(0, 150)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Knowledge Mesh cycle error: ${err.message?.substring(0, 300)}`);
  }
}

async function crossPollinateForUser(userId: string): Promise<void> {
  ensureMeshUserRegistered(userId);

  const allKnowledge = await getUserData<any>(meshStore, userId, "local_knowledge", true);
  if (allKnowledge.length === 0) return;

  const recentTeachings = await getUserData<any>(meshStore, userId, "recent_teachings");
  const recentLessonKeys = new Set(recentTeachings.map((t: any) => `${t.sourceEngine}→${t.targetEngine}:${t.lesson?.substring(0, 50)}`));

  for (const pair of TEACHING_PAIRS) {
    const sourceKnowledge = allKnowledge
      .filter((k: any) => k.engineName === pair.from && k.confidenceScore >= 60)
      .slice(0, 3);

    if (sourceKnowledge.length === 0) continue;

    for (const knowledge of sourceKnowledge) {
      const lessonKey = `${pair.from}→${pair.to}:${knowledge.insight?.substring(0, 50)}`;
      if (recentLessonKeys.has(lessonKey)) continue;

      try {
        await db.insert(crossEngineTeachings).values({
          userId,
          sourceEngine: pair.from,
          targetEngine: pair.to,
          teachingType: knowledge.knowledgeType,
          lesson: knowledge.insight,
          context: `${pair.relevance} | Topic: ${knowledge.topic} | Confidence: ${knowledge.confidenceScore}%`,
          sourceKnowledgeId: knowledge.id,
        });

        recentLessonKeys.add(lessonKey);
      } catch {
        continue;
      }
    }
  }

  invalidateUserData(meshStore, userId, "recent_teachings");
  logger.info(`Cross-pollination complete for user ${userId.substring(0, 8)}`);
}

async function runConsolidationCycle(): Promise<void> {
  logger.info("Master Knowledge Bank consolidation — distilling wisdom from all engines");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(50);

    for (const user of allUsers) {
      try {
        await consolidateForUser(user.id);
      } catch (err: any) {
        logger.warn(`Consolidation failed for user ${user.id.substring(0, 8)}: ${err.message?.substring(0, 150)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Master consolidation error: ${err.message?.substring(0, 300)}`);
  }
}

async function consolidateForUser(userId: string): Promise<void> {
  ensureMeshUserRegistered(userId);

  const allKnowledge = await getUserData<any>(meshStore, userId, "local_knowledge", true);
  if (allKnowledge.length < 3) return;

  const existingMaster = await getUserData<any>(meshStore, userId, "master_bank");
  const existingPrinciples = existingMaster.map((m: any) => m.principle).join("\n");

  const knowledgeByEngine = new Map<string, any[]>();
  for (const k of allKnowledge) {
    const list = knowledgeByEngine.get(k.engineName) || [];
    list.push(k);
    knowledgeByEngine.set(k.engineName, list);
  }

  const knowledgeSummary = Array.from(knowledgeByEngine.entries()).map(([engine, items]) => {
    const topItems = items.sort((a: any, b: any) => (b.confidenceScore || 0) - (a.confidenceScore || 0)).slice(0, 5);
    return `[${engine}] (${items.length} total):\n${topItems.map((i: any) => `  • ${i.topic}: ${i.insight?.substring(0, 120)} (${i.confidenceScore}%)`).join("\n")}`;
  }).join("\n\n");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "knowledge_consolidation", userId, priority: "medium" },
      `You are the Master Knowledge Consolidator for an AI YouTube gaming empire. You receive learnings from ${knowledgeByEngine.size} specialized engines and must distill them into universal principles. Like a board of directors synthesizing reports from every department, find the patterns that cut across ALL engines. Focus on principles that multiple engines independently discovered — those are the most trustworthy.`,
      `ENGINE KNOWLEDGE REPORTS:

${knowledgeSummary}

EXISTING MASTER PRINCIPLES (don't duplicate):
${existingPrinciples || "None yet — this is the first consolidation"}

Instructions:
1. Find patterns that appear across 2+ engines
2. Identify universal principles (not engine-specific tactics)
3. For each principle, list which engines it applies to
4. Rate confidence based on how many engines independently support it

Return JSON: {
  "newPrinciples": [
    {
      "category": "content|growth|seo|audience|revenue|operations|meta-learning",
      "principle": "universal principle statement",
      "sourceEngines": ["engine1", "engine2"],
      "applicableEngines": ["engine1", "engine2", "engine3"],
      "confidence": 50-100,
      "evidence": "what data supports this across engines"
    }
  ],
  "reinforced": [
    {
      "principle": "existing principle text (exact match)",
      "newEvidence": "what new data supports this",
      "additionalEngines": ["newly supporting engines"]
    }
  ],
  "insights": "meta-observation about what the collective system is learning"
}`
    );

    const result = JSON.parse(aiResult.content || "{}");

    if (result.newPrinciples && Array.isArray(result.newPrinciples)) {
      for (const p of result.newPrinciples.slice(0, 5)) {
        if (!p.principle || !p.category) continue;

        const exists = existingMaster.some((m: any) =>
          m.principle.toLowerCase().includes(p.principle.toLowerCase().substring(0, 40)));
        if (exists) continue;

        await db.insert(masterKnowledgeBank).values({
          userId,
          category: p.category,
          principle: p.principle.substring(0, 500),
          sourceEngines: p.sourceEngines || [],
          applicableEngines: p.applicableEngines || [],
          confidenceScore: Math.min(100, Math.max(0, p.confidence || 50)),
          evidenceCount: (p.sourceEngines || []).length,
          metadata: { evidence: p.evidence } as any,
        });
      }
    }

    if (result.reinforced && Array.isArray(result.reinforced)) {
      for (const r of result.reinforced) {
        if (!r.principle) continue;
        const match = existingMaster.find((m: any) =>
          m.principle.toLowerCase().includes(r.principle.toLowerCase().substring(0, 40)));
        if (match) {
          const newEngines = [...new Set([...(match.sourceEngines || []), ...(r.additionalEngines || [])])];
          await db.update(masterKnowledgeBank).set({
            confidenceScore: sql`LEAST(100, ${masterKnowledgeBank.confidenceScore} + 5)`,
            evidenceCount: sql`${masterKnowledgeBank.evidenceCount} + 1`,
            sourceEngines: newEngines,
            lastReinforcedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(masterKnowledgeBank.id, match.id));
        }
      }
    }

    invalidateUserData(meshStore, userId, "master_bank");
    logger.info(`Master consolidation complete for user ${userId.substring(0, 8)}: ${result.newPrinciples?.length || 0} new, ${result.reinforced?.length || 0} reinforced`);
  } catch (err: any) {
    logger.warn(`Master consolidation AI failed: ${err.message?.substring(0, 200)}`);
  }
}

export async function getKnowledgeMeshStats(userId: string): Promise<{
  engineKnowledgeCount: number;
  masterPrincipleCount: number;
  crossTeachingCount: number;
  knowledgeByEngine: Record<string, number>;
  topMasterPrinciples: Array<{ category: string; principle: string; confidence: number; engines: string[] }>;
  storeStats: any[];
}> {
  ensureMeshUserRegistered(userId);

  const allKnowledge = await getUserData<any>(meshStore, userId, "local_knowledge");
  const masterBank = await getUserData<any>(meshStore, userId, "master_bank");
  const teachings = await getUserData<any>(meshStore, userId, "recent_teachings");

  const byEngine: Record<string, number> = {};
  for (const k of allKnowledge) {
    byEngine[k.engineName] = (byEngine[k.engineName] || 0) + 1;
  }

  return {
    engineKnowledgeCount: allKnowledge.length,
    masterPrincipleCount: masterBank.length,
    crossTeachingCount: teachings.length,
    knowledgeByEngine: byEngine,
    topMasterPrinciples: masterBank.slice(0, 10).map((m: any) => ({
      category: m.category,
      principle: m.principle,
      confidence: m.confidenceScore || 0,
      engines: m.sourceEngines || [],
    })),
    storeStats: getAllStoreStats(),
  };
}

export function initKnowledgeMesh(): ReturnType<typeof setInterval>[] {
  logger.info("Knowledge Mesh initialized — engines will teach each other");

  setTimeout(() => {
    runMeshCycle().catch(err =>
      logger.error("Initial mesh cycle failed", { error: String(err).slice(0, 200) })
    );
  }, 180_000);

  meshTimer = setInterval(() => {
    runMeshCycle().catch(err =>
      logger.error("Mesh cycle failed", { error: String(err).slice(0, 200) })
    );
  }, MESH_CYCLE_MS);

  setTimeout(() => {
    runConsolidationCycle().catch(err =>
      logger.error("Initial consolidation failed", { error: String(err).slice(0, 200) })
    );
  }, 600_000);

  consolidationTimer = setInterval(() => {
    runConsolidationCycle().catch(err =>
      logger.error("Consolidation cycle failed", { error: String(err).slice(0, 200) })
    );
  }, CONSOLIDATION_CYCLE_MS);

  return [meshTimer, consolidationTimer].filter(Boolean) as ReturnType<typeof setInterval>[];
}
