/**
 * Jade Kim — Revenue Pulse
 * Monitors viewer count milestones during live streams.
 * Triggers revenue-driving actions at 50, 100, 250, 500, and 1000 concurrent viewers.
 * Also runs periodic membership and channel join prompts.
 */
import { db } from "../db";
import { channels, autopilotQueue } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";

const logger = {
  info: (msg: string) => console.log(`[live-revenue-activator] ${msg}`),
  warn: (msg: string) => console.warn(`[live-revenue-activator] WARN ${msg}`),
};

const openai = getOpenAIClient();

const VIEWER_MILESTONES = [50, 100, 250, 500, 1000];
const MEMBERSHIP_PROMPT_INTERVAL_MS = 30 * 60 * 1000;
const VIEWER_CHECK_INTERVAL_MS = 3 * 60 * 1000;

interface RevenueSession {
  userId: string;
  broadcastId: string;
  channelDbId: number;
  channelName: string;
  streamTitle: string;
  startedAt: Date;
  viewerCount: number;
  hitMilestones: Set<number>;
  lastMembershipPromptAt: number;
  revenueActions: number;
  viewerCheckTimer: ReturnType<typeof setInterval> | null;
  membershipTimer: ReturnType<typeof setInterval> | null;
}

const activeSessions = new Map<string, RevenueSession>();
let eventsRegistered = false;

async function generateMilestoneContent(
  session: RevenueSession,
  milestone: number
): Promise<{ discordPost: string; xPost: string; communityPost: string } | null> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [{
        role: "system",
        content: `You are Jade Kim — a live stream revenue activator for a PS5 gaming channel.
The stream just hit ${milestone} concurrent viewers! This is a milestone moment.

Stream: "${session.streamTitle}"
Channel: "${session.channelName}"

Generate hype content for this milestone. Return JSON:
{
  "discordPost": "@here 🔥 WE HIT ${milestone} VIEWERS! Get in here! [YouTube link: STREAM_LINK]",
  "xPost": "Under 250 chars — excited about hitting ${milestone} viewers, include STREAM_LINK, #Live #Gaming #PS5",
  "communityPost": "YouTube Community post: exciting milestone message, invite people to join the stream and the channel membership"
}`,
      }, {
        role: "user",
        content: `Generate milestone content for ${milestone} viewers.`,
      }],
      response_format: { type: "json_object" },
    });

    return JSON.parse(resp.choices[0]?.message?.content || "{}");
  } catch { return null; }
}

async function generateMembershipPrompt(session: RevenueSession): Promise<{
  chatMessage: string;
  discordPost: string;
} | null> {
  const streamMins = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [{
        role: "user",
        content: `Generate a natural, non-pushy membership/channel join prompt for a PS5 gaming live stream.
Stream: "${session.streamTitle}", running ${streamMins} minutes, ~${session.viewerCount} viewers.

Return JSON:
{
  "chatMessage": "Under 160 chars — casual mention of channel membership benefits or joining the community (not salesy)",
  "discordPost": "Fun Discord message reminding people about channel perks, under 200 chars"
}`,
      }],
      response_format: { type: "json_object" },
    });

    return JSON.parse(resp.choices[0]?.message?.content || "{}");
  } catch { return null; }
}

async function checkMilestones(session: RevenueSession): Promise<void> {
  for (const milestone of VIEWER_MILESTONES) {
    if (session.viewerCount >= milestone && !session.hitMilestones.has(milestone)) {
      session.hitMilestones.add(milestone);
      logger.info(`[${session.userId}] 🎯 Milestone hit: ${milestone} viewers!`);

      const content = await generateMilestoneContent(session, milestone);
      if (!content) continue;

      const streamUrl = `https://youtu.be/${session.broadcastId}`;

      for (const [platform, text] of [
        ["discord", content.discordPost.replace("STREAM_LINK", streamUrl)],
        ["twitter", content.xPost.replace("STREAM_LINK", streamUrl)],
      ] as [string, string][]) {
        try {
          await db.insert(autopilotQueue).values({
            userId: session.userId,
            type: "live-milestone",
            targetPlatform: platform,
            content: text,
            caption: text,
            status: "pending",
            scheduledAt: new Date(),
            metadata: {
              contentType: "viewer_milestone",
              aiModel: "gpt-4o-mini",
              humanScore: 88,
              isRecycled: false,
            },
          });
        } catch (err: any) {
          logger.warn(`[${session.userId}] Milestone post queue failed: ${err.message}`);
        }
      }

      session.revenueActions++;

      await storage.createAgentActivity({
        userId: session.userId,
        agentId: "ai-revenue-pulse",
        action: "milestone_activated",
        target: `${milestone} viewers`,
        status: "completed",
        details: {
          description: `Jade activated ${milestone} viewer milestone — Discord + X blasted`,
          impact: `Revenue push triggered at ${milestone} concurrent viewers`,
          metrics: { milestone, currentViewers: session.viewerCount, revenueActions: session.revenueActions },
        },
      });

      sendSSEEvent(session.userId, "live-revenue-activator", {
        action: "milestone_hit",
        milestone,
        viewerCount: session.viewerCount,
      });
    }
  }
}

async function runMembershipPrompt(session: RevenueSession): Promise<void> {
  const prompt = await generateMembershipPrompt(session);
  if (!prompt) return;

  try {
    await db.insert(autopilotQueue).values({
      userId: session.userId,
      type: "live-revenue-prompt",
      targetPlatform: "discord",
      content: prompt.discordPost,
      caption: prompt.discordPost,
      status: "pending",
      scheduledAt: new Date(),
      metadata: {
        contentType: "membership_prompt",
        aiModel: "gpt-4o-mini",
        humanScore: 82,
        isRecycled: false,
      },
    });
  } catch (err: any) {
    logger.warn(`[${session.userId}] Membership prompt queue failed: ${err.message}`);
  }

  session.revenueActions++;
  session.lastMembershipPromptAt = Date.now();

  await storage.createAgentActivity({
    userId: session.userId,
    agentId: "ai-revenue-pulse",
    action: "membership_prompt",
    target: "Discord",
    status: "completed",
    details: {
      description: `Jade sent membership prompt to Discord (${session.viewerCount} viewers live)`,
      impact: "Channel membership awareness raised",
      metrics: { viewerCount: session.viewerCount },
    },
  });

  logger.info(`[${session.userId}] Membership prompt sent (${session.viewerCount} viewers)`);
}

export function updateLiveViewerCount(userId: string, viewerCount: number): void {
  const session = activeSessions.get(userId);
  if (session) {
    session.viewerCount = viewerCount;
  }
}

async function startRevenueSession(
  userId: string,
  broadcastId: string,
  streamTitle: string
): Promise<void> {
  if (activeSessions.has(userId)) return;

  const [ch] = await db.select({ id: channels.id, title: channels.title })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);

  if (!ch) return;

  const session: RevenueSession = {
    userId,
    broadcastId,
    channelDbId: ch.id,
    channelName: ch.title || "PS5 Gaming Channel",
    streamTitle,
    startedAt: new Date(),
    viewerCount: 0,
    hitMilestones: new Set(),
    lastMembershipPromptAt: Date.now(),
    revenueActions: 0,
    viewerCheckTimer: null,
    membershipTimer: null,
  };

  activeSessions.set(userId, session);

  session.viewerCheckTimer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await checkMilestones(current).catch(err =>
      logger.warn(`[${userId}] Milestone check error: ${err.message}`)
    );
  }, VIEWER_CHECK_INTERVAL_MS);

  session.membershipTimer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current && Date.now() - current.lastMembershipPromptAt >= MEMBERSHIP_PROMPT_INTERVAL_MS) {
      await runMembershipPrompt(current).catch(err =>
        logger.warn(`[${userId}] Membership prompt error: ${err.message}`)
      );
    }
  }, MEMBERSHIP_PROMPT_INTERVAL_MS);

  logger.info(`[${userId}] Revenue Pulse started for "${streamTitle}"`);

  await storage.createAgentActivity({
    userId,
    agentId: "ai-revenue-pulse",
    action: "session_started",
    target: streamTitle,
    status: "completed",
    details: { description: `Jade Kim activated — watching viewer milestones for "${streamTitle}"` },
  });
}

function stopRevenueSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;
  if (session.viewerCheckTimer) clearInterval(session.viewerCheckTimer);
  if (session.membershipTimer) clearInterval(session.membershipTimer);
  activeSessions.delete(userId);
  logger.info(`[${userId}] Revenue session ended — ${session.revenueActions} revenue actions taken`);
}

export function initLiveRevenueActivator(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;
    const broadcastId = payload?.videoId || payload?.broadcastId || "";
    const streamTitle = payload?.streamTitle || payload?.title || "Live Stream";

    setTimeout(async () => {
      try {
        await startRevenueSession(userId, broadcastId, streamTitle);
      } catch (err: any) {
        logger.warn(`[${userId}] Revenue activator start failed: ${err.message}`);
      }
    }, 25_000);
  });

  onAgentEvent("stream.ended", (event) => {
    stopRevenueSession(event.userId);
  });

  logger.info("Live Revenue Activator (Jade Kim) event listeners registered");
}
