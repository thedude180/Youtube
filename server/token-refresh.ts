import type { Platform } from "@shared/schema";
import { OAUTH_CONFIGS } from "./oauth-config";
import { db } from "./db";
import { channels } from "@shared/schema";
import { eq, lt, and, isNotNull } from "drizzle-orm";

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
      console.error(`[TokenRefresh:google] Failed:`, errText);

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
      console.warn(`[TokenRefresh:google] Transient network error: ${String(e).substring(0, 100)}`);
    } else {
      console.error("[TokenRefresh:google] Error:", e);
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
      console.error(`[TokenRefresh:${platform}] Failed (${res.status}):`, errText);

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
      console.warn(`[TokenRefresh:${platform}] Transient network error: ${String(e).substring(0, 100)}`);
    } else {
      console.error(`[TokenRefresh:${platform}] Error:`, e);
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
    console.log(`[TokenRefresh:${platform}] Transient failure, retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
    const retry = await refreshTokenOnce(platform, currentRefreshToken);
    if (retry.success) return retry;

    console.log(`[TokenRefresh:${platform}] Retry 2 in 5s...`);
    await new Promise(r => setTimeout(r, 5000));
    return refreshTokenOnce(platform, currentRefreshToken);
  }

  return result;
}

export async function refreshSingleChannel(ch: { platform: string; refreshToken: string | null }): Promise<RefreshResult> {
  if (!ch.refreshToken) return { success: false, error: "No refresh token" };
  return refreshToken(ch.platform as Platform, ch.refreshToken);
}

const X_PLATFORMS = new Set<string>(["x", "twitter"]);

// Widen the buffer: refresh tokens 24 hours before expiry instead of 2 hours.
// This gives a full day of runway before any token risks going stale.
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

// How many consecutive permanent failures before we accept the token as dead.
// 3 retries over 30 minutes avoids flagging tokens dead due to transient Google API outages.
const PERMANENT_FAILURE_THRESHOLD = 3;

async function markChannelExpired(channelId: number, existingPlatformData: any): Promise<void> {
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
}

export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const threshold = new Date(Date.now() + REFRESH_BUFFER_MS);

  let refreshed = 0;
  let failed = 0;

  try {
    const xThreshold = new Date(Date.now() + 90 * 60 * 1000);

    const expiring = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, threshold)
      )
    );

    const xChannelsNeedingRefresh = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, xThreshold)
      )
    );

    const allExpiring = [...expiring];
    for (const xCh of xChannelsNeedingRefresh) {
      if (X_PLATFORMS.has(xCh.platform) && !allExpiring.find(e => e.id === xCh.id)) {
        allExpiring.push(xCh);
      }
    }

    for (const ch of allExpiring) {
      if (!ch.refreshToken || !ch.platform) continue;
      const pd = (ch.platformData || {}) as any;

      // Only stop retrying after hitting the permanent failure threshold
      if (pd._connectionStatus === "expired" && (pd._permanentFailures || 0) >= PERMANENT_FAILURE_THRESHOLD) continue;

      const result = await refreshToken(ch.platform as Platform, ch.refreshToken);

      if (result.success && result.accessToken) {
        await db.update(channels).set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || ch.refreshToken,
          tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
          platformData: {
            ...(pd),
            _connectionStatus: "active",
            _lastRefresh: new Date().toISOString(),
            _permanentFailures: 0,
          },
        }).where(eq(channels.id, ch.id));
        refreshed++;
      } else {
        const isExpiredPermanently = result.error?.includes("Token expired") || result.error?.includes("re-authorize");
        if (isExpiredPermanently) {
          const failures = (pd._permanentFailures || 0) + 1;
          if (failures >= PERMANENT_FAILURE_THRESHOLD) {
            await markChannelExpired(ch.id, pd);
            console.error(`[TokenRefresh] ${ch.platform} channel ${ch.channelName} confirmed expired after ${failures} attempts — user must re-authorize`);
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
            console.warn(`[TokenRefresh] ${ch.platform} channel ${ch.channelName} failed (attempt ${failures}/${PERMANENT_FAILURE_THRESHOLD}) — will retry`);
          }
        } else {
          console.warn(`[TokenRefresh] Failed to refresh ${ch.platform} channel ${ch.channelName}: ${result.error}`);
        }
        failed++;
      }
    }
  } catch (e) {
    console.error("[TokenRefresh] Error checking expiring tokens:", e);
  }

  return { refreshed, failed };
}

// Daily keepalive: refresh ALL active tokens once per day regardless of expiry.
// This prevents refresh tokens from ever going stale due to inactivity (Google revokes
// refresh tokens that haven't been used in 6 months — daily exercise prevents this entirely).
export async function keepAliveAllTokens(): Promise<{ kept: number; failed: number }> {
  let kept = 0;
  let failed = 0;

  console.log("[TokenKeepalive] Starting daily keepalive for all active channels...");

  try {
    const activeChannels = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.accessToken),
      )
    );

    for (const ch of activeChannels) {
      if (!ch.refreshToken || !ch.platform) continue;
      const pd = (ch.platformData || {}) as any;

      // If previously confirmed expired — retry once every 4 hours.
      // The refresh token may still be valid even if the access token was marked expired.
      // Only give up permanently after PERMANENT_FAILURE_THRESHOLD consecutive failures.
      if (pd._connectionStatus === "expired") {
        const failures = (pd._permanentFailures || 0) as number;
        if (failures >= PERMANENT_FAILURE_THRESHOLD) continue; // genuinely dead, skip
        const lastAttempt = pd._lastKeepaliveAttempt ? new Date(pd._lastKeepaliveAttempt).getTime() : 0;
        if (Date.now() - lastAttempt < 4 * 60 * 60 * 1000) continue; // too soon, try again later
        // Fall through to attempt refresh
        console.log(`[TokenKeepalive] Retrying expired channel ${ch.platform} (attempt ${failures + 1}/${PERMANENT_FAILURE_THRESHOLD})`);
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
          await db.update(channels).set({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken || ch.refreshToken,
            tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
            platformData: {
              ...pd,
              _connectionStatus: "active",
              _lastRefresh: new Date().toISOString(),
              _permanentFailures: 0,
              _keepaliveAt: new Date().toISOString(),
            },
          }).where(eq(channels.id, ch.id));
          kept++;
        } else {
          const isPermanent = result.error?.includes("Token expired") || result.error?.includes("re-authorize");
          if (isPermanent) {
            const failures = (pd._permanentFailures || 0) + 1;
            if (failures >= PERMANENT_FAILURE_THRESHOLD) {
              await markChannelExpired(ch.id, pd);
              console.error(`[TokenKeepalive] ${ch.platform} ${ch.channelName} confirmed dead — user must re-authorize`);
            } else {
              await db.update(channels).set({
                platformData: { ...pd, _connectionStatus: "degraded", _permanentFailures: failures, _lastFailureAt: new Date().toISOString() },
              }).where(eq(channels.id, ch.id));
            }
          }
          failed++;
        }
      } catch (e) {
        console.warn(`[TokenKeepalive] Error refreshing ${ch.platform} channel ${ch.id}:`, e);
        failed++;
      }

      // Small stagger to avoid hammering OAuth endpoints
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    console.error("[TokenKeepalive] Error during keepalive:", e);
  }

  console.log(`[TokenKeepalive] Done — ${kept} kept alive, ${failed} failed`);
  return { kept, failed };
}
