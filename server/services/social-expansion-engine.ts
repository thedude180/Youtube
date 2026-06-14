import { db } from "../db";
import { eq, and, sql, gte, isNotNull } from "drizzle-orm";
import { channels, autopilotQueue, notifications, systemSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("social-expansion");

// ─── Platform expansion queue ─────────────────────────────────────────────────
// Ordered by priority for a no-commentary BF6 gaming Shorts channel.

export interface PlatformCredential {
  envKey?: string;
  name: string;
  description: string;
  url?: string;
  required: boolean;
}

export interface PlatformConfig {
  id: string;
  label: string;
  icon: string;
  priority: number;
  why: string;
  credentials: PlatformCredential[];
  setupSteps: string[];
  estimatedSetupMinutes: number;
  contentStrategy: string;
  postsPerDayDefault: number;
}

export const PLATFORM_EXPANSION_QUEUE: PlatformConfig[] = [
  {
    id: "tiktok",
    label: "TikTok",
    icon: "tiktok",
    priority: 1,
    why: "Highest organic reach for short-form gaming clips. Your YouTube Shorts post as-is — same vertical format, same duration. Gen Z gaming audience with massive discovery potential.",
    credentials: [
      { envKey: "TIKTOK_CLIENT_KEY",    name: "TikTok Client Key",    description: "From developers.tiktok.com → Your app → Client Key",    url: "https://developers.tiktok.com", required: true },
      { envKey: "TIKTOK_CLIENT_SECRET", name: "TikTok Client Secret", description: "From developers.tiktok.com → Your app → Client Secret",                                required: true },
      { name: "TikTok Account Username", description: "Your TikTok handle (e.g. @etgaming274) — create the account first at tiktok.com", url: "https://www.tiktok.com/signup", required: true },
    ],
    setupSteps: [
      "Create a TikTok account for @ETGaming274 at tiktok.com — use the same branding as your YouTube channel",
      "Go to developers.tiktok.com and sign up as a developer using your TikTok account",
      "Create a new app — name it 'ET Gaming 274 Autopilot', category: Entertainment",
      "Under Products, enable 'Content Posting API' and 'Video Upload' scopes, then request access",
      "Copy your Client Key and Client Secret from the app dashboard",
      "Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET as secrets in your Replit project",
      "The system will start cross-posting your Shorts to TikTok automatically within 24 hours",
    ],
    estimatedSetupMinutes: 25,
    contentStrategy: "Cross-post all Shorts automatically. Captions auto-adapted to TikTok style (150 chars + 5 trending gaming hashtags). Zero manual work needed after setup.",
    postsPerDayDefault: 3,
  },
  {
    id: "instagram",
    label: "Instagram Reels",
    icon: "instagram",
    priority: 2,
    why: "Same vertical video content as TikTok and YouTube Shorts. Reaches a slightly older gaming demographic (18–34). Instagram Reels algorithm aggressively pushes gaming content to new viewers.",
    credentials: [
      { name: "Instagram Professional Account",    description: "Convert your Instagram account to Professional/Creator at instagram.com/accounts/contact", url: "https://www.instagram.com", required: true },
      { envKey: "INSTAGRAM_ACCESS_TOKEN",          name: "Instagram Access Token",          description: "Long-lived token from Meta Developer Portal → Graph API. Expires every 60 days.", url: "https://developers.facebook.com", required: true },
      { envKey: "INSTAGRAM_BUSINESS_ACCOUNT_ID",   name: "Instagram Business Account ID",   description: "Your IG Business Account ID from Meta's Graph API explorer",                          required: true },
    ],
    setupSteps: [
      "Create or convert your Instagram account to a Professional account (Creator or Business)",
      "Connect Instagram to a Meta Business Page at business.facebook.com",
      "Go to developers.facebook.com, create a new app (type: Business)",
      "Add the 'Instagram Graph API' product to your app",
      "Generate a long-lived access token with instagram_basic and instagram_content_publish permissions",
      "Use the Graph API explorer to find your Instagram Business Account ID",
      "Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID as Replit secrets",
    ],
    estimatedSetupMinutes: 35,
    contentStrategy: "Cross-post all Shorts as Instagram Reels. Captions adapted with Instagram hashtag style. Top-performing Reels get a Story repost at 48 hours.",
    postsPerDayDefault: 2,
  },
  {
    id: "x",
    label: "X (Twitter)",
    icon: "twitter",
    priority: 3,
    why: "Gaming clips and battlefield moments go viral on X. Real-time gaming discourse, tournament moments, and big plays get massive organic reach. Builds your creator brand beyond YouTube.",
    credentials: [
      { envKey: "X_API_KEY",              name: "X API Key",              description: "From developer.twitter.com → Your Project → App Keys → API Key",     url: "https://developer.twitter.com", required: true },
      { envKey: "X_API_SECRET",           name: "X API Secret",           description: "API Key Secret from the same location",                                                                 required: true },
      { envKey: "X_ACCESS_TOKEN",         name: "X Access Token",         description: "OAuth 1.0a Access Token for your @ETGaming274 X account",                                              required: true },
      { envKey: "X_ACCESS_TOKEN_SECRET",  name: "X Access Token Secret",  description: "OAuth 1.0a Access Token Secret",                                                                        required: true },
    ],
    setupSteps: [
      "Create an X account for @ETGaming274 at twitter.com (or use your existing account)",
      "Go to developer.twitter.com and apply for a developer account (Basic tier available)",
      "Create a Project and App in the developer portal",
      "Enable OAuth 1.0a with Read and Write permissions",
      "Generate Access Token and Access Token Secret for your account",
      "Apply for Elevated API access to enable native video uploads (free — submit the form)",
      "Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET as Replit secrets",
    ],
    estimatedSetupMinutes: 40,
    contentStrategy: "Post best-performing Shorts as native video clips. Text post for each new long-form upload. Auto-repost top Shorts at 24-hour mark to catch different time zones.",
    postsPerDayDefault: 5,
  },
  {
    id: "discord",
    label: "Discord Community",
    icon: "discord",
    priority: 4,
    why: "Your most dedicated fans want a community to belong to. Discord turns casual viewers into superfans. Announce new uploads, run clip-voting polls, and host watch parties — all automated.",
    credentials: [
      { envKey: "DISCORD_BOT_TOKEN",             name: "Discord Bot Token",             description: "Create a bot at discord.com/developers → Applications → Bot → Reset Token",           url: "https://discord.com/developers/applications", required: true },
      { envKey: "DISCORD_SERVER_ID",             name: "Discord Server ID",             description: "Enable Developer Mode (Settings → Advanced), then right-click your server → Copy Server ID",                                               required: true },
      { envKey: "DISCORD_ANNOUNCE_CHANNEL_ID",   name: "Announcement Channel ID",       description: "Right-click your #announcements channel → Copy Channel ID",                                                                                required: true },
    ],
    setupSteps: [
      "Create a Discord server named 'ET Gaming 274' at discord.com",
      "Add channels: #announcements, #clips, #general, #suggestions",
      "Go to discord.com/developers/applications, create a new Application, then add a Bot",
      "Under Bot settings, copy the Bot Token (keep it secret)",
      "Invite the bot to your server using the OAuth2 URL Generator with 'bot' scope + Send Messages + Embed Links permissions",
      "Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)",
      "Right-click your server to copy Server ID; right-click #announcements to copy Channel ID",
      "Add DISCORD_BOT_TOKEN, DISCORD_SERVER_ID, DISCORD_ANNOUNCE_CHANNEL_ID as Replit secrets",
    ],
    estimatedSetupMinutes: 30,
    contentStrategy: "Auto-post rich embed when a new video publishes. Weekly digest of top clips. Stream go-live alert. Community polls for upcoming content. All automated.",
    postsPerDayDefault: 2,
  },
  {
    id: "rumble",
    label: "Rumble",
    icon: "rumble",
    priority: 5,
    why: "Archive your long-form content on a growing alternative platform with zero extra effort after setup. Revenue share available on all views. Completely passive additional income.",
    credentials: [
      { name: "Rumble Account",      description: "Create an account at rumble.com/register — use the same channel name and branding as YouTube",  url: "https://rumble.com/register", required: true },
      { envKey: "RUMBLE_API_KEY",    name: "Rumble API Key",    description: "From your Rumble Studio dashboard → Settings → API Key",                                               required: true },
      { envKey: "RUMBLE_CHANNEL_ID", name: "Rumble Channel ID", description: "Your Rumble channel slug from your channel URL (e.g. 'etgaming274')",                                    required: false },
    ],
    setupSteps: [
      "Create a Rumble account at rumble.com/register — use the same name and branding as your YouTube channel",
      "Complete channel setup: upload banner, avatar, and write bio",
      "Go to your Rumble Studio dashboard → Settings → API section",
      "Copy your API Key",
      "Add RUMBLE_API_KEY and your channel slug as RUMBLE_CHANNEL_ID as Replit secrets",
      "Your long-form videos will mirror to Rumble automatically (Shorts are excluded)",
    ],
    estimatedSetupMinutes: 15,
    contentStrategy: "Mirror all long-form content automatically. Rumble is long-form only — Shorts not posted. Revenue share on every view.",
    postsPerDayDefault: 1,
  },
];

// ─── YouTube maturity scoring ─────────────────────────────────────────────────

export interface MaturityScore {
  score: number;
  ready: boolean;
  breakdown: {
    channelConnected: number;
    contentVolume: number;
    recentActivity: number;
    publishingConsistency: number;
  };
  details: {
    channelConnected: boolean;
    publishedShortsTotal: number;
    publishedLast7d: number;
    weeksConsistent: number;
  };
}

const READY_THRESHOLD = 60;
const SHORT_TYPES = ["youtube_short", "platform_short", "auto-clip", "vod-short"];

export async function scoreYouTubeMaturity(userId: string): Promise<MaturityScore> {
  const d28ago = new Date(Date.now() - 28 * 86_400_000);
  const d7ago  = new Date(Date.now() -  7 * 86_400_000);

  const [ytChannel] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"), isNotNull(channels.accessToken)))
    .limit(1);
  const channelConnected = !!ytChannel;

  const typeFilter = sql`${autopilotQueue.type} = ANY(ARRAY[${sql.raw(SHORT_TYPES.map(t => `'${t}'`).join(","))}]::text[])`;

  const [volResult] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), typeFilter));
  const publishedShortsTotal = Number(volResult?.cnt ?? 0);

  const [recentResult] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), gte(autopilotQueue.publishedAt, d7ago)));
  const publishedLast7d = Number(recentResult?.cnt ?? 0);

  const weeklyRows = await db
    .select({
      week: sql<string>`date_trunc('week', ${autopilotQueue.publishedAt})::text`,
      cnt:  sql<number>`count(*)::int`,
    })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), gte(autopilotQueue.publishedAt, d28ago)))
    .groupBy(sql`date_trunc('week', ${autopilotQueue.publishedAt})`);
  const weeksConsistent = weeklyRows.filter(r => Number(r.cnt) >= 3).length;

  const channelPts     = channelConnected   ? 25 : 0;
  const volumePts      = publishedShortsTotal >= 50 ? 25 : publishedShortsTotal >= 20 ? 15 : publishedShortsTotal >= 10 ? 8 : Math.round(publishedShortsTotal / 10 * 8);
  const recentPts      = publishedLast7d >= 3 ? 25 : publishedLast7d >= 1 ? 15 : 0;
  const consistencyPts = weeksConsistent >= 4 ? 25 : weeksConsistent >= 3 ? 18 : weeksConsistent >= 2 ? 10 : weeksConsistent >= 1 ? 5 : 0;
  const score          = channelPts + volumePts + recentPts + consistencyPts;

  return {
    score,
    ready: score >= READY_THRESHOLD,
    breakdown: { channelConnected: channelPts, contentVolume: volumePts, recentActivity: recentPts, publishingConsistency: consistencyPts },
    details: { channelConnected, publishedShortsTotal, publishedLast7d, weeksConsistent },
  };
}

// ─── Platform connection check ────────────────────────────────────────────────

async function getConnectedPlatformIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ platform: channels.platform })
    .from(channels)
    .where(and(eq(channels.userId, userId), isNotNull(channels.accessToken)));
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.platform.toLowerCase().replace("youtubeshorts", "youtube"));
  return ids;
}

// ─── Notification dedup ───────────────────────────────────────────────────────

async function getNotifiedPlatforms(userId: string): Promise<Set<string>> {
  const [row] = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, `social_expansion:notified:${userId}`));
  if (!row) return new Set();
  return new Set(JSON.parse(row.value) as string[]);
}

async function markPlatformNotified(userId: string, platformId: string): Promise<void> {
  const existing = await getNotifiedPlatforms(userId);
  existing.add(platformId);
  const val = JSON.stringify([...existing]);
  await db.insert(systemSettings).values({ key: `social_expansion:notified:${userId}`, value: val })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: val, updatedAt: new Date() } });
}

// ─── Platform goals ───────────────────────────────────────────────────────────

export interface PlatformGoals {
  postsPerDay: number;
  postsPerWeek: number;
  targetFollowers?: number;
  active: boolean;
}

export async function getPlatformGoals(userId: string, platformId: string): Promise<PlatformGoals> {
  const key = `social_expansion:goals:${userId}:${platformId}`;
  const [row] = await db.select({ value: systemSettings.value }).from(systemSettings).where(eq(systemSettings.key, key));
  if (row) return JSON.parse(row.value) as PlatformGoals;
  const p = PLATFORM_EXPANSION_QUEUE.find(x => x.id === platformId);
  return { postsPerDay: p?.postsPerDayDefault ?? 1, postsPerWeek: (p?.postsPerDayDefault ?? 1) * 7, active: false };
}

export async function setPlatformGoals(userId: string, platformId: string, goals: Partial<PlatformGoals>): Promise<void> {
  const key = `social_expansion:goals:${userId}:${platformId}`;
  const current = await getPlatformGoals(userId, platformId);
  const merged = { ...current, ...goals };
  await db.insert(systemSettings).values({ key, value: JSON.stringify(merged) })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(merged), updatedAt: new Date() } });
}

// ─── ASI cross-platform content adaptation ────────────────────────────────────

export interface AdaptedContent {
  caption: string;
  hashtags: string[];
  callToAction: string;
  tone: string;
}

const PLATFORM_COPY_GUIDES: Record<string, string> = {
  tiktok:    "Short punchy opener (3-5 words). Max 150-char caption total. 5 hashtags: 2 trending gaming + 2 game-specific + 1 growth (#fyp). High energy. First-person.",
  instagram: "Engaging first sentence (no hashtags yet). 2-3 sentence story/hype. Then newline break, 20-25 hashtags mixing niche + broad gaming + community tags. Emojis OK.",
  x:         "Tweet-style. Max 220 chars including a [LINK] placeholder. 1-2 hashtags only. Conversational, genuine reaction-worthy. No cringe. Short.",
  discord:   "Announcement-style. Bold title line. 2-3 sentences of genuine hype. Add a fun emoji. Use [LINK] placeholder. No hashtags.",
  rumble:    "SEO-friendly. Title stays same as YouTube. 2-sentence description with game name + channel name for discoverability. No hashtags.",
};

export async function adaptContentForPlatform(
  content: { title: string; description?: string; tags?: string[]; gameName?: string },
  platform: string,
): Promise<AdaptedContent> {
  const guide = PLATFORM_COPY_GUIDES[platform];
  if (!guide) return { caption: content.title, hashtags: [], callToAction: "", tone: "neutral" };

  const game = content.gameName || "Battlefield 6";
  const cfg  = PLATFORM_EXPANSION_QUEUE.find(p => p.id === platform);

  try {
    const result = await executeRoutedAICall(
      { taskType: "description_generation", userId: "system", maxTokens: 220, priority: "low" as const },
      `You are the social media manager for ET Gaming 274, a no-commentary Battlefield 6 highlights channel.`,
      `Adapt this YouTube content for ${cfg?.label ?? platform}.

Platform writing guide: ${guide}
Game: ${game}
Original title: ${content.title}
Tags: ${(content.tags ?? []).slice(0, 8).join(", ")}

Return ONLY valid JSON (no markdown): { "caption": "...", "hashtags": ["#tag1", "#tag2"], "callToAction": "...", "tone": "..." }`,
    );
    const parsed = safeParseJSON<AdaptedContent>(result?.content ?? "", null as unknown as AdaptedContent);
    if (parsed?.caption) return parsed;
  } catch { /* fall through */ }

  return {
    caption: `${content.title} 🎮`,
    hashtags: [`#${game.replace(/\s+/g, "")}`, "#gaming", "#clips", "#highlights", "#fyp"],
    callToAction: "Like for more clips!",
    tone: "energetic",
  };
}

// ─── ASI multi-platform growth strategies ────────────────────────────────────
// Generates growth strategies per-platform and injects into growthStrategies
// so the adversarial evaluator (pillar 1) challenges them too.

export async function generateCrossPlatformStrategies(userId: string): Promise<void> {
  try {
    const { growthStrategies } = await import("@shared/schema");
    const { evaluateStrategiesAdversarially } = await import("./adversarial-evaluator");
    const { getFocusGame } = await import("../lib/game-focus");

    const maturity = await scoreYouTubeMaturity(userId);
    if (!maturity.ready) return;

    const connected = await getConnectedPlatformIds(userId);
    const activePlatforms = PLATFORM_EXPANSION_QUEUE.filter(p => connected.has(p.id));
    if (activePlatforms.length === 0) return;

    const focusGame = await getFocusGame();

    // Build StrategyCandidate[] — sourceField carries the platform tag through evaluation
    const candidates = activePlatforms.map(p => ({
      title:           `Cross-post top Shorts to ${p.label}`,
      category:        "distribution",
      priority:        "high",
      description:     `Cross-post your best-performing YouTube Shorts to ${p.label} during the first 2 hours after YouTube publish, when the algorithm boost window is active.`,
      actionItems:     [`Identify top Short from last 7 days`, `Adapt caption for ${p.label} style`, `Post during peak hours for ${p.label} audience`],
      estimatedImpact: `Reach 2–5× more viewers on ${p.label} with zero additional content creation`,
      sourceField:     p.id,
    }));

    const survivors = await evaluateStrategiesAdversarially(userId, candidates, focusGame);

    for (const s of survivors) {
      const platformId = s.strategy.sourceField ?? "unknown";
      await db.insert(growthStrategies).values({
        userId,
        strategy:        s.strategy.title,
        estimatedImpact: s.strategy.estimatedImpact,
        priority:        7,
        status:          "pending",
        metadata:        { platformTag: platformId, source: "social-expansion-engine" } as any,
      } as any).onConflictDoNothing();
    }

    if (survivors.length > 0) logger.info(`[SocialExpansion] Injected ${survivors.length} cross-platform strategies into growth pipeline`);
  } catch (err: any) {
    logger.debug(`[SocialExpansion] Strategy generation non-fatal: ${err.message?.slice(0, 80)}`);
  }
}

// ─── Expansion status (API response) ─────────────────────────────────────────

export type PlatformStatus = "connected" | "ready" | "pending" | "not-ready";

export interface ExpansionStatus {
  youtubeMaturity: MaturityScore;
  nextPlatform:    PlatformConfig | null;
  platformQueue:   Array<PlatformConfig & { status: PlatformStatus }>;
  allGoals:        Record<string, PlatformGoals>;
}

export async function getPlatformExpansionStatus(userId: string): Promise<ExpansionStatus> {
  const [maturity, connected] = await Promise.all([
    scoreYouTubeMaturity(userId),
    getConnectedPlatformIds(userId),
  ]);

  const allGoals: Record<string, PlatformGoals> = {};
  for (const p of PLATFORM_EXPANSION_QUEUE) {
    allGoals[p.id] = await getPlatformGoals(userId, p.id);
  }

  let passedUnconnected = false;
  const platformQueue = PLATFORM_EXPANSION_QUEUE.map(p => {
    let status: PlatformStatus;
    if (connected.has(p.id)) {
      status = "connected";
    } else if (!passedUnconnected) {
      passedUnconnected = true;
      status = maturity.ready ? "ready" : "not-ready";
    } else {
      status = "pending";
    }
    return { ...p, status };
  });

  const nextPlatform = PLATFORM_EXPANSION_QUEUE.find(p => !connected.has(p.id)) ?? null;

  return { youtubeMaturity: maturity, nextPlatform, platformQueue, allGoals };
}

// ─── Weekly expansion cycle ───────────────────────────────────────────────────

const _lastExpansionCycleAt = new Map<string, number>();
const EXPANSION_CYCLE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // ~weekly

export async function runSocialExpansionCycle(userId: string): Promise<void> {
  const last = _lastExpansionCycleAt.get(userId) ?? 0;
  if (Date.now() - last < EXPANSION_CYCLE_INTERVAL_MS) return;
  _lastExpansionCycleAt.set(userId, Date.now());

  try {
    const [maturity, connected, notified] = await Promise.all([
      scoreYouTubeMaturity(userId),
      getConnectedPlatformIds(userId),
      getNotifiedPlatforms(userId),
    ]);

    logger.info(`[SocialExpansion] YouTube maturity ${maturity.score}/100 (${maturity.ready ? "READY" : "building"}) — ${userId.slice(0, 8)}`);

    // Generate cross-platform strategies for already-connected platforms (passes through adversarial evaluator)
    await generateCrossPlatformStrategies(userId);

    if (!maturity.ready) return;

    // Find first unconnected + un-notified platform
    const target = PLATFORM_EXPANSION_QUEUE.find(p => !connected.has(p.id) && !notified.has(p.id));
    if (!target) return;

    await db.insert(notifications).values({
      userId,
      type:     "platform_expansion_ready",
      title:    `Ready to expand to ${target.label}!`,
      message:  `Your YouTube autopilot is running consistently (maturity score ${maturity.score}/100). The system is ready to automatically cross-post your content to ${target.label}. ${target.why.slice(0, 120)}`,
      severity: "info",
      actionUrl: "/dashboard",
      metadata: { source: "social-expansion-engine", platformAffected: target.id } as any,
    });

    await markPlatformNotified(userId, target.id);
    logger.info(`[SocialExpansion] Fired expansion-ready notification → ${target.label} for ${userId.slice(0, 8)}`);
  } catch (err: any) {
    _lastExpansionCycleAt.delete(userId);
    logger.warn(`[SocialExpansion] Expansion cycle failed (non-fatal): ${err.message?.slice(0, 100)}`);
  }
}
