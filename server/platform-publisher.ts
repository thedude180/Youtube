import { db } from "./db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { OAUTH_CONFIGS } from "./oauth-config";
import { storage } from "./storage";

export interface PublishResult {
  success: boolean;
  platform: string;
  postId?: string;
  postUrl?: string;
  error?: string;
}

async function refreshTokenIfNeeded(channel: any): Promise<string | null> {
  if (!channel.accessToken) return null;

  if (channel.tokenExpiresAt && new Date(channel.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return channel.accessToken;
  }

  if (!channel.refreshToken) {
    console.log(`[Publisher] No refresh token for ${channel.platform} channel ${channel.id}, using existing token`);
    return channel.accessToken;
  }

  const config = OAUTH_CONFIGS[channel.platform as keyof typeof OAUTH_CONFIGS];
  if (!config) return channel.accessToken;

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return channel.accessToken;

  try {
    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: channel.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (config.tokenAuthMethod === "header") {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      delete body.client_id;
      delete body.client_secret;
    }

    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      console.error(`[Publisher] Token refresh failed for ${channel.platform}:`, await res.text());
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

    console.log(`[Publisher] Token refreshed for ${channel.platform} channel ${channel.id}`);
    return newToken;
  } catch (err: any) {
    console.error(`[Publisher] Token refresh error for ${channel.platform}:`, err.message);
    return channel.accessToken;
  }
}

async function postToX(accessToken: string, content: string): Promise<PublishResult> {
  try {
    const tweetText = content.length > 280 ? content.substring(0, 277) + "..." : content;

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText }),
    });

    if (!res.ok) {
      const errData = await res.text();
      console.error(`[Publisher:X] Post failed (${res.status}):`, errData);
      return { success: false, platform: "x", error: `X API error ${res.status}: ${errData.substring(0, 200)}` };
    }

    const data = await res.json() as any;
    const tweetId = data.data?.id;
    if (!tweetId) {
      return { success: false, platform: "x", error: "X API returned no tweet ID" };
    }
    return {
      success: true,
      platform: "x",
      postId: tweetId,
      postUrl: `https://x.com/i/status/${tweetId}`,
    };
  } catch (err: any) {
    return { success: false, platform: "x", error: err.message };
  }
}

async function postToDiscord(accessToken: string, content: string, channelData: any): Promise<PublishResult> {
  try {
    const discordWebhookUrl = (channelData?.platformData as any)?.webhookUrl
      || (channelData?.settings as any)?.webhookUrl;

    if (discordWebhookUrl) {
      const res = await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.substring(0, 2000) }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, platform: "discord", error: `Discord webhook failed (${res.status}): ${errText.substring(0, 200)}` };
      }

      return { success: true, platform: "discord", postId: `webhook_${Date.now()}` };
    }

    const guilds = (channelData?.platformData as any)?.guilds;
    if (!guilds || guilds.length === 0) {
      return { success: false, platform: "discord", error: "No Discord servers accessible. Please set up a webhook URL in your Discord channel settings, or reconnect your Discord account." };
    }

    const targetGuild = guilds.find((g: any) => g.owner) || guilds[0];
    const guildId = targetGuild.id;

    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });

    if (!channelsRes.ok) {
      return { success: false, platform: "discord", error: `Cannot access Discord server channels (${channelsRes.status}). User OAuth tokens have limited permissions. Set up a Discord webhook URL in your channel settings for reliable posting.` };
    }

    const allChannels = await channelsRes.json() as any[];
    const textChannel = allChannels.find((ch: any) =>
      ch.type === 0 && (ch.name?.includes("general") || ch.name?.includes("announce") || ch.name?.includes("content") || ch.name?.includes("updates"))
    ) || allChannels.find((ch: any) => ch.type === 0);

    if (!textChannel) {
      return { success: false, platform: "discord", error: "No text channel found in Discord server" };
    }

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${textChannel.id}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: content.substring(0, 2000) }),
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      return { success: false, platform: "discord", error: `Discord message post failed (${msgRes.status}): ${errText.substring(0, 200)}. Consider setting up a webhook URL for more reliable posting.` };
    }

    const msg = await msgRes.json() as any;
    if (!msg.id) {
      return { success: false, platform: "discord", error: "Discord API returned no message ID" };
    }
    return {
      success: true,
      platform: "discord",
      postId: msg.id,
      postUrl: `https://discord.com/channels/${guildId}/${textChannel.id}/${msg.id}`,
    };
  } catch (err: any) {
    return { success: false, platform: "discord", error: err.message };
  }
}

async function postToTwitch(accessToken: string, content: string, channelData: any): Promise<PublishResult> {
  try {
    const broadcasterId = channelData?.channelId || (channelData?.platformData as any)?.broadcasterId;
    if (!broadcasterId) {
      return { success: false, platform: "twitch", error: "No broadcaster ID found. Please reconnect your Twitch account." };
    }

    const clientId = process.env.TWITCH_CLIENT_ID || "";
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
    };

    const chatRes = await fetch(`https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: content.substring(0, 500),
        color: "primary",
      }),
    });

    if (chatRes.ok || chatRes.status === 204) {
      return {
        success: true,
        platform: "twitch",
        postId: `twitch_announce_${Date.now()}`,
        postUrl: `https://twitch.tv/${channelData?.channelName || broadcasterId}`,
      };
    }

    const errText = await chatRes.text();
    console.error(`[Publisher:Twitch] Chat announcement failed (${chatRes.status}):`, errText);

    const titleContent = content.substring(0, 140);
    const titleRes = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ title: titleContent }),
    });

    if (titleRes.ok || titleRes.status === 204) {
      return {
        success: true,
        platform: "twitch",
        postId: `twitch_title_${Date.now()}`,
        postUrl: `https://twitch.tv/${channelData?.channelName || broadcasterId}`,
      };
    }

    const titleErr = await titleRes.text();
    return { success: false, platform: "twitch", error: `Twitch posting failed: announcement (${chatRes.status}), title update (${titleRes.status}): ${titleErr.substring(0, 200)}` };
  } catch (err: any) {
    return { success: false, platform: "twitch", error: err.message };
  }
}

async function postToTikTok(accessToken: string, content: string): Promise<PublishResult> {
  return {
    success: false,
    platform: "tiktok",
    error: "TikTok Content Posting API requires video files. Text-only posting is not supported by TikTok's API. Video upload publishing will be available when video files are provided through the pipeline.",
  };
}

async function postToKick(accessToken: string, content: string, channelData: any): Promise<PublishResult> {
  return {
    success: false,
    platform: "kick",
    error: "Kick does not currently offer a public content posting API. Your Kick account is connected for stream key access and live detection. Content announcements can be cross-posted via Discord or X instead.",
  };
}

export async function publishToplatform(
  userId: string,
  platform: string,
  content: string,
): Promise<PublishResult> {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, platform)));

  const channel = userChannels.find(c => c.accessToken);
  if (!channel) {
    return {
      success: false,
      platform,
      error: `No connected ${platform} account with valid credentials. Connect your account in Content > Channels.`,
    };
  }

  const accessToken = await refreshTokenIfNeeded(channel);
  if (!accessToken) {
    return {
      success: false,
      platform,
      error: `Failed to get valid access token for ${platform}. Please reconnect your account.`,
    };
  }

  switch (platform) {
    case "x":
      return postToX(accessToken, content);
    case "discord":
      return postToDiscord(accessToken, content, channel);
    case "twitch":
      return postToTwitch(accessToken, content, channel);
    case "tiktok":
      return postToTikTok(accessToken, content);
    case "kick":
      return postToKick(accessToken, content, channel);
    case "youtube":
      return { success: false, platform: "youtube", error: "YouTube publishing is handled separately through the YouTube Data API pipeline." };
    default:
      return { success: false, platform, error: `Publishing not yet supported for ${platform}` };
  }
}
