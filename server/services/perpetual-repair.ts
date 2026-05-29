/**
 * PERPETUAL REPAIR ENGINE
 * ────────────────────────────────────────────────────────────────────────────
 * Runs every 30 minutes. Finds and fixes every type of mid-run stuck state so
 * the system truly never stops:
 *
 *  1. Reset pipelines stuck in "processing" for > 2h → pending
 *  2. Reset pipeline errors caused by AI-queue saturation → pending (max 5)
 *  3. Reset backlog items failed due to token errors → queued (30-min delay)
 *  4. Rescue permanent_fail autopilot items older than 24h → queued (+1h)
 *  5. Detect empty autopilot queues → trigger backlog replenishment
 *  6. Record its own heartbeat so the ops health page tracks it
 *
 * This complements healProductionPipeline() which runs once on boot.
 * Together they ensure no stuck state survives more than 30 minutes.
 */

import { db } from "../db";
import { contentPipeline, autopilotQueue, users, backCatalogVideos, trustBudgetPeriods } from "@shared/schema";
import { eq, lt, and, or, ilike, sql, inArray, ne, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { recordHeartbeat } from "./engine-heartbeat";

const logger = createLogger("perpetual-repair");

const REPAIR_INTERVAL_MS  = 30 * 60_000;  // 30 min
const STUCK_PIPELINE_MS   =  2 * 60 * 60_000; // 2h in processing = stuck
const MAX_AI_RESETS       = 5;            // max AI-error resets per repair cycle
const MAX_TOKEN_RESETS    = 20;           // max token-error backlog resets per cycle

let repairInterval: ReturnType<typeof setInterval> | null = null;

// ─── REPAIR CYCLE ──────────────────────────────────────────────────────────

async function runRepairCycle(): Promise<void> {
  const cycleStart = Date.now();
  const summary: string[] = [];

  try {
    // 1. Pipelines stuck in "processing" for > 2h ─────────────────────────
    // contentPipeline uses startedAt for when processing began (no updatedAt col)
    const stuckCutoff = new Date(Date.now() - STUCK_PIPELINE_MS);
    const stuckIds = await db
      .select({ id: contentPipeline.id })
      .from(contentPipeline)
      .where(and(
        eq(contentPipeline.status, "processing"),
        lt(contentPipeline.startedAt, stuckCutoff),
      ));
    if (stuckIds.length > 0) {
      await db.update(contentPipeline)
        .set({ status: "pending" })
        .where(inArray(contentPipeline.id, stuckIds.map(r => r.id)));
      summary.push(`${stuckIds.length} stuck-processing → pending`);
    }

    // 2. Pipelines failed with AI-queue-full errors → back to pending ──────
    const recentErrorCutoff = new Date(Date.now() - 5 * 60_000); // failed > 5m ago
    const aiErrorIds = await db
      .select({ id: contentPipeline.id })
      .from(contentPipeline)
      .where(and(
        eq(contentPipeline.status, "error"),
        or(
          ilike(contentPipeline.errorMessage, "%ai queue%"),
          ilike(contentPipeline.errorMessage, "%queue full%"),
          ilike(contentPipeline.errorMessage, "%background queue%"),
          ilike(contentPipeline.errorMessage, "%semaphore%"),
          ilike(contentPipeline.errorMessage, "%429%"),
          ilike(contentPipeline.errorMessage, "%rate limit%"),
        ),
      ))
      .limit(MAX_AI_RESETS);
    if (aiErrorIds.length > 0) {
      await db.update(contentPipeline)
        .set({ status: "pending", errorMessage: null })
        .where(inArray(contentPipeline.id, aiErrorIds.map(r => r.id)));
      summary.push(`${aiErrorIds.length} AI-error pipelines → pending`);
    }

    // 3. Backlog items failed due to token/auth errors → queued ────────────
    // Schedule 30 min into the future so any token repair can complete first
    const tokenRetryAt = new Date(Date.now() + 30 * 60_000);
    const tokenErrorIds = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "failed"),
        or(
          ilike(sql`${autopilotQueue.metadata}::text`, "%token%"),
          ilike(sql`${autopilotQueue.metadata}::text`, "%unauthorized%"),
          ilike(sql`${autopilotQueue.metadata}::text`, "%401%"),
          ilike(sql`${autopilotQueue.metadata}::text`, "%not connected%"),
          ilike(sql`${autopilotQueue.metadata}::text`, "%channel not found%"),
        ),
      ))
      .limit(MAX_TOKEN_RESETS);
    if (tokenErrorIds.length > 0) {
      await db.update(autopilotQueue)
        .set({ status: "queued", scheduledAt: tokenRetryAt })
        .where(inArray(autopilotQueue.id, tokenErrorIds.map(r => r.id)));
      summary.push(`${tokenErrorIds.length} token-error backlog → queued (+30m)`);
    }

    // 4. permanent_fail items older than 24h → rescue back to pending ────────
    // auto-fix-engine sets permanent_fail after repeated failures, but the
    // underlying cause (bad token, missing connection, rate limit) usually
    // resolves within hours. Reset them once per day so they get another chance.
    const permanentFailCutoff = new Date(Date.now() - 24 * 60 * 60_000);
    const permanentFailIds = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "permanent_fail" as any),
        lt(autopilotQueue.createdAt, permanentFailCutoff),
      ))
      .limit(50);
    if (permanentFailIds.length > 0) {
      const retryAt = new Date(Date.now() + 60 * 60_000); // 1h from now
      await db.update(autopilotQueue)
        .set({ status: "queued", scheduledAt: retryAt, errorMessage: null })
        .where(inArray(autopilotQueue.id, permanentFailIds.map(r => r.id)));
      summary.push(`${permanentFailIds.length} permanent_fail → queued (+1h)`);
    }

    // 5a. Cancel corrupted queue items with cross-contaminated YouTube IDs ──
    // These items have a sourceYoutubeId that doesn't match their streamTitle
    // (e.g., a BF6 live-stream ID stored against an AC Syndicate title).
    // yt-dlp will never succeed on them — cancel them so they stop burning
    // download attempts and log noise.
    const corruptedYtIds = ["Jrt9VPmojMA"];
    for (const ytId of corruptedYtIds) {
      const corrupted = await db
        .select({ id: autopilotQueue.id })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.status, "scheduled"),
          ilike(sql`${autopilotQueue.metadata}::text`, `%${ytId}%`),
        ));
      if (corrupted.length > 0) {
        await db.update(autopilotQueue)
          .set({ status: "cancelled" as any, errorMessage: `corrupted-yt-id:${ytId}` })
          .where(inArray(autopilotQueue.id, corrupted.map(r => r.id)));
        summary.push(`${corrupted.length} corrupted-yt-id(${ytId}) → cancelled`);
        logger.info(`[perpetual-repair] Cancelled ${corrupted.length} corrupted queue items (sourceYoutubeId=${ytId})`);
      }
    }

    // 5b. Fix BF6 live streams misclassified as "PS5" or other generic names ─
    // When a stream title contains "Battlefield" or "BF6" but game_name was set
    // to a generic platform tag instead, the game priority gate ignores it.
    // Re-classify these so the back catalog runner picks them up correctly.
    const bf6Misclassified = await db
      .select({ id: backCatalogVideos.id, title: backCatalogVideos.title, gameName: backCatalogVideos.gameName })
      .from(backCatalogVideos)
      .where(and(
        or(
          ilike(backCatalogVideos.title, "%battlefield%"),
          ilike(backCatalogVideos.title, "%bf6%"),
          ilike(backCatalogVideos.title, "%bf 6%"),
        ),
        or(
          isNull(backCatalogVideos.gameName),
          ilike(backCatalogVideos.gameName, "ps5"),
          ilike(backCatalogVideos.gameName, "ps4"),
          ilike(backCatalogVideos.gameName, "xbox"),
          ilike(backCatalogVideos.gameName, "gaming"),
          ilike(backCatalogVideos.gameName, "gameplay"),
          ilike(backCatalogVideos.gameName, "live"),
          ilike(backCatalogVideos.gameName, "stream"),
        ),
      ));
    if (bf6Misclassified.length > 0) {
      await db.update(backCatalogVideos)
        .set({
          gameName: "Battlefield 6",
          minedForShorts: false,
          minedForLongForm: false,
          updatedAt: new Date(),
        })
        .where(inArray(backCatalogVideos.id, bf6Misclassified.map(r => r.id)));
      summary.push(`${bf6Misclassified.length} BF6 videos reclassified (was generic game_name)`);
      logger.info(`[perpetual-repair] Reclassified ${bf6Misclassified.length} BF6 catalog videos from generic game_name to "Battlefield 6"`);
    }

    // 5c. Reset autopilot_queue items stuck in "processing" or "publishing" ─
    // Items that hit "processing" / "publishing" and then the server restarted
    // (or the encode/upload timed out) are permanently stuck — nothing rescues
    // them.  Reset them to "scheduled" so the shorts publisher picks them up
    // on the next cycle.
    // Use createdAt as proxy — any item created more than 2h ago still in
    // processing/publishing has definitely been abandoned mid-flight.
    const STUCK_QUEUE_MS = 2 * 60 * 60_000;
    const stuckQueueCutoff = new Date(Date.now() - STUCK_QUEUE_MS);
    const stuckQueueIds = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(and(
        or(
          eq(autopilotQueue.status, "processing"),
          eq(autopilotQueue.status, "publishing"),
        ),
        lt(autopilotQueue.createdAt, stuckQueueCutoff),
      ));
    if (stuckQueueIds.length > 0) {
      await db.update(autopilotQueue)
        .set({ status: "scheduled", errorMessage: null })
        .where(inArray(autopilotQueue.id, stuckQueueIds.map(r => r.id)));
      summary.push(`${stuckQueueIds.length} stuck-queue (processing/publishing) → scheduled`);
    }

    // 5d. Reset exhausted distribution:youtube trust budget ────────────────
    // The autopilot-engine checks this budget before dispatching any YouTube
    // distribution action.  If it hits zero the channel stops publishing for
    // the rest of the day.  Replenish it so the engine can dispatch again.
    // We use a generous budget (10,000) so a single day of normal operation
    // can never exhaust it.
    const exhaustedBudgets = await db
      .select({ id: trustBudgetPeriods.id })
      .from(trustBudgetPeriods)
      .where(and(
        eq(trustBudgetPeriods.agentName, "distribution:youtube"),
        eq(trustBudgetPeriods.endingBudget, 0),
      ));
    if (exhaustedBudgets.length > 0) {
      await db.update(trustBudgetPeriods)
        .set({ endingBudget: 10000, startingBudget: 10000, deductionsCount: 0, totalDeducted: 0 })
        .where(inArray(trustBudgetPeriods.id, exhaustedBudgets.map(r => r.id)));
      summary.push(`${exhaustedBudgets.length} exhausted distribution:youtube trust budgets replenished`);
    }

    // 5. Empty autopilot queues → replenish ───────────────────────────────
    // Find users with autopilot active but 0 queued or processing items.
    const activeUserRows = await db
      .selectDistinct({ userId: autopilotQueue.userId })
      .from(autopilotQueue)
      .where(or(
        eq(autopilotQueue.status, "queued"),
        eq(autopilotQueue.status, "processing"),
      ));
    const activeUserIds = new Set(activeUserRows.map(r => r.userId));

    // Get all ultimate-tier users (autopilot enabled)
    const ultimateUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tier, "ultimate"));

    for (const u of ultimateUsers) {
      if (!activeUserIds.has(u.id)) {
        // Queue is completely empty — trigger replenishment
        try {
          const { startBacklogOnLogin } = await import("../backlog-manager");
          await startBacklogOnLogin(u.id);
          summary.push(`backlog replenished for ${u.id.substring(0, 8)}`);
          logger.info(`[perpetual-repair] Backlog replenished for idle user ${u.id.substring(0, 8)}`);
        } catch (err: any) {
          logger.warn(`[perpetual-repair] Could not replenish backlog for ${u.id.substring(0, 8)}: ${err.message?.substring(0, 100)}`);
        }
      }
    }

    const elapsed = Date.now() - cycleStart;
    if (summary.length > 0) {
      logger.info(`[perpetual-repair] Cycle complete (${elapsed}ms): ${summary.join(", ")}`);
    } else {
      logger.info(`[perpetual-repair] Cycle complete (${elapsed}ms): everything healthy`);
    }

    await recordHeartbeat("perpetual-repair", "idle", elapsed);
  } catch (err: any) {
    logger.error(`[perpetual-repair] Repair cycle failed: ${err.message?.substring(0, 200)}`);
    await recordHeartbeat("perpetual-repair", "error", Date.now() - cycleStart, err.message?.substring(0, 200));
  }
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

export function startPerpetualRepair(): void {
  if (repairInterval) return;

  // First run: 5-minute delay so the boot sequence finishes before we start
  // touching the same tables that healProductionPipeline() just reset.
  setTimeout(() => {
    runRepairCycle().catch(err =>
      logger.warn(`[perpetual-repair] Initial cycle failed: ${err.message}`)
    );
  }, 5 * 60_000);

  repairInterval = setInterval(() => {
    runRepairCycle().catch(err =>
      logger.warn(`[perpetual-repair] Repair cycle failed: ${err.message}`)
    );
  }, REPAIR_INTERVAL_MS);

  logger.info("Perpetual Repair Engine started — system self-heals every 30 min, forever");
}

export function stopPerpetualRepair(): void {
  if (repairInterval) {
    clearInterval(repairInterval);
    repairInterval = null;
  }
}
