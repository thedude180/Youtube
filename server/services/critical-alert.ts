/**
 * Critical Alert — sends an email to the system owner when the server
 * encounters an issue it cannot recover from autonomously.
 *
 * Design rules:
 *  - Fire-and-forget: never throws, never blocks shutdown/restart.
 *  - Deduped: max one email per alert key per DEDUP_WINDOW_MS.
 *  - Works during shutdown: uses a tight 8-second timeout so it completes
 *    before the process exits.
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("critical-alert");

const OWNER_EMAIL = "thedude180@gmail.com";
const DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours per unique alert key

const _sent = new Map<string, number>();

function dedupKey(subject: string): string {
  return subject.toLowerCase().replace(/\s+/g, "-").substring(0, 80);
}

/**
 * Send a critical alert email to the system owner.
 * Safe to call at any point including during process shutdown.
 * @param subject  Short headline for the email subject line
 * @param details  Longer description of what happened and what the system did
 */
export async function sendCriticalAlert(subject: string, details: string): Promise<void> {
  const key = dedupKey(subject);
  const last = _sent.get(key) ?? 0;
  if (Date.now() - last < DEDUP_WINDOW_MS) {
    logger.info(`[CriticalAlert] Suppressed duplicate alert (${DEDUP_WINDOW_MS / 3600000}h dedup): ${subject}`);
    return;
  }
  _sent.set(key, Date.now());

  const ts = new Date().toISOString();
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#b91c1c;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">⚠️ CreatorOS — Critical Alert</h2>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="font-size:15px;color:#111;font-weight:600;margin:0 0 12px">${subject}</p>
        <p style="font-size:14px;color:#374151;white-space:pre-wrap;margin:0 0 20px">${details}</p>
        <p style="font-size:12px;color:#9ca3af;margin:0">Timestamp: ${ts}<br>Server: CreatorOS Automation Engine</p>
      </div>
    </div>
  `;

  try {
    const { sendGmail } = await import("./gmail-client");
    const ok = await Promise.race([
      sendGmail(OWNER_EMAIL, `[CreatorOS] ${subject}`, html),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 8_000)),
    ]);
    if (ok) {
      logger.info(`[CriticalAlert] Alert email sent: ${subject}`);
    } else {
      logger.warn(`[CriticalAlert] Alert email failed or timed out: ${subject}`);
    }
  } catch (err) {
    logger.warn(`[CriticalAlert] Could not send alert email: ${String(err)}`);
  }
}

/**
 * Write a crash marker file before an intentional process exit so the next
 * startup can detect that the last shutdown was unplanned and email the owner.
 */
import { writeFileSync } from "fs";
const CRASH_MARKER = "/tmp/creatorOS-crash-marker.json";

export function writeCrashMarker(reason: string, detail: string): void {
  try {
    writeFileSync(CRASH_MARKER, JSON.stringify({ reason, detail, at: new Date().toISOString() }), "utf8");
  } catch { /* best-effort */ }
}

/**
 * Called at server startup. If a crash marker exists from the previous run,
 * email the owner that the server restarted after an unrecoverable issue,
 * then delete the marker so it only fires once per incident.
 */
import { existsSync, readFileSync, unlinkSync } from "fs";

export async function checkAndReportCrashRecovery(): Promise<void> {
  if (!existsSync(CRASH_MARKER)) return;

  let payload: { reason?: string; detail?: string; at?: string } = {};
  try {
    payload = JSON.parse(readFileSync(CRASH_MARKER, "utf8"));
  } catch { /* ignore parse errors */ }

  try { unlinkSync(CRASH_MARKER); } catch { /* best-effort */ }

  const subject = "Server restarted after unrecoverable issue";
  const details = [
    `The CreatorOS server restarted automatically after detecting an issue it could not recover from on its own.`,
    ``,
    `Reason : ${payload.reason ?? "unknown"}`,
    `Detail : ${payload.detail ?? "no detail recorded"}`,
    `Crashed: ${payload.at ?? "unknown"}`,
    `Back online: ${new Date().toISOString()}`,
    ``,
    `All engines and automation are resuming now. No action is needed unless you see this email repeatedly.`,
  ].join("\n");

  logger.warn(`[CriticalAlert] Crash recovery detected — sending restart email (${payload.reason})`);
  await sendCriticalAlert(subject, details);
}
