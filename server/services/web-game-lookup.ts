import { createLogger } from "../lib/logger";

const logger = createLogger("web-game-lookup");

const gameCache = new Map<string, { name: string | null; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
  const cacheKey = searchText.toLowerCase().trim().slice(0, 100);
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
      return wikiResult;
    }

    const ddgResult = await searchDuckDuckGoForGame(keywords);
    if (ddgResult) {
      logger.info("Game identified via DuckDuckGo", { query: keywords, result: ddgResult });
      setCachedResult(cacheKey, ddgResult);
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
