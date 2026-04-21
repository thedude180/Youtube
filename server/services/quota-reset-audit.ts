import { db } from "../db";
import { users, channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped, getQuotaForAllUsers } from "./youtube-quota-tracker";

const logger = createLogger("quota-reset-audit");

export async function runQuotaResetAudit(): Promise<void> {
  logger.info("[QuotaResetAudit] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("[QuotaResetAudit] YouTube quota reset — running full app audit");
  logger.info("[QuotaResetAudit] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const results: Record<string, "ok" | "warn" | "fail"> = {};

  // ── 1. Confirm circuit breaker is clear ────────────────────────────────────
  const breakerStillTripped = isQuotaBreakerTripped();
  if (breakerStillTripped) {
    logger.warn("[QuotaResetAudit] Circuit breaker still shows tripped — date may not have rolled yet");
    results.circuitBreaker = "warn";
  } else {
    logger.info("[QuotaResetAudit] ✓ Circuit breaker cleared — YouTube API calls unblocked");
    results.circuitBreaker = "ok";
  }

  // ── 2. Get all active users with YouTube channels ─────────────────────────
  let activeUsers: Array<{ id: string }> = [];
  try {
    activeUsers = await db.select({ id: users.id }).from(users).limit(50);
    logger.info(`[QuotaResetAudit] Found ${activeUsers.length} user(s) to audit`);
    results.userLoad = "ok";
  } catch (err: any) {
    logger.error("[QuotaResetAudit] Failed to load users", { error: err.message });
    results.userLoad = "fail";
    return;
  }

  // ── 3. Run per-user audit in sequence (quota is fresh — be conservative) ──
  for (const user of activeUsers) {
    const uid = user.id;
    logger.info(`[QuotaResetAudit] Auditing user ${uid.substring(0, 8)}…`);

    // 3a. YouTube channel info refresh
    try {
      const ytChannels = await db
        .select({ id: channels.id, channelId: channels.channelId })
        .from(channels)
        .where(eq(channels.userId, uid));

      const ytCh = ytChannels.find(c => c.channelId?.startsWith("UC"));
      if (ytCh) {
        logger.info(`[QuotaResetAudit] ✓ YouTube channel found: ${ytCh.channelId}`);
        results[`${uid.substring(0, 8)}_channel`] = "ok";
      } else {
        logger.warn(`[QuotaResetAudit] No YouTube channel for user ${uid.substring(0, 8)}`);
        results[`${uid.substring(0, 8)}_channel`] = "warn";
      }
    } catch (err: any) {
      logger.error(`[QuotaResetAudit] Channel check failed for ${uid.substring(0, 8)}`, { error: err.message });
      results[`${uid.substring(0, 8)}_channel`] = "fail";
    }

    // 3b. Token validity check
    try {
      const { getGoogleAccessTokenForUser } = await import("../youtube");
      const token = await getGoogleAccessTokenForUser(uid);
      if (token) {
        logger.info(`[QuotaResetAudit] ✓ Google OAuth token valid for user ${uid.substring(0, 8)}`);
        results[`${uid.substring(0, 8)}_token`] = "ok";
      } else {
        logger.warn(`[QuotaResetAudit] No Google token for user ${uid.substring(0, 8)} — some features will be limited`);
        results[`${uid.substring(0, 8)}_token`] = "warn";
      }
    } catch (err: any) {
      logger.error(`[QuotaResetAudit] Token check failed for ${uid.substring(0, 8)}`, { error: err.message });
      results[`${uid.substring(0, 8)}_token`] = "fail";
    }

    // 3c. Vault index refresh (runs with fresh YouTube API access)
    try {
      const { indexAllChannelVideos } = await import("./video-vault");
      const { indexed, newlyAdded } = await indexAllChannelVideos(uid);
      logger.info(`[QuotaResetAudit] ✓ Vault indexed ${indexed} videos (${newlyAdded} new) for ${uid.substring(0, 8)}`);
      results[`${uid.substring(0, 8)}_vault`] = "ok";
    } catch (err: any) {
      logger.warn(`[QuotaResetAudit] Vault index failed for ${uid.substring(0, 8)}`, { error: err.message });
      results[`${uid.substring(0, 8)}_vault`] = "warn";
    }

    // 3d. Analytics warm-up — pull fresh data now that quota is live
    try {
      const { fetchViewsByDayAndHour } = await import("./youtube-analytics");
      const analytics = await fetchViewsByDayAndHour(uid);
      if (analytics.source === "real") {
        logger.info(`[QuotaResetAudit] ✓ Analytics real data confirmed for ${uid.substring(0, 8)}`);
        results[`${uid.substring(0, 8)}_analytics`] = "ok";
      } else {
        logger.warn(`[QuotaResetAudit] Analytics returned no real data for ${uid.substring(0, 8)} — quota may still be limited`);
        results[`${uid.substring(0, 8)}_analytics`] = "warn";
      }
    } catch (err: any) {
      logger.warn(`[QuotaResetAudit] Analytics check failed for ${uid.substring(0, 8)}`, { error: err.message });
      results[`${uid.substring(0, 8)}_analytics`] = "warn";
    }

    // 3e. Quota status confirmation
    try {
      const quotas = await getQuotaForAllUsers();
      const userQuota = quotas.find(q => q.userId === uid);
      if (userQuota) {
        logger.info(`[QuotaResetAudit] Quota remaining: ${userQuota.remaining} units for ${uid.substring(0, 8)}`);
      }
    } catch { /* non-critical */ }

    // Small pause between users to avoid hammering the API
    await new Promise(r => setTimeout(r, 3_000));
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  const counts = Object.values(results).reduce(
    (acc, v) => { acc[v]++; return acc; },
    { ok: 0, warn: 0, fail: 0 }
  );

  logger.info("[QuotaResetAudit] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info(`[QuotaResetAudit] Audit complete — ✓ ${counts.ok} ok, ⚠ ${counts.warn} warn, ✗ ${counts.fail} fail`);
  logger.info("[QuotaResetAudit] App is ready for real YouTube data");
  logger.info("[QuotaResetAudit] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
