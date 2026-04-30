/**
 * Omni Intelligence Harvester
 * ─────────────────────────────────────────────────────────────────────────────
 * Continuously pulls signals from every relevant source:
 *   • YouTube trending gaming (yt-dlp metadata scrape — no download)
 *   • Reddit r/gaming, r/PS5, r/gamingclips, r/NewTubers, r/youtube
 *   • Twitch top games (app-credentials auth)
 *   • Gaming RSS news feeds (IGN, VG247, Eurogamer, Kotaku)
 *   • DuckDuckGo web search (strategy + algorithm queries)
 *
 * Every 6 hours the AI synthesizer converts raw signals into:
 *   → predictive_trends   (topic momentum + confidence)
 *   → growth_strategies   (actionable channel tactics)
 *   → capability_gaps     (new experiment hypotheses for the experimenter)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { db } from "../db";
import {
  users, channels, intelligenceSignals, predictiveTrends, growthStrategies, capabilityGaps,
} from "@shared/schema";
import { eq, and, desc, gte, lt, sql, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("omni-intelligence");
const execFileAsync = promisify(execFile);

const HARVEST_CYCLE_MS  = 6 * 60 * 60_000;  // every 6 hours
const INITIAL_DELAY_MS  = 22 * 60_000;       // start 22 min after boot (after benchmark engine at 18m)
const SIGNAL_TTL_DAYS   = 7;                 // auto-expire old signals
const MAX_YT_RESULTS    = 25;
const MAX_REDDIT_POSTS  = 20;

function resolveYtdlp(): string {
  const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  return fs.existsSync(local) ? local : "yt-dlp";
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1: YouTube trending gaming via yt-dlp metadata scrape
// ─────────────────────────────────────────────────────────────────────────────
async function harvestYouTubeTrending(userId: string): Promise<number> {
  const queries = [
    `ytsearch${MAX_YT_RESULTS}:ps5 gaming highlights 2026`,
    `ytsearch${MAX_YT_RESULTS}:youtube gaming viral trending 2026`,
    `ytsearch15:best gaming youtube thumbnails 2026`,
  ];
  let saved = 0;
  const ytdlp = resolveYtdlp();
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const query of queries) {
    try {
      const { stdout } = await execFileAsync(
        ytdlp,
        ["--flat-playlist", "-j", "--no-download",
          "--playlist-end", String(MAX_YT_RESULTS),
          "--js-runtimes", "node",
          query],
        { timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }
      );
      const lines = stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const v = JSON.parse(line);
          const title = v.title || v.fulltitle;
          const vid   = v.id;
          if (!title || !vid) continue;
          const views      = v.view_count ?? 0;
          const uploader   = v.uploader ?? v.channel ?? "";
          const uploadDate = v.upload_date ?? "";
          const duration   = v.duration ?? 0;
          const url = `https://www.youtube.com/watch?v=${vid}`;
          const score = Math.min(100, Math.log10(Math.max(views, 1) + 1) * 20);

          await db.insert(intelligenceSignals).values({
            userId,
            source: "youtube_trending",
            category: "viral_video",
            title,
            url,
            score,
            metadata: { videoId: vid, views, uploader, uploadDate, duration, query },
            expiresAt: expiry,
          }).onConflictDoNothing();
          saved++;
        } catch { /* skip malformed JSON lines */ }
      }
    } catch (err: any) {
      logger.warn(`YouTube harvest failed for query "${query}": ${err.message?.slice(0, 120)}`);
    }
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2: Reddit public JSON (no auth, just User-Agent)
// ─────────────────────────────────────────────────────────────────────────────
async function harvestReddit(userId: string): Promise<number> {
  const subreddits = [
    { sub: "gaming",     category: "community_pulse" },
    { sub: "PS5",        category: "community_pulse" },
    { sub: "gamingclips",category: "viral_video"     },
    { sub: "NewTubers",  category: "strategy_article"},
    { sub: "youtube",    category: "strategy_article"},
  ];
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const { sub, category } of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${MAX_REDDIT_POSTS}`, {
        headers: {
          "User-Agent": "CreatorOS/2.0 (channel growth intelligence bot)",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      const posts = data?.data?.children ?? [];
      for (const { data: p } of posts) {
        if (!p?.title || p.stickied || p.over_18) continue;
        const score = Math.min(100, Math.log10(Math.max(p.score ?? 1, 1) + 1) * 25);
        await db.insert(intelligenceSignals).values({
          userId,
          source: "reddit",
          category,
          title: p.title,
          url: `https://reddit.com${p.permalink}`,
          score,
          metadata: {
            subreddit: sub,
            upvotes: p.score,
            comments: p.num_comments,
            flair: p.link_flair_text,
            selftext: (p.selftext ?? "").slice(0, 400),
          },
          expiresAt: expiry,
        }).onConflictDoNothing();
        saved++;
      }
    } catch (err: any) {
      logger.warn(`Reddit harvest failed for r/${sub}: ${err.message?.slice(0, 80)}`);
    }
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 3: Twitch top games (app client-credentials token)
// ─────────────────────────────────────────────────────────────────────────────
let _twitchToken: { token: string; expiresAt: number } | null = null;

async function getTwitchAppToken(): Promise<string | null> {
  const clientId     = process.env.TWITCH_DEV_CLIENT_ID     ?? process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_DEV_CLIENT_SECRET ?? process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (_twitchToken && _twitchToken.expiresAt > Date.now()) return _twitchToken.token;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const { access_token, expires_in } = await res.json() as any;
    _twitchToken = { token: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
    return access_token;
  } catch { return null; }
}

async function harvestTwitchTopGames(userId: string): Promise<number> {
  const clientId = process.env.TWITCH_DEV_CLIENT_ID ?? process.env.TWITCH_CLIENT_ID;
  const token    = await getTwitchAppToken();
  if (!token || !clientId) return 0;

  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);
  try {
    const res = await fetch("https://api.twitch.tv/helix/games/top?first=20", {
      headers: { "Authorization": `Bearer ${token}`, "Client-Id": clientId },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return 0;
    const { data: games } = await res.json() as { data: Array<{ id: string; name: string; box_art_url: string }> };
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      const score = Math.max(10, 100 - i * 4);
      await db.insert(intelligenceSignals).values({
        userId,
        source: "twitch",
        category: "trending_game",
        title: g.name,
        url: `https://www.twitch.tv/directory/game/${encodeURIComponent(g.name)}`,
        score,
        metadata: { twitchGameId: g.id, rank: i + 1, boxArt: g.box_art_url },
        expiresAt: expiry,
      }).onConflictDoNothing();
      saved++;
    }
  } catch (err: any) {
    logger.warn(`Twitch harvest failed: ${err.message?.slice(0, 80)}`);
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 4: Gaming RSS news feeds
// ─────────────────────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://www.vg247.com/feed",                         name: "VG247"      },
  { url: "https://kotaku.com/rss",                             name: "Kotaku"     },
  { url: "https://www.eurogamer.net/?format=rss",              name: "Eurogamer"  },
  { url: "https://feeds.feedburner.com/ign/games-articles",    name: "IGN"        },
  { url: "https://www.gameinformer.com/rss.xml",               name: "GameInformer"},
];

function parseRSSItems(xml: string, sourceName: string): Array<{ title: string; url: string; pubDate: string }> {
  const items: Array<{ title: string; url: string; pubDate: string }> = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title   = (/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is.exec(block)?.[1] ?? "").trim();
    const link    = (/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/is.exec(block)?.[1] ?? "").trim()
                 || (/<guid[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^<]+)(?:\]\]>)?<\/guid>/is.exec(block)?.[1] ?? "").trim();
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/is.exec(block)?.[1] ?? "").trim();
    if (title && link) items.push({ title, url: link, pubDate });
    if (items.length >= 10) break;
  }
  return items;
}

async function harvestRSSFeeds(userId: string): Promise<number> {
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "CreatorOS/2.0 (gaming news reader)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSSItems(xml, feed.name);
      for (const item of items) {
        await db.insert(intelligenceSignals).values({
          userId,
          source: "rss",
          category: "news",
          title: item.title,
          url: item.url,
          score: 50,
          metadata: { feedName: feed.name, pubDate: item.pubDate },
          expiresAt: expiry,
        }).onConflictDoNothing();
        saved++;
      }
    } catch (err: any) {
      logger.warn(`RSS harvest failed (${feed.name}): ${err.message?.slice(0, 80)}`);
    }
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 5: DuckDuckGo web search (strategy + YouTube algorithm queries)
// ─────────────────────────────────────────────────────────────────────────────
async function harvestWebSearch(userId: string): Promise<number> {
  const queries = [
    "youtube gaming channel growth tips 2026",
    "youtube algorithm changes gaming 2026",
    "ps5 gaming content strategy youtube creators 2026",
    "best youtube thumbnail strategies gaming 2026",
    "youtube shorts vs long form gaming content 2026",
  ];
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const q of queries) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "CreatorOS/2.0 (strategy research)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;

      const relatedTopics: string[] = [];
      for (const t of (data?.RelatedTopics ?? []).slice(0, 8)) {
        const text = t?.Text ?? t?.Result ?? "";
        if (text && text.length > 20) relatedTopics.push(text.slice(0, 200));
      }

      if (relatedTopics.length > 0) {
        await db.insert(intelligenceSignals).values({
          userId,
          source: "web_search",
          category: "strategy_article",
          title: `Web Intel: ${q}`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
          score: 40,
          metadata: { query: q, topics: relatedTopics },
          expiresAt: expiry,
        }).onConflictDoNothing();
        saved++;
      }
    } catch (err: any) {
      logger.warn(`Web search failed for "${q}": ${err.message?.slice(0, 80)}`);
    }
  }
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI SYNTHESIS — turns raw signals into strategies + trends + experiment gaps
// ─────────────────────────────────────────────────────────────────────────────
async function synthesizeIntelligence(userId: string): Promise<void> {
  const since = new Date(Date.now() - HARVEST_CYCLE_MS * 2);
  const signals = await db.select()
    .from(intelligenceSignals)
    .where(and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since)))
    .orderBy(desc(intelligenceSignals.score))
    .limit(80);

  if (signals.length < 5) {
    logger.info("Not enough signals to synthesize — skipping", { userId: userId.slice(0, 8) });
    return;
  }

  // Compact signal summary for the prompt
  const ytVideos    = signals.filter(s => s.source === "youtube_trending").slice(0, 20);
  const redditPosts = signals.filter(s => s.source === "reddit").slice(0, 15);
  const twitchGames = signals.filter(s => s.source === "twitch").slice(0, 15);
  const newsItems   = signals.filter(s => s.source === "rss").slice(0, 10);
  const webItems    = signals.filter(s => s.source === "web_search").slice(0, 5);

  const prompt = `You are the growth intelligence brain for a PS5 gaming YouTube channel (no commentary, gameplay highlights style).

LIVE DATA JUST HARVESTED FROM ${signals.length} SIGNALS:

## YouTube Trending Gaming Videos (top by view score):
${ytVideos.map(s => `- "${s.title}" | ${(s.metadata as any)?.uploader ?? ""} | views≈${((s.metadata as any)?.views ?? 0).toLocaleString()}`).join("\n") || "none"}

## Reddit Gaming Community Pulse:
${redditPosts.map(s => `- [r/${(s.metadata as any)?.subreddit}] "${s.title}" | ↑${(s.metadata as any)?.upvotes ?? 0}`).join("\n") || "none"}

## Twitch Top Games Right Now:
${twitchGames.map(s => `${(s.metadata as any)?.rank}. ${s.title}`).join(", ") || "none"}

## Gaming News (last 24h):
${newsItems.map(s => `- [${(s.metadata as any)?.feedName}] ${s.title}`).join("\n") || "none"}

## Web Strategy Intelligence:
${webItems.map(s => (s.metadata as any)?.topics?.slice(0, 2).join(" | ") ?? "").filter(Boolean).join("\n") || "none"}

Based on ALL this real-time data, produce a JSON response with EXACTLY this structure:
{
  "trendingTopics": [
    {
      "topic": "game or theme name",
      "category": "trending_game|viral_format|emerging_trend|algorithm_shift",
      "confidence": 0.0-1.0,
      "velocity": -1.0 to 1.0 (negative=declining, positive=rising fast),
      "currentVolume": estimated_monthly_searches,
      "peakDaysFromNow": estimated_days_to_peak,
      "whyItMatters": "one sentence for the channel"
    }
  ],
  "growthStrategies": [
    {
      "title": "Actionable strategy title",
      "category": "title_formula|thumbnail_style|upload_timing|content_format|platform_tactic",
      "priority": "high|medium|low",
      "description": "What to do and exactly why based on the data",
      "actionItems": ["specific step 1", "specific step 2", "specific step 3"],
      "estimatedImpact": "e.g. +15% CTR or +20% views"
    }
  ],
  "experimentHypotheses": [
    {
      "title": "Hypothesis to test",
      "domain": "thumbnails|titles|timing|format|hooks",
      "description": "What to test, why the data suggests it, and what success looks like"
    }
  ]
}

Return 5-8 trending topics, 4-6 growth strategies, 3-4 experiment hypotheses. Only return valid JSON — no markdown.`;

  let result;
  try {
    result = await executeRoutedAICall(
      { taskType: "trend_detection", userId, maxTokens: 2500 },
      "You are a world-class YouTube gaming growth strategist. You analyse real-time signal data and produce precise, immediately-actionable intelligence. Return only valid JSON.",
      prompt
    );
  } catch (err: any) {
    logger.error("AI synthesis call failed", { err: err.message?.slice(0, 120) });
    return;
  }

  const parsed = safeParseJSON(result.content, null);
  if (!parsed) {
    logger.warn("AI synthesis returned non-JSON response");
    return;
  }

  const now = new Date();
  let trendsWritten = 0, strategiesWritten = 0, gapsWritten = 0;

  // Write trending topics
  for (const t of (parsed.trendingTopics ?? []).slice(0, 8)) {
    if (!t?.topic) continue;
    try {
      const peakAt = t.peakDaysFromNow
        ? new Date(Date.now() + (t.peakDaysFromNow ?? 7) * 86_400_000)
        : null;
      await db.insert(predictiveTrends).values({
        userId,
        platform: "youtube",
        topic: t.topic,
        category: t.category ?? "trending_game",
        currentVolume: t.currentVolume ?? null,
        predictedPeakVolume: t.currentVolume ? Math.round(t.currentVolume * 1.5) : null,
        predictedPeakAt: peakAt,
        confidence: t.confidence ?? 0.5,
        velocity: t.velocity ?? 0.5,
        status: "rising",
        signals: [{ source: "omni-intelligence", synthesizedAt: now.toISOString(), whyItMatters: t.whyItMatters }],
      });
      trendsWritten++;
    } catch { /* row may already exist */ }
  }

  // Write growth strategies (attached to first YouTube channel if available)
  const ytChannels = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);
  const channelId = ytChannels[0]?.id ?? null;

  for (const s of (parsed.growthStrategies ?? []).slice(0, 6)) {
    if (!s?.title) continue;
    try {
      await db.insert(growthStrategies).values({
        channelId,
        title: s.title,
        description: s.description ?? "",
        priority: s.priority ?? "medium",
        category: s.category ?? "growth",
        actionItems: s.actionItems ?? [],
        estimatedImpact: s.estimatedImpact ?? null,
        status: "pending",
        aiGenerated: true,
      });
      strategiesWritten++;
    } catch { /* skip */ }
  }

  // Write experiment hypotheses as capability gaps
  for (const h of (parsed.experimentHypotheses ?? []).slice(0, 4)) {
    if (!h?.title) continue;
    try {
      await db.insert(capabilityGaps).values({
        userId,
        domain: h.domain ?? "general",
        gapType: "missing_strategy",
        title: h.title,
        description: h.description ?? "",
        priority: 7,
        status: "identified",
        identifiedBy: "omni-intelligence",
      });
      gapsWritten++;
    } catch { /* skip */ }
  }

  // Mark signals as processed
  await db.update(intelligenceSignals)
    .set({ processed: true })
    .where(and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since)));

  logger.info("Intelligence synthesis complete", {
    userId: userId.slice(0, 8),
    signals: signals.length,
    trendsWritten,
    strategiesWritten,
    gapsWritten,
    model: result.model,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — remove expired signals
// ─────────────────────────────────────────────────────────────────────────────
async function cleanupExpiredSignals(): Promise<void> {
  try {
    await db.delete(intelligenceSignals)
      .where(lt(intelligenceSignals.expiresAt, new Date()));
  } catch { /* non-critical */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CYCLE
// ─────────────────────────────────────────────────────────────────────────────
let _running = false;

export async function runIntelligenceCycle(): Promise<void> {
  if (_running) { logger.debug("Cycle already running — skipping"); return; }
  _running = true;
  try {
    const allUsers = await db.select({ id: users.id })
      .from(users)
      .where(sql`EXISTS (SELECT 1 FROM channels c WHERE c.user_id = ${users.id} AND c.platform = 'youtube')`);

    for (const { id: userId } of allUsers) {
      try {
        logger.info("Running intelligence harvest", { userId: userId.slice(0, 8) });

        const [yt, reddit, twitch, rss, web] = await Promise.allSettled([
          harvestYouTubeTrending(userId),
          harvestReddit(userId),
          harvestTwitchTopGames(userId),
          harvestRSSFeeds(userId),
          harvestWebSearch(userId),
        ]);

        const counts = {
          youtube : yt.status      === "fulfilled" ? yt.value      : 0,
          reddit  : reddit.status  === "fulfilled" ? reddit.value  : 0,
          twitch  : twitch.status  === "fulfilled" ? twitch.value  : 0,
          rss     : rss.status     === "fulfilled" ? rss.value     : 0,
          web     : web.status     === "fulfilled" ? web.value     : 0,
        };
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        logger.info("Harvest complete — running AI synthesis", { userId: userId.slice(0, 8), ...counts, total });

        await synthesizeIntelligence(userId);
      } catch (err: any) {
        logger.error("Harvest cycle error for user", { userId: userId.slice(0, 8), err: err.message?.slice(0, 200) });
      }
    }

    await cleanupExpiredSignals();
  } finally {
    _running = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZER — called from server/index.ts boot wave
// ─────────────────────────────────────────────────────────────────────────────
export function initOmniIntelligenceHarvester(): ReturnType<typeof setInterval> {
  logger.info(`Omni Intelligence Harvester initialised — first run in ${INITIAL_DELAY_MS / 60_000}m, then every ${HARVEST_CYCLE_MS / 3_600_000}h`);

  const initialTimer = setTimeout(() => {
    runIntelligenceCycle().catch(err =>
      logger.error("Initial intelligence cycle failed", { err: String(err) })
    );
  }, INITIAL_DELAY_MS);
  initialTimer.unref?.();

  const interval = setInterval(() => {
    runIntelligenceCycle().catch(err =>
      logger.error("Recurring intelligence cycle failed", { err: String(err) })
    );
  }, HARVEST_CYCLE_MS);
  interval.unref?.();

  return interval;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS — for the API feed endpoint
// ─────────────────────────────────────────────────────────────────────────────
export async function getIntelligenceFeed(userId: string): Promise<{
  signals: Array<{ source: string; category: string | null; title: string; url: string | null; score: number | null; metadata: Record<string, any>; createdAt: Date | null }>;
  trends: Array<{ topic: string; category: string | null; confidence: number | null; velocity: number | null; status: string; createdAt: Date | null }>;
  strategies: Array<{ title: string; category: string; priority: string | null; description: string; actionItems: string[] | null; estimatedImpact: string | null; createdAt: Date | null }>;
  isRunning: boolean;
  lastSignalAt: Date | null;
}> {
  const since = new Date(Date.now() - 48 * 3_600_000);

  const [signals, trends, strategies] = await Promise.all([
    db.select({
      source: intelligenceSignals.source,
      category: intelligenceSignals.category,
      title: intelligenceSignals.title,
      url: intelligenceSignals.url,
      score: intelligenceSignals.score,
      metadata: intelligenceSignals.metadata,
      createdAt: intelligenceSignals.createdAt,
    })
    .from(intelligenceSignals)
    .where(and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, since)))
    .orderBy(desc(intelligenceSignals.score))
    .limit(60),

    db.select({
      topic: predictiveTrends.topic,
      category: predictiveTrends.category,
      confidence: predictiveTrends.confidence,
      velocity: predictiveTrends.velocity,
      status: predictiveTrends.status,
      createdAt: predictiveTrends.createdAt,
    })
    .from(predictiveTrends)
    .where(and(eq(predictiveTrends.userId, userId), gte(predictiveTrends.createdAt, since)))
    .orderBy(desc(predictiveTrends.confidence))
    .limit(20),

    db.select({
      title: growthStrategies.title,
      category: growthStrategies.category,
      priority: growthStrategies.priority,
      description: growthStrategies.description,
      actionItems: growthStrategies.actionItems,
      estimatedImpact: growthStrategies.estimatedImpact,
      createdAt: growthStrategies.createdAt,
    })
    .from(growthStrategies)
    .where(gte(growthStrategies.createdAt, since))
    .orderBy(desc(growthStrategies.createdAt))
    .limit(15),
  ]);

  const lastSignalAt = signals[0]?.createdAt ?? null;

  return {
    signals: signals.map(s => ({
      ...s,
      metadata: (s.metadata ?? {}) as Record<string, any>,
    })),
    trends: trends.map(t => ({ ...t })),
    strategies: strategies.map(s => ({
      ...s,
      actionItems: (s.actionItems ?? []) as string[],
    })),
    isRunning: _running,
    lastSignalAt,
  };
}
