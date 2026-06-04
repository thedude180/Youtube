/**
 * YouTube Viewer Verifier
 *
 * Checks the channel from the **viewer's perspective** — not the API's.
 * Uses the public RSS feed (zero quota) to confirm what viewers actually see,
 * then cross-references against what the system marked as published.
 * For items not found in the RSS feed, a quota-aware YouTube API check
 * confirms whether the video is processing, private, or truly missing.
 */

import { db } from "../db";
import { autopilotQueue, channels as channelsTable, systemSettings } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { fetchChannelVideosViaRss, getAuthenticatedClient } from "../youtube";
import { google } from "googleapis";
import { isQuotaBreakerTripped, canAffordOperation, trackQuotaUsage } from "./youtube-quota-tracker";
import { createLogger } from "../lib/logger";

const logger = createLogger("viewer-verifier");

export interface RssVideo {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
}

export interface PublishedItem {
  queueId: number;
  youtubeId: string;
  title: string;
  contentType: string;
  gameName: string;
  publishedAt: string;
  rssConfirmed: boolean;
  apiStatus: "public" | "private" | "unlisted" | "processing" | "missing" | "unknown" | null;
  youtubeUrl: string;
}

export interface ViewerVerificationResult {
  channelId: string;
  channelUrl: string;
  scannedAt: string;
  rssVideos: RssVideo[];
  recentPublished: PublishedItem[];
  stats: {
    totalPublished: number;
    confirmedVisible: number;
    processing: number;
    missing: number;
    unconfirmed: number;
  };
}

export async function runViewerVerification(userId: string): Promise<ViewerVerificationResult> {
  // 1. Resolve YouTube channel
  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(and(eq(channelsTable.userId, userId), eq(channelsTable.platform, "youtube")))
    .limit(1);

  const youtubeChannelId: string = (channel as any)?.channelId ?? "";
  const channelUrl = youtubeChannelId
    ? `https://www.youtube.com/channel/${youtubeChannelId}`
    : "https://www.youtube.com/@etgaming274";

  // 2. Fetch public RSS feed — zero quota, true viewer perspective
  let rssVideos: RssVideo[] = [];
  if (youtubeChannelId?.startsWith("UC")) {
    try {
      const raw = await fetchChannelVideosViaRss(youtubeChannelId);
      rssVideos = raw.map((v) => ({
        youtubeId: v.youtubeId,
        title: v.title,
        thumbnailUrl:
          v.thumbnailUrl || `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`,
        publishedAt: v.publishedAt,
        viewCount: v.viewCount,
      }));
    } catch (err: any) {
      logger.warn("RSS fetch failed — will rely on API only", { error: err?.message?.substring(0, 120) });
    }
  } else {
    logger.warn("No valid YouTube channel ID found for viewer verification", { userId });
  }

  const rssIdSet = new Set(rssVideos.map((v) => v.youtubeId));

  // 3. Pull recently published queue items (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const queueItems = await db
    .select()
    .from(autopilotQueue)
    .where(
      and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(autopilotQueue.publishedAt))
    .limit(50);

  // Extract only items that have a real YouTube video ID
  const publishedRaw: Array<{
    queueId: number;
    youtubeId: string;
    title: string;
    contentType: string;
    gameName: string;
    publishedAt: string;
  }> = [];

  for (const item of queueItems) {
    const meta = (item.metadata as any) ?? {};
    const ytId =
      meta.youtubeVideoId ||
      meta.youtubeId ||
      meta.publishResult?.youtubeVideoId ||
      meta.publishResult?.videoId;
    if (!ytId || typeof ytId !== "string") continue;
    publishedRaw.push({
      queueId: item.id,
      youtubeId: ytId,
      title: meta.title || meta.originalTitle || meta.optimizedTitle || item.content?.substring(0, 60) || "Untitled",
      contentType: meta.contentType || item.type || "unknown",
      gameName: meta.gameName || meta.game || "",
      publishedAt: (item.publishedAt ?? new Date()).toISOString(),
    });
  }

  // 4. API check for items not confirmed by RSS (quota-aware)
  const notInRss = publishedRaw.filter((p) => !rssIdSet.has(p.youtubeId));
  const apiStatusMap = new Map<string, PublishedItem["apiStatus"]>();

  if (notInRss.length > 0 && channel?.id) {
    try {
      const canAfford = await canAffordOperation(userId, "read").catch(() => true);
      if (!isQuotaBreakerTripped() && canAfford) {
        const { oauth2Client } = await getAuthenticatedClient(channel.id);
        const yt = google.youtube({ version: "v3", auth: oauth2Client });
        const ids = notInRss.slice(0, 50).map((p) => p.youtubeId);

        const resp = await yt.videos.list({ part: ["status"], id: ids });
        await trackQuotaUsage(userId, "list", 1).catch(() => {});

        const foundById = new Map(
          (resp.data.items ?? []).map((v) => [v.id!, v]),
        );

        for (const p of notInRss) {
          const v = foundById.get(p.youtubeId);
          if (!v) {
            apiStatusMap.set(p.youtubeId, "missing");
          } else {
            const upload = v.status?.uploadStatus ?? "";
            const privacy = v.status?.privacyStatus ?? "unknown";
            if (upload === "processing" || upload === "uploaded") {
              apiStatusMap.set(p.youtubeId, "processing");
            } else if (privacy === "public") {
              apiStatusMap.set(p.youtubeId, "public");
            } else {
              apiStatusMap.set(p.youtubeId, privacy as PublishedItem["apiStatus"]);
            }
          }
        }
        logger.info("YouTube API check complete", {
          checked: ids.length,
          found: foundById.size,
          missing: ids.length - foundById.size,
        });
      }
    } catch (err: any) {
      logger.warn("YouTube API check failed — RSS-only results", {
        error: err?.message?.substring(0, 120),
      });
    }
  }

  // 5. Build unified result list
  const recentPublished: PublishedItem[] = publishedRaw.map((p) => ({
    ...p,
    rssConfirmed: rssIdSet.has(p.youtubeId),
    apiStatus: apiStatusMap.get(p.youtubeId) ?? null,
    youtubeUrl: `https://www.youtube.com/watch?v=${p.youtubeId}`,
  }));

  const confirmedVisible = recentPublished.filter(
    (p) => p.rssConfirmed || p.apiStatus === "public",
  ).length;
  const processing = recentPublished.filter((p) => p.apiStatus === "processing").length;
  const missing = recentPublished.filter((p) => p.apiStatus === "missing").length;
  const unconfirmed = recentPublished.length - confirmedVisible - processing - missing;

  const result: ViewerVerificationResult = {
    channelId: youtubeChannelId,
    channelUrl,
    scannedAt: new Date().toISOString(),
    rssVideos,
    recentPublished,
    stats: {
      totalPublished: recentPublished.length,
      confirmedVisible,
      processing,
      missing,
      unconfirmed,
    },
  };

  // 6. Cache to system_settings
  try {
    const key = `viewer_verification:last_run:${userId}`;
    await db
      .insert(systemSettings)
      .values({ key, value: JSON.stringify(result) })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: JSON.stringify(result) },
      });
  } catch (err: any) {
    logger.warn("Failed to cache verification result", { error: err?.message });
  }

  logger.info("Viewer verification complete", {
    userId,
    rssCount: rssVideos.length,
    systemPublished: recentPublished.length,
    confirmedVisible,
    processing,
    missing,
  });

  return result;
}

export async function getLastViewerVerification(
  userId: string,
): Promise<ViewerVerificationResult | null> {
  try {
    const key = `viewer_verification:last_run:${userId}`;
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    if (!row?.value) return null;
    return JSON.parse(row.value) as ViewerVerificationResult;
  } catch {
    return null;
  }
}
