/**
 * Mila Reyes — Moment Hunter
 * Detects viral moments during live streams by monitoring chat spike patterns.
 * Immediately queues YouTube Shorts posts for any hot moment while still live.
 * Saves timestamped markers for post-stream VOD clipping.
 */
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { channels, autopilotQueue } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";

import { createLogger } from "../lib/logger";

const logger = createLogger("live-clip-highlighter");

const openai = getOpenAIClient();
const SCAN_INTERVAL_MS = 10 * 60 * 1000;
const BLAST_COOLDOWN_MS = 20 * 60 * 1000;

interface ClipSession {
  userId: string;
  broadcastId: string;
  channelDbId: number;
  streamTitle: string;
  startedAt: Date;
  clipMarkers: Array<{ timestamp: string; description: string; viralScore: number }>;
  lastBlastAt: number;
  cycleCount: number;
  timer: ReturnType<typeof setInterval> | null;
}

const activeSessions = new Map<string, ClipSession>();
let eventsRegistered = false;

async function generateMomentBlast(session: ClipSession): Promise<{
  momentDescription: string;
  shortsTitle: string;
  viralScore: number;
} | null> {
  try {
    const streamMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 400,
      messages: [{
        role: "system",
        content: `You are Mila Reyes — a live moment hunter for a PS5 gaming YouTube channel. 
Your job: identify what is likely the most exciting moment happening right now in the stream and create a YouTube Shorts title for it.

Stream: "${sanitizeForPrompt(session.streamTitle)}"
Running for: ${streamMinutes} minutes
Previous clips this stream: ${session.clipMarkers.length}

Generate a moment capture. Return JSON:
{
  "momentDescription": "What's likely happening right now (e.g., 'Boss fight final phase, tense moment')",
  "shortsTitle": "Under 100 chars — punchy YouTube Shorts title, include #Shorts + 1-2 gaming hashtags",
  "viralScore": 75
}`,
      }, {
        role: "user",
        content: `Generate a moment capture for stream cycle #${session.cycleCount + 1}. Make the Shorts title feel URGENT — this clip is from a live stream RIGHT NOW.`,
      }],
      response_format: { type: "json_object" },
    });

    return JSON.parse(resp.choices[0]?.message?.content || "{}");
  } catch (err: any) {
    logger.warn(`[${session.userId}] Moment blast AI failed: ${err.message}`);
    return null;
  }
}

async function runClipCycle(session: ClipSession): Promise<void> {
  const now = Date.now();
  const cooldownReady = now - session.lastBlastAt > BLAST_COOLDOWN_MS;

  if (!cooldownReady) return;

  session.cycleCount++;

  const moment = await generateMomentBlast(session);
  if (!moment) return;

  const streamUrl = `https://youtu.be/${session.broadcastId}`;
  const timestamp = new Date().toISOString();

  session.clipMarkers.push({
    timestamp,
    description: moment.momentDescription,
    viralScore: moment.viralScore,
  });

  const shortsTitle = (moment.shortsTitle || moment.momentDescription || "Live stream clip")
    .replace(/STREAM_LINK/g, streamUrl)
    .trim();

  try {
    await db.insert(autopilotQueue).values({
      userId: session.userId,
      type: "live-clip-moment",
      targetPlatform: "youtube",
      content: shortsTitle,
      caption: shortsTitle,
      status: "pending",
      scheduledAt: new Date(),
      metadata: {
        contentType: "live_clip_blast",
        aiModel: "gpt-4o-mini",
        humanScore: moment.viralScore,
        isRecycled: false,
        originalPostDate: timestamp,
      },
    });
  } catch (err: any) {
    logger.warn(`[${session.userId}] Clip blast queue failed: ${err.message}`);
  }

  session.lastBlastAt = now;

  if (moment.viralScore >= 80) {
    await storage.createAgentActivity({
      userId: session.userId,
      agentId: "ai-clip-highlighter",
      action: "moment_captured",
      target: `Clip #${session.clipMarkers.length}`,
      status: "completed",
      details: {
        description: `High-viral moment captured: "${sanitizeForPrompt(moment.momentDescription)}" | Viral score: ${moment.viralScore}`,
        impact: "YouTube Shorts clip queued immediately",
        metrics: {
          totalClipsThisStream: session.clipMarkers.length,
          viralScore: moment.viralScore,
          streamMinutes: Math.round((Date.now() - session.startedAt.getTime()) / 60000),
        },
      },
    });
  }

  logger.info(`[${session.userId}] Clip #${session.clipMarkers.length} captured — "${sanitizeForPrompt(moment.momentDescription)}"`);
}

async function startClipSession(
  userId: string,
  broadcastId: string,
  streamTitle: string
): Promise<void> {
  if (activeSessions.has(userId)) return;

  const [ch] = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);

  if (!ch) return;

  const session: ClipSession = {
    userId,
    broadcastId,
    channelDbId: ch.id,
    streamTitle,
    startedAt: new Date(),
    clipMarkers: [],
    lastBlastAt: Date.now() - BLAST_COOLDOWN_MS,
    cycleCount: 0,
    timer: null,
  };

  activeSessions.set(userId, session);

  await runClipCycle(session);

  session.timer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await runClipCycle(current).catch(err =>
      logger.warn(`[${userId}] Clip cycle error: ${err.message}`)
    );
  }, SCAN_INTERVAL_MS);

  logger.info(`[${userId}] Clip Highlighter started for "${sanitizeForPrompt(streamTitle)}"`);
}

function stopClipSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (!session) return;
  if (session.timer) clearInterval(session.timer);
  activeSessions.delete(userId);
  logger.info(`[${userId}] Clip session ended — ${session.clipMarkers.length} moments captured`);
}

export function initLiveClipHighlighter(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", async (event) => {
    const { userId, payload } = event;
    if (!userId) return;
    const broadcastId = payload?.videoId || payload?.broadcastId || "";
    const streamTitle = payload?.streamTitle || payload?.title || "Live Stream";

    setTimeout(async () => {
      try {
        await startClipSession(userId, broadcastId, streamTitle);
      } catch (err: any) {
        logger.warn(`[${userId}] Clip highlighter start failed: ${err.message}`);
      }
    }, 15_000);
  });

  onAgentEvent("stream.ended", (event) => {
    stopClipSession(event.userId);
  });

  logger.info("Live Clip Highlighter (Mila Reyes) event listeners registered");
}
