/**
 * startup-migrations.ts
 *
 * One-time data migrations that run on every server boot but only execute once,
 * guarded by a system_settings flag.  Safe to include in production startup —
 * if the flag already exists the migration body is skipped in < 1 ms.
 */

import { db } from "../db";
import { autopilotQueue, systemSettings, systemIncidentLog } from "@shared/schema";
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

// ── Per-boot non-BF6 queue purge (non-flagged — runs every restart) ───────────
// Flagged migrations (060, 061) only run once.  New non-BF6 items can arrive at
// any point: content-maximizer inheriting a stale gameName, queuePastStreamContent
// picking up an off-brand stream, or back-catalog engine race.  This non-flagged
// sweep runs on every boot so any contamination introduced since the last deploy
// is cleared before publishers fire.
async function cleanupNonBF6QueueItems(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET
        status        = 'permanent_fail',
        error_message = 'per-boot cleanup: non-focus-game item removed — channel focus is Battlefield 6'
      WHERE status IN ('scheduled', 'pending')
        AND (metadata->>'gameName') IS NOT NULL
        AND (metadata->>'gameName') != ''
        AND metadata->>'gameName' NOT ILIKE '%battlefield%'
        AND metadata->>'gameName' NOT ILIKE '%bf6%'
        AND metadata->>'gameName' NOT ILIKE '%bf 6%'
        AND metadata->>'gameName' NOT ILIKE '%gaming%'
    `);
    const count = (result as any).rowCount ?? (result as any).count ?? 0;
    if (typeof count === "number" && count > 0) {
      log.info(`[BootCleanup] Purged ${count} non-BF6 queue item(s) (gameName filter)`);
    } else {
      log.debug("[BootCleanup] No non-BF6 queue items found");
    }
  } catch (err: any) {
    log.warn(`[BootCleanup] cleanupNonBF6QueueItems failed (non-fatal): ${err?.message}`);
  }
}

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
  { flag: "migration:026:fix_permanent_fail_status_leak",  label: "026 — reset indexed/downloading vault entries that have permanentFail:true to failed" },
  { flag: "migration:027:fail_Ld07AcKauuI",               label: "027 — permanently fail vault entry for Ld07AcKauuI (InnerTube HTTP 400 storm)" },
  { flag: "migration:028:fail_permanently_inaccessible",   label: "028 — permanently fail vault entries confirmed inaccessible by InnerTube" },
  { flag: "migration:034:fail_MTG_cjkK8XQ",               label: "034 — permanently fail MTG_cjkK8XQ (yt-dlp all-clients storm causing 16-min crash loop)" },
  { flag: "migration:035:stamp_missing_permanent_fail",   label: "035 — stamp permanentFail:true on all failed vault entries + fail FGv-w4tvc0M/SGCq53XHces" },
  { flag: "migration:036:fail_OG1_3Dw4_storm_videos",    label: "036 — permanently fail OG1-0dE1VPA + 3Dw4UB86S9g storm videos; fix dual-column orphan queue sweep" },
  { flag: "migration:037:seed_system_incident_log",       label: "037 — seed system_incident_log with all 30 historical crash/bug incidents for AI learning brain" },
  { flag: "migration:049:cancel_blocked_publishing_queue", label: "049 — cancel permanently-blocked queue items (bad source videos + orphans); mark AC Valhalla studios published" },
  { flag: "migration:060:purge_non_bf6_shorts_v1",          label: "060 — purge non-BF6 Shorts from autopilot queue (focus gate enforcement)" },
  { flag: "migration:061:purge_non_bf6_slippage_v1",        label: "061 — purge non-BF6 slippage items (past-stream gate + wrong gameName in metadata)" },
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

// ── Migration 026: fix permanentFail status leak ──────────────────────────────
// After a migration sets metadata.permanentFail=true on a vault entry, the vault
// downloader's SELECT only checked status (indexed/failed) — NOT the permanentFail
// flag.  Any entry that was in status='indexed' or status='downloading' at the time
// the migration ran kept its active status, so the downloader picked it up again on
// every cycle.  This migration resets all such entries to status='failed' so they
// are permanently excluded by the new permanentFail guard added to the SELECT query.
async function migration026FixPermanentFailStatusLeak(): Promise<void> {
  const FLAG = "migration:026:fix_permanent_fail_status_leak";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"reason":"Status leak fixed — was indexed/downloading despite permanentFail:true (migration 026)"}'::jsonb
      WHERE  (metadata->>'permanentFail')::boolean = true
        AND  status IN ('indexed', 'downloading', 'queued')
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 026] Fixed ${count} vault entries stuck in active state despite permanentFail:true`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 026] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 027: permanently fail Ld07AcKauuI ───────────────────────────────
// Ld07AcKauuI returned InnerTube HTTP 400 from both ANDROID and IOS clients,
// then yt-dlp also failed with "No video formats found".  The new structural fix
// (PERM_UNAVAILABLE throw on all-clients-400) will prevent this for future videos,
// but this entry is already mid-storm on the current boot — fail it immediately.
async function migration027FailLd07AcKauuI(): Promise<void> {
  const FLAG = "migration:027:fail_Ld07AcKauuI";
  if (await getFlag(FLAG)) return;
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All InnerTube clients returned HTTP 400 — video is private or deleted (migration 027)"}'::jsonb
      WHERE  youtube_id = 'Ld07AcKauuI'
        AND  status IN ('indexed', 'downloading', 'queued', 'failed')
    `);
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video Ld07AcKauuI permanently undownloadable (migration 027)'
      WHERE  status IN ('scheduled','pending','queued')
        AND  metadata->>'sourceYoutubeId' = 'Ld07AcKauuI'
    `);
    log.info("[Migration 027] Permanently failed vault entry + queue items for Ld07AcKauuI");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 027] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 028: sweep confirmed-inaccessible vault entries ─────────────────
// Vault entries whose download_error contains "permanently inaccessible" were
// already confirmed by InnerTube as private/deleted/geo-blocked, but a code path
// bug left their status as 'indexed' instead of 'skipped'/'failed'.  These will
// be retried forever by the downloader loop.  Mark them permanently failed so
// the new permanentFail SELECT guard excludes them.
// Similarly, entries with "No video formats found" in the error are confirmed dead
// by yt-dlp (all format strategies failed, video is unavailable).
async function migration028FailPermanentlyInaccessible(): Promise<void> {
  const FLAG = "migration:028:fail_permanently_inaccessible";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"Confirmed inaccessible by InnerTube or yt-dlp (migration 028 sweep)"}'::jsonb
      WHERE  (
               download_error ILIKE '%permanently inaccessible%'
            OR download_error ILIKE '%No video formats found%'
            OR download_error ILIKE '%video unavailable%'
            OR download_error ILIKE '%HTTP_400_ALL_CLIENTS%'
             )
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
        AND  (metadata->>'permanentSkip') IS DISTINCT FROM 'true'
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 028] Permanently failed ${count} vault entries with confirmed-inaccessible download errors`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 028] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 029: reset shorts clips deferred by ghost-channel no-token bug ──
// Shorts publisher was picking channel 52 (ET Gaming 247, no token) over channel
// 53 (ET Gaming 274, valid token) because it selected by platform without a token
// preference.  Every pick of channel 52 pushed scheduledAt +4h.  After the fix
// lands, these items are eligible to publish via channel 53 — reset their
// scheduledAt to NOW() so they don't sit dormant for up to 4 more hours.
async function migration029ResetGhostChannelDeferredClips(): Promise<void> {
  const FLAG = "migration:029:reset_ghost_channel_deferred_clips";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET    scheduled_at  = NOW(),
             error_message = NULL,
             updated_at    = NOW()
      WHERE  status        = 'scheduled'
        AND  target_platform IN ('youtube', 'youtubeshorts')
        AND  error_message  LIKE '%no OAuth token%'
        AND  scheduled_at   > NOW()
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 029] Reset ${count} clips deferred by ghost-channel no-token bug → scheduledAt=NOW()`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 029] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 030: permanently fail Po4WNli5ZLY in pre-encoder queue ──────────
// This video held a yt-dlp slot for 7200s (2 hours) because the section
// downloader's startup-phase guard was missing.  It is confirmed undownloadable
// (all formats unavailable after hard timeout + ios format error).  Permanently
// blacklist it from the pre-encoder so it never burns a slot again.
async function migration030FailPo4WNli5ZLY(): Promise<void> {
  const FLAG = "migration:030:fail_Po4WNli5ZLY";
  if (await getFlag(FLAG)) return;
  // pre_encoder_queue is raw-SQL only (no Drizzle table) — wrap separately
  try {
    await db.execute(sql`
      UPDATE pre_encoder_queue
      SET    status        = 'failed',
             error_message = 'Po4WNli5ZLY permanently undownloadable — yt-dlp 2h timeout + all formats unavailable (migration 030)'
      WHERE  youtube_id    = 'Po4WNli5ZLY'
        AND  status NOT IN ('failed')
    `);
  } catch { /* table may not exist in production — non-fatal */ }

  // content_vault_backups is a Drizzle table — this must succeed
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"2h section-download timeout + all formats unavailable (migration 030)"}'::jsonb
      WHERE  youtube_id = 'Po4WNli5ZLY'
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
    `);
    // Also blacklist bKi6jjwG7Ac — exhausted all 20 format/client combos on first run
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"all 20 yt-dlp format/client combinations failed (migration 030)"}'::jsonb
      WHERE  youtube_id = 'bKi6jjwG7Ac'
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
    `);
    log.info("[Migration 030] Permanently failed Po4WNli5ZLY + bKi6jjwG7Ac in vault");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 030] Vault update failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 031: blacklist Lfupu2iliBw + general permanentFail sweep ────────
// Lfupu2iliBw exhausted all 20 yt-dlp format/client combinations on its first
// run.  Without this migration it burns a 4h cooldown cycle on every boot for
// 3 rounds (MAX_SOFT_RETRIES) before the clip-video-processor writes
// status=failed to the vault.  Blacklisting it here saves those wasted slots.
//
// The general sweep below catches any vault entry that clip-video-processor
// already tagged permanentFail:true in metadata but never flushed to
// status=failed (e.g. due to a crash mid-cycle).  This means we never need
// another single-video migration for this class of problem.
async function migration031FailLfupu2iliBw(): Promise<void> {
  const FLAG = "migration:031:fail_Lfupu2iliBw";
  if (await getFlag(FLAG)) return;

  try {
    // Blacklist the specific known-bad video
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"all 20 yt-dlp format/client combinations failed (migration 031)"}'::jsonb
      WHERE  youtube_id = 'Lfupu2iliBw'
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
    `);

    // General sweep: any vault entry already tagged permanentFail:true in metadata
    // but still showing a non-failed status.  clip-video-processor sets this flag
    // when MAX_SOFT_RETRIES rounds are exhausted — flush it to status=failed so
    // the boot preload skips these entries instantly on every future restart.
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status = 'failed'
      WHERE  (metadata->>'permanentFail') = 'true'
        AND  status <> 'failed'
    `);

    log.info("[Migration 031] Blacklisted Lfupu2iliBw + swept all permanentFail:true vault entries to status=failed");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 031] Vault update failed (non-fatal): ${err?.message}`);
  }
}

// Migration 032 — Fix autopilot_queue items that have "PS5 Gameplay" / "PS5 Gaming"
// baked into their caption or metadata.gameName due to the old hardcoded fallback.
// The fallback is now getFocusGame() so all NEW items use the real game, but anything
// already sitting in the queue with the old default needs a one-time scrub.
async function migration032FixPs5GameFallbacks(): Promise<void> {
  const FLAG = "migration:032:fix_ps5_game_fallbacks";
  if (await getFlag(FLAG)) return;

  try {
    // Fix metadata.gameName + captions in one pass
    await db.execute(sql`
      UPDATE autopilot_queue
      SET
        metadata = CASE
          WHEN metadata->>'gameName' IN ('PS5 Gameplay', 'PS5 Gaming', 'PS5')
          THEN jsonb_set(metadata, '{gameName}', '"Battlefield 6"', true)
          ELSE metadata
        END,
        caption = regexp_replace(
                    regexp_replace(caption, 'PS5 Gaming', 'Battlefield 6', 'gi'),
                    'PS5 Gameplay', 'Battlefield 6', 'gi'
                  )
      WHERE status IN ('scheduled', 'pending')
        AND (
              metadata->>'gameName' IN ('PS5 Gameplay', 'PS5 Gaming', 'PS5')
              OR caption ILIKE '%PS5 Gameplay%'
              OR caption ILIKE '%PS5 Gaming%'
            )
    `);

    // Also reset game_name in back_catalog_videos for items published in the last
    // 30 days where the title contains the fallback string — these are almost
    // certainly Battlefield 6 streams where detection failed.
    await db.execute(sql`
      UPDATE back_catalog_videos
      SET    game_name = 'Battlefield 6'
      WHERE  published_at >= NOW() - INTERVAL '30 days'
        AND  game_name IN ('PS5 Gameplay', 'PS5 Gaming', 'PS5')
    `);

    log.info("[Migration 032] Fixed PS5 game fallbacks in autopilot_queue + recent back_catalog_videos");
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 032] Fix failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 033: Reschedule long-form clips to daily cadence from June 11 ───

async function migration033RescheduleLongFormFromJune11(): Promise<void> {
  // Flag name includes "next_reset" — changed from the original "june11" version
  // so this re-runs even if the previous hard-coded migration already fired.
  const FLAG = "migration_033_longform_daily_from_next_reset";
  if (await getFlag(FLAG)) return;
  try {
    // YouTube quota resets at midnight Pacific Time (PDT = UTC-7 in summer).
    // "Next reset day" = the upcoming midnight-Pacific boundary from now.
    const PACIFIC_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowPacific = new Date(Date.now() - PACIFIC_OFFSET_MS);
    // Advance to the next calendar day in Pacific time
    const startPacific = new Date(nowPacific);
    startPacific.setUTCDate(startPacific.getUTCDate() + 1);
    startPacific.setUTCHours(0, 0, 0, 0);
    // Convert back to UTC for DB storage
    const startUTC = new Date(startPacific.getTime() + PACIFIC_OFFSET_MS);

    // Items in original scheduled_at order (earliest first).
    // Time-of-day from the original schedule is preserved; only the date shifts.
    const items: Array<{ id: number; timeStr: string }> = [
      { id: 39343, timeStr: "07:42:17" },
      { id: 39370, timeStr: "09:50:51" },
      { id: 39377, timeStr: "20:05:36" },
      { id: 39378, timeStr: "20:38:27" },
      { id: 39379, timeStr: "19:30:50" },
      { id: 39380, timeStr: "20:23:35" },
      { id: 34970, timeStr: "20:31:43" },
      { id: 39320, timeStr: "19:03:28" },
      { id: 39322, timeStr: "20:31:07" },
      { id: 39323, timeStr: "20:13:53" },
      { id: 39321, timeStr: "20:39:04" },
    ];

    let updated = 0;
    for (let i = 0; i < items.length; i++) {
      const { id, timeStr } = items[i];
      const itemDate = new Date(startUTC.getTime() + i * 86_400_000);
      const dateStr = itemDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const newDateTime = `${dateStr} ${timeStr}`;
      await db.execute(sql`
        UPDATE autopilot_queue
        SET    scheduled_at = ${newDateTime}::timestamptz
        WHERE  id = ${id}
          AND  status IN ('scheduled','pending')
      `);
      updated++;
    }

    const startLabel = startUTC.toISOString().slice(0, 10);
    log.info(`[Migration 033] Rescheduled ${updated} long-form items to daily cadence from ${startLabel} (next quota reset)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 033] Reschedule failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 034: permanently fail MTG_cjkK8XQ + general low-failCount sweep ──
// MTG_cjkK8XQ fails every yt-dlp client (tv_embedded + ios) across every format
// combination on every boot.  The clip-video-processor starts processing it at
// ~T+14min, and by T+16min the concurrent yt-dlp attempts + Wave 7 startup load
// cause OOM, crashing the server every 16 minutes (~70 outages/day).
//
// Root cause why migration 023 didn't catch it: 023 sweeps failCount >= 5, but
// the server crashes before any single video exhausts 5 yt-dlp rounds, so the
// failCount never reaches 5 naturally.  This migration lowers the auto-sweep
// threshold to >= 3 to catch storm videos before they accumulate 5 crash cycles.
async function migration034FailMTGcjkK8XQ(): Promise<void> {
  const FLAG = "migration:034:fail_MTG_cjkK8XQ";
  if (await getFlag(FLAG)) return;
  try {
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"All yt-dlp clients failed on every boot — video undownloadable, caused 16-min crash loop (migration 034)"}'::jsonb
      WHERE  youtube_id = 'MTG_cjkK8XQ'
        AND  status != 'failed'
    `);
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video MTG_cjkK8XQ permanently undownloadable (migration 034)'
      WHERE  status IN ('scheduled','pending','queued')
        AND  metadata->>'sourceYoutubeId' = 'MTG_cjkK8XQ'
    `);
    // General sweep: any vault entry with failCount >= 3 that is still in an
    // active state.  The server crashes before reaching 5, so we lower the bar.
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true,"reason":"Auto-failed by migration 034: failCount >= 3 and still active — video undownloadable"}'::jsonb
      WHERE  status IN ('indexed', 'queued', 'downloading')
        AND  (metadata->>'failCount') ~ '^[0-9]+$'
        AND  (metadata->>'failCount')::int >= 3
    `);
    const swept = (result as any).rowCount ?? 0;
    log.info(`[Migration 034] Permanently failed MTG_cjkK8XQ + swept ${swept} other high-failCount active vault entries`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 034] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 035: stamp permanentFail:true on all failed vault entries + specific storm videos ──
// Production audit found 4 vault entries with status='failed' but no permanentFail:true metadata.
// This means the resurrection engine can re-queue them, causing new yt-dlp storms.
// FGv-w4tvc0M: all yt-dlp clients/formats fail every boot.
// SGCq53XHces: video geo-blocked/DRM — queue items reference it and fail every publisher sweep.
// Broad sweep: any status='failed' vault entry gets permanentFail:true stamped so resurrection
// and back-catalog engines will never re-queue it.
async function migration035StampMissingPermanentFail(): Promise<void> {
  const FLAG = "migration:035:stamp_missing_permanent_fail";
  if (await getFlag(FLAG)) return;
  try {
    // Specific videos known to storm
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"yt-dlp all-clients storm — FGv-w4tvc0M permanently undownloadable (migration 035)"}'::jsonb
      WHERE  youtube_id = 'FGv-w4tvc0M'
    `);
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"SGCq53XHces geo-blocked/DRM — permanently inaccessible (migration 035)"}'::jsonb
      WHERE  youtube_id = 'SGCq53XHces'
    `);
    // Broad belt-and-suspenders sweep: stamp ALL status='failed' vault entries that are
    // missing permanentFail:true so the resurrection engine can never re-queue them.
    const stampResult = await db.execute(sql`
      UPDATE content_vault_backups
      SET    metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true}'::jsonb
      WHERE  status = 'failed'
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
    `);
    const stamped = (stampResult as any).rowCount ?? 0;
    // Cancel all active autopilot_queue items referencing any permanently-failed vault source
    const queueResult = await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source vault entry permanently failed — cancelled by migration 035 sweep'
      WHERE  status IN ('scheduled','pending','queued','deferred')
        AND  metadata->>'sourceYoutubeId' IS NOT NULL
        AND  EXISTS (
          SELECT 1 FROM content_vault_backups cvb
          WHERE  cvb.youtube_id = (autopilot_queue.metadata->>'sourceYoutubeId')
            AND  cvb.status = 'failed'
        )
    `);
    const cancelled = (queueResult as any).rowCount ?? 0;
    log.info(`[Migration 035] Stamped permanentFail on ${stamped} vault entries, cancelled ${cancelled} orphaned queue items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 035] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 036: permanently fail OG1-0dE1VPA + 3Dw4UB86S9g storm videos ──
// OG1-0dE1VPA: new storm video — all 3 InnerTube clients (tv_embedded, ios, android)
//   exhausted all formats at 21:39 UTC on 2026-06-10.  Multiple autopilot_queue items
//   (posts 39415, 39434, 39436, 39438, 39439, 39441, 39442, 39443) failed to publish.
//   Vault has 2 indexed rows with no failCount — per-boot sweep needs failCount >= 2 to
//   auto-fail, so without this migration the storm repeats every boot.
// 3Dw4UB86S9g: 3 correctly-failed entries exist, but back-catalog re-imported a fresh
//   indexed row with no failCount after the previous per-boot sweep ran at T+3s.
//   Post 39445 already failed against this new row.
// Also cancels any queue items referencing ALL known permanently-failed storm videos
// using BOTH the source_youtube_id column and metadata->>'sourceYoutubeId' to close
// the orphan-sweep gap that existed in migrations 034/035.
async function migration036FailOG1And3Dw4StormVideos(): Promise<void> {
  const FLAG = "migration:036:fail_OG1_3Dw4_storm_videos";
  if (await getFlag(FLAG)) return;
  try {
    // Fail ALL vault entries for known storm videos
    const stormVideoResult = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"yt-dlp all-clients storm — permanently undownloadable (migration 036)"}'::jsonb
      WHERE  youtube_id IN (
        'OG1-0dE1VPA',  -- 2026-06-10 21:39 UTC: all 3 clients failed (tv_embedded/ios/android)
        'LgznaZ5uYJw'   -- 2026-06-10 21:40 UTC: all 4 clients failed (tv_embedded/ios/android/web)
      )
    `);
    // Fail any remaining active vault entries for 3Dw4UB86S9g (the re-imported indexed row)
    const dw4Result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"geo-blocked/DRM — permanently inaccessible 3Dw4UB86S9g (migration 036)"}'::jsonb
      WHERE  youtube_id = '3Dw4UB86S9g'
        AND  status != 'failed'
    `);
    // Broad general sweep: fail any indexed/queued/downloading entry with permanentFail:true
    // or failCount >= 2 (belt-and-suspenders — catches any storm video the back-catalog
    // engine re-imported after the previous per-boot sweep ran)
    const sweepResult = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true,"reason":"Auto-failed by migration 036 general sweep: indexed+permanentFail:true or failCount>=2"}'::jsonb
      WHERE  status IN ('indexed','queued','downloading')
        AND  (
          (metadata->>'permanentFail') = 'true'
          OR (
            (metadata->>'failCount') ~ '^[0-9]+$'
            AND (metadata->>'failCount')::int >= 2
          )
        )
    `);
    const stormVideos = (stormVideoResult as any).rowCount ?? 0;
    const dw4 = (dw4Result as any).rowCount ?? 0;
    const swept = (sweepResult as any).rowCount ?? 0;
    // Cancel ALL active autopilot_queue items referencing known permanently-failed source
    // videos via metadata->>'sourceYoutubeId' (the JSONB field used by back-catalog items).
    // NOTE: autopilot_queue has no source_youtube_id text column — only source_video_id (int FK).
    const queueResult = await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video permanently undownloadable — cancelled by migration 036'
      WHERE  status IN ('scheduled','pending','queued','deferred')
        AND  metadata->>'sourceYoutubeId' IS NOT NULL
        AND  metadata->>'sourceYoutubeId' != ''
        AND  EXISTS (
          SELECT 1 FROM content_vault_backups cvb
          WHERE  cvb.youtube_id = (autopilot_queue.metadata->>'sourceYoutubeId')
            AND  cvb.status = 'failed'
        )
    `);
    const cancelled = (queueResult as any).rowCount ?? 0;
    log.info(`[Migration 036] Failed ${stormVideos} storm-video rows (OG1-0dE1VPA+LgznaZ5uYJw), ${dw4} 3Dw4UB86S9g rows, swept ${swept} other active permanentFail/failCount>=2 entries, cancelled ${cancelled} orphaned queue items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 036] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 037: seed system_incident_log ───────────────────────────────────

async function migration037SeedSystemIncidentLog(): Promise<void> {
  const FLAG = "migration:037:seed_system_incident_log";
  if (await getFlag(FLAG)) return;

  try {
    type Inc = {
      incidentDate: string; category: string; service: string;
      rootCause: string; fixDescription: string; lesson: string;
      migrationNumber?: number; severity: string; crashesPerDay?: number;
      status: string; tags: string[];
    };
    const incidents: Inc[] = [
      {
        incidentDate: "2026-05-01", category: "oom_crash", service: "youtube-ai-orchestrator",
        severity: "critical", crashesPerDay: 69, status: "resolved",
        rootCause: "STARTUP_DELAY_MS was 30-40s; orchestrator fired its first AI cycle at T+15:30, converging with back-catalog runner and grinder second run, exhausting container memory.",
        fixDescription: "All deferred starts pushed to T+20-25min minimum (T+35-40min total); sequential boot pattern enforced across all Wave 6-11 services.",
        lesson: "Never start an AI service with a delay shorter than 20min from boot. Back-catalog + grinder + publishers ALL converge unless staggered by ≥5min each. Wave 10 (publishers) must fire LAST, never before T+30min.",
        tags: ["boot-timing", "ai-orchestrator", "wave-ordering"],
      },
      {
        incidentDate: "2026-05-05", category: "oom_crash", service: "back-catalog-runner",
        severity: "critical", crashesPerDay: 30, status: "resolved",
        rootCause: "Back-catalog runner + grinder second run + publisher sweep all converged at T+10-20min; direct runGrindCycle() call from runner added a third AI workload to the same 10-min window.",
        fixDescription: "Memory gates added to both back-catalog and grinder; grinder urgent interval raised 10→20min; direct runGrindCycle() call removed from runner.",
        lesson: "Any two services sharing AI slots must have non-overlapping initial-delay windows, never within 5min of each other. A runner must never directly invoke another runner — let each service manage its own boot delay.",
        tags: ["boot-timing", "convergence", "ai-slots"],
      },
      {
        incidentDate: "2026-05-10", category: "ai_queue", service: "stream-exhaust-engine",
        severity: "critical", crashesPerDay: 20, status: "resolved",
        rootCause: "stream-exhaust while-loop spun at 4 iterations/second when AI queue was full (zero backoff), permanently holding all 4 AI semaphore slots and starving every other background service.",
        fixDescription: "Added re-throw + 30s backoff on AI queue full; boot delays pushed to T+20-27min for stream-exhaust, self-improvement, and growth-flywheel.",
        lesson: "Every AI slot acquisition loop MUST have a minimum 30s backoff when the queue is full — never spin on contention. A loop that holds slots without doing work is a denial-of-service against all other AI services.",
        tags: ["ai-semaphore", "hot-loop", "backoff"],
      },
      {
        incidentDate: "2026-05-12", category: "db_saturation", service: "youtube-output-schedule",
        severity: "high", status: "resolved",
        rootCause: "getNextShortPublishTime() executed 42 DB queries per call when the 14-day schedule was full; no cache; bulk-queue loops called it thousands of times per cycle.",
        fixDescription: "Saturation cache added (30min TTL); isShortScheduleSaturated() guard added to all bulk-queue loops to skip the scan entirely when full.",
        lesson: "Any 'find next available slot' function that scans a full schedule MUST cache its result with a ≥30min TTL. Add an isSaturated() fast-path guard before every bulk-queue loop — never scan a full schedule per-iteration.",
        tags: ["schedule", "cache", "db-queries"],
      },
      {
        incidentDate: "2026-05-14", category: "oom_crash", service: "youtube-output-schedule",
        severity: "critical", crashesPerDay: 30, status: "resolved",
        rootCause: "getNextLongFormPublishTime() missing mutex; 18+ concurrent callers all bypassed the cache and each ran the full 42-query scan simultaneously → hot-spin → health-check 500s → crash loop.",
        fixDescription: "Added _longFormMutexTails + withLongFormScheduleMutex; double-checked locking (re-check cache inside mutex before advisory lock).",
        lesson: "Double-checked locking is mandatory for all schedule-slot functions: (1) fast-path cache check OUTSIDE mutex, (2) re-check cache INSIDE mutex before doing any DB work. The outer check prevents cold-start storms; the inner check prevents thundering herd when cache expires simultaneously.",
        tags: ["mutex", "double-checked-locking", "schedule", "cache"],
      },
      {
        incidentDate: "2026-05-16", category: "db_saturation", service: "youtube-output-schedule",
        severity: "critical", crashesPerDay: 18, status: "resolved",
        rootCause: "Fast-path cache check was placed OUTSIDE the mutex; 18+ Wave 10.5 concurrent callers all saw cache miss simultaneously, queued, and each ran the full 42-query scan serially inside the mutex.",
        fixDescription: "Cache check moved inside mutex (before advisory lock); double-checked locking pattern enforced.",
        lesson: "The cache check that prevents DB work MUST be inside the mutex for functions called concurrently. An outer-only check creates a thundering herd the moment the cache expires — all waiters queue, then all run the expensive scan.",
        tags: ["mutex", "cache", "concurrent-callers"],
      },
      {
        incidentDate: "2026-05-18", category: "oom_crash", service: "job-queue-recovery",
        severity: "critical", status: "resolved",
        rootCause: "startRecoveryPump() ran an immediate sweep on boot, replaying all stale crash-session jobs and saturating all 4 AI background slots → 9MB/min heap growth → MemoryGuardian restart at T+25min → crash loop.",
        fixDescription: "Recovery pump uses a startup delay + dedup check before replaying any job from a previous crash session.",
        lesson: "Never run a recovery/replay sweep immediately on boot without a startup delay AND a dedup guard. Stale jobs from the crashed session are NOT safe to replay immediately — they were crashed-in-progress and replaying them recreates the crash.",
        tags: ["boot-timing", "recovery", "ai-slots"],
      },
      {
        incidentDate: "2026-05-20", category: "oom_crash", service: "shorts-publisher",
        severity: "critical", crashesPerDay: 87, status: "resolved",
        rootCause: "Publisher sweep started at T+17min, coinciding exactly with back-catalog runner second-run; combined AI slot contention + heap pressure exceeded container limits.",
        fixDescription: "Publisher sweep pushed to T+40min; back-catalog runner to T+30min; 4 orchestrator agents + 3 wave-5 engines boosted from 20-90s → 5-12min initial delays.",
        lesson: "Wave 10 (publishers) must fire LAST in the boot sequence, never before T+30min. Verify absolute T+ boot times after ANY wave change — a single wave disable can cascade timing for all subsequent waves.",
        tags: ["boot-timing", "wave-ordering", "publishers"],
      },
      {
        incidentDate: "2026-05-22", category: "oom_crash", service: "wave-11-services",
        severity: "high", status: "resolved",
        rootCause: "When Wave 10.5 was disabled, Wave 11 fired at T+30.5min instead of T+35min; combined with grinder/back-catalog/VOD-optimizer convergence → OOM at T+35min.",
        fixDescription: "Wave 11 sleep 5→15min; VOD optimizer 16→32min; grinder startup 4→10min.",
        lesson: "Always verify absolute T+ boot times after any wave changes — conditional wave execution changes absolute timing of all downstream waves. Never assume a wave fires at its intended time without checking the enabled/disabled chain.",
        tags: ["boot-timing", "wave-ordering"],
      },
      {
        incidentDate: "2026-05-25", category: "hot_loop", service: "shorts-publisher",
        severity: "high", status: "resolved",
        rootCause: "Publisher treated 'all-skipped' batches (published==0, failed==0) as 'work done' with only a 2s retry delay, creating an infinite tight loop when the channel had no OAuth token.",
        fixDescription: "Added a third outcome branch: published==0 && failed==0 → long idle backoff (90s for shorts, 2min for long-form).",
        lesson: "Publisher loops MUST have exactly 3 outcome branches: (1) published>0 → short delay, (2) failed>0 → error delay, (3) all-skipped → long idle backoff ≥90s. Missing the third branch creates a tight loop on any non-error no-op condition.",
        tags: ["publisher", "backoff", "hot-loop"],
      },
      {
        incidentDate: "2026-05-27", category: "hot_loop", service: "shorts-publisher",
        severity: "high", status: "resolved",
        rootCause: "When a channel had no OAuth token, publisher reset the queue item to 'scheduled' without advancing scheduledAt → item picked up again every 90s indefinitely. Ghost channel rows (lower DB id) were silently selected first.",
        fixDescription: "No-token branch now sets scheduledAt = NOW() + 4h; all services now use .find(c => c.accessToken) to prefer channels WITH a token.",
        lesson: "When deferring a queue item due to missing OAuth token, ALWAYS advance scheduledAt by at least 4h. Always filter channel selection to channels with an active accessToken — ghost rows with lower IDs get selected first silently.",
        tags: ["publisher", "oauth", "queue-scheduling"],
      },
      {
        incidentDate: "2026-05-30", category: "hot_loop", service: "back-catalog-engine",
        severity: "high", status: "resolved",
        rootCause: "Back-catalog meta-update loop iterated ALL ~200 catalog videos at T+16min without any quota check. pushToYouTube() swallowed QUOTA_EXCEEDED errors without tripping the breaker → every iteration burned a full Claude call.",
        fixDescription: "pushToYouTube() now trips quota breaker on QUOTA_EXCEEDED; loop capped at 25 videos/cycle with mid-loop breaker check.",
        lesson: "All bulk YouTube API loops MUST: (1) check the quota breaker before each call, (2) cap iterations at ≤25/cycle, (3) have pushToYouTube trip the breaker on quota errors — not swallow them. Swallowed quota errors cause silent infinite burns.",
        tags: ["quota", "bulk-loop", "quota-breaker"],
      },
      {
        incidentDate: "2026-06-01", category: "oom_crash", service: "content-grinder",
        severity: "critical", crashesPerDay: 20, status: "resolved",
        rootCause: "4 stacked bugs: (1) getGrindQueueDepth excluded overdue items via scheduledAt>=NOW filter → false URGENT mode; (2) 5-min madeProgress follow-up caused T+9min AI convergence; (3) catalog sync at T+10min too early; (4) VODSEOOptimizer had no concurrency limit → held all 4 AI slots.",
        fixDescription: "Fixed queue depth query to include overdue items; removed madeProgress follow-up; delayed catalog sync; added concurrency limit to VODSEOOptimizer.",
        lesson: "Queue depth queries that include a time filter can misreport URGENT mode — always include overdue items in the depth count. A follow-up cycle with a 5min delay can recreate T+9min convergence even when initial delays are set correctly.",
        tags: ["grinder", "queue-depth", "ai-slots", "overdue-items"],
      },
      {
        incidentDate: "2026-06-01", category: "vault_failure", service: "video-vault",
        severity: "critical", status: "resolved",
        rootCause: "queueVaultDownloadForSource() had no permanent-failure return path; both publishers looped forever on undownloadable source videos because the vault function never signalled 'give up'.",
        fixDescription: "Added 'download_failed' return + __vault_source_unavailable__ signal; Migration 019 cleaned up deadlocked queue items on boot.",
        migrationNumber: 19,
        lesson: "Any function that gates publishing on a vault download MUST return a permanent-failure sentinel when the download is impossible. Callers must treat that sentinel as 'skip this source forever', not 'retry next cycle'.",
        tags: ["vault", "permanent-failure", "publisher-gate"],
      },
      {
        incidentDate: "2026-06-01", category: "vault_failure", service: "video-vault",
        severity: "high", status: "resolved",
        rootCause: "Vault filled disk to 0.0GB; processVaultDownloads callers re-invoked immediately after break with no backoff. One permanently undownloadable video (sWCir3U6m_U) kept retrying with no self-limiting.",
        fixDescription: "_vaultDiskFullUntil 2h backoff cache at <0.5GB free; Migration 021 set failCount=10 for sWCir3U6m_U.",
        migrationNumber: 21,
        lesson: "Disk-full conditions MUST gate all vault downloads for ≥2h via a backoff cache — never retry a disk-full condition on the next loop tick. Any permanently undownloadable video that caused the fill must be explicitly failed via a named startup migration.",
        tags: ["vault", "disk-full", "backoff"],
      },
      {
        incidentDate: "2026-06-02", category: "storm_video", service: "clip-video-processor",
        severity: "critical", status: "resolved",
        rootCause: "Videos all extractors reject cause 40-60min/round yt-dlp storms. If the server crashes before failCount reaches the threshold (5), the storm never self-limits and restarts on every boot.",
        fixDescription: "Named startup migrations set failCount=10 for known storm videos on boot; general threshold lowered to failCount≥3 (Migration 034) so the per-boot sweep catches videos before a 5th crash.",
        migrationNumber: 34,
        lesson: "Storm-candidate videos MUST be explicitly failed via named startup migrations — never rely on the organic failCount accumulating to a threshold when server crashes reset progress. Threshold of 5 never self-heals across crashes; use failCount≥3 for the general sweep.",
        tags: ["vault", "storm-video", "startup-migration"],
      },
      {
        incidentDate: "2026-06-02", category: "storm_video", service: "clip-video-processor",
        severity: "critical", status: "resolved",
        rootCause: "When ALL InnerTube clients return HTTP 400 for the same video, the caller fell through to yt-dlp 'No video formats found' storm instead of immediately marking the video as permanently unavailable.",
        fixDescription: "Per-client http400FailCount tracking; when all clients return HTTP 400, throw PERM_UNAVAILABLE:HTTP_400_ALL_CLIENTS immediately so caller permanently skips without starting a yt-dlp storm.",
        migrationNumber: 28,
        lesson: "Track per-client HTTP 400 count in vault metadata. If ALL InnerTube clients return 400 for the same video, immediately throw PERM_UNAVAILABLE:HTTP_400_ALL_CLIENTS — never fall through to yt-dlp. yt-dlp will also fail and its failure storm is orders of magnitude more expensive.",
        tags: ["vault", "innertube", "http-400", "storm-video"],
      },
      {
        incidentDate: "2026-06-02", category: "vault_failure", service: "video-vault",
        severity: "high", status: "resolved",
        migrationNumber: 26,
        rootCause: "Startup migrations set permanentFail:true in vault metadata, but vault entries kept status='indexed'/'downloading'. All vault SELECT queries and download-queue functions only checked status='failed', so the permanentFail flag was silently ignored and the downloader kept retrying.",
        fixDescription: "permanentFail guard added to all vault SELECT queries and queueVaultDownloadForSource(); Migration 026 swept all indexed/downloading entries with permanentFail:true to status=failed.",
        lesson: "The permanentFail:true metadata flag MUST be checked in ALL vault SELECT queries and download-queue functions, not just status='failed'. A vault entry can have permanentFail:true while still showing as 'indexed' or 'downloading' when migrations run between the status write and the flag write.",
        tags: ["vault", "permanent-fail", "metadata-flag"],
      },
      {
        incidentDate: "2026-06-03", category: "hot_loop", service: "clip-video-processor",
        severity: "critical", status: "resolved",
        rootCause: "yt-dlp spawned with execFileAsync; timeout sent SIGTERM. yt-dlp ignores SIGTERM when stuck in kernel I/O or when its --js-runtimes Node child is spinning → Promise never resolves → Node event loop stalls for hours.",
        fixDescription: "spawnYtDlpWithHardTimeout() uses spawn(detached:true) + process.kill(-pid, 'SIGKILL') to kill the entire process group; 8-min hard limit enforced via SIGKILL not SIGTERM.",
        lesson: "yt-dlp MUST always be spawned with detached:true so SIGKILL can kill the entire process group (including child processes). SIGTERM alone is insufficient — yt-dlp ignores it during kernel I/O. Hard timeout must be enforced with SIGKILL, not SIGTERM.",
        tags: ["ytdlp", "sigkill", "process-group", "event-loop-stall"],
      },
      {
        incidentDate: "2026-06-03", category: "hot_loop", service: "clip-video-processor",
        severity: "high", status: "resolved",
        rootCause: "yt-dlp stall watcher reset stalledMs=0 when the output file had not yet been created (currentSize===-1), so a process hung in the auth/metadata startup phase ran the full 2h hard timeout completely unchecked.",
        fixDescription: "Added separate startupMs tracking; kills after 3min if the output file never appears; default hardTimeoutMs reduced from 2h to 20min.",
        lesson: "yt-dlp stall detection must separately track two phases: startup (waiting for file to be created, max 3min) and download progress (file exists, monitor size growth). Default hard timeout must never exceed 20min — 2h was effectively no limit.",
        tags: ["ytdlp", "stall-detection", "startup-phase"],
      },
      {
        incidentDate: "2026-06-03", category: "oom_crash", service: "video-vault",
        severity: "critical", status: "resolved",
        migrationNumber: 31,
        rootCause: "Vault entries with permanentFail:true in metadata but status≠failed held yt-dlp gate slots for up to 8min each (full hard timeout). Multiple such entries converged at T+44min → container OOM.",
        fixDescription: "Migration 031 sweeps ALL vault entries where permanentFail:true AND status != 'failed' to status=failed on every boot, before any yt-dlp gate slot can be acquired.",
        lesson: "On every boot, BEFORE any yt-dlp work starts, sweep all vault entries where metadata->>'permanentFail'='true' AND status != 'failed' to status='failed'. This is non-negotiable — permanentFail entries must never hold yt-dlp gate slots.",
        tags: ["vault", "permanent-fail", "slot-starvation", "startup-sweep"],
      },
      {
        incidentDate: "2026-06-04", category: "hot_loop", service: "token-hourly-cap",
        severity: "high", status: "resolved",
        rootCause: "checkDailyTokenBudget() had zero deduplication. Any service polling at 2-4s intervals triggered the 'daily budget exhausted' log on every tick → event loop saturation from log spam and repeated DB queries.",
        fixDescription: "_dailyExhaustedCache Map in token-hourly-cap.ts deduplicates per-key; self-invalidates at UTC midnight via dateKey mismatch.",
        lesson: "Budget and cap checks called from polling loops MUST be deduplicated with a per-key cache that expires at the reset boundary (UTC midnight for daily, top of hour for hourly). A budget check that fires on every poll tick with no dedup will saturate the event loop.",
        tags: ["token-budget", "dedup", "polling-loop"],
      },
      {
        incidentDate: "2026-06-04", category: "schema_bug", service: "back-catalog-engine",
        severity: "high", status: "resolved",
        rootCause: "refreshFailedVaultIds() only queried status='failed' to build the blocked-video-ID set. Videos with permanentFail:true in metadata but status='indexed' were not included → back-catalog engine kept re-queuing permanently failed videos in a cycle.",
        fixDescription: "Query updated to include status='failed' OR metadata->>'permanentFail'='true' so the blocked set covers both status-based and metadata-based permanent failures.",
        migrationNumber: 37,
        lesson: "Any query that builds a 'blocked video IDs' set for the back-catalog engine MUST include both status='failed' AND metadata->>'permanentFail'='true', regardless of status. Using only status misses all videos permanently failed by a migration before their status was updated.",
        tags: ["back-catalog", "permanent-fail", "vault-query"],
      },
      {
        incidentDate: "2026-06-04", category: "schema_bug", service: "startup-migrations",
        severity: "high", status: "resolved",
        rootCause: "cleanupOrphanedQueueItems() Step 3 checked only metadata->>'sourceYoutubeId' (JSONB field). Drizzle ORM inserts populate the source_youtube_id column directly. The column was never checked → all migrations 034/035 orphan queue cancellations silently missed every queue item.",
        fixDescription: "Orphan sweep now checks BOTH source_youtube_id column (Drizzle ORM inserts) AND metadata->>'sourceYoutubeId' JSONB field in a single OR condition.",
        migrationNumber: 36,
        lesson: "autopilot_queue orphan sweeps MUST check BOTH source_youtube_id (the Drizzle ORM column) AND metadata->>'sourceYoutubeId' (the JSONB field). Drizzle ORM and legacy code populate different fields for the same concept — checking only one silently misses the other.",
        tags: ["queue", "orphan-sweep", "drizzle-vs-jsonb"],
      },
      {
        incidentDate: "2026-06-01", category: "schema_bug", service: "channel-management",
        severity: "medium", status: "resolved",
        rootCause: "deleteChannel() included youtube_output_metrics (no channel_id column) and token_vault (doesn't exist in prod) inside the main transaction → transaction rolled back → 500 error on channel disconnect.",
        fixDescription: "Schema tables deleted inside loops; non-schema raw-SQL table deletions moved outside transaction in try/catch.",
        lesson: "deleteChannel() must never include non-Drizzle-schema tables inside the main transaction. Raw-SQL table deletions go outside tx in try/catch — a failed drop of a non-essential table must not roll back the entire channel deletion.",
        tags: ["delete-channel", "transaction", "raw-sql"],
      },
      {
        incidentDate: "2026-06-01", category: "schema_bug", service: "all-services",
        severity: "critical", status: "resolved",
        rootCause: "p-limit v5+ and other pure-ESM packages crash the CJS production build on boot with 'require() of ES Module' error — silent in dev, fatal in prod.",
        fixDescription: "Reverted p-limit to v3; any ESM-only package now requires dynamic import() in server code.",
        lesson: "Before importing ANY new npm package into server code, check its package.json for '\"type\": \"module\"'. Pure-ESM packages crash the CJS prod build silently during dev testing. Use p-limit v3, not v5+. If ESM-only is unavoidable, use dynamic import().",
        tags: ["esm", "cjs", "production-build", "p-limit"],
      },
      {
        incidentDate: "2026-06-01", category: "schema_bug", service: "game-detection",
        severity: "medium", status: "resolved",
        migrationNumber: 32,
        rootCause: "9 services hardcoded 'PS5 Gameplay'/'PS5 Gaming' as the default gameName when game detection failed. This contaminated titles and metadata for BF6 content with irrelevant PS5 branding.",
        fixDescription: "All hardcoded game name fallbacks replaced with getFocusGame(); Migration 032 scrubbed existing contaminated queue items.",
        lesson: "NEVER hardcode a game name as a fallback in any service. Always call getFocusGame() which reads the current focus from system_settings. Hardcoded fallbacks persist for months and contaminate titles, metadata, and thumbnails channel-wide.",
        tags: ["game-detection", "focus-game", "title-contamination"],
      },
      {
        incidentDate: "2026-06-01", category: "vault_failure", service: "pre-encoder",
        severity: "medium", status: "resolved",
        rootCause: "Auto-clip content type was unconditionally treated as a long-form signal; back-catalog Shorts were encoded as 16:9 landscape and landed on the regular video shelf instead of the Shorts shelf.",
        fixDescription: "isShortContent() (based on contentType) added as a veto over type-based isLongForm detection; dual-field timestamp fallback (startSec ?? segmentStartSec) added.",
        lesson: "isLongForm determination MUST check contentType first (isShortContent veto) before checking duration or clip type. A clip type of 'auto-clip' alone is insufficient — a <60s auto-clip is a Short, not a long-form video.",
        tags: ["pre-encoder", "shorts-shelf", "content-type"],
      },
      {
        incidentDate: "2026-06-01", category: "quota_breach", service: "youtube-quota-tracker",
        severity: "high", status: "resolved",
        rootCause: "Quota breaker tripped at T+17min after prod boot despite only 857 tracked units (well below 10k limit). True caller not identified because callerStack logging was absent.",
        fixDescription: "CallerStack logging added to tripGlobalQuotaBreaker(); publishers confirmed to run at midnight Pacific via quota reset cron regardless of daytime trips.",
        lesson: "Add callerStack logging to every quota-breaker trip call so the true caller is always identifiable. A quota breaker trip does NOT necessarily mean the 10k daily limit was hit — verify the actual unit count with callerStack before investigating further.",
        tags: ["quota", "quota-breaker", "caller-stack"],
      },
      {
        incidentDate: "2026-06-01", category: "other", service: "youtube-analytics-intelligence",
        severity: "medium", status: "resolved",
        rootCause: "YouTube Analytics API takes >15s in production; AbortSignal.timeout was set too short → analytics calls timed out and analytics-intelligence-engine fired quota-heavy scan on first boot wave.",
        fixDescription: "AbortSignal.timeout raised to ≥30s; analytics-intelligence-engine boot warmup set to ≥3min after Wave 6.",
        lesson: "YouTube Analytics API MUST use AbortSignal.timeout(30000) minimum in production — it routinely takes >15s. Analytics engines must not scan on first boot — minimum 3min warmup after the OAuth token wave completes.",
        tags: ["analytics", "timeout", "abort-signal"],
      },
    ];

    // Insert all incidents. ON CONFLICT DO NOTHING to keep idempotency if
    // the migration somehow runs partially then re-runs.
    let inserted = 0;
    for (const inc of incidents) {
      try {
        await db.insert(systemIncidentLog).values({
          incidentDate:        inc.incidentDate,
          category:            inc.category,
          service:             inc.service,
          rootCause:           inc.rootCause,
          fixDescription:      inc.fixDescription,
          lesson:              inc.lesson,
          migrationNumber:     inc.migrationNumber ?? null,
          severity:            inc.severity,
          crashesPerDay:       inc.crashesPerDay ?? null,
          status:              inc.status,
          tags:                inc.tags,
          autoDetected:        false,
          promotedToKnowledge: false,
        } as any);
        inserted++;
      } catch {
        // duplicate or constraint violation — skip silently
      }
    }

    log.info(`[Migration 037] Seeded ${inserted}/${incidents.length} system incident records`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 037] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 038: delete ghost channel 52 (ET Gaming 247 / UCdemo placeholder) ──
// Channel 52 has no OAuth tokens and no backup, triggers a boot warning every
// restart, and pollutes the RSS / catalog-sync layer with a UCdemo channel ID.
// Deleting it removes the boot noise and makes channel 53 the sole active channel.
async function migration038DeleteChannel52(): Promise<void> {
  const FLAG = 'migration_038_delete_channel_52';
  if (await getFlag(FLAG)) return;
  try {
    // Cancel any active queue items targeting channel 52's user
    await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Channel 52 (ET Gaming 247) deleted — cancelled by migration 038'
      WHERE  status IN ('scheduled','pending','queued','deferred')
        AND  user_id IN (
          SELECT user_id FROM channels WHERE id = 52
        )
        AND  target_platform = 'youtube'
    `);
    // Delete the channel row — the startup-orchestrator and token guardian
    // will no longer find it and will stop emitting "needs_reconnect" warnings.
    const result = await db.execute(sql`
      DELETE FROM channels WHERE id = 52
    `);
    const deleted = (result as any).rowCount ?? 0;
    if (deleted > 0) {
      log.info(`[Migration 038] Deleted channel 52 (ET Gaming 247) — boot warnings silenced`);
    } else {
      log.info(`[Migration 038] Channel 52 not found — already removed or never existed`);
    }
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 038] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Per-boot vault storm prevention sweep (non-flagged — runs every restart) ──
// The flagged migrations only run once.  New storm videos emerge on every boot
// as the back-catalog engine queues fresh items for videos that were healthy at
// queue-time but later became undownloadable.  This non-flagged sweep runs at
// T+3s on every boot, before any service wave starts, and catches them all:
//
//  Step 1 — Stamp permanentFail:true on all status='failed' vault entries missing it.
//            Prevents resurrection + back-catalog engines from re-queuing them.
//  Step 2 — Fail active vault entries (indexed/queued/downloading) with failCount >= 2.
//            Server crashes before failCount reaches 5 (the old threshold), so we
//            catch storm videos after just 2 failed rounds.
//  Step 3 — Cancel active autopilot_queue items whose sourceYoutubeId references any
//            failed vault entry.  Prevents the publisher from doing pointless work and
//            logging hundreds of "Publish failed" errors per boot.
async function cleanupOrphanedQueueItems(): Promise<void> {
  try {
    // Step 1: stamp permanentFail on all failed vault entries missing the flag
    await db.execute(sql`
      UPDATE content_vault_backups
      SET    metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true}'::jsonb
      WHERE  status = 'failed'
        AND  (metadata->>'permanentFail') IS DISTINCT FROM 'true'
    `);

    // Step 2: fail active vault entries with failCount >= 2
    const stormResult = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"permanentFail":true,"reason":"Auto-failed by per-boot sweep: failCount >= 2 and still active — undownloadable video"}'::jsonb
      WHERE  status IN ('indexed', 'queued', 'downloading')
        AND  (metadata->>'failCount') ~ '^[0-9]+$'
        AND  (metadata->>'failCount')::int >= 2
    `);
    const storms = (stormResult as any).rowCount ?? 0;

    // Step 3: cancel active queue items whose source vault entry is permanently failed.
    // Uses metadata->>'sourceYoutubeId' (JSONB) — autopilot_queue has no source_youtube_id
    // text column; only source_video_id (int FK). Back-catalog items store the YouTube ID
    // in metadata, so this path captures all relevant orphans.
    const orphanResult = await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source vault entry permanently failed — cancelled by per-boot orphan sweep'
      WHERE  status IN ('scheduled','pending','queued','deferred')
        AND  metadata->>'sourceYoutubeId' IS NOT NULL
        AND  metadata->>'sourceYoutubeId' != ''
        AND  EXISTS (
          SELECT 1 FROM content_vault_backups cvb
          WHERE  cvb.youtube_id = (autopilot_queue.metadata->>'sourceYoutubeId')
            AND  cvb.status = 'failed'
        )
    `);
    const orphans = (orphanResult as any).rowCount ?? 0;

    if (storms > 0 || orphans > 0) {
      log.info(`[BootVaultSweep] Stopped ${storms} potential storm vault entries, cancelled ${orphans} orphaned queue items`);
    } else {
      log.info("[BootVaultSweep] Vault clean — no storm entries or orphaned queue items");
    }
  } catch (err: any) {
    log.warn(`[BootVaultSweep] Per-boot vault sweep failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 039: Reset hard-blacklisted pre-encoder items ──────────────────
// Previously, "Requested format is not available" errors caused items to
// immediately jump to preEncoderFailCount=3 (hard-fail), permanently excluding
// them from the pre-encoder.  The pre-encoder now has a vault-first fallback:
// it trims from the full downloaded vault file instead of section-downloading.
// Reset all hard-failed items to count=1 so they get retried with the new logic.
// Items whose vault entry also fails will be skipped via the per-vault-fail check.

async function migration039ResetHardBlacklistedPreEncoderItems(): Promise<void> {
  const FLAG = "migration:039:reset_hard_blacklisted_pre_encoder";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET metadata = (metadata - 'preEncoderHardFail')
        || jsonb_build_object('preEncoderFailCount', 1,
                              'preEncoderResetAt', NOW()::text,
                              'preEncoderResetReason', 'vault-fallback-enabled')
      WHERE status = 'scheduled'
        AND COALESCE((metadata->>'preEncoderHardFail')::boolean, false) = true
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 039] Reset ${count} hard-blacklisted pre-encoder items to count=1 for vault-fallback retry`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 039] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 040: Cancel orphan auto-clip items with no sourceYoutubeId ──────
// The back-catalog runner queued auto-clip items for live_streams that have no
// YouTube video ID (streams that never went live or were not captured).
// These items can never be processed by the pre-encoder — cancel them so they
// stop polluting the queue and triggering spurious pre-encoder failures.

async function migration040CancelOrphanAutoClipsNoYoutubeId(): Promise<void> {
  const FLAG = "migration:040:cancel_orphan_auto_clips_no_ytid";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'Cancelled: auto-clip has no sourceYoutubeId — source stream was never captured on YouTube'
      WHERE type   = 'auto-clip'
        AND status NOT IN ('published', 'failed', 'cancelled', 'permanent_fail')
        AND (metadata->>'sourceYoutubeId' IS NULL OR metadata->>'sourceYoutubeId' = '')
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 040] Cancelled ${count} orphan auto-clip items with no sourceYoutubeId`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 040] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 041: Fail smart-edit items with no videoId ──────────────────────
// The autopilot-monitor recovery logic re-queued failed smart-edit items as new
// "auto_retry_unknown" items but did not carry the videoId forward into metadata.
// These items can never dispatch (the kernel requires videoId to run smart-edit).
// Cancel them so the queue is clean — the original source videos will get fresh
// smart-edit items queued on the next initSmartEditForAllLongVideos cycle.

async function migration041FailSmartEditItemsNoVideoId(): Promise<void> {
  const FLAG = "migration:041:fail_smart_edit_no_video_id";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'Cancelled: smart-edit recovery item is missing videoId — will be re-queued by next initSmartEditForAllLongVideos cycle'
      WHERE type   = 'smart-edit'
        AND status NOT IN ('published', 'failed', 'cancelled', 'permanent_fail')
        AND (metadata->>'videoId' IS NULL OR metadata->>'videoId' = '')
        AND metadata->>'autoFixAction' IS NOT NULL
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 041] Cancelled ${count} smart-edit recovery items with no videoId`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 041] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 042: Backfill videoId in smart-edit items that have source_video_id ─
// queueVideoForSmartEdit() never wrote metadata.videoId, so existing items lack
// that field even though they have the source_video_id FK column.  Backfill it
// so the kernel, handlers, and any future metadata.videoId checks find the value.

async function migration042BackfillSmartEditVideoId(): Promise<void> {
  const FLAG = "migration:042:backfill_smart_edit_video_id";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET metadata = metadata || jsonb_build_object('videoId', source_video_id::text)
      WHERE type = 'smart-edit'
        AND status NOT IN ('published', 'failed', 'cancelled', 'permanent_fail')
        AND source_video_id IS NOT NULL
        AND (metadata->>'videoId' IS NULL OR metadata->>'videoId' = '')
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 042] Backfilled videoId into ${count} smart-edit items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 042] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 043: Cancel auto-clips with no timestamps ────────────────────────
// Auto-clips without startSec/endSec (and no segmentStartSec/segmentEndSec)
// cause the pre-encoder to default to 0–60s for ALL of them, producing identical
// duplicate clips from the first minute of each source video.  Cancel the whole
// batch so the back-catalog runner can refill with properly-timestamped items
// on its next scoring cycle.

async function migration043CancelUntimestampedAutoClips(): Promise<void> {
  const FLAG = "migration:043:cancel_untimestamped_auto_clips";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'cancelled: no startSec/endSec timestamps — would extract duplicate 0–60s segment for every clip'
      WHERE type   = 'auto-clip'
        AND status IN ('scheduled', 'pending')
        AND (metadata->>'startSec')        IS NULL
        AND (metadata->>'endSec')          IS NULL
        AND (metadata->>'segmentStartSec') IS NULL
        AND (metadata->>'segmentEndSec')   IS NULL
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 043] Cancelled ${count} untimestamped auto-clip items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 043] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 044: Fix vod-long-form items with no segment bounds ─────────────
// vod-long-form items created without segmentStartSec/segmentEndSec compute
// rawDurationSec = 0, which causes the long-form publisher to immediately fail
// them as "Segment too short (0m)".  Set generous bounds so the publisher can
// select an optimal experiment duration via pickExperimentDurationSec().

async function migration044FixVodLongFormSegmentBounds(): Promise<void> {
  const FLAG = "migration:044:fix_vod_long_form_segment_bounds";
  if (await getFlag(FLAG)) return;

  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET metadata = metadata || jsonb_build_object('segmentStartSec', 0, 'segmentEndSec', 28800)
      WHERE type   = 'vod-long-form'
        AND status IN ('scheduled', 'pending')
        AND (metadata->>'segmentStartSec') IS NULL
        AND (metadata->>'segmentEndSec')   IS NULL
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 044] Fixed segment bounds on ${count} vod-long-form items (0–28800s)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 044] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 045: permanently fail h6egjqm0Xjc storm video ─────────────────
// 2026-06-11: All yt-dlp clients (tv_embedded, ios, android, web) exhausted
// every format for h6egjqm0Xjc (~20 invocations in one cycle). Video is
// inaccessible. Without this migration the clip-video-processor repeats the
// same 20-invocation storm on every cycle.
async function migration045FailH6egjqm0XjcStormVideo(): Promise<void> {
  const FLAG = "migration:045:fail_h6egjqm0Xjc_storm_video";
  if (await getFlag(FLAG)) return;
  try {
    const vaultResult = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status   = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || '{"failCount":10,"permanentFail":true,"reason":"all yt-dlp clients exhausted all formats — permanently inaccessible (migration 045)"}'::jsonb
      WHERE  youtube_id = 'h6egjqm0Xjc'
    `);
    const queue = await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'failed',
             error_message = 'Source video h6egjqm0Xjc permanently undownloadable — cancelled by migration 045'
      WHERE  status IN ('scheduled','pending','queued','deferred')
        AND  metadata->>'sourceYoutubeId' = 'h6egjqm0Xjc'
    `);
    const vRows = (vaultResult as any).rowCount ?? 0;
    const qRows = (queue as any).rowCount ?? 0;
    log.info(`[Migration 045] Failed ${vRows} vault row(s) and ${qRows} queue item(s) for h6egjqm0Xjc`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 045] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 046: permanently fail non-YouTube stream edit jobs ──────────────
// Stream edit jobs 334 and 426 target "rumble" and "tiktok" platforms.
// The stream editor logs "unknown platform" and skips them, but never marks
// them complete — they loop forever: startup recovery resets them to "queued",
// they run, skip every step, and the cycle repeats. Permanently fail them.
async function migration046FailNonYoutubeStreamEditJobs(): Promise<void> {
  const FLAG = "migration:046:fail_non_youtube_stream_edit_jobs";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE stream_edit_jobs
      SET    status        = 'failed',
             error_message = 'Non-YouTube platform (rumble/tiktok) — not supported; cancelled by migration 046'
      WHERE  status IN ('queued','processing','pending')
        AND  (
          (platforms::text LIKE '%rumble%' OR platforms::text LIKE '%tiktok%')
          AND  (platforms::text NOT LIKE '%youtube%')
        )
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) log.info(`[Migration 046] Failed ${count} non-YouTube stream edit job(s) (rumble/tiktok)`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 046] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 047: strip non-YouTube platforms from stream_edit_jobs ──────────
// stream_edit_jobs were created with platforms=["youtube","shorts","tiktok","rumble"].
// When a job runs, the packager creates one studio video PER platform and the
// auto-publisher queues each one — so ["youtube","shorts"] → 2 identical 53-min
// YouTube uploads. 16,457 non-done jobs have this pattern.
// Fix: collapse every non-done job's platform list to ["youtube"] only.
// The auto-publisher dedup guard in stream-editor-auto-publisher.ts is the
// belt, this migration is the suspenders.
async function migration047StripNonYoutubePlatforms(): Promise<void> {
  const FLAG = "migration:047:strip_non_youtube_platforms_from_stream_edit_jobs";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE stream_edit_jobs
      SET    platforms = '["youtube"]'::jsonb
      WHERE  status NOT IN ('done', 'failed')
        AND  platforms::text LIKE '%youtube%'
        AND  (
          platforms::text LIKE '%shorts%'
          OR platforms::text LIKE '%tiktok%'
          OR platforms::text LIKE '%rumble%'
        )
    `);
    const count = (result as any).rowCount ?? 0;
    log.info(`[Migration 047] Stripped non-YouTube platforms from ${count} stream_edit_job(s) → youtube-only`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 047] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 048: hard-fail pre-encoder items for permanently-undownloadable sources ──
// Three source videos (bKi6jjwG7Ac, T4PKhDhQPp0, Ky7PFPhmF3Q, q_HLUcS7rLE) have no
// DASH/fragmented formats on YouTube — yt-dlp section download fails with "Requested
// format is not available" on every attempt.  The pre-encoder sets preEncoderFailCount=1
// (soft-fail) when vault=indexed, but Math.max(prev,1) never increments past 1 across
// restarts → items cycle forever.  73+ scheduled items for these 4 videos were spawning
// 2 yt-dlp processes (~200 MB each) every few minutes, converging with the back-catalog
// runner at T+15min → OOM crash loop (76 outages / 24h).
//
// Fix: set preEncoderFailCount=3 + preEncoderHardFail=true so the pre-encoder
// selection query (COALESCE(failCount,0) < 3) excludes all of them immediately.
// Also does a general sweep: any scheduled item whose vault entry has failCount>=3
// or permanentFail=true will be hard-failed the same way.
async function migration048HardFailUndownloadablePreEncoderItems(): Promise<void> {
  const FLAG = "migration:048:hard_fail_undownloadable_pre_encoder_items";
  if (await getFlag(FLAG)) return;
  try {
    // ── Explicit list of confirmed no-DASH-format source videos ──────────────
    const explicit = await db.execute(sql`
      UPDATE autopilot_queue
      SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"preEncoderFailCount":3,"preEncoderHardFail":true,"failReason":"source_no_dash_format_undownloadable"}'::jsonb
      WHERE status    = 'scheduled'
        AND type      IN ('auto-clip', 'platform_short')
        AND metadata->>'sourceYoutubeId' IN (
          'T4PKhDhQPp0',
          'q_HLUcS7rLE',
          'bKi6jjwG7Ac',
          'Ky7PFPhmF3Q'
        )
    `);
    const explicitCount = (explicit as any).rowCount ?? 0;

    // ── General sweep: permanentFail=true in vault metadata ──────────────────
    // Wrapped in its own try/catch — the explicit list above handles all known
    // problem videos; the general sweep is best-effort.  Previously used a
    // non-existent `fail_count` column; corrected to `metadata->>'failCount'`.
    let generalCount = 0;
    try {
      const general = await db.execute(sql`
        UPDATE autopilot_queue
        SET    metadata = COALESCE(metadata, '{}'::jsonb)
                       || '{"preEncoderFailCount":3,"preEncoderHardFail":true,"failReason":"vault_permanently_failed"}'::jsonb
        WHERE  status = 'scheduled'
          AND  type   IN ('auto-clip', 'platform_short')
          AND  metadata->>'sourceYoutubeId' IN (
                 SELECT youtube_id
                 FROM   content_vault_backups
                 WHERE  (metadata->>'permanentFail')::boolean IS TRUE
                    OR  (metadata->>'failCount')::int >= 3
               )
      `);
      generalCount = (general as any).rowCount ?? 0;
    } catch (gErr: any) {
      log.warn(`[Migration 048] General sweep non-fatal error: ${gErr?.message}`);
    }

    log.info(`[Migration 048] Hard-failed ${explicitCount} explicit + ${generalCount} vault-failed pre-encoder items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 048] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 049: cancel blocked publishing queue ────────────────────────────
// Three sources of permanently-blocked items that prevent the autopilot queue
// from making progress:
//   1. Items whose sourceYoutubeId is one of the 4 confirmed no-DASH-format
//      videos (T4PKhDhQPp0, q_HLUcS7rLE, bKi6jjwG7Ac, Ky7PFPhmF3Q).  These
//      were marked enc_fail=3 by migration 048, but are still in the queue
//      in pending/scheduled status — pre-encoder skips them, publisher finds
//      no preEncodedPath, and they sit forever.
//   2. Orphaned auto-clip/platform_short items with neither a sourceYoutubeId
//      nor a studioVideoId — they can never be encoded or published.
//   3. studio_auto_publish items for studio videos 357 and 358 (the two AC
//      Valhalla uploads).  Both videos are confirmed live on YouTube by the
//      channel owner; queue items need to be marked published so the poller
//      stops retrying them (and avoids a third duplicate upload).

async function migration049CancelBlockedPublishingQueue(): Promise<void> {
  const FLAG = "migration:049:cancel_blocked_publishing_queue";
  if (await getFlag(FLAG)) return;
  try {
    // 1. Cancel all items from permanently-undownloadable source videos
    //    NOTE: autopilot_queue has NO source_youtube_id column — use metadata->>'sourceYoutubeId' only
    const r1 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'migration049: source video permanently undownloadable — no DASH format available'
      WHERE status NOT IN ('published', 'cancelled', 'failed', 'permanent_fail')
        AND metadata->>'sourceYoutubeId' IN ('T4PKhDhQPp0','q_HLUcS7rLE','bKi6jjwG7Ac','Ky7PFPhmF3Q','9d0pi7uTJ88')
    `);
    log.info(`[Migration 049] Cancelled ${(r1 as any).rowCount ?? 0} bad-source-video queue items`);

    // 2. Cancel orphaned auto-clip / platform_short items with no source or studio ref
    const r2 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'migration049: orphaned item — no sourceYoutubeId and no studioVideoId'
      WHERE status NOT IN ('published', 'cancelled', 'failed', 'permanent_fail')
        AND type IN ('auto-clip', 'platform_short')
        AND COALESCE(metadata->>'sourceYoutubeId', '') = ''
        AND COALESCE(metadata->>'studioVideoId', source_video_id::text, '') = ''
    `);
    log.info(`[Migration 049] Cancelled ${(r2 as any).rowCount ?? 0} orphaned queue items`);

    // 3. Mark studio_auto_publish items for studio 357 / 358 as published.
    //    The channel owner confirmed both AC Valhalla uploads are live on YouTube.
    const r3 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status       = 'published',
          published_at = NOW(),
          error_message = NULL
      WHERE type   = 'studio_auto_publish'
        AND status NOT IN ('published', 'cancelled')
        AND (metadata->>'studioVideoId')::int IN (357, 358)
    `);
    log.info(`[Migration 049] Marked ${(r3 as any).rowCount ?? 0} studio_auto_publish items as published (AC Valhalla, confirmed live)`);

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 049] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 050: fix pending AC Valhalla studio_auto_publish items ──────────
// The vault-clip-exhauster + stream-editor-packager created several AC Valhalla
// studio_auto_publish items whose studio videos were already published to YouTube
// (confirmed by the channel owner on Jun 11 2026).  Without this fix the poller
// would re-upload them every boot until permanently failed, creating duplicates.
//
// Also updates the metadata of any still-queued studio_auto_publish items that
// have isShort implied by their title (containing "#shorts") so the now-fixed
// studio-publisher.ts Short-detection path has a clean signal to read.
async function migration050FixPendingStudioAutoPublishItems(): Promise<void> {
  const FLAG = "migration:050:fix_pending_studio_auto_publish_items";
  if (await getFlag(FLAG)) return;
  try {
    // 1. Mark studio_auto_publish items for AC Valhalla studio videos 359–362
    //    as published — they were confirmed live on YouTube on Jun 11 2026.
    //    (Studio 357 and 358 were already handled by migration 049.)
    const r1 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status       = 'published',
          published_at = NOW(),
          error_message = NULL
      WHERE type   = 'studio_auto_publish'
        AND status NOT IN ('published', 'cancelled')
        AND (metadata->>'studioVideoId')::int IN (359, 360, 361, 362)
    `);
    log.info(`[Migration 050] Marked ${(r1 as any).rowCount ?? 0} studio_auto_publish items as published (AC Valhalla studios 359-362)`);

    // 2. For any still-queued/scheduled studio_auto_publish items whose title
    //    contains "#shorts", inject isShort:true into metadata so the fixed
    //    studio-publisher.ts will add #shorts to the description before upload.
    const r2 = await db.execute(sql`
      UPDATE autopilot_queue
      SET metadata = metadata || '{"isShort":true}'::jsonb
      WHERE type   = 'studio_auto_publish'
        AND status IN ('scheduled', 'pending', 'failed')
        AND (metadata->>'isShort') IS DISTINCT FROM 'true'
        AND content ILIKE '%#shorts%'
    `);
    log.info(`[Migration 050] Injected isShort:true into ${(r2 as any).rowCount ?? 0} queued Short items lacking the flag`);

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 050] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 051: redistribute jammed Short + long-form schedule ─────────────
//
// On Jun 11 2026 YouTube quota was exhausted at ~10:51 UTC.  The back-catalog
// engine subsequently called getNextShortPublishTime() for many items while the
// 14-day saturation cache was set, so it returned fallback = now+6h for all of
// them.  Result: 16 youtube_short items piled at 2026-06-12 07:05:00 UTC
// (= midnight Pacific + 5 min), plus several auto-clip items jammed together.
//
// Fix: redistribute ALL pending/scheduled youtube_short items to a proper 3/day
// cadence spread equally across the day, and all auto-clip/vod-long-form items
// to a proper 1/day cadence.  Both publishers use a 365-day batch window — they
// upload everything as private YouTube videos with publishAt so YouTube handles
// the gradual release.
//
// Windows used (UTC, matching America/Chicago = CDT = UTC-5):
//   Short W0 → 13:00 UTC  (= 08:00 CDT)   morning slot
//   Short W1 → 19:30 UTC  (= 14:30 CDT)   afternoon slot
//   Short W2 → 02:30 UTC  (= 21:30 CDT)   evening slot (next calendar day in UTC)
//   Long-form → 23:30 UTC (= 18:30 CDT)   prime-time slot
//
// 30 Shorts at 3/day fills Jun 12 – Jun 21 (10 days).
// 24 long-form at 1/day fills Jun 12 – Jul 5 (24 days).
async function migration051RedistributeSchedule(): Promise<void> {
  const FLAG = "migration:051:redistribute_schedule";
  if (await getFlag(FLAG)) return;
  try {
    // 1. Clear all future short_slot_claims so getNextShortPublishTime() won't
    //    block new scheduling attempts with stale claim rows.
    const r0 = await db.execute(sql`
      DELETE FROM short_slot_claims
      WHERE claimed_slot > NOW()
    `);
    log.info(`[Migration 051] Cleared ${(r0 as any).rowCount ?? 0} future short_slot_claims`);

    // 2. Redistribute ALL youtube_short items (scheduled/pending) to 3/day
    //    cadence windows.  ROW_NUMBER() preserves relative order (earlier
    //    scheduled_at = earlier new slot).  Starting date: 2026-06-12 UTC.
    //    W0 = 13h, W1 = 19h30m, W2 = 26h30m (= next day 02:30 UTC).
    //    Jitter: 0–7 min per item so slots within the same window differ.
    const r1 = await db.execute(sql`
      WITH ranked AS (
        SELECT id,
               (ROW_NUMBER() OVER (ORDER BY scheduled_at, id) - 1) AS rn
        FROM autopilot_queue
        WHERE type = 'youtube_short'
          AND status IN ('scheduled', 'pending')
          AND target_platform IN ('youtube', 'youtubeshorts')
      )
      UPDATE autopilot_queue q
      SET scheduled_at =
            TIMESTAMP '2026-06-12 00:00:00 UTC'
            + (r.rn / 3) * INTERVAL '1 day'
            + CASE (r.rn % 3)
                WHEN 0 THEN INTERVAL '13 hours'
                WHEN 1 THEN INTERVAL '19 hours 30 minutes'
                WHEN 2 THEN INTERVAL '26 hours 30 minutes'
              END
            + (FLOOR(RANDOM() * 7 * 60)::int) * INTERVAL '1 second'
      FROM ranked r
      WHERE q.id = r.id
    `);
    log.info(`[Migration 051] Redistributed ${(r1 as any).rowCount ?? 0} youtube_short items to 3/day cadence (Jun 12 onwards)`);

    // 3. Redistribute ALL auto-clip and vod-long-form items (scheduled/pending)
    //    to 1/day at 23:30 UTC (18:30 CDT prime-time slot).
    //    Starting date: 2026-06-12 UTC.
    const r2 = await db.execute(sql`
      WITH ranked AS (
        SELECT id,
               (ROW_NUMBER() OVER (ORDER BY scheduled_at, id) - 1) AS rn
        FROM autopilot_queue
        WHERE type IN ('auto-clip', 'vod-long-form')
          AND status IN ('scheduled', 'pending')
          AND target_platform = 'youtube'
      )
      UPDATE autopilot_queue q
      SET scheduled_at =
            TIMESTAMP '2026-06-12 23:30:00 UTC'
            + r.rn * INTERVAL '1 day'
            + (FLOOR(RANDOM() * 7 * 60)::int) * INTERVAL '1 second'
      FROM ranked r
      WHERE q.id = r.id
    `);
    log.info(`[Migration 051] Redistributed ${(r2 as any).rowCount ?? 0} long-form items to 1/day cadence (Jun 12 onwards)`);

    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 051] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 052: BF6-only 30-day focus — cancel non-BF6 queue, lock catalog ─
//
// User directive (Jun 11 2026): all content over the next 30 days must be
// Battlefield 6.  The current queue contains two problems:
//
//  1. 53 auto-clip items titled "Pure PS5 gameplay — no commentary" sourced
//     from videos 74136 (AC Shadows) and 74123 (unlabelled "AI tactics") —
//     clearly not BF6.  Cancel all.
//
//  2. 1 youtube_short item (id=39743) is a stream-replay from GxD1IE7UH7s
//     with gameName="AI" — sourced from the AC Shadows stream.  Cancel it.
//
// Catalog surgery (prevents recurrence):
//  - Block all non-BF6 back_catalog_videos from being mined again by setting
//    mined_for_shorts + mined_for_long_form = true for every video whose
//    game_name is not 'Battlefield 6'.  This stops the engine from ever
//    queueing AC Valhalla (256 videos), BF2042, AC Shadows etc. going forward.
//  - Reset all 45 Battlefield 6 catalog videos to unmined so the engine
//    generates 30+ days of BF6 Shorts + long-form on its next cycle.
//  - Fix source video 72154 whose title says "Battlefield 6" but whose
//    gameName was incorrectly set to "AI".
async function migration052Bf6OnlyFocus(): Promise<void> {
  const FLAG = "migration:052:bf6_only_30day_focus";
  if (await getFlag(FLAG)) return;
  try {
    // 1. Cancel all auto-clip items (non-BF6 "Pure PS5 gameplay" content)
    const r1 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'BF6-only focus: non-BF6 auto-clip cancelled (Jun 11 2026 directive)'
      WHERE type   = 'auto-clip'
        AND status IN ('scheduled', 'pending')
        AND target_platform = 'youtube'
    `);
    log.info(`[Migration 052] Cancelled ${(r1 as any).rowCount ?? 0} non-BF6 auto-clip items`);

    // 2. Cancel the 1 non-BF6 youtube_short (stream replay from AC Shadows)
    const r2 = await db.execute(sql`
      UPDATE autopilot_queue
      SET status        = 'cancelled',
          error_message = 'BF6-only focus: stream replay from non-BF6 source cancelled'
      WHERE id = 39743
        AND type = 'youtube_short'
        AND status IN ('scheduled', 'pending')
    `);
    log.info(`[Migration 052] Cancelled ${(r2 as any).rowCount ?? 0} non-BF6 stream-replay youtube_short`);

    // 3. Block all non-BF6 back_catalog_videos from ever being mined again.
    //    Sets both mined_for_shorts AND mined_for_long_form = true for every
    //    catalog video whose game_name is not exactly 'Battlefield 6'.
    const r3 = await db.execute(sql`
      UPDATE back_catalog_videos
      SET mined_for_shorts    = true,
          mined_for_long_form = true
      WHERE channel_id = 53
        AND (game_name IS DISTINCT FROM 'Battlefield 6'
             OR game_name IS NULL)
    `);
    log.info(`[Migration 052] Locked ${(r3 as any).rowCount ?? 0} non-BF6 catalog videos from future mining`);

    // 4. Reset all 45 Battlefield 6 catalog videos to unmined so the
    //    back-catalog engine mines them fresh on its next boot cycle.
    const r4 = await db.execute(sql`
      UPDATE back_catalog_videos
      SET mined_for_shorts    = false,
          mined_for_long_form = false
      WHERE channel_id = 53
        AND game_name = 'Battlefield 6'
    `);
    log.info(`[Migration 052] Reset ${(r4 as any).rowCount ?? 0} BF6 catalog videos to unmined`);

    // 5. Fix gameName on video 72154 — title says "Battlefield 6" but was
    //    labelled "AI" by the grinder.  Correct so future indexing is clean.
    const r5 = await db.execute(sql`
      UPDATE videos
      SET metadata = metadata || '{"gameName":"Battlefield 6"}'::jsonb
      WHERE id = 72154
        AND metadata->>'gameName' IS DISTINCT FROM 'Battlefield 6'
    `);
    log.info(`[Migration 052] Fixed gameName on video 72154: ${(r5 as any).rowCount ?? 0} row(s) updated`);

    await setFlag(FLAG);
    log.info("[Migration 052] BF6-only 30-day focus complete — queue cleaned, catalog locked to BF6");
  } catch (err: any) {
    log.warn(`[Migration 052] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 053: Seed 30-day BF6 long-form schedule from Jun 12 ─────────────
//
// After migration 052 cancelled all non-BF6 long-form items the queue has
// zero long-form entries.  The back-catalog engine mines and queues them at
// T+10–20 min on boot, but the user needs the cadence to start on Jun 12
// (the next quota reset) not whenever the engine eventually fills slots.
//
// This migration seeds one auto-clip long-form item per day for 30 days
// (Jun 12 – Jul 11 2026) at 23:30 UTC + 0-7 min jitter, sourced from the
// 30 longest Battlefield 6 catalog videos.  Each seeded video is immediately
// marked mined_for_long_form = true so the engine doesn't double-queue it.
// The engine's mining output will fill days > 30 or top up if fewer than
// 30 BF6 videos are available.
async function migration053SeedBf6LongFormSchedule(): Promise<void> {
  const FLAG = "migration:053:seed_bf6_longform_30day";
  if (await getFlag(FLAG)) return;
  try {
    // Only seed if the long-form window is actually empty for Jun 12+
    const existing = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM autopilot_queue
      WHERE type IN ('auto-clip','vod-long-form')
        AND status IN ('scheduled','pending')
        AND target_platform = 'youtube'
        AND scheduled_at >= TIMESTAMP '2026-06-12 00:00:00'
    `);
    const cnt = Number((existing.rows?.[0] as any)?.cnt ?? 0);
    if (cnt >= 10) {
      log.info(`[Migration 053] ${cnt} long-form items already scheduled — skipping seed`);
      await setFlag(FLAG);
      return;
    }

    // Insert one auto-clip per day for 30 days, sourced from the 30 longest
    // BF6 catalog videos.  Uses a CTE with ROW_NUMBER to assign one day each.
    // Jitter: (ROW_NUMBER % 8) minutes so no two items land at the same second.
    const r1 = await db.execute(sql`
      WITH ranked_bf6 AS (
        SELECT
          id                AS catalog_id,
          youtube_video_id  AS yt_id,
          title             AS vid_title,
          ROW_NUMBER() OVER (ORDER BY COALESCE(duration_seconds,0) DESC) - 1 AS rn
        FROM back_catalog_videos
        WHERE channel_id = 53
          AND game_name   = 'Battlefield 6'
          AND youtube_video_id IS NOT NULL
        LIMIT 30
      )
      INSERT INTO autopilot_queue
        (user_id, channel_id, type, target_platform, content, status, scheduled_at, metadata)
      SELECT
        '7210ff92-76dd-4d0a-80bb-9eb5be27508b',
        53,
        'auto-clip',
        'youtube',
        COALESCE(NULLIF(TRIM(vid_title),''), 'Battlefield 6 Gameplay — Full Session') ||
          E'\n\nBattlefield 6 PS5 gameplay — no commentary, no distractions.',
        'scheduled',
        TIMESTAMP '2026-06-12 23:30:00'
          + (rn::integer * INTERVAL '1 day')
          + ((rn % 8)::integer * INTERVAL '1 minute'),
        jsonb_build_object(
          'gameName',       'Battlefield 6',
          'sourceYoutubeId', yt_id,
          'contentType',    'long-form',
          'seededBy',       'migration053'
        )
      FROM ranked_bf6
    `);
    const inserted = (r1 as any).rowCount ?? 0;
    log.info(`[Migration 053] Seeded ${inserted} BF6 long-form items (Jun 12 – Jul 11 2026)`);

    // Mark those same catalog videos as mined_for_long_form so the engine
    // doesn't create duplicate long-form entries for them.
    const r2 = await db.execute(sql`
      UPDATE back_catalog_videos
      SET mined_for_long_form = true
      WHERE channel_id    = 53
        AND game_name     = 'Battlefield 6'
        AND youtube_video_id IS NOT NULL
        AND id IN (
          SELECT id
          FROM back_catalog_videos
          WHERE channel_id = 53
            AND game_name  = 'Battlefield 6'
            AND youtube_video_id IS NOT NULL
          ORDER BY COALESCE(duration_seconds,0) DESC
          LIMIT 30
        )
    `);
    log.info(`[Migration 053] Marked ${(r2 as any).rowCount ?? 0} BF6 catalog videos as mined_for_long_form`);

    await setFlag(FLAG);
    log.info("[Migration 053] BF6 30-day long-form schedule seeded — cadence starts Jun 12 2026");
  } catch (err: any) {
    log.warn(`[Migration 053] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 054: fix pile-up & reseed BF6 long-form schedule ───────────────
// Migration 053 was tripped by its own cnt>=10 guard — the back-catalog engine
// re-generated 8 auto-clip items from source vFEd5Xckrhs (all at 07:05 UTC,
// the quota-reset fallback time) immediately after migration 052 cleared the
// queue.  Those 8 items made cnt=10, so 053 skipped seeding.
// This migration:
//   1. Cancels those pile-up items.
//   2. Guards on the seededBy marker (not raw item count) so the engine can't
//      trick it again.
//   3. Inserts the 30-day BF6 long-form schedule starting Jun 12 23:30 UTC.
//   4. Marks the 30 source catalog videos as mined_for_long_form so the engine
//      won't regenerate pile-up items in subsequent runs.
async function migration054FixLongFormSchedule(): Promise<void> {
  const FLAG = "migration:054:fix_longform_schedule_v2";
  if (await getFlag(FLAG)) return;
  try {
    // Step 1 — Cancel pile-up auto-clip items at the quota-reset fallback time.
    // These are the 8 items generated by the back-catalog engine immediately
    // after migration 052 (all source vFEd5Xckrhs, all at 07:05 UTC Jun 12).
    const c1 = await db.execute(sql`
      UPDATE autopilot_queue
      SET    status        = 'cancelled',
             error_message = 'migration054: pile-up item at quota-reset fallback time — replaced by spread schedule'
      WHERE  type   = 'auto-clip'
        AND  status IN ('scheduled','pending')
        AND  scheduled_at >= TIMESTAMP '2026-06-12 07:00:00'
        AND  scheduled_at <  TIMESTAMP '2026-06-12 07:10:00'
        AND  target_platform = 'youtube'
    `);
    log.info(`[Migration 054] Cancelled ${(c1 as any).rowCount ?? 0} pile-up auto-clip items at 07:05`);

    // Step 2 — Guard: skip seeding if any seededBy=migration053 or migration054
    // items already exist (prevents double-insertion on re-run).
    const existing = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM   autopilot_queue
      WHERE  metadata->>'seededBy' IN ('migration053','migration054')
        AND  status IN ('scheduled','pending')
    `);
    const cnt = Number((existing.rows?.[0] as any)?.cnt ?? 0);
    if (cnt >= 5) {
      log.info(`[Migration 054] ${cnt} seeded long-form items already exist — skipping insert`);
      await setFlag(FLAG);
      return;
    }

    // Step 3 — Insert 30 BF6 long-form slots (Jun 12 23:30 → Jul 11 23:37 UTC).
    const r1 = await db.execute(sql`
      WITH ranked_bf6 AS (
        SELECT
          id                AS catalog_id,
          youtube_video_id  AS yt_id,
          title             AS vid_title,
          ROW_NUMBER() OVER (ORDER BY COALESCE(duration_seconds,0) DESC) - 1 AS rn
        FROM back_catalog_videos
        WHERE channel_id       = 53
          AND game_name        = 'Battlefield 6'
          AND youtube_video_id IS NOT NULL
        LIMIT 30
      )
      INSERT INTO autopilot_queue
        (user_id, channel_id, type, target_platform, content, status, scheduled_at, metadata)
      SELECT
        '7210ff92-76dd-4d0a-80bb-9eb5be27508b',
        53,
        'auto-clip',
        'youtube',
        COALESCE(NULLIF(TRIM(vid_title),''), 'Battlefield 6 — Full Session') ||
          E'\n\nBattlefield 6 PS5 gameplay — no commentary, no distractions.',
        'scheduled',
        TIMESTAMP '2026-06-12 23:30:00'
          + (rn::integer * INTERVAL '1 day')
          + ((rn::integer % 8) * INTERVAL '1 minute'),
        jsonb_build_object(
          'gameName',        'Battlefield 6',
          'sourceYoutubeId', yt_id,
          'contentType',     'long-form',
          'seededBy',        'migration054'
        )
      FROM ranked_bf6
    `);
    log.info(`[Migration 054] Seeded ${(r1 as any).rowCount ?? 0} BF6 long-form slots (Jun 12–Jul 11)`);

    // Step 4 — Mark the 30 source catalog videos as mined_for_long_form so
    // the engine doesn't regenerate pile-up items on the next cycle.
    const r2 = await db.execute(sql`
      UPDATE back_catalog_videos
      SET    mined_for_long_form = true
      WHERE  channel_id        = 53
        AND  game_name         = 'Battlefield 6'
        AND  youtube_video_id  IS NOT NULL
        AND  id IN (
               SELECT id
               FROM   back_catalog_videos
               WHERE  channel_id       = 53
                 AND  game_name        = 'Battlefield 6'
                 AND  youtube_video_id IS NOT NULL
               ORDER BY COALESCE(duration_seconds,0) DESC
               LIMIT 30
             )
    `);
    log.info(`[Migration 054] Marked ${(r2 as any).rowCount ?? 0} BF6 catalog videos as mined_for_long_form`);

    await setFlag(FLAG);
    log.info("[Migration 054] Done — BF6 30-day long-form schedule seeded, pile-up cleared");
  } catch (err: any) {
    log.warn(`[Migration 054] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 055 — Blacklist stuck "format not available" pre-encoder items ──
// These are autopilot_queue items with preEncoderFailCount=1 and a
// "format is not available" error.  The old soft-fail logic kept the counter at
// Math.max(prevCount,1)=1 forever, so they never hit the >=3 exclusion gate.
// Set failCount=3 so they are permanently excluded from the pre-encoder and
// the publisher attempts a live download instead.
async function migration055BlacklistFormatErrorItems(): Promise<void> {
  const FLAG = "migration:055:blacklist_format_error_items_v1";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET    metadata = jsonb_set(
               jsonb_set(
                 metadata,
                 '{preEncoderFailCount}', '3'::jsonb
               ),
               '{preEncoderHardFail}', 'true'::jsonb
             )
      WHERE  status IN ('scheduled','pending')
        AND  (metadata->>'preEncoderFailCount')::int = 1
        AND  (
          metadata->>'preEncoderLastError' ILIKE '%format is not available%'
          OR metadata->>'preEncoderLastError' ILIKE '%Requested format%'
        )
    `);
    const n = (result as any).rowCount ?? 0;
    log.info(`[Migration 055] Blacklisted ${n} stuck "format not available" pre-encoder items`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 055] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 056 — Recover vault entries incorrectly skipped due to 401 bug ──
// Before the InnerTube 401/400 fix, all InnerTube 401 responses (expired OAuth
// token) counted toward the http400FailCount and triggered PERM_UNAVAILABLE when
// all clients returned 401.  This permanently skipped 283 videos that are actually
// public and downloadable.  Reset them to "indexed" so yt-dlp retries them.
async function migration056RecoverFalse401PermSkips(): Promise<void> {
  const FLAG = "migration:056:recover_false_401_perm_skips_v1";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE content_vault_backups
      SET    status        = 'indexed',
             download_error = NULL,
             metadata      = jsonb_strip_nulls(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     COALESCE(metadata, '{}'::jsonb),
                     '{failCount}', '0'::jsonb
                   ),
                   '{permanentSkip}', 'null'::jsonb
                 ),
                 '{recoveredBy}', '"migration056"'::jsonb
               )
             )
      WHERE  status         = 'skipped'
        AND  download_error ILIKE '%HTTP_400_ALL_CLIENTS%'
    `);
    const n = (result as any).rowCount ?? 0;
    log.info(`[Migration 056] Recovered ${n} vault entries incorrectly skipped due to InnerTube 401 bug`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 056] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 057 — Log June 2026 production bug sweep to incident log ────────
// Each entry feeds the learning brain's daily cycle, which promotes critical/high
// incidents to masterKnowledgeBank so every AI prompt gains the lessons.
async function migration057LogJune2026Incidents(): Promise<void> {
  const FLAG = "migration:057:log_june2026_incidents_v1";
  if (await getFlag(FLAG)) return;
  try {
    const { logSystemIncident } = await import("./incident-log");

    await logSystemIncident({
      incidentDate:  "2026-06-12",
      category:      "vault_failure",
      service:       "video-vault / downloadViaInnerTube",
      severity:      "critical",
      rootCause:
        "HTTP 401 (expired OAuth Bearer token) was counted in http400FailCount alongside " +
        "HTTP 400 (video unavailable). When both ANDROID + IOS InnerTube clients returned 401, " +
        "http400FailCount reached INNERTUBE_CLIENTS.length and PERM_UNAVAILABLE:HTTP_400_ALL_CLIENTS " +
        "was thrown — permanently skipping the video without trying yt-dlp. This blocked 283 public " +
        "videos that were fully downloadable. 401 means the auth TOKEN is bad, not the video is gone.",
      fixDescription:
        "Added separate http401FailCount counter. 401s now try the unauthenticated fallback " +
        "(same as 400). If unauth fallback also fails, http401FailCount is incremented but NOT " +
        "http400FailCount. PERM_UNAVAILABLE only fires when http400FailCount >= clients.length " +
        "AND http401FailCount === 0. For 401-only failures the function returns false so yt-dlp " +
        "downloads the video as a public resource. Migration 056 recovered all 283 wrongly-skipped " +
        "vault entries back to indexed status.",
      lesson:
        "NEVER conflate HTTP 401 (authentication error) with HTTP 400 (bad request / video unavailable). " +
        "401 means the Bearer token is expired — the content itself is still accessible. " +
        "Treat 401 as a soft credential failure: try unauthenticated, then fall through to yt-dlp. " +
        "Only throw PERM_UNAVAILABLE when the unauthenticated path also rejects, confirming true unavailability.",
      migrationNumber: 56,
      status: "resolved",
      tags: ["innertube", "401", "perm-unavailable", "vault", "oauth-expired"],
    });

    await logSystemIncident({
      incidentDate:  "2026-06-12",
      category:      "hot_loop",
      service:       "pre-encoder",
      severity:      "high",
      rootCause:
        "Pre-encoder used Math.max(prevCount, 1) for the preEncoderFailCount update when the vault " +
        "had a video indexed (but not yet downloaded). This clamped the counter to 1 on every retry, " +
        "so items with vault-indexed-only format errors NEVER reached the >=3 blacklist threshold. " +
        "7 items (vFEd5Xckrhs, V_fIPnGxHRs, KytCt-M8Vho, others) burned yt-dlp section-download " +
        "slots on every pre-encoder cycle indefinitely.",
      fixDescription:
        "Changed Math.max(prevCount, 1) to prevCount + 1 so the counter increments normally " +
        "through 1→2→3 regardless of vault status. Items reaching >=3 are excluded by the SELECT " +
        "gate and stop consuming slots. Migration 055 immediately set preEncoderFailCount=3 for all " +
        "existing scheduled items where preEncoderLastError contains 'format is not available' " +
        "and count was stuck at 1.",
      lesson:
        "Math.max(prevCount, N) as a soft-fail counter is a trap: it pins the value at N forever. " +
        "Always use prevCount + 1 for retry counters, even when you want a minimum floor. " +
        "If you need to distinguish 'first attempt' from 'retriable', use a separate boolean flag — " +
        "never encode state in a clamped counter.",
      migrationNumber: 55,
      status: "resolved",
      tags: ["pre-encoder", "soft-fail", "format-not-available", "counter-clamp-trap"],
    });

    await logSystemIncident({
      incidentDate:  "2026-06-12",
      category:      "other",
      service:       "pipeline-self-heal",
      severity:      "medium",
      rootCause:
        "runPipelineSelfHeal() called Promise.all() over 7 parallel heal functions. Any single heal " +
        "step throwing (e.g., transient DB lock contention) caused the entire Promise.all to reject, " +
        "which propagated out of runPipelineSelfHeal and was caught by the setInterval error handler " +
        "as 'Periodic run FAILED'. All other heal steps that would have succeeded were abandoned, " +
        "and stuck items in other tables were not reset.",
      fixDescription:
        "Replaced Promise.all() with Promise.allSettled(). Each heal result is extracted safely " +
        "(defaulting to 0 on rejection). Individual failures are logged as non-fatal warnings with " +
        "the specific step name so they remain visible without crashing the entire run.",
      lesson:
        "Use Promise.allSettled() (not Promise.all()) whenever running parallel independent tasks " +
        "where failure of one should NOT block the others. Promise.all is correct only when all " +
        "results are required together. In health/heal loops, isolation is more important than atomicity.",
      status: "resolved",
      tags: ["promise-all", "self-heal", "error-isolation"],
    });

    await logSystemIncident({
      incidentDate:  "2026-06-12",
      category:      "ai_queue",
      service:       "ai-semaphore / self-healing-core",
      severity:      "medium",
      rootCause:
        "BACKGROUND_MAX_QUEUE_DEPTH was set to 2, allowing only 2 background callers to queue " +
        "simultaneously. At midnight (UTC quota reset), TrendPredictor, ContentCompounding, and " +
        "other background engines all attempted to run concurrently. With 4 AI slots total and " +
        "2-deep background queue, callers arriving 3rd and beyond received 'AI queue full' and " +
        "their work was dropped silently for that cycle.",
      fixDescription:
        "Increased BACKGROUND_MAX_QUEUE_DEPTH from 2 to 4. This allows more background callers " +
        "to queue at the midnight convergence point without dropping work. Critical-path callers " +
        "(publishers, live chat) still get priority via the foreground/background slot distinction.",
      lesson:
        "Background AI queue depth must be sized for the midnight quota-reset convergence spike, " +
        "not for steady-state operation. Count how many background engines fire within the same " +
        "15-minute window after midnight and set depth >= that count. Dropped background work " +
        "often goes unnoticed because acquireAISlotBackground() fail-fast callers just log a warn.",
      status: "resolved",
      tags: ["ai-semaphore", "background-queue", "midnight-convergence"],
    });

    await setFlag(FLAG);
    log.info("[Migration 057] Logged 4 June 2026 production incidents to system_incident_log");
  } catch (err: any) {
    log.warn(`[Migration 057] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 058 — Blacklist confirmed all-clients-fail storm videos ──────────
// Root cause of 21 outages on Jun 11-12:
//   1. vFEd5Xckrhs (and similar videos) fail ALL yt-dlp clients/formats
//   2. Maximizer catch-up creates 17 queue experiments at T+2s on every boot
//   3. Each experiment triggers clip-video-processor → 25 sequential yt-dlp spawns
//   4. At T+16min this converges with back-catalog/grinder → OOM crash → repeat
// Fix:
//   - Mark confirmed storm video IDs as status='failed'+permanentFail=true in vault
//   - Cancel all pending/scheduled autopilot_queue items for these source videos
//   - General sweep: any format-not-available vault entries get permanentFail=true
//     so the no-expiry preload in clip-video-processor.ts blocks them permanently
async function migration058BlacklistStormVideos(): Promise<void> {
  const FLAG = "migration:058:blacklist_storm_videos_v1";
  if (await getFlag(FLAG)) return;
  try {
    // Confirmed all-clients-fail videos from production crash logs (Jun 11-12, 2026)
    const STORM_IDS = ["vFEd5Xckrhs", "990MjVBCiIA", "HNXKbE_wcuY", "xZICplRIdpc"];

    for (const ytId of STORM_IDS) {
      // Update existing vault rows to failed + permanentFail=true
      await db.execute(sql`
        UPDATE content_vault_backups
        SET status        = 'failed',
            download_error = COALESCE(download_error,
                             'All download clients failed: format not available (confirmed storm video)'),
            metadata       = COALESCE(metadata, '{}'::jsonb)
                             || '{"permanentFail": true}'::jsonb
        WHERE youtube_id = ${ytId}
          AND status != 'downloaded'
      `);

      // Insert a sentinel row if no vault entry exists yet (so preload can find it)
      await db.execute(sql`
        INSERT INTO content_vault_backups
               (user_id, youtube_id, platform, content_type, status, download_error, metadata)
        SELECT 'system', ${ytId}, 'youtube', 'video', 'failed',
               'All download clients failed: format not available (confirmed storm video)',
               '{"permanentFail": true}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM content_vault_backups WHERE youtube_id = ${ytId}
        )
      `);

      // Cancel all pending/scheduled autopilot_queue items whose metadata references
      // this YouTube ID.  The `videos` table has no youtube_id column — the storm
      // video ID is stored in autopilot_queue.metadata->>'sourceYoutubeId'.
      // Wrap in its own try/catch so a failure here never aborts vault-row creation
      // for the remaining storm IDs in the loop.
      try {
        await db.execute(sql`
          UPDATE autopilot_queue
          SET status   = 'permanent_fail',
              metadata = COALESCE(metadata, '{}'::jsonb)
                         || '{"permanentFail": true, "failReason": "source video permanently inaccessible"}'::jsonb
          WHERE (metadata->>'sourceYoutubeId') = ${ytId}
            AND status IN ('scheduled', 'pending')
        `);
      } catch (qErr: any) {
        log.warn(`[Migration 058] autopilot_queue cancel for ${ytId} failed (non-fatal): ${qErr?.message}`);
      }
    }

    // General sweep: any vault entry with format-not-available or permanent-inaccessibility
    // error gets permanentFail=true stamped into metadata.  The clip-video-processor boot
    // preload loads all status='failed' rows and marks them neverExpire=true, so these
    // are blocked permanently without needing the 24h re-expiry cycle.
    await db.execute(sql`
      UPDATE content_vault_backups
      SET metadata = COALESCE(metadata, '{}'::jsonb)
                     || '{"permanentFail": true}'::jsonb
      WHERE status IN ('failed', 'skipped')
        AND COALESCE((metadata->>'permanentFail')::boolean, false) = false
        AND (
          download_error LIKE '%format is not available%'
          OR download_error LIKE '%format strategies failed%'
          OR download_error LIKE '%permanently inaccessible%'
          OR download_error LIKE '%geo-blocked%'
          OR download_error LIKE '%live-only%'
          OR download_error LIKE '%DRM%'
          OR download_error LIKE '%Permanent:%'
        )
    `);

    await setFlag(FLAG);
    log.info("[Migration 058] Blacklisted storm video IDs + cancelled dependent queue items");

    // Log as a resolved incident so learning brain captures this crash pattern
    try {
      const { logMigrationResolution } = await import("./incident-log");
      await logMigrationResolution({
        migrationNumber: 58,
        category:        "storm_video",
        service:         "clip-video-processor / content-maximizer",
        severity:        "critical",
        crashesPerDay:   21,
        rootCause:
          "vFEd5Xckrhs and 3 other videos fail ALL yt-dlp clients/formats but were not " +
          "permanently blocked in clip-video-processor. The Maximizer catch-up fires at T+2s " +
          "on every boot (before the async permanent-fail preload completes) and creates 17 " +
          "queue experiments, each triggering 25 sequential yt-dlp spawns. At T+16min this " +
          "converged with back-catalog/grinder/publisher sweep → OOM kill → crash → repeat.",
        fixDescription:
          "1. clip-video-processor.ts: added _preloadPromise gate — downloadSourceVideo() " +
          "awaits the DB preload before any yt-dlp attempt. " +
          "2. neverExpire=true flag on all DB-loaded vault failures — 24h timer no longer " +
          "re-enables videos that the vault has marked as permanently failed. " +
          "3. Migration 058: marked vFEd5Xckrhs, 990MjVBCiIA, HNXKbE_wcuY, xZICplRIdpc as " +
          "status=failed + permanentFail=true in content_vault_backups. Cancelled all pending " +
          "autopilot_queue items for these source videos. General sweep: all format-not-available " +
          "vault entries stamped with permanentFail=true.",
        lesson:
          "Any video that fails ALL download clients (all formats × all yt-dlp clients) must be " +
          "permanently blacklisted with no time-based expiry. The 24h PERMANENT_FAIL_EXPIRY_MS " +
          "is only appropriate for transient failures. Videos confirmed inaccessible must be " +
          "stored in content_vault_backups with permanentFail=true and the boot preload must " +
          "complete BEFORE any download attempt. Never let the Maximizer create queue experiments " +
          "for a source video that is permanently blocked.",
        tags: ["storm-video", "yt-dlp", "clip-video-processor", "maximizer", "preload-race", "24h-expiry"],
      });
    } catch { /* non-fatal */ }
  } catch (err: any) {
    log.warn(`[Migration 058] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 059 — Widen file_size columns from INT4 → BIGINT ────────────────
// Root cause: content_vault_backups.file_size is INT4 (max ~2.1 GB). Long-form
// gaming stream downloads (BF6 etc.) are typically 2-4+ GB. When the InnerTube
// client successfully downloads a file > 2.1 GB the DB UPDATE to mark it
// "downloaded" throws a PostgreSQL integer overflow error, the vault record
// stays in its previous state, and the file is orphaned on disk.
// Example from prod logs Jun 12 2026:
//   vPapOhtN3dQ: 2,780,652,886 bytes downloaded OK → UPDATE failed → yt-dlp fallback
// Same issue exists in studio_videos and asset_library.
async function migration059FixFileSizeBigint(): Promise<void> {
  const FLAG = "migration:059:file_size_bigint_v1";
  if (await getFlag(FLAG)) return;
  try {
    // content_vault_backups — the critical table where this causes vault failures
    await db.execute(sql`
      ALTER TABLE content_vault_backups
        ALTER COLUMN file_size TYPE bigint USING file_size::bigint
    `);
    log.info("[Migration 059] content_vault_backups.file_size → bigint");

    // studio_videos — stream-editor output files can also be large
    await db.execute(sql`
      ALTER TABLE studio_videos
        ALTER COLUMN file_size TYPE bigint USING file_size::bigint
    `);
    log.info("[Migration 059] studio_videos.file_size → bigint");

    // asset_library — creative assets, less likely to exceed 2 GB but fixed for consistency
    await db.execute(sql`
      ALTER TABLE asset_library
        ALTER COLUMN file_size TYPE bigint USING file_size::bigint
    `);
    log.info("[Migration 059] asset_library.file_size → bigint");

    await setFlag(FLAG);
    log.info("[Migration 059] All file_size columns widened to bigint — vault downloads for files > 2 GB now work correctly");
  } catch (err: any) {
    log.warn(`[Migration 059] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 060 — Purge non-BF6 Shorts from the queue ──────────────────────
// When the back-catalog engine's focus gate bypassed (BF6 catalog exhausted),
// it queued AC Valhalla and other non-BF6 Shorts.  Publishing off-brand content
// drives subscriber churn (screenshot Jun 12 2026: two AC Valhalla Shorts, -13
// subs in 28 days).  The engine gate is now fixed to keep gameFilter=matchesGame
// always — this migration cleans up items already in the queue.
//
// Safe: only cancels scheduled/pending SHORT-type items for non-BF6 games.
// Long-form clips (contentType=long-form-clip) and items with no gameName are
// preserved — null gameName could be undetected BF6 footage.
async function migration060PurgeNonBF6Shorts(): Promise<void> {
  const FLAG = "migration:060:purge_non_bf6_shorts_v1";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET
        status        = 'permanent_fail',
        error_message = 'migration060: non-focus-game Short removed — channel focus is Battlefield 6'
      WHERE status IN ('scheduled', 'pending')
        AND type IN ('auto-clip', 'platform_short', 'youtube_short', 'vod-short')
        AND COALESCE(metadata->>'contentType', '') NOT IN ('long-form-clip', 'vod_long_form')
        AND (metadata->>'gameName') IS NOT NULL
        AND (metadata->>'gameName') != ''
        AND (metadata->>'gameName') NOT ILIKE '%battlefield%'
        AND (metadata->>'gameName') NOT ILIKE '%bf6%'
        AND (metadata->>'gameName') NOT ILIKE '%bf 6%'
    `);
    const cancelled = (result as any).rowCount ?? (result as any).count ?? 0;
    log.info(`[Migration 060] Cancelled ${cancelled} non-BF6 Shorts from autopilot queue`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 060] Failed (non-fatal): ${err?.message}`);
  }
}

// ── Migration 061: purge non-BF6 queue items that slipped past the focus gate ──
// Migration 060 ran once-and-flagged, but new leaks (AC IV, Sonic, Gaming, AI
// as gameName) continued to enter the queue via two unfixed code paths:
//   1. queuePastStreamContent had no focus-game gate (now fixed).
//   2. Wrong catalog game names were written to queue metadata when the
//      gameFilter passed a video via its title rather than gameName (now fixed).
// This migration purges any scheduled/pending items still carrying a non-BF6
// gameName.  Uses a new v2 flag so it re-runs independently of migration 060.

async function migration061PurgeNonBF6SlippageItems(): Promise<void> {
  const FLAG = "migration:061:purge_non_bf6_slippage_v1";
  if (await getFlag(FLAG)) return;
  try {
    const result = await db.execute(sql`
      UPDATE autopilot_queue
      SET
        status        = 'permanent_fail',
        error_message = 'migration061: non-focus-game content removed — channel focus is Battlefield 6'
      WHERE status IN ('scheduled', 'pending')
        AND (metadata->>'gameName') IS NOT NULL
        AND (metadata->>'gameName') != ''
        AND (metadata->>'gameName') NOT ILIKE '%battlefield%'
        AND (metadata->>'gameName') NOT ILIKE '%bf6%'
        AND (metadata->>'gameName') NOT ILIKE '%bf 6%'
    `);
    const cancelled = (result as any).rowCount ?? (result as any).count ?? 0;
    log.info(`[Migration 061] Cancelled ${cancelled} non-BF6 slippage items from autopilot queue`);
    await setFlag(FLAG);
  } catch (err: any) {
    log.warn(`[Migration 061] Failed (non-fatal): ${err?.message}`);
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
    await migration026FixPermanentFailStatusLeak();
    await migration027FailLd07AcKauuI();
    await migration028FailPermanentlyInaccessible();
    await migration029ResetGhostChannelDeferredClips();
    await migration030FailPo4WNli5ZLY();
    await migration031FailLfupu2iliBw();
    await migration032FixPs5GameFallbacks();
    await migration033RescheduleLongFormFromJune11();
    await migration034FailMTGcjkK8XQ();
    await migration035StampMissingPermanentFail();
    await migration036FailOG1And3Dw4StormVideos();
    await migration037SeedSystemIncidentLog();
    await migration038DeleteChannel52();
    await migration039ResetHardBlacklistedPreEncoderItems();
    await migration040CancelOrphanAutoClipsNoYoutubeId();
    await migration041FailSmartEditItemsNoVideoId();
    await migration042BackfillSmartEditVideoId();
    await migration043CancelUntimestampedAutoClips();
    await migration044FixVodLongFormSegmentBounds();
    await migration045FailH6egjqm0XjcStormVideo();
    await migration046FailNonYoutubeStreamEditJobs();
    await migration047StripNonYoutubePlatforms();
    await migration048HardFailUndownloadablePreEncoderItems();
    await migration049CancelBlockedPublishingQueue();
    await migration050FixPendingStudioAutoPublishItems();
    await migration051RedistributeSchedule();
    await migration052Bf6OnlyFocus();
    await migration053SeedBf6LongFormSchedule();
    await migration054FixLongFormSchedule();
    await migration055BlacklistFormatErrorItems();
    await migration056RecoverFalse401PermSkips();
    await migration057LogJune2026Incidents();
    await migration058BlacklistStormVideos();
    await migration059FixFileSizeBigint();
    await migration060PurgeNonBF6Shorts();
    await migration061PurgeNonBF6SlippageItems();

    // Non-flagged per-boot creative library sync — seeds new music tracks from
    // data/music-library/ into the creative_library DB table.  Idempotent: skips
    // files already registered.  Runs before any encoder or publisher starts so
    // the library is always current when the first encode cycle fires.
    try {
      const { seedMusicLibrary } = await import("../services/creative-library-manager");
      await seedMusicLibrary(53); // channel 53 = ET Gaming 274
    } catch (err: any) {
      log.warn(`[StartupMigrations] Creative library seed failed (non-fatal): ${err?.message}`);
    }

    // Non-flagged boot cleanup — runs every restart, resets stuck pending items
    await cleanupStuckPendingItems();
    // Non-flagged per-boot non-BF6 purge — removes any scheduled/pending queue
    // items whose gameName doesn't match the channel focus game.  Runs every
    // restart so contamination from content-maximizer, past-stream extraction,
    // or back-catalog engine race conditions is always cleared before publishers fire.
    await cleanupNonBF6QueueItems();
    // Non-flagged per-boot vault storm prevention — runs every restart.
    // Fails active vault entries with failCount >= 2, stamps permanentFail on all
    // failed entries, and cancels any autopilot_queue items whose source vault
    // entry is permanently failed.  This is the structural guard that ensures
    // no yt-dlp storm can persist across multiple crash/restart cycles.
    await cleanupOrphanedQueueItems();
    await verifyAllMigrationFlags();
  } catch (err: any) {
    log.warn(`[StartupMigrations] Unexpected error (non-fatal): ${err?.message}`);
  }
}
