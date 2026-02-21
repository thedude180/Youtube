import { db } from "./db";
import { channels, contentClips, autopilotQueue } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "./storage";
import { createLogger } from "./lib/logger";

const logger = createLogger("tiktok-publisher");
import { processClipForTikTok, cleanupClipFile } from "./clip-video-processor";
import * as fs from "fs";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

interface TikTokPublishResult {
  success: boolean;
  publishId?: string;
  error?: string;
}

async function getTikTokChannel(userId: string) {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "tiktok")));

  return userChannels.find(c => c.accessToken);
}

async function refreshTikTokToken(channel: any): Promise<string | null> {
  if (channel.tokenExpiresAt && new Date(channel.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return channel.accessToken;
  }

  if (!channel.refreshToken) return channel.accessToken;

  const clientId = process.env.TIKTOK_CLIENT_ID;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return channel.accessToken;

  try {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: channel.refreshToken,
        client_key: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      logger.error("TikTok token refresh failed", { status: res.status });
      return channel.accessToken;
    }

    const data = await res.json() as any;
    const newToken = data.access_token;
    const newRefresh = data.refresh_token || channel.refreshToken;
    const expiresIn = data.expires_in;
    const newExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    await storage.updateChannel(channel.id, {
      accessToken: newToken,
      refreshToken: newRefresh,
      tokenExpiresAt: newExpiry,
    });

    logger.info("TikTok token refreshed", { channelId: channel.id });
    return newToken;
  } catch (err: any) {
    logger.error("TikTok token refresh error", { error: err.message });
    return channel.accessToken;
  }
}

async function getCreatorInfo(accessToken: string): Promise<{ privacyOptions: string[] } | null> {
  try {
    const res = await fetch(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      logger.warn("TikTok creator info query failed", { status: res.status });
      return null;
    }

    const data = await res.json() as any;
    return {
      privacyOptions: data.data?.privacy_level_options || ["SELF_ONLY"],
    };
  } catch (err: any) {
    logger.warn("TikTok creator info error", { error: err.message });
    return null;
  }
}

async function initializeVideoUpload(
  accessToken: string,
  fileSize: number,
  title: string,
  privacyLevel: string,
  enableMonetization: boolean = false,
): Promise<{ uploadUrl: string; publishId: string } | { error: string }> {
  const chunkSize = Math.min(fileSize, 10_000_000);
  const totalChunks = Math.ceil(fileSize / chunkSize);

  const postInfo: any = {
    title: title.slice(0, 2200),
    privacy_level: privacyLevel,
    disable_duet: false,
    disable_comment: false,
    disable_stitch: false,
    video_cover_timestamp_ms: 1000,
  };

  if (enableMonetization) {
    postInfo.brand_content_toggle = false;
    postInfo.brand_organic_toggle = false;
    logger.info("TikTok monetization flags set for upload", { enableMonetization });
  }

  const body = {
    post_info: postInfo,
    source_info: {
      source: "FILE_UPLOAD",
      video_size: fileSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunks,
    },
  };

  try {
    const res = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;

    if (data.error?.code !== "ok" && data.error?.code !== undefined) {
      return { error: `TikTok init failed: ${data.error?.message || data.error?.code || "Unknown error"}` };
    }

    const uploadUrl = data.data?.upload_url;
    const publishId = data.data?.publish_id;

    if (!uploadUrl) {
      return { error: "TikTok did not return an upload URL" };
    }

    return { uploadUrl, publishId };
  } catch (err: any) {
    return { error: `TikTok init request failed: ${err.message}` };
  }
}

async function uploadVideoChunks(
  uploadUrl: string,
  filePath: string,
  fileSize: number,
): Promise<{ success: boolean; error?: string }> {
  const chunkSize = Math.min(fileSize, 10_000_000);
  const totalChunks = Math.ceil(fileSize / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const chunk = fs.readFileSync(filePath).subarray(start, end);

    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${start}-${end - 1}/${fileSize}`,
          "Content-Length": String(chunk.length),
        },
        body: chunk,
      });

      if (!res.ok && res.status !== 201 && res.status !== 206) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `Chunk ${i + 1}/${totalChunks} upload failed (${res.status}): ${errText.substring(0, 200)}` };
      }

      logger.info("TikTok chunk uploaded", { chunk: i + 1, total: totalChunks, bytes: chunk.length });
    } catch (err: any) {
      return { success: false, error: `Chunk ${i + 1} upload error: ${err.message}` };
    }
  }

  return { success: true };
}

async function checkPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<{ status: string; videoId?: string }> {
  try {
    const res = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await res.json() as any;
    return {
      status: data.data?.status || "unknown",
      videoId: data.data?.publicaly_available_post_id?.[0],
    };
  } catch {
    return { status: "unknown" };
  }
}

export async function publishClipToTikTok(
  clipId: number,
  userId: string,
  caption: string,
): Promise<TikTokPublishResult> {
  logger.info("Publishing clip to TikTok", { clipId, userId });

  const channel = await getTikTokChannel(userId);
  if (!channel) {
    return { success: false, error: "No TikTok account connected. Connect your TikTok in Content > Channels." };
  }

  const accessToken = await refreshTikTokToken(channel);
  if (!accessToken) {
    return { success: false, error: "Failed to get valid TikTok access token. Please reconnect your TikTok account." };
  }

  const videoResult = await processClipForTikTok(clipId, userId);
  if (!videoResult) {
    return { success: false, error: "Failed to process video clip. Source video may be unavailable or clip timestamps are invalid." };
  }

  let clipFilePath = videoResult.filePath;

  try {
    const creatorInfo = await getCreatorInfo(accessToken);
    const privacyLevel = creatorInfo?.privacyOptions?.includes("PUBLIC_TO_EVERYONE")
      ? "PUBLIC_TO_EVERYONE"
      : creatorInfo?.privacyOptions?.[0] || "SELF_ONLY";

    const tiktokCaption = optimizeCaptionForTikTok(caption);

    const { isMonetizationUnlocked } = await import("./services/monetization-check");
    const monetizationEnabled = await isMonetizationUnlocked(userId, "tiktok");

    const initResult = await initializeVideoUpload(
      accessToken,
      videoResult.fileSize,
      tiktokCaption,
      privacyLevel,
      monetizationEnabled,
    );

    if ("error" in initResult) {
      return { success: false, error: initResult.error };
    }

    const uploadResult = await uploadVideoChunks(
      initResult.uploadUrl,
      clipFilePath,
      videoResult.fileSize,
    );

    if (!uploadResult.success) {
      return { success: false, error: uploadResult.error || "Video upload failed" };
    }

    let finalStatus = "processing";
    let videoId: string | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      const status = await checkPublishStatus(accessToken, initResult.publishId);
      finalStatus = status.status;
      videoId = status.videoId;

      if (finalStatus === "PUBLISH_COMPLETE" || finalStatus === "PUBLISHED") break;
      if (finalStatus === "FAILED") {
        return { success: false, error: "TikTok rejected the video after upload. Check content guidelines." };
      }
    }

    logger.info("TikTok publish initiated", {
      clipId,
      publishId: initResult.publishId,
      status: finalStatus,
    });

    return {
      success: true,
      publishId: initResult.publishId,
    };
  } finally {
    cleanupClipFile(clipFilePath);
  }
}

function optimizeCaptionForTikTok(caption: string): string {
  let optimized = caption
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (optimized.length > 2200) {
    optimized = optimized.substring(0, 2197) + "...";
  }

  return optimized;
}

export async function publishVideoToTikTok(
  userId: string,
  content: string,
  metadata?: any,
): Promise<TikTokPublishResult> {
  const clipId = metadata?.clipId;

  if (clipId) {
    return publishClipToTikTok(clipId, userId, content);
  }

  const sourceVideoId = metadata?.sourceVideoId;
  if (sourceVideoId) {
    const clips = await storage.getContentClips(userId);
    const matchingClip = clips.find(c =>
      c.sourceVideoId === sourceVideoId &&
      c.targetPlatform === "tiktok" &&
      c.status === "pending"
    );

    if (matchingClip) {
      return publishClipToTikTok(matchingClip.id, userId, content);
    }
  }

  return {
    success: false,
    error: "TikTok requires a video clip. No matching clip found for this post. Run the shorts pipeline to generate clips first.",
  };
}
