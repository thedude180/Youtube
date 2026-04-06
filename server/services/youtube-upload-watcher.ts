import { google } from "googleapis";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { trackQuotaUsage, getQuotaStatus } from "./youtube-quota-tracker";
import { fireAgentEvent } from "./agent-events";

const logger = createLogger("upload-watcher");

interface UploadWatcherState {
  userId: string;
  lastScanAt: Date | null;
  lastNewUploads: number;
  totalUploadsFound: number;
  scansCompleted: number;
  lastError: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
}

const watcherSessions = new Map<string, UploadWatcherState>();
const SCAN_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RESULTS_PER_SCAN = 25;
const UPLOAD_AGE_HOURS = 25;

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
      try { await storage.updateChannel(channel.id, updates); } catch (e) { logger.warn(`[UploadWatcher] Failed to save refreshed token for channel ${channel.id}:`, e); }
    }
  });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function scanUserForNewUploads(userId: string): Promise<{ newUploads: number; scanned: number }> {
  const quota = await getQuotaStatus(userId);
  if (quota.remaining < 50) {
    logger.warn(`[${userId}] Upload watcher skipped — quota too low (${quota.remaining} remaining)`);
    return { newUploads: 0, scanned: 0 };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
  if (!ytChannel) return { newUploads: 0, scanned: 0 };

  const yt = await getAuthenticatedYouTube(ytChannel);

  const channelResp = await yt.channels.list({ part: ["contentDetails"], mine: true });
  await trackQuotaUsage(userId, "list", 1);

  const uploadsPlaylistId = channelResp.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { newUploads: 0, scanned: 0 };

  const playlistResp = await yt.playlistItems.list({
    part: ["contentDetails"],
    playlistId: uploadsPlaylistId,
    maxResults: MAX_RESULTS_PER_SCAN,
  });
  await trackQuotaUsage(userId, "list", 1);

  const videoIds = (playlistResp.data.items || [])
    .map((item: any) => item.contentDetails?.videoId)
    .filter(Boolean) as string[];
  if (!videoIds.length) return { newUploads: 0, scanned: 0 };

  const videosResp = await yt.videos.list({
    part: ["snippet", "contentDetails", "statistics", "liveStreamingDetails"],
    id: videoIds,
  });
  await trackQuotaUsage(userId, "list", 1);

  const cutoffDate = new Date(Date.now() - UPLOAD_AGE_HOURS * 60 * 60 * 1000);

  const regularUploads = (videosResp.data.items || []).filter((v: any) => {
    const lsd = v.liveStreamingDetails;
    if (lsd?.actualStartTime) return false;
    const publishedAt = new Date(v.snippet?.publishedAt || 0);
    return publishedAt >= cutoffDate;
  });

  if (!regularUploads.length) return { newUploads: 0, scanned: videoIds.length };

  const existingVideos = await storage.getVideosByUser(userId);
  const existingYouTubeIds = new Set(
    existingVideos
      .map((v: any) => (v.metadata as any)?.youtubeId)
      .filter(Boolean)
  );

  const trulyNew = regularUploads.filter((v: any) => !existingYouTubeIds.has(v.id));
  if (!trulyNew.length) return { newUploads: 0, scanned: videoIds.length };

  const createdVideoIds: number[] = [];
  for (const v of trulyNew) {
    try {
      const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : new Date();
      const duration = v.contentDetails?.duration || null;

      const dbVideo = await storage.createVideo({
        channelId: ytChannel.id,
        title: v.snippet?.title || "Untitled Upload",
        description: v.snippet?.description || "",
        thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
        type: "regular_upload",
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
          autoIngested: true,
          autoIngestedAt: new Date().toISOString(),
        } as any,
      });

      createdVideoIds.push(dbVideo.id);
      logger.info(`[${userId}] Auto-ingested new upload: "${v.snippet?.title}" (${v.id})`);
    } catch (err: any) {
      logger.warn(`[${userId}] Failed to ingest upload ${v.id}: ${err.message}`);
    }
  }

  if (createdVideoIds.length > 0) {
    try {
      const { startShortsPipeline } = await import("../shorts-pipeline-engine");
      await startShortsPipeline(userId, "new-only");
      logger.info(`[${userId}] Shorts pipeline triggered for ${createdVideoIds.length} new uploads`);
    } catch (err: any) {
      logger.warn(`[${userId}] Failed to trigger shorts pipeline: ${err.message}`);
    }

    for (const videoId of createdVideoIds) {
      try {
        const { repurposeVideo } = await import("../repurpose-engine");
        await repurposeVideo(userId, videoId, ["blog", "twitter_thread", "instagram_caption"]);
        logger.info(`[${userId}] Repurpose triggered for video ${videoId}`);
      } catch (err: any) {
        logger.warn(`[${userId}] Repurpose failed for video ${videoId}: ${err.message}`);
      }
    }

    for (const videoId of createdVideoIds) {
      fireAgentEvent("upload.detected", userId, { videoId, count: createdVideoIds.length });
    }
  }

  return { newUploads: trulyNew.length, scanned: videoIds.length };
}

async function runWatcherScan(userId: string): Promise<void> {
  const state = watcherSessions.get(userId);
  if (!state) return;

  try {
    const result = await scanUserForNewUploads(userId);
    state.lastScanAt = new Date();
    state.lastNewUploads = result.newUploads;
    state.totalUploadsFound += result.newUploads;
    state.scansCompleted++;
    state.lastError = null;
    if (result.newUploads > 0) {
      logger.info(`[${userId}] Upload scan complete — ${result.newUploads} new uploads ingested from ${result.scanned} checked`);
    }
  } catch (err: any) {
    if (state) {
      state.lastError = err.message;
      state.lastScanAt = new Date();
    }
    logger.warn(`[${userId}] Upload watcher scan error: ${err.message}`);
  }
}

export async function startUploadWatcher(userId: string): Promise<void> {
  const existing = watcherSessions.get(userId);
  if (existing?.intervalHandle) return;

  const state: UploadWatcherState = {
    userId,
    lastScanAt: null,
    lastNewUploads: 0,
    totalUploadsFound: 0,
    scansCompleted: 0,
    lastError: null,
    intervalHandle: null,
  };
  watcherSessions.set(userId, state);

  setTimeout(() => runWatcherScan(userId), 20_000);

  state.intervalHandle = setInterval(() => {
    runWatcherScan(userId).catch(() => {});
  }, SCAN_INTERVAL_MS);

  logger.info(`[${userId}] YouTube upload watcher started — scanning every ${SCAN_INTERVAL_MS / 60000} minutes`);
}

export function stopUploadWatcher(userId: string): void {
  const state = watcherSessions.get(userId);
  if (state?.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
    watcherSessions.delete(userId);
  }
}

export function getUploadWatcherStatus(userId: string) {
  const state = watcherSessions.get(userId);
  if (!state) return { active: false, lastScanAt: null, lastNewUploads: 0, totalUploadsFound: 0, scansCompleted: 0, lastError: null, nextScanAt: null };
  return {
    active: !!state.intervalHandle,
    lastScanAt: state.lastScanAt?.toISOString() ?? null,
    lastNewUploads: state.lastNewUploads,
    totalUploadsFound: state.totalUploadsFound,
    scansCompleted: state.scansCompleted,
    lastError: state.lastError,
    nextScanAt: state.lastScanAt
      ? new Date(state.lastScanAt.getTime() + SCAN_INTERVAL_MS).toISOString()
      : null,
  };
}

export function getAllUploadWatcherStatuses(): { userId: string; status: ReturnType<typeof getUploadWatcherStatus> }[] {
  return Array.from(watcherSessions.keys()).map(uid => ({ userId: uid, status: getUploadWatcherStatus(uid) }));
}

export async function bootstrapUploadWatchers(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const eligibleUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[upload-watcher] Bootstrapping watchers for ${eligibleUsers.length} paid users`);
    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      setTimeout(async () => {
        try {
          const userChannels = await storage.getChannelsByUser(user.id);
          const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
          if (hasYouTube) {
            await startUploadWatcher(user.id);
          }
        } catch (err: any) {
          logger.warn(`[upload-watcher] Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 5000);
    }
  } catch (err: any) {
    logger.error(`[upload-watcher] Bootstrap DB error: ${err.message}`);
  }
}

export async function scanUserNow(userId: string): Promise<void> {
  const session = watcherSessions.get(userId);
  if (!session) return;
  try {
    const result = await scanUserForNewUploads(userId);
    session.lastNewUploads = result.newUploads;
    session.totalUploadsFound += result.newUploads;
    session.scansCompleted++;
    session.lastScanAt = new Date();
    logger.info(`[${userId}] On-demand scan: ${result.newUploads} new uploads`);
  } catch (err: any) {
    session.lastError = err.message;
    logger.warn(`[${userId}] On-demand scan failed: ${err.message}`);
  }
}

export async function initUploadWatcherForUser(userId: string): Promise<void> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
    if (hasYouTube) {
      await startUploadWatcher(userId);
      logger.info(`[${userId}] Upload watcher initialized on user connect`);
    }
  } catch (err: any) {
    logger.warn(`[upload-watcher] Init failed for ${userId}: ${err.message}`);
  }
}
