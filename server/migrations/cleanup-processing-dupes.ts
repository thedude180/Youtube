/**
 * ONE-TIME PRODUCTION CLEANUP: Remove duplicate/stale "processing" pipeline rows
 * ─────────────────────────────────────────────────────────────────────────────
 * The earlier pipeline-dedup migration (v1) only cleaned up "pending" duplicate
 * rows.  It intentionally left "processing" rows alone to avoid killing an
 * actively-running pipeline.  After the server restarted the prod-heal reset
 * all processing→pending, but the drip-feed immediately re-kicked them back into
 * processing before the AI semaphore could drain — so they ended up stuck in
 * "processing" again with started_at = NULL (never actually ran an AI call).
 *
 * Affected rows (as of 2026-04-29 server restart):
 *   id=599  video_id=59124  (oldest dup — delete)
 *   id=600  video_id=59124  (newer  dup — reset to pending)
 *   id=601  video_id=59123  (oldest dup — delete)
 *   id=602  video_id=59123  (newer  dup — reset to pending)
 *   id=604  video_id=59122  (sole entry — reset to pending)
 *
 * Pipeline 624 (video_id=60196, started_at IS NOT NULL) is left untouched
 * because it was actively started by the current server session.
 *
 * Runs once at production startup. Guarded with audit_logs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("cleanup-processing-dupes");
const MIGRATION_KEY = "production_processing_dup_cleanup_v1";

export async function cleanupProcessingDupesIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return;
  }

  try {
    const existing = await db.execute(
      sql`SELECT id FROM audit_logs WHERE action = ${MIGRATION_KEY} LIMIT 1`
    );
    if ((existing as any).rows?.length > 0) {
      logger.info("cleanup-processing-dupes already ran — skipping");
      return;
    }
  } catch (err) {
    logger.warn("cleanup-processing-dupes: audit_logs check failed — skipping", err);
    return;
  }

  logger.info("Running cleanup-processing-dupes migration…");

  // 1. Delete the OLDER of each duplicate-video-id processing pair.
  //    These rows have started_at = NULL meaning they never truly ran;
  //    their newer siblings will be retained and reset to pending below.
  const deleteResult = await db.execute(sql`
    DELETE FROM content_pipeline
    WHERE id IN (599, 601)
      AND status = 'processing'
      AND started_at IS NULL
  `);
  const deletedCount = (deleteResult as any)?.rowCount ?? 0;

  // 2. Reset the remaining stale NULL-started_at processing rows back to
  //    pending so the drip-feed can retry them normally.
  //    Excludes pipeline 624 (it has a real started_at from this session).
  const resetResult = await db.execute(sql`
    UPDATE content_pipeline
    SET status = 'pending',
        started_at = NULL,
        error_message = NULL,
        updated_at = NOW()
    WHERE id IN (600, 602, 604)
      AND status = 'processing'
      AND started_at IS NULL
  `);
  const resetCount = (resetResult as any)?.rowCount ?? 0;

  await db.execute(sql`
    INSERT INTO audit_logs (user_id, action, target, details, risk_level)
    VALUES (
      '7210ff92-76dd-4d0a-80bb-9eb5be27508b',
      ${MIGRATION_KEY},
      'content_pipeline',
      ${JSON.stringify({ deletedDupes: deletedCount, resetToPending: resetCount })}::jsonb,
      'low'
    )
  `);

  logger.info(`cleanup-processing-dupes done: deleted ${deletedCount} duplicate rows, reset ${resetCount} to pending`);
}
