import { google, youtube_v3 } from "googleapis";
import { storage } from "./storage";

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
    console.error(`[YouTube] Failed to auto-enable autopilot for ${userId}:`, err);
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
  const channel = await storage.getChannel(channelId);
  if (!channel || !channel.accessToken) {
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
        console.error('[YouTube] Token persist failed:', err);
      }
    })();
  });

  return { oauth2Client, channel };
}

export async function fetchYouTubeChannelInfo(channelId: number) {
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
    const info = await fetchYouTubeChannelInfo(channelId);
    const updates: any = { lastSyncAt: new Date() };
    if (info.subscriberCount != null) updates.subscriberCount = Number(info.subscriberCount);
    if (info.videoCount != null) updates.videoCount = Number(info.videoCount);
    if (info.viewCount != null) updates.viewCount = Number(info.viewCount);
    await storage.updateChannel(channelId, updates);
  } catch (err) {
    console.error(`[YouTube] Failed to refresh stats for channel ${channelId}:`, err);
  }
}

export async function refreshAllUserChannelStats(userId: string): Promise<void> {
  try {
    const { getQuotaStatus, trackQuotaUsage } = await import("./services/youtube-quota-tracker");
    const quota = await getQuotaStatus(userId);
    if (quota.remaining < 10) {
      console.warn(`[YouTube] Skipping channel stats refresh for ${userId} — quota too low (${quota.remaining})`);
      return;
    }
    await trackQuotaUsage(userId, "list", 1);
  } catch {}
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
      console.error(`[ChannelStats] Failed to refresh stats for ${ch.platform} channel ${ch.id}:`, err);
    }
  }

  if (userChannels.some(c => c.accessToken)) {
    try {
      const { autoDetectAndUpdateMetrics } = await import("./growth-programs-engine");
      await autoDetectAndUpdateMetrics(userId);
    } catch (err) {
      console.error(`[ChannelStats] Failed to update growth metrics for ${userId}:`, err);
    }
  }
}

export async function fetchYouTubeVideos(channelId: number, maxResults = 1000) {
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let channelInfo;
  try {
    channelInfo = await fetchYouTubeChannelInfo(channelId);
  } catch (err: any) {
    if (err.code === 403 || err.message?.includes("quota")) {
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
        console.warn(`[YouTube] Quota hit during video details fetch (got ${allVideos.length} so far)`);
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

export async function updateYouTubeVideo(
  channelId: number,
  videoId: string,
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string; enableMonetization?: boolean }
) {
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
      console.error(`[Shorts] Failed to optimize short ${short.id} for other platforms:`, err);
    }
  }

  console.log(`[Shorts] Cross-platform optimized ${optimized}/${shorts.length} shorts for: ${shortFormPlatforms.join(", ")}`);
  return { optimized, platforms: shortFormPlatforms };
}

export async function syncYouTubeVideosToLibrary(channelId: number, userId: string): Promise<{ synced: any[]; newVideos: any[] }> {
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
      console.error("[YouTube] Shorts cross-platform optimization failed:", err)
    );
  }

  await storage.updateChannel(channelId, { lastSyncAt: new Date() });
  if (newVideos.length > 0) {
    try {
      const { bridgeVodsToStreams } = await import("./daily-content-engine");
      await bridgeVodsToStreams(userId);
    } catch (err) {
      console.error("[YouTube] VOD bridge after sync failed:", err);
    }
  }
  return { synced, newVideos };
}

export async function checkYouTubeLiveBroadcasts(channelId: number) {
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
    console.error("[YouTube] Live broadcast check failed:", err.message);
    return [];
  }
}

export async function fetchYouTubeComments(channelId: number, youtubeVideoId: string, maxResults = 20) {
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
          channelId: channel.externalId || undefined,
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
      console.error("[YouTube] Failed to set comment moderation status:", moderationErr);
    }

    return { success: true, commentId: newCommentId };
  } catch (err: any) {
    console.error("[YouTube] Post & pin comment failed:", err.message);
    return { success: false, error: err.message };
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
