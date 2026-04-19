import { db } from "../db";
import { cronLocks } from "@shared/schema";
import { eq, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { createLogger } from "./logger";

const logger = createLogger("cron-lock");
const INSTANCE_ID = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface HeartbeatConfig {
  expectedIntervalMs: number;
  registeredAt: number;
}

const heartbeatRegistry = new Map<string, HeartbeatConfig>();
const heartbeatExceptionTracker = new Map<string, number>();

export function registerCronHeartbeat(jobName: string, expectedIntervalMs: number): void {
  heartbeatRegistry.set(jobName, { expectedIntervalMs, registeredAt: Date.now() });
}

export function getRegisteredHeartbeats(): Map<string, HeartbeatConfig> {
  return new Map(heartbeatRegistry);
}

export async function checkCronHeartbeats(): Promise<Array<{
  jobName: string;
  status: "healthy" | "missed" | "overdue" | "never_run";
  expectedIntervalMs: number;
  lastCompletedAt: Date | null;
  msSinceLastRun: number | null;
  deadlineMultiplier: number;
}>> {
  const results: Array<{
    jobName: string;
    status: "healthy" | "missed" | "overdue" | "never_run";
    expectedIntervalMs: number;
    lastCompletedAt: Date | null;
    msSinceLastRun: number | null;
    deadlineMultiplier: number;
  }> = [];

  if (heartbeatRegistry.size === 0) return results;

  const locks = await db.select().from(cronLocks);
  const lockMap = new Map(locks.map(l => [l.jobName, l]));
  const now = Date.now();

  for (const [jobName, config] of heartbeatRegistry) {
    const lock = lockMap.get(jobName);
    const deadline = config.expectedIntervalMs * 1.5;

    if (!lock || !lock.lastCompletedAt) {
      const timeSinceRegistration = now - config.registeredAt;
      if (timeSinceRegistration > deadline) {
        results.push({
          jobName,
          status: "never_run",
          expectedIntervalMs: config.expectedIntervalMs,
          lastCompletedAt: null,
          msSinceLastRun: null,
          deadlineMultiplier: 1.5,
        });
      } else {
        results.push({
          jobName,
          status: "healthy",
          expectedIntervalMs: config.expectedIntervalMs,
          lastCompletedAt: null,
          msSinceLastRun: null,
          deadlineMultiplier: 1.5,
        });
      }
      continue;
    }

    const msSinceLastRun = now - lock.lastCompletedAt.getTime();

    if (msSinceLastRun > deadline * 2) {
      results.push({
        jobName,
        status: "overdue",
        expectedIntervalMs: config.expectedIntervalMs,
        lastCompletedAt: lock.lastCompletedAt,
        msSinceLastRun,
        deadlineMultiplier: 1.5,
      });
    } else if (msSinceLastRun > deadline) {
      results.push({
        jobName,
        status: "missed",
        expectedIntervalMs: config.expectedIntervalMs,
        lastCompletedAt: lock.lastCompletedAt,
        msSinceLastRun,
        deadlineMultiplier: 1.5,
      });
    } else {
      results.push({
        jobName,
        status: "healthy",
        expectedIntervalMs: config.expectedIntervalMs,
        lastCompletedAt: lock.lastCompletedAt,
        msSinceLastRun,
        deadlineMultiplier: 1.5,
      });
    }
  }

  return results;
}

export async function runHeartbeatCheck(): Promise<{
  checked: number;
  healthy: number;
  missed: number;
  overdue: number;
  neverRun: number;
  exceptionsCreated: number;
}> {
  const heartbeats = await checkCronHeartbeats();
  let exceptionsCreated = 0;

  const unhealthy = heartbeats.filter(h => h.status === "missed" || h.status === "overdue" || h.status === "never_run");
  const healthy = heartbeats.filter(h => h.status === "healthy");

  for (const h of healthy) {
    heartbeatExceptionTracker.delete(h.jobName);
  }

  const DEDUPE_COOLDOWN_MS = 30 * 60_000;

  for (const h of unhealthy) {
    const lastAlerted = heartbeatExceptionTracker.get(h.jobName);
    if (lastAlerted && Date.now() - lastAlerted < DEDUPE_COOLDOWN_MS) {
      continue;
    }

    try {
      const { createException } = await import("../services/exception-desk");
      await createException({
        severity: h.status === "overdue" ? "high" : "medium",
        category: "system_health",
        source: "cron_heartbeat_monitor",
        sourceId: `cron:${h.jobName}`,
        title: `Cron Heartbeat ${h.status}: ${h.jobName}`,
        description: h.status === "never_run"
          ? `Cron job "${h.jobName}" has never completed since registration (expected every ${Math.round(h.expectedIntervalMs / 1000)}s)`
          : `Cron job "${h.jobName}" last ran ${Math.round((h.msSinceLastRun || 0) / 1000)}s ago (expected every ${Math.round(h.expectedIntervalMs / 1000)}s)`,
        metadata: {
          jobName: h.jobName,
          status: h.status,
          expectedIntervalMs: h.expectedIntervalMs,
          msSinceLastRun: h.msSinceLastRun,
          lastCompletedAt: h.lastCompletedAt?.toISOString() || null,
        },
      });
      heartbeatExceptionTracker.set(h.jobName, Date.now());
      exceptionsCreated++;
    } catch {}
  }

  return {
    checked: heartbeats.length,
    healthy: heartbeats.filter(h => h.status === "healthy").length,
    missed: heartbeats.filter(h => h.status === "missed").length,
    overdue: heartbeats.filter(h => h.status === "overdue").length,
    neverRun: heartbeats.filter(h => h.status === "never_run").length,
    exceptionsCreated,
  };
}

export function getCronHealthReport(): {
  registeredJobs: number;
  heartbeats: Array<{ jobName: string; expectedIntervalMs: number; registeredAt: number }>;
} {
  const heartbeats = Array.from(heartbeatRegistry.entries()).map(([jobName, config]) => ({
    jobName,
    expectedIntervalMs: config.expectedIntervalMs,
    registeredAt: config.registeredAt,
  }));
  return { registeredJobs: heartbeatRegistry.size, heartbeats };
}

export async function withCronLock(
  jobName: string,
  ttlMs: number,
  fn: () => Promise<void>,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const start = Date.now();

  try {
    const result = await db.execute(sql`
      INSERT INTO cron_locks (job_name, locked_by, locked_at, expires_at)
      VALUES (${jobName}, ${INSTANCE_ID}, NOW(), ${expiresAt})
      ON CONFLICT (job_name)
      DO UPDATE SET
        locked_by = ${INSTANCE_ID},
        locked_at = NOW(),
        expires_at = ${expiresAt}
      WHERE cron_locks.expires_at < NOW()
      RETURNING id
    `);

    if (!result.rowCount || result.rowCount === 0) {
      return false;
    }

    let lastError: string | null = null;
    try {
      await fn();
    } catch (err: any) {
      lastError = err?.message?.substring(0, 500) || "Unknown error";
      throw err;
    } finally {
      const duration = Date.now() - start;
      await db.update(cronLocks)
        .set({
          expiresAt: new Date(0),
          lastCompletedAt: new Date(),
          lastDurationMs: duration,
          executionCount: sql`COALESCE(execution_count, 0) + 1`,
          lastError,
        })
        .where(eq(cronLocks.jobName, jobName))
        .catch(e => logger.warn(`[CronLock] Failed to release lock for ${jobName}`, e?.message));
    }

    return true;
  } catch (err: any) {
    if (err?.message?.includes("cron_locks") || err?.code === "23505") {
      return false;
    }
    logger.error(`[CronLock] Unexpected error acquiring lock for ${jobName}:`, err?.message);
    return false;
  }
}

export async function getCronLockStatus(): Promise<Array<{
  jobName: string;
  lockedBy: string;
  lockedAt: Date | null;
  expiresAt: Date;
  lastCompletedAt: Date | null;
  lastDurationMs: number | null;
  executionCount: number | null;
  lastError: string | null;
  isLocked: boolean;
}>> {
  const locks = await db.select().from(cronLocks);
  const now = new Date();
  return locks.map(lock => ({
    jobName: lock.jobName,
    lockedBy: lock.lockedBy,
    lockedAt: lock.lockedAt,
    expiresAt: lock.expiresAt,
    lastCompletedAt: lock.lastCompletedAt,
    lastDurationMs: lock.lastDurationMs,
    executionCount: lock.executionCount,
    lastError: lock.lastError,
    isLocked: lock.expiresAt > now,
  }));
}
