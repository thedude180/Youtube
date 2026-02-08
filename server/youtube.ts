import { google, youtube_v3 } from "googleapis";
import { storage } from "./storage";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/youtube/callback`
      : "http://localhost:5000/api/youtube/callback");

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: userId,
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

  const channelData = {
    userId,
    platform: "youtube" as const,
    channelName: ytChannel.snippet?.title || "YouTube Channel",
    channelId: ytChannel.id || "",
    accessToken: tokens.access_token || null,
    refreshToken: tokens.refresh_token || null,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    settings: { preset: "normal" as const, autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 },
  };

  let channel;
  if (existingYt) {
    const updateData: any = {
      channelName: channelData.channelName,
      channelId: channelData.channelId,
      accessToken: channelData.accessToken,
      tokenExpiresAt: channelData.tokenExpiresAt,
      lastSyncAt: new Date(),
    };
    if (tokens.refresh_token) {
      updateData.refreshToken = tokens.refresh_token;
    }
    channel = await storage.updateChannel(existingYt.id, updateData);
  } else {
    channel = await storage.createChannel(channelData);
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

async function getAuthenticatedClient(channelId: number) {
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

  oauth2Client.on("tokens", async (tokens) => {
    const updateData: any = {};
    if (tokens.access_token) updateData.accessToken = tokens.access_token;
    if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updateData.tokenExpiresAt = new Date(tokens.expiry_date);
    if (Object.keys(updateData).length > 0) {
      await storage.updateChannel(channelId, updateData);
    }
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

export async function fetchYouTubeVideos(channelId: number, maxResults = 50) {
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const channelInfo = await fetchYouTubeChannelInfo(channelId);
  if (!channelInfo.uploadsPlaylistId) return [];

  const playlistResponse = await youtube.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId: channelInfo.uploadsPlaylistId,
    maxResults,
  });

  const videoIds = playlistResponse.data.items
    ?.map(item => item.contentDetails?.videoId)
    .filter(Boolean) as string[];

  if (!videoIds?.length) return [];

  const videosResponse = await youtube.videos.list({
    part: ["snippet", "statistics", "contentDetails", "status"],
    id: videoIds,
  });

  return (videosResponse.data.items || []).map(v => ({
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
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string }
) {
  const { oauth2Client } = await getAuthenticatedClient(channelId);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const currentVideo = await youtube.videos.list({
    part: ["snippet"],
    id: [videoId],
  });

  const snippet = currentVideo.data.items?.[0]?.snippet;
  if (!snippet) throw new Error("Video not found on YouTube");

  const response = await youtube.videos.update({
    part: ["snippet"],
    requestBody: {
      id: videoId,
      snippet: {
        title: updates.title || snippet.title || "",
        description: updates.description !== undefined ? updates.description : (snippet.description || ""),
        tags: updates.tags || snippet.tags || [],
        categoryId: updates.categoryId || snippet.categoryId || "22",
      },
    },
  });

  return {
    id: response.data.id,
    title: response.data.snippet?.title,
    description: response.data.snippet?.description,
    tags: response.data.snippet?.tags,
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

export async function syncYouTubeVideosToLibrary(channelId: number, userId: string) {
  const ytVideos = await fetchYouTubeVideos(channelId);
  const existingVideos = await storage.getVideosByUser(userId);

  const synced: any[] = [];
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
  }

  await storage.updateChannel(channelId, { lastSyncAt: new Date() });
  return synced;
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}
