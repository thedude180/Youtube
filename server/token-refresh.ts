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
  } catch (e) {
    console.error("[TokenRefresh:google] Error:", e);
    return { success: false, error: String(e) };
  }
}

async function refreshToken(platform: Platform, currentRefreshToken: string): Promise<RefreshResult> {
  if (GOOGLE_PLATFORMS.has(platform)) {
    return refreshGoogleToken(currentRefreshToken);
  }

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

    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TokenRefresh:${platform}] Failed:`, errText);

      if (errText.includes("invalid_grant") || errText.includes("invalid_request") || errText.includes("expired") || errText.includes("was invalid") || res.status === 401) {
        return { success: false, error: `Token expired - user needs to re-authorize ${platform}` };
      }
      return { success: false, error: `Token refresh failed: ${res.status}` };
    }

    const data = await res.json() as any;
    const expiresIn = data.expires_in;

    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || currentRefreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  } catch (e) {
    console.error(`[TokenRefresh:${platform}] Error:`, e);
    return { success: false, error: String(e) };
  }
}

export async function refreshSingleChannel(ch: { platform: string; refreshToken: string | null }): Promise<RefreshResult> {
  if (!ch.refreshToken) return { success: false, error: "No refresh token" };
  return refreshToken(ch.platform as Platform, ch.refreshToken);
}

export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const bufferMs = 2 * 60 * 60 * 1000;
  const threshold = new Date(Date.now() + bufferMs);

  let refreshed = 0;
  let failed = 0;

  try {
    const expiring = await db.select().from(channels).where(
      and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, threshold)
      )
    );

    for (const ch of expiring) {
      if (!ch.refreshToken || !ch.platform) continue;

      const result = await refreshToken(ch.platform as Platform, ch.refreshToken);

      if (result.success && result.accessToken) {
        await db.update(channels).set({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || ch.refreshToken,
          tokenExpiresAt: result.expiresAt || ch.tokenExpiresAt,
          platformData: { ...(ch.platformData as any || {}), _connectionStatus: "active", _lastRefresh: new Date().toISOString() },
        }).where(eq(channels.id, ch.id));

        console.log(`[TokenRefresh] Refreshed token for ${ch.platform} channel ${ch.channelName}`);
        refreshed++;
      } else {
        const isExpiredPermanently = result.error?.includes("Token expired") || result.error?.includes("re-authorize");
        if (isExpiredPermanently) {
          await db.update(channels).set({
            platformData: { ...(ch.platformData as any || {}), _connectionStatus: "expired", _expiredAt: new Date().toISOString() },
          }).where(eq(channels.id, ch.id));
          console.error(`[TokenRefresh] ${ch.platform} channel ${ch.channelName} permanently expired — user must re-authorize`);
        } else {
          console.warn(`[TokenRefresh] Failed to refresh ${ch.platform} channel ${ch.channelName}: ${result.error}`);
        }
        failed++;
      }
    }
  } catch (e) {
    console.error("[TokenRefresh] Error checking expiring tokens:", e);
  }

  if (refreshed > 0 || failed > 0) {
    console.log(`[TokenRefresh] Complete: ${refreshed} refreshed, ${failed} failed`);
  }

  return { refreshed, failed };
}
