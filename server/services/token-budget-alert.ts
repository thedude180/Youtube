/**
 * Token Budget Email Alert Service
 *
 * Sends a one-per-engine-per-day email to all admin users when any AI engine
 * crosses the 80% daily token budget threshold.
 *
 * De-duplication is handled in memory by tracking which (engine, utcDay) pairs
 * have already triggered an alert. The set is trimmed of stale days on each
 * check so memory stays bounded.
 */

import { createLogger } from "../lib/logger";
import { ADMIN_EMAIL } from "@shared/models/auth";

const logger = createLogger("token-budget-alert");

const ALERT_THRESHOLD = 0.8;

/**
 * Set of "engine|utcDay" strings that have already received an alert today.
 * Checked before every send to prevent duplicate emails per engine per day.
 */
const _alertedSet = new Set<string>();

function utcDay(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Remove stale (not-today) entries to keep the set bounded. */
function _trimStaleAlerts(): void {
  const today = utcDay();
  for (const key of _alertedSet) {
    if (!key.endsWith(`|${today}`)) _alertedSet.delete(key);
  }
}

/** Fetch all admin email addresses (ADMIN_EMAIL constant + DB users with role='admin'). */
async function _getAdminEmails(): Promise<string[]> {
  const emails = new Set<string>();
  emails.add(ADMIN_EMAIL);
  try {
    const { storage } = await import("../storage");
    const allUsers = await storage.getAllUsers();
    for (const u of allUsers) {
      if (u.role === "admin" && u.email) emails.add(u.email);
    }
  } catch (err: any) {
    logger.warn(`[TokenBudgetAlert] Could not load admin users from DB: ${err?.message ?? err}`);
  }
  return Array.from(emails);
}

function _buildEmailHtml(engine: string, used: number, cap: number): string {
  const pct = Math.round((used / cap) * 100);
  const settingsUrl = "https://creator-os.replit.app/settings/admin-tokens";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Token Budget Alert</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#dc2626;padding:20px 32px;">
            <span style="font-size:18px;font-weight:700;color:#fff;">⚠️ CreatorOS — Token Budget Alert</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;">The following AI engine has crossed the <strong style="color:#fbbf24;">80% daily token budget threshold</strong>:</p>
            <table width="100%" cellpadding="12" cellspacing="0" style="background:#0f172a;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="font-size:14px;color:#94a3b8;border-bottom:1px solid #334155;">Engine</td>
                <td style="font-size:14px;color:#e2e8f0;border-bottom:1px solid #334155;text-align:right;font-weight:700;">${engine}</td>
              </tr>
              <tr>
                <td style="font-size:14px;color:#94a3b8;border-bottom:1px solid #334155;">Usage</td>
                <td style="font-size:14px;color:#e2e8f0;border-bottom:1px solid #334155;text-align:right;">${used.toLocaleString()} / ${cap.toLocaleString()} tokens</td>
              </tr>
              <tr>
                <td style="font-size:14px;color:#94a3b8;">Percentage</td>
                <td style="font-size:14px;font-weight:700;text-align:right;color:${pct >= 100 ? "#ef4444" : "#f59e0b"};">${pct}%</td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;">
              If no action is taken, the engine will stop making AI calls when the cap is reached and resume at UTC midnight when the counter resets.
            </p>
            <a href="${settingsUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">View Token Budget Settings →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#0f172a;font-size:12px;color:#475569;text-align:center;">
            CreatorOS · Alerts are sent once per engine per UTC day · <a href="${settingsUrl}" style="color:#3b82f6;text-decoration:none;">Manage Budgets</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Called from TokenBudgetGuard.consumeBudget() after each token spend.
 * Checks if the engine has crossed the 80% threshold and, if this is the first
 * crossing today, sends an email alert to all admin users.
 *
 * Fire-and-forget — the promise is intentionally not awaited by the caller.
 */
export async function checkAndAlertTokenBudget(
  engine: string,
  used: number,
  cap: number
): Promise<void> {
  if (used / cap < ALERT_THRESHOLD) return;

  _trimStaleAlerts();
  const key = `${engine}|${utcDay()}`;
  if (_alertedSet.has(key)) return;
  _alertedSet.add(key);

  const pct = Math.round((used / cap) * 100);
  logger.warn(`[TokenBudgetAlert] ${engine} at ${pct}% (${used}/${cap}) — sending admin alert`);

  try {
    const { sendGmail } = await import("./gmail-client");
    const adminEmails = await _getAdminEmails();
    const subject = `[CreatorOS] Token Budget Alert: ${engine} at ${pct}%`;
    const html = _buildEmailHtml(engine, used, cap);

    const results = await Promise.allSettled(
      adminEmails.map(email => sendGmail(email, subject, html))
    );

    const sent = results.filter(r => r.status === "fulfilled" && r.value).length;
    logger.info(`[TokenBudgetAlert] Alert sent to ${sent}/${adminEmails.length} admin(s) for engine=${engine}`);
  } catch (err: any) {
    logger.error(`[TokenBudgetAlert] Failed to send alert for ${engine}: ${err?.message ?? err}`);
  }
}
