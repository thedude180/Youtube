/**
 * Persistent service runtime state store.
 *
 * Replaces in-memory Maps for service operational state that must survive
 * container reboots and deployments.  Examples:
 *   - `_lastCycleAt` maps in the learning brain and back-catalog engine
 *   - `lastRunAt` / `lastFullCycleAt` in the runner and AI orchestrator
 *   - Any "cooldown until" or "last health check" timestamps
 *
 * All writes are FIRE-AND-FORGET via setState() — never throws, never blocks.
 * setStateAsync() is available when the caller needs confirmation.
 * getState() is always async and never throws (returns null on any failure).
 */

import { db }          from "../db";
import { serviceState } from "../../shared/schema";
import { eq, and }      from "drizzle-orm";

// ── getState ──────────────────────────────────────────────────────────────────
// Read the persisted value for (service, key).  Returns null if not found or on
// any DB error.  Never throws.
export async function getState<T = Record<string, unknown>>(
  service: string,
  key:     string,
): Promise<T | null> {
  try {
    const rows = await db
      .select({ value: serviceState.value })
      .from(serviceState)
      .where(and(eq(serviceState.service, service), eq(serviceState.key, key)))
      .limit(1);
    return (rows[0]?.value as T) ?? null;
  } catch {
    return null;
  }
}

// ── setState ──────────────────────────────────────────────────────────────────
// Upsert (service, key) → value.  Fire-and-forget: returns immediately, the DB
// write happens on the next event-loop tick via setImmediate.  Never throws.
export function setState(service: string, key: string, value: Record<string, unknown>): void {
  setImmediate(async () => {
    try {
      await db
        .insert(serviceState)
        .values({ service, key, value })
        .onConflictDoUpdate({
          target: [serviceState.service, serviceState.key],
          set:    { value, updatedAt: new Date() },
        });
    } catch {
      // Silent — a dropped state write must never surface to callers.
    }
  });
}

// ── setStateAsync ─────────────────────────────────────────────────────────────
// Awaitable variant — use when the caller needs the write to be confirmed
// before proceeding (e.g. at the end of a daily cycle).  Never throws.
export async function setStateAsync(
  service: string,
  key:     string,
  value:   Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .insert(serviceState)
      .values({ service, key, value })
      .onConflictDoUpdate({
        target: [serviceState.service, serviceState.key],
        set:    { value, updatedAt: new Date() },
      });
  } catch {
    // Silent.
  }
}
