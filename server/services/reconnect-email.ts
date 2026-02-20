import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("reconnect-email");

const recentAlerts = new Map<string, number>();

setInterval(() => {
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
      logger.warn("No email found for user, cannot send reconnect alert", { userId });
      return;
    }

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const subject = `Action Required: ${platformName} Disconnected from CreatorOS`;
    const body = `Hi ${user.firstName || "there"},

Your ${platformName} connection in CreatorOS has expired or been revoked. This means automated content posting, live detection, and other ${platformName} features are paused.

To restore full automation:
1. Log in to CreatorOS
2. Go to Settings > Channels
3. Click "Reconnect" next to ${platformName}
4. Authorize CreatorOS to manage your ${platformName} account

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
