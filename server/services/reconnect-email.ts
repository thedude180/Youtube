import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("reconnect-email");

const recentAlerts = new Map<string, number>();

import { registerCleanup } from "./cleanup-coordinator";
registerCleanup("reconnectAlerts", () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of recentAlerts) {
    if (ts < cutoff) recentAlerts.delete(key);
  }
}, 60 * 60 * 1000);

export async function sendReconnectEmail(userId: string, platform: string): Promise<void> {
  const alertKey = `${userId}:${platform}`;
  const lastAlert = recentAlerts.get(alertKey);
  if (lastAlert && Date.now() - lastAlert < 24 * 60 * 60 * 1000) {
    logger.info("Skipping duplicate reconnect email (sent within 24h)", { userId, platform });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.email) {
      logger.warn("No email found for user, sending in-app reconnect notification", { userId, platform });
      try {
        const { notifications } = await import("@shared/schema");
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        await db.insert(notifications).values({
          userId,
          type: "system",
          title: `${platformName} Disconnected`,
          message: `Your ${platformName} connection has expired. Tap to reconnect in one step — automation will resume immediately.`,
          severity: "warning",
          actionUrl: `/settings?reconnect=${platform}`,
        });
        const { sendSSEEvent } = await import("../routes/events");
        sendSSEEvent(userId, "notification", { type: "new" });
      } catch {}
      return;
    }

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const { getAppUrl } = await import("../lib/app-url");
    const appDomain = getAppUrl();
    const settingsUrl = `${appDomain}/settings?tab=channels`;
    const subject = `Action Required: ${platformName} Disconnected from CreatorOS`;
    const body = `Hi ${user.firstName || "there"},

Your ${platformName} connection in CreatorOS has expired or been revoked. This means automated content posting, live detection, and other ${platformName} features are paused.

Reconnect now — go to your Settings page and click Reconnect next to ${platformName}:
${settingsUrl}

Once reconnected, all automation will resume immediately — no content will be lost.

— CreatorOS Automation`;

    try {
      const { sendGmail } = await import("./gmail-client");
      await sendGmail(user.email, subject, body);
      recentAlerts.set(alertKey, Date.now());
      logger.info("Reconnect email sent", { userId, platform, email: user.email });
    } catch (emailErr) {
      logger.error("Failed to send reconnect email via Gmail", { userId, platform, error: String(emailErr) });
    }
  } catch (err) {
    logger.error("Reconnect email service error", { userId, platform, error: String(err) });
  }
}
