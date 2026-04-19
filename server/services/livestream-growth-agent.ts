import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { channels, streams, autopilotQueue, autopilotConfig } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { updateYouTubeVideo } from "../youtube";
import { recordHeartbeat } from "./engine-heartbeat";

import { createLogger } from "../lib/logger";

const logger = createLogger("livestream-growth-agent");

const openai = getOpenAIClient();

const SEO_INTERVAL_MS = 15 * 60 * 1000;
const SOCIAL_BLAST_INTERVAL_MS = 20 * 60 * 1000;

interface LiveGrowthSession {
  userId: string;
  broadcastId: string;
  channelId: number;
  streamTitle: string;
  viewerCount: number;
  seoTimer: ReturnType<typeof setInterval> | null;
  socialTimer: ReturnType<typeof setInterval> | null;
  cycleCount: number;
  startedAt: Date;
}

const activeSessions = new Map<string, LiveGrowthSession>();
let eventsRegistered = false;

async function getConnectedPlatforms(userId: string): Promise<Set<string>> {
  const userChannels = await db.select({ platform: channels.platform, accessToken: channels.accessToken, platformData: channels.platformData })
    .from(channels)
    .where(eq(channels.userId, userId));
  return new Set(userChannels.filter(c => {
    if (!c.accessToken) return false;
    const pd = (c.platformData || {}) as any;
    if (pd._connectionStatus === "expired") return false;
    return true;
  }).map(c => c.platform));
}

async function isSocialBlastEnabled(userId: string): Promise<boolean> {
  const configs = await db.select()
    .from(autopilotConfig)
    .where(and(eq(autopilotConfig.userId, userId)));
  const smartSchedule = configs.find(c => c.feature === "smart-schedule");
  if (smartSchedule && smartSchedule.enabled === false) return false;
  const socialBlast = configs.find(c => c.feature === "social-blast" || c.feature === "discord-announce");
  if (socialBlast && socialBlast.enabled === false) return false;
  return true;
}

function buildPrompt(session: LiveGrowthSession, liveYouTubeContext?: string): string {
  const liveMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
  return `The streamer is LIVE right now. Here is the current situation:
- Stream title: "${sanitizeForPrompt(session.streamTitle)}"
- Current viewers: ${sanitizeForPrompt(session.viewerCount)}
- Stream running for: ${liveMinutes} minutes
- Cycle #${session.cycleCount + 1} (every 15 min)
${liveYouTubeContext ? `\nLIVE YOUTUBE DATA:\n${liveYouTubeContext}` : ""}

Generate an optimized live stream update. Return valid JSON with:
- optimizedTitle (max 100 chars, start with 🔴 LIVE:, be specific about what's happening NOW based on the actual stream content)
- optimizedDescription (full description with links section at bottom — must reference what's actually happening in the stream)
- optimizedTags (array of 20 strings — game name, genre, "live", "gaming", "ps5", specifics, trending terms)
- discordPost (@everyone announcement, exciting, include context about what's happening)
- tiktokPost (short text-post, under 150 chars, drive to YouTube)
- xPost (tweet-style, under 280 chars, include hook + write [LINK] exactly where the stream URL belongs)
- instagramCaption (engaging caption, under 300 chars with hashtags, drive to YouTube)
- kickPost (short viewer-engaging message, under 200 chars)
- urgency: "high" if viewers < 50, "medium" if 50-200, "low" if 200+
- viewerStrategy: one sentence on what to focus on
- viralHook: one sentence that could make someone share this stream right now`;
}

async function fetchLiveYouTubeContext(session: LiveGrowthSession): Promise<string> {
  try {
    const { fetchYouTubeVideoDetails } = await import("../youtube");
    if (!session.broadcastId || session.broadcastId.length < 5) return "";
    const details = await fetchYouTubeVideoDetails(session.channelId, session.broadcastId);
    if (!details) return "";
    return `Current YouTube Title: "${sanitizeForPrompt(details.title)}"
Current Description: "${details.description.substring(0, 300)}"
Current Tags: ${details.tags.slice(0, 10).join(", ")}
Views: ${details.viewCount} | Likes: ${details.likeCount} | Comments: ${sanitizeForPrompt(details.commentCount)}
Category: ${sanitizeForPrompt(details.categoryId)}`;
  } catch {
    return "";
  }
}

async function aiGenerateLiveUpdate(session: LiveGrowthSession): Promise<{
  optimizedTitle: string;
  optimizedDescription: string;
  optimizedTags: string[];
  discordPost: string;
  tiktokPost: string;
  xPost?: string;
  instagramCaption?: string;
  kickPost?: string;
  urgency: string;
  viewerStrategy: string;
  viralHook?: string;
} | null> {
  try {
    const systemPrompt = `You are River Osei — the Live Stream Growth Agent. Your sole mission: maximize concurrent viewers on every live stream. You activate the moment a stream goes live and work non-stop until the stream ends.

LIVE TITLE FORMULA:
🔴 LIVE: [SPECIFIC ACTIVITY] | [TRENDING HOOK] | PS5 Gaming
- Always start with 🔴 LIVE:
- Include the specific game/activity
- Include a viewer hook (milestone, challenge, "FIRST TIME", viewer count milestone)
- Keep under 100 characters
- Use pipe | separators

SOCIAL BLAST FORMULA:
- Discord: @everyone announcement, exciting, include what's happening; use [LINK] exactly where the stream URL should appear
- TikTok: Under 150 chars, text post format, drive to YouTube, link in bio

Return ONLY valid JSON, no markdown.`;

    const liveContext = await fetchLiveYouTubeContext(session);

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildPrompt(session, liveContext) },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    return parsed;
  } catch (err: any) {
    logger.warn(`[${session.userId}] AI live update failed: ${sanitizeForPrompt(err.message)}`);
    return null;
  }
}

async function getYouTubeChannelId(userId: string): Promise<number | null> {
  const [ch] = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);
  return ch?.id || null;
}

async function queueSocialPost(
  userId: string,
  platform: string,
  content: string,
  broadcastId: string
): Promise<void> {
  try {
    const youtubeUrl = `https://youtu.be/${broadcastId}`;
    const finalContent = content.replace("[LINK]", youtubeUrl);

    const targetPlatform = platform;

    await db.insert(autopilotQueue).values({
      userId,
      type: "live-social-blast",
      targetPlatform,
      content: finalContent,
      caption: finalContent,
      status: "pending",
      scheduledAt: new Date(),
      metadata: {
        contentType: "live_social_blast",
        aiModel: "gpt-4o-mini",
        humanScore: 90,
        isRecycled: false,
      },
    });
  } catch (err: any) {
    logger.warn(`[${userId}] Failed to queue ${sanitizeForPrompt(platform)} post: ${sanitizeForPrompt(err.message)}`);
  }
}

async function runSeoUpdate(session: LiveGrowthSession): Promise<void> {
  try {
    await recordHeartbeat("livestream-growth-agent", session.userId);

    const update = await aiGenerateLiveUpdate(session);
    if (!update) return;

    const channelId = await getYouTubeChannelId(session.userId);

    if (channelId && session.broadcastId && session.broadcastId.length > 0) {
      try {
        await updateYouTubeVideo(channelId, session.broadcastId, {
          title: update.optimizedTitle.slice(0, 100),
          description: update.optimizedDescription,
          tags: update.optimizedTags.slice(0, 30),
        });
        logger.info(`[${session.userId}] YouTube live title updated: "${sanitizeForPrompt(update.optimizedTitle.slice(0, 60))}..."`);
      } catch (ytErr: any) {
        logger.warn(`[${session.userId}] YouTube SEO update failed: ${sanitizeForPrompt(ytErr.message)}`);
      }
    }

    session.cycleCount++;

    if (update.urgency === "high" || session.cycleCount === 1) {
      await storage.createAgentActivity({
        userId: session.userId,
        agentId: "ai-livestream-growth",
        action: "live_seo_update",
        target: `Live stream: ${session.streamTitle?.slice(0, 50)}`,
        status: "completed",
        details: {
          description: `Updated live stream SEO — Viewers: ${sanitizeForPrompt(session.viewerCount)} | Urgency: ${sanitizeForPrompt(update.urgency)}`,
          impact: update.viewerStrategy,
          metrics: { viewerCount: session.viewerCount, cycleNumber: session.cycleCount },
        },
      });
    }

  } catch (err: any) {
    logger.warn(`[${session.userId}] SEO update cycle failed: ${sanitizeForPrompt(err.message)}`);
  }
}

async function runSocialBlast(session: LiveGrowthSession): Promise<void> {
  try {
    const blastEnabled = await isSocialBlastEnabled(session.userId);
    if (!blastEnabled) {
      logger.info(`[${session.userId}] Social blast skipped — disabled by user`);
      return;
    }

    const connected = await getConnectedPlatforms(session.userId);
    if (connected.size === 0) {
      logger.info(`[${session.userId}] Social blast skipped — no platforms connected`);
      return;
    }

    const update = await aiGenerateLiveUpdate(session);
    if (!update) return;

    const allPosts: Array<[string, string]> = [
      ["discord", update.discordPost],
      ["tiktok", update.tiktokPost],
      ["x", update.xPost || ""],
      ["instagram", update.instagramCaption || ""],
      ["kick", update.kickPost || ""],
    ];

    const eligiblePosts = allPosts.filter(([platform, content]) =>
      content && content.length > 0 && connected.has(platform)
    );

    let queued = 0;
    const platformNames: string[] = [];
    for (const [platform, content] of eligiblePosts) {
      await queueSocialPost(session.userId, platform, content, session.broadcastId);
      queued++;
      platformNames.push(platform);
    }

    const skipped = allPosts
      .filter(([p, c]) => c && c.length > 0 && !connected.has(p))
      .map(([p]) => p);

    logger.info(`[${session.userId}] Social blast queued — ${queued} posts to [${platformNames.join(", ")}] (viewers: ${sanitizeForPrompt(session.viewerCount)})${skipped.length > 0 ? ` | Skipped (not connected): ${skipped.join(", ")}` : ""}`);

  } catch (err: any) {
    logger.warn(`[${session.userId}] Social blast cycle failed: ${sanitizeForPrompt(err.message)}`);
  }
}

async function startLiveGrowthSession(
  userId: string,
  broadcastId: string,
  streamTitle: string
): Promise<void> {
  if (activeSessions.has(userId)) {
    stopLiveGrowthSession(userId);
  }

  const channelId = await getYouTubeChannelId(userId);
  if (!channelId) {
    logger.warn(`[${userId}] No YouTube channel found, cannot start live growth session`);
    return;
  }

  const session: LiveGrowthSession = {
    userId,
    broadcastId,
    channelId,
    streamTitle,
    viewerCount: 0,
    seoTimer: null,
    socialTimer: null,
    cycleCount: 0,
    startedAt: new Date(),
  };

  activeSessions.set(userId, session);
  logger.info(`[${userId}] Live growth session started — broadcast: ${broadcastId}`);

  await runSeoUpdate(session);
  await runSocialBlast(session);

  session.seoTimer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await runSeoUpdate(current);
  }, SEO_INTERVAL_MS);

  session.socialTimer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await runSocialBlast(current);
  }, SOCIAL_BLAST_INTERVAL_MS);

  logger.info(`[${userId}] Live growth session active — broadcast: ${broadcastId}, title: "${sanitizeForPrompt(streamTitle)}"`);
}

export function stopLiveGrowthSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;

  if (session.seoTimer) clearInterval(session.seoTimer);
  if (session.socialTimer) clearInterval(session.socialTimer);
  activeSessions.delete(userId);

  logger.info(`[${userId}] Live growth session stopped — ${sanitizeForPrompt(session.cycleCount)} SEO cycles ran`);
}

export function updateLiveGrowthViewerCount(userId: string, viewerCount: number): void {
  const session = activeSessions.get(userId);
  if (session) {
    session.viewerCount = viewerCount;
  }
}

export function getLiveGrowthStatus(userId: string): {
  active: boolean;
  viewerCount?: number;
  cycleCount?: number;
  startedAt?: Date;
  broadcastId?: string;
} {
  const session = activeSessions.get(userId);
  if (!session) return { active: false };
  return {
    active: true,
    viewerCount: session.viewerCount,
    cycleCount: session.cycleCount,
    startedAt: session.startedAt,
    broadcastId: session.broadcastId,
  };
}

export function initLivestreamGrowthAgent(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    const broadcastId = payload?.videoId || payload?.broadcastId || "";
    const streamTitle = payload?.title || payload?.streamTitle || "Live Stream";

    if (!userId) return;

    logger.info(`[${userId}] stream.started event received — activating Live Growth Agent`);

    setTimeout(async () => {
      try {
        await startLiveGrowthSession(userId, broadcastId, streamTitle);
      } catch (err: any) {
        logger.warn(`[${userId}] Failed to start live growth session: ${sanitizeForPrompt(err.message)}`);
      }
    }, 10_000);
  });

  onAgentEvent("stream.ended", async (event) => {
    const { userId } = event;
    if (!userId) return;

    const cycleCount = activeSessions.get(userId)?.cycleCount || 0;
    logger.info(`[${userId}] stream.ended event — stopping Live Growth Agent after ${cycleCount} cycles`);

    stopLiveGrowthSession(userId);
  });

  logger.info("Livestream Growth Agent event listeners registered");
}
