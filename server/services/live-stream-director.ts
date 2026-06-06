/**
 * live-stream-director.ts
 *
 * The production director — master coordinator for the full live stream lifecycle.
 * Runs automatically the moment a stream is detected live and shuts down cleanly
 * when the stream ends.
 *
 * WHAT THE DIRECTOR DOES:
 *
 * ON STREAM START (fires ~30 s after live detection, so liveChatId is ready):
 *   1. Calls prepareLiveStream() → gets AI-generated title, description, pinned
 *      message, FAQ answers, and moderation rules
 *   2. Applies the generated title + description to the YouTube broadcast via
 *      liveBroadcasts.update (fixes the single biggest gap: metadata never applied)
 *   3. Posts the opening pinned message to YouTube Live Chat
 *   4. Starts the 5-minute director cycle
 *
 * DIRECTOR CYCLE (every 5 min while live):
 *   • Every 25–35 min (randomized per session): posts a "broadcast beat" — a
 *     short, on-brand message to keep viewers engaged (subscribe CTA, clip tease,
 *     hype check, schedule reminder). Complements stream-idle-engagement which
 *     only fires when chat goes quiet.
 *   • Emits a "director_heartbeat" SSE event so the dashboard always shows a
 *     live session summary without polling.
 *
 * ON STREAM END:
 *   • Stops the director cycle
 *   • Calls afterStreamCopilot() → queues Shorts from clip moments, queues the
 *     long-form replay, triggers the stream hype wave on the content schedule
 *   • Emits a final session summary SSE
 */

import { google } from "googleapis";
import { db } from "../db";
import { channels, streams } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getAuthenticatedClient } from "../youtube";
import { onAgentEvent } from "./agent-events";
import { sendSSEEvent } from "../routes/events";
import { isLiveActive } from "../lib/live-gate";
import { getOpenAIClient } from "../lib/openai";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import {
  isQuotaBreakerTripped,
  canAffordOperation,
  trackQuotaUsage,
  markQuotaErrorFromResponse,
} from "./youtube-quota-tracker";

const logger = createLogger("live-director");
const openai = getOpenAIClient();

// ── Session state ─────────────────────────────────────────────────────────────

interface DirectorSession {
  userId: string;
  streamId: number;
  streamTitle: string;
  gameName: string;
  channelDbId: number;
  liveChatId: string | null;
  broadcastId: string | null;
  startedAt: Date;
  beatsPosted: number;
  lastBeatAt: number;
  nextBeatGapMs: number;
  cycleTimer: ReturnType<typeof setInterval> | null;
  afterStreamFired: boolean;
}

const DIRECTOR_CYCLE_MS = 5 * 60 * 1000;
const BEAT_GAP_MIN_MS = 25 * 60 * 1000;
const BEAT_GAP_MAX_MS = 35 * 60 * 1000;
// Initial beat offset — don't post anything in first 20 min of stream
const INITIAL_BEAT_OFFSET_MS = 20 * 60 * 1000;

const activeSessions = new Map<string, DirectorSession>();
let eventsRegistered = false;

// ── YouTube API helpers ───────────────────────────────────────────────────────

async function getYouTubeClient(channelDbId: number) {
  const { oauth2Client } = await getAuthenticatedClient(channelDbId);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function applyBroadcastMetadata(
  yt: any,
  userId: string,
  broadcastId: string,
  title: string,
  description: string,
): Promise<boolean> {
  if (!broadcastId) return false;
  if (isQuotaBreakerTripped()) {
    logger.warn("[Director] Quota breaker tripped — skipping broadcast metadata update");
    return false;
  }
  try {
    // liveBroadcasts.update costs 50 quota units — only done once per stream start
    await yt.liveBroadcasts.update({
      part: ["snippet"],
      requestBody: {
        id: broadcastId,
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          scheduledStartTime: new Date().toISOString(),
        },
      },
    });
    // Track as a broadcast operation (50 units — same tier as liveBroadcasts.list/insert)
    await trackQuotaUsage(userId, "broadcast").catch(() => {});
    logger.info(`[Director] Broadcast metadata updated — title="${title.slice(0, 60)}"`);
    return true;
  } catch (err: any) {
    markQuotaErrorFromResponse(err);
    logger.warn(`[Director] liveBroadcasts.update failed (non-fatal): ${String(err?.message || err).slice(0, 120)}`);
    return false;
  }
}

async function postChatMessage(
  yt: any,
  userId: string,
  liveChatId: string,
  message: string,
): Promise<boolean> {
  if (isQuotaBreakerTripped()) return false;
  if (!await canAffordOperation(userId, "livechat").catch(() => false)) return false;
  try {
    await yt.liveChatMessages.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          liveChatId,
          type: "textMessageEvent",
          textMessageDetails: { messageText: message.slice(0, 200) },
        },
      },
    });
    await trackQuotaUsage(userId, "livechat").catch(() => {});
    return true;
  } catch (err: any) {
    markQuotaErrorFromResponse(err);
    logger.warn(`[Director] Chat post failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    return false;
  }
}

// ── Broadcast beats ───────────────────────────────────────────────────────────
// Scheduled production messages — on-brand, casual, never spammy.
// These complement stream-idle-engagement (which fires on chat silence)
// with proactive milestone-based posts the idle engine doesn't cover.

const BEAT_TEMPLATES: Array<(game: string, durMin: number) => string> = [
  (game, _d) => `enjoying the stream? subscribe so you don't miss the clips from today's session`,
  (game, d)  => `been live ${d} min on ${game}. best moments get clipped into Shorts — subscribe to catch them`,
  (game, _d) => `clips from this session drop as Shorts over the next few days. subscribe and turn on notifications`,
  (game, _d) => `drop a 🔥 in chat if you're enjoying the ${game} gameplay`,
  (_g,   d)  => `${d} min in — what's been your favourite moment so far? drop it in chat`,
  (game, _d) => `pure ${game} — no commentary, just gameplay. share the stream if you know someone who'd enjoy it`,
  (_g,   _d) => `full VOD from this session drops in the next day or two. subscribe so it shows up in your feed`,
  (game, d)  => `${d} min of ${game} and still going. appreciate everyone watching 🙏`,
];

async function generateBroadcastBeat(
  gameName: string,
  durMin: number,
  beatIndex: number,
): Promise<string> {
  // Every 3rd beat, use AI for variety; otherwise rotate deterministic templates
  if (beatIndex % 3 === 2) {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 60,
        temperature: 0.9,
        messages: [{
          role: "user",
          content: `You're a gamer hosting a no-commentary PS5 live stream playing ${sanitizeForPrompt(gameName, 50)}. The stream has been live ${durMin} minutes. Write a SHORT, casual chat message (under 180 chars) to engage viewers. Pick one of: subscribe reminder, clip tease, hype check, fun trivia about ${sanitizeForPrompt(gameName, 40)}, or viewer engagement prompt. Sound like a real person, not a bot. No emoji spam, 1 emoji max. Output ONLY the message text.`,
        }],
      });
      const ai = resp.choices[0]?.message?.content?.trim();
      if (ai && ai.length > 10 && ai.length < 200) return ai;
    } catch {
      // fall through to template
    }
  }

  const template = BEAT_TEMPLATES[beatIndex % BEAT_TEMPLATES.length];
  return template(gameName, durMin);
}

// ── Director cycle ────────────────────────────────────────────────────────────

async function runDirectorCycle(session: DirectorSession): Promise<void> {
  if (!isLiveActive()) {
    logger.debug(`[Director] ${session.userId.slice(0, 8)} — not live, skipping cycle`);
    return;
  }

  const now = Date.now();
  const durMs = now - session.startedAt.getTime();
  const durMin = Math.round(durMs / 60_000);

  // Emit session heartbeat via SSE (dashboard stays live without polling)
  sendSSEEvent(session.userId, "director_heartbeat", {
    streamId: session.streamId,
    streamTitle: session.streamTitle,
    gameName: session.gameName,
    durationMin: durMin,
    beatsPosted: session.beatsPosted,
    isActive: true,
  });

  // Broadcast beat — rate-limited, initial 20-min silence respected
  const sinceStart = now - session.startedAt.getTime();
  const sinceLastBeat = now - session.lastBeatAt;

  if (
    session.liveChatId &&
    session.channelDbId > 0 &&
    sinceStart >= INITIAL_BEAT_OFFSET_MS &&
    sinceLastBeat >= session.nextBeatGapMs
  ) {
    try {
      const yt = await getYouTubeClient(session.channelDbId);
      const beat = await generateBroadcastBeat(session.gameName, durMin, session.beatsPosted);
      const posted = await postChatMessage(yt, session.userId, session.liveChatId, beat);
      if (posted) {
        session.beatsPosted++;
        session.lastBeatAt = now;
        // Randomize next beat gap: 25–35 min
        session.nextBeatGapMs =
          BEAT_GAP_MIN_MS + Math.floor(Math.random() * (BEAT_GAP_MAX_MS - BEAT_GAP_MIN_MS));
        logger.info(
          `[Director] Broadcast beat #${session.beatsPosted} posted — next in ~${Math.round(session.nextBeatGapMs / 60_000)} min`,
        );
      }
    } catch (err: any) {
      logger.warn(`[Director] Broadcast beat failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }
}

// ── Stream lifecycle ──────────────────────────────────────────────────────────

async function onStreamStarted(
  userId: string,
  payload: {
    streamTitle?: string;
    gameName?: string;
    videoId?: string;
    liveChatId?: string;
    platform?: string;
  },
): Promise<void> {
  if (activeSessions.has(userId)) {
    logger.info(`[Director] Session already active for ${userId.slice(0, 8)} — skipping duplicate start`);
    return;
  }

  // Resolve the live stream DB record
  const [stream] = await db
    .select()
    .from(streams)
    .where(and(eq(streams.userId, userId), eq(streams.status, "live")))
    .orderBy(desc(streams.startedAt))
    .limit(1)
    .catch(() => [] as typeof streams.$inferSelect[]);

  // Resolve the YouTube channel DB record
  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1)
    .catch(() => [] as typeof channels.$inferSelect[]);

  const streamId     = stream?.id ?? 0;
  const streamTitle  = payload.streamTitle ?? stream?.title ?? "Live Stream";
  const gameName     = stream?.category ?? payload.gameName ?? "Gaming";
  const channelDbId  = ch?.id ?? 0;
  const liveChatId   = payload.liveChatId ?? null;
  const broadcastId  = payload.videoId ?? null;

  logger.info(
    `[Director] stream.started — game="${gameName}" streamId=${streamId} ` +
    `liveChatId=${liveChatId ? "✅" : "❌"} broadcastId=${broadcastId ? "✅" : "❌"}`,
  );

  // ── Step 1: Generate pre-stream preparation package ───────────────────────
  let prep: any = null;
  if (streamId > 0) {
    try {
      const { prepareLiveStream } = await import("./youtube-live-copilot");
      prep = await prepareLiveStream(userId, streamId);
      logger.info(
        `[Director] Pre-stream prep complete — title="${String(prep?.title || "").slice(0, 60)}"`,
      );
    } catch (err: any) {
      logger.warn(`[Director] prepareLiveStream failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  // ── Step 2: Apply title + description to the YouTube broadcast ────────────
  if (broadcastId && channelDbId > 0 && prep?.title && prep?.description) {
    try {
      const yt = await getYouTubeClient(channelDbId);
      await applyBroadcastMetadata(yt, userId, broadcastId, prep.title, prep.description);
    } catch (err: any) {
      logger.warn(`[Director] Broadcast metadata apply failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  // ── Step 3: Post opening pinned message to live chat ─────────────────────
  let pinnedPosted = false;
  if (liveChatId && channelDbId > 0 && prep?.pinnedMessage) {
    try {
      const yt = await getYouTubeClient(channelDbId);
      pinnedPosted = await postChatMessage(yt, userId, liveChatId, prep.pinnedMessage);
      if (pinnedPosted) {
        logger.info(`[Director] Opening pinned message posted to live chat`);
      }
    } catch (err: any) {
      logger.warn(`[Director] Pinned message post failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  // ── Step 4: Start director cycle ─────────────────────────────────────────
  const session: DirectorSession = {
    userId,
    streamId,
    streamTitle,
    gameName,
    channelDbId,
    liveChatId,
    broadcastId,
    startedAt: new Date(),
    beatsPosted: 0,
    lastBeatAt: Date.now(), // reset after INITIAL_BEAT_OFFSET_MS guard
    nextBeatGapMs:
      BEAT_GAP_MIN_MS + Math.floor(Math.random() * (BEAT_GAP_MAX_MS - BEAT_GAP_MIN_MS)),
    cycleTimer: null,
    afterStreamFired: false,
  };

  activeSessions.set(userId, session);

  session.cycleTimer = setInterval(async () => {
    const current = activeSessions.get(userId);
    if (current) await runDirectorCycle(current).catch(() => {});
  }, DIRECTOR_CYCLE_MS);

  sendSSEEvent(userId, "director_heartbeat", {
    type: "session_started",
    streamId,
    streamTitle,
    gameName,
    prepGenerated: !!prep,
    metadataApplied: !!(broadcastId && prep?.title),
    pinnedMessagePosted: pinnedPosted,
  });

  logger.info(
    `[Director] Production session started — beats every ~30 min, heartbeat every 5 min`,
  );
}

async function onStreamEnded(userId: string, streamId?: number): Promise<void> {
  const session = activeSessions.get(userId);

  if (session) {
    const durMs = Date.now() - session.startedAt.getTime();
    const durMin = Math.round(durMs / 60_000);

    if (session.cycleTimer) clearInterval(session.cycleTimer);
    activeSessions.delete(userId);

    logger.info(
      `[Director] Session ended — duration=${durMin}min beats=${session.beatsPosted} streamId=${session.streamId}`,
    );

    sendSSEEvent(userId, "director_heartbeat", {
      type: "session_ended",
      streamId: session.streamId,
      durationMin: durMin,
      beatsPosted: session.beatsPosted,
      isActive: false,
    });
  }

  // Fire afterStreamCopilot — queues Shorts from clip moments, long-form, hype wave
  const resolvedStreamId = streamId ?? session?.streamId ?? 0;
  const alreadyFired = session?.afterStreamFired ?? false;

  if (resolvedStreamId > 0 && !alreadyFired) {
    if (session) session.afterStreamFired = true;
    try {
      const { afterStreamCopilot } = await import("./youtube-live-copilot");
      const result: any = await afterStreamCopilot(userId, resolvedStreamId);
      logger.info(
        `[Director] afterStreamCopilot complete — ` +
        `shorts=${result?.shortsQueued ?? "?"} lf=${result?.longFormQueued ?? "?"} moments=${result?.clipMomentsFound ?? "?"}`,
      );
    } catch (err: any) {
      logger.warn(
        `[Director] afterStreamCopilot failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`,
      );
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getDirectorStatus(userId: string) {
  const session = activeSessions.get(userId);
  if (!session) return { isActive: false };
  const durMs = Date.now() - session.startedAt.getTime();
  return {
    isActive: true,
    streamId: session.streamId,
    streamTitle: session.streamTitle,
    gameName: session.gameName,
    durationMin: Math.round(durMs / 60_000),
    beatsPosted: session.beatsPosted,
    nextBeatInMin: Math.max(
      0,
      Math.round(
        (session.lastBeatAt + session.nextBeatGapMs - Date.now()) / 60_000,
      ),
    ),
    liveChatId: session.liveChatId ? "present" : "absent",
    broadcastId: session.broadcastId ? "present" : "absent",
  };
}

export function initLiveStreamDirector(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", (event) => {
    // Small delay — let the live detection system finish caching the liveChatId
    // before we try to post to it (live-chat-agent uses 30s delay too).
    setTimeout(() => {
      onStreamStarted(event.userId, event.payload ?? {}).catch((err: any) => {
        logger.error(
          `[Director] onStreamStarted error: ${String(err?.message || err).slice(0, 100)}`,
        );
      });
    }, 45_000);
  });

  onAgentEvent("stream.ended", (event) => {
    const streamId = (event.payload as any)?.streamId ?? undefined;
    onStreamEnded(event.userId, streamId).catch((err: any) => {
      logger.error(
        `[Director] onStreamEnded error: ${String(err?.message || err).slice(0, 100)}`,
      );
    });
  });

  logger.info("[Director] Live stream director initialized — watching for stream events");
}
