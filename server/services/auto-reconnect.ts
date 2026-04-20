import { storage } from "../storage";
import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and, lt, isNotNull, isNull } from "drizzle-orm";
import { sendGmail } from "./gmail-client";
import { OAUTH_CONFIGS } from "../oauth-config";

import { createLogger } from "../lib/logger";

const logger = createLogger("auto-reconnect");
const REQUIRED_CONSECUTIVE_FAILURES = 2;
const EMAIL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days between emails per user

async function getLastEmailSent(userId: string): Promise<number | null> {
  const userChannels = await db.select({ platformData: channels.platformData }).from(channels)
    .where(eq(channels.userId, userId)).limit(1);
  return (userChannels[0]?.platformData as any)?._reconnectEmailSentAt ?? null;
}

async function markEmailSent(userId: string): Promise<void> {
  const userChannels = await db.select({ id: channels.id, platformData: channels.platformData }).from(channels)
    .where(eq(channels.userId, userId)).limit(1);
  if (userChannels.length > 0) {
    const data = { ...(userChannels[0].platformData || {}), _reconnectEmailSentAt: Date.now() };
    await db.update(channels).set({ platformData: data }).where(eq(channels.id, userChannels[0].id));
  }
}

async function getFailureCount(channelId: number): Promise<number> {
  const [ch] = await db.select({ platformData: channels.platformData }).from(channels).where(eq(channels.id, channelId)).limit(1);
  return (ch?.platformData as any)?._reconnectFailures ?? 0;
}

async function setFailureCount(channelId: number, count: number): Promise<void> {
  const [ch] = await db.select({ platformData: channels.platformData }).from(channels).where(eq(channels.id, channelId)).limit(1);
  const data = { ...(ch?.platformData || {}), _reconnectFailures: count };
  await db.update(channels).set({ platformData: data }).where(eq(channels.id, channelId));
}

async function clearFailureCount(channelId: number): Promise<void> {
  const [ch] = await db.select({ platformData: channels.platformData }).from(channels).where(eq(channels.id, channelId)).limit(1);
  if (ch?.platformData) {
    const data = { ...ch.platformData };
    delete (data as any)._reconnectFailures;
    await db.update(channels).set({ platformData: data }).where(eq(channels.id, channelId));
  }
}

async function verifyConnectionAlive(platform: string, accessToken: string): Promise<boolean> {
  try {
    const config = OAUTH_CONFIGS[platform as keyof typeof OAUTH_CONFIGS];
    if (!config) {
      return true;
    }

    let testUrl: string | null = null;
    const headers: Record<string, string> = {};

    switch (platform) {
      case "youtube":
        testUrl = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "twitch":
        testUrl = "https://api.twitch.tv/helix/users";
        headers["Authorization"] = `Bearer ${accessToken}`;
        headers["Client-Id"] = process.env.TWITCH_DEV_CLIENT_ID || process.env.TWITCH_CLIENT_ID || "";
        break;
      case "kick":
        testUrl = "https://kick.com/api/v1/user";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "tiktok":
        testUrl = "https://open.tiktokapis.com/v2/user/info/?fields=open_id";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      case "discord":
        testUrl = "https://discord.com/api/v10/users/@me";
        headers["Authorization"] = `Bearer ${accessToken}`;
        break;
      default:
        return true;
    }

    if (!testUrl) return true;

    const res = await fetch(testUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok || res.status === 429) return true;
    return false;
  } catch {
    return false;
  }
}

async function sendConsolidatedReconnectEmail(userId: string, platforms: string[]): Promise<boolean> {
  const lastSentTs = await getLastEmailSent(userId);
  if (lastSentTs && Date.now() - lastSentTs < EMAIL_COOLDOWN_MS) {
    return false;
  }

  try {
    const user = await storage.getUser(userId);
    if (!user?.email) {
      return false;
    }

    const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
    const domain = process.env.REPLIT_DEPLOYMENT
      ? replitDomain
        ? "https://" + replitDomain
        : (() => { logger.warn("[AutoReconnect] REPLIT_DOMAINS not set in deployment — email link will be empty"); return ""; })()
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "";

    const platformNames = platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1));
    const platformList = platformNames.length === 1
      ? platformNames[0]
      : platformNames.slice(0, -1).join(", ") + " and " + platformNames[platformNames.length - 1];

    const reconnectLinks = platforms.map(p => {
      const name = p.charAt(0).toUpperCase() + p.slice(1);
      return `<a href="${domain}/settings?reconnect=${p}" style="background: #6366f1; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; margin: 4px;">${name}</a>`;
    }).join(" ");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">CreatorOS — Platform Reconnection Needed</h2>
        </div>
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Your ${platformList} connection${platforms.length > 1 ? "s have" : " has"} been disconnected and we were unable to automatically restore ${platforms.length > 1 ? "them" : "it"} after multiple attempts.
          </p>
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Everything else is running normally. To restore full automation, click below to reconnect:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            ${reconnectLinks}
          </div>
          <p style="margin: 0; font-size: 12px; color: #888;">
            Each reconnection takes about 10 seconds. Once done, CreatorOS handles everything automatically.
          </p>
        </div>
      </div>
    `;

    const sent = await sendGmail(
      user.email,
      `[CreatorOS] ${platformList} disconnected — quick reconnect needed`,
      html,
    );

    if (sent) {
      await markEmailSent(userId);
    }

    return sent;
  } catch (err) {
    logger.error(`[AutoReconnect] Failed to send email:`, err);
    return false;
  }
}

export async function sendReconnectEmail(_userId: string, _platform: string): Promise<boolean> {
  return false;
}

export async function proactiveTokenHealthCheck(): Promise<{ checked: number; refreshed: number; emailsSent: number }> {
  let checked = 0;
  let refreshed = 0;
  let emailsSent = 0;

  try {
    // Heal channels that have a refresh token but lost their access token
    // (e.g. a previous failed refresh cleared the access token row).
    const missingAccessTokenChannels = await db.select().from(channels)
      .where(and(
        isNotNull(channels.refreshToken),
        isNull(channels.accessToken),
      )).limit(20);

    if (missingAccessTokenChannels.length > 0) {
      const { refreshSingleChannel } = await import("../token-refresh");
      for (const ch of missingAccessTokenChannels) {
        if (!ch.refreshToken) continue;
        try {
          const result = await refreshSingleChannel({ platform: ch.platform, refreshToken: ch.refreshToken });
          if (result.success && result.accessToken) {
            const upd: any = { accessToken: result.accessToken };
            if (result.refreshToken) upd.refreshToken = result.refreshToken;
            if (result.expiresAt) upd.tokenExpiresAt = result.expiresAt;
            await db.update(channels).set(upd).where(eq(channels.id, ch.id));
            refreshed++;
            logger.info(`[AutoReconnect] Healed null-access-token for channel ${ch.id} (${ch.platform})`);
          }
        } catch (healErr) {
          logger.warn(`[AutoReconnect] Heal attempt failed for channel ${ch.id}:`, healErr);
        }
      }
    }

    const expiringThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const expiringChannels = await db.select().from(channels)
      .where(and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, expiringThreshold),
      )).limit(100);

    checked = expiringChannels.length + missingAccessTokenChannels.length;

    if (expiringChannels.length > 0) {
      const { refreshExpiringTokens } = await import("../token-refresh");
      const result = await refreshExpiringTokens();
      refreshed = result.refreshed;

      if (result.failed > 0) {
        const stillExpiring = await db.select().from(channels)
          .where(and(
            isNotNull(channels.accessToken),
            isNotNull(channels.tokenExpiresAt),
            lt(channels.tokenExpiresAt, new Date()),
          )).limit(50);

        const trulyBroken: Map<string, string[]> = new Map();

        for (const ch of stillExpiring) {
          if (!ch.userId || !ch.accessToken) continue;

          const alive = await verifyConnectionAlive(ch.platform, ch.accessToken as string);
          if (alive) {
            await clearFailureCount(ch.id);
            continue;
          }

          const failures = (await getFailureCount(ch.id)) + 1;
          await setFailureCount(ch.id, failures);

          if (failures >= REQUIRED_CONSECUTIVE_FAILURES) {
            const platforms = trulyBroken.get(ch.userId) || [];
            if (!platforms.includes(ch.platform)) platforms.push(ch.platform);
            trulyBroken.set(ch.userId, platforms);
          }
        }

        for (const [userId, platforms] of Array.from(trulyBroken.entries())) {
          const sent = await sendConsolidatedReconnectEmail(userId, platforms);
          if (sent) emailsSent++;
        }
      }
    }
  } catch (err) {
    logger.error("[AutoReconnect] Proactive health check error:", err);
  }

  return { checked, refreshed, emailsSent };
}
