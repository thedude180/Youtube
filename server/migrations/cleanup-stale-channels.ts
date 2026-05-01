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
 *
 * SAFETY: Never deletes a channel that has a live access_token.
 * Uses storage.deleteChannel() for proper cascading deletes across all FK tables.
 */

import { db } from "../db";
import { channels } from "@shared/schema";
import { sql, inArray, and, isNull, eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";

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
    // Remove expired channels with no refresh token (30, 31, 38) AND no access token (safety guard)
    const expiredCandidates = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          inArray(channels.id, [30, 31, 38]),
          isNull(channels.refreshToken),
          isNull(channels.accessToken),
        )
      );

    let expiredCount = 0;
    for (const ch of expiredCandidates) {
      try {
        await storage.deleteChannel(ch.id);
        expiredCount++;
        logger.info(`[StaleChannelCleanup] Deleted expired no-token channel id=${ch.id}`);
      } catch (e) {
        logger.warn(`[StaleChannelCleanup] Could not delete channel ${ch.id} (may not exist):`, e);
      }
    }
    results.expiredChannels = expiredCount;

    // Remove ghost user's Twitch channel 36 — safe, no content references this row
    const ghostCandidates = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, 36),
          eq(channels.userId, 'tiktok_-000hfXLzkfKJGE24wvR-qZP9Pw6iwxLWyeM'),
          isNull(channels.accessToken),
        )
      );

    let ghostCount = 0;
    for (const ch of ghostCandidates) {
      try {
        await storage.deleteChannel(ch.id);
        ghostCount++;
      } catch (e) {
        logger.warn(`[StaleChannelCleanup] Could not delete ghost channel ${ch.id}:`, e);
      }
    }
    results.ghostTwitch = ghostCount;
    logger.info(`[StaleChannelCleanup] Deleted ${ghostCount} ghost-user Twitch channel(s) (36)`);

    // Remove duplicate YouTubeShorts channel 43 — same channel_id as 47, 47 is newer
    const shortsCandidates = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.id, 43),
          eq(channels.userId, '7210ff92-76dd-4d0a-80bb-9eb5be27508b'),
          eq(channels.platform, 'youtubeshorts'),
          isNull(channels.accessToken),
        )
      );

    let shortsCount = 0;
    for (const ch of shortsCandidates) {
      try {
        await storage.deleteChannel(ch.id);
        shortsCount++;
      } catch (e) {
        logger.warn(`[StaleChannelCleanup] Could not delete duplicate shorts channel ${ch.id}:`, e);
      }
    }
    results.duplicateShorts = shortsCount;
    logger.info(`[StaleChannelCleanup] Deleted ${shortsCount} duplicate YouTubeShorts channel(s) (43)`);

    await db.execute(
      sql`INSERT INTO audit_logs (user_id, action, target, details, risk_level, created_at)
          VALUES ('system', ${MIGRATION_KEY}, 'channels', ${JSON.stringify(results)}::jsonb, 'low', NOW())`
    );

    logger.info("[StaleChannelCleanup] Complete — UI now accurately reflects active channels", results);
  } catch (err) {
    logger.error("[StaleChannelCleanup] Failed:", err);
  }
}
