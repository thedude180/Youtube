import { db } from "../db";
import { engineHeartbeats } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function recordHeartbeat(engineName: string, status: "running" | "idle" | "error" | "completed", durationMs?: number, error?: string): Promise<void> {
  try {
    const existing = await db.select().from(engineHeartbeats).where(eq(engineHeartbeats.engineName, engineName)).limit(1);
    if (existing.length > 0) {
      await db.update(engineHeartbeats).set({
        status,
        lastRunAt: new Date(),
        lastDurationMs: durationMs ?? existing[0].lastDurationMs,
        failureCount: status === "error" ? (existing[0].failureCount || 0) + 1 : existing[0].failureCount,
        lastError: error ?? (status === "error" ? existing[0].lastError : null),
      }).where(eq(engineHeartbeats.engineName, engineName));
    } else {
      await db.insert(engineHeartbeats).values({
        engineName,
        status,
        lastRunAt: new Date(),
        lastDurationMs: durationMs,
        failureCount: status === "error" ? 1 : 0,
        lastError: error,
      });
    }
  } catch (e) {
    console.error(`[Heartbeat] Failed to record for ${engineName}:`, e);
  }
}

export async function getAllHeartbeats(): Promise<Record<string, { status: string; lastRun?: string; lastDurationMs?: number; failureCount?: number; lastError?: string | null }>> {
  try {
    const beats = await db.select().from(engineHeartbeats);
    const result: Record<string, any> = {};
    for (const b of beats) {
      result[b.engineName] = {
        status: b.status,
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
