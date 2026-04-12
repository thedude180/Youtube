import { db } from "../db";
import { thumbnailIntelligence, videos, channels } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";

const logger = createLogger("thumbnail-intelligence");

const RESEARCH_CACHE_HOURS = 72;
const MAX_REFERENCES_PER_QUERY = 8;

const THUMBNAIL_RESEARCH_QUERIES = [
  (game: string) => `${game} YouTube thumbnail high CTR gaming`,
  (game: string) => `${game} gameplay thumbnail design viral`,
  (game: string) => `best ${game} YouTube thumbnails 2025 2026`,
  (game: string) => `${game} gaming channel thumbnail style`,
  (_: string) => `YouTube gaming thumbnail best practices high click rate`,
  (_: string) => `PS5 gameplay thumbnail design no commentary`,
  (_: string) => `YouTube thumbnail CTR optimization gaming channel`,
  (_: string) => `viral gaming thumbnails composition color psychology`,
];

async function searchBraveImages(query: string): Promise<Array<{ url: string; title: string; source: string }>> {
  try {
    const braveUrl = `https://api.search.brave.com/res/v1/images/search`;
    const params = new URLSearchParams({ q: query, count: "10" });
    
    const { default: fetch } = await import("node-fetch");
    
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      logger.debug("No Brave API key, using OpenInt proxy path");
      return await searchBraveViaProxy(query);
    }

    const resp = await fetch(`${braveUrl}?${params}`, {
      headers: { 
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      logger.debug(`Brave direct search failed: ${resp.status}`);
      return await searchBraveViaProxy(query);
    }

    const data = await resp.json() as any;
    const results = data?.results || [];

    return results.slice(0, MAX_REFERENCES_PER_QUERY).map((r: any) => ({
      url: r.properties?.url || r.thumbnail?.src || "",
      title: String(r.title || "").substring(0, 200),
      source: String(r.source || r.url || "").substring(0, 300),
    })).filter((r: any) => r.url);
  } catch (err: any) {
    logger.debug(`Brave image search failed: ${err.message?.substring(0, 150)}`);
    return await searchBraveViaProxy(query);
  }
}

async function searchBraveViaProxy(query: string): Promise<Array<{ url: string; title: string; source: string }>> {
  try {
    const proxyUrl = `https://openint.replit.com/brave/res/v1/images/search`;
    const params = new URLSearchParams({ q: query, count: "8" });

    const resp = await fetch(`${proxyUrl}?${params}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return [];

    const data = await resp.json() as any;
    const results = data?.results || [];

    return results.slice(0, MAX_REFERENCES_PER_QUERY).map((r: any) => ({
      url: r.properties?.url || r.thumbnail?.src || "",
      title: String(r.title || "").substring(0, 200),
      source: String(r.source || r.url || "").substring(0, 300),
    })).filter((r: any) => r.url);
  } catch {
    return [];
  }
}

async function searchWebForThumbnailArticles(query: string): Promise<string> {
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`;
    const resp = await fetch(wikiUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "CreatorOS/1.0 (thumbnail-research)" },
    });

    if (!resp.ok) return "";

    const data = await resp.json() as any;
    const results = data?.query?.search || [];
    return results.map((r: any) =>
      `${r.title}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
    ).join("\n");
  } catch {
    return "";
  }
}

export async function researchThumbnailsForGame(userId: string, gameName: string): Promise<{
  references: Array<{ url: string; title: string; source: string }>;
  patterns: any;
  bestPractices: string;
  gamingInsights: string;
  ctrTactics: string;
  antiClickbait: string;
} | null> {
  const cached = await db.select().from(thumbnailIntelligence)
    .where(and(
      eq(thumbnailIntelligence.userId, userId),
      eq(thumbnailIntelligence.gameName, gameName.toLowerCase().trim()),
      gte(thumbnailIntelligence.createdAt, new Date(Date.now() - RESEARCH_CACHE_HOURS * 3600_000)),
    ))
    .orderBy(desc(thumbnailIntelligence.createdAt))
    .limit(1);

  if (cached.length > 0) {
    const c = cached[0];
    await db.update(thumbnailIntelligence).set({
      timesUsed: (c.timesUsed || 0) + 1,
      lastUsedAt: new Date(),
    }).where(eq(thumbnailIntelligence.id, c.id));

    return {
      references: (c.referenceImages as any) || [],
      patterns: c.patterns || {},
      bestPractices: c.bestPractices || "",
      gamingInsights: c.gamingNicheInsights || "",
      ctrTactics: c.ctrTactics || "",
      antiClickbait: c.antiClickbaitGuidelines || "",
    };
  }

  logger.info(`Researching thumbnails for "${gameName}"`, { userId: userId.substring(0, 8) });

  const queryFns = THUMBNAIL_RESEARCH_QUERIES.slice(0, 4);
  const allReferences: Array<{ url: string; title: string; source: string }> = [];

  for (const qFn of queryFns) {
    const query = qFn(gameName);
    const refs = await searchBraveImages(query);
    allReferences.push(...refs);
    await new Promise(r => setTimeout(r, 1500));
  }

  const uniqueRefs = allReferences
    .filter((r, i, arr) => arr.findIndex(a => a.url === r.url) === i)
    .slice(0, 15);

  const webArticles = await searchWebForThumbnailArticles(
    `YouTube thumbnail design CTR optimization gaming ${gameName}`
  );

  const generalArticles = await searchWebForThumbnailArticles(
    `thumbnail psychology click through rate YouTube best practices`
  );

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a world-class YouTube thumbnail analyst specializing in gaming channels. You've been given reference materials from the web about thumbnails for "${gameName}" and gaming in general.

REFERENCE IMAGES FOUND (${uniqueRefs.length} results):
${uniqueRefs.map((r, i) => `${i + 1}. "${r.title}" — ${r.source}`).join("\n")}

WEB RESEARCH:
${webArticles || "No specific articles found"}
${generalArticles || ""}

YOUR TASK: Analyze these references and extract actionable thumbnail intelligence for a NO COMMENTARY PS5 gaming channel. The thumbnails must attract clicks WITHOUT being clickbait — they should accurately represent the content while being visually compelling.

Key constraint: NO COMMENTARY channel = no face cam, no reaction shots. The thumbnail must rely entirely on:
- In-game visuals (cinematics, boss fights, environments, key moments)
- Dramatic composition and lighting
- Color psychology
- Visual storytelling without text (YouTube handles text)
- Emotional atmosphere

Analyze the patterns you see in successful gaming thumbnails and provide:

Return JSON:
{
  "patterns": {
    "colorSchemes": ["list of effective color combinations seen in top gaming thumbnails"],
    "compositions": ["rule of thirds usage", "focal point patterns", "depth techniques"],
    "emotionalTriggers": ["what emotions the best thumbnails evoke and how"],
    "textOverlayStyles": ["how text is used on thumbnails — or deliberately avoided"],
    "commonElements": ["recurring visual elements in high-performing gaming thumbnails"],
    "avoidPatterns": ["clickbait tactics that damage trust — arrows, fake reactions, misleading imagery"]
  },
  "bestPractices": "paragraph — the definitive guide to making thumbnails for this game that get clicks honestly",
  "gamingNicheInsights": "paragraph — specific to ${gameName} and no-commentary PS5 channels, what visual approaches work best",
  "ctrTactics": "paragraph — proven psychological tactics that increase CTR without being deceptive (contrast, curiosity, visual hierarchy, color blocking)",
  "antiClickbaitGuidelines": "paragraph — how to make thumbnails that promise exactly what the video delivers, building viewer trust and long-term CTR"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const intel = {
      references: uniqueRefs,
      patterns: parsed.patterns || {},
      bestPractices: parsed.bestPractices || "",
      gamingInsights: parsed.gamingNicheInsights || "",
      ctrTactics: parsed.ctrTactics || "",
      antiClickbait: parsed.antiClickbaitGuidelines || "",
    };

    await db.insert(thumbnailIntelligence).values({
      userId,
      gameName: gameName.toLowerCase().trim(),
      researchQuery: `${gameName} thumbnail research`,
      referenceImages: uniqueRefs as any,
      patterns: parsed.patterns as any,
      bestPractices: intel.bestPractices,
      gamingNicheInsights: intel.gamingInsights,
      ctrTactics: intel.ctrTactics,
      antiClickbaitGuidelines: intel.antiClickbait,
      expiresAt: new Date(Date.now() + RESEARCH_CACHE_HOURS * 3600_000),
    });

    logger.info(`Thumbnail intelligence cached for "${gameName}": ${uniqueRefs.length} references, patterns extracted`, { userId: userId.substring(0, 8) });
    return intel;
  } catch (err: any) {
    logger.warn(`Thumbnail intelligence analysis failed: ${err.message?.substring(0, 200)}`);
    return null;
  }
}

export async function getThumbnailContext(userId: string, gameName: string): Promise<string> {
  const intel = await researchThumbnailsForGame(userId, gameName);
  if (!intel) return "";

  const parts: string[] = [];

  if (intel.bestPractices) {
    parts.push(`THUMBNAIL BEST PRACTICES (from web research):\n${intel.bestPractices}`);
  }

  if (intel.gamingInsights) {
    parts.push(`GAME-SPECIFIC INSIGHTS for ${gameName}:\n${intel.gamingInsights}`);
  }

  if (intel.ctrTactics) {
    parts.push(`CTR TACTICS (proven to work):\n${intel.ctrTactics}`);
  }

  if (intel.antiClickbait) {
    parts.push(`ANTI-CLICKBAIT RULES:\n${intel.antiClickbait}`);
  }

  const patterns = intel.patterns;
  if (patterns) {
    if (patterns.colorSchemes?.length) {
      parts.push(`COLOR SCHEMES that work: ${patterns.colorSchemes.join("; ")}`);
    }
    if (patterns.compositions?.length) {
      parts.push(`COMPOSITION PATTERNS: ${patterns.compositions.join("; ")}`);
    }
    if (patterns.emotionalTriggers?.length) {
      parts.push(`EMOTIONAL TRIGGERS: ${patterns.emotionalTriggers.join("; ")}`);
    }
    if (patterns.commonElements?.length) {
      parts.push(`COMMON WINNING ELEMENTS: ${patterns.commonElements.join("; ")}`);
    }
    if (patterns.avoidPatterns?.length) {
      parts.push(`AVOID (clickbait/trust-damaging): ${patterns.avoidPatterns.join("; ")}`);
    }
  }

  if (intel.references.length > 0) {
    parts.push(`REFERENCE THUMBNAILS studied: ${intel.references.length} images analyzed from top-performing gaming channels`);
  }

  return parts.join("\n\n");
}

export async function getIntelligenceStats(userId: string): Promise<{
  totalResearched: number;
  gamesResearched: string[];
  totalReferencesCollected: number;
  averageEffectiveness: number;
}> {
  const all = await db.select().from(thumbnailIntelligence)
    .where(eq(thumbnailIntelligence.userId, userId))
    .orderBy(desc(thumbnailIntelligence.createdAt));

  const games = [...new Set(all.map(r => r.gameName))];
  const totalRefs = all.reduce((s, r) => s + ((r.referenceImages as any[]) || []).length, 0);
  const avgEff = all.length > 0
    ? Math.round(all.reduce((s, r) => s + (r.effectivenessScore || 50), 0) / all.length)
    : 0;

  return {
    totalResearched: all.length,
    gamesResearched: games,
    totalReferencesCollected: totalRefs,
    averageEffectiveness: avgEff,
  };
}
