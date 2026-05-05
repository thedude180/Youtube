import { eq } from "drizzle-orm";
import { db } from "../../core/db.js";
import { notifications } from "../../../shared/schema/index.js";
import { notifRepo } from "./repository.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("notifications");

export class NotificationsService {
  /**
   * Send a notification.
   * Deduplication: if dedupeKey is provided and an identical key was sent
   * within the last ttlHours hours, the notification is silently dropped.
   */
  async send(
    userId: string,
    type: string,
    title: string,
    body: string,
    channel: "email" | "sms" | "push" | "in_app" = "in_app",
    dedupeKey?: string,
    ttlHours = 4,
  ): Promise<void> {
    if (dedupeKey) {
      const isDupe = await notifRepo.checkDedupe(userId, dedupeKey);
      if (isDupe) {
        log.info("Notification deduplicated", { userId, dedupeKey });
        return;
      }
    }

    const notif = await notifRepo.create({ userId, type, title, body, channel, status: "pending" });

    if (channel === "in_app") {
      // Mark as sent in-place (no second insert)
      await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, notif.id));
      sseEmit(userId, "notification:new", { id: notif.id, type, title, body });
    } else if (channel === "email") {
      await this.sendEmail(userId, title, body);
      await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, notif.id));
    } else {
      // sms / push — mark as sent, no additional transport in this version
      await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, notif.id));
    }

    if (dedupeKey) {
      await notifRepo.recordSend(userId, dedupeKey, ttlHours);
    }
  }

  private async sendEmail(_userId: string, subject: string, body: string): Promise<void> {
    // Wire SMTP via nodemailer:
    //   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM env vars
    // For now: log so the app doesn't crash; email simply won't be delivered
    log.warn("Email transport not configured — set SMTP_* env vars", { subject, bodyLength: body.length });
  }
}

export const notifService = new NotificationsService();
