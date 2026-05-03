import { notifRepo } from "./repository.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("notifications");

export class NotificationsService {
  /**
   * Send a notification to a user.
   * @param dedupeKey  If set, the notification is silently dropped if an identical key
   *                   was sent within the last `ttlHours` hours (default 4h).
   */
  async send(
    userId: string,
    type: string,
    title: string,
    body: string,
    channel: "email" | "sms" | "push" | "in_app" = "in_app",
    dedupeKey?: string,
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
      await notifRepo.create({ ...notif, status: "sent" } as any);
      sseEmit(userId, "notification:new", { id: notif.id, type, title, body });
    } else if (channel === "email") {
      await this.sendEmail(userId, title, body);
    }

    if (dedupeKey) {
      await notifRepo.recordSend(userId, dedupeKey);
    }
  }

  private async sendEmail(_userId: string, subject: string, body: string): Promise<void> {
    // Email stub — wire SMTP in production
    // Use nodemailer with SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS env vars
    log.info("Email send stub", { subject, bodyLength: body.length });
  }
}

export const notifService = new NotificationsService();
