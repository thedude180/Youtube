import { db, withRetry } from "../db";
import { engineHeartbeats } from "@shared/schema";
import { eq, lt, and, notInArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("engine-heartbeat");

const VALID_STATUSES = new Set(["running", "idle", "error", "completed"]);

export async function recordHeartbeat(engineName: string, status: "running" | "idle" | "error" | "completed", durationMs?: number, error?: string): Promise<void> {
  try {
    const existing = await withRetry(() => db.select().from(engineHeartbeats).where(eq(engineHeartbeats.engineName, engineName)).limit(1), "heartbeat-read");
    if (existing.length > 0) {
      await db.update(engineHeartbeats).set({
        status,
        lastRunAt: new Date(),
        lastDurationMs: durationMs ?? existing[0].lastDurationMs,
        failureCount: status === "error" ? (existing[0].failureCount || 0) + 1 : existing[0].failureCount,
        lastError: error ?? (status === "error" ? existing[0].lastError : null),
      }).where(eq(engineHeartbeats.engineName, engineName));
    } else {
      try {
        await db.insert(engineHeartbeats).values({
          engineName,
          status,
          lastRunAt: new Date(),
          lastDurationMs: durationMs,
          failureCount: status === "error" ? 1 : 0,
          lastError: error,
        });
      } catch (insertErr: any) {
        if (insertErr?.code === "23505") {
          await db.update(engineHeartbeats).set({
            status,
            lastRunAt: new Date(),
            lastDurationMs: durationMs,
            failureCount: status === "error" ? 1 : 0,
            lastError: error,
          }).where(eq(engineHeartbeats.engineName, engineName));
        } else {
          throw insertErr;
        }
      }
    }
  } catch (e) {
    logger.error(`[Heartbeat] Failed to record for ${engineName}:`, e);
  }
}

export async function getAllHeartbeats(): Promise<Record<string, { status: string; lastRun?: string; lastDurationMs?: number; failureCount?: number; lastError?: string | null }>> {
  try {
    const beats = await db.select().from(engineHeartbeats);
    const result: Record<string, any> = {};
    for (const b of beats) {
      const status = VALID_STATUSES.has(b.status) ? b.status : "idle";
      result[b.engineName] = {
        status,
        lastRun: b.lastRunAt?.toISOString(),
        lastDurationMs: b.lastDurationMs,
        failureCount: b.failureCount,
        lastError: b.lastError,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function resetStaleEngineErrors(staleAfterMs = 60 * 60 * 1000): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const result = await db.update(engineHeartbeats)
      .set({ status: "idle", failureCount: 0, lastError: null })
      .where(
        and(
          eq(engineHeartbeats.status, "error"),
          lt(engineHeartbeats.lastRunAt, cutoff)
        )
      );
    const fixedCount = (result as any).rowCount ?? 0;
    if (fixedCount > 0) {
      logger.info(`[Heartbeat] Reset ${fixedCount} stale engine error(s) to idle`);
    }
    await db.update(engineHeartbeats)
      .set({ status: "idle" })
      .where(
        and(
          notInArray(engineHeartbeats.status, ["running", "idle", "error", "completed"]),
        )
      );
  } catch (e) {
    logger.warn("[Heartbeat] Could not reset stale engine errors:", e);
  }
}
