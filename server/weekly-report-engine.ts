import { db } from "./db";
import { eq, and, gte, desc } from "drizzle-orm";
import cron from "node-cron";
import { getSystemHealthReport } from "./self-healing-core";
import { videos, notifications, scheduleItems, channels, users, aiAgentActivities } from "@shared/schema";

import { createLogger } from "./lib/logger";

const logger = createLogger("weekly-report-engine");
interface WeeklyReport {
  userId: string;
  email: string | null;
  period: { from: Date; to: Date };
  stats: {
    videosCreated: number;
    notificationsGenerated: number;
    scheduledPosts: number;
    activePlatforms: number;
  };
  aiActions: Array<{ action: string; target: string | null; time: Date | null }>;
  systemHealth: {
    overallStatus: string;
    overallScore: number;
    uptimePercent: number;
    totalSelfHeals: number;
  };
}

export async function generateWeeklyReport(userId: string): Promise<WeeklyReport> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const userChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId));

  const channelIds = userChannels.map((c) => c.id);

  let videosCreated = 0;
  if (channelIds.length > 0) {
    for (const chId of channelIds) {
      const vids = await db
        .select()
        .from(videos)
        .where(and(eq(videos.channelId, chId), gte(videos.createdAt, sevenDaysAgo)));
      videosCreated += vids.length;
    }
  }

  const notifs = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), gte(notifications.createdAt, sevenDaysAgo)));

  const scheduled = await db
    .select()
    .from(scheduleItems)
    .where(and(eq(scheduleItems.userId, userId), gte(scheduleItems.createdAt, sevenDaysAgo)));

  const activePlatforms = userChannels.filter((c) => c.accessToken || c.streamKey).length;

  const recentActions = await db
    .select()
    .from(aiAgentActivities)
    .where(and(eq(aiAgentActivities.userId, userId), gte(aiAgentActivities.createdAt, sevenDaysAgo)))
    .orderBy(desc(aiAgentActivities.createdAt))
    .limit(500);

  const healthReport = getSystemHealthReport();

  return {
    userId,
    email: user?.email || null,
    period: { from: sevenDaysAgo, to: now },
    stats: {
      videosCreated,
      notificationsGenerated: notifs.length,
      scheduledPosts: scheduled.length,
      activePlatforms,
    },
    aiActions: recentActions.slice(0, 10).map((a) => ({
      action: a.action,
      target: a.target,
      time: a.createdAt,
    })),
    systemHealth: {
      overallStatus: healthReport.overallStatus,
      overallScore: healthReport.overallScore,
      uptimePercent: healthReport.uptimePercent,
      totalSelfHeals: healthReport.totalSelfHeals,
    },
  };
}

function buildEmailHtml(report: WeeklyReport): string {
  const { stats, aiActions, systemHealth, period } = report;
  const fromStr = period.from.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const toStr = period.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const actionRows = aiActions.length > 0
    ? aiActions
        .map(
          (a) =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${a.action}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${a.target || "—"}</td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="2" style="padding:12px;color:#9ca3af;text-align:center;">No AI actions this week</td></tr>`;

  const healthColor =
    systemHealth.overallStatus === "healthy"
      ? "#10b981"
      : systemHealth.overallStatus === "degraded"
        ? "#f59e0b"
        : "#ef4444";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg,#581c87,#7c3aed);padding:32px 24px;text-align:center;">
  <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">CreatorOS</h1>
  <p style="color:#c4b5fd;margin:8px 0 0;font-size:14px;">Weekly AI Performance Report</p>
  <p style="color:#a78bfa;margin:4px 0 0;font-size:12px;">${fromStr} — ${toStr}</p>
</td>
</tr>

<!-- Stats Summary -->
<tr>
<td style="padding:24px;">
  <h2 style="color:#1f2937;font-size:18px;margin:0 0 16px;font-weight:600;">Weekly Stats Summary</h2>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="25%" style="text-align:center;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#7c3aed;">${stats.videosCreated}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Videos Created</div>
      </td>
      <td width="25%" style="text-align:center;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#7c3aed;">${stats.notificationsGenerated}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Optimizations</div>
      </td>
      <td width="25%" style="text-align:center;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#7c3aed;">${stats.scheduledPosts}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Platform Posts</div>
      </td>
      <td width="25%" style="text-align:center;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:${healthColor};">${systemHealth.overallScore}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Health Score</div>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- AI Work Summary -->
<tr>
<td style="padding:0 24px 24px;">
  <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;font-weight:600;">AI Work Summary</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <tr style="background:#f9fafb;">
      <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151;font-weight:600;">Action</th>
      <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151;font-weight:600;">Target</th>
    </tr>
    ${actionRows}
  </table>
</td>
</tr>

<!-- System Health -->
<tr>
<td style="padding:0 24px 24px;">
  <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;font-weight:600;">System Health</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:16px;">
    <tr>
      <td style="padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:14px;color:#374151;">Overall Status</span>
          <span style="font-size:14px;font-weight:600;color:${healthColor};text-transform:capitalize;">${systemHealth.overallStatus}</span>
        </div>
        <div style="margin-bottom:8px;">
          <span style="font-size:14px;color:#374151;">Uptime: </span>
          <span style="font-size:14px;font-weight:600;color:#1f2937;">${systemHealth.uptimePercent}%</span>
        </div>
        <div style="margin-bottom:8px;">
          <span style="font-size:14px;color:#374151;">Self-Healing Recoveries: </span>
          <span style="font-size:14px;font-weight:600;color:#1f2937;">${systemHealth.totalSelfHeals}</span>
        </div>
        <div>
          <span style="font-size:14px;color:#374151;">Active Platforms: </span>
          <span style="font-size:14px;font-weight:600;color:#1f2937;">${stats.activePlatforms}</span>
        </div>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#f9fafb;padding:20px 24px;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">Powered by CreatorOS AI</p>
  <p style="color:#d1d5db;font-size:11px;margin:4px 0 0;">You receive this report weekly. Manage preferences in Settings.</p>
</td>
</tr>

</table>
</td></tr></table>
</body>
</html>`;
}

export async function sendWeeklyReportEmail(userId: string): Promise<boolean> {
  try {
    const report = await generateWeeklyReport(userId);

    if (!report.email) {
      return false;
    }

    const html = buildEmailHtml(report);
    const subject = `Your Weekly AI Performance Report — CreatorOS`;

    // Weekly report email disabled — only daily-upload-digest sends scheduled email.
    logger.info(`[WeeklyReport] Weekly report email suppressed for ${report.email}`);
    return false;
  } catch (err: any) {
    logger.error(`[WeeklyReport] Failed to generate/send report for ${userId}:`, err.message);
    return false;
  }
}

export async function sendTestReport(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const sent = await sendWeeklyReportEmail(userId);
    return {
      success: sent,
      message: sent
        ? "Test weekly report sent successfully"
        : "Report generated but email could not be sent (check Gmail connection or user email)",
    };
  } catch (err: any) {
    return { success: false, message: `Failed: ${err.message}` };
  }
}

export function initWeeklyReportEngine() {
  cron.schedule("0 9 * * 1", async () => {
    try {
      const allChannels = await db.select({ userId: channels.userId }).from(channels);
      const userIds = Array.from(new Set(allChannels.map((c) => c.userId).filter(Boolean))) as string[];


      for (const uid of userIds) {
        try {
          await sendWeeklyReportEmail(uid);
        } catch (err: any) {
          logger.error(`[WeeklyReport] Error sending report to ${uid}:`, err.message);
        }
      }

    } catch (err: any) {
      logger.error("[WeeklyReport] Cron job failed:", err.message);
    }
  });
}
