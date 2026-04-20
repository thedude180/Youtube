import { google, youtube_v3 } from "googleapis";
import { storage } from "./storage";
import { isQuotaBreakerTripped, markQuotaErrorFromResponse } from "./services/youtube-quota-tracker";
import { createLogger } from "./lib/logger";

const ytLogger = createLogger("youtube");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.channel-memberships.creator",
  "https://www.googleapis.com/auth/youtubepartner",
  "https://www.googleapis.com/auth/youtubepartner-channel-audit",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

const pendingOAuthUsers = new Map<string, { userId: string; timestamp: number }>();

export function setPendingOAuthUser(nonce: string, userId: string) {
  pendingOAuthUsers.set(nonce, { userId, timestamp: Date.now() });
  const now = Date.now();
  const keysToDelete: string[] = [];
  pendingOAuthUsers.forEach((val, key) => {
    if (now - val.timestamp > 10 * 60 * 1000) keysToDelete.push(key);
  });
  keysToDelete.forEach(k => pendingOAuthUsers.delete(k));
}

export function getPendingOAuthUser(nonce: string): string | null {
  const entry = pendingOAuthUsers.get(nonce);
  if (entry) {
    pendingOAuthUsers.delete(nonce);
    return entry.userId;
  }
  return null;
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
      redirectUri = "https://etgaming247.com/api/youtube/callback";
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      redirectUri = `https://${process.env.REPLIT_DEV_DOMAIN}/api/youtube/callback`;
    } else {
      redirectUri = "http://localhost:5000/api/youtube/callback";
    }
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  const nonce = `yt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  setPendingOAuthUser(nonce, userId);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: nonce,
  });
}

export async function handleCallback(code: string, userId: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channelResponse = await youtube.channels.list({
    part: ["snippet", "statistics", "contentDetails"],
    mine: true,
  });

  const ytChannel = channelResponse.data.items?.[0];
  if (!ytChannel) {
    throw new Error("No YouTube channel found for this account");
  }

  const existingChannels = await storage.getChannelsByUser(userId);
  const existingYt = existingChannels.find(c => c.platform === "youtube");

  const subCount = ytChannel.statistics?.subscriberCount != null ? Number(ytChannel.statistics.subscriberCount) : null;
  const vidCount = ytChannel.statistics?.videoCount != null ? Number(ytChannel.statistics.videoCount) : null;
  const vwCount = ytChannel.statistics?.viewCount != null ? Number(ytChannel.statistics.viewCount) : null;

  const channelData = {
    userId,
    platform: "youtube" as const,
    channelName: ytChannel.snippet?.title || "YouTube Channel",
    channelId: ytChannel.id || "",
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token || null,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    subscriberCount: subCount,
    videoCount: vidCount,
    viewCount: vwCount,
    settings: { preset: "normal" as const, autoUpload: true, minShortsPerDay: 3, maxEditsPerDay: 5, cooldownMinutes: 30 },
  };

  let channel;
  if (existingYt) {
    const updateData: any = {
      channelName: channelData.channelName,
      channelId: channelData.channelId,
      accessToken: channelData.accessToken,
      tokenExpiresAt: channelData.tokenExpiresAt,
      subscriberCount: subCount,
      videoCount: vidCount,
      viewCount: vwCount,
      lastSyncAt: new Date(),
    };
    if (tokens.refresh_token) {
      updateData.refreshToken = tokens.refresh_token;
    }
    channel = await storage.updateChannel(existingYt.id, updateData);
  } else {
    channel = await storage.createChannel(channelData);
  }

  const existingShortsChannel = existingChannels.find(c => c.platform === "youtubeshorts");
  const shortsData = {
    userId,
    platform: "youtubeshorts" as const,
    channelName: `${ytChannel.snippet?.title || "YouTube"} Shorts`,
    channelId: ytChannel.id || "",
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token || null,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    settings: { preset: "normal" as const, autoUpload: true, minShortsPerDay: 3, maxEditsPerDay: 5, cooldownMinutes: 30 },
  };

  if (existingShortsChannel) {
    const shortsUpdate: any = {
      channelName: shortsData.channelName,
      channelId: shortsData.channelId,
      accessToken: shortsData.accessToken,
      tokenExpiresAt: shortsData.tokenExpiresAt,
      lastSyncAt: new Date(),
    };
    if (tokens.refresh_token) {
      shortsUpdate.refreshToken = tokens.refresh_token;
    }
    await storage.updateChannel(existingShortsChannel.id, shortsUpdate);
  } else {
    await storage.createChannel(shortsData);
  }

  try {
    const user = await storage.getUser(userId);
    if (user && !user.autopilotActive) {
      await storage.updateUserProfile(userId, { autopilotActive: true });
    }
  } catch (err) {
    ytLogger.error("Failed to auto-enable autopilot", { userId, error: String(err) });
  }

  return {
    channel,
    ytChannel: {
      id: ytChannel.id,
      title: ytChannel.snippet?.title,
      description: ytChannel.snippet?.description,
      thumbnailUrl: ytChannel.snippet?.thumbnails?.default?.url,
      subscriberCount: ytChannel.statistics?.subscriberCount,
      videoCount: ytChannel.statistics?.videoCount,
      viewCount: ytChannel.statistics?.viewCount,
    },
  };
}

export async function getAuthenticatedClient(channelId: number) {
  let channel = await storage.getChannel(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  // Dev sentinel — real API calls would fail with Invalid Credentials
  if (channel.accessToken === "dev_api_key_mode") {
    throw Object.assign(new Error("dev_bypass: no real YouTube credentials in dev mode"), { code: "DEV_BYPASS" });
  }

  // If the access token is missing but a refresh token is stored, proactively
  // exchange the refresh token for a new access token before continuing.
  if (!channel.accessToken && channel.refreshToken) {
    ytLogger.info(`[Auth] accessToken null for channel ${channelId} — attempting refresh`);
    try {
      const { refreshSingleChannel } = await import("./token-refresh");
      const result = await refreshSingleChannel({
        platform: channel.platform,
        refreshToken: channel.refreshToken,
      });
      if (result.success && result.accessToken) {
        const updateData: any = { accessToken: result.accessToken };
        if (result.refreshToken) updateData.refreshToken = result.refreshToken;
        if (result.expiresAt) updateData.tokenExpiresAt = result.expiresAt;
        await storage.updateChannel(channelId, updateData);
        channel = await storage.getChannel(channelId);
        ytLogger.info(`[Auth] Proactive token refresh succeeded for channel ${channelId}`);
      } else {
        ytLogger.warn(`[Auth] Proactive token refresh failed for channel ${channelId}: ${result.error}`);
      }
    } catch (refreshErr) {
      ytLogger.warn(`[Auth] Proactive token refresh threw for channel ${channelId}:`, refreshErr);
    }
  }

  if (!channel?.accessToken) {
    throw new Error("Channel not connected or missing access token");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: channel.accessToken,
    refresh_token: channel.refreshToken,
    expiry_date: channel.tokenExpiresAt ? channel.tokenExpiresAt.getTime() : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    (async () => {
      try {
        const updateData: any = {};
        if (tokens.access_token) updateData.accessToken = tokens.access_token;
        if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
        if (tokens.expiry_date) updateData.tokenExpiresAt = new Date(tokens.expiry_date);
        if (Object.keys(updateData).length > 0) {
          await storage.updateChannel(channelId, updateData);
        }
      } catch (err) {
        ytLogger.error("Token persist failed", { error: String(err) });
      }
    })();
  });

  return { oauth2Client, channel };
}

export async function fetchYouTubeChannelInfo(channelId: number) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.channels.list({
    part: ["snippet", "statistics", "contentDetails", "brandingSettings"],
    mine: true,
  });

  const ch = response.data.items?.[0];
  if (!ch) throw new Error("Channel not found");

  return {
    id: ch.id,
    title: ch.snippet?.title,
    description: ch.snippet?.description,
    customUrl: ch.snippet?.customUrl,
    thumbnailUrl: ch.snippet?.thumbnails?.medium?.url,
    subscriberCount: ch.statistics?.subscriberCount,
    videoCount: ch.statistics?.videoCount,
    viewCount: ch.statistics?.viewCount,
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads,
  };
}

export async function refreshChannelStats(channelId: number): Promise<void> {
  try {
    const { isQuotaBreakerTripped } = await import("./services/youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      return;
    }
    const info = await fetchYouTubeChannelInfo(channelId);
    const updates: any = { lastSyncAt: new Date() };
    if (info.subscriberCount != null) updates.subscriberCount = Number(info.subscriberCount);
    if (info.videoCount != null) updates.videoCount = Number(info.videoCount);
    if (info.viewCount != null) updates.viewCount = Number(info.viewCount);
    await storage.updateChannel(channelId, updates);
  } catch (err: any) {
    if (err?.code === "DEV_BYPASS") return;
    ytLogger.error("Failed to refresh stats", { channelId, error: String(err) });
  }
}

export async function refreshAllUserChannelStats(userId: string): Promise<void> {
  try {
    const { getQuotaStatus, trackQuotaUsage } = await import("./services/youtube-quota-tracker");
    const quota = await getQuotaStatus(userId);
    if (quota.remaining < 10) {
      ytLogger.info("Skipping channel stats refresh — quota too low", { userId, remaining: quota.remaining });
      return;
    }
    await trackQuotaUsage(userId, "list", 1);
  } catch (err: any) { ytLogger.warn("Quota check failed", { error: err?.message || String(err) }); }
  const userChannels = await storage.getChannelsByUser(userId);

  const ytChannels = userChannels.filter(c => c.platform === "youtube" && c.accessToken);
  for (const ch of ytChannels) {
    await refreshChannelStats(ch.id);
  }

  const nonYtChannels = userChannels.filter(c => c.platform !== "youtube" && c.platform !== "youtubeshorts" && c.accessToken);
  for (const ch of nonYtChannels) {
    try {
      const { fetchPlatformData } = await import("./platform-data-fetcher");
      const fetched = await fetchPlatformData(ch.platform as any, ch.accessToken!, ch.channelId);
      const updates: any = { lastSyncAt: new Date() };
      if (fetched.followerCount !== undefined) updates.subscriberCount = fetched.followerCount;
      const pd = fetched.platformData || {};
      const vidCount = pd.videoCount ? Number(pd.videoCount)
        : pd.tweetCount ? Number(pd.tweetCount)
        : pd.mediaCount ? Number(pd.mediaCount)
        : null;
      if (vidCount !== null) updates.videoCount = vidCount;
      const vwCount = pd.totalViewCount ? Number(pd.totalViewCount)
        : pd.recentVideoViews ? Number(pd.recentVideoViews)
        : pd.likesCount ? Number(pd.likesCount)
        : null;
      if (vwCount !== null) updates.viewCount = vwCount;
      if (Object.keys(pd).length > 0) {
        updates.platformData = { ...((ch.platformData as any) || {}), ...pd, lastFetchedAt: new Date().toISOString() };
      }
      await storage.updateChannel(ch.id, updates);
    } catch (err) {
      ytLogger.error("Failed to refresh channel stats", { platform: ch.platform, channelId: ch.id, error: String(err) });
    }
  }

  if (userChannels.some(c => c.accessToken)) {
    try {
      const { autoDetectAndUpdateMetrics } = await import("./growth-programs-engine");
      await autoDetectAndUpdateMetrics(userId);
    } catch (err) {
      ytLogger.error("Failed to update growth metrics", { userId, error: String(err) });
    }
  }
}

export async function fetchYouTubeVideos(channelId: number, maxResults = 1000) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let channelInfo;
  try {
    channelInfo = await fetchYouTubeChannelInfo(channelId);
  } catch (err: any) {
    if (err.code === 403 || err.message?.includes("quota")) {
      markQuotaErrorFromResponse(err);
      const quotaErr = new Error("YouTube API quota exceeded. Your videos are safe — sync will resume automatically when quota resets (usually within 24 hours).");
      (quotaErr as any).code = "QUOTA_EXCEEDED";
      throw quotaErr;
    }
    throw err;
  }
  if (!channelInfo.uploadsPlaylistId) return [];

  const allVideoIds: string[] = [];
  let pageToken: string | undefined;
  const perPage = Math.min(maxResults, 50);

  try {
    do {
      const playlistResponse = await youtube.playlistItems.list({
        part: ["contentDetails"],
        playlistId: channelInfo.uploadsPlaylistId,
        maxResults: perPage,
        pageToken,
      });

      const ids = playlistResponse.data.items
        ?.map(item => item.contentDetails?.videoId)
        .filter(Boolean) as string[];
      if (ids?.length) allVideoIds.push(...ids);

      pageToken = playlistResponse.data.nextPageToken || undefined;
    } while (pageToken && allVideoIds.length < maxResults);
  } catch (err: any) {
    if (err.code === 403 || err.message?.includes("quota")) {
      markQuotaErrorFromResponse(err);
      const quotaErr = new Error("YouTube API quota exceeded. Your videos are safe — sync will resume automatically when quota resets (usually within 24 hours).");
      (quotaErr as any).code = "QUOTA_EXCEEDED";
      throw quotaErr;
    }
    throw err;
  }

  if (!allVideoIds.length) return [];

  const allVideos: any[] = [];
  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50);
    try {
      const videosResponse = await youtube.videos.list({
        part: ["snippet", "statistics", "contentDetails", "status"],
        id: batch,
      });
      if (videosResponse.data.items) {
        allVideos.push(...videosResponse.data.items);
      }
    } catch (err: any) {
      if (err.code === 403 || err.message?.includes("quota")) {
        markQuotaErrorFromResponse(err);
        ytLogger.info("Quota hit during video details fetch", { fetched: allVideos.length });
        break;
      }
      throw err;
    }
  }

  return allVideos.map(v => ({
    youtubeId: v.id,
    title: v.snippet?.title || "",
    description: v.snippet?.description || "",
    thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
    publishedAt: v.snippet?.publishedAt,
    tags: v.snippet?.tags || [],
    categoryId: v.snippet?.categoryId,
    viewCount: Number(v.statistics?.viewCount || 0),
    likeCount: Number(v.statistics?.likeCount || 0),
    commentCount: Number(v.statistics?.commentCount || 0),
    duration: v.contentDetails?.duration,
    privacyStatus: v.status?.privacyStatus,
  }));
}

export async function fetchYouTubeVideoDetails(channelId: number, youtubeVideoId: string): Promise<{
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  publishedAt: string;
  privacyStatus: string;
  defaultAudioLanguage?: string;
} | null> {
  if (isQuotaBreakerTripped()) return null;
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const response = await youtube.videos.list({
      part: ["snippet", "statistics", "contentDetails", "status"],
      id: [youtubeVideoId],
    });

    const v = response.data.items?.[0];
    if (!v) return null;

    return {
      title: v.snippet?.title || "",
      description: v.snippet?.description || "",
      tags: v.snippet?.tags || [],
      categoryId: v.snippet?.categoryId || "",
      thumbnailUrl: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || "",
      viewCount: Number(v.statistics?.viewCount || 0),
      likeCount: Number(v.statistics?.likeCount || 0),
      commentCount: Number(v.statistics?.commentCount || 0),
      duration: v.contentDetails?.duration || "",
      publishedAt: v.snippet?.publishedAt || "",
      privacyStatus: v.status?.privacyStatus || "",
      defaultAudioLanguage: v.snippet?.defaultAudioLanguage || undefined,
    };
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (!msg.includes("not connected") && !msg.includes("missing access token")) {
      ytLogger.error("Failed to fetch video details", { youtubeVideoId, error: msg });
    }
    return null;
  }
}

export async function updateYouTubeVideo(
  channelId: number,
  videoId: string,
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string; enableMonetization?: boolean }
) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const parts: string[] = ["snippet"];
  if (updates.enableMonetization !== undefined) {
    parts.push("status");
  }

  const currentVideo = await youtube.videos.list({
    part: parts,
    id: [videoId],
  });

  const item = currentVideo.data.items?.[0];
  const snippet = item?.snippet;
  if (!snippet) throw new Error("Video not found on YouTube");

  const requestBody: any = {
    id: videoId,
    snippet: {
      title: updates.title || snippet.title || "",
      description: updates.description !== undefined ? updates.description : (snippet.description || ""),
      tags: updates.tags || snippet.tags || [],
      categoryId: updates.categoryId || snippet.categoryId || "22",
    },
  };

  if (updates.enableMonetization) {
    requestBody.status = {
      ...(item?.status || {}),
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: "youtube",
      publicStatsViewable: true,
    };
  }

  const response = await youtube.videos.update({
    part: parts,
    requestBody,
  });

  return {
    id: response.data.id,
    title: response.data.snippet?.title,
    description: response.data.snippet?.description,
    tags: response.data.snippet?.tags,
  };
}

export async function uploadVideoToYouTube(
  channelId: number,
  options: {
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: "public" | "private" | "unlisted";
    scheduledStartTime?: string;
    videoFilePath?: string;
    videoBuffer?: Buffer;
    enableMonetization?: boolean;
  }
): Promise<{ youtubeId: string; title: string; status: string } | null> {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const { Readable } = await import("stream");
  const fs = await import("fs");

  let mediaBody: any;
  if (options.videoBuffer) {
    mediaBody = Readable.from(options.videoBuffer);
  } else if (options.videoFilePath && fs.existsSync(options.videoFilePath)) {
    mediaBody = fs.createReadStream(options.videoFilePath);
  } else {
    return null;
  }

  let privacyStatus = options.privacyStatus || "public";
  const statusBody: any = { privacyStatus };

  if (options.enableMonetization === true) {
    statusBody.selfDeclaredMadeForKids = false;
    statusBody.embeddable = true;
    statusBody.license = "youtube";
    statusBody.publicStatsViewable = true;
  }

  if (options.scheduledStartTime && privacyStatus === "public") {
    const scheduledDate = new Date(options.scheduledStartTime);
    if (scheduledDate.getTime() > Date.now() + 60_000) {
      statusBody.privacyStatus = "private";
      statusBody.publishAt = scheduledDate.toISOString();
    }
  }

  const { removeBannedPhrases } = await import("./stealth-guardrails");
  const cleanTitle = removeBannedPhrases(options.title).slice(0, 100);
  const cleanDescription = removeBannedPhrases(options.description).slice(0, 5000);
  const cleanTags = (options.tags || []).map(t => removeBannedPhrases(t)).filter(Boolean).slice(0, 500);

  const monetizationLabel = options.enableMonetization === true ? ", monetization: enabled" : "";

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: cleanTitle,
        description: cleanDescription,
        tags: cleanTags,
        categoryId: options.categoryId || "22",
        defaultLanguage: "en",
      },
      status: statusBody,
    },
    media: {
      mimeType: "video/mp4",
      body: mediaBody,
    },
  });

  const youtubeId = response.data.id;
  if (!youtubeId) {
    throw new Error("YouTube upload succeeded but no video ID returned");
  }


  return {
    youtubeId,
    title: response.data.snippet?.title || cleanTitle,
    status: response.data.status?.privacyStatus || statusBody.privacyStatus,
  };
}

export async function setYouTubeThumbnail(
  channelId: number,
  videoId: string,
  thumbnailBuffer: Buffer,
  mimeType: string = "image/png"
) {
  if (isQuotaBreakerTripped()) throw Object.assign(new Error("YouTube API quota exceeded — circuit breaker active until midnight Pacific"), { code: "QUOTA_EXCEEDED" });
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const { Readable } = await import("stream");
  const stream = Readable.from(thumbnailBuffer);

  const response = await youtube.thumbnails.set({
    videoId,
    media: {
      mimeType,
      body: stream,
    },
  });

  return response.data;
}

export async function optimizeShortsForAllPlatforms(userId: string, shorts: any[]): Promise<{ optimized: number; platforms: string[] }> {
  const { packageForAllPlatforms } = await import("./distribution/cross-platform-packaging");
  const { PLATFORM_CAPABILITIES } = await import("@shared/schema");

  const shortFormPlatforms = Object.entries(PLATFORM_CAPABILITIES)
    .filter(([, caps]) => caps.supports.includes("short_video"))
    .map(([p]) => p)
    .filter(p => p !== "youtube");

  if (shortFormPlatforms.length === 0) return { optimized: 0, platforms: [] };

  let optimized = 0;
  for (const short of shorts) {
    try {
      const meta = short.metadata || {};
      if (meta.platformOptimizations && Object.keys(meta.platformOptimizations).length > 0) {
        const existingPlatforms = Object.keys(meta.platformOptimizations);
        if (shortFormPlatforms.every(p => existingPlatforms.includes(p))) continue;
      }

      const packaged = await packageForAllPlatforms(
        userId,
        {
          title: short.title,
          description: short.description || "",
          tags: meta.tags || [],
          durationSeconds: meta.duration ? parseDuration(meta.duration) : undefined,
          game: meta.gameName || undefined,
        },
        shortFormPlatforms,
      );

      const platformOpts: Record<string, any> = meta.platformOptimizations || {};
      for (const pkg of packaged) {
        platformOpts[pkg.platform] = {
          title: pkg.title,
          description: pkg.description,
          tags: pkg.tags,
          format: pkg.format,
          aspectRatio: pkg.aspectRatio,
          contentTypeLabel: pkg.contentTypeLabel,
          maxDurationSeconds: pkg.maxDurationSeconds,
          platformNotes: pkg.platformNotes,
          optimizedAt: new Date().toISOString(),
        };
      }

      await storage.updateVideo(short.id, {
        metadata: { ...meta, platformOptimizations: platformOpts },
      });
      optimized++;
    } catch (err) {
      ytLogger.error("Failed to optimize short for other platforms", { shortId: short.id, error: String(err) });
    }
  }

  ytLogger.info("Cross-platform optimized shorts", { optimized, total: shorts.length, platforms: shortFormPlatforms.join(", ") });
  return { optimized, platforms: shortFormPlatforms };
}

const PUBLIC_CHANNEL_URL = "https://youtube.com/@etgaming274";

function isValidYouTubeChannelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com" || parsed.hostname === "m.youtube.com") &&
      (parsed.pathname.startsWith("/@") || parsed.pathname.startsWith("/channel/") || parsed.pathname.startsWith("/c/"))
    );
  } catch {
    return false;
  }
}

export async function fetchChannelVideosViaYtDlp(channelUrl: string = PUBLIC_CHANNEL_URL, maxVideos = 100): Promise<Array<{
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  likeCount: number;
}>> {
  if (!isValidYouTubeChannelUrl(channelUrl)) {
    ytLogger.warn("Invalid channel URL rejected", { channelUrl });
    return [];
  }

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const path = await import("path");
  const fs = await import("fs");
  const execFileAsync = promisify(execFile);

  const ytDlpBin = (() => {
    const local = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
    if (fs.existsSync(local)) return local;
    return "yt-dlp";
  })();

  try {
    const videosUrl = channelUrl.includes("/videos") ? channelUrl : `${channelUrl}/videos`;
    const { stdout } = await execFileAsync(ytDlpBin, [
      "--flat-playlist",
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--playlist-end", String(maxVideos),
      "--extractor-args", "youtube:player_client=web",
      videosUrl,
    ], { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });

    const videos: Array<{
      youtubeId: string; title: string; description: string;
      thumbnailUrl: string; publishedAt: string; duration: string;
      viewCount: number; likeCount: number;
    }> = [];

    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        if (!entry.id) continue;
        const durationSec = typeof entry.duration === "number" ? entry.duration : 0;
        videos.push({
          youtubeId: entry.id,
          title: entry.title || "",
          description: entry.description || "",
          thumbnailUrl: entry.thumbnail || entry.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
          publishedAt: entry.upload_date
            ? `${entry.upload_date.slice(0, 4)}-${entry.upload_date.slice(4, 6)}-${entry.upload_date.slice(6, 8)}T00:00:00Z`
            : new Date().toISOString(),
          duration: durationSec > 0
            ? `PT${Math.floor(durationSec / 60)}M${durationSec % 60}S`
            : "PT0S",
          viewCount: entry.view_count || 0,
          likeCount: entry.like_count || 0,
        });
      } catch {}
    }

    ytLogger.info("yt-dlp scraped videos", { count: videos.length, channelUrl });
    return videos;
  } catch (err: any) {
    ytLogger.error("yt-dlp channel scrape failed", { error: err.message?.substring(0, 200) });
    return [];
  }
}

export async function syncYouTubeVideosFromPublicFeed(channelId: number, userId: string, channelUrl: string = PUBLIC_CHANNEL_URL): Promise<{ synced: any[]; newVideos: any[] }> {
  ytLogger.info("Syncing videos from public feed", { channelUrl });
  const ytVideos = await fetchChannelVideosViaYtDlp(channelUrl);
  if (ytVideos.length === 0) {
    ytLogger.warn("No videos found from public feed — falling back to existing library");
    return { synced: [], newVideos: [] };
  }

  const existingVideos = await storage.getVideosByUser(userId);
  const synced: any[] = [];
  const newVideos: any[] = [];

  for (const ytVideo of ytVideos) {
    const existing = existingVideos.find(v =>
      (v.metadata as any)?.youtubeId === ytVideo.youtubeId
    );
    if (existing) {
      synced.push(existing);
      continue;
    }

    const durationSeconds = parseDuration(ytVideo.duration);
    const isShort = durationSeconds > 0 && durationSeconds <= 60;
    const video = await storage.createVideo({
      channelId,
      title: ytVideo.title,
      thumbnailUrl: ytVideo.thumbnailUrl,
      type: isShort ? "short" : "long",
      status: "published",
      platform: "youtube",
      description: ytVideo.description,
      metadata: {
        youtubeId: ytVideo.youtubeId,
        tags: [],
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: 0,
        publishedAt: ytVideo.publishedAt,
        duration: ytVideo.duration,
        privacyStatus: "public",
      },
    });
    synced.push(video);
    newVideos.push(video);
  }

  if (newVideos.length > 0) {
    ytLogger.info("Public feed sync: new videos discovered", { newVideos: newVideos.length, total: synced.length });
    await storage.updateChannel(channelId, { lastSyncAt: new Date() });

    try {
      const { processNewVideoUpload } = await import("./autopilot-engine");
      for (const video of newVideos) {
        processNewVideoUpload(userId, video.id).catch(err =>
          ytLogger.error("Autopilot pipeline failed for video", { videoId: video.id, error: err?.message || String(err) })
        );
      }
    } catch (err) {
      ytLogger.error("Failed to trigger autopilot pipeline", { error: String(err) });
    }
  } else {
    ytLogger.info("Public feed sync: all videos already in library", { count: synced.length });
  }

  return { synced, newVideos };
}

export async function syncYouTubeVideosToLibrary(channelId: number, userId: string): Promise<{ synced: any[]; newVideos: any[] }> {
  return syncYouTubeVideosFromPublicFeed(channelId, userId);
}

async function _legacyApiSync(channelId: number, userId: string): Promise<{ synced: any[]; newVideos: any[] }> {
  const ytVideos = await fetchYouTubeVideos(channelId);
  const existingVideos = await storage.getVideosByUser(userId);

  const synced: any[] = [];
  const newVideos: any[] = [];
  for (const ytVideo of ytVideos) {
    const existing = existingVideos.find(v =>
      v.metadata?.youtubeId === ytVideo.youtubeId
    );

    if (existing) {
      synced.push(existing);
      continue;
    }

    const isShort = ytVideo.duration && parseDuration(ytVideo.duration) <= 60;
    const video = await storage.createVideo({
      channelId,
      title: ytVideo.title,
      thumbnailUrl: ytVideo.thumbnailUrl,
      type: isShort ? "short" : "long",
      status: "published",
      platform: "youtube",
      description: ytVideo.description,
      metadata: {
        youtubeId: ytVideo.youtubeId,
        tags: ytVideo.tags,
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: ytVideo.commentCount,
        publishedAt: ytVideo.publishedAt,
        duration: ytVideo.duration,
        privacyStatus: ytVideo.privacyStatus,
      },
    });
    synced.push(video);
    newVideos.push(video);
  }

  const newShorts = newVideos.filter(v => v.type === "short");
  if (newShorts.length > 0) {
    optimizeShortsForAllPlatforms(userId, newShorts).catch(err =>
      ytLogger.error("Shorts cross-platform optimization failed", { error: String(err) })
    );
  }

  await storage.updateChannel(channelId, { lastSyncAt: new Date() });
  if (newVideos.length > 0) {
    try {
      const { bridgeVodsToStreams } = await import("./daily-content-engine");
      await bridgeVodsToStreams(userId);
    } catch (err) {
      ytLogger.error("VOD bridge after sync failed", { error: String(err) });
    }

    try {
      const { processNewVideoUpload } = await import("./autopilot-engine");
      for (const video of newVideos) {
        processNewVideoUpload(userId, video.id).catch(err =>
          ytLogger.error("Autopilot pipeline failed", { videoId: video.id, error: err?.message || String(err) })
        );
      }
      ytLogger.info("Triggered autopilot pipeline for new videos", { count: newVideos.length });
    } catch (err) {
      ytLogger.error("Failed to trigger autopilot pipeline for new videos", { error: String(err) });
    }
  }
  return { synced, newVideos };
}

export async function checkYouTubeLiveBroadcasts(channelId: number) {
  if (isQuotaBreakerTripped()) return [];
  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const response = await youtube.liveBroadcasts.list({
      part: ["snippet", "status", "contentDetails"],
      broadcastStatus: "active",
      broadcastType: "all",
    });

    const broadcasts = response.data.items || [];
    return broadcasts.map(b => ({
      broadcastId: b.id || "",
      title: b.snippet?.title || "Untitled Stream",
      description: b.snippet?.description || "",
      status: b.status?.lifeCycleStatus || "unknown",
      startedAt: b.snippet?.actualStartTime || null,
      scheduledStartTime: b.snippet?.scheduledStartTime || null,
      thumbnailUrl: b.snippet?.thumbnails?.high?.url || b.snippet?.thumbnails?.default?.url || "",
      liveChatId: b.snippet?.liveChatId || null,
    }));
  } catch (err: any) {
    if (err?.code === "DEV_BYPASS") return [];
    markQuotaErrorFromResponse(err);
    ytLogger.warn("Live broadcast check failed", { error: err.message });
    return [];
  }
}

export async function fetchYouTubeComments(channelId: number, youtubeVideoId: string, maxResults = 20) {
  if (isQuotaBreakerTripped()) return [];
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.commentThreads.list({
    part: ["snippet"],
    videoId: youtubeVideoId,
    maxResults,
    order: "time",
    textFormat: "plainText",
  });

  const threads = response.data.items || [];
  return threads.map(thread => {
    const snippet = thread.snippet?.topLevelComment?.snippet;
    return {
      commentId: thread.snippet?.topLevelComment?.id || "",
      author: snippet?.authorDisplayName || "Unknown",
      text: snippet?.textDisplay || "",
      likeCount: snippet?.likeCount || 0,
      publishedAt: snippet?.publishedAt || "",
    };
  }).filter(c => c.text.length > 0);
}

export async function replyToYouTubeComment(channelId: number, commentId: string, replyText: string) {
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const response = await youtube.comments.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        parentId: commentId,
        textOriginal: replyText,
      },
    },
  });

  return response.data;
}

export async function postAndPinComment(channelId: number, youtubeVideoId: string, commentText: string): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    const { oauth2Client, channel } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const insertRes = await youtube.commentThreads.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId: youtubeVideoId,
          channelId: channel.channelId || undefined,
          topLevelComment: {
            snippet: {
              textOriginal: commentText,
            },
          },
        },
      },
    });

    const newCommentId = insertRes.data.snippet?.topLevelComment?.id;
    if (!newCommentId) {
      return { success: false, error: "Comment posted but no ID returned for pinning" };
    }

    try {
      await youtube.comments.setModerationStatus({
        id: [newCommentId],
        moderationStatus: "published",
      });
    } catch (moderationErr) {
      ytLogger.error("Failed to set comment moderation status", { error: String(moderationErr) });
    }

    return { success: true, commentId: newCommentId };
  } catch (err: any) {
    ytLogger.error("Post & pin comment failed", { error: err.message });
    return { success: false, error: err.message };
  }
}

const TRANSCRIPT_TIMEOUT_MS = 15_000;

export async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const ac1 = new AbortController();
    const t1 = setTimeout(() => ac1.abort(), TRANSCRIPT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(watchUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept-Language": "en-US,en;q=0.9" },
        signal: ac1.signal,
      });
    } finally { clearTimeout(t1); }
    if (!res.ok) return null;
    const html = await res.text();

    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
    if (!captionMatch) return null;

    let captionData: any;
    try {
      captionData = JSON.parse(captionMatch[1]);
    } catch {
      return null;
    }

    const tracks = captionData?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    const enTrack = tracks.find((t: any) => t.languageCode === "en") ||
                    tracks.find((t: any) => t.languageCode?.startsWith("en")) ||
                    tracks[0];
    if (!enTrack?.baseUrl) return null;

    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), TRANSCRIPT_TIMEOUT_MS);
    let captionRes: Response;
    try {
      captionRes = await fetch(enTrack.baseUrl + "&fmt=srv3", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: ac2.signal,
      });
    } finally { clearTimeout(t2); }
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

    const segments: string[] = [];
    const textMatches = xml.matchAll(/<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g);
    for (const m of textMatches) {
      const startSec = parseFloat(m[1]);
      const text = m[3].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
      if (text) {
        const mins = Math.floor(startSec / 60);
        const secs = Math.floor(startSec % 60);
        segments.push(`[${mins}:${String(secs).padStart(2, "0")}] ${text}`);
      }
    }

    if (segments.length === 0) return null;
    return segments.join("\n");
  } catch (err: any) {
    ytLogger.error("Transcript fetch failed", { videoId, error: err.message });
    return null;
  }
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}
