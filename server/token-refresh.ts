import type { Platform } from "@shared/schema";
import { OAUTH_CONFIGS } from "./oauth-config";
import { db } from "./db";
import { channels } from "@shared/schema";
import { users as usersTable } from "@shared/models/auth";
import { eq, lt, and, isNotNull, isNull, or } from "drizzle-orm";

import { createLogger } from "./lib/logger";

const logger = createLogger("token-refresh");

// Keep the users.google_refresh_token in sync whenever a YouTube channel token is rotated.
// Without this, the users-table backup diverges from the channel token over time.
// When markChannelExpired wipes the channel token, syncChannelTokens tries to restore
// from users.google_refresh_token — but if that's weeks out-of-date, Google rejects it
// with invalid_grant, and the token is permanently lost until the user manually reconnects.
async function syncGoogleUserToken(userId: string, accessToken: string, refreshToken: string | null | undefined, expiresAt: Date | null | undefined): Promise<void> {
  try {
    const update: Record<string, any> = {
      googleAccessToken: accessToken,
      googleTokenExpiresAt: expiresAt ?? new Date(Date.now() + 3600 * 1000),
    };
    if (refreshToken) {
      update.googleRefreshToken = refreshToken;
    }
    await db.update(usersTable).set(update).where(eq(usersTable.id, userId));
  } catch (e) {
    logger.warn(`[TokenRefresh] Failed to sync Google user token for user ${userId}:`, e);
  }
}
interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
}

const GOOGLE_PLATFORMS = new Set<string>(["youtube", "youtubeshorts"]);

async function refreshGoogleToken(currentRefreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { success: false, error: "Missing Google OAuth credentials (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)" };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[TokenRefresh:google] Failed:`, errText);

      if (errText.includes("invalid_grant") || errText.includes("Token has been expired or revoked")) {
        return { success: false, error: "Google token expired - user needs to re-authorize YouTube" };
      }
      return { success: false, error: `Google token refresh failed: ${res.status}` };
    }

    const data = await res.json() as any;
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || currentRefreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  } catch (e: any) {
    const isAbort = e?.name === "AbortError" || String(e).includes("AbortError");
    const isNetwork = e?.code === "ECONNRESET" || e?.code === "ECONNREFUSED" || String(e).includes("fetch failed");
    if (isAbort || isNetwork) {
      logger.warn(`[TokenRefresh:google] Transient network error: ${String(e).substring(0, 100)}`);
    } else {
      logger.error("[TokenRefresh:google] Error:", e);
    }
    return { success: false, error: String(e) };
  }
}

async function refreshTokenOnce(platform: Platform, currentRefreshToken: string): Promise<RefreshResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config) return { success: false, error: `No OAuth config for ${platform}` };

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return { success: false, error: `Missing credentials for ${platform}` };

  try {
    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    };

    if (config.usesClientKey) {
      body.client_key = clientId;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (config.tokenAuthMethod === "header") {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      delete body.client_id;
      delete body.client_secret;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(config.tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(body).toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[TokenRefresh:${platform}] Failed (${res.status}):`, errText);

      const isPermanentlyDead =
        (errText.includes("invalid_grant") && !errText.includes("invalid_grant_type")) ||
        errText.includes("was invalid") ||
        errText.includes("token has been revoked") ||
        errText.includes("Token has been expired or revoked");

      if (isPermanentlyDead || (res.status === 401 && !errText.includes("rate"))) {
        return { success: false, error: `Token expired - user needs to re-authorize ${platform}` };
      }
      return { success: false, error: `Token refresh failed: ${res.status} — ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as any;
    const expiresIn = data.expires_in;

    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || currentRefreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  } catch (e: any) {
    const isAbort = e?.name === "AbortError" || String(e).includes("AbortError");
    const isNetwork = e?.code === "ECONNRESET" || e?.code === "ECONNREFUSED" || String(e).includes("fetch failed");
    if (isAbort || isNetwork) {
      logger.warn(`[TokenRefresh:${platform}] Transient network error: ${String(e).substring(0, 100)}`);
    } else {
      logger.error(`[TokenRefresh:${platform}] Error:`, e);
    }
    return { success: false, error: String(e) };
  }
}

async function refreshToken(platform: Platform, currentRefreshToken: string): Promise<RefreshResult> {
  if (GOOGLE_PLATFORMS.has(platform)) {
    return refreshGoogleToken(currentRefreshToken);
  }

  const result = await refreshTokenOnce(platform, currentRefreshToken);
  if (result.success) return result;

  const isTransient = result.error && !result.error.includes("Token expired") && !result.error.includes("re-authorize");
  if (isTransient) {
    logger.info(`[TokenRefresh:${platform}] Transient failure, retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
    const retry = await refreshTokenOnce(platform, currentRefreshToken);
    if (retry.success) return retry;

    logger.info(`[TokenRefresh:${platform}] Retry 2 in 5s...`);
    await new Promise(r => setTimeout(r, 5000));
    return refreshTokenOnce(platform, currentRefreshToken);
  }

  return result;
}

export async function refreshSingleChannel(ch: { platform: string; refreshToken: string | null }): Promise<RefreshResult> {
  if (!ch.refreshToken) return { success: false, error: "No refresh token" };
  return refreshToken(ch.platform as Platform, ch.refreshToken);
}


// Widen the buffer: refresh tokens 24 hours before expiry instead of 2 hours.
// This gives a full day of runway before any token risks going stale.
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

// How many consecutive permanent failures before we accept the token as dead.
// 3 retries over 30 minutes avoids flagging tokens dead due to transient Google API outages.
const PERMANENT_FAILURE_THRESHOLD = 3;

async function markChannelExpired(channelId: number, userId: string, existingPlatformData: any): Promise<void> {
  // ── Last-ditch rescue: try users table google_refresh_token before accepting death ──
  // This catches the scenario where channels.refresh_token was rotated and went stale,
  // but a fresh users.google_refresh_token exists (e.g. from a recent manual reconnect).
  if (userId) {
    try {
      const [userRow] = await db
        .select({ googleRefreshToken: usersTable.googleRefreshToken })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (userRow?.googleRefreshToken) {
        const rescued = await refreshGoogleToken(userRow.googleRefreshToken);
        if (rescued.success && rescued.accessToken) {
          const newRefresh = rescued.refreshToken || userRow.googleRefreshToken;
          await db.update(channels).set({
            accessToken: rescued.accessToken,
            refreshToken: newRefresh,
            tokenExpiresAt: rescued.expiresAt ?? new Date(Date.now() + 3600 * 1000),
            platformData: {
              ...(existingPlatformData || {}),
              _connectionStatus: "active",
              _lastRefresh: new Date().toISOString(),
              _permanentFailures: 0,
              _rescuedAt: new Date().toISOString(),
            },
          }).where(eq(channels.id, channelId));
          await syncGoogleUserToken(userId, rescued.accessToken, newRefresh, rescued.expiresAt ?? null);
          logger.info(`[TokenRefresh] ✓ Emergency rescue: channel ${channelId} restored from users-table backup`);
          return; // Saved — skip the expiry write
        }
      }
    } catch (rescueErr) {
      logger.warn(`[TokenRefresh] Emergency rescue failed for channel ${channelId}:`, rescueErr);
    }
  }

  // All rescue attempts exhausted — mark expired and send an in-app alert
  await db.update(channels).set({
    tokenExpiresAt: null,
    refreshToken: null,
    platformData: {
      ...(existingPlatformData || {}),
      _connectionStatus: "expired",
      _expiredAt: new Date().toISOString(),
      _permanentFailures: 0,
    },
  }).where(eq(channels.id, channelId));

  // Notify user in real-time so the reconnect banner fires immediately
  if (userId) {
    try {
      const { sendSSEEvent } = await import("./routes/events");
      sendSSEEvent(userId, "platform-disconnected", { platform: "youtube", reason: "token_expired" });
    } catch { /* SSE not critical */ }
  }
}

export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const threshold = new Date(Date.now() + REFRESH_BUFFER_MS);

  let refreshed = 0;
  let failed = 0;

  try {
    const allExpiring = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, threshold)
      )
    );

    const isDevEnvExpiry = !process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production";

    for (const ch of allExpiring) {
      if (!ch.refreshToken || !ch.platform) continue;
      const pd = (ch.platformData || {}) as any;

      // In dev, skip expiry-based refresh for non-dev users — production manages its own tokens.
      // This prevents a simultaneous refresh race that would consume and invalidate production refresh tokens.
      if (isDevEnvExpiry && ch.userId !== "dev_bypass_user") {
        continue;
      }

      // Only stop retrying after hitting the permanent failure threshold
      if (pd._connectionStatus === "expired" && (pd._permanentFailures || 0) >= PERMANENT_FAILURE_THRESHOLD) continue;

      const result = await refreshToken(ch.platform as Platform, ch.refreshToken);

      if (result.success && result.accessToken) {
        const rotatedRefresh = result.refreshToken || ch.refreshToken;
        await db.update(channels).set({
          accessToken: result.accessToken,
          refreshToken: rotatedRefresh,
          tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
          platformData: {
            ...(pd),
            _connectionStatus: "active",
            _lastRefresh: new Date().toISOString(),
            _permanentFailures: 0,
          },
        }).where(eq(channels.id, ch.id));
        // Keep users.google_refresh_token in sync so the backup never goes stale.
        // If this is skipped, the backup diverges and can't be used to restore after a wipe.
        if (GOOGLE_PLATFORMS.has(ch.platform) && ch.userId) {
          await syncGoogleUserToken(ch.userId, result.accessToken, rotatedRefresh, result.expiresAt || ch.tokenExpiresAt);
        }
        refreshed++;
      } else {
        const isExpiredPermanently = result.error?.includes("Token expired") || result.error?.includes("re-authorize");
        if (isExpiredPermanently) {
          const failures = (pd._permanentFailures || 0) + 1;
          if (failures >= PERMANENT_FAILURE_THRESHOLD) {
            await markChannelExpired(ch.id, ch.userId || "", pd);
            logger.error(`[TokenRefresh] ${ch.platform} channel ${ch.channelName} confirmed expired after ${failures} attempts — user must re-authorize`);
          } else {
            // Don't wipe the token yet — wait for more failures to confirm it's truly dead
            await db.update(channels).set({
              platformData: {
                ...pd,
                _connectionStatus: "degraded",
                _permanentFailures: failures,
                _lastFailureAt: new Date().toISOString(),
              },
            }).where(eq(channels.id, ch.id));
            logger.warn(`[TokenRefresh] ${ch.platform} channel ${ch.channelName} failed (attempt ${failures}/${PERMANENT_FAILURE_THRESHOLD}) — will retry`);
          }
        } else {
          logger.warn(`[TokenRefresh] Failed to refresh ${ch.platform} channel ${ch.channelName}: ${result.error}`);
        }
        failed++;
      }
    }
  } catch (e) {
    logger.error("[TokenRefresh] Error checking expiring tokens:", e);
  }

  return { refreshed, failed };
}

// Daily keepalive: refresh ALL active tokens once per day regardless of expiry.
// This prevents refresh tokens from ever going stale due to inactivity (Google revokes
// refresh tokens that haven't been used in 6 months — daily exercise prevents this entirely).
export async function keepAliveAllTokens(): Promise<{ kept: number; failed: number }> {
  let kept = 0;
  let failed = 0;

  logger.info("[TokenKeepalive] Starting daily keepalive for all active channels...");

  try {
    const activeChannels = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.accessToken),
      )
    );

    const isDevEnv = !process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production";

    for (const ch of activeChannels) {
      if (!ch.refreshToken || !ch.platform) continue;
      const pd = (ch.platformData || {}) as any;

      // In dev, skip proactive keepalive for non-dev users.
      // Production has its own token-refresh loop; running it from dev simultaneously
      // would race to consume the same refresh tokens and could invalidate production sessions.
      if (isDevEnv && ch.userId !== "dev_bypass_user") {
        kept++;
        continue;
      }

      // If previously confirmed expired — retry once every 4 hours.
      // The refresh token may still be valid even if the access token was marked expired.
      // Only give up permanently after PERMANENT_FAILURE_THRESHOLD consecutive failures.
      if (pd._connectionStatus === "expired") {
        const failures = (pd._permanentFailures || 0) as number;
        if (failures >= PERMANENT_FAILURE_THRESHOLD) continue; // genuinely dead, skip
        const lastAttempt = pd._lastKeepaliveAttempt ? new Date(pd._lastKeepaliveAttempt).getTime() : 0;
        if (Date.now() - lastAttempt < 4 * 60 * 60 * 1000) continue; // too soon, try again later
        // Fall through to attempt refresh
        logger.info(`[TokenKeepalive] Retrying expired channel ${ch.platform} (attempt ${failures + 1}/${PERMANENT_FAILURE_THRESHOLD})`);
        await db.update(channels).set({
          platformData: { ...pd, _lastKeepaliveAttempt: new Date().toISOString() },
        }).where(eq(channels.id, ch.id));
      }

      // Skip if we refreshed this channel in the last 20 hours (no need to refresh twice in one day)
      if (pd._connectionStatus !== "expired" && pd._lastRefresh) {
        const lastRefresh = new Date(pd._lastRefresh).getTime();
        if (Date.now() - lastRefresh < 20 * 60 * 60 * 1000) {
          kept++;
          continue;
        }
      }

      try {
        const result = await refreshToken(ch.platform as Platform, ch.refreshToken);

        if (result.success && result.accessToken) {
          const rotatedRefresh = result.refreshToken || ch.refreshToken;
          await db.update(channels).set({
            accessToken: result.accessToken,
            refreshToken: rotatedRefresh,
            tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
            platformData: {
              ...pd,
              _connectionStatus: "active",
              _lastRefresh: new Date().toISOString(),
              _permanentFailures: 0,
              _keepaliveAt: new Date().toISOString(),
            },
          }).where(eq(channels.id, ch.id));
          // Mirror the latest refresh token back to the users table backup so it
          // never goes stale. This is the key fix for the recurring token-loss bug.
          if (GOOGLE_PLATFORMS.has(ch.platform) && ch.userId) {
            await syncGoogleUserToken(ch.userId, result.accessToken, rotatedRefresh, result.expiresAt || ch.tokenExpiresAt);
          }
          kept++;
        } else {
          const isPermanent = result.error?.includes("Token expired") || result.error?.includes("re-authorize");
          if (isPermanent) {
            const failures = (pd._permanentFailures || 0) + 1;
            if (failures >= PERMANENT_FAILURE_THRESHOLD) {
              await markChannelExpired(ch.id, ch.userId || "", pd);
              logger.error(`[TokenKeepalive] ${ch.platform} ${ch.channelName} confirmed dead — user must re-authorize`);
            } else {
              await db.update(channels).set({
                platformData: { ...pd, _connectionStatus: "degraded", _permanentFailures: failures, _lastFailureAt: new Date().toISOString() },
              }).where(eq(channels.id, ch.id));
            }
          }
          failed++;
        }
      } catch (e) {
        logger.warn(`[TokenKeepalive] Error refreshing ${ch.platform} channel ${ch.id}:`, e);
        failed++;
      }

      // Small stagger to avoid hammering OAuth endpoints
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    logger.error("[TokenKeepalive] Error during keepalive:", e);
  }

  logger.info(`[TokenKeepalive] Done — ${kept} kept alive, ${failed} failed`);
  return { kept, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// repairNullTokenChannels — recovers channels where BOTH tokens became null
// The regular keepalive only processes channels that still have a refresh_token.
// This fills the gap: when both tokens are gone, try the users-table backup.
// Called by the YouTube Token Guardian every 30 minutes.
// ─────────────────────────────────────────────────────────────────────────────
export async function repairNullTokenChannels(): Promise<{ repaired: number; alerted: number }> {
  let repaired = 0;
  let alerted = 0;

  try {
    // Find Google-platform channels where access_token AND refresh_token are both null
    const nullChannels = await db.select({
      id: channels.id,
      userId: channels.userId,
      platform: channels.platform,
      channelName: channels.channelName,
      platformData: channels.platformData,
    }).from(channels).where(
      and(
        or(isNull(channels.accessToken), eq(channels.accessToken, "")),
        or(isNull(channels.refreshToken), eq(channels.refreshToken, "")),
        or(eq(channels.platform, "youtube"), eq(channels.platform, "youtube_studio")),
      )
    );

    if (nullChannels.length === 0) {
      logger.info("[TokenGuardian] All YouTube channels have tokens — nothing to repair");
      return { repaired, alerted };
    }

    logger.warn(`[TokenGuardian] Found ${nullChannels.length} YouTube channel(s) with null tokens — attempting repair`);

    for (const ch of nullChannels) {
      if (!ch.userId) continue;
      const pd = (ch.platformData || {}) as any;

      try {
        // Look up users-table backup
        const [userRow] = await db
          .select({ googleRefreshToken: usersTable.googleRefreshToken })
          .from(usersTable)
          .where(eq(usersTable.id, ch.userId))
          .limit(1);

        if (!userRow?.googleRefreshToken) {
          logger.warn(`[TokenGuardian] No backup token for channel ${ch.id} (${ch.channelName}) — user must reconnect`);
          // Send SSE alert so the reconnect banner fires immediately
          try {
            const { sendSSEEvent } = await import("./routes/events");
            sendSSEEvent(ch.userId, "platform-disconnected", { platform: ch.platform || "youtube", reason: "no_token" });
          } catch { /* SSE not critical */ }
          alerted++;
          continue;
        }

        const rescued = await refreshGoogleToken(userRow.googleRefreshToken);
        if (rescued.success && rescued.accessToken) {
          const newRefresh = rescued.refreshToken || userRow.googleRefreshToken;
          await db.update(channels).set({
            accessToken: rescued.accessToken,
            refreshToken: newRefresh,
            tokenExpiresAt: rescued.expiresAt ?? new Date(Date.now() + 3600 * 1000),
            platformData: {
              ...pd,
              _connectionStatus: "active",
              _lastRefresh: new Date().toISOString(),
              _permanentFailures: 0,
              _guardianRepair: new Date().toISOString(),
            },
          }).where(eq(channels.id, ch.id));
          await syncGoogleUserToken(ch.userId, rescued.accessToken, newRefresh, rescued.expiresAt ?? null);
          logger.info(`[TokenGuardian] ✓ Repaired channel ${ch.id} (${ch.channelName}) from users-table backup`);
          repaired++;
        } else {
          logger.warn(`[TokenGuardian] Backup token for channel ${ch.id} (${ch.channelName}) is also invalid — user must reconnect`);
          try {
            const { sendSSEEvent } = await import("./routes/events");
            sendSSEEvent(ch.userId, "platform-disconnected", { platform: ch.platform || "youtube", reason: "backup_invalid" });
          } catch { /* SSE not critical */ }
          alerted++;
        }
      } catch (err) {
        logger.error(`[TokenGuardian] Error repairing channel ${ch.id}:`, err);
      }

      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    logger.error("[TokenGuardian] Fatal error in repairNullTokenChannels:", e);
  }

  logger.info(`[TokenGuardian] Repair cycle done — ${repaired} repaired, ${alerted} users alerted`);
  return { repaired, alerted };
}
