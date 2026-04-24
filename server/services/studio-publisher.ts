/**
 * studio-publisher.ts
 *
 * Extracts the core YouTube publish logic from server/routes/studio.ts into a
 * standalone async function that can be called by background services (the
 * stream-editor auto-publisher poller) without going through HTTP.
 *
 * Mirrors the route logic 1:1 — same cleanup, same thumbnail upload, same
 * status updates — but takes studioVideoId + userId directly instead of an
 * HTTP request.
 */

import * as fs from "fs";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { trackQuotaUsage, markQuotaErrorFromResponse } from "./youtube-quota-tracker";

const logger = createLogger("studio-publisher");

type StudioMeta = {
  tags?: string[];
  categoryId?: string;
  privacyStatus?: string;
  channelId?: number;
  customThumbnail?: string;
  thumbnailPrompt?: string;
  thumbnailOptions?: Array<{ url: string; prompt: string; predictedCtr?: number }>;
  endScreen?: { enabled: boolean; elements: any[] };
  publishProgress?: number;
  publishStatus?: string;
  publishedYoutubeId?: string;
  seoScore?: number;
  scheduledPublishAt?: string;
  autoScheduled?: boolean;
  autopilotQueueId?: number;
  [key: string]: unknown;
};

async function freshMeta(id: number): Promise<StudioMeta> {
  const v = await storage.getStudioVideo(id);
  return (v?.metadata ?? {}) as StudioMeta;
}

async function setMeta(id: number, partial: Partial<StudioMeta>): Promise<void> {
  const current = await freshMeta(id);
  await storage.updateStudioVideo(id, {
    metadata: { ...current, ...partial } as any,
  });
}

/**
 * Publish a Studio video to YouTube.
 *
 * @param studioVideoId  The studio_videos.id to publish
 * @param userId         Owner (for auth verification)
 * @param publishAt      Optional future Date — video stays private on YouTube
 *                       until this time, then auto-publishes. Pass undefined to
 *                       publish immediately as public.
 */
export async function publishStudioVideo(
  studioVideoId: number,
  userId: string,
  publishAt?: Date,
): Promise<{ youtubeId: string | null }> {
  const studioVideo = await storage.getStudioVideo(studioVideoId);
  if (!studioVideo || studioVideo.userId !== userId) {
    throw new Error(`Studio video ${studioVideoId} not found or not owned by user`);
  }

  const meta = (studioVideo.metadata ?? {}) as StudioMeta;
  const channelId = meta.channelId;

  if (!channelId) {
    throw new Error(`Studio video ${studioVideoId} has no channelId in metadata`);
  }

  const hasLocalFile = Boolean(studioVideo.filePath && fs.existsSync(studioVideo.filePath));

  if (!studioVideo.youtubeId && !hasLocalFile) {
    throw new Error(`Studio video ${studioVideoId} has no YouTube ID or local file`);
  }

  await storage.updateStudioVideo(studioVideoId, {
    status: "publishing",
    metadata: { ...meta, publishProgress: 10, publishStatus: "Starting publish…" } as any,
  });

  try {
    const { getAuthenticatedClient } = await import("../youtube");
    const { google } = await import("googleapis");
    const { removeBannedPhrases } = await import("../stealth-guardrails");

    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const cleanTitle = removeBannedPhrases(studioVideo.title).slice(0, 100);
    const cleanDescription = removeBannedPhrases(studioVideo.description || "").slice(0, 5000);
    const cleanTags = (meta.tags || []).map((t: string) => removeBannedPhrases(t)).filter(Boolean).slice(0, 500);

    let publishedVideoId = studioVideo.youtubeId;

    if (hasLocalFile) {
      await setMeta(studioVideoId, { publishProgress: 20, publishStatus: "Uploading video to YouTube…" });

      const videoStatus: Record<string, string> = {
        privacyStatus: publishAt ? "private" : (meta.privacyStatus || "public"),
      };
      if (publishAt) {
        videoStatus.publishAt = publishAt.toISOString();
      }

      const fileStream = fs.createReadStream(studioVideo.filePath!);
      const uploadRes = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: cleanTitle,
            description: cleanDescription,
            tags: cleanTags,
            categoryId: meta.categoryId || "22",
          },
          status: videoStatus,
        },
        media: { mimeType: "video/mp4", body: fileStream },
      });

      publishedVideoId = uploadRes.data.id || publishedVideoId;
      logger.info(`[StudioPublisher] Video uploaded`, { studioVideoId, youtubeId: publishedVideoId });

      await trackQuotaUsage(userId, "upload");
      await storage.updateStudioVideo(studioVideoId, { youtubeId: publishedVideoId });
      await setMeta(studioVideoId, { publishProgress: 50, publishStatus: publishAt ? "Uploaded — scheduled" : "Video uploaded, updating metadata…" });
    } else if (studioVideo.youtubeId) {
      await setMeta(studioVideoId, { publishProgress: 30, publishStatus: "Updating metadata…" });
      await youtube.videos.update({
        part: ["snippet"],
        requestBody: {
          id: studioVideo.youtubeId,
          snippet: {
            title: cleanTitle,
            description: cleanDescription,
            tags: cleanTags,
            categoryId: meta.categoryId || "22",
          },
        },
      });
    }

    await setMeta(studioVideoId, { publishProgress: 60, publishStatus: "Uploading thumbnail…" });

    const latestMeta = await freshMeta(studioVideoId);
    const selectedThumb = latestMeta.customThumbnail || (latestMeta.thumbnailOptions?.[0]?.url);
    if (selectedThumb && selectedThumb.startsWith("data:image") && publishedVideoId) {
      try {
        const base64Data = selectedThumb.split(",")[1];
        const thumbBuffer = Buffer.from(base64Data, "base64");
        const { setYouTubeThumbnail } = await import("../youtube");
        await setYouTubeThumbnail(channelId, publishedVideoId, thumbBuffer, "image/jpeg");
        await trackQuotaUsage(userId, "thumbnail");
      } catch (thumbErr: unknown) {
        logger.warn(`[StudioPublisher] Thumbnail upload failed`, { studioVideoId, error: (thumbErr as Error)?.message });
      }
    }

    const finalStatus = publishAt
      ? `Scheduled for ${publishAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : "Published successfully";

    await storage.updateStudioVideo(studioVideoId, {
      status: publishAt ? "scheduled" : "published",
      metadata: { ...await freshMeta(studioVideoId), publishProgress: 100, publishStatus: finalStatus, publishedYoutubeId: publishedVideoId ?? undefined } as any,
    });

    logger.info(`[StudioPublisher] Done`, { studioVideoId, youtubeId: publishedVideoId, scheduledFor: publishAt?.toISOString() });
    return { youtubeId: publishedVideoId ?? null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[StudioPublisher] Publish failed`, { studioVideoId, error: msg });
    // Trip the circuit breaker if this is a quota 403 so subsequent poller ticks bail early
    markQuotaErrorFromResponse(err);
    await storage.updateStudioVideo(studioVideoId, {
      status: "error",
      metadata: { ...await freshMeta(studioVideoId), publishProgress: 0, publishStatus: `Publish failed: ${msg}` } as any,
    });
    throw err;
  }
}
