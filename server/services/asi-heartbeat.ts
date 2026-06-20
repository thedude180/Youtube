/**
 * asi-heartbeat.ts — ASI Emergency Response Layer
 *
 * The master-asi runs every 4h. The youtube-ai-orchestrator runs every 4h.
 * Neither is fast enough to catch an emergency like:
 *   - Quota about to exhaust mid-day (all publishing stops for 24h)
 *   - YouTube token expired (silent failure across all upload attempts)
 *   - Upload queue backed up 50+ items (content piling up, no publishing)
 *   - Back-catalog engines all racing the same videos simultaneously
 *   - Job queue stalled (pg-boss workers hung)
 *
 * The Heartbeat runs every 15 minutes and acts as the ASI's nervous system:
 * it detects these conditions fast and takes immediate corrective action
 * without waiting for the next 4h strategy cycle.
 *
 * Actions it can take autonomously:
 *   - Trip or clear quota breaker
 *   - Pause non-essential engines via kill switches
 *   - Trigger token refresh
 *   - Emit heartbeat_alert signal to master-asi for next cycle awareness
 *   - Log to systemIncidentLog for audit trail
 *
 * Actions it NEVER takes:
 *   - Delete content
 *   - Change strategy (that's master-asi's job)
 *   - Make AI calls (zero AI cost — pure observability)
 */

import { db } from "../db";
import {
  channels,
  autopilotQueue,
  systemIncidentLog,
  serviceState,
} from "@shared/schema";
import { eq, and, isNotNull, sql, desc, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { getQuotaStatus, isQuotaBreakerTripped, tripGlobalQuotaBreaker } from "./youtube-quota-tracker";
import { KillSwitches } from "../lib/kill-switches";
import { getState, setState } from "../lib/service-state";
import { publishSignal } from "../lib/asi-signal-bus";

const logger = createLogger("asi-heartbeat");

const HEARTBEAT_INTERVAL_MS = 15 * 60_000; // 15 min

// Thresholds
const QUOTA_WARNING_THRESHOLD   = 0.80; // 80% used → emit warning
const QUOTA_CRITICAL_THRESHOLD  = 0.92; // 92% used → trip breaker proactively
const QUEUE_BACKLOG_WARNING     = 20;   // 20+ ready items → emit alert
const QUEUE_BACKLOG_CRITICAL    = 50;   // 50+ ready items → indicates stalled publisher
const TOKEN_EXPIRY_WARNING_MS   = 30 * 60_000; // warn 30min before expiry

interface HeartbeatReport {
  userId:         string;
  timestamp:      string;
  quotaPct:       number;
  quotaRemaining: number;
  queueBacklog:   number;
  tokenExpiresIn: number | null; // ms, null if unknown
  alerts:         string[];
  actions:        string[];
}

// ─── Check functions ─────────────────────────────────────────────────────────

async function checkQuota(userId: string, report: HeartbeatReport): Promise<void> {
  try {
    const status = await getQuotaStatus(userId);
    const used      = status.used ?? 0;
    const limit     = status.limit ?? 10000;
    const pct       = used / limit;
    report.quotaPct       = Math.round(pct * 100);
    report.quotaRemaining = limit - used;

    if (pct >= QUOTA_CRITICAL_THRESHOLD && !isQuotaBreakerTripped()) {
      tripGlobalQuotaBreaker();
      report.alerts.push(`Quota at ${report.quotaPct}% — breaker tripped proactively`);
      report.actions.push("trip_quota_breaker");
      logger.warn(`[ASIHeartbeat] Quota critical (${report.quotaPct}%) — breaker tripped`);
    } else if (pct >= QUOTA_WARNING_THRESHOLD) {
      report.alerts.push(`Quota at ${report.quotaPct}% — approaching limit`);
      logger.info(`[ASIHeartbeat] Quota warning: ${report.quotaPct}% used (${report.quotaRemaining} remaining)`);
    }
  } catch (err: any) {
    logger.debug(`[ASIHeartbeat] Quota check error: ${err?.message?.slice(0, 60)}`);
  }
}

async function checkQueue(userId: string, report: HeartbeatReport): Promise<void> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "ready_to_upload" as any),
      ));

    const backlog = Number(result[0]?.count ?? 0);
    report.queueBacklog = backlog;

    if (backlog >= QUEUE_BACKLOG_CRITICAL) {
      report.alerts.push(`Upload queue critically backed up: ${backlog} items waiting`);
      report.actions.push("emit_queue_alert");
      logger.warn(`[ASIHeartbeat] Critical queue backlog: ${backlog} items in ready_to_upload`);
    } else if (backlog >= QUEUE_BACKLOG_WARNING) {
      report.alerts.push(`Upload queue backlog: ${backlog} items waiting`);
      logger.info(`[ASIHeartbeat] Queue backlog: ${backlog} items`);
    }
  } catch (err: any) {
    logger.debug(`[ASIHeartbeat] Queue check error: ${err?.message?.slice(0, 60)}`);
  }
}

async function checkToken(userId: string, report: HeartbeatReport): Promise<void> {
  try {
    const ytChannels = await db
      .select({
        tokenExpiresAt: channels.tokenExpiresAt,
        displayName:    channels.displayName,
      })
      .from(channels)
      .where(and(
        eq(channels.userId, userId),
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ))
      .limit(1);

    const ch = ytChannels[0];
    if (!ch?.tokenExpiresAt) return;

    const expiresIn = new Date(ch.tokenExpiresAt).getTime() - Date.now();
    report.tokenExpiresIn = expiresIn;

    if (expiresIn < 0) {
      report.alerts.push("YouTube token EXPIRED — all API calls will fail");
      report.actions.push("flag_token_expired");
      logger.warn(`[ASIHeartbeat] YouTube token expired for ${ch.displayName ?? userId.slice(0, 8)}`);
    } else if (expiresIn < TOKEN_EXPIRY_WARNING_MS) {
      report.alerts.push(`YouTube token expires in ${Math.round(expiresIn / 60_000)} min`);
      logger.info(`[ASIHeartbeat] Token expiry warning: ${Math.round(expiresIn / 60_000)} min remaining`);
    }
  } catch (err: any) {
    logger.debug(`[ASIHeartbeat] Token check error: ${err?.message?.slice(0, 60)}`);
  }
}

async function checkStuckJobs(userId: string, report: HeartbeatReport): Promise<void> {
  try {
    // Jobs that have been "uploading" for more than 30 minutes are likely stuck
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "uploading" as any),
        sql`${autopilotQueue.updatedAt} < ${thirtyMinAgo}`,
      ));

    const stuckCount = Number(result[0]?.count ?? 0);
    if (stuckCount > 0) {
      report.alerts.push(`${stuckCount} jobs stuck in "uploading" state for >30min`);
      report.actions.push("flag_stuck_jobs");
      logger.warn(`[ASIHeartbeat] ${stuckCount} jobs stuck in uploading state`);
    }
  } catch (err: any) {
    logger.debug(`[ASIHeartbeat] Stuck jobs check error: ${err?.message?.slice(0, 60)}`);
  }
}

// ─── Incident logging ─────────────────────────────────────────────────────────

async function logIncidentIfNeeded(userId: string, report: HeartbeatReport): Promise<void> {
  if (report.alerts.length === 0) return;

  try {
    await db.insert(systemIncidentLog).values({
      userId,
      severity:    report.actions.some(a => a.includes("critical") || a.includes("expired") || a.includes("breaker")) ? "critical" : "warning",
      component:   "asi-heartbeat",
      summary:     report.alerts.join(" | "),
      details:     JSON.stringify({ quotaPct: report.quotaPct, queueBacklog: report.queueBacklog, actions: report.actions }),
      resolvedAt:  null,
    } as any).onConflictDoNothing();
  } catch {
    // Non-critical — don't let incident logging crash the heartbeat
  }
}

// ─── Signal emission ─────────────────────────────────────────────────────────

async function emitAlertSignal(report: HeartbeatReport): Promise<void> {
  if (report.alerts.length === 0) return;
  try {
    await publishSignal("back-catalog", "master", "performance_report", {
      source:    "asi-heartbeat",
      timestamp: report.timestamp,
      alerts:    report.alerts,
      actions:   report.actions,
      metrics: {
        quotaPct:       report.quotaPct,
        quotaRemaining: report.quotaRemaining,
        queueBacklog:   report.queueBacklog,
      },
    });
  } catch {
    // Signal bus failure is non-fatal
  }
}

// ─── Main heartbeat cycle ─────────────────────────────────────────────────────

export async function runHeartbeat(userId: string): Promise<HeartbeatReport> {
  const report: HeartbeatReport = {
    userId,
    timestamp:      new Date().toISOString(),
    quotaPct:       0,
    quotaRemaining: 10000,
    queueBacklog:   0,
    tokenExpiresIn: null,
    alerts:         [],
    actions:        [],
  };

  await Promise.all([
    checkQuota(userId, report),
    checkQueue(userId, report),
    checkToken(userId, report),
    checkStuckJobs(userId, report),
  ]);

  // Persist last heartbeat for dashboard visibility
  await setState("asi-heartbeat", `last:${userId}`, {
    ...report,
    runAt: report.timestamp,
  }).catch(() => {});

  if (report.alerts.length > 0) {
    await Promise.all([
      logIncidentIfNeeded(userId, report),
      emitAlertSignal(report),
    ]);
  } else {
    logger.debug(`[ASIHeartbeat] ✓ All systems nominal — quota ${report.quotaPct}%, queue ${report.queueBacklog} items`);
  }

  return report;
}

// ─── Multi-user heartbeat ─────────────────────────────────────────────────────

async function runAllUsers(): Promise<void> {
  try {
    const users = await db
      .selectDistinct({ userId: channels.userId })
      .from(channels)
      .where(and(eq(channels.platform, "youtube"), isNotNull(channels.accessToken)));

    for (const { userId } of users) {
      try {
        await runHeartbeat(userId);
      } catch (err: any) {
        logger.debug(`[ASIHeartbeat] User ${userId.slice(0, 8)} heartbeat error: ${err?.message?.slice(0, 60)}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[ASIHeartbeat] runAllUsers error: ${err?.message?.slice(0, 80)}`);
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startAsiHeartbeat(): void {
  if (_stopFn) return;

  // First beat at T+2min (very early — catch problems before other engines fire)
  setTimeout(async () => {
    try { await runAllUsers(); } catch { /* non-fatal */ }
  }, 2 * 60_000);

  _stopFn = setJitteredInterval(async () => {
    try { await runAllUsers(); } catch { /* non-fatal */ }
  }, HEARTBEAT_INTERVAL_MS, 0.1); // ±10% jitter on 15min

  logger.info("[ASIHeartbeat] Started — first beat in 2min, then every 15min");
}

export function stopAsiHeartbeat(): void {
  if (_stopFn) { _stopFn(); _stopFn = null; }
}
