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

// ── Migration 003: fix fake game names + force re-optimization ────────────────
// Many back_catalog_videos rows have AI-hallucinated game_name values like
// "AI PS5", "AI gaming", "EPIC fast-paced action", or "ETGaming247".  Some
// have NULL.  This migration:
//   1. Detects the real game from the video title using regex patterns.
//   2. Normalises variant spellings ("ac valhalla" → "Assassin's Creed Valhalla").
//   3. Resets last_optimized_at + bumps metadata_opportunity_score to 20 for
//      every affected row so the existing-video-optimizer re-runs promptly.
// Safe to run in production — pure UPDATE, no schema changes.

async function migration003FixFakeGameNames(): Promise<void> {
  const FLAG = "migration:003:fix_fake_game_names_v2";
  if (await getFlag(FLAG)) {
    log.info("[Migration 003] Fake game-name fix already done — skipping");
    return;
  }

  try {
    // Step A: Detect real game from title for rows with NULL / fake game_names.
    // Uses PostgreSQL CASE WHEN so the entire fix is one round-trip.
    const fixResult = await db.execute(sql`
      UPDATE back_catalog_videos
      SET
        game_name = CASE
          WHEN title ~* 'assassin''?s creed shadows|ac shadows'               THEN 'Assassin''s Creed Shadows'
          WHEN title ~* 'valhalla'                                             THEN 'Assassin''s Creed Valhalla'
          WHEN title ~* 'assassin''?s creed iv|black flag'                    THEN 'Assassin''s Creed IV: Black Flag'
          WHEN title ~* 'adéwalé|adewale'                                     THEN 'Assassin''s Creed IV: Black Flag'
          WHEN title ~* 'assassin''?s creed origins'                          THEN 'Assassin''s Creed Origins'
          WHEN title ~* 'assassin''?s creed odyssey'                          THEN 'Assassin''s Creed Odyssey'
          WHEN title ~* 'assassin''?s creed'                                  THEN 'Assassin''s Creed'
          WHEN title ~* 'shadow of mordor'                                    THEN 'Middle-earth: Shadow of Mordor'
          WHEN title ~* 'shadow of war|nemesis phase'                         THEN 'Middle-earth: Shadow of War'
          WHEN title ~* 'ratchet|ratchet.{0,5}clank'                         THEN 'Ratchet & Clank'
          WHEN title ~* 'space marine 2|space marine'                         THEN 'Warhammer 40,000: Space Marine 2'
          WHEN title ~* 'dragon age'                                          THEN 'Dragon Age: The Veilguard'
          WHEN title ~* 'battlefield 6|bf6'                                   THEN 'Battlefield 6'
          WHEN title ~* 'battlefield 2042|bf2042'                             THEN 'Battlefield 2042'
          WHEN title ~* 'battlefield v|battlefield 5|bf5'                     THEN 'Battlefield V'
          WHEN title ~* 'battlefield'                                         THEN 'Battlefield 6'
          WHEN title ~* 'samurai.{0,40}stealth|stealth.{0,40}samurai'        THEN 'Assassin''s Creed Shadows'
          WHEN title ~* 'parkour.{0,30}stealth|stealth.{0,30}parkour'        THEN 'Assassin''s Creed'
          WHEN title ~* 'elden ring'                                          THEN 'Elden Ring'
          WHEN title ~* 'god of war'                                          THEN 'God of War'
          ELSE game_name
        END,
        metadata_opportunity_score = 20,
        last_optimized_at          = NULL
      WHERE (
        game_name IS NULL
        OR game_name = ''
        OR lower(game_name) LIKE 'ai ps5%'
        OR lower(game_name) LIKE 'ai gaming%'
        OR lower(game_name) LIKE 'ai action%'
        OR lower(game_name) LIKE 'ai combat%'
        OR lower(game_name) LIKE 'epic%'
        OR lower(game_name) LIKE 'etgaming%'
        OR lower(game_name) LIKE '%ps5%'
        OR lower(game_name) LIKE '%4k%'
        OR lower(game_name) LIKE '%educational%'
        OR lower(game_name) LIKE '%fast-paced%'
        OR lower(game_name) LIKE '%highlights%'
        OR lower(game_name) LIKE '%sequences%'
        OR lower(game_name) LIKE '%techniques%'
        OR lower(game_name) LIKE '%chaos%'
        OR lower(game_name) LIKE '%cinematic%'
        OR lower(game_name) LIKE '%boss fights%'
        OR lower(game_name) LIKE '%player ps5%'
      )
    `);

    const fixedRows = (fixResult as any)?.rowCount ?? (fixResult as any)?.count ?? "?";
    log.info(`[Migration 003] Cleared ${fixedRows} fake/null game_name rows + reset their optimization flags`);

    // Step B: Normalise variant spellings of legitimate game names.
    const normResult = await db.execute(sql`
      UPDATE back_catalog_videos
      SET
        game_name = CASE
          WHEN lower(game_name) IN ('ac valhalla', 'assassins creed valhalla')  THEN 'Assassin''s Creed Valhalla'
          WHEN lower(game_name) IN ('assassins creed', 'assassin')              THEN 'Assassin''s Creed'
          WHEN lower(game_name) IN ('ac4 black flag')                            THEN 'Assassin''s Creed IV: Black Flag'
          WHEN lower(game_name) IN ('ac shadows ps5 gameplay')                   THEN 'Assassin''s Creed Shadows'
          WHEN lower(game_name) IN ('bright lord dlc')                           THEN 'Middle-earth: Shadow of War'
          WHEN lower(game_name) IN ('bioware dragon age')                        THEN 'Dragon Age: The Veilguard'
          WHEN lower(game_name) IN ('battlefield')                               THEN 'Battlefield 6'
          ELSE game_name
        END,
        metadata_opportunity_score = GREATEST(COALESCE(metadata_opportunity_score, 0), 10),
        last_optimized_at          = NULL
      WHERE lower(game_name) IN (
        'ac valhalla', 'assassins creed valhalla', 'assassins creed', 'assassin',
        'ac4 black flag', 'ac shadows ps5 gameplay', 'bright lord dlc',
        'bioware dragon age', 'battlefield'
      )
    `);

    const normRows = (normResult as any)?.rowCount ?? (normResult as any)?.count ?? "?";
    log.info(`[Migration 003] Normalised ${normRows} variant game name spellings`);

    await setFlag(FLAG);
    log.info("[Migration 003] Complete");
  } catch (err: any) {
    log.warn(`[Migration 003] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 004: Purge google_api_demo_reviewer phantom user ────────────────
// This demo account was auto-created by Google OAuth review tooling and leaked
// into production.  It is listed in PHANTOM_USER_IDS but its DB rows still
// cause spurious growth-flywheel cycles.  Delete all rows bound to it once.
const FLAG_004 = "migration_004_purge_demo_reviewer_done";

async function migration004PurgeDemoReviewer(): Promise<void> {
  if (await getFlag(FLAG_004)) return;

  try {
    log.info("[Migration 004] Purging google_api_demo_reviewer phantom user rows");

    const DEMO_ID = "google_api_demo_reviewer";

    // Users table first, then any FK-dependent tables cascade or are cleaned up.
    const tables = [
      "agent_activities",
      "videos",
      "channels",
      "platform_channels",
      "content_queue",
      "content_vault_backups",
      "ai_content_suggestions",
      "users",
    ];

    let total = 0;
    for (const table of tables) {
      try {
        const r = await db.execute(sql.raw(`DELETE FROM "${table}" WHERE user_id = '${DEMO_ID}'`));
        const count = (r as any)?.rowCount ?? 0;
        if (count > 0) {
          log.info(`[Migration 004]  → deleted ${count} row(s) from ${table}`);
          total += count;
        }
      } catch {
        // Table may not have user_id or may not exist — skip silently.
      }
    }

    log.info(`[Migration 004] Complete — ${total} total rows purged`);
    await setFlag(FLAG_004);
  } catch (err: any) {
    log.warn(`[Migration 004] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runStartupMigrations(): Promise<void> {
  try {
    await migration001SetFocusGame();
    await migration002Bf6QueueReorder();
    await migration003FixFakeGameNames();
    await migration004PurgeDemoReviewer();
  } catch (err: any) {
    log.warn(`[StartupMigrations] Unexpected error (non-fatal): ${err?.message}`);
  }
}
