import { db } from "../db";
import { cronLocks } from "@shared/schema";
import { eq, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";

const INSTANCE_ID = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
        .catch(e => console.warn(`[CronLock] Failed to release lock for ${jobName}`, e?.message));
    }

    return true;
  } catch (err: any) {
    if (err?.message?.includes("cron_locks") || err?.code === "23505") {
      return false;
    }
    console.error(`[CronLock] Unexpected error acquiring lock for ${jobName}:`, err?.message);
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
