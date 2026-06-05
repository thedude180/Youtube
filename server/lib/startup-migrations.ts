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

// ── Migration 005: deduplicate capability_gaps ────────────────────────────────

async function migration005DeduplicateCapabilityGaps(): Promise<void> {
  const FLAG = "migration:005:capability_gaps_deduped";
  if (await getFlag(FLAG)) return;

  try {
    // For each (user_id, title) pair keep only the row with the best
    // lastAttemptAt (most recent non-null, or else most recent createdAt).
    // All other duplicate rows are deleted.
    const result = await db.execute(sql`
      DELETE FROM capability_gaps
      WHERE id NOT IN (
        SELECT DISTINCT ON (user_id, title) id
        FROM capability_gaps
        ORDER BY
          user_id,
          title,
          last_attempt_at DESC NULLS LAST,
          created_at DESC NULLS LAST
      )
    `);
    const deleted = (result as any)?.rowCount ?? 0;
    log.info(`[Migration 005] Deduped capability_gaps — deleted ${deleted} duplicate row(s)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 005] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 006: seed viral_optimizer_hourly_tokens default ────────────────
// Seeds system_settings key "viral_optimizer_hourly_tokens" = "8000" if not
// already present.  The token-hourly-cap module reads this at runtime so the
// viral-optimizer hourly budget can be changed without a code deploy.

async function migration006SeedViralOptimizerCap(): Promise<void> {
  const FLAG = "migration:006:viral_optimizer_hourly_tokens_seeded";
  if (await getFlag(FLAG)) return;

  try {
    const [existing] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "viral_optimizer_hourly_tokens"))
      .limit(1);

    if (!existing) {
      await setFlag("viral_optimizer_hourly_tokens", "8000");
      log.info("[Migration 006] Seeded viral_optimizer_hourly_tokens = 8000");
    } else {
      log.info(`[Migration 006] viral_optimizer_hourly_tokens already set to "${existing.value}" — skipping`);
    }

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 006] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 007: seed hourly_cap:<module> defaults for high-volume modules ──
// Seeds system_settings keys using the new "hourly_cap:<module>" pattern for
// the three highest-volume modules (content-grinder, shorts-pipeline,
// thumbnail-intelligence) and the viral-optimizer (previously seeded under a
// legacy key).  All values match the HOURLY_CAPS compile-time constants so
// operators can tune them via system_settings without a code deploy.

async function migration007SeedModuleHourlyCaps(): Promise<void> {
  const FLAG = "migration:007:module_hourly_caps_seeded";
  if (await getFlag(FLAG)) return;

  const defaults: Array<{ key: string; value: string; label: string }> = [
    { key: "hourly_cap:content-grinder",        value: "50000", label: "content-grinder" },
    { key: "hourly_cap:shorts-pipeline",         value: "12000", label: "shorts-pipeline" },
    { key: "hourly_cap:thumbnail-intelligence",  value: "6000",  label: "thumbnail-intelligence" },
    { key: "hourly_cap:viral-optimizer",         value: "8000",  label: "viral-optimizer" },
  ];

  try {
    for (const { key, value, label } of defaults) {
      const [existing] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      if (!existing) {
        await setFlag(key, value);
        log.info(`[Migration 007] Seeded ${key} = ${value}`);
      } else {
        log.info(`[Migration 007] ${label} cap already set to "${existing.value}" — skipping`);
      }
    }

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 007] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 008: seed hourly_cap:<module> defaults for all remaining engines ─
// Extends migration 007 to cover every engine listed in HOURLY_CAPS that was
// not seeded previously.  Values match the compile-time fallbacks so existing
// behaviour is preserved while allowing DB-level overrides going forward.

async function migration008SeedAllEngineHourlyCaps(): Promise<void> {
  const FLAG = "migration:008:all_engine_hourly_caps_seeded";
  if (await getFlag(FLAG)) return;

  const defaults: Array<{ key: string; value: string }> = [
    { key: "hourly_cap:repurpose-engine",        value: "8000" },
    { key: "hourly_cap:vod-seo-optimizer",        value: "6000" },
    { key: "hourly_cap:infinite-evolution",       value: "4000" },
    { key: "hourly_cap:knowledge-mesh",           value: "3000" },
    { key: "hourly_cap:self-improvement-engine",  value: "3000" },
    { key: "hourly_cap:autonomous-capability",    value: "4000" },
    { key: "hourly_cap:memory-architect",         value: "3000" },
    { key: "hourly_cap:business-agents",          value: "2000" },
    { key: "hourly_cap:legal-tax-agents",         value: "2000" },
    { key: "hourly_cap:team-orchestration",       value: "3000" },
    { key: "hourly_cap:growth-flywheel",          value: "3000" },
    { key: "hourly_cap:consistency-agent",        value: "3000" },
    { key: "hourly_cap:default",                  value: "5000" },
  ];

  try {
    for (const { key, value } of defaults) {
      const [existing] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      if (!existing) {
        await setFlag(key, value);
        log.info(`[Migration 008] Seeded ${key} = ${value}`);
      } else {
        log.info(`[Migration 008] ${key} already set to "${existing.value}" — skipping`);
      }
    }

    await setFlag(FLAG);
    log.info("[Migration 008] Complete");
  } catch (err: any) {
    log.warn(`[Migration 008] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 009: schema-history-fixes ──────────────────────────────────────
// Adds new columns to autopilot_queue, channels, dead_letter_queue;
// creates security_ip_allowlist table with trusted IP seed data.
// All DDL uses IF NOT EXISTS — fully idempotent.

async function migration009SchemaHistoryFixes(): Promise<void> {
  const FLAG = "migration:009:schema_history_fixes";
  if (await getFlag(FLAG)) return;

  try {
    // ── autopilot_queue additions ─────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE autopilot_queue
        ADD COLUMN IF NOT EXISTS miss_count              INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS recovered_at            TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS escalated_at            TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deferred_until          TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS platform                TEXT,
        ADD COLUMN IF NOT EXISTS source                  TEXT,
        ADD COLUMN IF NOT EXISTS original_queue_item_id  INTEGER,
        ADD COLUMN IF NOT EXISTS dead_letter_id          INTEGER,
        ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ
    `);
    log.info("[Migration 009] autopilot_queue columns added");

    // ── channels additions ────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE channels
        ADD COLUMN IF NOT EXISTS access_token_backup   TEXT,
        ADD COLUMN IF NOT EXISTS refresh_token_backup  TEXT,
        ADD COLUMN IF NOT EXISTS token_expires_backup  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS token_backed_up_at    TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS needs_reconnect        BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS reconnect_reason       TEXT,
        ADD COLUMN IF NOT EXISTS token_recovery_note    TEXT,
        ADD COLUMN IF NOT EXISTS last_token_refresh     TIMESTAMPTZ
    `);
    log.info("[Migration 009] channels columns added");

    // ── dead_letter_queue additions ───────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE dead_letter_queue
        ADD COLUMN IF NOT EXISTS content_type            TEXT,
        ADD COLUMN IF NOT EXISTS platform                TEXT,
        ADD COLUMN IF NOT EXISTS original_queue_item_id  INTEGER,
        ADD COLUMN IF NOT EXISTS requeue_count           INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expired_at              TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS requeued_at             TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS error_message           TEXT,
        ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ
    `);
    log.info("[Migration 009] dead_letter_queue columns added");

    // ── security_ip_allowlist table ───────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS security_ip_allowlist (
        id          SERIAL PRIMARY KEY,
        ip_prefix   TEXT NOT NULL UNIQUE,
        description TEXT,
        added_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO security_ip_allowlist (ip_prefix, description) VALUES
        ('35.191.',   'Google Cloud Load Balancer health checks'),
        ('130.211.',  'Google Cloud Load Balancer health checks'),
        ('209.85.',   'Google crawlers'),
        ('66.249.',   'Googlebot'),
        ('127.',      'localhost'),
        ('10.',       'Private network RFC 1918'),
        ('192.168.',  'Private network RFC 1918'),
        ('::1',       'IPv6 localhost')
      ON CONFLICT (ip_prefix) DO NOTHING
    `);
    log.info("[Migration 009] security_ip_allowlist created and seeded");

    await setFlag(FLAG);
    log.info("[Migration 009] Complete");
  } catch (err: any) {
    log.warn(`[Migration 009] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 010: purge permanently-dead video IDs ──────────────────────────
// Inserts known-bad/seed video IDs into content_vault_backups as 'failed' so
// clip-video-processor pre-loads them on boot and never attempts yt-dlp again.
// Also hard-fails any autopilot_queue / back_catalog_videos rows referencing them.

const DEAD_VIDEO_IDS = [
  "_jSoYBa4D_4", // dev seed video — unreachable, caused yt-dlp flood in prod
];

async function migration010PurgeBadVideoIds(): Promise<void> {
  const FLAG = "migration:010:purge_bad_video_ids";
  if (await getFlag(FLAG)) return;

  try {
    for (const youtubeId of DEAD_VIDEO_IDS) {
      // 1) Upsert into content_vault_backups so clip-video-processor boot-skips it
      await db.execute(sql`
        INSERT INTO content_vault_backups (user_id, youtube_id, platform, content_type, status, download_error, created_at)
        VALUES ('system', ${youtubeId}, 'youtube', 'video', 'failed',
                ${"Permanently purged by migration010 — dev seed video, unreachable"}, NOW())
        ON CONFLICT (youtube_id) DO UPDATE
          SET status         = 'failed',
              download_error = EXCLUDED.download_error
          WHERE content_vault_backups.status != 'downloaded'
      `);

      // 2) Hard-fail any autopilot_queue rows that reference this video in payload
      await db.execute(sql`
        UPDATE autopilot_queue
        SET status        = 'permanent_fail',
            error_message = ${"Purged by migration010: dead seed video " + youtubeId},
            updated_at    = NOW()
        WHERE status NOT IN ('published', 'permanent_fail')
          AND (
            payload::text ILIKE ${"%" + youtubeId + "%"}
            OR content::text ILIKE ${"%" + youtubeId + "%"}
          )
      `);

      // 3) Mark back_catalog_videos row as excluded (won't be re-queued)
      await db.execute(sql`
        UPDATE back_catalog_videos
        SET processing_status = 'excluded',
            exclusion_reason  = ${"migration010: dead seed video"},
            updated_at        = NOW()
        WHERE youtube_id = ${youtubeId}
          AND processing_status != 'excluded'
      `);

      log.info(`[Migration 010] Purged dead video: ${youtubeId}`);
    }

    await setFlag(FLAG);
    log.info("[Migration 010] Complete");
  } catch (err: any) {
    log.warn(`[Migration 010] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 011: full purge of google_api_demo_reviewer ────────────────────
// Migration 004 set its flag and won't re-run, but the account regrew or had
// rows in tables added after 004 ran.  This migration queries information_schema
// to find every table in the public schema that has a user_id column and deletes
// ALL rows bound to this phantom user, then deletes the users row itself.

async function migration011PurgeDemoReviewerFull(): Promise<void> {
  const FLAG = "migration:011:purge_demo_reviewer_full";
  if (await getFlag(FLAG)) return;

  const DEMO_ID = "google_api_demo_reviewer";

  try {
    log.info("[Migration 011] Full purge of google_api_demo_reviewer starting");

    // 1) Find every table in the public schema that has a user_id column
    const tablesResult = await db.execute<{ table_name: string }>(sql`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name  = 'user_id'
      ORDER BY table_name
    `);

    let total = 0;
    for (const row of tablesResult.rows) {
      const t = row.table_name;
      try {
        const r = await db.execute(
          sql.raw(`DELETE FROM "${t}" WHERE user_id = '${DEMO_ID}'`),
        );
        const n = (r as any)?.rowCount ?? 0;
        if (n > 0) {
          log.info(`[Migration 011]  → deleted ${n} row(s) from ${t}`);
          total += n;
        }
      } catch {
        // Table may have FK constraints or no matching rows — skip silently
      }
    }

    // 2) Delete users row (keyed on id, not user_id)
    try {
      const r = await db.execute(
        sql.raw(`DELETE FROM users WHERE id = '${DEMO_ID}'`),
      );
      const n = (r as any)?.rowCount ?? 0;
      if (n > 0) {
        log.info(`[Migration 011]  → deleted ${n} row(s) from users`);
        total += n;
      }
    } catch { /* users may not exist */ }

    // 3) Delete any channels whose youtube_channel_id is the demo placeholder
    try {
      const r = await db.execute(sql`
        DELETE FROM channels
        WHERE channel_id ILIKE 'UCdemo%'
           OR channel_id ILIKE 'UCtest%'
           OR channel_id = 'UC_test123'
      `);
      const n = (r as any)?.rowCount ?? 0;
      if (n > 0) {
        log.info(`[Migration 011]  → deleted ${n} placeholder channel row(s)`);
        total += n;
      }
    } catch { /* non-fatal */ }

    log.info(`[Migration 011] Complete — ${total} total rows purged`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 011] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration flag registry ───────────────────────────────────────────────────
// Every migration that sets a completion flag must be listed here.
// verifyAllMigrationFlags() compares this list against system_settings after
// all migrations have run so silently-stuck migrations are caught on every boot.

const EXPECTED_MIGRATION_FLAGS: ReadonlyArray<{ flag: string; label: string }> = [
  { flag: "migration:001:focus_game_set",                   label: "001 — set focus game" },
  { flag: "migration:002:bf6_queue_reorder",                label: "002 — BF6 queue reorder" },
  { flag: "migration:003:fix_fake_game_names_v2",           label: "003 — fix fake game names" },
  { flag: "migration_004_purge_demo_reviewer_done",         label: "004 — purge demo reviewer" },
  { flag: "migration:005:capability_gaps_deduped",          label: "005 — deduplicate capability gaps" },
  { flag: "migration:006:viral_optimizer_hourly_tokens_seeded", label: "006 — seed viral optimizer cap" },
  { flag: "migration:007:module_hourly_caps_seeded",        label: "007 — seed module hourly caps" },
  { flag: "migration:008:all_engine_hourly_caps_seeded",    label: "008 — seed all engine hourly caps" },
  { flag: "migration:009:schema_history_fixes",             label: "009 — schema history fixes (autopilot_queue, channels, dlq, security_ip_allowlist)" },
  { flag: "migration:010:purge_bad_video_ids",              label: "010 — purge permanently-dead video IDs from all queue tables" },
  { flag: "migration:011:purge_demo_reviewer_full",         label: "011 — full purge of google_api_demo_reviewer across all tables" },
];

export interface MigrationHealth {
  checkedAt: string;
  total: number;
  confirmed: number;
  missing: Array<{ flag: string; label: string }>;
  allConfirmed: boolean;
}

let _migrationHealth: MigrationHealth | null = null;

/** Returns the last migration health snapshot recorded at boot (or null if not yet run). */
export function getMigrationHealth(): MigrationHealth | null {
  return _migrationHealth;
}

async function verifyAllMigrationFlags(): Promise<void> {
  try {
    const keys = EXPECTED_MIGRATION_FLAGS.map(e => e.flag);
    const rows = await db
      .select({ key: systemSettings.key })
      .from(systemSettings)
      .where(sql`${systemSettings.key} = ANY(ARRAY[${sql.join(keys.map(k => sql`${k}`), sql`, `)}])`);

    const foundKeys = new Set(rows.map(r => r.key));
    const missing = EXPECTED_MIGRATION_FLAGS.filter(e => !foundKeys.has(e.flag));

    _migrationHealth = {
      checkedAt: new Date().toISOString(),
      total: EXPECTED_MIGRATION_FLAGS.length,
      confirmed: EXPECTED_MIGRATION_FLAGS.length - missing.length,
      missing,
      allConfirmed: missing.length === 0,
    };

    if (missing.length === 0) {
      log.info(`[StartupMigrations] All ${EXPECTED_MIGRATION_FLAGS.length} migration flags confirmed ✓`);
    } else {
      log.warn(
        `[StartupMigrations] WARNING: ${missing.length} migration flag(s) did not set their flag — ` +
        `check logs: ${missing.map(e => e.label).join(", ")}`
      );
    }
  } catch (err: any) {
    log.warn(`[StartupMigrations] verifyAllMigrationFlags failed (non-fatal): ${err?.message}`);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runStartupMigrations(): Promise<void> {
  try {
    await migration001SetFocusGame();
    await migration002Bf6QueueReorder();
    await migration003FixFakeGameNames();
    await migration004PurgeDemoReviewer();
    await migration005DeduplicateCapabilityGaps();
    await migration006SeedViralOptimizerCap();
    await migration007SeedModuleHourlyCaps();
    await migration008SeedAllEngineHourlyCaps();
    await migration009SchemaHistoryFixes();
    await migration010PurgeBadVideoIds();
    await migration011PurgeDemoReviewerFull();
    await verifyAllMigrationFlags();
  } catch (err: any) {
    log.warn(`[StartupMigrations] Unexpected error (non-fatal): ${err?.message}`);
  }
}
