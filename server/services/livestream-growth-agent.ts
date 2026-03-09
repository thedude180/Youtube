import { db } from "../db";
import { channels, streams, autopilotQueue } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";
import { updateYouTubeVideo } from "../youtube";
import { recordHeartbeat } from "./engine-heartbeat";

const logger = {
  info: (msg: string) => console.log(`[livestream-growth] ${msg}`),
  warn: (msg: string) => console.warn(`[livestream-growth] WARN ${msg}`),
  error: (msg: string) => console.error(`[livestream-growth] ERROR ${msg}`),
};

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

function buildPrompt(session: LiveGrowthSession): string {
  const liveMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
  return `The streamer is LIVE right now. Here is the current situation:
- Stream title: "${session.streamTitle}"
- Current viewers: ${session.viewerCount}
- Stream running for: ${liveMinutes} minutes
- Cycle #${session.cycleCount + 1} (every 15 min)

Generate an optimized live stream update. Return valid JSON with:
- optimizedTitle (max 100 chars, start with 🔴 LIVE:, be specific about what's happening)
- optimizedDescription (full description with links section at bottom)
- optimizedTags (array of 15 strings — game name, genre, "live", "gaming", "ps5", specifics)
- discordPost (@everyone announcement, exciting, include context about what's happening)
- tiktokPost (short text-post, under 150 chars, drive to YouTube)
- urgency: "high" if viewers < 50, "medium" if 50-200, "low" if 200+
- viewerStrategy: one sentence on what to focus on`;
}

async function aiGenerateLiveUpdate(session: LiveGrowthSession): Promise<{
  optimizedTitle: string;
  optimizedDescription: string;
  optimizedTags: string[];
  discordPost: string;
  tiktokPost: string;
  urgency: string;
  viewerStrategy: string;
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
- Discord: @everyone announcement, exciting, include what's happening, [LINK] placeholder
- TikTok: Under 150 chars, text post format, drive to YouTube, link in bio

Return ONLY valid JSON, no markdown.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildPrompt(session) },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    return parsed;
  } catch (err: any) {
    logger.warn(`[${session.userId}] AI live update failed: ${err.message}`);
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
    logger.warn(`[${userId}] Failed to queue ${platform} post: ${err.message}`);
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
        logger.info(`[${session.userId}] YouTube live title updated: "${update.optimizedTitle.slice(0, 60)}..."`);
      } catch (ytErr: any) {
        logger.warn(`[${session.userId}] YouTube SEO update failed: ${ytErr.message}`);
      }
    }

    session.cycleCount++;

    await storage.createAgentActivity({
      userId: session.userId,
      agentId: "ai-livestream-growth",
      action: "live_seo_update",
      target: `Live stream: ${session.streamTitle?.slice(0, 50)}`,
      status: "completed",
      details: {
        description: `Updated live stream title to: "${update.optimizedTitle.slice(0, 60)}" | Viewers: ${session.viewerCount} | Urgency: ${update.urgency}`,
        impact: update.viewerStrategy,
        metrics: { viewerCount: session.viewerCount, cycleNumber: session.cycleCount },
      },
    });

    sendSSEEvent(session.userId, "livestream-growth", {
      action: "seo_updated",
      title: update.optimizedTitle,
      viewers: session.viewerCount,
      cycleCount: session.cycleCount,
    });

  } catch (err: any) {
    logger.warn(`[${session.userId}] SEO update cycle failed: ${err.message}`);
  }
}

async function runSocialBlast(session: LiveGrowthSession): Promise<void> {
  try {
    const update = await aiGenerateLiveUpdate(session);
    if (!update) return;

    const posts: Array<[string, string]> = [
      ["discord", update.discordPost],
      ["tiktok", update.tiktokPost],
    ];

    let queued = 0;
    for (const [platform, content] of posts) {
      if (content && content.length > 0) {
        await queueSocialPost(session.userId, platform, content, session.broadcastId);
        queued++;
      }
    }

    logger.info(`[${session.userId}] Social blast queued — ${queued} posts (viewers: ${session.viewerCount})`);

    await storage.createAgentActivity({
      userId: session.userId,
      agentId: "ai-livestream-growth",
      action: "social_blast",
      target: `${queued} platforms (X, Discord, TikTok)`,
      status: "completed",
      details: {
        description: `Blasted ${queued} social platforms to drive viewers to live stream`,
        impact: `Targeting ${session.viewerCount} current viewers → growth push`,
        metrics: { platformsBlasted: queued, currentViewers: session.viewerCount },
      },
    });

    sendSSEEvent(session.userId, "livestream-growth", {
      action: "social_blasted",
      platforms: queued,
      viewers: session.viewerCount,
    });

  } catch (err: any) {
    logger.warn(`[${session.userId}] Social blast cycle failed: ${err.message}`);
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

  sendSSEEvent(userId, "livestream-growth", {
    action: "session_started",
    broadcastId,
    streamTitle,
  });
}

export function stopLiveGrowthSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;

  if (session.seoTimer) clearInterval(session.seoTimer);
  if (session.socialTimer) clearInterval(session.socialTimer);
  activeSessions.delete(userId);

  logger.info(`[${userId}] Live growth session stopped — ${session.cycleCount} SEO cycles ran`);
  sendSSEEvent(userId, "livestream-growth", {
    action: "session_ended",
    totalCycles: session.cycleCount,
  });
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
        logger.warn(`[${userId}] Failed to start live growth session: ${err.message}`);
      }
    }, 10_000);
  });

  onAgentEvent("stream.ended", async (event) => {
    const { userId } = event;
    if (!userId) return;

    logger.info(`[${userId}] stream.ended event — stopping Live Growth Agent`);

    try {
      await storage.createAgentActivity({
        userId,
        agentId: "ai-livestream-growth",
        action: "stream_ended",
        target: "Live stream concluded",
        status: "completed",
        details: {
          description: `Stream ended — River Osei stood down after ${activeSessions.get(userId)?.cycleCount || 0} optimization cycles`,
          impact: "Live growth agent deactivated until next stream",
        },
      });
    } catch {}

    stopLiveGrowthSession(userId);
  });

  logger.info("Livestream Growth Agent event listeners registered");
}
