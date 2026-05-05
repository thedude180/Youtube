import { db } from "./db";
import { videos, channels, autopilotQueue, streams } from "@shared/schema";
import { eq, and, desc, gte, isNotNull } from "drizzle-orm";
import { logger } from "./lib/logger";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";

interface ContentVerification {
  id: number;
  type: "video" | "vod" | "short" | "post" | "live_stream";
  platform: string;
  title: string;
  platformId?: string;
  platformUrl?: string;
  status: "verified" | "failed" | "pending" | "checking" | "not_found";
  lastChecked: string;
  details: {
    isAccessible: boolean;
    isPublic: boolean;
    hasDuration: boolean;
    durationSeconds?: number;
    viewCount?: number;
    uploadStatus?: string;
    privacyStatus?: string;
    processingStatus?: string;
    error?: string;
  };
}

interface LiveStreamHealth {
  streamId: number;
  platform: string;
  title: string;
  status: "healthy" | "degraded" | "offline" | "unknown";
  isActuallyBroadcasting: boolean;
  viewerCount?: number;
  bitrate?: string;
  uptime?: string;
  lastHealthCheck: string;
  healthHistory: { timestamp: string; status: string; viewers?: number }[];
}

interface VerificationReport {
  userId: string;
  timestamp: string;
  summary: {
    totalContent: number;
    verified: number;
    failed: number;
    pending: number;
    verificationRate: number;
  };
  liveStreams: LiveStreamHealth[];
  recentVerifications: ContentVerification[];
  platformBreakdown: Record<string, { total: number; verified: number; failed: number }>;
}

async function getValidToken(userId: string, platform: string): Promise<string | null> {
  const GOOGLE_PLATFORMS = new Set(["youtube", "youtubeshorts"]);
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, platform)));
  const channel = userChannels.find(c => c.accessToken);
  if (!channel?.accessToken) return null;

  if (channel.tokenExpiresAt && new Date(channel.tokenExpiresAt) <= new Date(Date.now() + 5 * 60 * 1000) && channel.refreshToken) {
    try {
      let tokenUrl: string;
      let body: Record<string, string>;
      let headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

      if (GOOGLE_PLATFORMS.has(platform)) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) return channel.accessToken;
        tokenUrl = "https://oauth2.googleapis.com/token";
        body = { grant_type: "refresh_token", refresh_token: channel.refreshToken, client_id: clientId, client_secret: clientSecret };
      } else {
        const { OAUTH_CONFIGS } = await import("./oauth-config");
        const config = OAUTH_CONFIGS[platform as keyof typeof OAUTH_CONFIGS];
        if (!config) return channel.accessToken;
        const clientId = process.env[config.clientIdEnv];
        const clientSecret = process.env[config.clientSecretEnv];
        if (!clientId || !clientSecret) return channel.accessToken;
        tokenUrl = config.tokenUrl;
        body = { grant_type: "refresh_token", refresh_token: channel.refreshToken, client_id: clientId, client_secret: clientSecret };
      }

      const abortCtrl = new AbortController();
      const abortTimer = setTimeout(() => abortCtrl.abort(), 15000);
      const res = await fetch(tokenUrl, { method: "POST", headers, body: new URLSearchParams(body).toString(), signal: abortCtrl.signal });
      clearTimeout(abortTimer);
      if (res.ok) {
        const data = await res.json() as any;
        const newToken = data.access_token;
        const expiresIn = data.expires_in;
        const newExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
        await storage.updateChannel(channel.id, {
          accessToken: newToken,
          refreshToken: data.refresh_token || channel.refreshToken,
          tokenExpiresAt: newExpiry,
        });
        return newToken;
      }
    } catch (err: any) {
      logger.warn("[ContentVerification] Token refresh failed", { platform, error: err.message });
    }
  }

  return channel.accessToken;
}

async function verifyYouTubeVideo(userId: string, videoId: string): Promise<ContentVerification["details"]> {
  const token = await getValidToken(userId, "youtube");
  if (!token) return { isAccessible: false, isPublic: false, hasDuration: false, error: "No YouTube credentials" };

  try {
    const ytCtrl = new AbortController();
    const ytTimer = setTimeout(() => ytCtrl.abort(), 15000);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails,statistics&id=${videoId}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ytCtrl.signal }
    );
    clearTimeout(ytTimer);

    if (!res.ok) {
      return { isAccessible: false, isPublic: false, hasDuration: false, error: `YouTube API ${res.status}` };
    }

    const data = await res.json() as any;
    const video = data.items?.[0];

    if (!video) {
      return { isAccessible: false, isPublic: false, hasDuration: false, error: "Video not found on YouTube" };
    }

    const uploadStatus = video.status?.uploadStatus;
    const privacyStatus = video.status?.privacyStatus;
    const duration = video.contentDetails?.duration || "";
    const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const durationSeconds = durationMatch
      ? (parseInt(durationMatch[1] || "0") * 3600) + (parseInt(durationMatch[2] || "0") * 60) + parseInt(durationMatch[3] || "0")
      : 0;

    return {
      isAccessible: uploadStatus === "processed" || uploadStatus === "uploaded",
      isPublic: privacyStatus === "public" || privacyStatus === "unlisted",
      hasDuration: durationSeconds > 0,
      durationSeconds,
      viewCount: parseInt(video.statistics?.viewCount || "0"),
      uploadStatus,
      privacyStatus,
      processingStatus: video.status?.processingDetails?.processingStatus,
    };
  } catch (err: any) {
    return { isAccessible: false, isPublic: false, hasDuration: false, error: err.message };
  }
}

async function verifyYouTubeLiveStream(userId: string, broadcastId: string): Promise<LiveStreamHealth> {
  const token = await getValidToken(userId, "youtube");
  const base: LiveStreamHealth = {
    streamId: 0,
    platform: "youtube",
    title: "",
    status: "unknown",
    isActuallyBroadcasting: false,
    lastHealthCheck: new Date().toISOString(),
    healthHistory: [],
  };

  if (!token) return { ...base, status: "unknown" };

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status,snippet,statistics&id=${broadcastId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return { ...base, status: "unknown" };

    const data = await res.json() as any;
    const broadcast = data.items?.[0];

    if (!broadcast) return { ...base, status: "offline", isActuallyBroadcasting: false };

    const lifeCycleStatus = broadcast.status?.lifeCycleStatus;
    const isLive = lifeCycleStatus === "live";
    const isReady = lifeCycleStatus === "ready" || lifeCycleStatus === "testing";

    return {
      ...base,
      title: broadcast.snippet?.title || "",
      status: isLive ? "healthy" : isReady ? "degraded" : "offline",
      isActuallyBroadcasting: isLive,
      viewerCount: parseInt(broadcast.statistics?.concurrentViewers || "0"),
    };
  } catch (err: any) {
    return { ...base, status: "unknown" };
  }
}

// DISABLED: Twitch verification — YouTube-only mode.
async function verifyTwitchLiveStream(_userId: string, _channelRow: any): Promise<LiveStreamHealth> {
  return { streamId: 0, platform: "twitch", title: "", status: "unknown", isActuallyBroadcasting: false, lastHealthCheck: new Date().toISOString(), healthHistory: [] };
}

// DISABLED: Kick verification — YouTube-only mode.
async function verifyKickLiveStream(_userId: string, _channelRow: any): Promise<LiveStreamHealth> {
  return { streamId: 0, platform: "kick", title: "", status: "unknown", isActuallyBroadcasting: false, lastHealthCheck: new Date().toISOString(), healthHistory: [] };
}

// DISABLED: TikTok content verification — YouTube-only mode.
async function verifyTikTokContent(_userId: string, _publishId: string): Promise<ContentVerification["details"]> {
  return { isAccessible: false, isPublic: false, hasDuration: false, error: "YouTube-only mode — TikTok verification disabled" };
}


function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export async function verifyAllUserContent(userId: string): Promise<VerificationReport> {
  const report: VerificationReport = {
    userId,
    timestamp: new Date().toISOString(),
    summary: { totalContent: 0, verified: 0, failed: 0, pending: 0, verificationRate: 0 },
    liveStreams: [],
    recentVerifications: [],
    platformBreakdown: {},
  };

  const [userVideos, publishedPosts, userStreams] = await Promise.all([
    db.select().from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(and(
        eq(channels.userId, userId),
        isNotNull(videos.publishedAt),
      ))
      .orderBy(desc(videos.publishedAt))
      .limit(50),

    db.select().from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
      ))
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(50),

    storage.getStreams(userId),
  ]);

  const liveStreams = userStreams.filter(s => s.status === "live");
  for (const stream of liveStreams) {
    const platformsList = (stream.platforms as string[]) || [];
    const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));

    for (const platform of platformsList) {
      let health: LiveStreamHealth | null = null;
      const channelRow = userChannels.find(c => c.platform === platform);

      if (platform === "youtube") {
        health = await verifyYouTubeLiveStream(userId, stream.title);
      } else if (platform === "twitch" && channelRow) {
        health = await verifyTwitchLiveStream(userId, channelRow);
      } else if (platform === "kick" && channelRow) {
        health = await verifyKickLiveStream(userId, channelRow);
      }

      if (health) {
        health.streamId = stream.id;
        health.title = stream.title;
        report.liveStreams.push(health);
      }
    }
  }

  const platformMap: Record<string, { total: number; verified: number; failed: number }> = {};

  for (const row of userVideos) {
    const video = row.videos;
    const channel = row.channels;
    const meta = (video.metadata as any) || {};
    const youtubeId = meta.youtubeId;
    const platform = video.platform || "youtube";

    if (!platformMap[platform]) platformMap[platform] = { total: 0, verified: 0, failed: 0 };
    platformMap[platform].total++;
    report.summary.totalContent++;

    if (youtubeId && platform === "youtube") {
      const details = await verifyYouTubeVideo(userId, youtubeId);
      const isVerified = details.isAccessible && details.hasDuration;
      const verification: ContentVerification = {
        id: video.id,
        type: video.type === "short" ? "short" : "video",
        platform,
        title: video.title,
        platformId: youtubeId,
        platformUrl: `https://youtube.com/watch?v=${youtubeId}`,
        status: isVerified ? "verified" : details.error?.includes("retry") ? "pending" : "failed",
        lastChecked: new Date().toISOString(),
        details,
      };
      report.recentVerifications.push(verification);

      if (isVerified) {
        report.summary.verified++;
        platformMap[platform].verified++;
      } else {
        report.summary.failed++;
        platformMap[platform].failed++;
      }
    } else {
      report.summary.pending++;
    }
  }

  for (const post of publishedPosts) {
    const meta = (post.metadata as any) || {};
    const publishResult = meta.publishResult || {};
    const postId = publishResult.postId;
    const platform = post.targetPlatform;

    if (!platformMap[platform]) platformMap[platform] = { total: 0, verified: 0, failed: 0 };
    platformMap[platform].total++;
    report.summary.totalContent++;

    if (post.verificationStatus === "verified") {
      report.summary.verified++;
      platformMap[platform].verified++;

      report.recentVerifications.push({
        id: post.id,
        type: "post",
        platform,
        title: post.content?.substring(0, 80) || "Post",
        platformId: postId,
        platformUrl: meta.verification?.platformUrl || publishResult.postUrl,
        status: "verified",
        lastChecked: meta.verification?.lastAttempt || new Date().toISOString(),
        details: {
          isAccessible: true,
          isPublic: true,
          hasDuration: false,
          viewCount: meta.verification?.viewCount,
        },
      });
      continue;
    }

    if (!postId) {
      report.summary.pending++;
      continue;
    }

    let details: ContentVerification["details"];
    if (platform === "youtube" || platform === "youtubeshorts") {
      details = await verifyYouTubeVideo(userId, postId);
    } else if (platform === "tiktok") {
      details = await verifyTikTokContent(userId, postId);
    } else if (platform === "discord") {
      details = { isAccessible: true, isPublic: true, hasDuration: false };
    } else {
      report.summary.pending++;
      continue;
    }

    const isVerified = details.isAccessible;
    report.recentVerifications.push({
      id: post.id,
      type: "post",
      platform,
      title: post.content?.substring(0, 80) || "Post",
      platformId: postId,
      platformUrl: publishResult.postUrl,
      status: isVerified ? "verified" : details.error?.includes("retry") || details.error?.includes("Rate") ? "pending" : "failed",
      lastChecked: new Date().toISOString(),
      details,
    });

    if (isVerified) {
      report.summary.verified++;
      platformMap[platform].verified++;
    } else {
      report.summary.failed++;
      platformMap[platform].failed++;
    }
  }

  report.platformBreakdown = platformMap;
  report.summary.verificationRate = report.summary.totalContent > 0
    ? Math.round((report.summary.verified / report.summary.totalContent) * 100)
    : 0;

  return report;
}

export async function verifyLiveStreamHealth(userId: string): Promise<LiveStreamHealth[]> {
  const userStreams = await storage.getStreams(userId);
  const liveStreams = userStreams.filter(s => s.status === "live");

  if (liveStreams.length === 0) return [];

  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const healthResults: LiveStreamHealth[] = [];

  for (const stream of liveStreams) {
    const platformsList = (stream.platforms as string[]) || [];

    for (const platform of platformsList) {
      const channelRow = userChannels.find(c => c.platform === platform);

      if (channelRow && !channelRow.accessToken && !channelRow.refreshToken) continue;

      let health: LiveStreamHealth | null = null;

      if (platform === "youtube") {
        health = await verifyYouTubeLiveStream(userId, stream.title);
      } else if (platform === "twitch" && channelRow) {
        health = await verifyTwitchLiveStream(userId, channelRow);
      } else if (platform === "kick" && channelRow) {
        health = await verifyKickLiveStream(userId, channelRow);
      }

      if (health) {
        health.streamId = stream.id;
        health.title = stream.title;
        healthResults.push(health);
      }
    }
  }

  return healthResults;
}

export async function runContentVerificationSweep() {
  const allChannelUsers = await db.select({ userId: channels.userId }).from(channels);
  const userIds = Array.from(new Set(allChannelUsers.map(c => c.userId).filter(Boolean)));

  let totalVerified = 0;
  let totalFailed = 0;
  let totalLiveHealthy = 0;
  let totalLiveDegraded = 0;

  for (const userId of userIds) {
    if (!userId) continue;

    try {
      const liveHealth = await verifyLiveStreamHealth(userId);
      for (const h of liveHealth) {
        if (h.status === "healthy") totalLiveHealthy++;
        else if (h.status === "degraded" || h.status === "offline") totalLiveDegraded++;

        if (h.status === "offline" && h.isActuallyBroadcasting === false) {
          await storage.createNotification({
            userId,
            type: "stream_health",
            title: `${h.platform.charAt(0).toUpperCase() + h.platform.slice(1)} Stream Health Warning`,
            message: `"${h.title}" may not be broadcasting on ${h.platform}. Stream appears offline.`,
            severity: "warning",
          });
          sendSSEEvent(userId, "notification", { type: "new" });
        }
      }

      const { verifyAllRecentUploads } = await import("./publish-verifier");
      await verifyAllRecentUploads();

      const recentPublished = await db.select().from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
          eq(autopilotQueue.verificationStatus, "verified"),
          gte(autopilotQueue.publishedAt, new Date(Date.now() - 48 * 60 * 60 * 1000)),
        ))
        .limit(10);

      for (const post of recentPublished) {
        const meta = (post.metadata as any) || {};
        const postId = meta.publishResult?.postId;
        if (!postId) continue;

        let stillLive = false;
        const platform = post.targetPlatform;

        if (platform === "youtube" || platform === "youtubeshorts") {
          const details = await verifyYouTubeVideo(userId, postId);
          stillLive = details.isAccessible;
          if (!stillLive && !details.error?.includes("Rate")) {
            await db.update(autopilotQueue)
              .set({
                verificationStatus: "failed",
                metadata: {
                  ...meta,
                  verification: {
                    ...(meta.verification || {}),
                    recheck: true,
                    recheckAt: new Date().toISOString(),
                    recheckResult: "content_removed",
                    error: details.error || "Video no longer accessible",
                  },
                },
              })
              .where(eq(autopilotQueue.id, post.id));
            totalFailed++;

            await storage.createNotification({
              userId,
              type: "content_verification",
              title: `Content removed from ${platform}`,
              message: `A previously verified post is no longer accessible on ${platform}. It may have been removed or flagged.`,
              severity: "warning",
            });
            sendSSEEvent(userId, "notification", { type: "new" });

            // Content removal email disabled — in-app notification handles this.
            continue;
          }
        }

        totalVerified++;
      }

      await storage.createAuditLog({
        userId,
        action: "content_verification_sweep",
        target: "all_platforms",
        details: {
          liveStreams: liveHealth.length,
          liveHealthy: liveHealth.filter(h => h.status === "healthy").length,
          timestamp: new Date().toISOString(),
        },
        riskLevel: "low",
      });

    } catch (err: any) {
      logger.warn("[ContentVerification] Sweep error for user", { userId, error: err.message });
    }
  }

}

export async function getVerificationDashboard(userId: string) {
  const [recentPosts, userStreams, userVideos] = await Promise.all([
    db.select().from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
      ))
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(100),

    storage.getStreams(userId),

    db.select({
      id: videos.id,
      title: videos.title,
      type: videos.type,
      status: videos.status,
      platform: videos.platform,
      metadata: videos.metadata,
      publishedAt: videos.publishedAt,
    }).from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(and(
        eq(channels.userId, userId),
        isNotNull(videos.publishedAt),
      ))
      .orderBy(desc(videos.publishedAt))
      .limit(50),
  ]);

  const verifiedPosts = recentPosts.filter(p => p.verificationStatus === "verified");
  const failedPosts = recentPosts.filter(p => p.verificationStatus === "failed");
  const pendingPosts = recentPosts.filter(p => p.verificationStatus === "unverified" || p.verificationStatus === "pending");
  const publishedPosts = recentPosts.filter(p => p.publishedAt);

  const liveStreams = userStreams.filter(s => s.status === "live");
  const endedStreams = userStreams.filter(s => s.status === "ended");

  const platformStats: Record<string, { published: number; verified: number; failed: number; pending: number }> = {};
  for (const post of recentPosts) {
    const p = post.targetPlatform;
    if (!platformStats[p]) platformStats[p] = { published: 0, verified: 0, failed: 0, pending: 0 };
    platformStats[p].published++;
    if (post.verificationStatus === "verified") platformStats[p].verified++;
    else if (post.verificationStatus === "failed") platformStats[p].failed++;
    else platformStats[p].pending++;
  }

  const contentItems = recentPosts.map(post => {
    const meta = (post.metadata as any) || {};
    const verification = meta.verification || {};
    return {
      id: post.id,
      type: post.type,
      platform: post.targetPlatform,
      title: (post.content || "").substring(0, 100),
      status: post.verificationStatus || "unverified",
      publishedAt: post.publishedAt?.toISOString(),
      verifiedAt: post.verifiedAt?.toISOString(),
      platformUrl: verification.platformUrl || meta.publishResult?.postUrl,
      platformStatus: verification.platformStatus,
      attempts: verification.attempts || 0,
      error: verification.error,
      isRecheck: verification.recheck || false,
    };
  });

  const videoItems = userVideos.map(v => {
    const meta = (v.metadata as any) || {};
    return {
      id: v.id,
      type: v.type,
      platform: v.platform || "youtube",
      title: v.title,
      status: meta.youtubeId ? "on_platform" : "local_only",
      publishedAt: v.publishedAt?.toISOString(),
      platformUrl: meta.youtubeId ? `https://youtube.com/watch?v=${meta.youtubeId}` : null,
      youtubeId: meta.youtubeId,
      viewCount: meta.viewCount,
      duration: meta.duration,
    };
  });

  return {
    summary: {
      totalPublished: publishedPosts.length,
      verified: verifiedPosts.length,
      failed: failedPosts.length,
      pending: pendingPosts.length,
      verificationRate: publishedPosts.length > 0
        ? Math.round((verifiedPosts.length / publishedPosts.length) * 100) : 0,
      liveStreamsActive: liveStreams.length,
      totalStreams: userStreams.length,
      totalVideos: userVideos.length,
    },
    platformStats,
    liveStreams: liveStreams.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      platforms: s.platforms,
      startedAt: s.startedAt?.toISOString(),
      stats: s.streamStats,
    })),
    recentContent: contentItems.slice(0, 30),
    recentVideos: videoItems.slice(0, 20),
    endedStreams: endedStreams.slice(0, 10).map(s => ({
      id: s.id,
      title: s.title,
      startedAt: s.startedAt?.toISOString(),
      endedAt: s.endedAt?.toISOString(),
      platforms: s.platforms,
      stats: s.streamStats,
    })),
  };
}
