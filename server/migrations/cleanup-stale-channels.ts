/**
 * ONE-TIME PRODUCTION CLEANUP: Remove stale expired channels
 * ──────────────────────────────────────────────────────────────────────────
 * Channels 30 (Twitch Channel) and 31 (Kick Channel) are dead entries with
 * no refresh token and connection_status = 'expired'. The active channels
 * for the same platforms are 34 (thedude180/Twitch) and 35 (thedude180/Kick).
 * The stale entries cause the UI to show Twitch and Kick as "not connected"
 * even though the real channels are healthy.
 *
 * Runs once at server startup in production. Guards itself with an audit log
 * entry so it never runs again.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("stale-channel-cleanup");
const MIGRATION_KEY = "production_stale_channel_cleanup_v1";
const STALE_CHANNEL_IDS = [30, 31];

export async function removeStaleChannelsIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return;
  }

  try {
    const existing = await db.execute(
      sql`SELECT id FROM audit_log WHERE action = ${MIGRATION_KEY} LIMIT 1`
    );
    if ((existing as any).rows?.length > 0) {
      logger.info("[StaleChannelCleanup] Already ran — skipping");
      return;
    }
  } catch {
    logger.warn("[StaleChannelCleanup] audit_log check failed — skipping to avoid accidental re-run");
    return;
  }

  logger.info("[StaleChannelCleanup] Removing stale expired channels: " + STALE_CHANNEL_IDS.join(", "));

  try {
    const result = await db.execute(
      sql`DELETE FROM channels WHERE id = ANY(${STALE_CHANNEL_IDS}) AND refresh_token IS NULL AND platform_data->>'_connectionStatus' = 'expired'`
    );
    const deleted = (result as any).rowCount ?? 0;
    logger.info(`[StaleChannelCleanup] Deleted ${deleted} stale channel(s)`);

    await db.execute(
      sql`INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata, created_at)
          VALUES ('system', ${MIGRATION_KEY}, 'channel', 'batch', ${JSON.stringify({ deleted, ids: STALE_CHANNEL_IDS })}, NOW())`
    );

    logger.info("[StaleChannelCleanup] Done — UI will now accurately reflect active Twitch and Kick channels");
  } catch (err) {
    logger.error("[StaleChannelCleanup] Failed:", err);
  }
}
