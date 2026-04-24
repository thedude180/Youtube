import { google } from "googleapis";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { trackQuotaUsage, getQuotaStatus, canAffordOperation, persistQuotaExhaustion } from "./youtube-quota-tracker";
import { fireAgentEvent } from "./agent-events";

const logger = createLogger("upload-watcher");

function parseDurationToSeconds(isoDuration: string | null): number {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
}

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
const SCAN_INTERVAL_MIN = 45;   // base: ~45 minutes between upload checks
const SCAN_INTERVAL_JITTER = 20; // ±20 minutes random jitter — looks organic, avoids pattern detection

/** Returns a randomised delay between (base - jitter) and (base + jitter) minutes */
function nextScanDelayMs(): number {
  const jitter = (Math.random() * 2 - 1) * SCAN_INTERVAL_JITTER; // -20 to +20
  return Math.max(20, SCAN_INTERVAL_MIN + jitter) * 60 * 1000;
}
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
  if (!channel.accessToken && !channel.refreshToken) throw new Error("Channel has no access token");
  if (channel.accessToken === "dev_api_key_mode") {
    throw Object.assign(new Error("dev_bypass: no real YouTube credentials in dev mode"), { code: "DEV_BYPASS" });
  }
  // Proactively skip an expired access token so the oauth2 client goes straight
  // to the refresh path instead of sending a stale token and waiting for a 401.
  let accessToken: string | null = channel.accessToken ?? null;
  if (accessToken && channel.tokenExpiresAt) {
    const isExpired = new Date(channel.tokenExpiresAt).getTime() < Date.now() + 60_000;
    if (isExpired) {
      logger.info(`[UploadWatcher] Access token for channel ${channel.id} is expired — relying on refresh token`);
      accessToken = null;
    }
  }
  // If both are missing, there's nothing we can do
  if (!accessToken && !channel.refreshToken) throw new Error("Channel has no valid access token or refresh token");

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken ?? undefined,
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

async function runQuickGameDetection(userId: string, videoId: number): Promise<string | null> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return null;
    const meta = (video.metadata as any) || {};
    if (meta.gameName && meta.gameName !== "Unknown" && meta.gameName !== "Gaming") {
      return meta.gameName;
    }

    const searchText = `${video.title || ""} ${video.description || ""}`;
    const { detectGameFromLearned, lookupGameFromWeb, lookupGameWithAI, persistGameToDatabase } = await import("./web-game-lookup");

    const learnedMatch = detectGameFromLearned(searchText);
    if (learnedMatch) {
      await persistGameToDatabase(learnedMatch, "learned-cache-pipeline");
      await storage.updateVideo(videoId, { metadata: { ...meta, gameName: learnedMatch, gameDetectionMethod: "learned-db", gameDetectedAt: new Date().toISOString() } });
      logger.info(`[${userId}] Quick game detect (learned): "${learnedMatch}" for video ${videoId}`);
      return learnedMatch;
    }

    const webGame = await lookupGameFromWeb(searchText);
    if (webGame) {
      await persistGameToDatabase(webGame, "web-lookup-pipeline");
      await storage.updateVideo(videoId, { metadata: { ...meta, gameName: webGame, gameDetectionMethod: "web-lookup", gameDetectedAt: new Date().toISOString() } });
      logger.info(`[${userId}] Quick game detect (web): "${webGame}" for video ${videoId}`);
      return webGame;
    }

    const aiGame = await lookupGameWithAI(video.title || "", video.description || "");
    if (aiGame) {
      await persistGameToDatabase(aiGame, "ai-text-pipeline");
      await storage.updateVideo(videoId, { metadata: { ...meta, gameName: aiGame, gameDetectionMethod: "ai-text-analysis", gameDetectedAt: new Date().toISOString() } });
      logger.info(`[${userId}] Quick game detect (AI): "${aiGame}" for video ${videoId}`);
      return aiGame;
    }
  } catch (err: any) {
    logger.warn(`[${userId}] Quick game detection failed for video ${videoId}: ${err.message}`);
  }
  return null;
}

async function runFullEditingPipeline(userId: string, videoId: number, channelId: number): Promise<void> {
  const video = await storage.getVideo(videoId);
  if (!video) return;

  // Defer heavy AI work when streaming is active to protect announcement budget.
  try {
    const { isLiveStreamActive } = await import("../priority-orchestrator");
    if (isLiveStreamActive(userId)) {
      logger.info(`[${userId}] Stream active — deferring editing pipeline for video ${videoId} by 2h`);
      setTimeout(() => {
        runFullEditingPipeline(userId, videoId, channelId).catch(err =>
          logger.warn(`[${userId}] Deferred editing pipeline failed for video ${videoId}: ${err.message?.substring(0, 200)}`)
        );
      }, 2 * 60 * 60_000);
      return;
    }
  } catch {}

  const durationSec = (video.metadata as any)?.durationSec || 0;
  const isLongForm = durationSec >= 900;

  const detectedGame = await runQuickGameDetection(userId, videoId);
  if (detectedGame) {
    logger.info(`[${userId}] Game "${detectedGame}" identified BEFORE pipeline — SEO + thumbnail will use it`);
  }

  if (isLongForm) {
    try {
      const { queueVideoForSmartEdit, processSmartEditQueue } = await import("../smart-edit-engine");
      const jobId = await queueVideoForSmartEdit(userId, videoId);
      if (jobId) {
        processSmartEditQueue(userId).catch(() => undefined);
        logger.info(`[${userId}] Smart-edit queued for video ${videoId} (job ${jobId})`);
      }
    } catch (err: any) {
      logger.warn(`[${userId}] Smart-edit queue failed for video ${videoId}: ${err.message}`);
    }
  } else {
    try {
      const { startShortsPipeline } = await import("../shorts-pipeline-engine");
      await startShortsPipeline(userId, "new-only");
      logger.info(`[${userId}] Shorts pipeline triggered for short video ${videoId}`);
    } catch (err: any) {
      logger.warn(`[${userId}] Shorts pipeline failed for video ${videoId}: ${err.message}`);
    }
  }

  try {
    const { vodSEOOptimizer } = await import("./vod-seo-optimizer");
    await vodSEOOptimizer.optimize(userId, videoId);
    logger.info(`[${userId}] SEO optimization completed for video ${videoId}`);
  } catch (err: any) {
    logger.warn(`[${userId}] SEO optimization failed for video ${videoId}: ${err.message}`);
  }

  if (durationSec >= 3600) {
    try {
      const { maximizeContentFromVideo } = await import("./content-maximizer");
      const result = await maximizeContentFromVideo(userId, videoId);
      logger.info(`[${userId}] Content maximizer: ${result.shortsQueued} shorts + ${result.longFormsQueued} long-forms queued, ${result.experimentsCreated} experiments`);
    } catch (err: any) {
      logger.warn(`[${userId}] Content maximizer failed for video ${videoId}: ${err.message}`);
    }
  }

  try {
    const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
    await generateThumbnailForNewVideo(userId, videoId);
    logger.info(`[${userId}] Thumbnail generation completed for video ${videoId}`);
  } catch (err: any) {
    logger.warn(`[${userId}] Thumbnail gen failed for video ${videoId}: ${err.message}`);
  }

  try {
    const { repurposeVideo } = await import("../repurpose-engine");
    await repurposeVideo(userId, videoId, ["blog", "twitter_thread", "instagram_caption"]);
    logger.info(`[${userId}] Repurpose triggered for video ${videoId}`);
  } catch (err: any) {
    logger.warn(`[${userId}] Repurpose failed for video ${videoId}: ${err.message}`);
  }
}

async function scanUserForNewUploads(userId: string): Promise<{ newUploads: number; scanned: number }> {
  const { isQuotaBreakerTripped: breaker } = await import("./youtube-quota-tracker");
  if (breaker()) return { newUploads: 0, scanned: 0 };
  // Tier-2 gate: upload detection uses playlist reads — only run when enough
  // quota remains for actual uploads (Tier-1, no alternative).
  // canAffordOperation("read") requires remaining >= 1 + SAFETY_BUFFER + UPLOAD_RESERVE.
  const canScan = await canAffordOperation(userId, "read");
  if (!canScan) {
    logger.info(`[${userId}] Upload watcher skipped — quota reserved for uploads/metadata`);
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
          youtubeVideoId: v.id,
          youtubeUrl: `https://youtube.com/watch?v=${v.id}`,
          tags: v.snippet?.tags || [],
          duration,
          durationSec: parseDurationToSeconds(duration),
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
    // Stagger event firing so per-video setTimeout cascades don't all start
    // at the same moment and collide in the same AI budget windows.
    createdVideoIds.forEach((videoId, index) => {
      const delayMs = index * 8_000;
      setTimeout(() => {
        fireAgentEvent("upload.detected", userId, { videoId, count: createdVideoIds.length });
      }, delayMs);
    });

    // Process editing pipelines one at a time with a gap between each video
    // to avoid hammering the AI API with concurrent requests.
    const INTER_VIDEO_DELAY_MS = 10_000;
    for (let i = 0; i < createdVideoIds.length; i++) {
      const videoId = createdVideoIds[i];
      try {
        await runFullEditingPipeline(userId, videoId, ytChannel.id);
      } catch (err: any) {
        logger.warn(`[${userId}] Full editing pipeline failed for video ${videoId}: ${err.message?.substring(0, 200)}`);
      }
      if (i < createdVideoIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, INTER_VIDEO_DELAY_MS));
      }
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

  // Initial scan after a short warmup delay
  setTimeout(() => runWatcherScan(userId), 20_000);

  // Jitter-based scheduler — each scan re-schedules the next with a random delay
  // (25–65 min window) instead of a fixed clock tick. Looks organic, prevents
  // bursty API calls at predictable intervals, and works with the quota tracker.
  function scheduleNextScan() {
    const state = watcherSessions.get(userId);
    if (!state) return; // watcher was stopped
    const delayMs = nextScanDelayMs();
    const delayMin = Math.round(delayMs / 60000);
    logger.debug(`[${userId}] Next upload scan in ~${delayMin} min`);
    const handle = setTimeout(async () => {
      await runWatcherScan(userId).catch(() => {});
      scheduleNextScan();
    }, delayMs);
    // Store handle as intervalHandle so stopUploadWatcher can clear it
    if (state) state.intervalHandle = handle as any;
  }
  scheduleNextScan();

  logger.info(`[${userId}] YouTube upload watcher started — scanning every ~${SCAN_INTERVAL_MIN}±${SCAN_INTERVAL_JITTER} min`);
}

export function stopUploadWatcher(userId: string): void {
  const state = watcherSessions.get(userId);
  if (state?.intervalHandle) {
    clearTimeout(state.intervalHandle as any);
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
      ? new Date(state.lastScanAt.getTime() + SCAN_INTERVAL_MIN * 60 * 1000).toISOString()
      : null,
  };
}

export function getAllUploadWatcherStatuses(): { userId: string; status: ReturnType<typeof getUploadWatcherStatus> }[] {
  return Array.from(watcherSessions.keys()).map(uid => ({ userId: uid, status: getUploadWatcherStatus(uid) }));
}

async function backfillCatalogEditing(userId: string): Promise<void> {
  try {
    const allVideos = await storage.getVideosByUser(userId);
    const { db } = await import("../db");
    const { autopilotQueue } = await import("@shared/schema");
    const { eq, and, or } = await import("drizzle-orm");

    const existingSmartEditJobs = await db.select({
      sourceVideoId: autopilotQueue.sourceVideoId,
    }).from(autopilotQueue).where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "smart-edit"),
      or(
        eq(autopilotQueue.status, "pending"),
        eq(autopilotQueue.status, "processing"),
        eq(autopilotQueue.status, "completed"),
      ),
    ));
    const processedVideoIds = new Set(existingSmartEditJobs.map(j => j.sourceVideoId).filter(Boolean));

    const needsProcessing = allVideos.filter((v: any) => {
      if (processedVideoIds.has(v.id)) return false;
      const meta = v.metadata as any;
      const durationSec = meta?.durationSec || parseDurationToSeconds(meta?.duration || null);
      if (durationSec > 0 && durationSec < 60) return false;
      if (v.type === "short" || v.type === "clip") return false;
      if (meta?.isShort) return false;
      return true;
    });

    if (!needsProcessing.length) {
      logger.info(`[${userId}] Catalog backfill: all ${allVideos.length} videos already processed`);
      return;
    }

    logger.info(`[${userId}] Catalog backfill: ${needsProcessing.length} videos need full editing pipeline (of ${allVideos.length} total)`);

    const userChannels = await storage.getChannelsByUser(userId);
    const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
    const channelId = ytChannel?.id || 0;

    for (let i = 0; i < needsProcessing.length; i++) {
      const video = needsProcessing[i];
      try {
        await runFullEditingPipeline(userId, video.id, channelId);
        logger.info(`[${userId}] Backfill ${i + 1}/${needsProcessing.length}: processed "${video.title}" (${video.id})`);
      } catch (err: any) {
        logger.warn(`[${userId}] Backfill failed for video ${video.id}: ${err.message?.substring(0, 200)}`);
      }
      if (i < needsProcessing.length - 1) {
        await new Promise(r => setTimeout(r, 15_000));
      }
    }

    logger.info(`[${userId}] Catalog backfill complete — ${needsProcessing.length} videos queued for editing`);
  } catch (err: any) {
    logger.warn(`[${userId}] Catalog backfill error: ${err.message}`);
  }
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
            setTimeout(() => backfillCatalogEditing(user.id).catch(() => undefined), 60_000);
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
