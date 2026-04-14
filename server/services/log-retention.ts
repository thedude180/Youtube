import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("log-retention");

interface RetentionRule {
  table: string;
  timestampCol: string;
  retentionDays: number;
}

const RETENTION_RULES: RetentionRule[] = [
  { table: "domain_events",               timestampCol: "emitted_at",   retentionDays: 14 },
  { table: "ai_agent_activities",          timestampCol: "created_at",   retentionDays: 30 },
  { table: "governance_audit_logs",        timestampCol: "created_at",   retentionDays: 30 },
  { table: "competitor_snapshots",         timestampCol: "scanned_at",   retentionDays: 14 },
  { table: "approval_decisions",           timestampCol: "decided_at",   retentionDays: 30 },
  { table: "exception_desk_items",         timestampCol: "created_at",   retentionDays: 30 },
  { table: "intelligent_jobs",             timestampCol: "created_at",   retentionDays: 14 },
  { table: "webhook_events",              timestampCol: "created_at",   retentionDays: 14 },
  { table: "trust_budget_periods",         timestampCol: "created_at",   retentionDays: 30 },
  { table: "learning_signals",            timestampCol: "emitted_at",   retentionDays: 30 },
  { table: "team_activity_log",           timestampCol: "created_at",   retentionDays: 30 },
  { table: "signed_action_receipts",      timestampCol: "created_at",   retentionDays: 30 },
  { table: "signal_contradictions",       timestampCol: "created_at",   retentionDays: 14 },
  { table: "performance_benchmarks",      timestampCol: "generated_at", retentionDays: 30 },
  { table: "algorithm_health",            timestampCol: "scanned_at",   retentionDays: 14 },
  { table: "ai_agent_tasks",              timestampCol: "created_at",   retentionDays: 30 },
  { table: "algorithm_signals",           timestampCol: "created_at",   retentionDays: 14 },
  { table: "financial_audit_trail",       timestampCol: "created_at",   retentionDays: 90 },
  { table: "compliance_checks",           timestampCol: "checked_at",   retentionDays: 60 },
  { table: "autonomy_engine_runs",        timestampCol: "started_at",   retentionDays: 14 },
  { table: "ai_decision_log",            timestampCol: "applied_at",   retentionDays: 30 },
  { table: "security_events",            timestampCol: "created_at",   retentionDays: 60 },
  { table: "trust_budget_records",        timestampCol: "created_at",   retentionDays: 30 },
  { table: "security_scans",             timestampCol: "created_at",   retentionDays: 30 },
  { table: "system_improvements",         timestampCol: "created_at",   retentionDays: 30 },
  { table: "ai_model_routing_logs",       timestampCol: "created_at",   retentionDays: 14 },
  { table: "live_command_center_panel_states", timestampCol: "updated_at", retentionDays: 7 },
  { table: "media_kits",                  timestampCol: "generated_at", retentionDays: 30 },
  { table: "discovered_strategies",       timestampCol: "created_at",   retentionDays: 30 },
  { table: "traffic_strategies",          timestampCol: "created_at",   retentionDays: 30 },
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
