/**
 * Persistent cross-deployment event log.
 *
 * Every significant system action (publishes, heals, AI decisions, migrations,
 * quota events, learning cycles) is written to `system_event_log` in the DB so
 * the learning brain can query it across all past deployments and boots.
 *
 * All writes are FIRE-AND-FORGET — logEvent() never throws, never awaits, and
 * never blocks the calling service.  A silently-dropped write is always better
 * than a blocked or crashed service.
 */

import { db } from "../db";
import { systemEventLog } from "../../shared/schema";

export type EventType =
  | "publish"       // Short or long-form uploaded to YouTube
  | "heal"          // prod-heal / self-healing system action
  | "decision"      // AI orchestrator strategic decision
  | "migration"     // startup migration ran
  | "quota"         // quota trip, budget warning, or reset
  | "error"         // service-level error worth tracking
  | "learn"         // learning brain cycle or insight generation
  | "engine_cycle"  // periodic autonomous engine cycle summary
  | "system";       // general system-level event

export type EventSeverity = "debug" | "info" | "warn" | "error" | "critical";

export interface EventPayload {
  eventType: EventType;
  service:   string;
  title:     string;
  detail?:   Record<string, unknown>;
  userId?:   string;
  severity?: EventSeverity;
}

// ── logEvent ──────────────────────────────────────────────────────────────────
// Fire-and-forget write to system_event_log.  Returns immediately; the DB
// insert happens on the next event-loop tick via setImmediate.
// Safe to call from any service at any time — never throws.
export function logEvent(payload: EventPayload): void {
  setImmediate(async () => {
    try {
      await db.insert(systemEventLog).values({
        eventType:  payload.eventType,
        service:    payload.service,
        title:      payload.title.slice(0, 500),
        detail:     payload.detail ?? null,
        userId:     payload.userId ?? null,
        severity:   payload.severity ?? "info",
      });
    } catch {
      // Silent — a dropped event log write must never surface to callers.
    }
  });
}

// ── logEventAsync ─────────────────────────────────────────────────────────────
// Awaitable variant for the rare case where caller needs confirmation the write
// landed (e.g. brain cycle completion).  Still never throws.
export async function logEventAsync(payload: EventPayload): Promise<void> {
  try {
    await db.insert(systemEventLog).values({
      eventType:  payload.eventType,
      service:    payload.service,
      title:      payload.title.slice(0, 500),
      detail:     payload.detail ?? null,
      userId:     payload.userId ?? null,
      severity:   payload.severity ?? "info",
    });
  } catch {
    // Silent.
  }
}

// ── logServiceCycle ───────────────────────────────────────────────────────────
// Fire-and-forget cycle-summary write.  Call once at the end of any autonomous
// engine's main loop iteration to record throughput stats in the event log.
export interface ServiceCycleStats {
  processed?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  keyInsight?: string;
  [key: string]: unknown;
}

export function logServiceCycle(
  engineName: string,
  userId: string | null,
  stats: ServiceCycleStats,
): void {
  const parts: string[] = [`[${engineName}]`];
  if (stats.processed !== undefined) parts.push(`processed=${stats.processed}`);
  if (stats.succeeded !== undefined) parts.push(`ok=${stats.succeeded}`);
  if (stats.failed   !== undefined) parts.push(`fail=${stats.failed}`);
  if (stats.skipped  !== undefined) parts.push(`skip=${stats.skipped}`);
  if (stats.keyInsight) parts.push(`— ${stats.keyInsight}`);
  logEvent({
    eventType: "engine_cycle",
    service:   engineName,
    title:     parts.join(" ").slice(0, 500),
    detail:    stats as Record<string, unknown>,
    userId:    userId ?? undefined,
    severity:  (stats.failed ?? 0) > 0 ? "warn" : "info",
  });
}

// ── pruneOldEvents ────────────────────────────────────────────────────────────
// Deletes events older than retentionDays (default 90).  Called by the learning
// brain's daily cycle — keeps the table from growing unbounded while preserving
// a full 90-day rolling window for pattern detection.
export async function pruneOldEvents(retentionDays = 90): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const result = await db.execute(
      // Using raw SQL to avoid importing sql tag here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import("drizzle-orm")).sql`
        DELETE FROM system_event_log WHERE occurred_at < ${cutoff}
      `,
    );
    return (result as any)?.rowCount ?? 0;
  } catch {
    return 0;
  }
}
