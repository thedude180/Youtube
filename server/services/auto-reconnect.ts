import { storage } from "../storage";
import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { sendGmail } from "./gmail-client";

const reconnectAttempts: Map<string, { lastSent: Date; count: number }> = new Map();
const RECONNECT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function sendReconnectEmail(userId: string, platform: string): Promise<boolean> {
  const key = `${userId}:${platform}`;
  const existing = reconnectAttempts.get(key);
  if (existing && Date.now() - existing.lastSent.getTime() < RECONNECT_COOLDOWN_MS) {
    console.log(`[AutoReconnect] Skipping email for ${platform} — already sent within 24h`);
    return false;
  }

  try {
    const user = await storage.getUser(userId);
    if (!user?.email) {
      console.log(`[AutoReconnect] No email for user ${userId}`);
      return false;
    }

    const reconnectUrl = `/settings?reconnect=${platform}`;
    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">CreatorOS — Auto-Reconnect Required</h2>
        </div>
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Your <strong>${platformName}</strong> connection has expired and could not be automatically refreshed.
          </p>
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Your autopilot is still running for all other platforms. To restore full automation for ${platformName}, 
            just click the button below to re-authorize — it takes about 10 seconds.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${reconnectUrl}" style="background: #6366f1; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
              Reconnect ${platformName}
            </a>
          </div>
          <p style="margin: 0; font-size: 12px; color: #888;">
            This is a one-time re-authorization. Once reconnected, CreatorOS will handle all future token refreshes automatically.
          </p>
        </div>
      </div>
    `;

    const sent = await sendGmail(
      user.email,
      `[CreatorOS] Reconnect your ${platformName} — 10 second fix`,
      html,
    );

    if (sent) {
      reconnectAttempts.set(key, { lastSent: new Date(), count: (existing?.count || 0) + 1 });
      console.log(`[AutoReconnect] Sent reconnect email to ${user.email} for ${platform}`);
    }

    return sent;
  } catch (err) {
    console.error(`[AutoReconnect] Failed to send email for ${platform}:`, err);
    return false;
  }
}

export async function proactiveTokenHealthCheck(): Promise<{ checked: number; refreshed: number; emailsSent: number }> {
  let checked = 0;
  let refreshed = 0;
  let emailsSent = 0;

  try {
    const expiringThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const expiringChannels = await db.select().from(channels)
      .where(and(
        isNotNull(channels.refreshToken),
        isNotNull(channels.tokenExpiresAt),
        lt(channels.tokenExpiresAt, expiringThreshold),
      )).limit(100);

    checked = expiringChannels.length;

    if (expiringChannels.length > 0) {
      const { refreshExpiringTokens } = await import("../token-refresh");
      const result = await refreshExpiringTokens();
      refreshed = result.refreshed;

      if (result.failed > 0) {
        const stillExpiring = await db.select().from(channels)
          .where(and(
            isNotNull(channels.tokenExpiresAt),
            lt(channels.tokenExpiresAt, expiringThreshold),
          )).limit(50);

        const userPlatforms = new Map<string, string[]>();
        for (const ch of stillExpiring) {
          if (!ch.userId) continue;
          const platforms = userPlatforms.get(ch.userId) || [];
          platforms.push(ch.platform);
          userPlatforms.set(ch.userId, platforms);
        }

        for (const [userId, platforms] of userPlatforms) {
          for (const platform of platforms) {
            const sent = await sendReconnectEmail(userId, platform);
            if (sent) emailsSent++;
          }
        }
      }
    }
  } catch (err) {
    console.error("[AutoReconnect] Proactive health check error:", err);
  }

  if (checked > 0) {
    console.log(`[AutoReconnect] Health check: ${checked} checked, ${refreshed} refreshed, ${emailsSent} emails sent`);
  }

  return { checked, refreshed, emailsSent };
}
