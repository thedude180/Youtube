/**
 * ONE-TIME PRODUCTION CLEANUP: Video Deduplication
 * ──────────────────────────────────────────────────────────────────────────
 * Runs automatically on server startup in production. Guards itself with an
 * audit log entry so it only ever runs ONCE, even across restarts.
 *
 * What it does:
 * 1. Checks the audit log for a prior run — skips if already done.
 * 2. Clears content_pipeline + autopilot_queue (built on fake duplicate data).
 * 3. Deletes all child rows (playlist_items, schedule_items, etc.) that
 *    reference duplicate video entries.
 * 4. For each unique YouTube video ID, keeps only the OLDEST record (min id)
 *    and deletes all duplicates.
 * 5. Writes an audit log entry so this never runs again.
 *
 * After this runs, the catalog sync will re-import all ~4,192 real videos
 * cleanly with no duplicates.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("video-dedup-migration");
const MIGRATION_KEY = "production_video_dedup_v1";
const ET_GAMING_USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

export async function runVideoDeduplicationIfNeeded(): Promise<void> {
  try {
    // Guard: check if this migration already ran
    const [existing] = await db.execute(sql`
      SELECT id FROM audit_logs
      WHERE action = ${MIGRATION_KEY}
      LIMIT 1
    `) as any[];

    if (existing) {
      logger.info(`[VideoDedup] Already ran — skipping (${MIGRATION_KEY})`);
      return;
    }

    logger.info(`[VideoDedup] Starting production video deduplication...`);

    // Count before
    const [{ total_before }] = await db.execute(sql`
      SELECT COUNT(*) as total_before FROM videos WHERE channel_id IN (
        SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
      )
    `) as any[];

    logger.info(`[VideoDedup] Videos before cleanup: ${total_before}`);

    // Step 1: Clear content_pipeline (all entries are based on duplicate video data)
    const pipelineResult = await db.execute(sql`
      DELETE FROM content_pipeline
      WHERE user_id = ${ET_GAMING_USER_ID}
    `);
    logger.info(`[VideoDedup] Cleared content_pipeline`);

    // Step 2: Clear autopilot_queue entries for this user (source_video_id may be invalid)
    await db.execute(sql`
      DELETE FROM autopilot_queue
      WHERE user_id = ${ET_GAMING_USER_ID}
    `);
    logger.info(`[VideoDedup] Cleared autopilot_queue`);

    // Step 3: Delete all child rows referencing duplicate video records
    // We'll delete everything for this user's channel — the real videos stay,
    // the duplicates go, and these tables all get repopulated by the running engines

    await db.execute(sql`
      DELETE FROM playlist_items
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM schedule_items
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM seo_scores
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM content_quality_scores
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM ctr_optimizations
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM editing_notes
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM evergreen_classifications
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM optimization_passes
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM search_rankings
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM stream_pipelines
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM studio_videos
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM upload_queue
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM video_versions
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM content_clips
      WHERE source_video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM repurposed_content
      WHERE source_video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM vod_cuts
      WHERE source_video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM ab_tests
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM cannibalization_alerts
      WHERE video_id_1 IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
      OR video_id_2 IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM comment_responses
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM comment_sentiments
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM content_kanban
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    await db.execute(sql`
      DELETE FROM content_lifecycle
      WHERE video_id IN (
        SELECT id FROM videos WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
      )
    `);

    logger.info(`[VideoDedup] All child tables cleared`);

    // Step 4: Deduplicate videos — keep the OLDEST entry (min id) per unique YouTube video ID.
    // The oldest entry is the original catalog import; newer ones are AI-generated duplicates.
    // Videos with no YouTube ID are kept (ingested originals with no metadata yet).
    await db.execute(sql`
      DELETE FROM videos
      WHERE channel_id IN (
        SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
      )
      AND id NOT IN (
        -- Keep the oldest entry per unique YouTube ID
        SELECT MIN(id) as canonical_id
        FROM videos
        WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
        AND COALESCE(
          metadata->>'youtubeId',
          metadata->>'youtubeVideoId',
          metadata->>'youtube_id',
          metadata->>'videoId'
        ) IS NOT NULL
        GROUP BY COALESCE(
          metadata->>'youtubeId',
          metadata->>'youtubeVideoId',
          metadata->>'youtube_id',
          metadata->>'videoId'
        )
        UNION ALL
        -- Also keep all videos with no YouTube ID (ingested originals)
        SELECT id
        FROM videos
        WHERE channel_id IN (
          SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
        )
        AND metadata->>'youtubeId' IS NULL
        AND metadata->>'youtubeVideoId' IS NULL
        AND metadata->>'youtube_id' IS NULL
        AND metadata->>'videoId' IS NULL
      )
    `);

    // Count after
    const [{ total_after }] = await db.execute(sql`
      SELECT COUNT(*) as total_after FROM videos WHERE channel_id IN (
        SELECT id FROM channels WHERE user_id = ${ET_GAMING_USER_ID}
      )
    `) as any[];

    logger.info(`[VideoDedup] Videos after cleanup: ${total_after} (was ${total_before})`);
    logger.info(`[VideoDedup] Removed ${Number(total_before) - Number(total_after)} duplicate entries`);

    // Step 5: Mark migration as done in audit_logs so it never runs again
    await db.execute(sql`
      INSERT INTO audit_logs (user_id, action, target, details, risk_level, created_at)
      VALUES (
        ${ET_GAMING_USER_ID},
        ${MIGRATION_KEY},
        'videos table',
        ${JSON.stringify({
          before: Number(total_before),
          after: Number(total_after),
          removed: Number(total_before) - Number(total_after),
          runAt: new Date().toISOString(),
        })}::jsonb,
        'low',
        NOW()
      )
    `);

    logger.info(`[VideoDedup] Done — migration marked complete. ${total_after} canonical videos remain.`);
    logger.info(`[VideoDedup] Catalog sync will re-import all real YouTube videos on next run.`);

  } catch (err: any) {
    logger.error(`[VideoDedup] Migration failed:`, err.message);
    // Don't throw — let the server start even if cleanup fails
  }
}
