/**
 * live-stream-director.ts
 *
 * The production director — master coordinator for the full live stream lifecycle.
 * Runs automatically the moment a stream is detected live and shuts down cleanly
 * when the stream ends.
 *
 * WHAT THE DIRECTOR DOES:
 *
 * ON STREAM START (fires 45 s after live detection, so liveChatId is cached):
 *   1. Calls prepareLiveStream() → gets AI-generated title, description, pinned
 *      message, FAQ answers, and moderation rules
 *   2. Applies the generated title + description to the YouTube broadcast via
 *      liveBroadcasts.update (1 time, 50 quota units)
 *   3. Posts the opening pinned message to YouTube Live Chat
 *   4. Starts the 5-minute director cycle
 *
 * DIRECTOR CYCLE (every 5 min while live):
 *   a) VIEWER ANALYTICS (every 20 min) — fetches concurrentViewers via
 *      videos.list/liveStreamingDetails (1 quota unit — very cheap).
 *      If viewership is declining (>20% drop) or stagnant AND stream has been
 *      live >30 min → generates a fresher, more clickable title via AI and
 *      updates the broadcast via liveBroadcasts.update. Max 3 refreshes/stream.
 *   b) BROADCAST BEATS (every 25–35 min, randomized) — posts short on-brand
 *      messages to chat: subscribe CTAs, clip teasers, hype checks, schedule
 *      reminders. Complements stream-idle-engagement (which fires on silence).
 *   c) SSE HEARTBEAT — emits director_heartbeat so the dashboard always shows
 *      live session stats (viewer count, title version, beats posted).
 *
 * ON STREAM END:
 *   1. Stops the director cycle
 *   2. Calls afterStreamCopilot() → queues Shorts from clip moments, queues
 *      the long-form replay, triggers the stream hype wave
 *   3. Runs post-stream VOD optimization:
 *      - Fetches channel CTR benchmark
 *      - Generates analytics-driven VOD title + description via AI
 *      - Generates optimized thumbnail concept and stores it in the DB
 *   4. Emits a final session summary SSE
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
import { storage } from "../storage";
// Quota tracker removed — all live stream writes now go through InnerTube
// (innerTubeSendChat, innerTubeUpdateMetadata) which carry zero v3 quota cost.

const logger = createLogger("live-director");
const openai = getOpenAIClient();

// ── Session state ─────────────────────────────────────────────────────────────

interface ViewerSample {
  ts: number;
  count: number;
}

interface DirectorSession {
  userId: string;
  streamId: number;
  streamTitle: string;
  gameName: string;
  channelDbId: number;
  liveChatId: string | null;
  broadcastId: string | null;
  startedAt: Date;
  // Broadcast beats
  beatsPosted: number;
  lastBeatAt: number;
  nextBeatGapMs: number;
  // Viewer analytics + title refresh
  viewerHistory: ViewerSample[];
  titleRefreshCount: number;
  lastAnalyticsAt: number;
  lastTitleRefreshAt: number;
  currentTitle: string;
  peakViewers: number;
  // Run watcher — detects sustained momentum and amplifies it
  consecutiveGrowthSamples: number;
  runActive: boolean;
  lastRunDeclaredAt: number;
  runStartViewers: number;
  // Lifecycle
  cycleTimer: ReturnType<typeof setInterval> | null;
  afterStreamFired: boolean;
}

const DIRECTOR_CYCLE_MS              = 5 * 60 * 1000;   // 5 min cycle
const BEAT_GAP_MIN_MS                = 25 * 60 * 1000;  // 25 min min between beats
const BEAT_GAP_MAX_MS                = 35 * 60 * 1000;  // 35 min max
const INITIAL_BEAT_OFFSET_MS         = 20 * 60 * 1000;  // silent first 20 min
const ANALYTICS_INTERVAL_MS          = 20 * 60 * 1000;  // viewer check every 20 min
const MIN_TITLE_REFRESH_INTERVAL_MS  = 60 * 60 * 1000;  // min 1 h between title refreshes (no hard cap — works for 12h+ streams)
const VIEWER_HISTORY_MAX_SAMPLES     = 72;               // 72 × 20 min = 24 h ring buffer
const VIEWER_DROP_THRESHOLD          = 0.80;             // >20% drop triggers a recovery refresh
const VIRAL_SURGE_THRESHOLD          = 1.50;             // ≥50% growth vs 40 min ago = already viral
const MIN_STREAM_AGE_FOR_REFRESH_MS  = 30 * 60 * 1000;  // no refresh in first 30 min
// Run watcher
const RUN_CONSECUTIVE_SAMPLES        = 3;                // 3 positive samples = 60 min of sustained growth
const RUN_MIN_SAMPLE_GROWTH          = 1.05;             // each sample must show ≥5% growth to count
const RUN_COOLDOWN_MS                = 2 * 60 * 60 * 1000; // 2h before next run can be declared
const RUN_BEAT_GAP_MS                = 15 * 60 * 1000;  // tighter beats (15 min) while on a run

const activeSessions = new Map<string, DirectorSession>();
let eventsRegistered = false;

// ── YouTube API helpers ───────────────────────────────────────────────────────

async function getYouTubeClient(channelDbId: number) {
  const { oauth2Client } = await getAuthenticatedClient(channelDbId);
  return google.youtube({ version: "v3", auth: oauth2Client });
}

/** Resolve the raw OAuth2 access token for a channel — used by InnerTube calls. */
async function getChannelAccessToken(channelDbId: number): Promise<string | null> {
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    return (oauth2Client.credentials as any).access_token as string | null;
  } catch {
    return null;
  }
}

async function applyBroadcastMetadata(
  accessToken: string | null,
  broadcastId: string,
  title: string,
  description?: string,
): Promise<boolean> {
  if (!broadcastId || !accessToken) return false;
  // InnerTube: Studio API (0 quota) with v3 fallback that bypasses our breaker
  const { innerTubeUpdateMetadata } = await import("../lib/innertube-live");
  return innerTubeUpdateMetadata(accessToken, broadcastId, title, description);
}

async function postChatMessage(
  accessToken: string | null,
  liveChatId: string,
  message: string,
): Promise<boolean> {
  if (!accessToken || !liveChatId) return false;
  // InnerTube: live_chat/send_message (0 quota — never blocked by quota breaker)
  const { innerTubeSendChat } = await import("../lib/innertube-live");
  return innerTubeSendChat(accessToken, liveChatId, message);
}

// ── Viewer analytics + mid-stream title refresh ───────────────────────────────

async function fetchConcurrentViewers(
  yt: any,
  broadcastId: string,
): Promise<number> {
  // 1 v3 quota unit per call, every 20 min — never gated by quota breaker.
  // Losing viewer telemetry during a live stream is unacceptable.
  try {
    const res = await yt.videos.list({
      part: ["liveStreamingDetails"],
      id: [broadcastId],
    });
    const details = res.data.items?.[0]?.liveStreamingDetails;
    return parseInt(details?.concurrentViewers || "0", 10) || 0;
  } catch {
    return 0;
  }
}

async function generateOptimizedTitle(
  gameName: string,
  originalTitle: string,
  currentViewers: number,
  durMin: number,
  prevViewers: number,
): Promise<string | null> {
  try {
    const trend = prevViewers > 0
      ? currentViewers >= prevViewers ? "growing" : "declining"
      : "stable";

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 80,
      temperature: 0.85,
      messages: [{
        role: "user",
        content: `You manage a YouTube live stream title for a no-commentary PS5 ${sanitizeForPrompt(gameName, 50)} channel.

Current stream title: "${sanitizeForPrompt(originalTitle, 120)}"
Stream duration: ${durMin} minutes live
Viewer trend: ${trend} (${currentViewers} viewers now, was ${prevViewers})

Rewrite the title to attract more clicks and viewers. Rules:
- Under 100 characters
- Include the game name (${sanitizeForPrompt(gameName, 30)})
- Add something that creates curiosity or urgency (e.g. "INSANE match", "comeback", "ranked grind", a score/stat if relevant, "can't stop", "going for X")
- Keep it authentic — no clickbait that misrepresents the stream
- Do NOT include "LIVE" at the start — YouTube already shows that badge
- Output ONLY the new title, nothing else`,
      }],
    });

    const title = resp.choices[0]?.message?.content?.trim();
    if (title && title.length > 5 && title.length <= 100) return title;
    return null;
  } catch {
    return null;
  }
}

async function generateViralSurgeTitle(
  gameName: string,
  currentTitle: string,
  currentViewers: number,
  prevViewers: number,
  durMin: number,
): Promise<string | null> {
  try {
    const growthPct = Math.round(((currentViewers - prevViewers) / Math.max(prevViewers, 1)) * 100);
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 80,
      temperature: 0.9,
      messages: [{
        role: "user",
        content: `You manage a YouTube live stream title for a no-commentary PS5 ${sanitizeForPrompt(gameName, 50)} channel.

The stream is SURGING right now — viewership just jumped +${growthPct}% in 40 minutes (${prevViewers} → ${currentViewers} viewers).
Current title: "${sanitizeForPrompt(currentTitle, 120)}"
Stream has been live ${durMin} minutes.

Rewrite the title to ride this momentum and convert the algorithm's push into new subscribers. Rules:
- Under 100 characters
- Include the game name (${sanitizeForPrompt(gameName, 30)})
- Convey that something exciting is happening RIGHT NOW (e.g. "this session is going crazy", "momentum building", "on a run", "can't stop", "insane form", a specific hype stat if relevant)
- Energy should feel genuine, not manufactured — this is real growth happening live
- Do NOT start with "LIVE" — YouTube already shows that badge
- Output ONLY the new title, nothing else`,
      }],
    });
    const title = resp.choices[0]?.message?.content?.trim();
    if (title && title.length > 5 && title.length <= 100) return title;
    return null;
  } catch {
    return null;
  }
}

async function checkViewerMetrics(session: DirectorSession): Promise<void> {
  const now = Date.now();
  if (now - session.lastAnalyticsAt < ANALYTICS_INTERVAL_MS) return;
  if (!session.broadcastId || session.channelDbId === 0) return;

  const streamAge = now - session.startedAt.getTime();
  session.lastAnalyticsAt = now;

  let viewers = 0;
  try {
    const yt = await getYouTubeClient(session.channelDbId);
    viewers = await fetchConcurrentViewers(yt, session.broadcastId!);
  } catch { return; }

  // Track peak viewers
  if (viewers > session.peakViewers) session.peakViewers = viewers;

  // Record sample (ring buffer — VIEWER_HISTORY_MAX_SAMPLES × 20 min = 24 h capacity)
  session.viewerHistory.push({ ts: now, count: viewers });
  if (session.viewerHistory.length > VIEWER_HISTORY_MAX_SAMPLES) session.viewerHistory.shift();

  const prevSample = session.viewerHistory[session.viewerHistory.length - 3]; // ~40 min ago
  const prevViewers = prevSample?.count ?? viewers;

  const sinceLastRefresh = now - session.lastTitleRefreshAt;
  const cooldownRemainMin = Math.max(0, Math.round((MIN_TITLE_REFRESH_INTERVAL_MS - sinceLastRefresh) / 60_000));
  logger.info(
    `[Director] Viewer check — ${viewers} live (prev: ${prevViewers}, peak: ${session.peakViewers}, ` +
    `refreshes: ${session.titleRefreshCount}, cooldown: ${cooldownRemainMin}min)`,
  );

  const isSurging  = prevViewers > 5 && viewers >= prevViewers * VIRAL_SURGE_THRESHOLD;
  const isDeclining = prevViewers > 5 && viewers < prevViewers * VIEWER_DROP_THRESHOLD;

  sendSSEEvent(session.userId, "director_heartbeat", {
    type: "viewer_update",
    streamId: session.streamId,
    concurrentViewers: viewers,
    peakViewers: session.peakViewers,
    viewerTrend: isSurging ? "surging" : isDeclining ? "declining" : "stable",
    titleRefreshCount: session.titleRefreshCount,
    cooldownRemainMin,
  });

  // Bail out if either shared gate is not met
  const canRefresh =
    streamAge >= MIN_STREAM_AGE_FOR_REFRESH_MS &&
    sinceLastRefresh >= MIN_TITLE_REFRESH_INTERVAL_MS &&
    !!session.broadcastId;

  if (!canRefresh) return;

  const durMin = Math.round(streamAge / 60_000);
  let newTitle: string | null = null;
  let trigger: "viral_surge" | "viewer_decline" | null = null;

  if (isSurging) {
    // Ride the wave — generate a momentum-amplifying title
    newTitle = await generateViralSurgeTitle(
      session.gameName,
      session.currentTitle,
      viewers,
      prevViewers,
      durMin,
    );
    if (newTitle) trigger = "viral_surge";
  } else if (isDeclining) {
    // Recovery — generate a curiosity/urgency title to pull viewers back
    newTitle = await generateOptimizedTitle(
      session.gameName,
      session.currentTitle,
      viewers,
      durMin,
      prevViewers,
    );
    if (newTitle) trigger = "viewer_decline";
  }

  // ── Run watcher — track consecutive 20-min growth samples ─────────────────
  // Uses the previous step (20 min ago) rather than prevViewers (40 min ago)
  // so the streak counter reflects true consecutive momentum.
  const prevStep = session.viewerHistory.length >= 2
    ? session.viewerHistory[session.viewerHistory.length - 2]
    : null;
  const isStepGrowing = prevStep && prevStep.count > 0
    ? viewers >= prevStep.count * RUN_MIN_SAMPLE_GROWTH
    : false;

  if (isStepGrowing) {
    session.consecutiveGrowthSamples++;
  } else {
    // Soft decay — one flat/down sample doesn't reset a long run instantly
    session.consecutiveGrowthSamples = Math.max(0, session.consecutiveGrowthSamples - 1);
    if (session.consecutiveGrowthSamples === 0) session.runActive = false;
  }

  const sinceLastRun = now - session.lastRunDeclaredAt;
  if (
    session.consecutiveGrowthSamples >= RUN_CONSECUTIVE_SAMPLES &&
    !session.runActive &&
    sinceLastRun >= RUN_COOLDOWN_MS
  ) {
    session.runActive = true;
    session.lastRunDeclaredAt = now;
    session.runStartViewers = viewers;
    await amplifyRun(session, viewers).catch(() => {});
  }
  // ───────────────────────────────────────────────────────────────────────────

  if (newTitle && trigger && newTitle !== session.currentTitle) {
    try {
      const accessToken = await getChannelAccessToken(session.channelDbId);
      // InnerTube write-mask { title: true } preserves existing description server-side
      const updated = await applyBroadcastMetadata(
        accessToken,
        session.broadcastId!,
        newTitle,
      );

      if (updated) {
        session.titleRefreshCount++;
        session.lastTitleRefreshAt = Date.now();
        const oldTitle = session.currentTitle;
        session.currentTitle = newTitle;
        logger.info(
          `[Director] Title refresh #${session.titleRefreshCount} [${trigger}]: ` +
          `"${oldTitle.slice(0, 50)}" → "${newTitle.slice(0, 50)}"`,
        );
        sendSSEEvent(session.userId, "director_heartbeat", {
          type: "title_refreshed",
          streamId: session.streamId,
          trigger,
          newTitle,
          oldTitle,
          refreshCount: session.titleRefreshCount,
          currentViewers: viewers,
          prevViewers,
        });
      }
    } catch (err: any) {
      logger.warn(`[Director] Title refresh failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }
}

// ── Run watcher amplification ─────────────────────────────────────────────────
// Called the moment 3 consecutive positive-growth samples are detected.
// Fires a chat message to encourage sharing, tightens the beat cadence,
// and triggers an immediate title update if the cooldown allows.

async function amplifyRun(session: DirectorSession, viewers: number): Promise<void> {
  const durMs = Date.now() - session.startedAt.getTime();
  const durMin = Math.round(durMs / 60_000);

  logger.info(
    `[Director] 🔥 Run detected — ${viewers} viewers, ` +
    `${session.consecutiveGrowthSamples} consecutive growth samples (${durMin}min in)`,
  );

  sendSSEEvent(session.userId, "director_heartbeat", {
    type: "run_detected",
    streamId: session.streamId,
    currentViewers: viewers,
    runStartViewers: viewers,
    consecutiveGrowthSamples: session.consecutiveGrowthSamples,
    durationMin: durMin,
  });

  // Tighten beat cadence for the next posting cycle
  session.nextBeatGapMs = RUN_BEAT_GAP_MS;

  // Post an amplification message to chat — urge sharing while momentum is live
  if (session.liveChatId && session.channelDbId > 0) {
    try {
      const accessToken = await getChannelAccessToken(session.channelDbId);
      const runMessages = [
        `viewers keep building 🔥 share the stream if you're enjoying it`,
        `something's happening here — share if you want more people to see this`,
        `on a run right now — appreciate everyone joining 🙏 share the stream`,
        `viewers climbing every check — share the ${session.gameName} stream if you're feeling it`,
        `growing fast right now 🔥 subscribe so you don't miss the clips from this session`,
      ];
      const msg = runMessages[Math.floor(Math.random() * runMessages.length)];
      await postChatMessage(accessToken, session.liveChatId, msg);
      logger.info(`[Director] Run amplification chat message posted`);
    } catch { /* non-fatal */ }
  }

  // Title update — ride the early momentum before it becomes a full surge
  const sinceLastRefresh = Date.now() - session.lastTitleRefreshAt;
  if (
    sinceLastRefresh >= MIN_TITLE_REFRESH_INTERVAL_MS &&
    session.broadcastId &&
    session.channelDbId > 0
  ) {
    const prevStepViewers = session.viewerHistory.length >= 2
      ? session.viewerHistory[session.viewerHistory.length - 2].count
      : viewers;

    const newTitle = await generateViralSurgeTitle(
      session.gameName,
      session.currentTitle,
      viewers,
      prevStepViewers,
      durMin,
    ).catch(() => null);

    if (newTitle && newTitle !== session.currentTitle) {
      try {
        const accessToken = await getChannelAccessToken(session.channelDbId);
        // InnerTube write-mask { title: true } preserves existing description server-side
        const updated = await applyBroadcastMetadata(
          accessToken, session.broadcastId!, newTitle,
        );
        if (updated) {
          session.titleRefreshCount++;
          session.lastTitleRefreshAt = Date.now();
          const oldTitle = session.currentTitle;
          session.currentTitle = newTitle;
          logger.info(
            `[Director] Run title update #${session.titleRefreshCount}: ` +
            `"${oldTitle.slice(0, 50)}" → "${newTitle.slice(0, 50)}"`,
          );
          sendSSEEvent(session.userId, "director_heartbeat", {
            type: "title_refreshed",
            streamId: session.streamId,
            trigger: "run_start",
            newTitle,
            oldTitle,
            refreshCount: session.titleRefreshCount,
            currentViewers: viewers,
          });
        }
      } catch { /* non-fatal */ }
    }
  }
}

// ── Post-stream VOD optimization ──────────────────────────────────────────────

async function runPostStreamVodOptimization(
  userId: string,
  streamId: number,
  session: DirectorSession | undefined,
): Promise<void> {
  const durMin = session
    ? Math.round((Date.now() - session.startedAt.getTime()) / 60_000)
    : 0;
  const gameName = session?.gameName ?? "Gaming";
  const streamTitle = session?.streamTitle ?? "Live Stream";
  const peakViewers = session?.peakViewers ?? 0;

  logger.info(`[Director] Running post-stream VOD optimization — game=${gameName} dur=${durMin}min peak=${peakViewers}`);

  // ── Fetch channel CTR benchmark ────────────────────────────────────────────
  let channelCtr: number | null = null;
  try {
    const { fetchChannelCTR } = await import("./youtube-analytics");
    const ctrData = await fetchChannelCTR(userId);
    channelCtr = ctrData.ctr;
    logger.info(`[Director] Channel CTR benchmark: ${channelCtr ?? "unavailable"}%`);
  } catch { /* non-fatal */ }

  // ── Generate analytics-optimized VOD title + description via AI ────────────
  let vodTitle = streamTitle;
  let vodDescription = "";
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      temperature: 0.8,
      messages: [{
        role: "user",
        content: `You are optimizing the YouTube VOD (replay) metadata for a no-commentary PS5 ${sanitizeForPrompt(gameName, 50)} live stream.

Stream details:
- Original title: "${sanitizeForPrompt(streamTitle, 120)}"
- Duration: ${durMin} minutes
- Peak concurrent viewers: ${peakViewers}
${channelCtr !== null ? `- Channel average CTR: ${channelCtr}% (optimize to beat this)` : ""}

Write the VOD metadata to maximize clicks and views:

Return ONLY valid JSON:
{
  "title": "<under 100 chars, curiosity-driven, includes game name, implies something worth watching>",
  "description": "<150-200 words: engaging description, what happened, why to watch, includes relevant hashtags at the end>"
}

Title examples that work:
- "Battlefield 6 Ranked Grind — Back-to-Back Wins (PS5)"
- "7 Kill Streak in One Match — BF6 PS5 Gameplay"
- "Battlefield 6 Close Game Goes to the Wire — Full Session"

The description should read naturally, not like SEO spam.`,
      }],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.title.length > 5) vodTitle = parsed.title.slice(0, 100);
      if (parsed.description) vodDescription = parsed.description.slice(0, 5000);
    }
    logger.info(`[Director] VOD title generated: "${vodTitle.slice(0, 60)}"`);
  } catch (err: any) {
    logger.warn(`[Director] VOD title generation failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
  }

  // ── Generate optimized thumbnail concept ───────────────────────────────────
  try {
    const { generateThumbnailPrompt } = await import("../ai-engine");
    const thumbData = await generateThumbnailPrompt({
      title: vodTitle,
      description: vodDescription || undefined,
      platform: "youtube",
      type: "vod_replay",
      gameName,
    }, userId);

    await storage.createThumbnail({
      videoId: null,
      streamId,
      prompt: thumbData.prompt,
      platform: "youtube",
      resolution: "1280x720",
      status: "generated",
    });

    logger.info(`[Director] VOD thumbnail concept generated and stored`);
  } catch (err: any) {
    logger.warn(`[Director] Thumbnail generation failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
  }

  // ── Store VOD metadata as stream seoData for publishers to pick up ─────────
  if (vodTitle !== streamTitle || vodDescription) {
    try {
      await storage.updateStream(streamId, {
        seoData: {
          vodTitle,
          vodDescription,
          optimizedAt: new Date().toISOString(),
          channelCtr: channelCtr ?? undefined,
          peakViewers,
          streamDurationMin: durMin,
        } as any,
      });
      logger.info(`[Director] VOD SEO data saved to stream record`);
    } catch (err: any) {
      logger.warn(`[Director] SEO data save failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  sendSSEEvent(userId, "director_heartbeat", {
    type: "vod_optimized",
    streamId,
    vodTitle,
    hasDescription: !!vodDescription,
    hasThumbnailConcept: true,
    channelCtr,
    peakViewers,
  });
}

// ── Broadcast beats ───────────────────────────────────────────────────────────

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
    } catch { /* fall through */ }
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

  // a) Viewer analytics + title refresh (every 20 min)
  await checkViewerMetrics(session).catch(() => {});

  // b) Session heartbeat SSE
  sendSSEEvent(session.userId, "director_heartbeat", {
    type: "cycle",
    streamId: session.streamId,
    streamTitle: session.currentTitle,
    gameName: session.gameName,
    durationMin: durMin,
    beatsPosted: session.beatsPosted,
    peakViewers: session.peakViewers,
    titleRefreshCount: session.titleRefreshCount,
    isActive: true,
  });

  // c) Broadcast beat — rate-limited, initial 20-min silence respected
  const sinceStart = now - session.startedAt.getTime();
  const sinceLastBeat = now - session.lastBeatAt;

  if (
    session.liveChatId &&
    session.channelDbId > 0 &&
    sinceStart >= INITIAL_BEAT_OFFSET_MS &&
    sinceLastBeat >= session.nextBeatGapMs
  ) {
    try {
      const accessToken = await getChannelAccessToken(session.channelDbId);
      const beat = await generateBroadcastBeat(session.gameName, durMin, session.beatsPosted);
      const posted = await postChatMessage(accessToken, session.liveChatId!, beat);
      if (posted) {
        session.beatsPosted++;
        session.lastBeatAt = now;
        // Tighter cadence during a run — beats every 15 min instead of 25–35
        session.nextBeatGapMs = session.runActive
          ? RUN_BEAT_GAP_MS
          : BEAT_GAP_MIN_MS + Math.floor(Math.random() * (BEAT_GAP_MAX_MS - BEAT_GAP_MIN_MS));
        logger.info(
          `[Director] Broadcast beat #${session.beatsPosted} posted — next in ~${Math.round(session.nextBeatGapMs / 60_000)} min` +
          (session.runActive ? " [run mode]" : ""),
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

  const [stream] = await db
    .select()
    .from(streams)
    .where(and(eq(streams.userId, userId), eq(streams.status, "live")))
    .orderBy(desc(streams.startedAt))
    .limit(1)
    .catch(() => [] as typeof streams.$inferSelect[]);

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

  // ── Step 1: Generate pre-stream prep package ──────────────────────────────
  let prep: any = null;
  if (streamId > 0) {
    try {
      const { prepareLiveStream } = await import("./youtube-live-copilot");
      prep = await prepareLiveStream(userId, streamId);
      logger.info(`[Director] Pre-stream prep complete — title="${String(prep?.title || "").slice(0, 60)}"`);
    } catch (err: any) {
      logger.warn(`[Director] prepareLiveStream failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  // ── Step 2: Apply title + description to the YouTube broadcast ────────────
  const liveTitle = prep?.title ?? streamTitle;
  if (broadcastId && channelDbId > 0 && prep?.title && prep?.description) {
    try {
      const accessToken = await getChannelAccessToken(channelDbId);
      await applyBroadcastMetadata(accessToken, broadcastId, prep.title, prep.description);
    } catch (err: any) {
      logger.warn(`[Director] Broadcast metadata apply failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }
  }

  // ── Step 3: Post opening pinned message ───────────────────────────────────
  let pinnedPosted = false;
  if (liveChatId && channelDbId > 0 && prep?.pinnedMessage) {
    try {
      const accessToken = await getChannelAccessToken(channelDbId);
      pinnedPosted = await postChatMessage(accessToken, liveChatId, prep.pinnedMessage);
      if (pinnedPosted) logger.info(`[Director] Opening pinned message posted to live chat`);
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
    lastBeatAt: Date.now(),
    nextBeatGapMs: BEAT_GAP_MIN_MS + Math.floor(Math.random() * (BEAT_GAP_MAX_MS - BEAT_GAP_MIN_MS)),
    viewerHistory: [],
    titleRefreshCount: 0,
    lastAnalyticsAt: 0,    // 0 = triggers on first cycle that passes the 20-min gate
    lastTitleRefreshAt: 0, // 0 = no cooldown on first eligible refresh
    currentTitle: liveTitle,
    peakViewers: 0,
    consecutiveGrowthSamples: 0,
    runActive: false,
    lastRunDeclaredAt: 0,
    runStartViewers: 0,
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
    streamTitle: liveTitle,
    gameName,
    prepGenerated: !!prep,
    metadataApplied: !!(broadcastId && prep?.title),
    pinnedMessagePosted: pinnedPosted,
  });

  logger.info(`[Director] Production session started — analytics every 20 min, beats every ~30 min`);
}

async function onStreamEnded(userId: string, streamId?: number): Promise<void> {
  const session = activeSessions.get(userId);

  if (session) {
    const durMs = Date.now() - session.startedAt.getTime();
    const durMin = Math.round(durMs / 60_000);

    if (session.cycleTimer) clearInterval(session.cycleTimer);
    activeSessions.delete(userId);

    logger.info(
      `[Director] Session ended — duration=${durMin}min beats=${session.beatsPosted} ` +
      `titleRefreshes=${session.titleRefreshCount} peakViewers=${session.peakViewers} streamId=${session.streamId}`,
    );

    sendSSEEvent(userId, "director_heartbeat", {
      type: "session_ended",
      streamId: session.streamId,
      durationMin: durMin,
      beatsPosted: session.beatsPosted,
      titleRefreshCount: session.titleRefreshCount,
      peakViewers: session.peakViewers,
      isActive: false,
    });
  }

  const resolvedStreamId = streamId ?? session?.streamId ?? 0;
  const alreadyFired = session?.afterStreamFired ?? false;

  if (resolvedStreamId > 0 && !alreadyFired) {
    if (session) session.afterStreamFired = true;

    // ── afterStreamCopilot — queues Shorts, long-form, fires hype wave ──────
    try {
      const { afterStreamCopilot } = await import("./youtube-live-copilot");
      const result: any = await afterStreamCopilot(userId, resolvedStreamId);
      logger.info(
        `[Director] afterStreamCopilot complete — ` +
        `shorts=${result?.shortsQueued ?? "?"} lf=${result?.longFormQueued ?? "?"} moments=${result?.clipMomentsFound ?? "?"}`,
      );
    } catch (err: any) {
      logger.warn(`[Director] afterStreamCopilot failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
    }

    // ── Post-stream VOD optimization — thumbnail + analytics-driven title ────
    // Fire after a short delay to avoid competing with afterStreamCopilot's AI calls
    setTimeout(() => {
      runPostStreamVodOptimization(userId, resolvedStreamId, session).catch((err: any) => {
        logger.warn(`[Director] VOD optimization failed (non-fatal): ${String(err?.message || err).slice(0, 100)}`);
      });
    }, 90_000); // 90 s delay
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getActiveBroadcastData(userId: string): {
  broadcastId: string | null;
  channelDbId: number;
  currentTitle: string;
  gameName: string;
  streamId: number;
  liveChatId: string | null;
} | null {
  const session = activeSessions.get(userId);
  if (!session) return null;
  return {
    broadcastId: session.broadcastId,
    channelDbId: session.channelDbId,
    currentTitle: session.currentTitle,
    gameName: session.gameName,
    streamId: session.streamId,
    liveChatId: session.liveChatId,
  };
}

export function getDirectorStatus(userId: string) {
  const session = activeSessions.get(userId);
  if (!session) return { isActive: false };
  const durMs = Date.now() - session.startedAt.getTime();
  return {
    isActive: true,
    streamId: session.streamId,
    streamTitle: session.currentTitle,
    gameName: session.gameName,
    durationMin: Math.round(durMs / 60_000),
    beatsPosted: session.beatsPosted,
    titleRefreshCount: session.titleRefreshCount,
    peakViewers: session.peakViewers,
    viewerHistoryLength: session.viewerHistory.length,
    nextBeatInMin: Math.max(
      0,
      Math.round((session.lastBeatAt + session.nextBeatGapMs - Date.now()) / 60_000),
    ),
    nextAnalyticsInMin: Math.max(
      0,
      Math.round((session.lastAnalyticsAt + ANALYTICS_INTERVAL_MS - Date.now()) / 60_000),
    ),
    titleRefreshCooldownMin: Math.max(
      0,
      Math.round((session.lastTitleRefreshAt + MIN_TITLE_REFRESH_INTERVAL_MS - Date.now()) / 60_000),
    ),
    runActive: session.runActive,
    consecutiveGrowthSamples: session.consecutiveGrowthSamples,
    runStartViewers: session.runStartViewers,
    liveChatId: session.liveChatId ? "present" : "absent",
    broadcastId: session.broadcastId ? "present" : "absent",
  };
}

export function initLiveStreamDirector(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  onAgentEvent("stream.started", (event) => {
    setTimeout(() => {
      onStreamStarted(event.userId, event.payload ?? {}).catch((err: any) => {
        logger.error(`[Director] onStreamStarted error: ${String(err?.message || err).slice(0, 100)}`);
      });
    }, 45_000);
  });

  onAgentEvent("stream.ended", (event) => {
    const streamId = (event.payload as any)?.streamId ?? undefined;
    onStreamEnded(event.userId, streamId).catch((err: any) => {
      logger.error(`[Director] onStreamEnded error: ${String(err?.message || err).slice(0, 100)}`);
    });
  });

  logger.info("[Director] Live stream director initialized — analytics + title refresh + VOD optimization active");
}
