/**
 * Omni Intelligence Harvester
 * ─────────────────────────────────────────────────────────────────────────────
 * Continuously pulls signals from every relevant source:
 *   • YouTube trending gaming (yt-dlp metadata scrape — no download)
 *   • Reddit — gaming + viral + science + psychology + filmmaking + culture
 *   • Gaming RSS news feeds (IGN, VG247, Eurogamer, Kotaku + 20 more)
 *   • Tech/culture/science/marketing RSS (The Verge, Wired, HBR, Quanta, etc.)
 *   • DuckDuckGo — gaming strategy + cross-domain curiosity queries
 *   • Curiosity engine — 60-topic rotating pool, 4 random topics/cycle
 *     (neuroscience, psychology, design, viral mechanics, storytelling,
 *      attention economy, philosophy, business — no domain off-limits)
 *
 * Every 6 hours the AI synthesizer converts raw signals into:
 *   → predictive_trends   (topic momentum + confidence)
 *   → growth_strategies   (actionable channel tactics — including cross-domain)
 *   → capability_gaps     (new experiment hypotheses for the experimenter)
 *
 * The curiosity engine gives the system the drive to learn anything and
 * find unexpected connections between any field and channel growth.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { db } from "../db";
import {
  users, channels, intelligenceSignals, predictiveTrends, growthStrategies, capabilityGaps,
} from "@shared/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { acquireYtdlpSlot } from "../lib/ytdlp-gate";
import { getFocusGame } from "../lib/game-focus";
import { recordEngineKnowledge } from "./knowledge-mesh";
import {
  getCachedRedditFeed,
  getCachedRSSFeed,
  getCachedDDGResult,
} from "./external-data-cache";

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
async function harvestYouTubeTrending(userId: string, focusGame: string): Promise<number> {
  const year = new Date().getFullYear();
  const queries = [
    `ytsearch${MAX_YT_RESULTS}:${focusGame} best moments ${year}`,
    `ytsearch${MAX_YT_RESULTS}:${focusGame} highlights ${year}`,
    `ytsearch${MAX_YT_RESULTS}:youtube gaming viral trending ${year}`,
    `ytsearch15:best gaming youtube thumbnails ${year}`,
  ];
  let saved = 0;
  const ytdlp = resolveYtdlp();
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const query of queries) {
    try {
      const releaseOmni = await acquireYtdlpSlot();
      let _omniStdout: string;
      try {
        ({ stdout: _omniStdout } = await execFileAsync(
          ytdlp,
          ["--flat-playlist", "-j", "--no-download",
            "--playlist-end", String(MAX_YT_RESULTS),
            "--js-runtimes", "node",
            query],
          { timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }
        ));
      } finally {
        releaseOmni();
      }
      const stdout = _omniStdout!;
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
// SOURCE 2: Reddit — served from external-data-cache (2 h TTL, DB-persisted)
// ─────────────────────────────────────────────────────────────────────────────
async function harvestReddit(userId: string, focusGame: string): Promise<number> {
  const gameSub = focusGame.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  const gameSubVariants = [
    { sub: gameSub,           category: "community_pulse" as const },
    ...(focusGame.toLowerCase().includes("battlefield") ? [
      { sub: "battlefield",     category: "community_pulse" as const },
      { sub: "battlefield2042", category: "community_pulse" as const },
    ] : []),
  ];

  const subreddits = [
    // ── Gaming ──────────────────────────────────────────────────────────────
    { sub: "gaming",              category: "community_pulse"  as const },
    { sub: "gamingclips",         category: "viral_video"      as const },
    { sub: "PS5",                 category: "community_pulse"  as const },
    // ── YouTube / creator strategy ───────────────────────────────────────────
    { sub: "NewTubers",           category: "strategy_article" as const },
    { sub: "youtube",             category: "strategy_article" as const },
    { sub: "youtubers",           category: "strategy_article" as const },
    // ── Viral content & culture ───────────────────────────────────────────────
    { sub: "videos",              category: "viral_video"      as const },
    { sub: "interestingasfuck",   category: "viral_video"      as const },
    { sub: "nextfuckinglevel",    category: "viral_video"      as const },
    { sub: "oddlysatisfying",     category: "viral_video"      as const },
    // ── Psychology & attention ────────────────────────────────────────────────
    { sub: "psychology",          category: "strategy_article" as const },
    { sub: "neuroscience",        category: "strategy_article" as const },
    { sub: "BehavioralEconomics", category: "strategy_article" as const },
    // ── Marketing & business ──────────────────────────────────────────────────
    { sub: "marketing",           category: "strategy_article" as const },
    { sub: "entrepreneur",        category: "strategy_article" as const },
    { sub: "analytics",           category: "strategy_article" as const },
    // ── Film / video craft ────────────────────────────────────────────────────
    { sub: "filmmakers",          category: "strategy_article" as const },
    { sub: "editors",             category: "strategy_article" as const },
    // ── Science & curiosity ────────────────────────────────────────────────────
    { sub: "todayilearned",       category: "community_pulse"  as const },
    { sub: "Futurology",          category: "community_pulse"  as const },
    { sub: "dataisbeautiful",     category: "strategy_article" as const },
    // ── Tech & digital ────────────────────────────────────────────────────────
    { sub: "technology",          category: "strategy_article" as const },
    { sub: "artificial",          category: "strategy_article" as const },
    ...gameSubVariants,
  ].filter((v, i, arr) => arr.findIndex(x => x.sub === v.sub) === i);

  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const { sub, category } of subreddits) {
    try {
      const posts = await getCachedRedditFeed(sub, "hot", MAX_REDDIT_POSTS);
      for (const p of posts) {
        if (!p.title) continue;
        const score = Math.min(100, Math.log10(Math.max(p.score ?? 1, 1) + 1) * 25);
        await db.insert(intelligenceSignals).values({
          userId,
          source: "reddit",
          category,
          title: p.title,
          url: p.permalink,
          score,
          metadata: {
            subreddit: sub,
            upvotes: p.score,
            comments: p.commentCount,
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

// SOURCE 3: Twitch top-games harvest removed — YouTube-only mode.

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 4: Gaming RSS — served from external-data-cache (6 h TTL, DB-persisted)
// ─────────────────────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  // ── Gaming news ──────────────────────────────────────────────────────────
  { url: "https://www.vg247.com/feed",                              name: "VG247",         domain: "gaming" },
  { url: "https://kotaku.com/rss",                                  name: "Kotaku",        domain: "gaming" },
  { url: "https://www.eurogamer.net/?format=rss",                   name: "Eurogamer",     domain: "gaming" },
  { url: "https://feeds.feedburner.com/ign/games-articles",         name: "IGN",           domain: "gaming" },
  { url: "https://www.gameinformer.com/rss.xml",                    name: "GameInformer",  domain: "gaming" },
  { url: "https://www.pcgamer.com/rss/",                            name: "PCGamer",       domain: "gaming" },
  { url: "https://www.rockpapershotgun.com/feed",                   name: "RPS",           domain: "gaming" },
  // ── Tech & digital culture ────────────────────────────────────────────────
  { url: "https://www.theverge.com/rss/index.xml",                  name: "TheVerge",      domain: "tech"   },
  { url: "https://www.wired.com/feed/rss",                          name: "Wired",         domain: "tech"   },
  { url: "https://feeds.arstechnica.com/arstechnica/index",         name: "ArsTechnica",   domain: "tech"   },
  { url: "https://techcrunch.com/feed/",                            name: "TechCrunch",    domain: "tech"   },
  { url: "https://www.technologyreview.com/feed/",                  name: "MITTechReview", domain: "tech"   },
  // ── Creator economy & YouTube strategy ───────────────────────────────────
  { url: "https://creatoriq.com/blog/feed/",                        name: "CreatorIQ",     domain: "creator" },
  { url: "https://tubefilter.com/feed/",                            name: "Tubefilter",    domain: "creator" },
  { url: "https://vidiq.com/blog/feed/",                            name: "VidIQ",         domain: "creator" },
  // ── Marketing & psychology ────────────────────────────────────────────────
  { url: "https://feeds.feedburner.com/ seth-godin-blog",           name: "SethGodin",     domain: "marketing" },
  { url: "https://feeds.hbr.org/harvardbusiness",                   name: "HBR",           domain: "marketing" },
  { url: "https://www.marketingweek.com/feed/",                     name: "MarketingWeek", domain: "marketing" },
  { url: "https://neilpatel.com/blog/feed/",                        name: "NeilPatel",     domain: "marketing" },
  // ── Science & curiosity ───────────────────────────────────────────────────
  { url: "https://www.quantamagazine.org/feed/",                    name: "Quanta",        domain: "science" },
  { url: "https://www.smithsonianmag.com/rss/latest_articles/",     name: "Smithsonian",   domain: "science" },
  { url: "https://feeds.newscientist.com/science-news",             name: "NewScientist",  domain: "science" },
  { url: "https://www.sciencedaily.com/rss/top/technology.xml",     name: "ScienceDaily",  domain: "science" },
  // ── Business & entrepreneurship ───────────────────────────────────────────
  { url: "https://www.inc.com/rss",                                 name: "Inc",           domain: "business" },
  { url: "https://www.fastcompany.com/latest/rss",                  name: "FastCompany",   domain: "business" },
  // ── Entertainment & pop culture ───────────────────────────────────────────
  { url: "https://variety.com/feed/",                               name: "Variety",       domain: "culture" },
  { url: "https://www.billboard.com/feed/",                         name: "Billboard",     domain: "culture" },
];

async function harvestRSSFeeds(userId: string): Promise<number> {
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const feed of RSS_FEEDS) {
    try {
      const items = await getCachedRSSFeed(feed.url, feed.name);
      for (const item of items) {
        await db.insert(intelligenceSignals).values({
          userId,
          source: "rss",
          category: "news",
          title: item.title,
          url: item.url,
          score: 50,
          metadata: { feedName: feed.name, domain: (feed as any).domain ?? "gaming", pubDate: item.pubDate },
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
// SOURCE 5: DuckDuckGo — served from external-data-cache (24 h TTL, DB-persisted)
// ─────────────────────────────────────────────────────────────────────────────
async function harvestWebSearch(userId: string, focusGame: string): Promise<number> {
  const year = new Date().getFullYear();
  const queries = [
    // ── Gaming / YouTube strategy ────────────────────────────────────────────
    `youtube gaming channel growth tips ${year}`,
    `youtube algorithm changes gaming ${year}`,
    `${focusGame} youtube content strategy creators ${year}`,
    `${focusGame} best clips highlights format youtube ${year}`,
    "youtube shorts vs long form gaming content strategy",
    `${focusGame} trending topics community ${year}`,
    // ── Cross-domain: psychology of engagement ────────────────────────────────
    "attention span psychology video content research",
    "what makes video content go viral psychology study",
    "viewer retention techniques video psychology",
    "dopamine reward loop video games psychology",
    // ── Cross-domain: visual & design science ─────────────────────────────────
    "thumbnail design eye tracking study youtube clicks",
    "color psychology marketing conversion science",
    "visual hierarchy attention design research",
    // ── Cross-domain: storytelling & hooks ────────────────────────────────────
    "hook theory storytelling first 3 seconds video",
    "narrative transportation engagement research",
    "curiosity gap information theory content",
    // ── Cross-domain: creator economy ─────────────────────────────────────────
    `youtube creator economy trends ${year}`,
    "short form vs long form video retention data",
    "youtube algorithm ranking factors research",
  ];
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const q of queries) {
    try {
      const ddg = await getCachedDDGResult(q);
      const relatedTopics = ddg.related.filter(t => t.length > 20).slice(0, 8);

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
// SOURCE 6: Curiosity Engine — rotating 60-topic pool, 4 random topics/cycle
// No AI calls — just DuckDuckGo searches on any topic. The AI synthesizer
// then finds the hidden connection between any field and channel growth.
// ─────────────────────────────────────────────────────────────────────────────
const CURIOSITY_POOL = [
  // Neuroscience & attention
  "dopamine reward prediction brain neuroscience",
  "attention restoration theory cognitive science",
  "flow state neuroscience triggers research",
  "mirror neurons social engagement brain",
  "working memory limits human cognition",
  "pattern recognition visual cortex research",
  "emotional contagion psychology science",
  "decision fatigue cognitive load study",
  // Viral mechanics & psychology
  "what makes content spread social contagion study",
  "awe emotion viral content research",
  "social currency why people share content",
  "nostalgia psychology brain reward research",
  "surprise versus expectation engagement psychology",
  "FOMO fear of missing out behavioral science",
  "parasocial relationship psychology media",
  "identity signaling content sharing behavior",
  // Storytelling & narrative science
  "story transportation theory narrative engagement",
  "three act structure brain response research",
  "cliffhanger suspense psychology science",
  "character identification empathy psychology",
  "open loops curiosity gap information theory",
  "tension resolution dopamine loop narrative",
  // Visual perception & design
  "visual saliency eye tracking attention",
  "color emotion psychology cross-cultural study",
  "contrast ratio visual perception attention",
  "rule of thirds composition psychology",
  "facial recognition amygdala social brain",
  "motion detection peripheral vision attention",
  // Audio & music psychology
  "music tempo heartbeat synchronization psychology",
  "earworm involuntary musical imagery science",
  "silence tension film music psychology",
  "bass frequency emotional response body",
  // Habit & behavior
  "habit loop cue routine reward neuroscience",
  "variable ratio reinforcement schedule addiction",
  "social proof behavior conformity research",
  "scarcity psychology urgency decision making",
  "completion instinct Zeigarnik effect psychology",
  // Gaming psychology
  "gaming flow state challenge skill balance",
  "competitive gaming spectator engagement psychology",
  "game tension victory moment dopamine spike",
  "tutorial design learning curve psychology",
  // Business & growth
  "network effect viral growth mathematics",
  "long tail distribution niche audience economics",
  "compounding growth exponential curves business",
  "first mover vs fast follower market strategy",
  "minimum viable audience niche content strategy",
  // Philosophy & ideas
  "information theory entropy signal noise Shannon",
  "emergence complex systems simple rules",
  "feedback loop second order effects systems thinking",
  "Dunning-Kruger expert beginner knowledge gap",
  "memetic theory cultural evolution internet",
  // Nature & patterns
  "fractal self-similarity nature patterns mathematics",
  "swarm intelligence collective behavior emergence",
  "evolutionary arms race coevolution biology",
  "power law distribution Pareto principle data",
  "golden ratio human preference aesthetics",
];

// Deterministic-but-rotating selection: picks 4 different topics per cycle
// based on hour-of-day so each 6h window explores a different quadrant
function pickCuriosityTopics(): string[] {
  const seed = Math.floor(Date.now() / (6 * 60 * 60_000)); // changes every 6h
  const start = (seed * 4) % CURIOSITY_POOL.length;
  const picked: string[] = [];
  for (let i = 0; i < 4; i++) {
    picked.push(CURIOSITY_POOL[(start + i) % CURIOSITY_POOL.length]);
  }
  return picked;
}

async function harvestCuriositySignals(userId: string): Promise<number> {
  const topics = pickCuriosityTopics();
  let saved = 0;
  const expiry = new Date(Date.now() + SIGNAL_TTL_DAYS * 86_400_000);

  for (const topic of topics) {
    try {
      const ddg = await getCachedDDGResult(topic);
      const relatedTopics = ddg.related.filter((t: string) => t.length > 15).slice(0, 6);
      if (relatedTopics.length === 0 && !ddg.abstract) continue;

      await db.insert(intelligenceSignals).values({
        userId,
        source: "curiosity",
        category: "strategy_article",
        title: `Curiosity: ${topic}`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(topic)}`,
        score: 35,
        metadata: {
          topic,
          abstract: (ddg.abstract ?? "").slice(0, 300),
          relatedTopics,
          domain: "cross_domain",
        },
        expiresAt: expiry,
      }).onConflictDoNothing();
      saved++;
    } catch (err: any) {
      logger.debug(`Curiosity search failed for "${topic}": ${err.message?.slice(0, 60)}`);
    }
  }

  if (saved > 0) {
    logger.info("Curiosity engine harvested", { userId: userId.slice(0, 8), topics: topics.slice(0, 2), saved });
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
  const ytVideos      = signals.filter(s => s.source === "youtube_trending").slice(0, 20);
  const redditPosts   = signals.filter(s => s.source === "reddit").slice(0, 15);
  const gamingNews    = signals.filter(s => s.source === "rss" && (s.metadata as any)?.domain === "gaming").slice(0, 8);
  const broadNews     = signals.filter(s => s.source === "rss" && (s.metadata as any)?.domain !== "gaming").slice(0, 10);
  const webItems      = signals.filter(s => s.source === "web_search").slice(0, 8);
  const curiosityItems = signals.filter(s => s.source === "curiosity").slice(0, 6);

  const focusGame = await getFocusGame();
  const prompt = `You are the growth intelligence brain for a "${focusGame}" gaming YouTube channel called "ET Gaming 274" (no commentary, gameplay highlights style). Focus game: ${focusGame}.

You have access to signals from across the ENTIRE INTERNET — gaming, psychology, neuroscience, design, business, culture, philosophy, and science. Your job is to absorb all of it and find the unexpected connections that can make this channel grow faster.

LIVE DATA JUST HARVESTED FROM ${signals.length} SIGNALS:

## YouTube Trending Gaming Videos:
${ytVideos.map(s => `- "${s.title}" | ${(s.metadata as any)?.uploader ?? ""} | views≈${((s.metadata as any)?.views ?? 0).toLocaleString()}`).join("\n") || "none"}

## Reddit Community Pulse (gaming + viral + psychology + filmmaking + culture):
${redditPosts.map(s => `- [r/${(s.metadata as any)?.subreddit}] "${s.title}" | ↑${(s.metadata as any)?.upvotes ?? 0}`).join("\n") || "none"}

## Gaming News (last 24h):
${gamingNews.map(s => `- [${(s.metadata as any)?.feedName}] ${s.title}`).join("\n") || "none"}

## Broader World News (tech, science, culture, business, marketing, creator economy):
${broadNews.map(s => `- [${(s.metadata as any)?.feedName}/${(s.metadata as any)?.domain}] ${s.title}`).join("\n") || "none"}

## Web Search Intelligence (gaming strategy + cross-domain research):
${webItems.map(s => (s.metadata as any)?.topics?.slice(0, 3).join(" | ") ?? "").filter(Boolean).join("\n") || "none"}

## Curiosity Engine Discoveries (any topic — find the hidden channel connection):
${curiosityItems.map(s => {
  const m = s.metadata as any;
  return `- Topic: "${m?.topic}" | Related: ${(m?.relatedTopics ?? []).slice(0, 3).join(", ")}${m?.abstract ? ` | Abstract: ${m.abstract.slice(0, 120)}` : ""}`;
}).join("\n") || "none"}

CROSS-DOMAIN SYNTHESIS INSTRUCTIONS:
The curiosity engine discoveries and broad news may seem unrelated to gaming — that is intentional. Your most valuable insight is finding the non-obvious connection. For example:
- "dopamine reward prediction brain neuroscience" → structure clips to delay the payoff moment to maximise the reward spike
- "visual saliency eye tracking attention" → position the most important element in the thumbnail where eyes land first
- "Zeigarnik effect psychology" → never fully resolve tension in a Short — leave an open loop that drives clicks to the long-form
- A marketing study on emotional contagion → use emotional escalation in clip selection rather than just highlight moments
Always ask: "what does this field know that can make gaming content perform better?"

Based on ALL this data, produce a JSON response with EXACTLY this structure:
{
  "trendingTopics": [
    {
      "topic": "game, format, or emerging theme",
      "category": "trending_game|viral_format|emerging_trend|algorithm_shift|cross_domain_insight",
      "confidence": 0.0-1.0,
      "velocity": -1.0 to 1.0 (negative=declining, positive=rising fast),
      "currentVolume": estimated_monthly_searches,
      "peakDaysFromNow": estimated_days_to_peak,
      "whyItMatters": "one sentence for the channel — include the cross-domain connection if applicable"
    }
  ],
  "growthStrategies": [
    {
      "title": "Actionable strategy title",
      "category": "title_formula|thumbnail_style|upload_timing|content_format|platform_tactic|psychology_lever|cross_domain",
      "priority": "high|medium|low",
      "description": "What to do and exactly why — cite the signal or field it came from",
      "actionItems": ["specific step 1", "specific step 2", "specific step 3"],
      "estimatedImpact": "e.g. +15% CTR or +20% views",
      "sourceField": "psychology|neuroscience|gaming|marketing|design|culture|business|science|other"
    }
  ],
  "experimentHypotheses": [
    {
      "title": "Hypothesis to test",
      "domain": "thumbnails|titles|timing|format|hooks|editing|music|pacing",
      "description": "What to test, why the data suggests it, and what success looks like",
      "inspiration": "which signal or cross-domain field suggested this"
    }
  ]
}

Return 5-8 trending topics, 4-6 growth strategies (at least 2 must be cross-domain insights), 3-4 experiment hypotheses. Only return valid JSON — no markdown.`;

  let result;
  try {
    result = await executeRoutedAICall(
      { taskType: "trend_detection", userId, maxTokens: 4096 },
      "You are a world-class growth strategist and polymath. You synthesise signals from gaming, neuroscience, psychology, design, business, and culture to produce channel growth intelligence. You excel at finding non-obvious cross-domain connections. Return only valid JSON.",
      prompt
    );
  } catch (err: any) {
    logger.error("AI synthesis call failed", { err: err.message?.slice(0, 120) });
    return;
  }

  const parsed = safeParseJSON<Record<string, any> | null>(result.content, null);
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
    // Feed each internet-derived strategy into the knowledge mesh so all AI generators see it
    recordEngineKnowledge(
      "omni-intelligence-harvester", userId,
      "internet_intelligence", `growth_strategy:${String(s.title).slice(0, 60)}`,
      `INTERNET GROWTH STRATEGY [${s.priority ?? "medium"} priority]: ${s.title}${s.description ? " — " + String(s.description).slice(0, 160) : ""}`,
      `estimatedImpact=${s.estimatedImpact ?? "unknown"}, category=${s.category ?? "growth"}`,
      s.priority === "high" ? 70 : 55,
    ).catch(() => {});
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

        const focusGame = await getFocusGame();
        logger.info("Harvesting with focus game", { userId: userId.slice(0, 8), focusGame });

        const [yt, reddit, rss, web, curiosity] = await Promise.allSettled([
          harvestYouTubeTrending(userId, focusGame),
          harvestReddit(userId, focusGame),
          harvestRSSFeeds(userId),
          harvestWebSearch(userId, focusGame),
          harvestCuriositySignals(userId),
        ]);

        const counts = {
          youtube  : yt.status       === "fulfilled" ? yt.value       : 0,
          reddit   : reddit.status   === "fulfilled" ? reddit.value   : 0,
          rss      : rss.status      === "fulfilled" ? rss.value      : 0,
          web      : web.status      === "fulfilled" ? web.value      : 0,
          curiosity: curiosity.status === "fulfilled" ? curiosity.value : 0,
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
