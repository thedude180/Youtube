import { db } from "../db";
import { videoCatalogLinks, channels } from "@shared/schema";
import { eq, and, inArray, desc, count, sql } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { trackQuotaUsage, getQuotaStatus } from "./youtube-quota-tracker";
import { fireAgentEvent } from "./agent-events";

const logger = createLogger("catalog-sync");

const SYNC_INTERVAL_MS = 4 * 3600_000;
let syncInterval: ReturnType<typeof setInterval> | null = null;

function parseDurationToSeconds(isoDuration: string | null | undefined): number {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
}

function getOAuth2Client() {
  const { google } = require("googleapis");
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
  const { google } = require("googleapis");
  if (!channel.accessToken) throw new Error("Channel has no access token");
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: channel.accessToken,
    refresh_token: channel.refreshToken,
    expiry_date: channel.tokenExpiresAt ? new Date(channel.tokenExpiresAt).getTime() : undefined,
  });
  oauth2Client.on("tokens", async (tokens: any) => {
    const updates: any = {};
    if (tokens.access_token) updates.accessToken = tokens.access_token;
    if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updates.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(updates).length > 0) {
      try { await storage.updateChannel(channel.id, updates); } catch {}
    }
  });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

export async function syncFullCatalog(userId: string): Promise<{
  total: number;
  newLinks: number;
  updated: number;
  errors: number;
}> {
  const quota = await getQuotaStatus(userId);
  if (quota.remaining < 100) {
    logger.warn(`[${userId}] Catalog sync skipped — quota too low (${quota.remaining})`);
    return { total: 0, newLinks: 0, updated: 0, errors: 0 };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
  if (!ytChannel) {
    logger.warn(`[${userId}] No authenticated YouTube channel found`);
    return { total: 0, newLinks: 0, updated: 0, errors: 0 };
  }

  const yt = await getAuthenticatedYouTube(ytChannel);

  const channelResp = await yt.channels.list({ part: ["contentDetails"], mine: true });
  await trackQuotaUsage(userId, "list", 1);

  const uploadsPlaylistId = channelResp.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    logger.warn(`[${userId}] No uploads playlist found`);
    return { total: 0, newLinks: 0, updated: 0, errors: 0 };
  }

  const allVideoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const quotaCheck = await getQuotaStatus(userId);
    if (quotaCheck.remaining < 20) {
      logger.warn(`[${userId}] Quota running low during catalog pull — stopping at ${allVideoIds.length} videos`);
      break;
    }

    const playlistResp = await yt.playlistItems.list({
      part: ["contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    });
    await trackQuotaUsage(userId, "list", 1);

    const ids = (playlistResp.data.items || [])
      .map((item: any) => item.contentDetails?.videoId)
      .filter(Boolean) as string[];
    allVideoIds.push(...ids);

    pageToken = playlistResp.data.nextPageToken || undefined;
  } while (pageToken);

  logger.info(`[${userId}] Found ${allVideoIds.length} videos in uploads playlist`);

  if (!allVideoIds.length) return { total: 0, newLinks: 0, updated: 0, errors: 0 };

  const existing = await db.select({ youtubeId: videoCatalogLinks.youtubeId })
    .from(videoCatalogLinks)
    .where(eq(videoCatalogLinks.userId, userId));
  const existingIds = new Set(existing.map(e => e.youtubeId));

  let newLinks = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50);

    const quotaCheck = await getQuotaStatus(userId);
    if (quotaCheck.remaining < 10) {
      logger.warn(`[${userId}] Quota exhausted during detail fetch — processed ${i} of ${allVideoIds.length}`);
      break;
    }

    try {
      const videosResp = await yt.videos.list({
        part: ["snippet", "contentDetails", "statistics", "status", "liveStreamingDetails"],
        id: batch,
      });
      await trackQuotaUsage(userId, "list", 1);

      for (const v of (videosResp.data.items || [])) {
        try {
          const youtubeId = v.id;
          if (!youtubeId) continue;

          const durationSec = parseDurationToSeconds(v.contentDetails?.duration);
          const isShort = durationSec > 0 && durationSec <= 60;
          const isStream = !!v.liveStreamingDetails?.actualStartTime;
          const videoType = isShort ? "short" : isStream ? "stream_vod" : "regular";

          const linkData = {
            userId,
            channelId: ytChannel.id,
            youtubeId,
            shareLink: `https://youtu.be/${youtubeId}`,
            fullUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
            title: v.snippet?.title || "Untitled",
            description: (v.snippet?.description || "").substring(0, 5000),
            thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
            duration: v.contentDetails?.duration || null,
            durationSec,
            publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
            viewCount: Number(v.statistics?.viewCount || 0),
            likeCount: Number(v.statistics?.likeCount || 0),
            commentCount: Number(v.statistics?.commentCount || 0),
            tags: v.snippet?.tags || [],
            privacyStatus: v.status?.privacyStatus || "public",
            videoType,
            lastSyncedAt: new Date(),
            metadata: {
              categoryId: v.snippet?.categoryId,
              isLiveContent: isStream,
              streamStartedAt: v.liveStreamingDetails?.actualStartTime || null,
              streamEndedAt: v.liveStreamingDetails?.actualEndTime || null,
              definition: v.contentDetails?.definition || "hd",
              dimension: v.contentDetails?.dimension || "2d",
            },
          };

          if (existingIds.has(youtubeId)) {
            await db.update(videoCatalogLinks).set({
              title: linkData.title,
              viewCount: linkData.viewCount,
              likeCount: linkData.likeCount,
              commentCount: linkData.commentCount,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            }).where(and(
              eq(videoCatalogLinks.userId, userId),
              eq(videoCatalogLinks.youtubeId, youtubeId),
            ));
            updated++;
          } else {
            await db.insert(videoCatalogLinks).values(linkData);
            existingIds.add(youtubeId);
            newLinks++;
          }
        } catch (err: any) {
          errors++;
          logger.warn(`[${userId}] Failed to process video ${v.id}: ${err.message?.substring(0, 200)}`);
        }
      }
    } catch (err: any) {
      if (err.code === 403 || err.message?.includes("quota")) {
        logger.warn(`[${userId}] Quota hit during batch fetch — stopping`);
        break;
      }
      errors++;
      logger.warn(`[${userId}] Batch fetch error: ${err.message?.substring(0, 200)}`);
    }

    if (i + 50 < allVideoIds.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  logger.info(`[${userId}] Catalog sync complete: ${newLinks} new, ${updated} updated, ${errors} errors (${allVideoIds.length} total)`);
  return { total: allVideoIds.length, newLinks, updated, errors };
}

export async function processUnprocessedCatalog(userId: string): Promise<{
  processed: number;
  scheduled: number;
  errors: number;
}> {
  const unprocessed = await db.select().from(videoCatalogLinks)
    .where(and(
      eq(videoCatalogLinks.userId, userId),
      eq(videoCatalogLinks.editingStatus, "unprocessed"),
    ))
    .orderBy(desc(videoCatalogLinks.publishedAt))
    .limit(10);

  if (!unprocessed.length) {
    return { processed: 0, scheduled: 0, errors: 0 };
  }

  let processed = 0;
  let scheduled = 0;
  let errors = 0;

  for (const link of unprocessed) {
    try {
      await db.update(videoCatalogLinks).set({
        editingStatus: "processing",
        editingStartedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(videoCatalogLinks.id, link.id));

      const existingVideos = await storage.getVideosByUser(userId);
      let dbVideo = existingVideos.find((v: any) => (v.metadata as any)?.youtubeId === link.youtubeId);

      if (!dbVideo) {
        dbVideo = await storage.createVideo({
          channelId: link.channelId,
          title: link.title,
          description: link.description || "",
          thumbnailUrl: link.thumbnailUrl || "",
          type: link.videoType || "regular",
          status: "ingested",
          platform: "youtube",
          publishedAt: link.publishedAt || undefined,
          metadata: {
            youtubeId: link.youtubeId,
            youtubeUrl: link.fullUrl,
            tags: link.tags || [],
            duration: link.duration,
            durationSec: link.durationSec,
            viewCount: link.viewCount,
            likeCount: link.likeCount,
            commentCount: link.commentCount,
            privacyStatus: link.privacyStatus,
            autoIngested: true,
            autoIngestedAt: new Date().toISOString(),
            catalogSyncId: link.id,
          } as any,
        });
      }

      const editingResult: Record<string, any> = {
        dbVideoId: dbVideo.id,
        ingestedAt: new Date().toISOString(),
      };

      const durationSec = link.durationSec || 0;
      const isLongForm = durationSec >= 900;

      if (isLongForm) {
        try {
          const { queueVideoForSmartEdit, processSmartEditQueue } = await import("../smart-edit-engine");
          const jobId = await queueVideoForSmartEdit(userId, dbVideo.id);
          if (jobId) {
            processSmartEditQueue(userId).catch(() => undefined);
            editingResult.smartEditJobId = jobId;
          }
        } catch (err: any) {
          logger.warn(`[${userId}] Smart-edit failed for catalog video ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
        }

        try {
          const { maximizeContentFromVideo } = await import("./content-maximizer");
          const maxResult = await maximizeContentFromVideo(userId, dbVideo.id);
          editingResult.contentMaximizer = maxResult;
        } catch (err: any) {
          logger.warn(`[${userId}] Content maximizer failed for ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
        }
      }

      try {
        const { startShortsPipeline } = await import("../shorts-pipeline-engine");
        await startShortsPipeline(userId, "new-only");
        editingResult.shortsPipelineTriggered = true;
      } catch (err: any) {
        logger.warn(`[${userId}] Shorts pipeline failed for ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
      }

      try {
        const { vodSEOOptimizer } = await import("./vod-seo-optimizer");
        vodSEOOptimizer.optimize(userId, dbVideo.id).catch(() => undefined);
        editingResult.seoOptimized = true;
      } catch (err: any) {
        logger.warn(`[${userId}] SEO optimize failed for ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
      }

      try {
        const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
        generateThumbnailForNewVideo(userId, dbVideo.id).catch(() => undefined);
        editingResult.thumbnailGenerated = true;
      } catch (err: any) {
        logger.warn(`[${userId}] Thumbnail gen failed for ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
      }

      try {
        const { repurposeVideo } = await import("../repurpose-engine");
        await repurposeVideo(userId, dbVideo.id, ["blog", "twitter_thread", "instagram_caption"]);
        editingResult.repurposed = true;
      } catch (err: any) {
        logger.warn(`[${userId}] Repurpose failed for ${link.youtubeId}: ${err.message?.substring(0, 150)}`);
      }

      await db.update(videoCatalogLinks).set({
        editingStatus: "completed",
        editingCompletedAt: new Date(),
        editingResult,
        scheduledForUpload: true,
        uploadScheduledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(videoCatalogLinks.id, link.id));

      processed++;
      scheduled++;

      fireAgentEvent("upload.detected", userId, {
        videoId: dbVideo.id,
        source: "catalog-sync",
        youtubeId: link.youtubeId,
      });

      logger.info(`[${userId}] Catalog video processed: "${link.title}" (${link.youtubeId}) — editing complete, scheduled for distribution`);

      await new Promise(r => setTimeout(r, 5000));
    } catch (err: any) {
      errors++;
      await db.update(videoCatalogLinks).set({
        editingStatus: "failed",
        editingResult: { error: err.message?.substring(0, 500) },
        updatedAt: new Date(),
      }).where(eq(videoCatalogLinks.id, link.id));
      logger.warn(`[${userId}] Catalog processing failed for ${link.youtubeId}: ${err.message?.substring(0, 200)}`);
    }
  }

  return { processed, scheduled, errors };
}

export async function getCatalogStatus(userId: string): Promise<{
  totalLinks: number;
  unprocessed: number;
  processing: number;
  completed: number;
  failed: number;
  scheduledForUpload: number;
  uploaded: number;
  lastSyncedAt: string | null;
  links: any[];
}> {
  const allLinks = await db.select().from(videoCatalogLinks)
    .where(eq(videoCatalogLinks.userId, userId))
    .orderBy(desc(videoCatalogLinks.publishedAt));

  const statusCounts = {
    unprocessed: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  let scheduledForUpload = 0;
  let uploaded = 0;
  let lastSyncedAt: string | null = null;

  for (const link of allLinks) {
    const status = link.editingStatus as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status]++;
    if (link.scheduledForUpload) scheduledForUpload++;
    if (link.uploadCompletedAt) uploaded++;
    if (link.lastSyncedAt) {
      const syncStr = new Date(link.lastSyncedAt).toISOString();
      if (!lastSyncedAt || syncStr > lastSyncedAt) lastSyncedAt = syncStr;
    }
  }

  return {
    totalLinks: allLinks.length,
    ...statusCounts,
    scheduledForUpload,
    uploaded,
    lastSyncedAt,
    links: allLinks.map(l => ({
      id: l.id,
      youtubeId: l.youtubeId,
      shareLink: l.shareLink,
      title: l.title,
      duration: l.duration,
      durationSec: l.durationSec,
      viewCount: l.viewCount,
      publishedAt: l.publishedAt,
      videoType: l.videoType,
      editingStatus: l.editingStatus,
      scheduledForUpload: l.scheduledForUpload,
      derivedContentCount: l.derivedContentCount,
      lastSyncedAt: l.lastSyncedAt,
    })),
  };
}

export async function retryFailedCatalogItems(userId: string): Promise<number> {
  const result = await db.update(videoCatalogLinks).set({
    editingStatus: "unprocessed",
    editingStartedAt: null,
    editingCompletedAt: null,
    editingResult: {},
    updatedAt: new Date(),
  }).where(and(
    eq(videoCatalogLinks.userId, userId),
    eq(videoCatalogLinks.editingStatus, "failed"),
  ));

  return 0;
}

async function runCatalogCycle(): Promise<void> {
  logger.info("Catalog sync cycle starting");

  try {
    const allUsers = await storage.getAllUsers();
    const eligible = allUsers.filter((u: any) => u.tier && u.tier !== "free");

    for (const user of eligible) {
      try {
        const userChannels = await storage.getChannelsByUser(user.id);
        const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
        if (!hasYouTube) continue;

        await syncFullCatalog(user.id);

        await new Promise(r => setTimeout(r, 3000));

        await processUnprocessedCatalog(user.id);
      } catch (err: any) {
        logger.warn(`[${user.id}] Catalog cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Catalog sync cycle error: ${err.message?.substring(0, 300)}`);
  }
}

export function startCatalogSync(): void {
  if (syncInterval) return;

  setTimeout(() => {
    runCatalogCycle().catch(err =>
      logger.warn("Initial catalog cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 180_000);

  syncInterval = setInterval(() => {
    runCatalogCycle().catch(err =>
      logger.warn("Periodic catalog cycle failed", { error: String(err).substring(0, 200) })
    );
  }, SYNC_INTERVAL_MS);

  logger.info("Channel Catalog Sync started (4h cycle)");
}

export function stopCatalogSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
