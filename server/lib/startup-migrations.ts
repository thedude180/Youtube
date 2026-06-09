/**
 * startup-migrations.ts
 *
 * One-time data migrations that run on every server boot but only execute once,
 * guarded by a system_settings flag.  Safe to include in production startup —
 * if the flag already exists the migration body is skipped in < 1 ms.
 */

import { db } from "../db";
import { autopilotQueue, systemSettings } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createLogger } from "./logger";
import { storage } from "../storage";

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
      // 1) Upsert into content_vault_backups so clip-video-processor boot-skips it.
      //    content_vault_backups.youtube_id has no unique constraint — use SELECT + conditional INSERT/UPDATE.
      const existingVault = await db.execute(sql`
        SELECT id FROM content_vault_backups WHERE youtube_id = ${youtubeId} LIMIT 1
      `);
      if (existingVault.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO content_vault_backups (user_id, youtube_id, platform, content_type, status, download_error, created_at)
          VALUES ('system', ${youtubeId}, 'youtube', 'video', 'failed',
                  ${"Permanently purged by migration010 — dev seed video, unreachable"}, NOW())
        `);
      } else {
        await db.execute(sql`
          UPDATE content_vault_backups
          SET status         = 'failed',
              download_error = ${"Permanently purged by migration010 — dev seed video, unreachable"}
          WHERE youtube_id = ${youtubeId}
            AND status != 'downloaded'
        `);
      }

      // 2) Hard-fail any autopilot_queue rows that reference this video.
      // autopilot_queue has no `payload` column — search `content` (text) and `metadata` (jsonb).
      await db.execute(sql`
        UPDATE autopilot_queue
        SET status        = 'permanent_fail',
            error_message = ${"Purged by migration010: dead seed video " + youtubeId},
            updated_at    = NOW()
        WHERE status NOT IN ('published', 'permanent_fail')
          AND (
            content::text  ILIKE ${"%" + youtubeId + "%"}
            OR metadata::text ILIKE ${"%" + youtubeId + "%"}
          )
      `);

      // 3) Touch back_catalog_videos updated_at so it is re-evaluated next scan.
      //    (processing_status / exclusion_reason columns do not exist on this table;
      //     steps 1+2 above already prevent re-queueing via vault 'failed' status.)
      await db.execute(sql`
        UPDATE back_catalog_videos
        SET updated_at = NOW()
        WHERE youtube_video_id = ${youtubeId}
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

// ── Migration 012: delete stale placeholder channels ─────────────────────────
// Migration 011 deleted channels with UCdemo*/UCtest* IDs but its flag may have
// been set before new placeholder channels were added.  This migration re-runs
// the same cleanup unconditionally on the channels table and marks itself done.

async function migration012DeletePlaceholderChannels(): Promise<void> {
  const FLAG = "migration:012:delete_placeholder_channels";
  if (await getFlag(FLAG)) return;

  try {
    // Delete channels whose channel_id is a known dev placeholder pattern
    // (real YouTube IDs are always "UC" + exactly 22 base64 chars = 24 chars total)
    // Use individual try/catch per channel so FK constraints on real rows that
    // accidentally match the pattern don't prevent the flag from being set.
    const candidates = await db.execute(sql`
      SELECT id FROM channels
      WHERE (
        channel_id ILIKE 'UCdemo%'
        OR channel_id ILIKE 'UCtest%'
        OR channel_id = 'UC_test123'
        OR (channel_id LIKE 'UC%' AND LENGTH(channel_id) < 24)
      )
        AND (access_token IS NULL OR access_token = '')
        AND (refresh_token IS NULL OR refresh_token = '')
    `);
    let deleted = 0;
    for (const row of (candidates as any).rows ?? []) {
      try {
        await db.execute(sql`DELETE FROM channels WHERE id = ${row.id}`);
        deleted++;
      } catch {
        // FK constraint or other per-row error — skip this channel, not fatal
      }
    }
    log.info(`[Migration 012] Deleted ${deleted} placeholder/stub channel row(s)`);
  } catch (err: any) {
    log.warn(`[Migration 012] Could not query placeholder channels (non-fatal): ${err?.message}`);
  }
  // Always set the flag — in production there are no real dev/test channels.
  // Re-running this DELETE every boot just adds noise without benefit.
  await setFlag(FLAG);
  log.info("[Migration 012] Complete");
}

// ── Migration 013: Re-audit back catalog game names ───────────────────────────
// Fixes misclassified source videos (e.g. AC3 footage tagged as Battlefield 6)
// and upgrades generic "Assassin's Creed" labels to specific sub-titles where
// the video title contains enough signal.  Resets mined_for_shorts /
// mined_for_long_form for every row that gets a corrected game_name so the back
// catalog engine re-queues those videos under the right label.

async function migration013GameNameReaudit(): Promise<void> {
  const FLAG = "migration:013:game_name_reaudit_v1";
  if (await getFlag(FLAG)) {
    log.info("[Migration 013] Game-name re-audit already done — skipping");
    return;
  }

  try {
    // Step A — Force-correct known misclassified videos where title/description
    // say the wrong game but the footage is confirmed to be different.
    const knownBad: Array<{ youtubeVideoId: string; correctGame: string; reason: string }> = [
      {
        youtubeVideoId: "3NKTCjsIgAY",
        correctGame: "Assassin's Creed 3",
        reason: "footage is AC3 (confirmed screenshot 2026-06-06); title says BF6 due to AI generation error",
      },
    ];

    let forcedCount = 0;
    for (const { youtubeVideoId, correctGame } of knownBad) {
      const r = await db.execute(sql`
        UPDATE back_catalog_videos
        SET
          game_name          = ${correctGame},
          mined_for_shorts   = false,
          mined_for_long_form = false,
          last_optimized_at  = NULL
        WHERE youtube_video_id = ${youtubeVideoId}
          AND game_name != ${correctGame}
      `);
      const n = (r as any)?.rowCount ?? 0;
      if (n > 0) {
        forcedCount += n;
        log.info(`[Migration 013] Force-corrected ${youtubeVideoId} → "${correctGame}"`);
      }
    }
    log.info(`[Migration 013] Step A: ${forcedCount} known-bad video(s) corrected`);

    // Step B — Upgrade generic or incorrect game_names using improved title regex
    // (all specific AC sub-titles that were missing from the original detector).
    // Only updates rows where the new detection differs from the current value.
    const upgradeResult = await db.execute(sql`
      UPDATE back_catalog_videos
      SET
        game_name = CASE
          WHEN title ~* 'assassin.?s creed iii|assassin.?s creed 3\b|ac3\b|connor kenway'
               THEN 'Assassin''s Creed 3'
          WHEN title ~* 'liberation|aveline\b'
               THEN 'Assassin''s Creed Liberation'
          WHEN title ~* 'assassin.?s creed mirage|ac mirage|basim ibn'
               THEN 'Assassin''s Creed Mirage'
          WHEN title ~* 'assassin.?s creed syndicate|ac syndicate|jacob frye|evie frye'
               THEN 'Assassin''s Creed Syndicate'
          WHEN title ~* 'assassin.?s creed unity|ac unity|arno dorian'
               THEN 'Assassin''s Creed Unity'
          WHEN title ~* 'assassin.?s creed rogue|ac rogue|shay cormac'
               THEN 'Assassin''s Creed Rogue'
          WHEN title ~* 'assassin.?s creed brotherhood|ac brotherhood'
               THEN 'Assassin''s Creed Brotherhood'
          WHEN title ~* 'assassin.?s creed revelations|ac revelations'
               THEN 'Assassin''s Creed Revelations'
          ELSE game_name
        END,
        mined_for_shorts    = false,
        mined_for_long_form = false,
        last_optimized_at   = NULL
      WHERE (
        (title ~* 'assassin.?s creed iii|assassin.?s creed 3\b|ac3\b|connor kenway'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed 3')))
        OR (title ~* 'liberation|aveline\b'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Liberation')))
        OR (title ~* 'assassin.?s creed mirage|ac mirage|basim ibn'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Mirage')))
        OR (title ~* 'assassin.?s creed syndicate|ac syndicate|jacob frye|evie frye'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Syndicate')))
        OR (title ~* 'assassin.?s creed unity|ac unity|arno dorian'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Unity')))
        OR (title ~* 'assassin.?s creed rogue|ac rogue|shay cormac'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Rogue')))
        OR (title ~* 'assassin.?s creed brotherhood|ac brotherhood'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Brotherhood')))
        OR (title ~* 'assassin.?s creed revelations|ac revelations'
         AND (game_name IS NULL OR game_name NOT IN ('Assassin''s Creed Revelations')))
      )
    `);

    const upgraded = (upgradeResult as any)?.rowCount ?? 0;
    log.info(`[Migration 013] Step B: ${upgraded} generic game_name(s) upgraded to specific sub-title`);

    // Step C — Normalise variant spellings of the new sub-title names.
    const normResult = await db.execute(sql`
      UPDATE back_catalog_videos
      SET game_name = CASE
        WHEN lower(game_name) IN ('ac3', 'assassins creed 3', 'assassins creed iii')
             THEN 'Assassin''s Creed 3'
        WHEN lower(game_name) IN ('assassins creed liberation', 'ac liberation')
             THEN 'Assassin''s Creed Liberation'
        WHEN lower(game_name) IN ('assassins creed mirage', 'ac mirage')
             THEN 'Assassin''s Creed Mirage'
        WHEN lower(game_name) IN ('assassins creed syndicate', 'ac syndicate')
             THEN 'Assassin''s Creed Syndicate'
        WHEN lower(game_name) IN ('assassins creed unity', 'ac unity')
             THEN 'Assassin''s Creed Unity'
        WHEN lower(game_name) IN ('assassins creed rogue', 'ac rogue')
             THEN 'Assassin''s Creed Rogue'
        WHEN lower(game_name) IN ('assassins creed brotherhood', 'ac brotherhood')
             THEN 'Assassin''s Creed Brotherhood'
        WHEN lower(game_name) IN ('assassins creed revelations', 'ac revelations')
             THEN 'Assassin''s Creed Revelations'
        ELSE game_name
      END
      WHERE lower(game_name) IN (
        'ac3','assassins creed 3','assassins creed iii',
        'assassins creed liberation','ac liberation',
        'assassins creed mirage','ac mirage',
        'assassins creed syndicate','ac syndicate',
        'assassins creed unity','ac unity',
        'assassins creed rogue','ac rogue',
        'assassins creed brotherhood','ac brotherhood',
        'assassins creed revelations','ac revelations'
      )
    `);
    const normed = (normResult as any)?.rowCount ?? 0;
    log.info(`[Migration 013] Step C: ${normed} variant spelling(s) normalised`);

    await setFlag(FLAG);
    log.info("[Migration 013] Complete");
  } catch (err: any) {
    log.warn(`[Migration 013] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 014: cancel queue items referencing permanently-blocked videos ──

async function migration014CancelBlockedSourceVideos(): Promise<void> {
  const FLAG = "migration:014:cancel_blocked_source_videos";
  if (await getFlag(FLAG)) return;

  try {
    // s0D2BLHmiTU consistently times out at 480 s on every yt-dlp download
    // attempt. 21+ pending/scheduled queue items reference it as sourceYoutubeId,
    // causing the publisher to spin-lock retrying an undownloadable video.
    // Permanently fail all such items so they stop blocking the queue.
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'permanent_fail',
          error_message = 'Cancelled by migration 014: source video s0D2BLHmiTU permanently inaccessible (480 s yt-dlp timeout on every attempt)'
      WHERE metadata->>'sourceYoutubeId' = 's0D2BLHmiTU'
        AND status NOT IN ('published', 'permanent_fail', 'cancelled')
    `);
    const rows = (result as any)?.rowCount ?? "?";
    log.info(`[Migration014] Cancelled ${rows} queue item(s) referencing s0D2BLHmiTU`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration014] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 015: purge all non-YouTube queue items ─────────────────────────
// Cross-posting is disabled. Wipe every pending/scheduled item that targets a
// platform other than YouTube or YouTube Shorts so they never get picked up.

async function migration015PurgeNonYoutubeQueueItems(): Promise<void> {
  const FLAG = "migration:015:purge_non_youtube_queue_items";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'permanent_fail',
          error_message = 'Cancelled by migration 015: cross-posting disabled — non-YouTube platform'
      WHERE target_platform NOT IN ('youtube', 'youtubeshorts')
        AND status NOT IN ('published', 'permanent_fail', 'cancelled')
    `);
    const rows = (result as any)?.rowCount ?? "?";
    log.info(`[Migration015] Cancelled ${rows} non-YouTube queue item(s)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration015] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 016: create error knowledge base tables ────────────────────────
// Creates error_events and error_resolutions tables if they don't exist yet.
// error_events: rolling 365-day log of every classified error occurrence.
// error_resolutions: permanent institutional memory — never purged, grows forever.
// Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every boot when not
// yet flagged (and then self-flags once both tables exist).

async function migration016CreateErrorKnowledgeBase(): Promise<void> {
  const FLAG = "migration:016:error_knowledge_base_tables";
  if (await getFlag(FLAG)) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS error_events (
        id             SERIAL PRIMARY KEY,
        fingerprint    TEXT NOT NULL,
        occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        module         TEXT NOT NULL,
        error_code     TEXT NOT NULL,
        severity       TEXT NOT NULL,
        message        TEXT NOT NULL,
        stack_sample   TEXT,
        context        JSONB DEFAULT '{}',
        classification JSONB DEFAULT '{}',
        action_taken   TEXT,
        resolved       BOOLEAN DEFAULT false
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ee_fingerprint_idx ON error_events (fingerprint)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ee_occurred_idx ON error_events (occurred_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ee_module_idx ON error_events (module)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ee_code_idx ON error_events (error_code)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ee_severity_idx ON error_events (severity)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS error_resolutions (
        id                SERIAL PRIMARY KEY,
        fingerprint       TEXT NOT NULL,
        error_code        TEXT NOT NULL,
        module            TEXT NOT NULL,
        first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        occurrence_count  INTEGER NOT NULL DEFAULT 1,
        resolved_count    INTEGER NOT NULL DEFAULT 0,
        resolution_type   TEXT,
        resolution_notes  TEXT,
        successful_action TEXT,
        confidence        REAL NOT NULL DEFAULT 0.0,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS er_fingerprint_uniq ON error_resolutions (fingerprint)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS er_code_idx ON error_resolutions (error_code)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS er_module_idx ON error_resolutions (module)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS er_confidence_idx ON error_resolutions (confidence)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS er_last_seen_idx ON error_resolutions (last_seen_at)
    `);

    log.info("[Migration016] error_events + error_resolutions tables created ✓");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration016] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Boot cleanup: reset stuck pending items ───────────────────────────────────
// Runs on EVERY boot (no flag guard) — safe because no publishers are running
// at T+3s when migrations fire.  Resets all items stuck in "pending" status
// back to "scheduled" so the publisher can pick them up again.
//
// Why items get stuck:
//   • Download / encode timed out mid-batch
//   • Server crashed or OOM-killed while processing
//   • Publisher crashed before the DB update that marks the item done/failed
//
// The publisher has reschedule-past-due logic: any item whose scheduledAt is
// in the past will be bumped to the next valid future slot automatically,
// so this reset cannot cause a burst of simultaneous uploads.

async function cleanupStuckPendingItems(): Promise<void> {
  try {
    const result = await db
      .update(autopilotQueue)
      .set({
        status: "scheduled",
        errorMessage: "Reset from stuck pending on boot — will retry",
      } as any)
      .where(and(
        eq(autopilotQueue.status, "pending"),
        // Only reset YouTube-targeted items — non-YouTube items are permanently
        // cancelled by migration 015 and must not be re-activated on every boot.
        inArray(autopilotQueue.targetPlatform, ["youtube", "youtubeshorts"]),
      ));

    // Drizzle returns rowCount on pg driver
    const count = (result as any)?.rowCount ?? (result as any)?.length ?? "?";
    if (typeof count === "number" && count > 0) {
      log.info(`[BootCleanup] Reset ${count} stuck pending item(s) → scheduled`);
    } else {
      log.info("[BootCleanup] No stuck pending items found");
    }
  } catch (err: any) {
    log.warn(`[BootCleanup] Could not reset stuck pending items (non-fatal): ${err?.message}`);
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
  { flag: "migration:012:delete_placeholder_channels",      label: "012 — delete stale placeholder/dev channel rows" },
  { flag: "migration:013:game_name_reaudit_v1",             label: "013 — re-audit back catalog game names; correct misclassified AC/BF videos" },
  { flag: "migration:014:cancel_blocked_source_videos",     label: "014 — cancel queue items referencing permanently-blocked source video s0D2BLHmiTU" },
  { flag: "migration:015:purge_non_youtube_queue_items",    label: "015 — purge all non-YouTube pending/scheduled queue items (cross-posting disabled)" },
  { flag: "migration:016:error_knowledge_base_tables",      label: "016 — create error_events + error_resolutions knowledge base tables" },
  { flag: "migration:017:purge_stale_youtube_channels",     label: "017 — purge stale youtube/youtubeshorts channels with no token" },
  { flag: "migration:018:recascade_stale_youtube_channels", label: "018 — re-cascade delete stale channels via storage.deleteChannel()" },
  { flag: "migration:019:fail_deadlocked_queue_items",      label: "019 — fail queue items whose vault source is permanently undownloadable" },
  { flag: "migration_020_cancel_ai_team_tasks",              label: "020 — cancel stale AI team tasks blocking queue" },
  { flag: "migration:021:fail_sWCir3U6m_U",                 label: "021 — permanently fail vault entry for sWCir3U6m_U" },
  { flag: "migration:022:fail_oNGsg4mqxT8",                 label: "022 — permanently fail vault entry for oNGsg4mqxT8 (yt-dlp storm)" },
  { flag: "migration:024:fix_vault_sweep_updated_at",       label: "024 — re-run vault sweep after fixing updated_at column bug in 022/023" },
  { flag: "migration:025:fail_Q0pj8SN6WyU",                label: "025 — permanently fail vault entry for Q0pj8SN6WyU (2-hour event loop stall)" },
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

// ── Migration 017: purge stale youtube/youtubeshorts channels ─────────────────
// After each OAuth reconnect a new channel row can be created while old ones
// with needs_reconnect=true are left behind.  This migration deletes every
// youtube / youtubeshorts channel that has NO access_token, keeping only the
// live connected row per user.  Future reconnects are handled in-code by
// handleCallback in youtube.ts.

async function migration017PurgeStaleYoutubeChannels(): Promise<void> {
  const FLAG = "migration:017:purge_stale_youtube_channels";
  if (await getFlag(FLAG)) return;

  try {
    // For each user, identify the best (highest-id, has token) youtube and
    // youtubeshorts channel, then delete all others that have no access_token.
    const staleRows = await db.execute(sql`
      SELECT id, user_id, platform
      FROM channels
      WHERE platform IN ('youtube', 'youtubeshorts')
        AND (access_token IS NULL OR access_token = '')
    `);

    let deleted = 0;
    for (const row of (staleRows as any).rows ?? []) {
      try {
        // Safety: make sure the user still has at least one connected channel
        // on this platform before deleting.
        const remaining = await db.execute(sql`
          SELECT COUNT(*) AS cnt
          FROM channels
          WHERE user_id  = ${row.user_id}
            AND platform = ${row.platform}
            AND access_token IS NOT NULL
            AND access_token != ''
        `);
        const cnt = Number((remaining as any).rows?.[0]?.cnt ?? 0);
        if (cnt === 0) {
          // No connected replacement exists — leave this row alone.
          continue;
        }
        // Use storage.deleteChannel() — it performs the full FK cascade in the
        // correct order.  A raw "DELETE FROM channels WHERE id=?" would fail
        // silently here because autopilot_queue, back_catalog_videos, and other
        // tables have FK references to channels.id.
        await storage.deleteChannel(Number(row.id));
        deleted++;
        log.info(`[Migration 017] Deleted stale channel id=${row.id} platform=${row.platform}`);
      } catch (err: any) {
        log.warn(`[Migration 017] Could not delete channel id=${row.id}: ${err?.message?.slice(0, 100)}`);
      }
    }
    log.info(`[Migration 017] Complete — removed ${deleted} stale channel row(s)`);
  } catch (err: any) {
    log.warn(`[Migration 017] Failed (non-fatal): ${err?.message}`);
  }
  await setFlag(FLAG);
}

// ── Migration 018: re-run stale channel cleanup with proper cascade delete ────
// Migration 017 set its flag even though the raw SQL DELETE silently failed
// (FK constraints from autopilot_queue, back_catalog_videos, etc.).  This
// migration re-runs the same logic but uses storage.deleteChannel() which
// handles the full FK cascade in the correct order.

async function migration018RecascadeStaleYoutubeChannels(): Promise<void> {
  const FLAG = "migration:018:recascade_stale_youtube_channels";
  if (await getFlag(FLAG)) return;

  try {
    const staleRows = await db.execute(sql`
      SELECT id, user_id, platform
      FROM channels
      WHERE platform IN ('youtube', 'youtubeshorts')
        AND (access_token IS NULL OR access_token = '')
    `);

    let deleted = 0;
    for (const row of (staleRows as any).rows ?? []) {
      try {
        const remaining = await db.execute(sql`
          SELECT COUNT(*) AS cnt
          FROM channels
          WHERE user_id  = ${row.user_id}
            AND platform = ${row.platform}
            AND access_token IS NOT NULL
            AND access_token != ''
        `);
        const cnt = Number((remaining as any).rows?.[0]?.cnt ?? 0);
        if (cnt === 0) continue;

        await storage.deleteChannel(Number(row.id));
        deleted++;
        log.info(`[Migration 018] Deleted stale channel id=${row.id} platform=${row.platform}`);
      } catch (err: any) {
        log.warn(`[Migration 018] Could not delete channel id=${row.id}: ${err?.message?.slice(0, 100)}`);
      }
    }
    log.info(`[Migration 018] Complete — removed ${deleted} stale channel row(s)`);
  } catch (err: any) {
    log.warn(`[Migration 018] Failed (non-fatal): ${err?.message}`);
  }
  await setFlag(FLAG);
}

// ── Migration 019: fail queue items whose vault source is permanently failed ───
// Items referencing a source video with vault status="failed" + failCount >= 3
// will never publish — they loop forever consuming publisher slots.  Mark them
// "failed" on boot so the publisher can move on to healthy items.

async function migration019FailDeadlockedQueueItems(): Promise<void> {
  const FLAG = "migration:019:fail_deadlocked_queue_items";
  if (await getFlag(FLAG)) return;

  try {
    // Find autopilot_queue rows that are "scheduled" and reference a vault
    // entry that has already permanently failed (failCount >= 3).
    const result = await db.execute(sql`
      UPDATE autopilot_queue q
      SET    status        = 'failed',
             error_message = 'Source video permanently undownloadable — vault exhausted all download clients after 3+ attempts (migration 019)',
             updated_at    = NOW()
      WHERE  q.status = 'scheduled'
        AND  q.metadata->>'sourceYoutubeId' IS NOT NULL
        AND  EXISTS (
               SELECT 1
               FROM   content_vault_backups v
               WHERE  v.youtube_id = q.metadata->>'sourceYoutubeId'
                 AND  v.status     = 'failed'
                 AND  COALESCE((v.metadata->>'failCount')::int, 0) >= 3
             )
    `);
    const affected = (result as any).rowCount ?? 0;
    log.info(`[Migration 019] Permanently failed ${affected} deadlocked queue item(s)`);
  } catch (err: any) {
    log.warn(`[Migration 019] Failed (non-fatal): ${err?.message}`);
  }
  await setFlag(FLAG);
}

// ── Migration 020: Cancel leftover ai-team-engine tasks ───────────────────────
// ai-team-scheduler is permanently disabled (multi-platform business ops, not
// YouTube learning). Pre-existing pending/queued/running tasks in ai_agent_tasks
// were still executing from before the disable, burning AI queue slots.
// One-time flagged purge: mark all active tasks as cancelled on next boot.
async function migration020CancelAiTeamTasks(): Promise<void> {
  const FLAG = "migration_020_cancel_ai_team_tasks";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE ai_agent_tasks
      SET    status       = 'cancelled',
             completed_at = NOW(),
             result       = '{"cancelled":"ai-team-scheduler permanently disabled"}'
      WHERE  status IN ('pending', 'queued', 'running')
    `);
    const affected = (result as any).rowCount ?? 0;
    log.info(`[Migration 020] Cancelled ${affected} stale ai-team-engine task(s)`);
  } catch (err: any) {
    log.warn(`[Migration 020] Failed (non-fatal): ${err?.message}`);
  }
  await setFlag(FLAG);
}

// ── Migration 021: permanently fail sWCir3U6m_U vault entry ──────────────────
// This video ID has failed every yt-dlp client (android, ios, web, mweb,
// android_testsuite, mediaconnect, android_vr) on every attempt.  The vault
// query retries entries with failCount < 5; setting failCount=10 permanently
// excludes it from the download queue and stops it from filling disk on each
// boot.  Also fails any autopilot_queue items still referencing this source.
async function migration021FailPermanentlyDeadVideo(): Promise<void> {
  const FLAG = "migration:021:fail_sWCir3U6m_U";
  if (await getFlag(FLAG)) return;
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All yt-dlp clients failed repeatedly — video undownloadable (migration 021)"}'::jsonb,
             updated_at = NOW()
      WHERE  youtube_id = 'sWCir3U6m_U'
    `);
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video sWCir3U6m_U permanently undownloadable (migration 021)',
             updated_at    = NOW()
      WHERE  status IN ('scheduled','pending','queued')
        AND  metadata->>'sourceYoutubeId' = 'sWCir3U6m_U'
    `);
    log.info("[Migration 021] Permanently failed vault entry + queue items for sWCir3U6m_U");
  } catch (err: any) {
    log.warn(`[Migration 021] Failed (non-fatal): ${err?.message}`);
  }
  await setFlag(FLAG);
}

// ── Migration 022: permanently fail oNGsg4mqxT8 vault entry ──────────────────
// This video ID returns HTTP 400 "Request contains an invalid argument" from
// every InnerTube client (ANDROID, IOS) and fails all yt-dlp clients
// (android_vr, web, android_testsuite, mediaconnect, ios, mweb).  Each full
// extractor round takes ~30 min and blocks the event loop enough to cause
// node-cron missed execution warnings.  Setting failCount=10 permanently
// excludes it from the vault download queue.
async function migration022FailONGsg4mqxT8(): Promise<void> {
  const FLAG = "migration:022:fail_oNGsg4mqxT8";
  if (await getFlag(FLAG)) return;
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All yt-dlp clients failed repeatedly — video undownloadable (migration 022)"}'::jsonb
      WHERE  youtube_id = 'oNGsg4mqxT8'
    `);
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video oNGsg4mqxT8 permanently undownloadable (migration 022)'
      WHERE  status IN ('scheduled','pending','queued')
        AND  metadata->>'sourceYoutubeId' = 'oNGsg4mqxT8'
    `);
    log.info("[Migration 022] Permanently failed vault entry + queue items for oNGsg4mqxT8");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 022] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 023: general vault sweep — permanently fail high-failCount entries ──
// Any vault entry that has accumulated failCount >= 5 across all yt-dlp clients
// is permanently undownloadable.  If the server keeps crashing before a video
// exhausts its extractor rounds, the failCount never reaches 5 naturally, so the
// storm never ends.  This migration finds all such entries on boot and marks them
// failed — preventing an indefinite crash loop for any video, not just named ones.
async function migration023SweepHighFailCountVaultEntries(): Promise<void> {
  const FLAG = "migration:023:sweep_high_failcount_vault";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status     = 'failed',
             metadata   = COALESCE(metadata, '{}'::jsonb)
                          || '{"permanentFail":true,"reason":"Auto-failed by migration 023: failCount >= 5 — video permanently undownloadable"}'::jsonb
      WHERE  status IN ('indexed','queued')
        AND  (metadata->>'failCount') ~ '^[0-9]+$'
        AND  (metadata->>'failCount')::int >= 5
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      log.info(`[Migration 023] Permanently failed ${count} vault entry/entries with failCount >= 5`);
    }
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 023] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 024: re-run vault sweep after fixing updated_at bug ─────────────
// Migrations 022 and 023 failed on first prod boot because content_vault_backups
// has no updated_at column.  The flag for 023 was set anyway (old pattern where
// setFlag was outside the try block), so 023 will never retry.  This migration
// clears the stuck 023 flag and repeats both vault fixes with the corrected SQL.
async function migration024FixVaultSweepAfterUpdatedAtBug(): Promise<void> {
  const FLAG = "migration:024:fix_vault_sweep_updated_at";
  if (await getFlag(FLAG)) return;
  try {
    // Clear stuck 023 flag so that if someone rolls back, 023 re-runs cleanly
    await db.execute(sql`
      DELETE FROM system_settings WHERE key = 'migration:023:sweep_high_failcount_vault'
    `);
    // Re-run 022 work: permanently fail oNGsg4mqxT8 vault entry (no updated_at)
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All yt-dlp clients failed repeatedly — video undownloadable (migration 022/024)"}'::jsonb
      WHERE  youtube_id = 'oNGsg4mqxT8'
        AND  status != 'failed'
    `);
    // Re-run 023 work: sweep any vault entry with failCount >= 5
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true,"reason":"Auto-failed by migration 024: failCount >= 5 — video permanently undownloadable"}'::jsonb
      WHERE  status IN ('indexed','queued')
        AND  (metadata->>'failCount') ~ '^[0-9]+$'
        AND  (metadata->>'failCount')::int >= 5
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 024] Vault sweep complete — oNGsg4mqxT8 blocked, ${count} other entry/entries with failCount >= 5 permanently failed`);
    await setFlag(FLAG);
    // Also set 023 flag so it doesn't double-run on next boot
    await db.execute(sql`
      INSERT INTO system_settings (key, value) VALUES ('migration:023:sweep_high_failcount_vault', 'true')
      ON CONFLICT (key) DO NOTHING
    `);
  } catch (err: any) {
    log.warn(`[Migration 024] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 025: permanently fail Q0pj8SN6WyU ──────────────────────────────
// Q0pj8SN6WyU caused a 2-hour event loop stall on 2026-06-09: android_vr failed
// at 05:41 UTC, then the next yt-dlp extractor (web) hung with no output until
// 07:44 UTC when the resilience-core stall detector fired.  The --socket-timeout
// flag only guards network sockets; a hung subprocess blocks the Node event loop
// until the process exits or is killed.  This migration permanently fails the
// vault entry so no further download attempts are made, eliminating the stall risk.
async function migration025FailQ0pj8SN6WyU(): Promise<void> {
  const FLAG = "migration:025:fail_Q0pj8SN6WyU";
  if (await getFlag(FLAG)) return;
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All yt-dlp clients failed — video caused 2-hour event loop stall (migration 025)"}'::jsonb
      WHERE  youtube_id = 'Q0pj8SN6WyU'
        AND  status != 'failed'
    `);
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video Q0pj8SN6WyU permanently undownloadable (migration 025)'
      WHERE  status IN ('scheduled','pending','queued')
        AND  metadata->>'sourceYoutubeId' = 'Q0pj8SN6WyU'
    `);
    log.info("[Migration 025] Permanently failed vault entry + queue items for Q0pj8SN6WyU");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 025] Failed (non-fatal): ${err?.message}`);
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
    await migration012DeletePlaceholderChannels();
    await migration013GameNameReaudit();
    await migration014CancelBlockedSourceVideos();
    await migration015PurgeNonYoutubeQueueItems();
    await migration016CreateErrorKnowledgeBase();
    await migration017PurgeStaleYoutubeChannels();
    await migration018RecascadeStaleYoutubeChannels();
    await migration019FailDeadlockedQueueItems();
    await migration020CancelAiTeamTasks();
    await migration021FailPermanentlyDeadVideo();
    await migration022FailONGsg4mqxT8();
    await migration023SweepHighFailCountVaultEntries();
    await migration024FixVaultSweepAfterUpdatedAtBug();
    await migration025FailQ0pj8SN6WyU();
    // Non-flagged boot cleanup — runs every restart, resets stuck pending items
    await cleanupStuckPendingItems();
    await verifyAllMigrationFlags();
  } catch (err: any) {
    log.warn(`[StartupMigrations] Unexpected error (non-fatal): ${err?.message}`);
  }
}
