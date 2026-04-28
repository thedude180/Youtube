/**
 * PERPETUAL REPAIR ENGINE
 * ────────────────────────────────────────────────────────────────────────────
 * Runs every 30 minutes. Finds and fixes every type of mid-run stuck state so
 * the system truly never stops:
 *
 *  1. Reset pipelines stuck in "processing" for > 2h → pending
 *  2. Reset pipeline errors caused by AI-queue saturation → pending (max 5)
 *  3. Reset backlog items failed due to token errors → queued
 *  4. Detect empty autopilot queues → trigger backlog replenishment
 *  5. Detect AI semaphore deadlock → forcibly reset the background slot counter
 *  6. Record its own heartbeat so the ops health page tracks it
 *
 * This complements healProductionPipeline() which runs once on boot.
 * Together they ensure no stuck state survives more than 30 minutes.
 */

import { db } from "../db";
import { contentPipeline, autopilotQueue, channels, users } from "@shared/schema";
import { eq, lt, and, or, ilike, sql, count, gte } from "drizzle-orm";
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
    const stuckCutoff = new Date(Date.now() - STUCK_PIPELINE_MS);
    const stuckResult = await db.update(contentPipeline)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(
        eq(contentPipeline.status, "processing"),
        lt(contentPipeline.updatedAt, stuckCutoff),
      ))
      .returning({ id: contentPipeline.id });
    if (stuckResult.length > 0) {
      summary.push(`${stuckResult.length} stuck-processing → pending`);
    }

    // 2. Pipelines failed with AI-queue-full errors → back to pending ──────
    const aiErrorResult = await db.update(contentPipeline)
      .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
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
        // Only reset items that have been stuck in error for at least 5 minutes
        lt(contentPipeline.updatedAt, new Date(Date.now() - 5 * 60_000)),
      ))
      .limit(MAX_AI_RESETS)
      .returning({ id: contentPipeline.id });
    if (aiErrorResult.length > 0) {
      summary.push(`${aiErrorResult.length} AI-error pipelines → pending`);
    }

    // 3. Backlog items failed due to token/auth errors → queued ────────────
    const tokenErrorResult = await db.update(autopilotQueue)
      .set({ status: "queued", scheduledFor: new Date(Date.now() + 30 * 60_000) })
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
      .limit(MAX_TOKEN_RESETS)
      .returning({ id: autopilotQueue.id });
    if (tokenErrorResult.length > 0) {
      summary.push(`${tokenErrorResult.length} token-error backlog → queued`);
    }

    // 4. Empty autopilot queues → replenish ───────────────────────────────
    // Find users with autopilot active but 0 queued items.
    const autopilotUsers = await db.selectDistinct({ userId: autopilotQueue.userId })
      .from(autopilotQueue)
      .where(
        or(
          eq(autopilotQueue.status, "queued"),
          eq(autopilotQueue.status, "processing"),
        )
      );

    const activeUserIds = new Set(autopilotUsers.map(r => r.userId));

    // Get all users who have autopilot config active
    const allAutopilotUsers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.tier, "ultimate"));

    for (const u of allAutopilotUsers) {
      if (!activeUserIds.has(u.id)) {
        // Queue is completely empty — trigger replenishment
        try {
          const { startBacklogOnLogin } = await import("../backlog-manager");
          await startBacklogOnLogin(u.id);
          summary.push(`backlog replenished for user ${u.id.substring(0, 8)}`);
          logger.info(`[perpetual-repair] Backlog replenished for idle user ${u.id.substring(0, 8)}`);
        } catch (err: any) {
          logger.warn(`[perpetual-repair] Could not replenish backlog for ${u.id.substring(0, 8)}: ${err.message}`);
        }
      }
    }

    // 5. AI semaphore health check ─────────────────────────────────────────
    // If the background slot counter is at max and has been for a while with no
    // heartbeat activity from background engines, reset it. We detect this via
    // the "last_background_ai_call" sentinel stored in shared memory.
    // (Best-effort — if it fails, the semaphore self-recovers via its own timeout)
    try {
      const { getAISemaphoreStats } = await import("../lib/openai");
      if (typeof getAISemaphoreStats === "function") {
        const stats = getAISemaphoreStats();
        if (stats.backgroundQueueDepth >= stats.backgroundMaxDepth && stats.backgroundWaitingMs > 10 * 60_000) {
          const { resetAIBackgroundQueue } = await import("../lib/openai");
          if (typeof resetAIBackgroundQueue === "function") {
            resetAIBackgroundQueue();
            summary.push("AI background semaphore deadlock detected and reset");
            logger.warn("[perpetual-repair] AI background semaphore deadlock — forced reset");
          }
        }
      }
    } catch {
      // graceful — semaphore reset is optional, not critical
    }

    const elapsed = Date.now() - cycleStart;
    if (summary.length > 0) {
      logger.info(`[perpetual-repair] Cycle complete (${elapsed}ms): ${summary.join(", ")}`);
    } else {
      logger.info(`[perpetual-repair] Cycle complete (${elapsed}ms): everything healthy`);
    }

    await recordHeartbeat("perpetual-repair", "idle", elapsed);
  } catch (err: any) {
    logger.error(`[perpetual-repair] Repair cycle failed: ${err.message}`);
    await recordHeartbeat("perpetual-repair", "error", Date.now() - cycleStart, err.message);
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
