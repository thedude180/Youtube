import { db } from "../db";
import { autopilotQueue, channels, videos } from "@shared/schema";
import { users } from "@shared/models/auth";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import cron from "node-cron";
import { sendGmail } from "./gmail-client";
import { createLogger } from "../lib/logger";
import { withCronLock, registerCronHeartbeat } from "../lib/cron-lock";

const logger = createLogger("daily-upload-digest");

type DigestRow = {
  id: number;
  platform: string;
  title: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  status: string;
  verificationStatus: string;
  platformConfirmed: boolean;
  platformStatus: string | null;
  platformUrl: string | null;
  postId: string | null;
  error: string | null;
  sourceVideoTitle: string | null;
};

function platformLabel(p: string): string {
  const map: Record<string, string> = {
    youtube: "YouTube",
    youtubeshorts: "YouTube Shorts",
    tiktok: "TikTok",
    x: "X",
    discord: "Discord",
    instagram: "Instagram",
    kick: "Kick",
    rumble: "Rumble",
    twitch: "Twitch",
  };
  return map[p] || p;
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escape(s: string): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function collectRowsForUser(userId: string, since: Date): Promise<DigestRow[]> {
  const items = await db
    .select()
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["published", "publishing", "failed"]),
      gte(autopilotQueue.publishedAt, since),
    ))
    .orderBy(desc(autopilotQueue.publishedAt))
    .limit(500);

  const videoIds = Array.from(new Set(items.map(i => i.sourceVideoId).filter((v): v is number => typeof v === "number")));
  const videoTitles = new Map<number, string>();
  if (videoIds.length > 0) {
    const vids = await db.select({ id: videos.id, title: videos.title }).from(videos).where(inArray(videos.id, videoIds));
    for (const v of vids) videoTitles.set(v.id, v.title || "");
  }

  return items.map((i) => {
    const meta = (i.metadata as any) || {};
    const publishResult = meta.publishResult || {};
    const verification = meta.verification || {};
    return {
      id: i.id,
      platform: i.targetPlatform,
      title: i.sourceVideoId ? (videoTitles.get(i.sourceVideoId) || truncate(i.content || "", 70)) : truncate(i.content || "", 70),
      scheduledAt: i.scheduledAt,
      publishedAt: i.publishedAt,
      status: i.status,
      verificationStatus: i.verificationStatus || "unverified",
      platformConfirmed: !!verification.platformConfirmed,
      platformStatus: verification.platformStatus || null,
      platformUrl: verification.platformUrl || publishResult.postUrl || null,
      postId: publishResult.postId || null,
      error: verification.error || i.errorMessage || null,
      sourceVideoTitle: i.sourceVideoId ? (videoTitles.get(i.sourceVideoId) || null) : null,
    };
  });
}

function statusBadge(row: DigestRow): { label: string; color: string; bg: string } {
  if (row.status === "failed") return { label: "FAILED", color: "#991b1b", bg: "#fee2e2" };
  if (row.platformConfirmed && row.verificationStatus === "verified") return { label: "VERIFIED LIVE", color: "#065f46", bg: "#d1fae5" };
  if (row.verificationStatus === "failed") return { label: "UNVERIFIED", color: "#991b1b", bg: "#fee2e2" };
  if (row.verificationStatus === "pending") return { label: "PENDING CHECK", color: "#92400e", bg: "#fef3c7" };
  if (row.status === "published") return { label: "PUBLISHED", color: "#1e40af", bg: "#dbeafe" };
  return { label: row.status.toUpperCase(), color: "#374151", bg: "#e5e7eb" };
}

function buildHtml(email: string, since: Date, until: Date, rows: DigestRow[]): string {
  const byPlatform = new Map<string, DigestRow[]>();
  for (const r of rows) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
    byPlatform.get(r.platform)!.push(r);
  }

  const totalCount = rows.length;
  const verifiedCount = rows.filter(r => r.platformConfirmed && r.verificationStatus === "verified").length;
  const failedCount = rows.filter(r => r.status === "failed" || r.verificationStatus === "failed").length;
  const pendingCount = rows.filter(r => r.verificationStatus === "pending" || r.verificationStatus === "unverified").length;

  const platformSections = Array.from(byPlatform.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([platform, items]) => {
      const tableRows = items.map((r) => {
        const badge = statusBadge(r);
        const urlCell = r.platformUrl
          ? `<a href="${escape(r.platformUrl)}" style="color:#2563eb;text-decoration:none;word-break:break-all;">${escape(truncate(r.platformUrl, 60))}</a>`
          : `<span style="color:#9ca3af;">—</span>`;
        const idCell = r.postId ? `<code style="font-size:11px;color:#6b7280;">${escape(truncate(r.postId, 30))}</code>` : `<span style="color:#9ca3af;">—</span>`;
        const errorCell = r.error
          ? `<div style="font-size:11px;color:#991b1b;margin-top:4px;">${escape(truncate(r.error, 140))}</div>`
          : "";
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <div style="font-size:13px;color:#111827;font-weight:500;">${escape(truncate(r.title || "Untitled", 80))}</div>
              ${errorCell}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:12px;color:#4b5563;white-space:nowrap;">${fmtTime(r.publishedAt)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${badge.color};background:${badge.bg};white-space:nowrap;">${badge.label}</span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:12px;">${idCell}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:12px;">${urlCell}</td>
          </tr>`;
      }).join("");

      return `
        <tr><td style="padding:20px 24px 8px;">
          <h3 style="margin:0;font-size:15px;color:#111827;font-weight:600;">${escape(platformLabel(platform))} <span style="color:#9ca3af;font-weight:400;font-size:13px;">(${items.length})</span></h3>
        </td></tr>
        <tr><td style="padding:0 24px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
            <tr style="background:#f9fafb;">
              <th align="left" style="padding:8px 12px;font-size:11px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Content</th>
              <th align="left" style="padding:8px 12px;font-size:11px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Published</th>
              <th align="left" style="padding:8px 12px;font-size:11px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Status</th>
              <th align="left" style="padding:8px 12px;font-size:11px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Platform ID</th>
              <th align="left" style="padding:8px 12px;font-size:11px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Live URL</th>
            </tr>
            ${tableRows}
          </table>
        </td></tr>`;
    }).join("");

  const emptyState = totalCount === 0
    ? `<tr><td style="padding:32px 24px;text-align:center;color:#6b7280;font-size:14px;">No uploads or upload attempts in the last 24 hours.</td></tr>`
    : "";

  const fromStr = since.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const toStr = until.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:100%;">

<tr><td style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);padding:28px 24px;text-align:center;">
  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Daily Upload Digest</h1>
  <p style="color:#c4b5fd;margin:6px 0 0;font-size:13px;">Every upload action from the last 24 hours — cross-check with YouTube Studio</p>
  <p style="color:#a78bfa;margin:4px 0 0;font-size:12px;">${escape(fromStr)} → ${escape(toStr)}</p>
</td></tr>

<tr><td style="padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="25%" style="text-align:center;padding:10px;">
        <div style="font-size:26px;font-weight:700;color:#111827;">${totalCount}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">Attempts</div>
      </td>
      <td width="25%" style="text-align:center;padding:10px;">
        <div style="font-size:26px;font-weight:700;color:#065f46;">${verifiedCount}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">Verified Live</div>
      </td>
      <td width="25%" style="text-align:center;padding:10px;">
        <div style="font-size:26px;font-weight:700;color:#92400e;">${pendingCount}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">Pending Check</div>
      </td>
      <td width="25%" style="text-align:center;padding:10px;">
        <div style="font-size:26px;font-weight:700;color:#991b1b;">${failedCount}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">Failed</div>
      </td>
    </tr>
  </table>
</td></tr>

${emptyState}
${platformSections}

<tr><td style="padding:16px 24px 24px;">
  <div style="background:#f9fafb;border-radius:6px;padding:14px 16px;">
    <p style="margin:0 0 6px;font-size:12px;color:#374151;font-weight:600;">How to reconcile with YouTube Studio</p>
    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
      Click each <strong>Live URL</strong> above to open the post on its platform. For YouTube entries marked <strong>VERIFIED LIVE</strong>, CreatorOS has already read back the upload through YouTube's API and confirmed the video exists with a <code>processed</code> or <code>uploaded</code> status. If you see a video on YouTube Studio that isn't in this digest, it was uploaded outside of CreatorOS.
    </p>
  </div>
</td></tr>

<tr><td style="background:#f9fafb;padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">CreatorOS Daily Upload Digest · sent to ${escape(email)}</p>
  <p style="color:#d1d5db;font-size:11px;margin:4px 0 0;">Delivered daily at 08:00 UTC. Manage preferences in Settings.</p>
</td></tr>

</table></td></tr></table>
</body></html>`;
}

export async function sendDailyUploadDigest(userId: string): Promise<{ sent: boolean; rowCount: number; reason?: string }> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.email) return { sent: false, rowCount: 0, reason: "no_email" };
    if (user.notifyEmail === false) return { sent: false, rowCount: 0, reason: "opted_out" };

    const until = new Date();
    const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const rows = await collectRowsForUser(userId, since);

    const html = buildHtml(user.email, since, until, rows);
    const subject = `[CreatorOS] Daily Upload Digest — ${rows.length} action${rows.length === 1 ? "" : "s"} in last 24h`;

    const ok = await sendGmail(user.email, subject, html);
    if (ok) {
      logger.info("[DailyDigest] Sent", { userId, rowCount: rows.length });
      return { sent: true, rowCount: rows.length };
    }
    return { sent: false, rowCount: rows.length, reason: "gmail_failed" };
  } catch (err: any) {
    logger.error("[DailyDigest] Failed", { userId, error: err?.message });
    return { sent: false, rowCount: 0, reason: err?.message || "error" };
  }
}

export async function sendTestDailyDigest(userId: string): Promise<{ success: boolean; message: string; rowCount: number }> {
  const result = await sendDailyUploadDigest(userId);
  return {
    success: result.sent,
    message: result.sent
      ? `Daily upload digest sent (${result.rowCount} upload action${result.rowCount === 1 ? "" : "s"} included)`
      : `Digest generated but not sent: ${result.reason || "unknown"}`,
    rowCount: result.rowCount,
  };
}

const DIGEST_LOCK_NAME = "daily-upload-digest";
// 23-hour TTL — prevents a second send if the server restarts within the same
// calendar day, while still allowing the job to run every 24 hours normally.
const DIGEST_LOCK_TTL_MS = 23 * 60 * 60_000;

export function initDailyUploadDigestEngine() {
  registerCronHeartbeat(DIGEST_LOCK_NAME, 24 * 60 * 60_000);

  // 08:00 UTC daily
  cron.schedule("0 8 * * *", async () => {
    const acquired = await withCronLock(DIGEST_LOCK_NAME, DIGEST_LOCK_TTL_MS, async () => {
      const allChannels = await db.select({ userId: channels.userId }).from(channels)
        .where(eq(channels.platform, "youtube"));
      const userIds = Array.from(new Set(allChannels.map(c => c.userId).filter(Boolean))) as string[];
      logger.info("Cron firing", { userCount: userIds.length });
      for (const uid of userIds) {
        try {
          await sendDailyUploadDigest(uid);
        } catch (err: any) {
          logger.error("Per-user send failed", { uid, error: err?.message });
        }
      }
    });
    if (!acquired) {
      logger.info("Digest already running on another instance — skipping duplicate fire");
    }
  });
  logger.info("Engine initialized (08:00 UTC daily)");
}
