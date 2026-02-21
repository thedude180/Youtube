import { db } from "./db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { OAUTH_CONFIGS } from "./oauth-config";
import { storage } from "./storage";
import { withRetry } from "./services/api-retry";

export interface PublishResult {
  success: boolean;
  platform: string;
  postId?: string;
  postUrl?: string;
  error?: string;
  skipped?: boolean;
}

const GOOGLE_PLATFORMS = new Set(["youtube", "youtubeshorts"]);

async function refreshTokenIfNeeded(channel: any): Promise<string | null> {
  if (!channel.accessToken) return null;

  if (channel.tokenExpiresAt && new Date(channel.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return channel.accessToken;
  }

  if (!channel.refreshToken) {
    console.log(`[Publisher] No refresh token for ${channel.platform} channel ${channel.id}, using existing token`);
    return channel.accessToken;
  }

  let tokenUrl: string;
  let body: Record<string, string>;
  let headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

  if (GOOGLE_PLATFORMS.has(channel.platform)) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return channel.accessToken;

    tokenUrl = "https://oauth2.googleapis.com/token";
    body = {
      grant_type: "refresh_token",
      refresh_token: channel.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    };
  } else {
    const config = OAUTH_CONFIGS[channel.platform as keyof typeof OAUTH_CONFIGS];
    if (!config) return channel.accessToken;

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) return channel.accessToken;

    tokenUrl = config.tokenUrl;
    body = {
      grant_type: "refresh_token",
      refresh_token: channel.refreshToken,
    };

    if (config.tokenAuthMethod === "header") {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      body.client_id = clientId;
    } else {
      body.client_id = clientId;
      body.client_secret = clientSecret;
    }
  }

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Publisher] Token refresh failed for ${channel.platform} (${res.status}):`, errText);

      if (res.status === 400 || res.status === 401) {
        console.error(`[Publisher] Token for ${channel.platform} channel ${channel.id} is invalid/revoked. User needs to reconnect.`);
        const existingPd = (channel as any).platformData || {};
        await storage.updateChannel(channel.id, {
          tokenExpiresAt: new Date(0),
          platformData: { ...existingPd, _connectionStatus: "expired", _lastVerifiedAt: Date.now() },
        });

        try {
          const platformName = channel.platform.charAt(0).toUpperCase() + channel.platform.slice(1);
          await storage.createNotification({
            userId: channel.userId,
            type: "platform_disconnect",
            title: `${platformName} Disconnected`,
            message: `Your ${platformName} connection has expired. Please reconnect in Settings > Channels to resume automation.`,
            severity: "critical",
          });

          const { sendReconnectEmail } = await import("./services/reconnect-email");
          sendReconnectEmail(channel.userId, channel.platform).catch(() => {});
        } catch (notifyErr) {
          console.error("[Publisher] Failed to send disconnect notification:", notifyErr);
        }

        return null;
      }
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

    const data = await withRetry(async () => {
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

        if (res.status === 401 || res.status === 403) {
          const nonRetryable: any = new Error(`X authentication expired. Please reconnect your X account in Settings > Channels to restore posting.`);
          nonRetryable.status = res.status;
          nonRetryable.nonRetryable = true;
          throw nonRetryable;
        }

        const err: any = new Error(`X API error ${res.status}: ${errData.substring(0, 200)}`);
        err.status = res.status;
        throw err;
      }

      return await res.json() as any;
    }, "X post", {
      maxRetries: 3,
      retryOn: (error) => !error.nonRetryable && (error.status === 429 || error.status === 503 || error.status === 502 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'),
    });
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

    if (!discordWebhookUrl) {
      return {
        success: false,
        platform: "discord",
        skipped: true,
        error: "Discord requires a webhook URL for posting. Go to Settings > Channels > Discord and add a webhook URL from your Discord server (Server Settings > Integrations > Webhooks).",
      };
    }

    const discordContent = content.substring(0, 2000);
    const hasTitle = discordContent.startsWith("**") && discordContent.includes("**\n");

    let discordPayload: any;
    if (hasTitle) {
      const titleMatch = discordContent.match(/^\*\*(.+?)\*\*/);
      const title = titleMatch ? titleMatch[1] : undefined;
      const description = title ? discordContent.replace(`**${title}**`, "").trim() : discordContent;
      discordPayload = {
        embeds: [{
          title: title?.substring(0, 256),
          description: description.substring(0, 4096),
          color: 0x9146FF,
        }],
      };
    } else {
      discordPayload = { content: discordContent };
    }

    await withRetry(async () => {
      const res = await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });

      if (!res.ok) {
        const errText = await res.text();

        if (res.status === 404) {
          const nonRetryable: any = new Error("Discord webhook not found. The webhook may have been deleted. Please create a new webhook in your Discord server and update it in Settings > Channels > Discord.");
          nonRetryable.status = res.status;
          nonRetryable.nonRetryable = true;
          throw nonRetryable;
        }

        const err: any = new Error(`Discord webhook failed (${res.status}): ${errText.substring(0, 200)}`);
        err.status = res.status;
        throw err;
      }
    }, "Discord post", {
      maxRetries: 3,
      retryOn: (error) => !error.nonRetryable && (error.status === 429 || error.status === 503 || error.status === 502 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'),
    });

    return { success: true, platform: "discord", postId: `webhook_${Date.now()}` };
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

    const twitchContent = content.replace(/\*\*/g, "").replace(/\n{3,}/g, "\n\n");
    const chatMessage = twitchContent.length > 500 ? twitchContent.substring(0, 497) + "..." : twitchContent;

    const chatResult = await withRetry(async () => {
      const chatRes = await fetch(`https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: chatMessage,
          color: "primary",
        }),
      });

      if (chatRes.ok || chatRes.status === 204) {
        return { ok: true } as const;
      }

      const errText = await chatRes.text();
      const err: any = new Error(`Chat announcement failed (${chatRes.status}): ${errText.substring(0, 200)}`);
      err.status = chatRes.status;
      if (chatRes.status === 401 || chatRes.status === 403 || chatRes.status === 404) {
        err.nonRetryable = true;
      }
      throw err;
    }, "Twitch announcement", {
      maxRetries: 2,
      retryOn: (error) => !error.nonRetryable && (error.status === 429 || error.status === 503 || error.status === 502 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'),
    }).catch((e) => ({ ok: false, error: e } as const));

    if (chatResult.ok) {
      return {
        success: true,
        platform: "twitch",
        postId: `twitch_announce_${Date.now()}`,
        postUrl: `https://twitch.tv/${channelData?.channelName || broadcasterId}`,
      };
    }

    console.error(`[Publisher:Twitch] Chat announcement failed:`, chatResult.error.message);

    const titleContent = twitchContent.replace(/\n/g, " ").substring(0, 140);
    const titleResult = await withRetry(async () => {
      const titleRes = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ title: titleContent }),
      });

      if (titleRes.ok || titleRes.status === 204) {
        return { ok: true } as const;
      }

      const titleErr = await titleRes.text();
      const err: any = new Error(`Title update failed (${titleRes.status}): ${titleErr.substring(0, 200)}`);
      err.status = titleRes.status;
      throw err;
    }, "Twitch title update", {
      maxRetries: 2,
      retryOn: (error) => error.status === 429 || error.status === 503 || error.status === 502 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT',
    }).catch((e) => ({ ok: false, error: e } as const));

    if (titleResult.ok) {
      return {
        success: true,
        platform: "twitch",
        postId: `twitch_title_${Date.now()}`,
        postUrl: `https://twitch.tv/${channelData?.channelName || broadcasterId}`,
      };
    }

    return { success: false, platform: "twitch", error: `Twitch posting failed: ${chatResult.error.message}, ${titleResult.error.message}` };
  } catch (err: any) {
    return { success: false, platform: "twitch", error: err.message };
  }
}

async function postToKick(_accessToken: string, _content: string, _channelData: any): Promise<PublishResult> {
  return {
    success: false,
    platform: "kick",
    skipped: true,
    error: "Kick does not currently offer a public content posting API. Your Kick account is connected for stream key access and live detection. Content announcements can be cross-posted via Discord or X instead.",
  };
}

export async function publishToplatform(
  userId: string,
  platform: string,
  content: string,
  metadata?: any,
): Promise<PublishResult> {
  if (platform === "youtube" || platform === "youtubeshorts") {
    return {
      success: false,
      platform,
      skipped: true,
      error: "YouTube publishing uses the dedicated YouTube Data API pipeline. Content is pushed via SEO optimization and metadata updates automatically.",
    };
  }

  if (platform === "tiktok") {
    const { publishVideoToTikTok } = await import("./tiktok-publisher");
    const result = await publishVideoToTikTok(userId, content, metadata);
    return {
      success: result.success,
      platform: "tiktok",
      postId: result.publishId,
      error: result.error,
    };
  }

  if (platform === "kick") {
    return postToKick("", content, null);
  }

  if (platform === "rumble") {
    return {
      success: false,
      platform: "rumble",
      skipped: true,
      error: "Rumble is configured for AI-driven streaming only. Content distribution is handled through other platforms.",
    };
  }

  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, platform)));

  const channel = userChannels.find(c => c.accessToken);
  if (!channel) {
    return {
      success: false,
      platform,
      error: `No connected ${platform} account with valid credentials. Connect your account in Settings > Channels.`,
    };
  }

  const accessToken = await refreshTokenIfNeeded(channel);
  if (!accessToken) {
    return {
      success: false,
      platform,
      error: `${platform} authentication has expired or been revoked. Please reconnect your ${platform} account in Settings > Channels.`,
    };
  }

  switch (platform) {
    case "x":
      return postToX(accessToken, content);
    case "discord":
      return postToDiscord(accessToken, content, channel);
    case "twitch":
      return postToTwitch(accessToken, content, channel);
    default:
      return { success: false, platform, error: `Publishing not yet supported for ${platform}` };
  }
}
