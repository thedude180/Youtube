/**
 * system-health-monitor.ts
 *
 * App-wide health detection layer.
 *
 * Runs after every pipeline-self-heal cycle (~every 20 min + on boot at T+5s).
 * Each check scans one health dimension, logs what it finds, and writes any
 * detected issue to system_incident_log via logIncidentOnce() (24h deduped).
 *
 * The closed learning loop:
 *   detect → logIncidentOnce() → system_incident_log
 *     → brain daily cycle → masterKnowledgeBank
 *       → flows into every AI prompt forever
 *
 * Checks covered:
 *   1. Publishing velocity   — are items completing in autopilot_queue?
 *   2. Queue failure spike   — sudden spike of permanent_fail items?
 *   3. Vault stuck downloads — vault entries stuck in 'indexed' for >2h?
 *   4. Dead engines          — critical engine heartbeats gone stale?
 *   5. Quota breaker         — YouTube API quota breaker currently tripped?
 */

import { db } from "../db";
import { engineHeartbeats, youtubeQuotaUsage } from "@shared/schema";
import { and, lt, eq, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { logIncidentOnce } from "../lib/incident-log";

const logger = createLogger("health-monitor");

const REAL_USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

// Critical engines: alert if error status + stale heartbeat + repeated failures
const CRITICAL_ENGINES = [
  "shorts-clip-publisher",
  "long-form-clip-publisher",
  "back-catalog-runner",
  "youtube-ai-orchestrator",
  "youtube-grinder",
];

// ── Check 1: Publishing velocity ──────────────────────────────────────────────
// Zero completions in 4h = publishing pipeline is stalled.
async function checkPublishingVelocity(): Promise<void> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM autopilot_queue
    WHERE status = 'completed'
      AND updated_at > NOW() - INTERVAL '4 hours'
  `);
  const count = Number((result.rows[0] as any)?.count ?? 0);

  if (count === 0) {
    logger.warn("[health-monitor] Publishing velocity: 0 items completed in last 4h — pipeline may be stalled");
    await logIncidentOnce({
      category:     "publisher_loop",
      service:      "health-monitor/publishing-velocity",
      severity:     "high",
      rootCause:    "Zero autopilot_queue items reached status='completed' in the last 4 hours.",
      fixDescription: "Auto-detected. Check YouTube quota breaker, OAuth token state, and queue depth.",
      lesson:
        "When publishing velocity drops to 0 for 4+ hours it signals quota exhaustion, " +
        "OAuth token expiry, or a publisher stuck in a no-token hot-loop. " +
        "The primary health signal is status=completed + updated_at on autopilot_queue. " +
        "Zero completions = nothing is reaching YouTube — investigate quota, token, and queue errors first.",
      tags: ["publishing", "velocity", "stall"],
    });
  } else {
    logger.info(`[health-monitor] Publishing velocity: ${count} items completed in last 4h ✓`);
  }
}

// ── Check 2: Queue failure spike ──────────────────────────────────────────────
// >20 new permanent_fail items in 1h = systemic failure in the pipeline.
async function checkQueueFailures(): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_fail,
      SUM(CASE WHEN updated_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END)::int AS recent_fail
    FROM autopilot_queue
    WHERE status = 'permanent_fail'
  `);
  const row        = result.rows[0] as any;
  const totalFail  = Number(row?.total_fail  ?? 0);
  const recentFail = Number(row?.recent_fail ?? 0);

  logger.info(`[health-monitor] Queue failures: ${recentFail} new permanent_fail in last 1h, ${totalFail} total`);

  if (recentFail > 20) {
    logger.warn(`[health-monitor] Queue failures: SPIKE — ${recentFail} new permanent_fail in last 1h`);
    await logIncidentOnce({
      category:     "publisher_loop",
      service:      "health-monitor/queue-failures",
      severity:     "high",
      rootCause:    `${recentFail} autopilot_queue items failed permanently in the last hour (total permanent_fail: ${totalFail}).`,
      fixDescription: "Auto-detected failure spike. Investigate error_message patterns on recent permanent_fail rows.",
      lesson:
        "A spike of >20 permanent_fail items per hour indicates a systemic issue: bad OAuth token, " +
        "quota exhaustion, encoding failure (missing ffmpeg), or a focus-game filter mismatch. " +
        "Query error_message on autopilot_queue grouped by error pattern to find the dominant cause. " +
        "The most common culprits are token expiry and ffmpeg not found after a Nix package update.",
      tags: ["queue", "failures", "permanent_fail", "spike"],
    });
  }
}

// ── Check 3: Vault stuck downloads ────────────────────────────────────────────
// >30 entries stuck in 'indexed' for >2h = vault downloader is stalled.
async function checkVaultStuck(): Promise<void> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM content_vault_backups
    WHERE status = 'indexed'
      AND created_at < NOW() - INTERVAL '2 hours'
      AND game_name IS NOT NULL
      AND (metadata->>'permanentFail') IS DISTINCT FROM 'true'
      AND COALESCE((metadata->>'failCount')::int, 0) < 5
  `);
  const count = Number((result.rows[0] as any)?.count ?? 0);

  logger.info(`[health-monitor] Vault: ${count} entries in 'indexed' state awaiting download`);

  if (count > 30) {
    logger.warn(`[health-monitor] Vault: ${count} entries stuck in 'indexed' for >2h — downloader may be stalled`);
    await logIncidentOnce({
      category:     "vault_failure",
      service:      "health-monitor/vault-stuck",
      severity:     "medium",
      rootCause:
        `${count} content_vault_backups entries stuck in status='indexed' for >2 hours. ` +
        `The vault perpetual downloader is not processing them.`,
      fixDescription: "Auto-detected. Check yt-dlp slot availability, disk space (>0.5GB required), and InnerTube auth state.",
      lesson:
        "Vault entries stuck in 'indexed' for >2h mean the perpetual downloader is stalled. " +
        "Root causes in order of likelihood: (1) yt-dlp slot starvation — all 4 slots held by hung processes; " +
        "(2) disk full — <0.5GB triggers a 2h backoff via _vaultDiskFullUntil; " +
        "(3) InnerTube 401 storm — 30-min auth backoff active after token expiry. " +
        "Check disk usage first, then yt-dlp process count, then token refresh logs.",
      tags: ["vault", "stuck", "indexed", "downloader"],
    });
  }
}

// ── Check 4: Dead engines ─────────────────────────────────────────────────────
// Critical engine with stale heartbeat + error status + repeated failures = crashed.
async function checkDeadEngines(): Promise<void> {
  const cutoff = new Date(Date.now() - 35 * 60_000); // 35 min stale

  const rows = await db
    .select({
      engineName:   engineHeartbeats.engineName,
      lastRunAt:    engineHeartbeats.lastRunAt,
      status:       engineHeartbeats.status,
      failureCount: engineHeartbeats.failureCount,
      lastError:    engineHeartbeats.lastError,
    })
    .from(engineHeartbeats)
    .where(
      and(
        lt(engineHeartbeats.lastRunAt, cutoff),
        eq(engineHeartbeats.status, "error"),
        sql`${engineHeartbeats.failureCount} >= 3`,
        inArray(engineHeartbeats.engineName, CRITICAL_ENGINES),
      ),
    );

  if (rows.length === 0) {
    logger.info("[health-monitor] Engine heartbeats: all critical engines OK ✓");
    return;
  }

  for (const engine of rows) {
    const minutesAgo = Math.round(
      (Date.now() - new Date(engine.lastRunAt!).getTime()) / 60_000,
    );
    logger.warn(
      `[health-monitor] Engine "${engine.engineName}" — last heartbeat ${minutesAgo}min ago, ` +
      `status: ${engine.status}, failures: ${engine.failureCount ?? 0}`,
    );
    await logIncidentOnce({
      category:     "other",
      service:      `health-monitor/dead-engine/${engine.engineName}`,
      severity:     "high",
      rootCause:
        `Critical engine "${engine.engineName}" has not reported a heartbeat in ${minutesAgo} minutes. ` +
        `Failure count: ${engine.failureCount ?? 0}. Last error: ${engine.lastError ?? "none"}.`,
      fixDescription:
        "Auto-detected. Engine may be in a crash loop, blocked by quota, or missing its startup wave slot.",
      lesson:
        `Engine "${engine.engineName}" going silent with error status and ≥3 failures indicates ` +
        `a crash loop, quota block, or startup timing issue. Check logs for the engine's log prefix. ` +
        `Verify it is registered in the correct wave in server/index.ts and has a proper startup delay. ` +
        `Recurring silence on the same engine name across reboots is a strong signal of a systematic boot-timing or resource contention problem.`,
      tags: ["engine", "heartbeat", "dead", engine.engineName],
    });
  }
}

// ── Check 5: YouTube quota breaker ────────────────────────────────────────────
// Report current quota state; log active incident when breaker is tripped.
async function checkQuotaBreakerState(): Promise<void> {
  const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      unitsUsed:  youtubeQuotaUsage.unitsUsed,
      quotaLimit: youtubeQuotaUsage.quotaLimit,
    })
    .from(youtubeQuotaUsage)
    .where(
      and(
        eq(youtubeQuotaUsage.userId, REAL_USER_ID),
        eq(youtubeQuotaUsage.date,   today),
      ),
    )
    .limit(1);

  const units = rows[0]?.unitsUsed  ?? 0;
  const limit = rows[0]?.quotaLimit ?? 10_000;

  if (!isQuotaBreakerTripped()) {
    logger.info(`[health-monitor] Quota: ${units}/${limit} units used today, breaker clear ✓`);
    return;
  }

  logger.warn(`[health-monitor] Quota breaker: TRIPPED — ${units}/${limit} units used today`);
  await logIncidentOnce({
    category:     "quota_breach",
    service:      "health-monitor/quota-breaker",
    severity:     "high",
    rootCause:
      `YouTube API quota breaker tripped — ${units}/${limit} units consumed today. ` +
      `All publishing and metadata operations blocked until midnight UTC (5pm Pacific).`,
    fixDescription:
      "Auto-detected. Quota auto-resets at midnight UTC. Back-catalog runner reschedules to getNextResetTime()+5min.",
    lesson:
      "YouTube quota (10,000 units/day) typically exhausts by ~10am Pacific when all services run simultaneously. " +
      "Quota resets at midnight UTC = 5pm Pacific. " +
      "Schedule heavy batch operations in the 00:00–06:00 UTC window to maximise the available window. " +
      "The back-catalog runner targets getNextResetTime()+5min when the breaker is active to avoid re-tripping on the next boot.",
    tags: ["quota", "breaker", "youtube-api", "tripped"],
  });
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function runHealthMonitor(): Promise<void> {
  logger.info("[health-monitor] Starting app-wide health checks (5 dimensions)");

  const results = await Promise.allSettled([
    checkPublishingVelocity(),
    checkQueueFailures(),
    checkVaultStuck(),
    checkDeadEngines(),
    checkQuotaBreakerState(),
  ]);

  const CHECK_NAMES = [
    "publishing-velocity",
    "queue-failures",
    "vault-stuck",
    "dead-engines",
    "quota-breaker",
  ];

  let failedCount = 0;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      failedCount++;
      logger.warn(
        `[health-monitor] Check "${CHECK_NAMES[i]}" threw (non-fatal): ` +
        `${(r.reason as any)?.message ?? String(r.reason)}`,
      );
    }
  });

  const passed = results.length - failedCount;
  logger.info(
    `[health-monitor] App-wide checks complete — ${passed}/${results.length} passed` +
    (failedCount > 0 ? ` (${failedCount} threw errors, see warnings above)` : ""),
  );
}
