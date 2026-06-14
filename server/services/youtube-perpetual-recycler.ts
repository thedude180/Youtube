import { db } from "../db";
import { backCatalogVideos, autopilotQueue } from "@shared/schema";
import { eq, sql, and, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("perpetual-recycler");

// ── Cooldowns ────────────────────────────────────────────────────────────────
// Resume-mining: safe to trigger every 30 min when new/unprocessed videos exist
// Full-recycle:  4h minimum between full flag resets to avoid thrashing
const RESUME_COOLDOWN_MS  = 30 * 60_000;
const RECYCLE_COOLDOWN_MS = 4 * 60 * 60_000;

let _lastResumeTriggerMs  = 0;
let _lastFullRecycleMs    = 0;

export interface RecyclerResult {
  triggered: boolean;
  fullRecycle: boolean;
  reason: string;
}

/**
 * Perpetual recycler — called by both publisher loops when the autopilot queue
 * is empty and quota is not exhausted.
 *
 * Two modes:
 *   1. RESUME  — some back_catalog_videos still have mined_for_shorts=false or
 *                mined_for_long_form=false.  Trigger the back-catalog engine so
 *                those videos get queued.  Happens when a new VOD was indexed
 *                after a live stream or when a previous engine run was partial.
 *
 *   2. RECYCLE — every single back_catalog_video is fully mined.  The vault has
 *                been completely exhausted.  Reset all mined flags so the engine
 *                re-queues everything from scratch with fresh publishAt slots.
 *                This is the "forever loop" — the channel never runs out of content.
 *
 * Both modes respect individual cooldowns to avoid hammering the DB or engine.
 */
export async function runPerpetualRecycler(): Promise<RecyclerResult> {
  // ── 1. Only run when the scheduled queue is truly empty ──────────────────
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(eq(autopilotQueue.status, "scheduled"));

    const scheduledCount = Number(row?.count ?? 0);
    if (scheduledCount > 0) {
      return { triggered: false, fullRecycle: false, reason: `queue_has_${scheduledCount}_scheduled` };
    }
  } catch (err: any) {
    logger.warn("[Recycler] Could not query queue count (non-fatal)", { error: err?.message?.slice(0, 120) });
    return { triggered: false, fullRecycle: false, reason: "db_error" };
  }

  // ── 2. Count total vs unmined back_catalog_videos ────────────────────────
  let totalCount = 0;
  let unminedCount = 0;

  try {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(backCatalogVideos);
    totalCount = Number(totalRow?.count ?? 0);

    const [unminedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(backCatalogVideos)
      .where(
        sql`(${backCatalogVideos.minedForShorts} = false OR ${backCatalogVideos.minedForLongForm} = false)`,
      );
    unminedCount = Number(unminedRow?.count ?? 0);
  } catch (err: any) {
    logger.warn("[Recycler] Could not query back_catalog counts (non-fatal)", { error: err?.message?.slice(0, 120) });
    return { triggered: false, fullRecycle: false, reason: "db_error" };
  }

  if (totalCount === 0) {
    return { triggered: false, fullRecycle: false, reason: "no_catalog_yet" };
  }

  const now = Date.now();

  // ── 3. RESUME path — some videos still unmined ───────────────────────────
  if (unminedCount > 0) {
    if (now - _lastResumeTriggerMs < RESUME_COOLDOWN_MS) {
      const minLeft = Math.ceil((RESUME_COOLDOWN_MS - (now - _lastResumeTriggerMs)) / 60_000);
      return { triggered: false, fullRecycle: false, reason: `resume_cooldown_${minLeft}min` };
    }

    _lastResumeTriggerMs = now;
    logger.info(`[Recycler] RESUME — ${unminedCount}/${totalCount} videos not yet fully mined. Triggering back-catalog engine…`);

    try {
      const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
      await runBackCatalogForAllEligibleUsers();
      logger.info("[Recycler] RESUME complete — back-catalog engine finished");
    } catch (err: any) {
      logger.warn("[Recycler] RESUME engine trigger failed (non-fatal)", { error: err?.message?.slice(0, 200) });
    }

    // Brain feed
    try {
      const { recordOutcome } = await import("../lib/outcome-recorder");
      const { storage } = await import("../storage");
      const allUsers = await storage.getAllUsers();
      const brainUserId = allUsers[0]?.id;
      if (brainUserId) {
        await recordOutcome({
          engine:     "perpetual-recycler",
          userId:     brainUserId,
          category:   "resume_mining",
          summary:    `Recycler RESUME: ${unminedCount}/${totalCount} BF6 catalog videos still unmined — back-catalog engine triggered`,
          metrics:    { unminedCount, totalCount, percentMined: Math.round(((totalCount - unminedCount) / totalCount) * 100) },
          confidence: 0.88,
          recommendation: `${unminedCount} video(s) remain in the BF6 catalog — mining will continue until all are queued as Shorts + long-form`,
        });
      }
    } catch { /* non-fatal */ }

    return { triggered: true, fullRecycle: false, reason: "resume_mining" };
  }

  // ── 4. RECYCLE path — all videos fully mined, vault exhausted ────────────
  if (now - _lastFullRecycleMs < RECYCLE_COOLDOWN_MS) {
    const hLeft = ((RECYCLE_COOLDOWN_MS - (now - _lastFullRecycleMs)) / 3_600_000).toFixed(1);
    return { triggered: false, fullRecycle: false, reason: `recycle_cooldown_${hLeft}h` };
  }

  logger.info(
    `[Recycler] RECYCLE — vault fully exhausted (${totalCount} videos all mined). ` +
    `Resetting mined flags → re-queueing everything for next publishing cycle…`,
  );

  try {
    await db
      .update(backCatalogVideos)
      .set({ minedForShorts: false, minedForLongForm: false });

    logger.info(`[Recycler] Reset mined flags on ${totalCount} videos — back-catalog engine will re-queue all clips with fresh publishAt timestamps`);

    _lastFullRecycleMs = now;
    _lastResumeTriggerMs = now; // also reset resume timer so it doesn't fire immediately after

    const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
    await runBackCatalogForAllEligibleUsers();
    logger.info("[Recycler] RECYCLE complete — fresh publish cycle queued");

    // Brain feed
    try {
      const { recordOutcome } = await import("../lib/outcome-recorder");
      const { storage } = await import("../storage");
      const allUsers = await storage.getAllUsers();
      const brainUserId = allUsers[0]?.id;
      if (brainUserId) {
        await recordOutcome({
          engine:     "perpetual-recycler",
          userId:     brainUserId,
          category:   "full_recycle",
          summary:    `Recycler FULL RECYCLE: all ${totalCount} BF6 catalog videos mined — mined flags reset, fresh publish cycle queued`,
          metrics:    { totalCount, recycleCount: 1 },
          confidence: 0.95,
          recommendation: `Full catalog loop complete — all ${totalCount} BF6 videos will be re-queued as Shorts + long-form with fresh publish slots. Channel has infinite content.`,
        });
      }
    } catch { /* non-fatal */ }
  } catch (err: any) {
    logger.warn("[Recycler] RECYCLE failed (non-fatal)", { error: err?.message?.slice(0, 200) });
    return { triggered: false, fullRecycle: true, reason: "recycle_db_error" };
  }

  return { triggered: true, fullRecycle: true, reason: "full_recycle" };
}
