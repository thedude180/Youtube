import { createLogger } from "../lib/logger";
import { db } from "../db";
import { discoveredGames } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const logger = createLogger("web-game-lookup");

const gameCache = new Map<string, { name: string | null; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const learnedGames = new Map<string, string[]>();
let learnedGamesLoaded = false;

export async function loadLearnedGames(): Promise<void> {
  try {
    const rows = await db.select().from(discoveredGames);
    learnedGames.clear();
    for (const row of rows) {
      learnedGames.set(row.officialName, row.searchPatterns);
    }
    learnedGamesLoaded = true;
    logger.info("Loaded discovered games from DB", { count: rows.length });
  } catch (err) {
    logger.warn("Failed to load discovered games from DB", { error: String(err).slice(0, 200) });
  }
}

export function getLearnedGames(): Map<string, string[]> {
  return learnedGames;
}

function generateSearchPatterns(gameName: string): string[] {
  const patterns: string[] = [];
  const lower = gameName.toLowerCase();
  patterns.push(lower);

  const noColon = lower.replace(/:/g, "");
  if (noColon !== lower) patterns.push(noColon);

  const noPunctuation = lower.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  if (noPunctuation !== lower && noPunctuation !== noColon) patterns.push(noPunctuation);

  const romanNumerals: Record<string, string> = {
    " ii": " 2", " iii": " 3", " iv": " 4", " v": " 5",
    " vi": " 6", " vii": " 7", " viii": " 8", " ix": " 9", " x": " 10",
    " xi": " 11", " xii": " 12", " xiii": " 13", " xiv": " 14",
    " xv": " 15", " xvi": " 16",
  };
  for (const [roman, arabic] of Object.entries(romanNumerals)) {
    if (lower.endsWith(roman) || lower.includes(roman + " ") || lower.includes(roman + ":")) {
      patterns.push(lower.replace(roman, arabic));
    }
  }

  const words = lower.split(/\s+/);
  if (words.length >= 3) {
    const acronym = words.map(w => w[0]).join("");
    if (acronym.length >= 3) patterns.push(acronym);
  }

  const numberMatch = lower.match(/^(.+?)\s*(\d+)$/);
  if (numberMatch) {
    const [, base, num] = numberMatch;
    const abbreviations: Record<string, string[]> = {
      "battlefield": ["bf"],
      "call of duty": ["cod"],
      "final fantasy": ["ff"],
      "resident evil": ["re"],
      "gran turismo": ["gt"],
      "street fighter": ["sf"],
      "mortal kombat": ["mk"],
      "rainbow six": ["r6"],
    };
    const abbr = abbreviations[base.trim()];
    if (abbr) {
      for (const a of abbr) patterns.push(`${a}${num}`);
    }
  }

  return [...new Set(patterns)].filter(p => p.length >= 2);
}

async function persistDiscoveredGame(gameName: string, source: string): Promise<void> {
  try {
    const patterns = generateSearchPatterns(gameName);
    const existing = await db.select().from(discoveredGames)
      .where(eq(discoveredGames.officialName, gameName))
      .limit(1);

    if (existing.length > 0) {
      await db.update(discoveredGames).set({
        timesDetected: sql`${discoveredGames.timesDetected} + 1`,
        lastDetectedAt: new Date(),
      }).where(eq(discoveredGames.officialName, gameName));
    } else {
      await db.insert(discoveredGames).values({
        officialName: gameName,
        searchPatterns: patterns,
        source,
      });
      logger.info("New game persisted to discovered_games", { gameName, patterns, source });
    }

    learnedGames.set(gameName, patterns);
  } catch (err) {
    logger.warn("Failed to persist discovered game", { gameName, error: String(err).slice(0, 200) });
  }
}

export function detectGameFromLearned(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [game, patterns] of learnedGames.entries()) {
    if (patterns.some(p => lower.includes(p))) return game;
  }
  return null;
}

function getCachedResult(key: string): string | null | undefined {
  const entry = gameCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    gameCache.delete(key);
    return undefined;
  }
  return entry.name;
}

function setCachedResult(key: string, name: string | null): void {
  if (gameCache.size > 500) {
    const oldest = gameCache.keys().next().value;
    if (oldest) gameCache.delete(oldest);
  }
  gameCache.set(key, { name, timestamp: Date.now() });
}

export async function lookupGameFromWeb(searchText: string): Promise<string | null> {
  if (!learnedGamesLoaded) {
    await loadLearnedGames();
  }

  const lower = searchText.toLowerCase();
  const learnedMatch = detectGameFromLearned(lower);
  if (learnedMatch) {
    await persistDiscoveredGame(learnedMatch, "learned-cache");
    return learnedMatch;
  }

  const cacheKey = lower.trim().slice(0, 100);
  const cached = getCachedResult(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const keywords = extractGameKeywords(searchText);
    if (!keywords || keywords.length < 2) {
      setCachedResult(cacheKey, null);
      return null;
    }

    const wikiResult = await searchWikipediaForGame(keywords);
    if (wikiResult) {
      logger.info("Game identified via web lookup", { query: keywords, result: wikiResult });
      setCachedResult(cacheKey, wikiResult);
      await persistDiscoveredGame(wikiResult, "wikipedia");
      return wikiResult;
    }

    const ddgResult = await searchDuckDuckGoForGame(keywords);
    if (ddgResult) {
      logger.info("Game identified via DuckDuckGo", { query: keywords, result: ddgResult });
      setCachedResult(cacheKey, ddgResult);
      await persistDiscoveredGame(ddgResult, "duckduckgo");
      return ddgResult;
    }

    setCachedResult(cacheKey, null);
    return null;
  } catch (err) {
    logger.warn("Web game lookup failed", { error: String(err).slice(0, 200) });
    setCachedResult(cacheKey, null);
    return null;
  }
}

function extractGameKeywords(text: string): string {
  const lower = text.toLowerCase();
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "it", "my", "this", "that", "from", "up",
    "out", "no", "not", "all", "are", "was", "were", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "just",
    "stream", "streaming", "live", "livestream", "gameplay", "playthrough",
    "walkthrough", "let's", "lets", "play", "playing", "episode", "part",
    "chapter", "ep", "pt", "day", "night", "session", "full", "game",
    "ps5", "ps4", "xbox", "pc", "nintendo", "switch", "4k", "hdr",
    "60fps", "no", "commentary", "blind", "first", "time", "new",
    "update", "patch", "dlc", "season", "ranked", "competitive",
    "casual", "chill", "vibes", "late", "early", "morning",
    "unlock", "ultimate", "squad", "combos", "epic", "wins", "best",
    "top", "insane", "crazy", "amazing", "tips", "tricks", "guide",
    "tutorial", "how", "win", "get", "easy", "fast", "quick",
  ]);

  const words = lower.replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(w => w.length > 1);
  const meaningful = words.filter(w => !stopWords.has(w));
  return meaningful.slice(0, 6).join(" ");
}

async function searchWikipediaForGame(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + " video game")}&format=json&srlimit=5&utf8=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "CreatorOS/1.0 (game-detection)" },
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const results = data?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    for (const result of results) {
      const title = result.title as string;
      const snippet = (result.snippet as string || "").toLowerCase();

      const isVideoGame = snippet.includes("video game") ||
        snippet.includes("is a") && (snippet.includes("game") || snippet.includes("shooter") || snippet.includes("rpg") || snippet.includes("action")) ||
        snippet.includes("developed by") ||
        snippet.includes("published by") ||
        snippet.includes("playstation") ||
        snippet.includes("xbox") ||
        snippet.includes("console");

      if (isVideoGame) {
        const cleanTitle = title
          .replace(/\s*\(.*?(video game|game).*?\)/i, "")
          .replace(/\s*\(.*?\d{4}.*?\)/i, "")
          .trim();
        return cleanTitle;
      }
    }

    return null;
  } catch (err) {
    logger.debug("Wikipedia search failed", { error: String(err).slice(0, 100) });
    return null;
  }
}

async function searchDuckDuckGoForGame(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + " PS5 game")}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "CreatorOS/1.0 (game-detection)" },
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;
    const data = await resp.json() as any;

    if (data.AbstractSource && data.Heading) {
      const heading = data.Heading as string;
      const abstract = (data.Abstract as string || "").toLowerCase();

      if (abstract.includes("video game") || abstract.includes("developed by") ||
          abstract.includes("published by") || abstract.includes("playstation")) {
        return heading.replace(/\s*\(.*?\)/, "").trim();
      }
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        const text = (topic.Text as string || "").toLowerCase();
        const name = topic.FirstURL as string || "";
        if ((text.includes("video game") || text.includes("developed by")) && name) {
          const match = name.match(/\/([^/]+)$/);
          if (match) {
            return decodeURIComponent(match[1]).replace(/_/g, " ").replace(/\s*\(.*?\)/, "").trim();
          }
        }
      }
    }

    return null;
  } catch (err) {
    logger.debug("DuckDuckGo search failed", { error: String(err).slice(0, 100) });
    return null;
  }
}
