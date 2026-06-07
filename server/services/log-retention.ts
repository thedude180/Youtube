import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("log-retention");

interface RetentionRule {
  table: string;
  timestampCol: string;
  retentionDays: number;
}

// ── Retention policy: 365-day rolling window for all operational data ─────────
// Keeps a full year of history for every process — quota usage, AI decisions,
// learning signals, audit trails, security events, etc. — so patterns and
// maxout investigations are always resolvable without log reconstruction.
const RETENTION_DAYS = 365;

const RETENTION_RULES: RetentionRule[] = [
  { table: "domain_events",                    timestampCol: "emitted_at",       retentionDays: RETENTION_DAYS },
  { table: "ai_agent_activities",              timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "governance_audit_logs",            timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "competitor_snapshots",             timestampCol: "scanned_at",       retentionDays: RETENTION_DAYS },
  { table: "approval_decisions",               timestampCol: "decided_at",       retentionDays: RETENTION_DAYS },
  { table: "exception_desk_items",             timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "intelligent_jobs",                 timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "webhook_events",                   timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "trust_budget_periods",             timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "learning_signals",                 timestampCol: "emitted_at",       retentionDays: RETENTION_DAYS },
  { table: "team_activity_log",                timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "signed_action_receipts",           timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "signal_contradictions",            timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "performance_benchmarks",           timestampCol: "generated_at",     retentionDays: RETENTION_DAYS },
  { table: "algorithm_health",                 timestampCol: "scanned_at",       retentionDays: RETENTION_DAYS },
  { table: "ai_agent_tasks",                   timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "algorithm_signals",                timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "financial_audit_trail",            timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "compliance_checks",                timestampCol: "checked_at",       retentionDays: RETENTION_DAYS },
  { table: "autonomy_engine_runs",             timestampCol: "started_at",       retentionDays: RETENTION_DAYS },
  { table: "ai_decision_log",                  timestampCol: "applied_at",       retentionDays: RETENTION_DAYS },
  { table: "security_events",                  timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "trust_budget_records",             timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "security_scans",                   timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "system_improvements",              timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "ai_model_routing_logs",            timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "live_command_center_panel_states", timestampCol: "updated_at",       retentionDays: RETENTION_DAYS },
  { table: "media_kits",                       timestampCol: "generated_at",     retentionDays: RETENTION_DAYS },
  { table: "discovered_strategies",            timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "traffic_strategies",               timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  { table: "stream_performance_logs",          timestampCol: "created_at",       retentionDays: RETENTION_DAYS },
  // YouTube quota usage — keeps a full year of daily quota records so maxout
  // patterns, crash-restart correlation, and per-operation breakdowns are always
  // queryable. Uses last_updated_at as the age anchor (rows are updated daily).
  { table: "youtube_quota_usage",              timestampCol: "last_updated_at",  retentionDays: RETENTION_DAYS },
];

const BATCH_SIZE = 1000;

let retentionInterval: ReturnType<typeof setInterval> | null = null;

async function pruneTable(rule: RetentionRule): Promise<number> {
  const cutoff = new Date(Date.now() - rule.retentionDays * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  while (true) {
    const result = await db.execute(sql.raw(
      `DELETE FROM "${rule.table}" WHERE "${rule.timestampCol}" < '${cutoff.toISOString()}' AND ctid IN (SELECT ctid FROM "${rule.table}" WHERE "${rule.timestampCol}" < '${cutoff.toISOString()}' LIMIT ${BATCH_SIZE})`
    ));
    const deleted = (result as any).rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise(r => setTimeout(r, 200));
  }

  return totalDeleted;
}

async function runRetentionSweep(): Promise<void> {
  logger.info("Starting daily log retention sweep");
  const results: { table: string; deleted: number }[] = [];

  for (const rule of RETENTION_RULES) {
    try {
      const deleted = await pruneTable(rule);
      if (deleted > 0) {
        results.push({ table: rule.table, deleted });
      }
    } catch (err: any) {
      logger.warn(`Failed to prune ${rule.table}: ${err.message}`);
    }
  }

  if (results.length > 0) {
    const summary = results.map(r => `${r.table}: ${r.deleted}`).join(", ");
    logger.info(`Retention sweep complete — pruned: ${summary}`);
  } else {
    logger.info("Retention sweep complete — nothing to prune");
  }
}

export function getRetentionRules(): { table: string; retentionDays: number }[] {
  return RETENTION_RULES.map(r => ({ table: r.table, retentionDays: r.retentionDays }));
}

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function initLogRetention(): void {
  if (retentionInterval) return;

  setTimeout(() => {
    runRetentionSweep().catch(err =>
      logger.error(`Initial retention sweep failed: ${err.message}`)
    );
  }, 60_000);

  retentionInterval = setInterval(() => {
    runRetentionSweep().catch(err =>
      logger.error(`Retention sweep failed: ${err.message}`)
    );
  }, RETENTION_INTERVAL_MS);

  logger.info(`Log retention initialized — ${RETENTION_RULES.length} tables monitored, sweep every 24h`);
}

export function stopLogRetention(): void {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
  }
}
