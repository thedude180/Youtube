/**
 * external-data-cache.ts
 *
 * Centralises ALL non-YouTube external API reads so each data source is
 * fetched at most once per TTL window, regardless of how many background
 * engines need the same data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Design rule (mirrors youtube-data-cache.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • This is the ONLY place that may call Wikipedia, DuckDuckGo, Reddit,
 *    or RSS feeds for background-engine reads.
 *  • All callers use the getters below — they receive cached data from the
 *    database (system_settings) and pay zero external API cost when warm.
 *  • Actual real-time or action calls (e.g., OAuth token refreshes,
 *    live chat posts) are NOT subject to this rule — they are writes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * What is cached
 * ─────────────────────────────────────────────────────────────────────────────
 *  getCachedWikiResults(query)
 *      Wikipedia search API (up to 3 results). Returns pre-formatted
 *      "Title: snippet\n..." string, HTML-stripped, ready for AI prompts.
 *      Key: extcache:wiki:<query>   TTL: 24 h
 *
 *  getCachedWikiRawSearch(query)
 *      Same Wikipedia search but returns Array<{title,snippet}> for
 *      callers that need structured results (e.g. game detection).
 *      Key: extcache:wikiraw:<query>   TTL: 24 h
 *
 *  getCachedDDGResult(query)
 *      DuckDuckGo Instant Answer API. Returns { abstract, related[],
 *      heading?, relatedUrls? }. Extra fields used by game detection.
 *      Key: extcache:ddg:<query>    TTL: 24 h
 *
 *  getCachedRedditFeed(subreddit, type)
 *      Reddit hot/top posts. Returns CachedRedditPost[].
 *      Key: extcache:reddit:<sub>:<type>   TTL: 2 h
 *
 *  getCachedRSSFeed(url, name)
 *      Gaming RSS feed. Returns RSSItem[].
 *      Key: extcache:rss:<url-slug>   TTL: 6 h
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Callers that were redirected to use this cache
 * ─────────────────────────────────────────────────────────────────────────────
 *  self-improvement-engine     × 2 (curiosity pursuit + strategy web scan)
 *  growth-flywheel-engine      × 1 (competitive intel scan)
 *  thumbnail-intelligence      × 1 (searchWebForThumbnailArticles)
 *  internet-benchmark-engine   × 1 (searchWebForDomain — per query)
 *  live-chat-agent             × 1 (researchQuestion — wiki + DDG)
 *  routes/ai.ts                × 1 (getGamingDemandSignals via Reddit)
 *  omni-intelligence-harvester × 3 (Reddit + RSS + DDG — rewired)
 *  web-game-lookup             × 2 (Wikipedia + DDG — rewired)
 */

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("ext-cache");

const WIKI_TTL_MS   = 24 * 60 * 60_000;   // 24 hours
const DDG_TTL_MS    = 24 * 60 * 60_000;   // 24 hours
const REDDIT_TTL_MS =  2 * 60 * 60_000;   //  2 hours
const RSS_TTL_MS    =  6 * 60 * 60_000;   //  6 hours

const USER_AGENT = "CreatorOS/1.0 (platform-intelligence)";

// ── system_settings helpers ───────────────────────────────────────────────────

async function readCache<T>(key: string): Promise<{ value: T; fetchedAt: string } | null> {
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (!row) return null;
    return JSON.parse(row.value) as { value: T; fetchedAt: string };
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  const str = JSON.stringify({ value, fetchedAt: new Date().toISOString() });
  await db
    .insert(systemSettings)
    .values({ key, value: str })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: str, updatedAt: new Date() },
    });
}

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}

// ── getCachedWikiResults ──────────────────────────────────────────────────────

/**
 * Returns a Wikipedia search result as a pre-formatted string:
 *   "Title: snippet\nTitle: snippet\n..."
 * HTML tags are stripped; snippets are truncated to 250 chars.
 * Returns "" on failure or empty results — callers fall back to AI knowledge.
 *
 * Cache key: extcache:wiki:<query>   TTL: 24 h
 */
export async function getCachedWikiResults(query: string, maxResults = 3): Promise<string> {
  const key = `extcache:wiki:${query.toLowerCase().trim().slice(0, 200)}`;

  const cached = await readCache<string>(key);
  if (cached && isFresh(cached.fetchedAt, WIKI_TTL_MS)) {
    return cached.value;
  }

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}&utf8=1`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!resp.ok) return cached?.value ?? "";

    const data = await resp.json() as any;
    const results: any[] = data?.query?.search ?? [];
    const formatted = results
      .map((r: any) => `${r.title}: ${(r.snippet ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 250)}`)
      .join("\n");

    await writeCache(key, formatted);
    return formatted;
  } catch (err: any) {
    logger.warn(`[ExtCache] Wikipedia fetch failed for "${query.slice(0, 60)}": ${err?.message?.slice(0, 80)}`);
    return cached?.value ?? "";
  }
}

// ── getCachedWikiRawSearch ────────────────────────────────────────────────────

export type WikiSearchResult = {
  title: string;
  snippet: string;
};

/**
 * Returns Wikipedia search results as a structured array { title, snippet }[].
 * Used by callers that need to inspect titles and snippets individually
 * (e.g. game detection, which checks isVideoGame signals in the snippet).
 * HTML tags in snippets are stripped. Returns [] on failure.
 *
 * Cache key: extcache:wikiraw:<query>   TTL: 24 h
 */
export async function getCachedWikiRawSearch(
  query: string,
  maxResults = 5,
): Promise<WikiSearchResult[]> {
  const key = `extcache:wikiraw:${query.toLowerCase().trim().slice(0, 200)}`;

  const cached = await readCache<WikiSearchResult[]>(key);
  if (cached && isFresh(cached.fetchedAt, WIKI_TTL_MS)) {
    return cached.value;
  }

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}&utf8=1`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!resp.ok) return cached?.value ?? [];

    const data = await resp.json() as any;
    const results: WikiSearchResult[] = (data?.query?.search ?? []).map((r: any) => ({
      title:   r.title ?? "",
      snippet: (r.snippet ?? "").replace(/<[^>]*>/g, "").trim(),
    }));

    await writeCache(key, results);
    return results;
  } catch (err: any) {
    logger.warn(`[ExtCache] Wikipedia raw search failed for "${query.slice(0, 60)}": ${err?.message?.slice(0, 80)}`);
    return cached?.value ?? [];
  }
}

// ── getCachedDDGResult ────────────────────────────────────────────────────────

export type DDGResult = {
  abstract: string;
  related: string[];
  heading?: string;
  relatedUrls?: string[];
};

/**
 * Returns a DuckDuckGo Instant Answer: { abstract, related[], heading?, relatedUrls? }.
 * abstract     — up to 400 chars of the AbstractText field.
 * related      — up to 4 RelatedTopics Text strings (up to 180 chars each).
 * heading      — the Heading field (page title when DDG matches a topic).
 * relatedUrls  — up to 4 RelatedTopics FirstURL strings (for link-based detection).
 *
 * Cache key: extcache:ddg:<query>   TTL: 24 h
 */
export async function getCachedDDGResult(query: string): Promise<DDGResult> {
  const key = `extcache:ddg:${query.toLowerCase().trim().slice(0, 200)}`;
  const empty: DDGResult = { abstract: "", related: [], heading: "", relatedUrls: [] };

  const cached = await readCache<DDGResult>(key);
  if (cached && isFresh(cached.fetchedAt, DDG_TTL_MS)) {
    return cached.value;
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!resp.ok) return cached?.value ?? empty;

    const data = await resp.json() as any;
    const topics: any[] = (data.RelatedTopics ?? []).slice(0, 4);
    const result: DDGResult = {
      abstract:    (data.AbstractText ?? "").slice(0, 400),
      related:     topics.map((t: any) => (t.Text ?? "").slice(0, 180)).filter(Boolean),
      heading:     (data.Heading ?? "").slice(0, 200),
      relatedUrls: topics.map((t: any) => t.FirstURL ?? "").filter(Boolean),
    };

    await writeCache(key, result);
    return result;
  } catch (err: any) {
    logger.warn(`[ExtCache] DuckDuckGo fetch failed for "${query.slice(0, 60)}": ${err?.message?.slice(0, 80)}`);
    return cached?.value ?? empty;
  }
}

// ── getCachedRedditFeed ───────────────────────────────────────────────────────

export type CachedRedditPost = {
  id: string;
  title: string;
  score: number;
  url: string;
  subreddit: string;
  commentCount: number;
  created: number;
  author: string;
  selftext?: string;
  permalink: string;
};

/**
 * Returns Reddit hot or top posts for a subreddit.
 * Deduplicates by post ID. Falls back to stale cache on fetch failure.
 *
 * Cache key: extcache:reddit:<sub>:<type>   TTL: 2 h
 */
export async function getCachedRedditFeed(
  subreddit: string,
  type: "hot" | "top" = "hot",
  limit = 25,
): Promise<CachedRedditPost[]> {
  const key = `extcache:reddit:${subreddit.toLowerCase()}:${type}`;

  const cached = await readCache<CachedRedditPost[]>(key);
  if (cached && isFresh(cached.fetchedAt, REDDIT_TTL_MS)) {
    return cached.value;
  }

  try {
    const base = "https://www.reddit.com";
    const url = type === "hot"
      ? `${base}/r/${encodeURIComponent(subreddit)}/hot.json?limit=${limit}`
      : `${base}/r/${encodeURIComponent(subreddit)}/top.json?t=week&limit=${limit}`;

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!resp.ok) return cached?.value ?? [];

    const data = await resp.json() as any;
    const posts: CachedRedditPost[] = (data?.data?.children ?? []).map((c: any) => ({
      id:           c.data.id,
      title:        c.data.title,
      score:        c.data.score,
      url:          c.data.url,
      subreddit:    c.data.subreddit,
      commentCount: c.data.num_comments,
      created:      c.data.created_utc,
      author:       c.data.author,
      selftext:     (c.data.selftext ?? "").slice(0, 500),
      permalink:    `https://www.reddit.com${c.data.permalink}`,
    }));

    await writeCache(key, posts);
    return posts;
  } catch (err: any) {
    logger.warn(`[ExtCache] Reddit fetch failed for r/${subreddit}: ${err?.message?.slice(0, 80)}`);
    return cached?.value ?? [];
  }
}

/**
 * Fetch hot + top for multiple subreddits, deduped by post ID.
 * Drop-in replacement for monitorSubreddits() in reddit-listener.ts.
 */
export async function getCachedSubredditFeeds(
  subreddits: string[],
): Promise<Array<{ subreddit: string; posts: CachedRedditPost[]; fetchedAt: Date }>> {
  const results = await Promise.allSettled(
    subreddits.map(async (sub) => {
      const [hot, top] = await Promise.allSettled([
        getCachedRedditFeed(sub, "hot"),
        getCachedRedditFeed(sub, "top"),
      ]);
      const all = [
        ...(hot.status === "fulfilled" ? hot.value : []),
        ...(top.status === "fulfilled" ? top.value : []),
      ];
      const seen = new Set<string>();
      const unique = all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      return { subreddit: sub, posts: unique, fetchedAt: new Date() };
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);
}

// ── getCachedRSSFeed ──────────────────────────────────────────────────────────

export type RSSItem = {
  title: string;
  url: string;
  pubDate: string;
  feedName: string;
};

function parseRSSXML(xml: string, feedName: string, maxItems = 10): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title   = (/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is.exec(block)?.[1] ?? "").trim();
    const link    = (/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/is.exec(block)?.[1] ?? "").trim()
                 || (/<guid[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^<]+)(?:\]\]>)?<\/guid>/is.exec(block)?.[1] ?? "").trim();
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/is.exec(block)?.[1] ?? "").trim();
    if (title && link) items.push({ title, url: link, pubDate, feedName });
    if (items.length >= maxItems) break;
  }
  return items;
}

/**
 * Returns parsed items from an RSS feed URL.
 * Falls back to stale cache on fetch failure.
 *
 * Cache key: extcache:rss:<url-slug>   TTL: 6 h
 */
export async function getCachedRSSFeed(
  feedUrl: string,
  feedName: string,
  maxItems = 10,
): Promise<RSSItem[]> {
  const slug = feedUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9]/gi, "_").slice(0, 120);
  const key = `extcache:rss:${slug}`;

  const cached = await readCache<RSSItem[]>(key);
  if (cached && isFresh(cached.fetchedAt, RSS_TTL_MS)) {
    return cached.value;
  }

  try {
    const resp = await fetch(feedUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!resp.ok) return cached?.value ?? [];

    const xml = await resp.text();
    const items = parseRSSXML(xml, feedName, maxItems);
    await writeCache(key, items);
    return items;
  } catch (err: any) {
    logger.warn(`[ExtCache] RSS fetch failed for ${feedName}: ${err?.message?.slice(0, 80)}`);
    return cached?.value ?? [];
  }
}

// ── Scheduled pre-warm ────────────────────────────────────────────────────────

const DEFAULT_GAMING_SUBREDDITS = [
  // Battlefield community — primary signal for BF6 channel
  "battlefield", "battlefield2042", "BattlefieldPortal", "BattlefieldVeterans",
  // FPS + competitive gaming — broader audience signals
  "fps", "pcgaming", "CompetitiveGaming",
  // YouTube growth — channel strategy signals
  "gaming", "YouTube", "NewTubers", "youtubestudio",
];

const DEFAULT_RSS_FEEDS: Array<{ url: string; name: string }> = [
  // Core gaming news
  { url: "https://www.vg247.com/feed",                          name: "VG247"        },
  { url: "https://kotaku.com/rss",                              name: "Kotaku"       },
  { url: "https://www.eurogamer.net/?format=rss",               name: "Eurogamer"    },
  { url: "https://feeds.feedburner.com/ign/games-articles",     name: "IGN"          },
  { url: "https://www.gameinformer.com/rss.xml",                name: "GameInformer" },
  // Broader gaming + tech
  { url: "https://www.pcgamer.com/rss/",                        name: "PCGamer"      },
  { url: "https://www.rockpapershotgun.com/feed",               name: "RockPaperShotgun" },
  { url: "https://www.polygon.com/rss/index.xml",               name: "Polygon"      },
  // EA / Battlefield official
  { url: "https://www.ea.com/news/rss",                         name: "EA News"      },
  // YouTube strategy
  { url: "https://www.theverge.com/rss/index.xml",              name: "TheVerge"     },
];

async function prewarmRedditFeeds(): Promise<void> {
  for (const sub of DEFAULT_GAMING_SUBREDDITS) {
    try {
      await getCachedRedditFeed(sub, "hot");
      await getCachedRedditFeed(sub, "top");
    } catch { /* non-fatal */ }
  }
  logger.info(`[ExtCache] Reddit pre-warm complete (${DEFAULT_GAMING_SUBREDDITS.length} subreddits)`);
}

async function prewarmRSSFeeds(): Promise<void> {
  for (const feed of DEFAULT_RSS_FEEDS) {
    try {
      await getCachedRSSFeed(feed.url, feed.name);
    } catch { /* non-fatal */ }
  }
  logger.info(`[ExtCache] RSS pre-warm complete (${DEFAULT_RSS_FEEDS.length} feeds)`);
}

let _warmTimer: ReturnType<typeof setInterval> | null = null;
let _rssTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Call once from index.ts. Warms Reddit every 2 h and RSS every 6 h so
 * background engines always find caches populated. Wikipedia/DDG warm on
 * first access.
 */
export function initExternalDataCache(): void {
  logger.info("[ExtCache] External data cache initialised — Reddit pre-warm in 2 min, RSS in 3 min");

  setTimeout(() => {
    prewarmRedditFeeds().catch(err =>
      logger.warn(`[ExtCache] Initial Reddit pre-warm failed: ${err?.message?.slice(0, 80)}`),
    );
  }, 2 * 60_000);

  setTimeout(() => {
    prewarmRSSFeeds().catch(err =>
      logger.warn(`[ExtCache] Initial RSS pre-warm failed: ${err?.message?.slice(0, 80)}`),
    );
  }, 3 * 60_000);

  _warmTimer = setInterval(() => {
    prewarmRedditFeeds().catch(err =>
      logger.warn(`[ExtCache] Scheduled Reddit pre-warm failed: ${err?.message?.slice(0, 80)}`),
    );
  }, REDDIT_TTL_MS);

  _rssTimer = setInterval(() => {
    prewarmRSSFeeds().catch(err =>
      logger.warn(`[ExtCache] Scheduled RSS pre-warm failed: ${err?.message?.slice(0, 80)}`),
    );
  }, RSS_TTL_MS);
}

export function stopExternalDataCache(): void {
  if (_warmTimer) { clearInterval(_warmTimer); _warmTimer = null; }
  if (_rssTimer)  { clearInterval(_rssTimer);  _rssTimer  = null; }
}
