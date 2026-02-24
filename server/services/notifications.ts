import { db } from "../db";
import { users, ADMIN_EMAIL, SUPPORT_EMAIL } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { sendGmail } from "./gmail-client";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category?: string;
}

function buildEmailHtml(title: string, message: string, severity: NotificationSeverity): string {
  const color = severity === "critical" ? "#dc2626" : severity === "warning" ? "#f59e0b" : "#6366f1";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: ${color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${title}</h2>
      </div>
      <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; line-height: 1.6;">${message}</p>
        <p style="margin: 0; font-size: 12px; color: #888;">This is an automated alert from CreatorOS. Your system is running on autopilot — we only contact you when something needs attention.</p>
        <p style="margin: 8px 0 0; font-size: 12px; color: #666;">Contact us: <a href="mailto:${SUPPORT_EMAIL}" style="color: #6366f1;">${SUPPORT_EMAIL}</a></p>
      </div>
    </div>
  `;
}

async function sendEmailNotification(email: string, title: string, message: string, severity: NotificationSeverity): Promise<boolean> {
  const subject = `[CreatorOS ${severity === "critical" ? "URGENT" : "Alert"}] ${title}`;
  const html = buildEmailHtml(title, message, severity);
  return sendGmail(email, subject, html);
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
    console.error(`[Notifications] SMS failed (${response.status})`);
    return false;
  } catch (err) {
    console.error("[Notifications] SMS error:", err);
    return false;
  }
}

const recentNotifications = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

import { registerCleanup } from "./cleanup-coordinator";
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
      console.warn(`[Notifications] User not found: ${payload.userId}`);
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

    if ((user as any).notifyEmail !== false && (user as any).email) {
      try {
        const sent = await sendEmailNotification((user as any).email, payload.title, payload.message, payload.severity);
        result.email = sent;
      } catch (emailErr) {
        console.error(`[Notifications] Email send failed for ${payload.userId}:`, emailErr);
      }
    }
  } catch (err) {
    console.error("[Notifications] Notify error:", err);
  }

  return result;
}

export async function notifyAdmin(title: string, message: string, severity: NotificationSeverity): Promise<boolean> {
  try {
    const subject = `[CreatorOS ${severity === "critical" ? "URGENT" : "Alert"}] ${title}`;
    const html = buildEmailHtml(title, message, severity);
    return sendGmail(ADMIN_EMAIL, subject, html);
  } catch (err) {
    console.error("[Notifications] Admin notify error:", err);
    return false;
  }
}
