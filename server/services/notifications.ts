import { db } from "../db";
import { users, SUPPORT_EMAIL, type User } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${SUPPORT_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category?: string;
}


async function sendSmsNotification(phone: string, title: string, message: string): Promise<boolean> {
  try {
    const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return false;
    }

    const body = `CreatorOS Alert: ${title}\n${message.substring(0, 140)}`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: body }).toString(),
    });

    if (response.ok) {
      return true;
    }
    logger.error(`[Notifications] SMS failed (${response.status})`);
    return false;
  } catch (err) {
    logger.error("[Notifications] SMS error:", err);
    return false;
  }
}

const recentNotifications = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

import { registerCleanup } from "./cleanup-coordinator";
import { createLogger } from "../lib/logger";

const logger = createLogger("notifications");
registerCleanup("recentNotifications", () => {
  const now = Date.now();
  for (const [key, ts] of recentNotifications) {
    if (now - ts > NOTIFICATION_COOLDOWN_MS) recentNotifications.delete(key);
  }
}, 60 * 60 * 1000);

function isRateLimited(userId: string, category: string, cooldownMs: number = NOTIFICATION_COOLDOWN_MS): boolean {
  const key = `${userId}:${category}`;
  const lastSent = recentNotifications.get(key);
  if (lastSent && Date.now() - lastSent < cooldownMs) {
    return true;
  }
  recentNotifications.set(key, Date.now());
  return false;
}

export async function notifyUser(payload: NotificationPayload): Promise<{ email: boolean; sms: boolean }> {
  const result = { email: false, sms: false };

  try {
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) {
      logger.warn(`[Notifications] User not found: ${payload.userId}`);
      return result;
    }

    if (payload.severity === "info") {
      return result;
    }

    const isConnectionLoss = payload.category === "connection_severed" || payload.category === "platform_disconnected" || payload.category === "platform_connections";
    if (isConnectionLoss) {
      return result;
    }

    if (payload.category && isRateLimited(payload.userId, payload.category)) {
      return result;
    }

    // Email for in-app alerts is disabled — only critical-alert.ts and daily-upload-digest.ts send email.

    if (payload.severity === "critical" || payload.severity === "warning") {
      type UserPrefs = NonNullable<User['userPreferences']>;
      const prefs = ((user as any).userPreferences || {}) as UserPrefs;
      const subs: any[] = prefs.pushSubscriptions || [];
      if (subs.length > 0) {
        const pushPayload = JSON.stringify({
          title: payload.title,
          body: payload.message,
          severity: payload.severity,
          icon: "/icon-192.png"
        });

        const expiredEndpoints: string[] = [];
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub, pushPayload);
          } catch (err: any) {
            logger.error(`[Notifications] Web Push failed for user ${payload.userId}:`, err.message);
            if (err.statusCode === 410 || err.statusCode === 404) {
              expiredEndpoints.push(sub.endpoint);
            }
          }
        }
        if (expiredEndpoints.length > 0) {
          try {
            const liveSubs = subs.filter((s: any) => !expiredEndpoints.includes(s.endpoint));
            const updatedPrefs: UserPrefs = { ...prefs, pushSubscriptions: liveSubs };
            await db.update(users).set({ userPreferences: updatedPrefs }).where(eq(users.id, payload.userId));
            logger.info(`Cleaned up ${expiredEndpoints.length} expired push subscription(s) for user ${payload.userId}`);
          } catch (cleanupErr) {
            logger.error("[Notifications] Failed to clean up expired subscriptions:", cleanupErr);
          }
        }
      }
    }
  } catch (err) {
    logger.error("[Notifications] Notify error:", err);
  }

  return result;
}

export async function notifyAdmin(title: string, message: string, _severity: NotificationSeverity): Promise<boolean> {
  // Admin email alerts are disabled — use critical-alert.ts for unrecoverable system errors.
  logger.info(`[Notifications] Admin alert suppressed (email off): ${title}`);
  return false;
}
