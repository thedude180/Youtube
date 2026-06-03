/**
 * startup-migrations.ts
 *
 * One-time data migrations that run on every server boot but only execute once,
 * guarded by a system_settings flag.  Safe to include in production startup —
 * if the flag already exists the migration body is skipped in < 1 ms.
 */

import { db } from "../db";
import { autopilotQueue, systemSettings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "./logger";

const log = createLogger("startup-migrations");

// ── helpers ───────────────────────────────────────────────────────────────────

async function getFlag(key: string): Promise<boolean> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return row?.value === "true";
}

async function setFlag(key: string, value = "true"): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

// ── Migration 001: set default focus game ────────────────────────────────────

async function migration001SetFocusGame(): Promise<void> {
  const FLAG = "migration:001:focus_game_set";
  if (await getFlag(FLAG)) return;

  try {
    const [existing] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "game_focus:current"))
      .limit(1);

    if (!existing) {
      await setFlag("game_focus:current", "Battlefield 6");
      log.info("[Migration 001] Set game_focus:current = Battlefield 6");
    } else {
      log.info(`[Migration 001] game_focus:current already set to "${existing.value}" — skipping`);
    }

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 001] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 002: BF6-first queue reorder ───────────────────────────────────
// Reassigns scheduled_at timestamps so all BF6 autopilot_queue items occupy
// the earliest available slots, pushing all other games to later dates.
// Runs at most once per deployment (guarded by migration flag).

async function migration002Bf6QueueReorder(): Promise<void> {
  const FLAG = "migration:002:bf6_queue_reorder";
  if (await getFlag(FLAG)) {
    log.info("[Migration 002] BF6 queue reorder already done — skipping");
    return;
  }

  try {
    // Count items first
    const [totRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(eq(autopilotQueue.status, "scheduled"));
    const total = totRow?.cnt ?? 0;
    if (total === 0) {
      log.info("[Migration 002] No scheduled items — nothing to reorder");
      await setFlag(FLAG);
      return;
    }

    const result = await db.execute(sql`
      WITH
        all_slots AS (
          SELECT id, scheduled_at,
                 ROW_NUMBER() OVER (ORDER BY scheduled_at ASC) AS rn
          FROM autopilot_queue
          WHERE status = 'scheduled'
        ),
        bf6_items AS (
          SELECT id,
                 ROW_NUMBER() OVER (ORDER BY scheduled_at ASC) AS rn
          FROM autopilot_queue
          WHERE status = 'scheduled'
            AND (content ILIKE '%battlefield 6%' OR content ILIKE '%bf6%'
                 OR caption ILIKE '%battlefield 6%' OR caption ILIKE '%bf6%')
        ),
        non_bf6_items AS (
          SELECT id,
                 ROW_NUMBER() OVER (ORDER BY scheduled_at ASC) AS rn
          FROM autopilot_queue
          WHERE status = 'scheduled'
            AND NOT (content ILIKE '%battlefield 6%' OR content ILIKE '%bf6%'
                     OR caption ILIKE '%battlefield 6%' OR caption ILIKE '%bf6%')
        ),
        bf6_count AS (SELECT COUNT(*) AS cnt FROM bf6_items),
        bf6_assignments AS (
          SELECT b.id, s.scheduled_at AS new_sat
          FROM bf6_items b
          JOIN all_slots s ON s.rn = b.rn
        ),
        non_bf6_assignments AS (
          SELECT n.id, s.scheduled_at AS new_sat
          FROM non_bf6_items n
          CROSS JOIN bf6_count
          JOIN all_slots s ON s.rn = bf6_count.cnt + n.rn
        ),
        combined AS (
          SELECT * FROM bf6_assignments
          UNION ALL
          SELECT * FROM non_bf6_assignments
        )
      UPDATE autopilot_queue q
      SET scheduled_at = c.new_sat
      FROM combined c
      WHERE q.id = c.id
    `);

    const updated = (result as any)?.rowCount ?? (result as any)?.count ?? "?";
    log.info(`[Migration 002] BF6-first queue reorder complete — updated ${updated} rows (${total} total scheduled)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 002] BF6 queue reorder failed (non-fatal): ${err?.message}`);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runStartupMigrations(): Promise<void> {
  try {
    await migration001SetFocusGame();
    await migration002Bf6QueueReorder();
  } catch (err: any) {
    log.warn(`[StartupMigrations] Unexpected error (non-fatal): ${err?.message}`);
  }
}
