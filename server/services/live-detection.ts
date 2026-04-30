/**
 * Multi-Platform Live Detection — Dual-Pipeline Confirmation Gate
 *
 * Every live service in the system (chat agent, revenue activator, idle
 * engagement, clip highlighter, growth agent, raid scout) fires ONLY after
 * BOTH detection pipelines independently confirm a live broadcast:
 *
 *   YouTube — Pipeline 1: public watch-page scraping (0 quota cost)
 *              Pipeline 2: YouTube Data API liveBroadcasts.list (50 units)
 *              Gate: scraping + API must agree, OR 2× consecutive scraping
 *                    hits when API quota is depleted.
 *
 *   Twitch / Kick / TikTok / Rumble — No public scraping available.
 *              Gate: 2 consecutive authenticated API confirmations
 *                    (spaced by each platform's poll interval).
 *
 * Per-platform poll intervals keep each platform's API usage well inside
 * its rate limits:
 *   YouTube  —  5 min  (scraping is free; API only when live confirmed)
 *   Twitch   —  5 min  (Helix: 800 req/min — very generous)
 *   Kick     — 10 min  (conservative; no documented rate limit)
 *   TikTok   — 15 min  (dev tier: ~1000 req/day)
 *   Rumble   — 30 min  (RSS-only; no reliable public API)
 */

import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { channels, streams } from "@shared/schema";
import { storage } from "../storage";
import { sendSSEEvent } from "../routes/events";
import {
  trackQuotaUsage,
  isQuotaBreakerTripped,
  canAffordOperation,
  markQuotaErrorFromResponse,
  cacheLiveChatId,
} from "./youtube-quota-tracker";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";

import { registerMap } from "./resilience-core";
import { createLogger } from "../lib/logger";
import { PLATFORM_FIRST_POLL_OFFSET_MS } from "./boot-sequencer";

const logger = createLogger("live-detection");

/** Timestamp when this process started (used for first-poll offset gating). */
const serverBootTime = Date.now();

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedBroadcast {
  platform: string;
  broadcastId: string;
  title: string;
  description: string;
  startedAt?: string;
  viewerCount?: number;
  liveChatId?: string;
}

// ─── Tracked active streams (already firing live services) ───────────────────

const trackedBroadcasts = new Map<string, {
  streamId: number;
  platform: string;
  broadcastId: string;
  missCount: number;
}>();
registerMap("trackedBroadcasts", trackedBroadcasts, 500);

// ─── Dual-pipeline confirmation state ────────────────────────────────────────
// Before any live service fires, each platform/channel must pass its gate.

interface ConfirmationState {
  scrapingHits: number;   // watch-page / RSS / public detections
  apiHits: number;        // authenticated API detections
  totalHits: number;      // total consecutive detections
  firstSeenAt: number;
  lastSeenAt: number;
  pending: DetectedBroadcast;
}

const pendingConfirmations = new Map<string, ConfirmationState>();
registerMap("liveDetection.pendingConfirmations", pendingConfirmations, 100);

/**
 * Per-platform poll interval in ms. These are the minimum gaps between
 * API calls to each platform — used to throttle the detection loop.
 *
 * Tuned for fastest possible detection for PS5 → YouTube / Twitch / Kick:
 *   YouTube scraping is free (no quota), so 45 s is safe indefinitely.
 *   Twitch Helix allows ~800 points/min; GET /streams costs 1 point → 30 s fine.
 *   Kick has no published rate limit; 45 s is conservative.
 */
const PLATFORM_POLL_MS: Record<string, number> = {
  youtube: 45 * 1000,        //  45 s — scraping is free; API only on confirm
  twitch:  30 * 1000,        //  30 s — Helix is extremely generous
  kick:    45 * 1000,        //  45 s — conservative without published limit
  tiktok: 15 * 60 * 1000,   //  15 min — dev tier is limited
  rumble: 30 * 60 * 1000,   //  30 min — RSS/public only
};

/** Last time each channel was polled (channelDbId → timestamp) */
const lastPollAt = new Map<number, number>();
registerMap("liveDetection.lastPollAt", lastPollAt as any, 500);

/**
 * Returns true if this channel's platform is ready to be polled.
 * Two gates must both pass:
 *   1. Boot-time offset — the platform's staggered first-poll delay has elapsed,
 *      preventing all platforms from hitting their APIs simultaneously at T+10s.
 *   2. Per-channel cooldown — enough time has passed since this channel was last
 *      polled (enforces PLATFORM_POLL_MS minimum gaps).
 */
function canPollChannel(channelId: number, platform: string): boolean {
  const bootOffset = PLATFORM_FIRST_POLL_OFFSET_MS[platform] ?? 0;
  if (Date.now() - serverBootTime < bootOffset) return false;

  const minGap = PLATFORM_POLL_MS[platform] ?? 10 * 60 * 1000;
  const last = lastPollAt.get(channelId) ?? 0;
  return Date.now() - last >= minGap;
}

function markPolled(channelId: number): void {
  lastPollAt.set(channelId, Date.now());
}

function trackingKey(userId: string, platform: string, channelId: number): string {
  return `${userId}:${platform}:${channelId}`;
}

// ─── Gate logic ───────────────────────────────────────────────────────────────

/**
 * Record a detection hit from the given pipeline type.
 * Returns true when the dual-confirmation gate is cleared.
 */
function recordHit(
  key: string,
  pipeline: "scraping" | "api",
  broadcast: DetectedBroadcast,
  platform: string,
): boolean {
  const now = Date.now();
  let state = pendingConfirmations.get(key);

  // If last hit was more than 20 minutes ago, reset — it was a different stream event
  if (state && now - state.lastSeenAt > 20 * 60 * 1000) {
    pendingConfirmations.delete(key);
    state = undefined;
  }

  if (!state) {
    state = { scrapingHits: 0, apiHits: 0, totalHits: 0, firstSeenAt: now, lastSeenAt: now, pending: broadcast };
    pendingConfirmations.set(key, state);
  }

  state.lastSeenAt = now;
  state.pending = broadcast;
  state.totalHits++;
  if (pipeline === "scraping") state.scrapingHits++;
  if (pipeline === "api") state.apiHits++;

  return isGateCleared(state, platform);
}

function clearPending(key: string): void {
  pendingConfirmations.delete(key);
}

/**
 * Gate cleared when:
 *
 *   YouTube:
 *     - apiHits ≥ 1  — the YouTube API is only ever queried AFTER scraping has
 *       already confirmed live in the same call, so one API hit is sufficient
 *       proof that both pipelines agreed (possibly within the same poll cycle).
 *     - OR scrapingHits ≥ 2 — two independent scraping checks both saw live;
 *       used as fallback when quota is exhausted and the API cannot be called.
 *
 *   Other platforms: totalHits ≥ 2 (two consecutive API hits, ~30-45 s apart).
 *
 * Previous gate was `scrapingHits >= 1 AND (apiHits >= 1 OR scrapingHits >= 2)`.
 * That was always false on the first poll when both pipelines agreed in one call
 * because recordHit was only called once (with pipeline="api"), leaving
 * scrapingHits=0. The new gate correctly handles single-poll resolution.
 */
function isGateCleared(state: ConfirmationState, platform: string): boolean {
  if (platform === "youtube") {
    // API is only called when scraping already confirmed → apiHits≥1 implies both agreed.
    // Two scraping hits (no API, quota-low path) also clears.
    return state.apiHits >= 1 || state.scrapingHits >= 2;
  }
  return state.totalHits >= 2;
}

// ─── Platform-specific live checkers ─────────────────────────────────────────

/** YouTube: scraping first (0 quota), API confirmation when live + quota healthy. */
async function checkYouTubeLive(channelRow: any): Promise<{ broadcast: DetectedBroadcast | null; pipeline: "scraping" | "api" }> {
  const userId: string = channelRow.userId;
  const channelDbId: number = channelRow.id;

  // Pipeline 1: public watch-page scraping — always runs, zero quota cost
  let scrapedLive = false;
  let scrapedVideoId: string | undefined;
  let scrapedTitle: string | undefined;

  if (channelRow.channelId) {
    try {
      const result = await detectYouTubeLiveFromChannel(channelRow.channelId);
      scrapedLive = result.isLive;
      scrapedVideoId = result.videoId ?? undefined;
      scrapedTitle = result.title ?? undefined;
    } catch (err: any) {
      logger.warn(`[LiveDetection] YouTube scrape failed for channel ${channelDbId}:`, err?.message);
    }
  }

  if (!scrapedLive) {
    // Scraping says not live — trust it, don't burn API quota to verify not-live status
    return { broadcast: null, pipeline: "scraping" };
  }

  // Scraping says LIVE — confirm with API only if the broadcast count cap allows it.
  // Using canAffordOperation enforces the 20/day broadcast cap so a long stream
  // cannot drain the full daily quota through repeated liveBroadcasts.list calls.
  const canConfirmLive = channelRow.accessToken && channelRow.accessToken !== "dev_api_key_mode"
    && await canAffordOperation(userId, "broadcast").catch(() => false);
  if (canConfirmLive) {
    try {
      const { checkYouTubeLiveBroadcasts } = await import("../youtube");
      const apiBroadcasts = await checkYouTubeLiveBroadcasts(channelDbId);
      await trackQuotaUsage(userId, "broadcast");

      const active = apiBroadcasts.filter((b: any) => b.status === "active" || b.status === "live");
      if (active.length > 0) {
        const broadcast = active[0] as any;
        const liveChatId = broadcast.liveChatId || null;
        // Cache liveChatId so other services don't need an API call
        if (liveChatId) cacheLiveChatId(channelDbId, liveChatId, broadcast.broadcastId);
        return {
          broadcast: {
            platform: "youtube",
            broadcastId: broadcast.broadcastId || scrapedVideoId || `yt_live_${Date.now()}`,
            title: broadcast.title || scrapedTitle || "YouTube Live Stream",
            description: "Confirmed via scraping + API",
            startedAt: broadcast.startedAt || broadcast.scheduledStartTime || new Date().toISOString(),
            liveChatId: liveChatId || undefined,
          },
          pipeline: "api",
        };
      }

      // API returned no active broadcasts despite scraping saying live.
      // This happens during stream startup. Return scraping result — API will
      // confirm on the next poll cycle.
      logger.info(`[LiveDetection] YouTube API found no active broadcast; scraping confirmed. Will re-check in ${PLATFORM_POLL_MS.youtube / 60000} min.`);
    } catch (err: any) {
      markQuotaErrorFromResponse(err);
      logger.warn(`[LiveDetection] YouTube API check failed:`, err?.message);
    }
  } else {
    logger.info(`[LiveDetection] Broadcast cap reached or quota low — scraping-only detection for ${userId.slice(0, 8)}`);
  }

  // Return scraping-only result — gate requires a second scraping hit or API confirmation
  return {
    broadcast: {
      platform: "youtube",
      broadcastId: scrapedVideoId || `yt_scrape_${Date.now()}`,
      title: scrapedTitle || "YouTube Live Stream",
      description: "Detected via watch-page scraping",
      startedAt: new Date().toISOString(),
    },
    pipeline: "scraping",
  };
}

async function checkTwitchLive(channelRow: any): Promise<DetectedBroadcast | null> {
  const token = channelRow.accessToken;
  const clientId = process.env.TWITCH_DEV_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return null;

  try {
    let twitchUserId = channelRow.channelId;

    if (!twitchUserId) {
      const userInfoRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
        signal: AbortSignal.timeout(10_000),
      });
      if (!userInfoRes.ok) return null;
      const userInfo = await userInfoRes.json();
      twitchUserId = userInfo.data?.[0]?.id;
      if (!twitchUserId) return null;
    }

    const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${twitchUserId}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      signal: AbortSignal.timeout(10_000),
    });
    if (!streamsRes.ok) return null;
    const streamsData = await streamsRes.json();

    const live = (streamsData.data || []).find((s: any) => s.type === "live");
    if (!live) return null;

    return {
      platform: "twitch",
      broadcastId: live.id,
      title: live.title || "Twitch Stream",
      description: `${live.game_name || "Streaming"} on Twitch`,
      startedAt: live.started_at,
      viewerCount: live.viewer_count,
    };
  } catch (err: any) {
    logger.warn(`[LiveDetection] Twitch check failed for channel ${channelRow.id}:`, err?.message ?? err);
    return null;
  }
}

/**
 * Try Kick's public v2 API (no auth required) for a given slug.
 * Returns a broadcast object if the channel is live, null otherwise.
 * This is used as both the primary path (when no OAuth token is available) and
 * as a fallback when the authenticated v1 API returns a non-200 response.
 */
async function checkKickPublicApi(slug: string, channelDbId: number): Promise<DetectedBroadcast | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const data = await res.json();

    if (!data.is_live) return null;

    const ls = data.livestream || {};
    return {
      platform: "kick",
      broadcastId: String(ls.id || data.id || Date.now()),
      title: ls.session_title || ls.title || data.slug || "Kick Stream",
      description: `${ls.categories?.[0]?.name || "Streaming"} on Kick`,
      startedAt: ls.created_at || ls.start_time,
      viewerCount: ls.viewer_count || data.viewer_count,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    logger.warn(`[LiveDetection] Kick public API check ${isTimeout ? "timed out" : "failed"} for channel ${channelDbId}:`, err?.message ?? err);
    return null;
  }
}

async function checkKickLive(channelRow: any): Promise<DetectedBroadcast | null> {
  const token = channelRow.accessToken;
  const slug = channelRow.channelName || channelRow.channelId;
  if (!slug) return null;

  // When no token is available, go straight to the public API.
  if (!token) {
    logger.debug(`[LiveDetection] Kick channel ${channelRow.id} has no token — using public API`);
    return checkKickPublicApi(slug, channelRow.id);
  }

  try {
    const res = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    // 401 / 403 means the OAuth token has expired.  Fall back to the public
    // v2 API which doesn't require authentication.
    if (res.status === 401 || res.status === 403) {
      logger.info(`[LiveDetection] Kick OAuth token expired for channel ${channelRow.id} (HTTP ${res.status}) — falling back to public API`);
      return checkKickPublicApi(slug, channelRow.id);
    }

    if (!res.ok) return null;
    const kickCt = res.headers.get("content-type") || "";
    if (!kickCt.includes("application/json")) return null;
    const data = await res.json();

    const channelList = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    const live = channelList.find((ch: any) => ch.is_live || ch.livestream);
    if (!live) return null;

    const ls = live.livestream || {};
    return {
      platform: "kick",
      broadcastId: String(ls.id || live.id || Date.now()),
      title: ls.session_title || ls.title || live.slug || "Kick Stream",
      description: `${ls.categories?.[0]?.name || "Streaming"} on Kick`,
      startedAt: ls.created_at || ls.start_time,
      viewerCount: ls.viewer_count || live.viewer_count,
    };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    logger.warn(`[LiveDetection] Kick check ${isTimeout ? "timed out" : "failed"} for channel ${channelRow.id}:`, err?.message ?? err);
    // On network error, still try the public API as a last resort
    return checkKickPublicApi(slug, channelRow.id);
  }
}

async function checkTikTokLive(channelRow: any): Promise<DetectedBroadcast | null> {
  const token = channelRow.accessToken;
  if (!token) return null;

  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,duration,create_time",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 5 }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;

    const data = await res.json();
    const videoList: any[] = data?.data?.videos || [];
    const now = Date.now() / 1000;
    const liveVideo = videoList.find((v: any) => v.duration === 0 && (now - (v.create_time || 0)) < 3600);
    if (!liveVideo) return null;

    return {
      platform: "tiktok",
      broadcastId: liveVideo.id || `tiktok_live_${channelRow.channelId || Date.now()}`,
      title: liveVideo.title || `${channelRow.channelName || "Creator"} is LIVE on TikTok`,
      description: "Live on TikTok",
      startedAt: new Date(liveVideo.create_time * 1000).toISOString(),
    };
  } catch (err: any) {
    logger.warn(`[LiveDetection] TikTok live check failed for channel ${channelRow.id}:`, err?.message ?? err);
    return null;
  }
}

async function checkRumbleLive(channelRow: any): Promise<DetectedBroadcast | null> {
  const apiKey = process.env.RUMBLE_API_KEY;
  const channelName = channelRow.channelName || channelRow.channelId;
  if (!apiKey || !channelName) return null;

  try {
    const res = await fetch(`https://rumble.com/api/v0/channel/${encodeURIComponent(channelName)}/livestreams`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const data = await res.json();

    const livestreams = Array.isArray(data.livestreams) ? data.livestreams
      : Array.isArray(data.data) ? data.data
      : data.items ? data.items : [];
    const live = livestreams.find((ls: any) => ls.is_live || ls.status === "live" || ls.state === "live");
    if (!live) return null;

    return {
      platform: "rumble",
      broadcastId: String(live.id || live.video_id || Date.now()),
      title: live.title || "Rumble Stream",
      description: live.description || "Live on Rumble",
      startedAt: live.started_at || live.created_at,
      viewerCount: live.viewer_count || live.watching_now || 0,
    };
  } catch (err: any) {
    logger.warn(`[LiveDetection] Rumble check failed for channel ${channelRow.id}:`, err?.message ?? err);
    return null;
  }
}

// ─── Broadcast lifecycle ──────────────────────────────────────────────────────

async function handleDetectedBroadcast(userId: string, channelId: number, broadcast: DetectedBroadcast) {
  const key = trackingKey(userId, broadcast.platform, channelId);
  const tracked = trackedBroadcasts.get(key);

  if (tracked) {
    tracked.missCount = 0;
    if (tracked.broadcastId !== broadcast.broadcastId) tracked.broadcastId = broadcast.broadcastId;
    return;
  }

  const streamList = await storage.getStreams(userId);
  const existingLive = streamList.find(s =>
    s.status === "live" && Array.isArray(s.platforms) && (s.platforms as string[]).includes(broadcast.platform)
  );

  if (existingLive) {
    trackedBroadcasts.set(key, { streamId: existingLive.id, platform: broadcast.platform, broadcastId: broadcast.broadcastId, missCount: 0 });
    return;
  }

  const connectedChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const STREAMING_PLATFORMS = new Set(["youtube", "twitch", "kick", "tiktok", "rumble"]);
  const connectedPlatforms = [...new Set(connectedChannels.map(c => c.platform).filter(p => STREAMING_PLATFORMS.has(p)))];
  const allPlatforms = connectedPlatforms.length > 0 ? connectedPlatforms : [broadcast.platform];

  const stream = await storage.createStream({
    userId,
    title: broadcast.title,
    description: broadcast.description,
    category: "Gaming",
    platforms: allPlatforms,
    status: "planned",
  });

  await storage.updateStream(stream.id, {
    status: "live",
    startedAt: broadcast.startedAt ? new Date(broadcast.startedAt) : new Date(),
  });

  trackedBroadcasts.set(key, { streamId: stream.id, platform: broadcast.platform, broadcastId: broadcast.broadcastId, missCount: 0 });

  try {
    const { pauseForLive } = await import("../backlog-manager");
    const { pivotToStream } = await import("../backlog-engine");
    const { processGoLiveAnnouncements } = await import("../autopilot-engine");
    const { createPipelineForStream } = await import("../routes/pipeline");
    const { setLivestreamPriority } = await import("../priority-orchestrator");
    const { onLivestreamDetected } = await import("../content-loop");
    const { onStreamDetected } = await import("../trend-rider-engine");

    setLivestreamPriority(userId, stream.id, broadcast.title);
    onLivestreamDetected(userId, stream.id);
    pauseForLive(userId, stream.id);
    pivotToStream(userId, stream.id).catch(e => logger.warn("[LiveDetection] pivotToStream failed", e?.message));
    processGoLiveAnnouncements(userId, stream.id, broadcast.title, broadcast.description, allPlatforms).catch(e => logger.warn("[LiveDetection] Go-live announcements failed", e?.message));
    createPipelineForStream(userId, broadcast.title, "live").catch(e => logger.warn("[LiveDetection] Pipeline creation failed", e?.message));
    onStreamDetected(userId, stream).catch(e => logger.warn("[LiveDetection] Trend detection failed", e?.message));

    import("./agent-events").then(({ fireAgentEvent }) => {
      fireAgentEvent("stream.started", userId, {
        platform: broadcast.platform,
        videoId: broadcast.broadcastId,
        liveChatId: broadcast.liveChatId,
        streamTitle: broadcast.title,
      });
    }).catch(() => {});
  } catch (err) {
    logger.error(`[LiveDetection] Pipeline trigger error for ${broadcast.platform}:`, err);
  }

  await storage.createNotification({
    userId,
    type: "stream_live",
    title: `${broadcast.platform.charAt(0).toUpperCase() + broadcast.platform.slice(1)} LIVE Detected`,
    message: `"${broadcast.title}" — both detection pipelines confirmed. All automations activated.`,
    severity: "info",
  });

  sendSSEEvent(userId, "stream_update", { type: "live_detected", streamId: stream.id, title: broadcast.title, platform: broadcast.platform });
  sendSSEEvent(userId, "notification", { type: "new" });
  sendSSEEvent(userId, "backlog_update", { state: "paused_for_live", streamId: stream.id });

  await storage.createAuditLog({
    userId,
    action: `${broadcast.platform}_live_dual_confirmed`,
    target: broadcast.title,
    details: { broadcastId: broadcast.broadcastId, platforms: allPlatforms, viewerCount: broadcast.viewerCount },
    riskLevel: "low",
  });
}

async function handleBroadcastEnded(userId: string, platform: string, channelId: number) {
  const key = trackingKey(userId, platform, channelId);
  const tracked = trackedBroadcasts.get(key);
  if (!tracked) {
    // Also clear any pending confirmation that never reached the gate
    clearPending(key);
    return;
  }

  tracked.missCount++;
  if (tracked.missCount < 2) return;

  const streamList = await storage.getStreams(userId);
  const liveStream = streamList.find(s => s.id === tracked.streamId && s.status === "live");

  trackedBroadcasts.delete(key);
  clearPending(key);

  if (!liveStream) return;

  const endedAt = new Date();
  await storage.updateStream(liveStream.id, { status: "ended", endedAt });

  try {
    const { resumeFromStream } = await import("../backlog-engine");
    const { processPostStreamHighlights } = await import("../autopilot-engine");
    const { createPipelineForStream } = await import("../routes/pipeline");
    const { resumeAfterStream } = await import("../backlog-manager");
    const { setPostStreamHarvest } = await import("../priority-orchestrator");
    const { onStreamEnded } = await import("../content-loop");

    setPostStreamHarvest(userId, liveStream.id, liveStream.title);
    onStreamEnded(userId, liveStream.id);
    resumeFromStream(userId, liveStream.id).catch(e => logger.warn("[LiveDetection] resumeFromStream failed", e?.message));
    processPostStreamHighlights(userId, liveStream.id, liveStream.title, liveStream.description || "", (liveStream.platforms as string[]) || ["youtube"]).catch(e => logger.warn("[LiveDetection] Post-stream highlights failed", e?.message));
    createPipelineForStream(userId, liveStream.title, "replay").catch(e => logger.warn("[LiveDetection] Replay pipeline failed", e?.message));
    resumeAfterStream(userId).catch(e => logger.warn("[LiveDetection] resumeAfterStream failed", e?.message));
  } catch (err) {
    logger.error(`[LiveDetection] Post-stream pipeline error for ${platform}:`, err);
  }

  await storage.createNotification({
    userId,
    type: "stream_ended",
    title: "Stream Ended",
    message: `"${liveStream.title}" — REPLAY pipeline started, backlog will resume automatically`,
    severity: "info",
  });

  sendSSEEvent(userId, "stream_update", { type: "stream_ended", streamId: liveStream.id, title: liveStream.title });
  sendSSEEvent(userId, "notification", { type: "new" });
  sendSSEEvent(userId, "backlog_update", { state: "waiting_for_replay" });

  await storage.createAuditLog({
    userId,
    action: `${platform}_live_auto_ended`,
    target: liveStream.title,
    details: { backlogResumed: true },
    riskLevel: "low",
  });
}

// ─── Main detection loop ──────────────────────────────────────────────────────

let running = false;

export async function runMultiPlatformLiveDetection() {
  if (running) return;
  running = true;

  try {
    const allChannelRows = await db.select().from(channels);

    for (const ch of allChannelRows) {
      if (!ch.userId) continue;

      const platform = ch.platform;
      const channelDbId = ch.id;
      const key = trackingKey(ch.userId, platform, channelDbId);

      // Skip if this channel was polled too recently for its platform's interval
      if (!canPollChannel(channelDbId, platform)) continue;
      markPolled(channelDbId);

      // Skip channels with no access token for API-dependent platforms
      const needsToken = ["twitch", "kick", "tiktok", "rumble"].includes(platform);
      if (needsToken && !ch.accessToken) continue;

      try {
        let broadcast: DetectedBroadcast | null = null;
        let pipeline: "scraping" | "api" = "api";

        if (platform === "youtube") {
          const result = await checkYouTubeLive(ch);
          broadcast = result.broadcast;
          pipeline = result.pipeline;
        } else if (platform === "twitch") {
          broadcast = await checkTwitchLive(ch);
        } else if (platform === "kick") {
          broadcast = await checkKickLive(ch);
        } else if (platform === "tiktok") {
          broadcast = await checkTikTokLive(ch);
        } else if (platform === "rumble") {
          broadcast = await checkRumbleLive(ch);
        } else {
          continue; // unknown platform
        }

        if (broadcast) {
          // Record this hit in the dual-confirmation gate
          const gateCleared = recordHit(key, pipeline, broadcast, platform);

          if (gateCleared) {
            // Both pipelines have confirmed — trigger live services
            const state = pendingConfirmations.get(key);
            const confirmedBroadcast = state?.pending ?? broadcast;
            clearPending(key); // Don't re-fire on next poll
            logger.info(`[LiveDetection] ${platform} LIVE confirmed (dual-pipeline gate cleared) for ${ch.userId.slice(0, 8)} — "${confirmedBroadcast.title}"`);
            await handleDetectedBroadcast(ch.userId, channelDbId, confirmedBroadcast);
          } else {
            const state = pendingConfirmations.get(key);
            logger.debug(`[LiveDetection] ${platform} pending confirmation for ${ch.userId.slice(0, 8)} — scraping:${state?.scrapingHits ?? 0} api:${state?.apiHits ?? 0} total:${state?.totalHits ?? 0}`);
          }
        } else {
          // No live broadcast detected — track misses for ended stream handling
          await handleBroadcastEnded(ch.userId, platform, channelDbId);
        }
      } catch (err) {
        logger.error(`[LiveDetection] ${platform} check failed for channel ${channelDbId}:`, err);
      }
    }
  } catch (err) {
    logger.error("[LiveDetection] Multi-platform detection error:", err);
  } finally {
    running = false;
  }
}

// ─── Startup live-stream recovery ────────────────────────────────────────────
/**
 * On server restart, the in-memory trackedBroadcasts map is empty even though
 * a stream may still be live in the database. Without recovery, the dual-pipeline
 * gate would take up to 10 minutes to re-confirm and re-start all live services.
 *
 * This function runs once at boot (~30s after startup). It:
 * 1. Finds all DB streams with status="live" started within the last 24 hours.
 * 2. For YouTube: quickly verifies they are still live via scraping (free).
 * 3. For other platforms: trusts the DB record without a network check.
 * 4. If verified: re-hydrates trackedBroadcasts and re-fires stream.started
 *    so all live services (chat agent, revenue activator, etc.) restart instantly.
 * 5. If NOT verified (stream ended while server was down): marks stream ended
 *    and triggers the post-stream pipeline.
 */
export async function recoverActiveLiveStreams(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours
    const liveStreams = await db.select().from(streams).where(
      and(eq(streams.status, "live"), gt(streams.startedAt, cutoff))
    );

    if (liveStreams.length === 0) {
      logger.info("[LiveDetection] Startup recovery: no live streams in DB");
      return;
    }

    logger.info(`[LiveDetection] Startup recovery: found ${liveStreams.length} stream(s) marked live — verifying...`);

    for (const stream of liveStreams) {
      try {
        const userId = stream.userId;
        const streamPlatforms = Array.isArray(stream.platforms) ? stream.platforms as string[] : ["youtube"];

        // Find connected channels for this stream's user
        const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
        const STREAMING_PLATFORMS = new Set(["youtube", "twitch", "kick", "tiktok", "rumble"]);

        let confirmedLive = false;
        let confirmedPlatform = streamPlatforms[0] ?? "youtube";
        let confirmedBroadcastId = `recovery_${stream.id}`;
        let confirmedLiveChatId: string | undefined;

        for (const platform of streamPlatforms) {
          if (!STREAMING_PLATFORMS.has(platform)) continue;
          const ch = userChannels.find(c => c.platform === platform);
          if (!ch) continue;

          if (platform === "youtube" && ch.channelId) {
            // Verify via scraping (free — no quota cost)
            try {
              const scraped = await detectYouTubeLiveFromChannel(ch.channelId);
              if (scraped.isLive) {
                confirmedLive = true;
                confirmedPlatform = "youtube";
                confirmedBroadcastId = scraped.videoId || `yt_recovery_${stream.id}`;
                logger.info(`[LiveDetection] Recovery: YouTube still live for ${userId.slice(0, 8)} — "${stream.title}"`);

                // If broadcast count cap allows, also get liveChatId so chat services restart cleanly
                const canFetchChatId = ch.accessToken && ch.accessToken !== "dev_api_key_mode"
                  && await canAffordOperation(userId, "broadcast").catch(() => false);
                if (canFetchChatId) {
                  try {
                    const { checkYouTubeLiveBroadcasts } = await import("../youtube");
                    const broadcasts = await checkYouTubeLiveBroadcasts(ch.id);
                    await trackQuotaUsage(userId, "broadcast");
                    const active = broadcasts.find((b: any) => b.status === "active" || b.status === "live") as any;
                    if (active?.liveChatId) {
                      confirmedLiveChatId = active.liveChatId;
                      cacheLiveChatId(ch.id, active.liveChatId, active.broadcastId || confirmedBroadcastId);
                    }
                  } catch (err: any) {
                    markQuotaErrorFromResponse(err);
                  }
                }
                break;
              }
            } catch (err: any) {
              logger.warn(`[LiveDetection] Recovery: YouTube scrape failed:`, err?.message);
            }
          } else if (platform !== "youtube") {
            // For non-YouTube platforms, trust the DB record (we'll correct on next poll)
            confirmedLive = true;
            confirmedPlatform = platform;
            logger.info(`[LiveDetection] Recovery: assuming ${platform} still live for ${userId.slice(0, 8)}`);
            break;
          }
        }

        if (confirmedLive) {
          // Re-hydrate the in-memory map so the detection loop knows this stream is tracked
          const ch = userChannels.find(c => c.platform === confirmedPlatform);
          if (ch) {
            const key = trackingKey(userId, confirmedPlatform, ch.id);
            trackedBroadcasts.set(key, {
              streamId: stream.id,
              platform: confirmedPlatform,
              broadcastId: confirmedBroadcastId,
              missCount: 0,
            });
          }

          // Re-fire stream.started so all live services restart without waiting for gate
          setImmediate(() => {
            import("./agent-events").then(({ fireAgentEvent }) => {
              fireAgentEvent("stream.started", userId, {
                platform: confirmedPlatform,
                videoId: confirmedBroadcastId,
                liveChatId: confirmedLiveChatId,
                streamTitle: stream.title,
                _recovery: true, // marker so logs can identify recovery-triggered events
              });
            }).catch(() => {});
          });

          // Ensure backlog is still paused for this stream
          import("../backlog-manager").then(({ pauseForLive }) => {
            pauseForLive(userId, stream.id);
          }).catch(() => {});

          logger.info(`[LiveDetection] Recovery complete for stream "${stream.title}" — live services restarted`);
        } else {
          // Stream ended while server was down — mark it ended and start post-stream pipeline
          logger.info(`[LiveDetection] Recovery: stream "${stream.title}" no longer live — marking ended`);
          await storage.updateStream(stream.id, { status: "ended", endedAt: new Date() });

          import("../backlog-engine").then(({ resumeFromStream }) => resumeFromStream(userId, stream.id)).catch(() => {});
          import("../backlog-manager").then(({ resumeAfterStream }) => resumeAfterStream(userId)).catch(() => {});
          import("../autopilot-engine").then(({ processPostStreamHighlights }) =>
            processPostStreamHighlights(userId, stream.id, stream.title, stream.description || "", streamPlatforms)
          ).catch(() => {});

          await storage.createNotification({
            userId,
            type: "stream_ended",
            title: "Stream Ended (detected on server restart)",
            message: `"${stream.title}" — stream ended while server was offline. Post-stream pipeline started.`,
            severity: "info",
          });
        }
      } catch (err) {
        logger.error(`[LiveDetection] Recovery error for stream ${stream.id}:`, err);
      }
    }
  } catch (err) {
    logger.error("[LiveDetection] Startup recovery failed:", err);
  }
}
