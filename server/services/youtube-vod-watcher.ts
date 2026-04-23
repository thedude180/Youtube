import { google } from "googleapis";
import { storage } from "../storage";
import { db } from "../db";
import { videos, channels } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { trackQuotaUsage, getQuotaStatus, canAffordOperation, persistQuotaExhaustion } from "./youtube-quota-tracker";

const logger = createLogger("youtube-vod-watcher");

interface WatcherState {
  userId: string;
  lastScanAt: Date | null;
  lastNewVods: number;
  totalVodsFound: number;
  scansCompleted: number;
  lastError: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
}

const watcherSessions = new Map<string, WatcherState>();
const SCAN_INTERVAL_MIN = 60;    // base: ~60 minutes between VOD scans
const SCAN_INTERVAL_JITTER = 20; // ±20 minutes random jitter

function nextScanDelayMs(): number {
  const jitter = (Math.random() * 2 - 1) * SCAN_INTERVAL_JITTER;
  return Math.max(30, SCAN_INTERVAL_MIN + jitter) * 60 * 1000;
}
const MAX_RESULTS_PER_SCAN = 25;
const MAX_VOD_AGE_DAYS = 30;

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");
  const redirectUri = process.env.REPLIT_DEPLOYMENT
    ? "https://etgaming247.com/api/youtube/callback"
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/youtube/callback`
      : "http://localhost:5000/api/youtube/callback";
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getAuthenticatedYouTube(channel: any) {
  if (!channel.accessToken) throw new Error("Channel has no access token");
  if (channel.accessToken === "dev_api_key_mode") {
    throw Object.assign(new Error("dev_bypass: no real YouTube credentials in dev mode"), { code: "DEV_BYPASS" });
  }
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: channel.accessToken,
    refresh_token: channel.refreshToken,
    expiry_date: channel.tokenExpiresAt ? new Date(channel.tokenExpiresAt).getTime() : undefined,
  });
  oauth2Client.on("tokens", async (tokens) => {
    const updates: any = {};
    if (tokens.access_token) updates.accessToken = tokens.access_token;
    if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updates.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(updates).length > 0) {
      try { await storage.updateChannel(channel.id, updates); } catch (e) { logger.warn(`[VODWatcher] Failed to save refreshed token for channel ${channel.id}:`, e); }
    }
  });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function scanUserForNewVods(userId: string): Promise<{ newVods: number; scanned: number }> {
  const { isQuotaBreakerTripped: breaker } = await import("./youtube-quota-tracker");
  if (breaker()) return { newVods: 0, scanned: 0 };
  // Tier-2 gate: VOD scanning has a scraping alternative — only use API quota
  // when enough headroom exists for uploads (which have no alternative).
  // canAffordOperation("read") requires remaining >= 1 + SAFETY_BUFFER + UPLOAD_RESERVE.
  const canScan = await canAffordOperation(userId, "read");
  if (!canScan) {
    logger.info(`[${userId}] VOD watcher skipped — quota reserved for uploads/metadata`);
    return { newVods: 0, scanned: 0 };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
  if (!ytChannel) return { newVods: 0, scanned: 0 };

  const yt = await getAuthenticatedYouTube(ytChannel);

  const channelResp = await yt.channels.list({ part: ["contentDetails"], mine: true });
  await trackQuotaUsage(userId, "list", 1);

  const uploadsPlaylistId = channelResp.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { newVods: 0, scanned: 0 };

  const playlistResp = await yt.playlistItems.list({
    part: ["contentDetails"],
    playlistId: uploadsPlaylistId,
    maxResults: MAX_RESULTS_PER_SCAN,
  });
  await trackQuotaUsage(userId, "list", 1);

  const videoIds = (playlistResp.data.items || [])
    .map((item: any) => item.contentDetails?.videoId)
    .filter(Boolean) as string[];
  if (!videoIds.length) return { newVods: 0, scanned: 0 };

  const videosResp = await yt.videos.list({
    part: ["snippet", "contentDetails", "statistics", "liveStreamingDetails"],
    id: videoIds,
  });
  await trackQuotaUsage(userId, "list", 1);

  const cutoffDate = new Date(Date.now() - MAX_VOD_AGE_DAYS * 24 * 60 * 60 * 1000);

  const streamVods = (videosResp.data.items || []).filter((v: any) => {
    const lsd = v.liveStreamingDetails;
    if (!lsd?.actualEndTime) return false;
    const publishedAt = new Date(v.snippet?.publishedAt || 0);
    return publishedAt >= cutoffDate;
  });

  if (!streamVods.length) return { newVods: 0, scanned: videoIds.length };

  const existingVideos = await storage.getVideosByUser(userId);
  const existingYouTubeIds = new Set(
    existingVideos
      .map((v: any) => (v.metadata as any)?.youtubeId)
      .filter(Boolean)
  );

  const trulyNew = streamVods.filter((v: any) => !existingYouTubeIds.has(v.id));
  if (!trulyNew.length) return { newVods: 0, scanned: videoIds.length };

  for (const v of trulyNew) {
    try {
      const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : new Date();
      const duration = v.contentDetails?.duration || null;
      const lsd = v.liveStreamingDetails;
      const streamedAt = lsd?.actualStartTime ? new Date(lsd.actualStartTime) : publishedAt;
      const streamEnd = lsd?.actualEndTime ? new Date(lsd.actualEndTime) : null;
      const streamDurationMs = streamEnd ? streamEnd.getTime() - streamedAt.getTime() : null;

      await storage.createVideo({
        channelId: ytChannel.id,
        title: v.snippet?.title || "Untitled Stream",
        description: v.snippet?.description || "",
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
        type: "stream_vod",
        status: "ingested",
        platform: "youtube",
        publishedAt,
        metadata: {
          youtubeId: v.id,
          youtubeUrl: `https://youtube.com/watch?v=${v.id}`,
          tags: v.snippet?.tags || [],
          duration,
          viewCount: Number(v.statistics?.viewCount || 0),
          likeCount: Number(v.statistics?.likeCount || 0),
          commentCount: Number(v.statistics?.commentCount || 0),
          privacyStatus: v.status?.privacyStatus || "public",
          isStreamVod: true,
          streamStartedAt: streamedAt.toISOString(),
          streamEndedAt: streamEnd?.toISOString() || null,
          streamDurationMs,
          autoIngested: true,
          autoIngestedAt: new Date().toISOString(),
        } as any,
      });

      logger.info(`[${userId}] Auto-ingested stream VOD: "${v.snippet?.title}" (${v.id})`);
    } catch (err: any) {
      logger.warn(`[${userId}] Failed to ingest VOD ${v.id}: ${err.message}`);
    }
  }

  if (trulyNew.length > 0) {
    try {
      const { startShortsPipeline } = await import("../shorts-pipeline-engine");
      await startShortsPipeline(userId, "new-only");
      logger.info(`[${userId}] Shorts pipeline triggered for ${trulyNew.length} new stream VODs`);
    } catch (err: any) {
      logger.warn(`[${userId}] Failed to trigger shorts pipeline: ${err.message}`);
    }
  }

  return { newVods: trulyNew.length, scanned: videoIds.length };
}

async function runWatcherScan(userId: string): Promise<void> {
  const state = watcherSessions.get(userId);
  if (!state) return;

  try {
    const result = await scanUserForNewVods(userId);
    state.lastScanAt = new Date();
    state.lastNewVods = result.newVods;
    state.totalVodsFound += result.newVods;
    state.scansCompleted++;
    state.lastError = null;
    if (result.newVods > 0) {
      logger.info(`[${userId}] VOD scan complete — ${result.newVods} new stream VODs ingested from ${result.scanned} videos checked`);
    }
  } catch (err: any) {
    if (err?.code === "DEV_BYPASS") return;
    if (state) {
      state.lastError = err.message;
      state.lastScanAt = new Date();
    }
    const isQuotaErr = err?.message?.toLowerCase().includes("quota") || err?.code === 403 || err?.code === "QUOTA_EXCEEDED";
    if (isQuotaErr) {
      // Stamp the DB so the circuit breaker restore on next startup sees exhausted quota
      persistQuotaExhaustion(userId).catch(() => {});
    }
    logger.warn(`[${userId}] VOD watcher scan error: ${err.message}`);
  }
}

export async function startVodWatcher(userId: string): Promise<void> {
  const existing = watcherSessions.get(userId);
  if (existing?.intervalHandle) return;

  const state: WatcherState = {
    userId,
    lastScanAt: null,
    lastNewVods: 0,
    totalVodsFound: 0,
    scansCompleted: 0,
    lastError: null,
    intervalHandle: null,
  };
  watcherSessions.set(userId, state);

  setTimeout(() => runWatcherScan(userId), 15_000);

  function scheduleNextScan() {
    const st = watcherSessions.get(userId);
    if (!st) return;
    const delayMs = nextScanDelayMs();
    const handle = setTimeout(async () => {
      await runWatcherScan(userId).catch(() => {});
      scheduleNextScan();
    }, delayMs);
    if (st) st.intervalHandle = handle as any;
  }
  scheduleNextScan();

  logger.info(`[${userId}] YouTube VOD watcher started — scanning every ~${SCAN_INTERVAL_MIN}±${SCAN_INTERVAL_JITTER} min`);
}

export function stopVodWatcher(userId: string): void {
  const state = watcherSessions.get(userId);
  if (state?.intervalHandle) {
    clearTimeout(state.intervalHandle as any);
    state.intervalHandle = null;
    watcherSessions.delete(userId);
  }
}

export function getVodWatcherStatus(userId: string) {
  const state = watcherSessions.get(userId);
  if (!state) return { active: false };
  return {
    active: !!state.intervalHandle,
    lastScanAt: state.lastScanAt?.toISOString() ?? null,
    lastNewVods: state.lastNewVods,
    totalVodsFound: state.totalVodsFound,
    scansCompleted: state.scansCompleted,
    lastError: state.lastError,
    nextScanAt: state.lastScanAt
      ? new Date(state.lastScanAt.getTime() + SCAN_INTERVAL_MIN * 60 * 1000).toISOString()
      : null,
  };
}

export function getAllVodWatcherStatuses(): { userId: string; status: ReturnType<typeof getVodWatcherStatus> }[] {
  return Array.from(watcherSessions.keys()).map(uid => ({ userId: uid, status: getVodWatcherStatus(uid) }));
}

export async function bootstrapVodWatchers(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const eligibleUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[VodWatcher] Bootstrapping watchers for ${eligibleUsers.length} paid users`);
    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      setTimeout(async () => {
        try {
          const userChannels = await storage.getChannelsByUser(user.id);
          const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
          if (hasYouTube) {
            await startVodWatcher(user.id);
          }
        } catch (err: any) {
          logger.warn(`[VodWatcher] Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 4000);
    }
  } catch (err: any) {
    logger.error(`[VodWatcher] Bootstrap DB error: ${err.message}`);
  }
}

export async function initVodWatcherForUser(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
    if (hasYouTube) {
      await startVodWatcher(userId);
      logger.info(`[${userId}] VOD watcher initialized on user connect`);
    }
  } catch (err: any) {
    logger.warn(`[VodWatcher] Init failed for ${userId}: ${err.message}`);
  }
}
