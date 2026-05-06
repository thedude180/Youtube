import { db } from "./db";
import { channels, notifications } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { OAUTH_CONFIGS } from "./oauth-config";
import { storage } from "./storage";
import { withRetry } from "./services/api-retry";
import { PLATFORM_CONTENT_SPECS, getTitleLimit, getDescriptionLimit } from "@shared/platform-specs";
import { formatContentForPlatform } from "./lib/platform-formatter";

import { createLogger } from "./lib/logger";

const logger = createLogger("platform-publisher");
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
  // YouTube-only: skip token refresh entirely for disabled platforms.
  if (!GOOGLE_PLATFORMS.has(channel.platform)) return channel.accessToken;

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
      logger.error(`[Publisher] Token refresh failed for ${channel.platform} (${res.status}):`, errText);

      if (res.status === 400 || res.status === 401) {
        logger.error(`[Publisher] Token for ${channel.platform} channel ${channel.id} is invalid/revoked. User needs to reconnect.`);
        const existingPd = (channel as any).platformData || {};
        await storage.updateChannel(channel.id, {
          tokenExpiresAt: new Date(0),
          platformData: { ...existingPd, _connectionStatus: "expired", _lastVerifiedAt: Date.now() },
        });

        try {
          const platformName = channel.platform.charAt(0).toUpperCase() + channel.platform.slice(1);
          const recentDisconnectNotifs = await db.select({ id: notifications.id })
            .from(notifications)
            .where(and(
              eq(notifications.userId, channel.userId),
              eq(notifications.type, "platform_disconnect"),
              sql`${notifications.title} LIKE ${`%${platformName}%`}`,
              gte(notifications.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
            ))
            .limit(1);

          if (recentDisconnectNotifs.length === 0) {
            await storage.createNotification({
              userId: channel.userId,
              type: "platform_disconnect",
              title: `${platformName} Disconnected`,
              message: `Your ${platformName} connection has expired. Please reconnect in Settings > Channels to resume automation.`,
              severity: "critical",
            });

            const { sendReconnectEmail } = await import("./services/reconnect-email");
            sendReconnectEmail(channel.userId, channel.platform).catch(() => {});
          }
        } catch (notifyErr) {
          logger.error("[Publisher] Failed to send disconnect notification:", notifyErr);
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
    logger.error(`[Publisher] Token refresh error for ${channel.platform}:`, err.message);
    return channel.accessToken;
  }
}


// DISABLED: Discord publisher — YouTube-only mode.
async function postToDiscord(_accessToken: string, _content: string, _channelData: any): Promise<PublishResult> {
  return { success: false, platform: "discord", error: "YouTube-only mode — Discord publishing disabled" };
}
// DISABLED: Twitch publisher — YouTube-only mode.
async function postToTwitch(_accessToken: string, _content: string, _channelData: any): Promise<PublishResult> {
  return { success: false, platform: "twitch", error: "YouTube-only mode — Twitch publishing disabled" };
}
// DISABLED: Kick publisher — YouTube-only mode.
async function postToKick(_accessToken: string, _content: string, _channelData: any): Promise<PublishResult> {
  return { success: false, platform: "kick", error: "YouTube-only mode — Kick publishing disabled" };
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

  // YouTube-only enforcement: block any non-YouTube publish at the entry point.
  const ALLOWED = new Set(["youtube", "youtubeshorts", "youtube_shorts", "youtube-shorts"]);
  if (!ALLOWED.has(platform)) {
    return {
      success: false,
      platform,
      error: `Publishing to ${platform} is disabled — CreatorOS operates in YouTube-only mode. (410)`,
    };
  }

  try {
    const { checkPublishingGates } = await import("./distribution/publishing-gates");
    const { getConnectionHealth, recordConnectionSuccess, recordConnectionFailure } = await import("./distribution/connection-health");
    const { recordDistributionLearning } = await import("./distribution/distribution-learning");

    if (platform === "youtube" || platform === "youtubeshorts") {
      try {
        const { isQuotaBreakerTripped } = await import("./services/youtube-quota-tracker");
        if (isQuotaBreakerTripped()) {
          return {
            success: false,
            platform,
            error: `YouTube API quota exceeded — circuit breaker active until midnight Pacific. Will retry after reset.`,
          };
        }
      } catch {}
    }

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
      logger.warn(`[Publisher] Trust budget check threw (fail-open) for ${platform}:`, trustErr?.message);
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
      logger.warn(`[Publisher] Capability probe threw (fail-open) for ${platform}:`, probeErr?.message);
    }

    try {
      const { canPostToPlatformToday } = await import("./services/platform-budget-tracker");
      const budgetCheck = await canPostToPlatformToday(userId, platform);
      if (!budgetCheck.allowed) {
        await recordDistributionLearning(userId, platform, "publish_budget_blocked", {
          allowed: false,
          trustCost,
          policyIssues: [`daily budget exhausted: ${budgetCheck.reason}`],
          connectionStatus: connectionHealth.status,
        }).catch(() => {});
        return {
          success: false,
          platform,
          error: `Publishing deferred: ${platform} daily budget reached (${budgetCheck.reason}). Will retry when budget resets.`,
        };
      }
    } catch (budgetErr: any) {
      logger.warn(`[Publisher] Platform budget check threw (fail-open) for ${platform}:`, budgetErr?.message);
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

    try {
      const { detectComplianceDrift } = await import("./services/compliance-drift-detector");
      await detectComplianceDrift();
    } catch {}

    try {
      const { runPolicyPreFlight } = await import("./services/policy-preflight");
      const preFlightResult = await runPolicyPreFlight(userId, platform, {
        contentId: metadata?.contentId || metadata?.sourceVideoId || undefined,
        title: metadata?.title || content.slice(0, 100),
        description: metadata?.description || content,
        tags: metadata?.tags,
        hasAiContent: metadata?.hasAiContent,
        hasSponsoredContent: metadata?.hasSponsoredContent,
        hasAffiliateLinks: metadata?.hasAffiliateLinks,
        originTypes: metadata?.originTypes,
      });
      if (!preFlightResult.passed) {
        await recordDistributionLearning(userId, platform, "publish_preflight_blocked", {
          allowed: false,
          trustCost,
          policyIssues: preFlightResult.blockers,
          connectionStatus: connectionHealth.status,
        }).catch(() => {});
        return {
          success: false,
          platform,
          error: `Publishing blocked by pre-flight: ${preFlightResult.blockers.join("; ")}`,
        };
      }
    } catch (preFlightErr: unknown) {
      const msg = preFlightErr instanceof Error ? preFlightErr.message : "unknown error";
      logger.warn(`[Publisher] Pre-flight gate threw (fail-open) for ${platform}: ${msg}`);
    }

    const startTime = Date.now();
    const result = await executePublish(userId, platform, content, metadata);
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

export async function executePublish(
  userId: string,
  platform: string,
  content: string,
  metadata?: any,
): Promise<PublishResult> {
  // YouTube-only: block any non-YouTube platform that somehow bypassed publishToplatform().
  // This is a second line of defence — publishToplatform() already enforces the allowlist.
  const EXECUTE_ALLOWED = new Set(["youtube", "youtubeshorts", "youtube_shorts", "youtube-shorts"]);
  if (!EXECUTE_ALLOWED.has(platform)) {
    return { success: false, platform, error: `Platform ${platform} is disabled — YouTube-only mode. (410)` };
  }

  const formatted = formatContentForPlatform(platform, content, metadata);
  if (formatted.warnings.length > 0) {
    logger.info(`Format warnings for ${platform}`, { warnings: formatted.warnings });
  }

  // YouTube publishing uses the dedicated YouTube Data API pipeline, not this path.
  return {
    success: false,
    platform,
    skipped: true,
    error: "YouTube publishing uses the dedicated YouTube Data API pipeline. Content is pushed via SEO optimization and metadata updates automatically.",
  };
}

