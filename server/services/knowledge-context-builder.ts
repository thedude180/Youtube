import { db } from "../db";
import {
  discoveredStrategies, memoryConsolidation, competitiveIntelligence,
  selfReflectionJournal, improvementGoals, crossChannelInsights,
  curiosityQueue, videos, channels,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("knowledge-context");

const CACHE_TTL = 15 * 60_000;
const knowledgeCache = new Map<string, { context: string; timestamp: number }>();

export async function buildKnowledgeContext(userId: string): Promise<string> {
  const cached = knowledgeCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.context;
  }

  try {
    const [principles, strategies, compIntel, latestReflection, activeGoals, insights] = await Promise.all([
      db.select({
        principle: memoryConsolidation.corePrinciple,
        confidence: memoryConsolidation.confidenceScore,
        reinforced: memoryConsolidation.timesReinforced,
        category: memoryConsolidation.consolidationType,
      }).from(memoryConsolidation)
        .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)))
        .orderBy(desc(memoryConsolidation.confidenceScore))
        .limit(8),

      db.select({
        title: discoveredStrategies.title,
        description: discoveredStrategies.description,
        type: discoveredStrategies.strategyType,
        effectiveness: discoveredStrategies.effectiveness,
        applicableTo: discoveredStrategies.applicableTo,
      }).from(discoveredStrategies)
        .where(and(
          eq(discoveredStrategies.userId, userId),
          eq(discoveredStrategies.isActive, true),
          sql`${discoveredStrategies.effectiveness} >= 40`
        ))
        .orderBy(desc(discoveredStrategies.effectiveness))
        .limit(6),

      db.select({
        finding: competitiveIntelligence.finding,
        category: competitiveIntelligence.insightCategory,
        impact: competitiveIntelligence.potentialImpact,
      }).from(competitiveIntelligence)
        .where(and(
          eq(competitiveIntelligence.userId, userId),
          eq(competitiveIntelligence.status, "discovered"),
          sql`${competitiveIntelligence.potentialImpact} IN ('high', 'massive')`
        ))
        .orderBy(desc(competitiveIntelligence.createdAt))
        .limit(4),

      db.select({
        mood: selfReflectionJournal.mood,
        strengths: selfReflectionJournal.strengthsRecognized,
        weaknesses: selfReflectionJournal.weaknessesAdmitted,
        blindSpots: selfReflectionJournal.blindSpotsIdentified,
      }).from(selfReflectionJournal)
        .where(eq(selfReflectionJournal.userId, userId))
        .orderBy(desc(selfReflectionJournal.createdAt))
        .limit(1),

      db.select({
        title: improvementGoals.title,
        type: improvementGoals.goalType,
        progress: improvementGoals.progress,
      }).from(improvementGoals)
        .where(and(eq(improvementGoals.userId, userId), eq(improvementGoals.status, "active")))
        .limit(3),

      db.select({
        insight: crossChannelInsights.insight,
        type: crossChannelInsights.insightType,
        confidence: crossChannelInsights.confidenceScore,
      }).from(crossChannelInsights)
        .where(and(
          eq(crossChannelInsights.userId, userId),
          sql`${crossChannelInsights.confidenceScore} >= 60`
        ))
        .orderBy(desc(crossChannelInsights.createdAt))
        .limit(4),
    ]);

    const sections: string[] = [];

    if (principles.length > 0) {
      const principleBlock = principles.map(p =>
        `• [${p.category}] ${p.principle} (${p.confidence}% confidence, proven ${p.reinforced}x)`
      ).join("\n");
      sections.push(`CORE PRINCIPLES I'VE PROVEN THROUGH DATA:\n${principleBlock}`);
    }

    if (strategies.length > 0) {
      const stratBlock = strategies.map(s =>
        `• [${s.type}] ${s.title} — ${s.description?.slice(0, 120)} (${s.effectiveness}% effective, applies to: ${(s.applicableTo || []).join(", ")})`
      ).join("\n");
      sections.push(`MY PROVEN STRATEGIES (USE THESE):\n${stratBlock}`);
    }

    if (compIntel.length > 0) {
      const intelBlock = compIntel.map(c =>
        `• [${c.category}] ${c.finding?.slice(0, 150)} (${c.impact} impact)`
      ).join("\n");
      sections.push(`COMPETITIVE INTELLIGENCE — WHAT TOP CHANNELS DO:\n${intelBlock}`);
    }

    if (insights.length > 0) {
      const insightBlock = insights.map(i =>
        `• [${i.type}] ${i.insight?.slice(0, 120)} (${i.confidence}% confident)`
      ).join("\n");
      sections.push(`CROSS-CHANNEL INSIGHTS:\n${insightBlock}`);
    }

    if (activeGoals.length > 0) {
      const goalBlock = activeGoals.map(g =>
        `• [${g.type}] ${g.title} — ${g.progress}% complete`
      ).join("\n");
      sections.push(`ACTIVE GROWTH GOALS (ALIGN CONTENT TO THESE):\n${goalBlock}`);
    }

    const reflection = latestReflection[0];
    if (reflection) {
      const weaknessBlock = (reflection.weaknesses || []).slice(0, 3).join(", ");
      const blindSpotBlock = (reflection.blindSpots || []).slice(0, 3).join(", ");
      if (weaknessBlock || blindSpotBlock) {
        sections.push(`SELF-AWARENESS — COMPENSATE FOR THESE:\n• Weaknesses: ${weaknessBlock || "None identified"}\n• Blind spots: ${blindSpotBlock || "None identified"}\n• Current mood: ${reflection.mood}`);
      }
    }

    if (sections.length === 0) {
      return "";
    }

    const context = `\n---\nLEARNED KNOWLEDGE (Apply everything below to optimize this content — these are data-proven insights from continuous self-improvement):\n\n${sections.join("\n\n")}\n\nIMPORTANT: Apply these learned strategies and principles to generate better content. Prioritize proven strategies with high effectiveness scores. Address known weaknesses. Align output with active growth goals.\n---\n`;

    knowledgeCache.set(userId, { context, timestamp: Date.now() });
    return context;
  } catch (err) {
    logger.warn("Knowledge context build failed — proceeding without", { error: String(err).slice(0, 200) });
    return "";
  }
}

export function invalidateKnowledgeCache(userId: string): void {
  knowledgeCache.delete(userId);
}

export function invalidateAllKnowledgeCaches(): void {
  knowledgeCache.clear();
}

export async function getApplicableStrategies(userId: string, contentType: string): Promise<string> {
  try {
    const strategies = await db.select({
      title: discoveredStrategies.title,
      description: discoveredStrategies.description,
      effectiveness: discoveredStrategies.effectiveness,
    }).from(discoveredStrategies)
      .where(and(
        eq(discoveredStrategies.userId, userId),
        eq(discoveredStrategies.isActive, true),
        sql`${contentType} = ANY(${discoveredStrategies.applicableTo})`
      ))
      .orderBy(desc(discoveredStrategies.effectiveness))
      .limit(5);

    if (strategies.length === 0) return "";

    return strategies.map(s =>
      `• ${s.title}: ${s.description?.slice(0, 150)} (${s.effectiveness}% effective)`
    ).join("\n");
  } catch {
    return "";
  }
}
