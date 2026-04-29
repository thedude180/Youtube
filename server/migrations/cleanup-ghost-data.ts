/**
 * ONE-TIME PRODUCTION CLEANUP: Ghost data from previous server instances
 * ──────────────────────────────────────────────────────────────────────────
 * Cleans four categories of stale data that accumulate across deployments:
 *
 * 1. STUCK JOBS — 119 auto_backlog_processing jobs + 2 stream jobs from Feb/April
 *    held in "processing" by server instances that are no longer running.
 *    Marking them "failed" lets the next run create fresh jobs.
 *
 * 2. DEAD LETTER QUEUE — three categories of irrecoverable entries:
 *    • test-failing-action: synthetic test data (313 entries)
 *    • webhook-stripe / webhook-youtube: external callers with wrong/missing
 *      signatures — these can never succeed, stop retrying (630 entries)
 *    • smart-edit "No YouTube video ID": videos that haven't been uploaded to
 *      YouTube yet — will self-heal once uploads complete (241 entries)
 *
 * 3. STUCK PIPELINES — content_pipeline rows in "processing" stage older than
 *    1 hour that were abandoned by old instances. Reset to "pending" so the
 *    pipeline processor picks them up on next cycle.
 *
 * Runs once at server startup in production. Guards with audit_logs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("ghost-data-cleanup");
const MIGRATION_KEY = "production_ghost_data_cleanup_v2";

export async function cleanGhostDataIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return;
  }

  try {
    const existing = await db.execute(
      sql`SELECT id FROM audit_logs WHERE action = ${MIGRATION_KEY} LIMIT 1`
    );
    if ((existing as any).rows?.length > 0) {
      logger.info("[GhostDataCleanup] Already ran — skipping");
      return;
    }
  } catch (err) {
    logger.warn("[GhostDataCleanup] audit_logs check failed — skipping to avoid accidental re-run", err);
    return;
  }

  const results: Record<string, number> = {};

  // 1. Reset stuck processing jobs to "failed"
  try {
    const stuckJobs = await db.execute(
      sql`UPDATE jobs
          SET status = 'failed', error_message = 'Abandoned by previous server instance — reset by ghost-data-cleanup migration'
          WHERE status = 'processing'
            AND (
              type IN ('auto_backlog_processing', 'post_stream_automation', 'stream_automation')
              OR started_at IS NULL
              OR started_at < NOW() - INTERVAL '2 hours'
            )`
    );
    results.stuckJobsReset = (stuckJobs as any).rowCount ?? 0;
    logger.info(`[GhostDataCleanup] Reset ${results.stuckJobsReset} stuck processing jobs to failed`);
  } catch (err) {
    logger.error("[GhostDataCleanup] Stuck jobs reset failed:", err);
    results.stuckJobsReset = -1;
  }

  // 2. Resolve irrecoverable dead letter queue entries
  try {
    const dlqTest = await db.execute(
      sql`UPDATE dead_letter_queue
          SET status = 'resolved', resolved_at = NOW()
          WHERE status = 'pending' AND job_type = 'test-failing-action'`
    );
    results.dlqTestData = (dlqTest as any).rowCount ?? 0;

    const dlqWebhooks = await db.execute(
      sql`UPDATE dead_letter_queue
          SET status = 'resolved', resolved_at = NOW()
          WHERE status = 'pending'
            AND job_type IN ('webhook-stripe', 'webhook-youtube')
            AND error IN ('Invalid stripe webhook signature', 'Missing signature header for youtube webhook')`
    );
    results.dlqWebhooks = (dlqWebhooks as any).rowCount ?? 0;

    const dlqSmartEdit = await db.execute(
      sql`UPDATE dead_letter_queue
          SET status = 'resolved', resolved_at = NOW()
          WHERE status = 'pending'
            AND job_type = 'smart-edit'
            AND error = 'No YouTube video ID on video record'`
    );
    results.dlqSmartEdit = (dlqSmartEdit as any).rowCount ?? 0;

    logger.info(`[GhostDataCleanup] Resolved DLQ entries — test: ${results.dlqTestData}, webhooks: ${results.dlqWebhooks}, smart-edit no-id: ${results.dlqSmartEdit}`);
  } catch (err) {
    logger.error("[GhostDataCleanup] DLQ cleanup failed:", err);
    results.dlqError = 1;
  }

  // 3. Reset stuck content_pipeline entries (processing > 1 hour old)
  try {
    const pipelines = await db.execute(
      sql`UPDATE content_pipeline
          SET status = 'pending', error_message = NULL
          WHERE status = 'processing'
            AND started_at < NOW() - INTERVAL '1 hour'`
    );
    results.pipelinesReset = (pipelines as any).rowCount ?? 0;
    logger.info(`[GhostDataCleanup] Reset ${results.pipelinesReset} stuck content_pipeline rows to pending`);
  } catch (err) {
    logger.error("[GhostDataCleanup] Pipeline reset failed:", err);
    results.pipelinesReset = -1;
  }

  try {
    await db.execute(
      sql`INSERT INTO audit_logs (user_id, action, target, details, risk_level, created_at)
          VALUES ('system', ${MIGRATION_KEY}, 'jobs,dead_letter_queue,content_pipeline', ${JSON.stringify(results)}, 'low', NOW())`
    );
    logger.info("[GhostDataCleanup] Complete —", JSON.stringify(results));
  } catch (err) {
    logger.error("[GhostDataCleanup] Failed to write audit log:", err);
  }
}
