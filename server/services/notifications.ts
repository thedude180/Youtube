import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category?: string;
}

async function sendEmailNotification(email: string, title: string, message: string, severity: NotificationSeverity): Promise<boolean> {
  try {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (!SENDGRID_API_KEY) {
      console.log(`[Notifications] Email skipped (no SendGrid key): ${title} -> ${email}`);
      return false;
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || "alerts@creatoros.app", name: "CreatorOS" },
        subject: `[CreatorOS ${severity === "critical" ? "URGENT" : "Alert"}] ${title}`,
        content: [
          {
            type: "text/html",
            value: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <div style="background: ${severity === "critical" ? "#dc2626" : severity === "warning" ? "#f59e0b" : "#6366f1"}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0; font-size: 18px;">${title}</h2>
                </div>
                <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0 0 16px; line-height: 1.6;">${message}</p>
                  <p style="margin: 0; font-size: 12px; color: #888;">This is an automated alert from CreatorOS. Your system is running on autopilot — we only contact you when something needs attention.</p>
                </div>
              </div>
            `,
          },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      console.log(`[Notifications] Email sent: ${title} -> ${email}`);
      return true;
    }
    const errorText = await response.text().catch(() => "unknown");
    console.error(`[Notifications] Email failed (${response.status}): ${errorText}`);
    return false;
  } catch (err) {
    console.error("[Notifications] Email error:", err);
    return false;
  }
}

async function sendSmsNotification(phone: string, title: string, message: string): Promise<boolean> {
  try {
    const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      console.log(`[Notifications] SMS skipped (no Twilio config): ${title} -> ${phone}`);
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
      console.log(`[Notifications] SMS sent: ${title} -> ${phone}`);
      return true;
    }
    console.error(`[Notifications] SMS failed (${response.status})`);
    return false;
  } catch (err) {
    console.error("[Notifications] SMS error:", err);
    return false;
  }
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

    if (user.notifyEmail && user.email) {
      result.email = await sendEmailNotification(user.email, payload.title, payload.message, payload.severity);
    }

    if (user.notifyPhone && user.phone && payload.severity === "critical") {
      result.sms = await sendSmsNotification(user.phone, payload.title, payload.message);
    }
  } catch (err) {
    console.error("[Notifications] Notify error:", err);
  }

  return result;
}

export async function notifyAllAdmins(title: string, message: string, severity: NotificationSeverity): Promise<void> {
  try {
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    for (const admin of admins) {
      await notifyUser({ userId: admin.id, title, message, severity });
    }
  } catch (err) {
    console.error("[Notifications] Admin notify error:", err);
  }
}
