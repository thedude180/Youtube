import { db } from "../db";
import { thumbnailIntelligence, videos, channels } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { sanitizeForPrompt, tokenBudget } from "../lib/ai-attack-shield";

const logger = createLogger("thumbnail-intelligence");

const RESEARCH_CACHE_HOURS = 24;
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
      logger.debug(`Brave direct search failed: ${sanitizeForPrompt(resp.status)}`);
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
      `${sanitizeForPrompt(r.title)}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
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
  // Check budget FIRST — before any DB or web queries — so budget exhaustion
  // is a fast, cheap early exit rather than an expensive late check.
  if (!tokenBudget.checkBudget("thumbnail-intelligence", 2000)) {
    return null;
  }

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

  logger.info(`Researching thumbnails for "${sanitizeForPrompt(gameName)}"`, { userId: userId.substring(0, 8) });

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
    `YouTube thumbnail design CTR optimization gaming ${sanitizeForPrompt(gameName)}`
  );

  const generalArticles = await searchWebForThumbnailArticles(
    `thumbnail psychology click through rate YouTube best practices`
  );

  const openai = getOpenAIClient();

  // Budget was already checked and reserved at function entry — consume it now.
  tokenBudget.consumeBudget("thumbnail-intelligence", 2000);

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a world-class YouTube thumbnail analyst specialising in PS5 no-commentary gaming channels. You've been given reference materials from the web about thumbnails for "${sanitizeForPrompt(gameName)}" and YouTube gaming in general.

CHANNEL CONTEXT — ET Gaming 247:
- PS5 gameplay, no face cam, no commentary
- Brand aesthetic: cinematic dark backgrounds, vivid warm/neon accent colours (navy/charcoal base + orange, electric blue, or gold highlights)
- Thumbnails rely entirely on in-game visuals — no creator face

REFERENCE IMAGES FOUND (${uniqueRefs.length} results):
${uniqueRefs.map((r, i) => `${i + 1}. "${sanitizeForPrompt(r.title)}" — ${sanitizeForPrompt(r.source)}`).join("\n")}

WEB RESEARCH:
${webArticles || "No specific articles found"}
${generalArticles || ""}

YOUR TASK: Analyse these references and extract actionable thumbnail intelligence for this specific channel. Thumbnails must attract clicks without clickbait — accurately representing the content while being visually compelling.

IMPORTANT — TEXT OVERLAYS ARE REQUIRED:
YouTube does NOT add text to thumbnails. Successful gaming thumbnails include a bold 2–4 word hook rendered into the image itself. Your analysis must provide guidance on the best text hooks and placement for this game.

Key constraints:
- No face cam / no reaction shots — rely on in-game characters, environments, boss fights, key moments
- Text hook (2–4 bold words) placed in a corner that doesn't obscure the main action
- Cinematic lighting, single strong focal point, depth of field
- Content must match what the video actually shows (anti-clickbait)

Return JSON:
{
  "patterns": {
    "colorSchemes": ["list of effective colour combinations that work for this game's aesthetic"],
    "compositions": ["focal point patterns", "rule-of-thirds usage", "depth techniques"],
    "emotionalTriggers": ["emotions the best thumbnails evoke and what visual techniques create them"],
    "textOverlayStyles": ["recommended 2-4 word hooks that work for this game", "font style guidance", "placement that avoids obscuring action"],
    "commonElements": ["recurring visual elements in high-performing gaming thumbnails for this genre"],
    "avoidPatterns": ["clickbait tactics that damage trust and long-term CTR"]
  },
  "bestPractices": "paragraph — definitive guide to making thumbnails for this specific game on a PS5 no-commentary channel that get honest clicks",
  "gamingNicheInsights": "paragraph — specific to ${sanitizeForPrompt(gameName)}: which moments, characters, environments, and colour palette drive the most curiosity in thumbnails",
  "ctrTactics": "paragraph — proven psychological tactics that increase CTR without deception (contrast, curiosity gaps, visual hierarchy, colour blocking, text hook placement)",
  "antiClickbaitGuidelines": "paragraph — how to make thumbnails that promise exactly what the video delivers, building long-term viewer trust"
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
      researchQuery: `${sanitizeForPrompt(gameName)} thumbnail research`,
      referenceImages: uniqueRefs as any,
      patterns: parsed.patterns as any,
      bestPractices: intel.bestPractices,
      gamingNicheInsights: intel.gamingInsights,
      ctrTactics: intel.ctrTactics,
      antiClickbaitGuidelines: intel.antiClickbait,
      expiresAt: new Date(Date.now() + RESEARCH_CACHE_HOURS * 3600_000),
    });

    logger.info(`Thumbnail intelligence cached for "${sanitizeForPrompt(gameName)}": ${uniqueRefs.length} references, patterns extracted`, { userId: userId.substring(0, 8) });
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
    parts.push(`THUMBNAIL BEST PRACTICES (from web research):\n${sanitizeForPrompt(intel.bestPractices)}`);
  }

  if (intel.gamingInsights) {
    parts.push(`GAME-SPECIFIC INSIGHTS for ${sanitizeForPrompt(gameName)}:\n${sanitizeForPrompt(intel.gamingInsights)}`);
  }

  if (intel.ctrTactics) {
    parts.push(`CTR TACTICS (proven to work):\n${sanitizeForPrompt(intel.ctrTactics)}`);
  }

  if (intel.antiClickbait) {
    parts.push(`ANTI-CLICKBAIT RULES:\n${sanitizeForPrompt(intel.antiClickbait)}`);
  }

  const patterns = intel.patterns;
  if (patterns) {
    if (patterns.colorSchemes?.length) {
      parts.push(`COLOR SCHEMES that work: ${sanitizeForPrompt(patterns.colorSchemes.join("; "))}`);
    }
    if (patterns.compositions?.length) {
      parts.push(`COMPOSITION PATTERNS: ${sanitizeForPrompt(patterns.compositions.join("; "))}`);
    }
    if (patterns.emotionalTriggers?.length) {
      parts.push(`EMOTIONAL TRIGGERS: ${sanitizeForPrompt(patterns.emotionalTriggers.join("; "))}`);
    }
    if (patterns.textOverlayStyles?.length) {
      parts.push(`TEXT HOOK INTELLIGENCE — recommended 2-4 word hooks and placement for this game: ${sanitizeForPrompt(patterns.textOverlayStyles.join("; "))}`);
    }
    if (patterns.commonElements?.length) {
      parts.push(`COMMON WINNING ELEMENTS: ${sanitizeForPrompt(patterns.commonElements.join("; "))}`);
    }
    if (patterns.avoidPatterns?.length) {
      parts.push(`AVOID (clickbait/trust-damaging): ${sanitizeForPrompt(patterns.avoidPatterns.join("; "))}`);
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
