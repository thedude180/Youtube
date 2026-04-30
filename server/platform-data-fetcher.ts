import type { Platform } from "@shared/schema";
import { withRetry } from "./lib/retry";

import { createLogger } from "./lib/logger";

const logger = createLogger("platform-data-fetcher");
export interface PlatformFetchedData {
  streamKey?: string;
  rtmpUrl?: string;
  channelName?: string;
  channelId?: string;
  profileUrl?: string;
  followerCount?: number;
  platformData?: Record<string, any>;
}

type PlatformFetcher = (accessToken: string, channelId: string) => Promise<PlatformFetchedData>;

async function fetchTwitchData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const clientId = process.env.TWITCH_CLIENT_ID || process.env.TWITCH_DEV_CLIENT_ID || "";
  const headers = { "Authorization": `Bearer ${accessToken}`, "Client-Id": clientId };

  const result: PlatformFetchedData = { platformData: {} };

  // Single-attempt, short timeout — these are best-effort enrichment calls, not critical
  const OPTS = { maxAttempts: 1, timeoutMs: 5000 };

  const fetchJson = async (url: string, label: string): Promise<any | null> => {
    try {
      const res = await withRetry(() => fetch(url, { headers }), { ...OPTS, label });
      if (res.ok) return await res.json();
    } catch (e) {
      logger.warn(`[PlatformFetcher:twitch] ${label} failed:`, e instanceof Error ? e.message : String(e));
    }
    return null;
  };

  // Fire all calls in parallel — total time capped at ~5s instead of 6×15s
  const [streamKeyData, channelData, userData, followData, subsData, videosData] = await Promise.all([
    fetchJson(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${channelId}`, "stream key"),
    fetchJson(`https://api.twitch.tv/helix/channels?broadcaster_id=${channelId}`, "channel info"),
    fetchJson(`https://api.twitch.tv/helix/users?id=${channelId}`, "user info"),
    fetchJson(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${channelId}&first=1`, "followers"),
    fetchJson(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${channelId}&first=1`, "subscriptions"),
    fetchJson(`https://api.twitch.tv/helix/videos?user_id=${channelId}&type=archive&first=100`, "videos"),
  ]);

  if (streamKeyData?.data?.[0]?.stream_key) {
    result.streamKey = streamKeyData.data[0].stream_key;
    result.rtmpUrl = "rtmp://live.twitch.tv/app";
  }

  const ch = channelData?.data?.[0];
  if (ch) {
    result.platformData!.broadcasterId = ch.broadcaster_id;
    result.platformData!.broadcasterLanguage = ch.broadcaster_language;
    result.platformData!.gameId = ch.game_id;
    result.platformData!.gameName = ch.game_name;
    result.platformData!.title = ch.title;
    result.platformData!.tags = ch.tags;
  }

  const user = userData?.data?.[0];
  if (user) {
    result.channelName = user.display_name;
    result.profileUrl = `https://twitch.tv/${user.login}`;
    result.platformData!.profileImageUrl = user.profile_image_url;
    result.platformData!.broadcasterType = user.broadcaster_type;
    result.platformData!.description = user.description;
  }

  if (followData?.total !== undefined) {
    result.followerCount = followData.total;
  }

  if (subsData?.total !== undefined) {
    result.platformData!.subscriberCount = subsData.total;
  }

  if (videosData?.data) {
    const videos = videosData.data as any[];
    result.platformData!.videoCount = videos.length;
    result.platformData!.totalViewCount = videos.reduce((sum: number, v: any) => sum + (v.view_count || 0), 0);
  }

  return result;
}

async function fetchFacebookData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const pagesRes = await withRetry(() => fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`), { label: "Facebook pages API" });
    if (pagesRes.ok) {
      const data = await pagesRes.json() as any;
      const pages = data.data || [];
      result.platformData!.pages = pages.map((p: any) => ({ id: p.id, name: p.name, accessToken: p.access_token }));

      if (pages.length > 0) {
        const page = pages[0];
        result.platformData!.primaryPageId = page.id;
        result.platformData!.primaryPageName = page.name;
        result.platformData!.primaryPageToken = page.access_token;

        try {
          const liveRes = await withRetry(() => fetch(`https://graph.facebook.com/v19.0/${page.id}/live_videos?access_token=${page.access_token}&fields=stream_url,secure_stream_url,status`), { label: "Facebook live videos API" });
          if (liveRes.ok) {
            const liveData = await liveRes.json() as any;
            if (liveData.data?.[0]) {
              result.rtmpUrl = liveData.data[0].secure_stream_url || liveData.data[0].stream_url;
            }
          }
        } catch (e) {
          logger.error("[PlatformFetcher:facebook] Live video fetch failed:", e);
        }
      }
    }
  } catch (e) {
    logger.error("[PlatformFetcher:facebook] Pages fetch failed:", e);
  }

  try {
    const meRes = await withRetry(() => fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${accessToken}`), { label: "Facebook profile API" });
    if (meRes.ok) {
      const data = await meRes.json() as any;
      result.channelName = data.name;
      result.profileUrl = `https://facebook.com/${data.id}`;
      result.platformData!.profilePicture = data.picture?.data?.url;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:facebook] Profile fetch failed:", e);
  }

  return result;
}

async function fetchTikTokData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "TikTok user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      const user = data.data?.user;
      if (user) {
        result.channelName = user.display_name;
        result.followerCount = user.follower_count;
        result.platformData!.avatarUrl = user.avatar_url;
        result.platformData!.followingCount = user.following_count;
        result.platformData!.likesCount = user.likes_count;
        result.platformData!.videoCount = user.video_count;
        result.platformData!.openId = user.open_id;
        result.platformData!.unionId = user.union_id;
      }
    }
  } catch (e) {
    logger.error("[PlatformFetcher:tiktok] User info fetch failed:", e);
  }

  try {
    const videosRes = await withRetry(() => fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,view_count,like_count,comment_count,share_count,create_time", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ max_count: 20 }),
    }), { label: "TikTok videos API" });
    if (videosRes.ok) {
      const data = await videosRes.json() as any;
      const videos = data.data?.videos || [];
      let totalViews = 0;
      for (const v of videos) {
        totalViews += v.view_count || 0;
      }
      result.platformData!.recentVideoViews = totalViews;
      result.platformData!.recentVideoCount = videos.length;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:tiktok] Video list fetch failed:", e);
  }

  return result;
}

async function fetchInstagramData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch(`https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${accessToken}`), { label: "Instagram user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.username;
      result.channelId = data.id;
      result.profileUrl = `https://instagram.com/${data.username}`;
      result.platformData!.accountType = data.account_type;
      result.platformData!.mediaCount = data.media_count;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:instagram] User info fetch failed:", e);
  }

  return result;
}

async function fetchLinkedInData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "LinkedIn user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.name;
      result.channelId = data.sub;
      result.profileUrl = `https://linkedin.com/in/${data.sub}`;
      result.platformData!.email = data.email;
      result.platformData!.picture = data.picture;
      result.platformData!.emailVerified = data.email_verified;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:linkedin] User info fetch failed:", e);
  }

  return result;
}

async function fetchDiscordData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  const headers = { "Authorization": `Bearer ${accessToken}` };

  try {
    const userRes = await withRetry(() => fetch("https://discord.com/api/users/@me", { headers }), { label: "Discord user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.global_name || data.username;
      result.channelId = data.id;
      result.profileUrl = `https://discord.com/users/${data.id}`;
      result.platformData!.username = data.username;
      result.platformData!.discriminator = data.discriminator;
      result.platformData!.avatar = data.avatar;
      result.platformData!.premiumType = data.premium_type;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:discord] User info fetch failed:", e);
  }

  try {
    const guildsRes = await withRetry(() => fetch("https://discord.com/api/users/@me/guilds", { headers }), { label: "Discord guilds API" });
    if (guildsRes.ok) {
      const guilds = await guildsRes.json() as any;
      result.platformData!.guilds = guilds.map((g: any) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        permissions: g.permissions,
      }));
      result.platformData!.guildCount = guilds.length;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:discord] Guilds fetch failed:", e);
  }

  return result;
}

async function fetchRedditData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://oauth.reddit.com/api/v1/me", {
      headers: { "Authorization": `Bearer ${accessToken}`, "User-Agent": "CreatorOS/1.0" },
    }), { label: "Reddit user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.name;
      result.channelId = data.id;
      result.profileUrl = `https://reddit.com/user/${data.name}`;
      result.followerCount = data.subreddit?.subscribers;
      result.platformData!.totalKarma = data.total_karma;
      result.platformData!.commentKarma = data.comment_karma;
      result.platformData!.linkKarma = data.link_karma;
      result.platformData!.iconImg = data.icon_img;
      result.platformData!.hasVerifiedEmail = data.has_verified_email;
      result.platformData!.isGold = data.is_gold;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:reddit] User info fetch failed:", e);
  }

  return result;
}

async function fetchPinterestData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://api.pinterest.com/v5/user_account", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "Pinterest user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.username;
      result.channelId = data.username;
      result.profileUrl = `https://pinterest.com/${data.username}`;
      result.followerCount = data.follower_count;
      result.platformData!.followingCount = data.following_count;
      result.platformData!.pinCount = data.pin_count;
      result.platformData!.monthlyViews = data.monthly_views;
      result.platformData!.profileImage = data.profile_image;
      result.platformData!.accountType = data.account_type;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:pinterest] User info fetch failed:", e);
  }

  return result;
}

async function fetchSpotifyData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://api.spotify.com/v1/me", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "Spotify user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.display_name || data.id;
      result.channelId = data.id;
      result.profileUrl = data.external_urls?.spotify;
      result.followerCount = data.followers?.total;
      result.platformData!.product = data.product;
      result.platformData!.country = data.country;
      result.platformData!.images = data.images;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:spotify] User info fetch failed:", e);
  }

  return result;
}

async function fetchPatreonData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://www.patreon.com/api/oauth2/v2/identity?include=campaign&fields[user]=full_name,vanity,url,image_url,thumb_url&fields[campaign]=creation_name,patron_count,pledge_sum,is_monthly", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "Patreon identity API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.data?.attributes?.full_name;
      result.channelId = data.data?.id;
      result.profileUrl = data.data?.attributes?.url;
      result.platformData!.vanity = data.data?.attributes?.vanity;
      result.platformData!.imageUrl = data.data?.attributes?.image_url;

      const campaigns = data.included?.filter((i: any) => i.type === "campaign") || [];
      if (campaigns.length > 0) {
        const campaign = campaigns[0];
        result.platformData!.campaignId = campaign.id;
        result.platformData!.campaignName = campaign.attributes?.creation_name;
        result.followerCount = campaign.attributes?.patron_count;
        result.platformData!.pledgeSum = campaign.attributes?.pledge_sum;
        result.platformData!.isMonthly = campaign.attributes?.is_monthly;
      }
      result.platformData!.campaigns = campaigns.map((c: any) => ({ id: c.id, name: c.attributes?.creation_name, patronCount: c.attributes?.patron_count }));
    }
  } catch (e) {
    logger.error("[PlatformFetcher:patreon] User info fetch failed:", e);
  }

  return result;
}

async function fetchSnapchatData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://kit.snapchat.com/v1/me", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "Snapchat user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      const me = data.data?.me;
      if (me) {
        result.channelName = me.displayName;
        result.channelId = me.externalId;
        result.platformData!.bitmoji = me.bitmoji?.avatar;
      }
    }
  } catch (e) {
    logger.error("[PlatformFetcher:snapchat] User info fetch failed:", e);
  }

  return result;
}

async function fetchThreadsData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch(`https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${accessToken}`), { label: "Threads user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.username;
      result.channelId = data.id;
      result.profileUrl = `https://threads.net/@${data.username}`;
      result.platformData!.profilePictureUrl = data.threads_profile_picture_url;
      result.platformData!.biography = data.threads_biography;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:threads] User info fetch failed:", e);
  }

  return result;
}

async function fetchMastodonData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const userRes = await withRetry(() => fetch("https://mastodon.social/api/v1/accounts/verify_credentials", {
      headers: { "Authorization": `Bearer ${accessToken}` },
    }), { label: "Mastodon credentials API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.display_name || data.acct;
      result.channelId = data.id;
      result.profileUrl = data.url;
      result.followerCount = data.followers_count;
      result.platformData!.followingCount = data.following_count;
      result.platformData!.statusesCount = data.statuses_count;
      result.platformData!.avatar = data.avatar;
      result.platformData!.header = data.header;
      result.platformData!.note = data.note;
      result.platformData!.bot = data.bot;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:mastodon] User info fetch failed:", e);
  }

  return result;
}

async function fetchTrovoData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  const clientId = process.env.TROVO_CLIENT_ID || "";

  try {
    const userRes = await withRetry(() => fetch("https://open-api.trovo.live/openplatform/getuserinfo", {
      method: "POST",
      headers: { "Authorization": `OAuth ${accessToken}`, "Client-ID": clientId, "Content-Type": "application/json" },
      body: "{}",
    }), { label: "Trovo user API" });
    if (userRes.ok) {
      const data = await userRes.json() as any;
      result.channelName = data.nickName || data.userName;
      result.channelId = data.userId;
      result.profileUrl = `https://trovo.live/${data.userName}`;
      result.followerCount = data.followers;
      result.platformData!.channelId = data.channelId;
      result.platformData!.profilePic = data.profilePic;
      result.platformData!.info = data.info;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:trovo] User info fetch failed:", e);
  }

  try {
    const channelRes = await withRetry(() => fetch("https://open-api.trovo.live/openplatform/channels/id", {
      method: "POST",
      headers: { "Client-ID": clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ username: channelId }),
    }), { label: "Trovo channel API" });
    if (channelRes.ok) {
      const data = await channelRes.json() as any;
      if (data.stream_key) {
        result.streamKey = data.stream_key;
        result.rtmpUrl = "rtmp://live-push.trovo.live/live";
      }
    }
  } catch (e) {
    logger.error("[PlatformFetcher:trovo] Channel fetch failed:", e);
  }

  return result;
}

async function fetchKickData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    result.platformData!.note = "Kick OAuth connected. Stream key available in Kick dashboard.";
    result.rtmpUrl = "rtmp://fa723fc1b171.global-contribute.live-video.net/app";
    result.platformData!.connectionStatus = "connected";
  } catch (e) {
    logger.error("[PlatformFetcher:kick] Fetch failed:", e);
  }

  return result;
}

async function fetchRumbleData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  result.rtmpUrl = "rtmp://live.rumble.com/live";
  result.platformData!.note = "Rumble connected. Stream key available in Rumble Studio.";
  result.platformData!.connectionStatus = "connected";

  return result;
}

async function fetchDLiveData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  result.rtmpUrl = "rtmp://stream.dlive.tv/live";
  result.platformData!.note = "DLive connected. Stream key available in DLive dashboard.";
  result.platformData!.connectionStatus = "connected";

  return result;
}

async function fetchBlueskyData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  result.platformData!.connectionStatus = "connected";
  result.platformData!.protocol = "AT Protocol";
  return result;
}

async function fetchKofiData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  result.platformData!.connectionStatus = "connected";
  result.platformData!.note = "Ko-fi connected for donation tracking.";
  return result;
}

async function fetchSubstackData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  result.platformData!.connectionStatus = "connected";
  result.platformData!.note = "Substack connected for newsletter cross-promotion.";
  return result;
}

async function fetchApplePodcastsData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };
  result.platformData!.connectionStatus = "connected";
  result.platformData!.note = "Apple Podcasts connected for podcast distribution.";
  return result;
}

async function fetchWhatsAppData(accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const result: PlatformFetchedData = { platformData: {} };

  try {
    const res = await withRetry(() => fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`), { label: "WhatsApp business API" });
    if (res.ok) {
      const data = await res.json() as any;
      result.platformData!.businessAccountId = data.id;
      result.platformData!.businessName = data.name;
    }
  } catch (e) {
    logger.error("[PlatformFetcher:whatsapp] Business info fetch failed:", e);
  }

  result.platformData!.connectionStatus = "connected";
  return result;
}

const PLATFORM_FETCHERS: Partial<Record<string, PlatformFetcher>> = {
  twitch: fetchTwitchData,
  facebook: fetchFacebookData,
  tiktok: fetchTikTokData,
  instagram: fetchInstagramData,
  linkedin: fetchLinkedInData,
  discord: fetchDiscordData,
  reddit: fetchRedditData,
  pinterest: fetchPinterestData,
  spotify: fetchSpotifyData,
  patreon: fetchPatreonData,
  snapchat: fetchSnapchatData,
  threads: fetchThreadsData,
  mastodon: fetchMastodonData,
  trovo: fetchTrovoData,
  kick: fetchKickData,
  rumble: fetchRumbleData,
  dlive: fetchDLiveData,
  bluesky: fetchBlueskyData,
  kofi: fetchKofiData,
  substack: fetchSubstackData,
  applepodcasts: fetchApplePodcastsData,
  whatsapp: fetchWhatsAppData,
};

export async function fetchPlatformData(platform: Platform, accessToken: string, channelId: string): Promise<PlatformFetchedData> {
  const fetcher = PLATFORM_FETCHERS[platform];
  if (!fetcher) {
    return { platformData: { connectionStatus: "connected" } };
  }

  try {
    const data = await fetcher(accessToken, channelId);
    return data;
  } catch (e) {
    logger.error(`[PlatformFetcher:${platform}] Error:`, e);
    return { platformData: { connectionStatus: "connected", fetchError: String(e) } };
  }
}
