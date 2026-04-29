/**
 * ONE-TIME PRODUCTION CLEANUP: Remove stale expired channels
 * ──────────────────────────────────────────────────────────────────────────
 * Channels 30, 31, 38 — dead entries with no refresh token and status expired.
 * Channel 36 — belongs to ghost TikTok user but holds active Twitch tokens for
 *              the same thedude180 account as ET Gaming's real channel 34. Causes
 *              the token-refresh loop to fight itself and confuses monitoring.
 * Channel 43 — duplicate YouTubeShorts for ET Gaming (same channel_id as 47).
 *              Channel 47 is the newer entry and is kept.
 *
 * Runs once at server startup in production. Guards itself with an audit_logs
 * entry so it never runs again.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("stale-channel-cleanup");
const MIGRATION_KEY = "production_stale_channel_cleanup_v1";

export async function removeStaleChannelsIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT) {
    return;
  }

  try {
    const existing = await db.execute(
      sql`SELECT id FROM audit_logs WHERE action = ${MIGRATION_KEY} LIMIT 1`
    );
    if ((existing as any).rows?.length > 0) {
      logger.info("[StaleChannelCleanup] Already ran — skipping");
      return;
    }
  } catch (err) {
    logger.warn("[StaleChannelCleanup] audit_logs check failed — skipping to avoid accidental re-run", err);
    return;
  }

  const results: Record<string, number> = {};

  try {
    // Remove expired channels with no refresh token (30, 31, 38)
    const expiredResult = await db.execute(
      sql`DELETE FROM channels WHERE id IN (30, 31, 38) AND refresh_token IS NULL`
    );
    results.expiredChannels = (expiredResult as any).rowCount ?? 0;
    logger.info(`[StaleChannelCleanup] Deleted ${results.expiredChannels} expired no-refresh channels (30, 31, 38)`);

    // Remove ghost user's Twitch channel 36 — same thedude180 account as ET Gaming's channel 34
    // but owned by the TikTok ghost user. Safe: no content references this row ID.
    const ghostTwitchResult = await db.execute(
      sql`DELETE FROM channels WHERE id = 36 AND user_id = 'tiktok_-000hfXLzkfKJGE24wvR-qZP9Pw6iwxLWyeM'`
    );
    results.ghostTwitch = (ghostTwitchResult as any).rowCount ?? 0;
    logger.info(`[StaleChannelCleanup] Deleted ${results.ghostTwitch} ghost-user Twitch channel (36)`);

    // Remove duplicate YouTubeShorts channel 43 — same channel_id as 47, 47 is newer
    const shortsResult = await db.execute(
      sql`DELETE FROM channels WHERE id = 43 AND user_id = '7210ff92-76dd-4d0a-80bb-9eb5be27508b' AND platform = 'youtubeshorts'`
    );
    results.duplicateShorts = (shortsResult as any).rowCount ?? 0;
    logger.info(`[StaleChannelCleanup] Deleted ${results.duplicateShorts} duplicate YouTubeShorts channel (43)`);

    await db.execute(
      sql`INSERT INTO audit_logs (user_id, action, target, details, risk_level, created_at)
          VALUES ('system', ${MIGRATION_KEY}, 'channels', ${JSON.stringify(results)}, 'low', NOW())`
    );

    logger.info("[StaleChannelCleanup] Complete — UI now accurately reflects active channels");
  } catch (err) {
    logger.error("[StaleChannelCleanup] Failed:", err);
  }
}
