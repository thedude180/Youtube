/**
 * server/lib/startup-orchestrator.ts
 *
 * Phase 10 — Staged Startup Orchestrator
 *
 * Implements 13 stages from the spec. Each stage reports health before the
 * next one starts. Critical stage failure keeps the HTTP server alive for
 * health checks but does not start dependent workers.
 *
 * Stage order:
 *  1. Environment Validation
 *  2. Database Readiness
 *  3. Account Cleanup (demo purge + non-YouTube purge)
 *  4. YouTube Connection Health
 *  5. Quota / Budget Recovery
 *  6. Queue Repair
 *  7. Resource Health
 *  8. Core Workers
 *  9. YouTube Safe Workers
 * 10. AI Scheduler
 * 11. Growth Engines
 * 12. Self-Healing Engine
 * 13. Perpetual Operating Loop
 *
 * This orchestrator is wired INTO the existing index.ts wave system — it does
 * NOT replace the waves; it runs ALONGSIDE them in the early boot sequence.
 * The stages here focus on validation, cleanup, and health checks.
 */

import { createLogger } from "./logger";

const log = createLogger("startup-orchestrator");

export type StageStatus = "pending" | "running" | "ok" | "degraded" | "failed";

export interface StageResult {
  ok: boolean;
  degraded?: boolean;
  reason?: string;
  blockers?: string[];
  startedWorkers?: string[];
  deferredJobs?: number;
}

interface StageState {
  name: string;
  status: StageStatus;
  result?: StageResult;
  startedAt?: number;
  completedAt?: number;
}

const _stages: StageState[] = [];
let _currentStage = -1;
let _startedAt: number | null = null;
let _completedAt: number | null = null;

function registerStage(name: string): void {
  _stages.push({ name, status: "pending" });
}

registerStage("environment-validation");
registerStage("database-readiness");
registerStage("account-cleanup");
registerStage("youtube-connection-health");
registerStage("quota-budget-recovery");
registerStage("queue-repair");
registerStage("resource-health");
registerStage("core-workers");
registerStage("youtube-safe-workers");
registerStage("ai-scheduler");
registerStage("growth-engines");
registerStage("self-healing-engine");
registerStage("perpetual-operating-loop");

// ── Stage implementations ──────────────────────────────────────────────────────

async function stage1EnvironmentValidation(): Promise<StageResult> {
  const blockers: string[] = [];

  // Check critical env vars
  if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
    blockers.push("DATABASE_URL not set");
  }

  // Check NODE_ENV
  const env = process.env.NODE_ENV ?? "unknown";
  log.info(`[Stage 1] Environment: ${env}`);

  if (blockers.length > 0) {
    return { ok: false, blockers, reason: "Missing critical environment variables" };
  }

  return { ok: true };
}

async function stage2DatabaseReadiness(): Promise<StageResult> {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: `DB connection failed: ${err?.message}`, degraded: false };
  }
}

async function stage3AccountCleanup(): Promise<StageResult> {
  let deferredJobs = 0;

  // 3a: Kill switch reload
  try {
    const { KillSwitches } = await import("./kill-switches");
    await KillSwitches.reload();
    log.info("[Stage 3] Kill switches loaded");
  } catch (err: any) {
    log.warn(`[Stage 3] Kill switch reload failed: ${err?.message}`);
  }

  // 3b: Purge demo-account jobs
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const DEMO_PATTERNS = ["google_api_demo_reviewer", "dev_bypass_user"];
    const demoList = DEMO_PATTERNS.map(p => `'${p}'`).join(",");

    const tables = ["autopilot_queue", "content_pipeline", "jobs", "youtube_push_backlog"];
    for (const table of tables) {
      try {
        const r = await db.execute(
          sql.raw(`UPDATE "${table}" SET status='skipped', reason='production-account-guard'
                   WHERE user_id IN (${demoList}) AND status NOT IN ('completed','skipped','cancelled')
                   RETURNING id`),
        );
        const count = Array.isArray(r) ? r.length : ((r as any)?.rowCount ?? 0);
        if (count > 0) {
          log.info(`[Stage 3] Skipped ${count} demo-account jobs in ${table}`);
          deferredJobs += count;
        }
      } catch { /* table may not exist */ }
    }

    if (deferredJobs > 0) {
      log.info(`[Stage 3] Account cleanup: skipped ${deferredJobs} total demo-account jobs`);
    }
  } catch (err: any) {
    log.warn(`[Stage 3] Account cleanup error (non-fatal): ${err?.message}`);
  }

  // 3c: Purge non-YouTube jobs
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const tables = ["autopilot_queue", "content_pipeline"];
    let nonYoutube = 0;
    for (const table of tables) {
      try {
        const cols = table === "autopilot_queue" ? "platform" : "platform";
        const r = await db.execute(
          sql.raw(`UPDATE "${table}"
                   SET status='skipped', reason='YouTube-only mode'
                   WHERE ${cols} IS NOT NULL AND ${cols} != 'youtube'
                     AND status NOT IN ('completed','skipped','cancelled')
                   RETURNING id`),
        );
        const count = Array.isArray(r) ? r.length : ((r as any)?.rowCount ?? 0);
        if (count > 0) {
          log.info(`[Stage 3] Skipped ${count} non-YouTube jobs in ${table}`);
          nonYoutube += count;
        }
      } catch { /* table may not have platform column */ }
    }
    if (nonYoutube > 0) {
      log.info(`[Stage 3] Purged ${nonYoutube} non-YouTube jobs (YouTube-only mode)`);
      deferredJobs += nonYoutube;
    }
  } catch (err: any) {
    log.warn(`[Stage 3] Non-YouTube purge error (non-fatal): ${err?.message}`);
  }

  return { ok: true, deferredJobs };
}

async function stage4YouTubeConnectionHealth(): Promise<StageResult> {
  const warnings: string[] = [];

  try {
    const { db } = await import("../db");
    const { channels } = await import("@shared/schema");
    const { isNull, or, and: andOp, eq: eqOp } = await import("drizzle-orm");
    const disconnectedChannels = await db
      .select({ id: channels.id, channelId: channels.channelId })
      .from(channels)
      .where(
        andOp(
          eqOp(channels.platform, "youtube"),
          or(
            isNull(channels.accessToken),
            isNull(channels.refreshToken),
          ),
        ),
      );

    if (disconnectedChannels.length > 0) {
      const ids = disconnectedChannels.map(c => c.id).join(", ");
      warnings.push(`Channels without OAuth tokens: ${ids} — automation paused for these`);
      log.warn(`[Stage 4] ${disconnectedChannels.length} disconnected channel(s): ${ids}`);

      // Mark them needs_reconnect so automation skips them
      try {
        const { eq } = await import("drizzle-orm");
        for (const ch of disconnectedChannels) {
          await db.update(channels).set({ needsReconnect: true }).where(eq(channels.id, ch.id));
        }
      } catch { /* non-fatal — best-effort flag */ }
    }
  } catch (err: any) {
    log.warn(`[Stage 4] YouTube connection check error (non-fatal): ${err?.message}`);
  }

  // Audit token health on boot — recover from backup if null, mark needs_reconnect if unrecoverable
  try {
    const { auditTokensOnBoot } = await import("../services/token-guardian-hardened");
    const reports = await auditTokensOnBoot();
    for (const report of reports) {
      if (report.status === "null_no_backup") {
        log.error(`[Stage 4] ⛔ ${report.channelName}: ${report.action}`);
        warnings.push(`Channel ${report.channelName} needs reconnect: ${report.action}`);
      } else if (report.status === "null_recovered") {
        log.warn(`[Stage 4] ⚠ ${report.channelName}: ${report.action}`);
      } else {
        log.info(`[Stage 4] ${report.channelName}: ${report.status} — ${report.action}`);
      }
    }
  } catch (err: any) {
    log.warn(`[Stage 4] auditTokensOnBoot failed (non-fatal): ${err?.message}`);
  }

  return {
    ok: true,
    degraded: warnings.length > 0,
    reason: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

async function stage5QuotaBudgetRecovery(): Promise<StageResult> {
  try {
    const { isQuotaBreakerTripped } = await import("../services/youtube-quota-tracker");
    const tripped = isQuotaBreakerTripped();
    if (tripped) {
      log.warn("[Stage 5] YouTube quota breaker is active — all API calls deferred until midnight Pacific");
    } else {
      log.info("[Stage 5] YouTube quota breaker: OK");
    }
    return { ok: true, degraded: tripped, reason: tripped ? "Quota breaker active" : undefined };
  } catch {
    return { ok: true };
  }
}

async function stage6QueueRepair(): Promise<StageResult> {
  let repaired = 0;

  // Reset any stuck "running" jobs that are >2 hours old (likely crashed)
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    for (const table of ["autopilot_queue", "content_pipeline", "jobs"]) {
      try {
        const r = await db.execute(
          sql.raw(`UPDATE "${table}"
                   SET status='failed', reason='stuck-reset-on-boot'
                   WHERE status='running'
                     AND updated_at < NOW() - INTERVAL '2 hours'
                   RETURNING id`),
        );
        const count = Array.isArray(r) ? r.length : ((r as any)?.rowCount ?? 0);
        if (count > 0) {
          log.info(`[Stage 6] Reset ${count} stuck jobs in ${table}`);
          repaired += count;
        }
      } catch { /* table may not exist */ }
    }
  } catch (err: any) {
    log.warn(`[Stage 6] Queue repair error (non-fatal): ${err?.message}`);
  }

  return { ok: true, deferredJobs: repaired };
}

async function stage7ResourceHealth(): Promise<StageResult> {
  const { getContainerMemory } = await import("./container-memory");
  const mem = getContainerMemory();
  const usedPct = Math.round(mem.usedRatio * 100);
  log.info(`[Stage 7] Container memory: ${usedPct}% used (${Math.round(mem.usageBytes / 1024 / 1024)}MB / ${Math.round(mem.limitBytes / 1024 / 1024)}MB)`);

  if (mem.usedRatio > 0.90) {
    return { ok: true, degraded: true, reason: `High memory pressure: ${usedPct}%` };
  }

  return { ok: true };
}

// Stages 8–13 are no-ops here (workers are started by the existing wave system in index.ts)
async function stageNoop(name: string): Promise<StageResult> {
  log.info(`[Stage] ${name}: delegated to wave-based startup`);
  return { ok: true };
}

// ── Runner ─────────────────────────────────────────────────────────────────────

const STAGE_FNS: Array<() => Promise<StageResult>> = [
  stage1EnvironmentValidation,
  stage2DatabaseReadiness,
  stage3AccountCleanup,
  stage4YouTubeConnectionHealth,
  stage5QuotaBudgetRecovery,
  stage6QueueRepair,
  stage7ResourceHealth,
  () => stageNoop("core-workers"),
  () => stageNoop("youtube-safe-workers"),
  () => stageNoop("ai-scheduler"),
  () => stageNoop("growth-engines"),
  () => stageNoop("self-healing-engine"),
  () => stageNoop("perpetual-operating-loop"),
];

export const StartupOrchestrator = {
  /**
   * Run all 13 startup stages in order.
   * Non-critical stage failures log a warning and continue.
   * Critical stage failures (stage 1–2) stop the orchestrator.
   */
  async run(): Promise<void> {
    _startedAt = Date.now();
    log.info("[StartupOrchestrator] Starting 13-stage boot sequence");

    for (let i = 0; i < _stages.length; i++) {
      _currentStage = i;
      const stage = _stages[i];
      stage.status = "running";
      stage.startedAt = Date.now();

      log.info(`[StartupOrchestrator] Stage ${i + 1}/${_stages.length}: ${stage.name}`);

      try {
        const result = await STAGE_FNS[i]();
        stage.result = result;
        stage.status = result.ok ? (result.degraded ? "degraded" : "ok") : "failed";
        stage.completedAt = Date.now();

        const elapsed = stage.completedAt - (stage.startedAt ?? stage.completedAt);
        log.info(
          `[StartupOrchestrator] Stage ${i + 1} ${stage.name}: ${stage.status} (${elapsed}ms)` +
          (result.reason ? ` — ${result.reason}` : ""),
        );

        // Critical stages 1 and 2 — failure stops orchestrator
        if (!result.ok && (i === 0 || i === 1)) {
          log.error(
            `[StartupOrchestrator] CRITICAL stage "${stage.name}" failed — ` +
            `HTTP server stays up for health checks; no background workers will start`,
          );
          break;
        }
      } catch (err: any) {
        stage.status = "failed";
        stage.completedAt = Date.now();
        log.error(`[StartupOrchestrator] Stage ${i + 1} "${stage.name}" threw: ${err?.message}`);

        if (i === 0 || i === 1) break;
      }
    }

    _completedAt = Date.now();
    const elapsed = _completedAt - (_startedAt ?? _completedAt);
    log.info(`[StartupOrchestrator] Boot sequence complete in ${elapsed}ms`);
  },

  /**
   * Current status snapshot for the dashboard.
   */
  getStatus() {
    return {
      startedAt:    _startedAt,
      completedAt:  _completedAt,
      currentStage: _currentStage,
      stages:       _stages.map(s => ({
        name:        s.name,
        status:      s.status,
        elapsed:     s.startedAt && s.completedAt ? s.completedAt - s.startedAt : null,
        reason:      s.result?.reason,
        degraded:    s.result?.degraded ?? false,
        deferredJobs: s.result?.deferredJobs ?? 0,
      })),
    };
  },

  /**
   * Returns true if the critical stages (1 + 2) have completed without fatal failure.
   */
  isCriticalBootDone(): boolean {
    return _stages[0]?.status === "ok" && _stages[1]?.status === "ok";
  },
};

export default StartupOrchestrator;
