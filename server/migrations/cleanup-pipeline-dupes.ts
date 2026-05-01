/**
 * ONE-TIME PRODUCTION CLEANUP: Deduplicate content_pipeline entries
 * ──────────────────────────────────────────────────────────────────────────
 * Root cause: the backlog-manager's "already processed" check excluded
 * "pending" from the status list. Every time the prod-heal reset a stalled
 * pipeline from "processing" → "pending", the backlog-manager treated the
 * video as unprocessed and created a brand-new pipeline entry.
 * Video 59214 accumulated 11 identical entries this way.
 *
 * Fix (in code): backlog-manager.ts now includes "pending" in the status list.
 * Fix (in data): this migration keeps only the NEWEST pipeline entry per
 *   video_id × user_id × mode and deletes all older duplicates that haven't
 *   progressed past the analyze step.
 *
 * Also clears irrecoverable "risky_publish" DLQ entries that hit the blast-radius
 * safety limit — these are permanently blocked and safe to resolve so the DLQ
 * stays clean.
 *
 * Runs once at production startup. Guards with audit_logs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("pipeline-dedup");
const MIGRATION_KEY = "production_pipeline_dedup_v1";

export async function deduplicatePipelinesIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return;
  }

  try {
    const existing = await db.execute(
      sql`SELECT id FROM audit_logs WHERE action = ${MIGRATION_KEY} LIMIT 1`
    );
    if ((existing as any).rows?.length > 0) {
      logger.info("[PipelineDedup] Already ran — skipping");
      return;
    }
  } catch (err) {
    logger.warn("[PipelineDedup] audit_logs check failed — skipping", err);
    return;
  }

  const results: Record<string, number> = {};

  // 1. Delete duplicate pipeline entries — keep only the HIGHEST id per (user_id, video_id, mode)
  //    for rows that haven't completed (still at analyze/pending or queued)
  try {
    const dupeResult = await db.execute(sql`
      DELETE FROM content_pipeline
      WHERE status IN ('pending', 'queued')
        AND id NOT IN (
          SELECT MAX(id)
          FROM content_pipeline
          WHERE status IN ('pending', 'queued')
          GROUP BY user_id, video_id, mode
        )
    `);
    results.pipelineDupesDeleted = (dupeResult as any).rowCount ?? 0;
    logger.info(`[PipelineDedup] Deleted ${results.pipelineDupesDeleted} duplicate pending/queued pipeline entries`);
  } catch (err) {
    logger.error("[PipelineDedup] Pipeline dedup failed:", err);
    results.pipelineDupesDeleted = -1;
  }

  // 2. Reset processing pipelines stuck > 1 hour to pending (abandoned by old instances)
  //    The ghost-data cleanup migration handles this too, but we do it again here in case
  //    new stuck pipelines appeared after that migration ran.
  try {
    const resetResult = await db.execute(sql`
      UPDATE content_pipeline
      SET status = 'pending', error_message = NULL
      WHERE status = 'processing'
        AND started_at < NOW() - INTERVAL '1 hour'
    `);
    results.stuckPipelinesReset = (resetResult as any).rowCount ?? 0;
    logger.info(`[PipelineDedup] Reset ${results.stuckPipelinesReset} stuck processing pipelines to pending`);
  } catch (err) {
    logger.error("[PipelineDedup] Stuck pipeline reset failed:", err);
    results.stuckPipelinesReset = -1;
  }

  // 3. Resolve risky_publish DLQ entries — these hit the blast-radius safety limit
  //    and will never retry successfully. Clean them so the DLQ is accurate.
  try {
    const dlqResult = await db.execute(sql`
      UPDATE dead_letter_queue
      SET status = 'resolved', resolved_at = NOW()
      WHERE status = 'pending'
        AND job_type = 'risky_publish'
        AND error LIKE 'Blast radius limit breached%'
    `);
    results.dlqRiskyPublish = (dlqResult as any).rowCount ?? 0;
    logger.info(`[PipelineDedup] Resolved ${results.dlqRiskyPublish} risky_publish DLQ entries`);
  } catch (err) {
    logger.error("[PipelineDedup] risky_publish DLQ cleanup failed:", err);
    results.dlqRiskyPublish = -1;
  }

  try {
    await db.execute(
      sql`INSERT INTO audit_logs (user_id, action, target, details, risk_level, created_at)
          VALUES ('system', ${MIGRATION_KEY}, 'content_pipeline,dead_letter_queue', ${JSON.stringify(results)}::jsonb, 'low', NOW())`
    );
    logger.info("[PipelineDedup] Complete —", JSON.stringify(results));
  } catch (err) {
    logger.error("[PipelineDedup] Failed to write audit log:", err);
  }
}
