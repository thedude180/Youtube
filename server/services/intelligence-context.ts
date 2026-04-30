import { db } from "../db";
import { predictiveTrends, growthStrategies, intelligenceSignals } from "@shared/schema";
import { and, eq, desc, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("intelligence-context");

const contextCache = new Map<string, { ts: number; data: IntelligenceContext }>();
const CACHE_TTL_MS = 15 * 60_000;

export interface IntelligenceContext {
  trendingTopics: Array<{
    topic: string;
    confidence: number;
    velocity: number;
    category: string | null;
  }>;
  activeStrategies: Array<{
    title: string;
    description: string;
    priority: string | null;
    actionItems: string[];
    estimatedImpact: string | null;
    category: string;
  }>;
  recentSignals: Array<{
    source: string;
    title: string;
    score: number;
  }>;
  hasFreshData: boolean;
}

const EMPTY_CONTEXT: IntelligenceContext = {
  trendingTopics: [],
  activeStrategies: [],
  recentSignals: [],
  hasFreshData: false,
};

export async function getIntelligenceContext(userId: string): Promise<IntelligenceContext> {
  const cached = contextCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const since = new Date(Date.now() - 48 * 3600_000);

    const [trends, strategies, signals] = await Promise.all([
      db.select({
        topic: predictiveTrends.topic,
        confidence: predictiveTrends.confidence,
        velocity: predictiveTrends.velocity,
        category: predictiveTrends.category,
      }).from(predictiveTrends)
        .where(and(
          eq(predictiveTrends.userId, userId),
          gte(predictiveTrends.createdAt, since),
        ))
        .orderBy(desc(predictiveTrends.confidence))
        .limit(12),

      db.select({
        title: growthStrategies.title,
        description: growthStrategies.description,
        priority: growthStrategies.priority,
        actionItems: growthStrategies.actionItems,
        estimatedImpact: growthStrategies.estimatedImpact,
        category: growthStrategies.category,
      }).from(growthStrategies)
        .where(eq(growthStrategies.status, "pending"))
        .orderBy(desc(growthStrategies.createdAt))
        .limit(5),

      db.select({
        source: intelligenceSignals.source,
        title: intelligenceSignals.title,
        score: intelligenceSignals.score,
      }).from(intelligenceSignals)
        .where(and(
          eq(intelligenceSignals.userId, userId),
          gte(intelligenceSignals.createdAt, since),
        ))
        .orderBy(desc(intelligenceSignals.score))
        .limit(8),
    ]);

    const ctx: IntelligenceContext = {
      trendingTopics: trends.map(t => ({
        topic: t.topic,
        confidence: t.confidence ?? 0.5,
        velocity: t.velocity ?? 0,
        category: t.category,
      })),
      activeStrategies: strategies.map(s => ({
        title: s.title,
        description: s.description,
        priority: s.priority,
        actionItems: (s.actionItems as string[]) ?? [],
        estimatedImpact: s.estimatedImpact,
        category: s.category,
      })),
      recentSignals: signals.map(s => ({
        source: s.source,
        title: s.title,
        score: s.score ?? 0,
      })),
      hasFreshData: trends.length > 0 || strategies.length > 0,
    };

    contextCache.set(userId, { ts: Date.now(), data: ctx });
    return ctx;
  } catch (err: any) {
    logger.warn("Failed to fetch intelligence context", { err: err.message?.slice(0, 100) });
    return EMPTY_CONTEXT;
  }
}

export function formatIntelligenceBlock(ctx: IntelligenceContext): string {
  if (!ctx.hasFreshData) return "";

  const parts: string[] = [
    "OMNI INTELLIGENCE CONTEXT (live-harvested signals — YouTube trending, Reddit, Twitch, web):",
  ];

  if (ctx.trendingTopics.length > 0) {
    const topicsStr = ctx.trendingTopics
      .map(t => {
        const velTag = t.velocity > 0.3 ? " ↑rising" : t.velocity < -0.3 ? " ↓declining" : "";
        return `${t.topic} (${Math.round(t.confidence * 100)}%${velTag})`;
      })
      .join("; ");
    parts.push(`TRENDING NOW: ${topicsStr}`);
    parts.push("INSTRUCTION: If the content being optimized relates to any of these trending topics, emphasize that connection in the title, description and tags. Trending topics = higher algorithmic surface probability.");
  }

  if (ctx.activeStrategies.length > 0) {
    parts.push("ACTIVE AI GROWTH STRATEGIES (apply these):");
    for (const s of ctx.activeStrategies.slice(0, 3)) {
      parts.push(`• [${s.category}] ${s.title} — ${s.description}`);
      if (s.actionItems?.length) {
        parts.push(`  → ${s.actionItems.slice(0, 2).join(" | ")}`);
      }
      if (s.estimatedImpact) parts.push(`  Impact estimate: ${s.estimatedImpact}`);
    }
  }

  if (ctx.recentSignals.length > 0) {
    const topSignals = ctx.recentSignals.slice(0, 4).map(s => s.title).join("; ");
    parts.push(`TOP SIGNALS THIS CYCLE: ${topSignals}`);
  }

  return parts.join("\n");
}

export function formatThumbnailIntelligenceBlock(ctx: IntelligenceContext): string {
  if (!ctx.hasFreshData) return "";

  const parts: string[] = [];

  const visualStrategies = ctx.activeStrategies.filter(
    s => s.category === "thumbnail" || s.category === "ctr" || s.category === "visual"
  );
  if (visualStrategies.length > 0) {
    parts.push("ACTIVE VISUAL/CTR GROWTH STRATEGIES:");
    for (const s of visualStrategies) {
      parts.push(`• ${s.title}: ${s.description}`);
    }
  }

  if (ctx.trendingTopics.length > 0) {
    const topTopics = ctx.trendingTopics.slice(0, 5).map(t => t.topic).join(", ");
    parts.push(`TRENDING TOPICS to reference visually where relevant: ${topTopics}`);
    parts.push("If thumbnails for trending topics follow recognisable visual patterns, incorporate those patterns to capitalise on viewer familiarity.");
  }

  return parts.length > 0 ? parts.join("\n") : "";
}

export function getTopTrendingTopics(ctx: IntelligenceContext): string[] {
  return ctx.trendingTopics
    .filter(t => t.confidence >= 0.6)
    .map(t => t.topic.toLowerCase());
}

export function invalidateIntelligenceCache(userId: string): void {
  contextCache.delete(userId);
}
