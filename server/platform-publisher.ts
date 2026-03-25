import { db } from "./db";
import { channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { OAUTH_CONFIGS } from "./oauth-config";
import { storage } from "./storage";
import { withRetry } from "./services/api-retry";
import { PLATFORM_CONTENT_SPECS, getTitleLimit, getDescriptionLimit } from "@shared/platform-specs";
import { formatContentForPlatform } from "./lib/platform-formatter";

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);

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

    return newToken;
  } catch (err: any) {
    console.error(`[Publisher] Token refresh error for ${channel.platform}:`, err.message);
    return channel.accessToken;
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

    const discordLimit = PLATFORM_CONTENT_SPECS.discord.limits.postMaxLength || 2000;
    const discordContent = content.substring(0, discordLimit);
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
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
        signal: ctrl.signal,
      });
      clearTimeout(t);

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
    error: "Kick is configured for AI-driven streaming only. Content distribution is handled through other platforms.",
  };
}

export function sanitizePlaceholders(text: string, meta?: any): string {
  if (!text) return text;
  const channelUrl = meta?.channelUrl || meta?.youtubeChannelUrl || "";
  const videoUrl = meta?.videoUrl || meta?.youtubeUrl || "";
  const streamUrl = meta?.streamUrl || meta?.liveStreamUrl || videoUrl || channelUrl || "";

  let result = text;
  result = result.replace(/\[LINK TO ORIGINAL LIVE STREAM\]/gi, streamUrl || "");
  result = result.replace(/\[LINK(?:\s+TO\s+\w+)*\]/gi, videoUrl || channelUrl || "");
  result = result.replace(/\[YOUR (?:CHANNEL|STREAM|VIDEO) (?:URL|LINK)\]/gi, channelUrl || "");
  result = result.replace(/\[(?:STREAM|VIDEO|CHANNEL) (?:URL|LINK)\]/gi, videoUrl || channelUrl || "");
  result = result.replace(/\[(?:INSERT|ADD|PASTE)[\w\s]*(?:URL|LINK)[\w\s]*\]/gi, videoUrl || channelUrl || "");
  result = result.replace(/\{\{[\w_]+\}\}/g, "");
  result = result.replace(/\[(?:SOCIAL LINKS?|TIMESTAMPS?|AFFILIATE DISCLAIMER)\s*(?:PLACEHOLDER)?\]/gi, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

export async function publishToplatform(
  userId: string,
  platform: string,
  content: string,
  metadata?: any,
): Promise<PublishResult> {
  content = sanitizePlaceholders(content, metadata);

  try {
    const { checkPublishingGates } = await import("./distribution/publishing-gates");
    const { getConnectionHealth, recordConnectionSuccess, recordConnectionFailure } = await import("./distribution/connection-health");
    const { recordDistributionLearning } = await import("./distribution/distribution-learning");

    const connectionHealth = getConnectionHealth(platform);
    if (connectionHealth.status === "open") {
      await recordDistributionLearning(userId, platform, "publish_blocked", {
        allowed: false,
        trustCost: 0,
        policyIssues: ["circuit breaker open"],
        connectionStatus: "open",
      }).catch(() => {});
      return {
        success: false,
        platform,
        error: `Platform ${platform} is temporarily unavailable (circuit breaker open). Will retry automatically.`,
      };
    }

    const trustCost = platform === "youtube" ? 10 : 5;
    try {
      const { checkTrustBudget } = await import("./kernel/trust-budget");
      const trustResult = await checkTrustBudget(userId, `distribution:${platform}`, trustCost);
      if (trustResult.blocked) {
        await recordDistributionLearning(userId, platform, "publish_trust_blocked", {
          allowed: false,
          trustCost,
          policyIssues: ["trust budget exhausted"],
          connectionStatus: connectionHealth.status,
        }).catch(() => {});
        return {
          success: false,
          platform,
          error: `Publishing blocked: trust budget exhausted for ${platform} distribution (remaining: ${trustResult.remaining}).`,
        };
      }
    } catch (trustErr: any) {
      await recordDistributionLearning(userId, platform, "publish_trust_error", {
        allowed: false,
        trustCost,
        policyIssues: ["trust budget check failed: " + (trustErr?.message || "unknown")],
        connectionStatus: connectionHealth.status,
      }).catch(() => {});
      return {
        success: false,
        platform,
        error: `Publishing blocked: trust budget check unavailable for ${platform}.`,
      };
    }

    try {
      const { probeCapability } = await import("./kernel/capability-probe");
      const probeResult = await probeCapability(platform, `${platform}:publish`, undefined, userId);
      if (probeResult.probeResult === "error") {
        await recordDistributionLearning(userId, platform, "publish_capability_failed", {
          allowed: false,
          trustCost,
          policyIssues: ["capability probe failed"],
          connectionStatus: connectionHealth.status,
        }).catch(() => {});
        return {
          success: false,
          platform,
          error: `Publishing blocked: capability probe failed for ${platform}. Platform integration may be unavailable.`,
        };
      }
    } catch (probeErr: any) {
      await recordDistributionLearning(userId, platform, "publish_capability_error", {
        allowed: false,
        trustCost,
        policyIssues: ["capability probe error: " + (probeErr?.message || "unknown")],
        connectionStatus: connectionHealth.status,
      }).catch(() => {});
      return {
        success: false,
        platform,
        error: `Publishing blocked: capability probe unavailable for ${platform}.`,
      };
    }

    const gateResult = await checkPublishingGates(userId, platform, {
      title: metadata?.title || content.slice(0, 100),
      description: metadata?.description || content,
      tags: metadata?.tags,
      hasDisclosure: metadata?.hasDisclosure,
      copyrightCleared: metadata?.copyrightCleared,
    });

    if (!gateResult.passed) {
      await recordDistributionLearning(userId, platform, "publish_policy_blocked", {
        allowed: false,
        trustCost,
        policyIssues: gateResult.issues,
        connectionStatus: connectionHealth.status,
      }).catch(() => {});
      return {
        success: false,
        platform,
        error: `Publishing blocked by policy gates: ${gateResult.issues.join("; ")}`,
      };
    }

    const startTime = Date.now();
    const result = await _executePublish(userId, platform, content, metadata);
    const latencyMs = Date.now() - startTime;

    if (result.success) {
      recordConnectionSuccess(platform, latencyMs);
    } else if (!result.skipped) {
      recordConnectionFailure(platform, latencyMs);
    }

    await recordDistributionLearning(userId, platform, result.success ? "publish_success" : "publish_failure", {
      allowed: result.success,
      trustCost,
      policyIssues: [],
      connectionStatus: connectionHealth.status,
    }).catch(() => {});

    return result;
  } catch (err: any) {
    return {
      success: false,
      platform,
      error: `Publishing blocked: governance pipeline error — ${err?.message || "unknown error"}. Content not published.`,
    };
  }
}

async function _executePublish(
  userId: string,
  platform: string,
  content: string,
  metadata?: any,
): Promise<PublishResult> {
  const formatted = formatContentForPlatform(platform, content, metadata);
  const formattedContent = formatted.content;
  if (formatted.warnings.length > 0) {
    console.info(`[Publisher:${platform}] Format warnings:`, formatted.warnings);
  }

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
    const tiktokContent = formatted.content;
    const enrichedMetadata = {
      ...metadata,
      tiktokCaption: tiktokContent,
    };
    const result = await publishVideoToTikTok(userId, tiktokContent, enrichedMetadata);
    return {
      success: result.success,
      platform: "tiktok",
      postId: result.publishId,
      error: result.error,
    };
  }

  if (platform === "kick") {
    return postToKick("", formattedContent, null);
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
    case "discord":
      return postToDiscord(accessToken, formattedContent, channel);
    case "twitch":
      return { success: false, platform: "twitch", error: "Twitch is configured for AI-driven streaming only. Content distribution is handled through other platforms." };
    default:
      return { success: false, platform, error: `Publishing not yet supported for ${platform}` };
  }
}
