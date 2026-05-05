/**
 * Devon Hall — Raid Scout & Network Builder
 * Maintains an updated raid-ready list throughout the stream.
 * Delivers the final ranked list the moment the stream ends.
 * Uses AI to identify channels with the highest audience overlap and networking value.
 */
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";

import { createLogger } from "../lib/logger";

const logger = createLogger("live-raid-scout");

const openai = getOpenAIClient();
const SCOUT_INTERVAL_MS = 30 * 60 * 1000;

interface RaidTarget {
  channelName: string;
  estimatedViewers: string;
  audienceOverlap: string;
  reason: string;
  networkingValue: "high" | "medium" | "low";
  raidScore: number;
}

interface RaidSession {
  userId: string;
  channelDbId: number;
  channelName: string;
  streamTitle: string;
  startedAt: Date;
  raidList: RaidTarget[];
  lastScoutAt: number;
  updateCount: number;
  timer: ReturnType<typeof setInterval> | null;
}

const activeSessions = new Map<string, RaidSession>();
let eventsRegistered = false;

async function generateRaidList(session: RaidSession): Promise<RaidTarget[]> {
  const streamMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [{
        role: "system",
        content: `You are Devon Hall — a live stream raid scout and network builder for a PS5 gaming channel.
Your job: identify the best raid targets at the end of this stream.

Channel: "${sanitizeForPrompt(session.channelName)}"
Stream: "${sanitizeForPrompt(session.streamTitle)}"
Stream duration: ${streamMinutes} minutes

Generate a ranked list of 5 raid target recommendations. Consider:
- Channels with similar PS5 gaming audiences
- Channels currently ending their streams (so the raid audience stays together)
- Channels that would benefit from and appreciate the raid (mutual networking)
- A mix of sizes: 1 large (send to grow your network), 2 medium (natural fit), 2 small (build loyalty)

Return JSON:
{
  "raidTargets": [
    {
      "channelName": "ExampleGamer",
      "estimatedViewers": "50-150",
      "audienceOverlap": "PS5 players, action/RPG fans",
      "reason": "Playing Elden Ring, perfect audience match",
      "networkingValue": "high",
      "raidScore": 92
    }
  ],
  "raidStrategy": "One sentence on the overall raid approach for tonight"
}`,
      }, {
        role: "user",
        content: `Generate the raid list for update #${session.updateCount + 1}. Make recommendations specific and actionable.`,
      }],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    return (parsed.raidTargets as RaidTarget[]) || [];
  } catch (err: any) {
    logger.warn(`[${session.userId}] Raid list AI failed: ${sanitizeForPrompt(err.message)}`);
    return [];
  }
}

async function runScoutCycle(session: RaidSession): Promise<void> {
  session.updateCount++;

  const targets = await generateRaidList(session);
  if (targets.length === 0) return;

  session.raidList = targets.sort((a, b) => b.raidScore - a.raidScore);
  session.lastScoutAt = Date.now();

  logger.info(`[${session.userId}] Raid list updated — top: ${targets[0]?.channelName}, ${targets.length} targets`);
}

async function deliverFinalRaidList(session: RaidSession): Promise<void> {
  if (session.raidList.length === 0) return;

  const top = session.raidList[0];
  const listText = session.raidList
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${sanitizeForPrompt(t.channelName)} (${sanitizeForPrompt(t.estimatedViewers)} viewers) — ${sanitizeForPrompt(t.reason)}`)
    .join("\n");

  const notificationMessage = `🎯 RAID TARGETS READY\n\nTop pick: ${sanitizeForPrompt(top.channelName)}\n${sanitizeForPrompt(top.reason)}\n\nFull list:\n${listText}`;

  try {
    await storage.createNotification({
      userId: session.userId,
      type: "raid_scout",
      title: `Raid ${sanitizeForPrompt(top.channelName)}? Devon's raid list is ready`,
      message: notificationMessage,
      severity: "info",
    });
  } catch {}

  // DISABLED: Twitch raid execution — YouTube-only mode.
  logger.info(`[${session.userId}] Twitch raid execution skipped — YouTube-only mode`);

  await storage.createAgentActivity({
    userId: session.userId,
    agentId: "ai-raid-scout",
    action: "raid_list_delivered",
    target: top.channelName,
    status: "completed",
    details: {
      description: `Devon delivered final raid recommendations — ${session.raidList.length} targets, top pick: ${sanitizeForPrompt(top.channelName)}`,
      impact: "Raid-ready — execute now for maximum audience growth",
      metrics: { targetsReady: session.raidList.length, streamDurationMins: Math.round((Date.now() - session.startedAt.getTime()) / 60000) },
    },
  });

  sendSSEEvent(session.userId, "live-raid-scout", {
    action: "raid_list_final",
    raidList: session.raidList.slice(0, 5),
    topTarget: top.channelName,
  });
}

async function startRaidSession(
  userId: string,
  streamTitle: string
): Promise<void> {
  if (activeSessions.has(userId)) return;

  const [ch] = await db.select({ id: channels.id, channelName: channels.channelName })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);

  if (!ch) return;

  const session: RaidSession = {
    userId,
    channelDbId: ch.id,
    channelName: ch.channelName || "PS5 Gaming Channel",
    streamTitle,
    startedAt: new Date(),
    raidList: [],
    lastScoutAt: 0,
    updateCount: 0,
    timer: null,
  };

  activeSessions.set(userId, session);

  await runScoutCycle(session);

  session.timer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await runScoutCycle(current).catch(err =>
      logger.warn(`[${userId}] Scout cycle error: ${sanitizeForPrompt(err.message)}`)
    );
  }, SCOUT_INTERVAL_MS);

  logger.info(`[${userId}] Raid Scout started for "${sanitizeForPrompt(streamTitle)}"`);
}

async function stopRaidSession(userId: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (!session) return;
  if (session.timer) clearInterval(session.timer);
  activeSessions.delete(userId);

  await deliverFinalRaidList(session).catch(err =>
    logger.warn(`[${userId}] Final raid list delivery failed: ${sanitizeForPrompt(err.message)}`)
  );

  logger.info(`[${userId}] Raid session ended — ${session.raidList.length} targets ready`);
}

export function initLiveRaidScout(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;
    const streamTitle = payload?.streamTitle || payload?.title || "Live Stream";

    setTimeout(async () => {
      try {
        await startRaidSession(userId, streamTitle);
      } catch (err: any) {
        logger.warn(`[${userId}] Raid scout start failed: ${sanitizeForPrompt(err.message)}`);
      }
    }, 20_000);
  });

  onAgentEvent("stream.ended", async (event) => {
    await stopRaidSession(event.userId).catch(err =>
      logger.warn(`[${event.userId}] Raid session stop failed: ${sanitizeForPrompt(err.message)}`)
    );
  });

  logger.info("Live Raid Scout (Devon Hall) event listeners registered");
}
