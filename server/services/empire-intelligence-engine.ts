import { db } from "../db";
import { users, crossBusinessInsights, empireMetrics, engineKnowledge, discoveredStrategies } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("empire-intelligence");

const EMPIRE_CYCLE_MS = 180 * 60_000;

const empireStore = createEngineStore("empire-intelligence", 30 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(empireStore, userId, {
    insights: () => db.select().from(crossBusinessInsights)
      .where(eq(crossBusinessInsights.userId, userId))
      .orderBy(desc(crossBusinessInsights.createdAt)).limit(30),
    metrics: () => db.select().from(empireMetrics)
      .where(eq(empireMetrics.userId, userId))
      .orderBy(desc(empireMetrics.createdAt)).limit(10),
    all_strategies: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(50),
    all_knowledge: () => db.select().from(engineKnowledge)
      .where(and(
        eq(engineKnowledge.userId, userId),
        gte(engineKnowledge.confidenceScore, 65),
        gte(engineKnowledge.createdAt, new Date(Date.now() - 7 * 86400_000)),
      ))
      .orderBy(desc(engineKnowledge.confidenceScore)).limit(50),
  });
}

export function initEmpireIntelligenceEngine(): ReturnType<typeof setInterval> {
  logger.info("Empire Intelligence Engine initialized — cross-business learning at scale");

  setTimeout(() => {
    runEmpireIntelligenceCycle().catch(err => logger.error("Initial empire intelligence failed", { err: String(err) }));
  }, 360_000);

  return setInterval(() => {
    runEmpireIntelligenceCycle().catch(err => logger.error("Empire intelligence cycle failed", { err: String(err) }));
  }, EMPIRE_CYCLE_MS);
}

export async function runEmpireIntelligenceCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await analyzeEmpireForUser(user.id);
    } catch (err) {
      logger.error(`Empire intelligence failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function analyzeEmpireForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const allStrategies = await getUserData(empireStore, userId, "all_strategies") as any[];
  const allKnowledge = await getUserData(empireStore, userId, "all_knowledge") as any[];
  const metrics = await getUserData(empireStore, userId, "metrics") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 8);

  if (!allStrategies?.length && !allKnowledge?.length) return;

  const categoryMap: Record<string, { strategies: any[]; knowledge: any[] }> = {};
  for (const s of (allStrategies || [])) {
    const cat = s.category || "general";
    if (!categoryMap[cat]) categoryMap[cat] = { strategies: [], knowledge: [] };
    categoryMap[cat].strategies.push(s);
  }
  for (const k of (allKnowledge || [])) {
    const engine = k.engineName || "general";
    if (!categoryMap[engine]) categoryMap[engine] = { strategies: [], knowledge: [] };
    categoryMap[engine].knowledge.push(k);
  }

  const topPerformers = Object.entries(categoryMap)
    .map(([cat, data]) => ({
      category: cat,
      avgEffectiveness: data.strategies.length > 0
        ? Math.round(data.strategies.reduce((s: number, st: any) => s + (st.effectiveness || 50), 0) / data.strategies.length)
        : 0,
      avgConfidence: data.knowledge.length > 0
        ? Math.round(data.knowledge.reduce((s: number, k: any) => s + (k.confidenceScore || 50), 0) / data.knowledge.length)
        : 0,
      count: data.strategies.length + data.knowledge.length,
    }))
    .filter(c => c.count >= 2)
    .sort((a, b) => (b.avgEffectiveness + b.avgConfidence) - (a.avgEffectiveness + a.avgConfidence));

  if (topPerformers.length < 2) return;

  const strongDomains = topPerformers.filter(d => (d.avgEffectiveness + d.avgConfidence) / 2 > 55);
  const weakDomains = topPerformers.filter(d => (d.avgEffectiveness + d.avgConfidence) / 2 < 45);

  if (strongDomains.length === 0 || weakDomains.length === 0) return;

  try {
    const transferPrompt = `You are a cross-domain intelligence transfer specialist. Analyze what's working in strong domains and find applicable patterns for weak domains.

STRONG DOMAINS (proven strategies):
${strongDomains.slice(0, 5).map(d => `  ${d.category}: effectiveness ${d.avgEffectiveness}, confidence ${d.avgConfidence}, ${d.count} insights`).join("\n")}

WEAK DOMAINS (need help):
${weakDomains.slice(0, 5).map(d => `  ${d.category}: effectiveness ${d.avgEffectiveness}, confidence ${d.avgConfidence}, ${d.count} insights`).join("\n")}

TOP STRATEGIES FROM STRONG DOMAINS:
${allStrategies?.filter((s: any) => strongDomains.some(d => d.category === s.category)).slice(0, 8).map((s: any) => `  [${s.category}] ${s.title} (eff: ${s.effectiveness})`).join("\n")}

${masterWisdom}

Output JSON with cross-domain transfers:
{
  "transfers": [
    {
      "from": "source domain",
      "to": "target domain",
      "pattern": "what pattern to transfer",
      "adaptation": "how to adapt it",
      "expectedImpact": "medium/high",
      "confidence": 50-100
    }
  ],
  "universalPrinciple": "one overarching principle that works across all domains"
}`;

    const aiResult = await executeRoutedAICall(
      { taskType: "empire_intelligence", userId, priority: "low" },
      "You find transferable patterns between domains. Return valid JSON only.",
      transferPrompt
    );

    const resultText = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
    let parsed: any;
    try {
      parsed = JSON.parse(resultText.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return;
    }

    if (parsed.transfers?.length) {
      for (const transfer of parsed.transfers.slice(0, 3)) {
        await db.insert(crossBusinessInsights).values({
          userId,
          sourceBusinessId: 1,
          insightType: "cross_domain_transfer",
          title: `${transfer.from} → ${transfer.to}: ${transfer.pattern}`,
          insight: `Pattern: ${transfer.pattern}. Adaptation: ${transfer.adaptation}`,
          transferability: transfer.confidence || 60,
          metadata: { from: transfer.from, to: transfer.to, expectedImpact: transfer.expectedImpact },
        });
      }
    }

    if (parsed.universalPrinciple) {
      await recordEngineKnowledge(
        "empire-intelligence", userId, "universal_principle",
        "cross_domain_wisdom",
        parsed.universalPrinciple,
        `Derived from ${strongDomains.length} strong and ${weakDomains.length} weak domains. Transfers: ${parsed.transfers?.length || 0}`,
        75,
      );
    }

    logger.info(`Empire intelligence: ${parsed.transfers?.length || 0} cross-domain transfers`, { userId: userId.substring(0, 8) });
    invalidateUserData(empireStore, userId, "insights");
  } catch (err) {
    logger.error("Empire intelligence AI call failed", { err: String(err) });
  }
}
