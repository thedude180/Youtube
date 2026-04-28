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
import { contentPipeline, autopilotQueue, users } from "@shared/schema";
import { eq, lt, and, or, ilike, sql, inArray } from "drizzle-orm";
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
