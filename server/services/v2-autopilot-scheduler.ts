/**
 * v2 Autopilot Scheduler
 *
 * Polls the v2_autopilot_queue table every minute for pending items whose
 * scheduledAt has passed and dispatches each one as a pg-boss job so the
 * autopilot worker can execute them.
 *
 * This bridges the gap between pipeline code that writes to the DB and the
 * pg-boss worker that actually publishes the posts.
 */
import { eq, and, lte, or, isNull } from "drizzle-orm";
import { db } from "../core/db.js";
import { autopilotQueue } from "../../shared/schema/index.js";
import { enqueue } from "../core/job-queue.js";
import { setJitteredInterval } from "../lib/timer-utils.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("v2-autopilot-scheduler");

let stop: (() => void) | null = null;

export function startAutopilotScheduler(): void {
  if (stop) return;

  stop = setJitteredInterval(async () => {
    try {
      const now = new Date();

      // Find pending items that are due: scheduledAt <= now OR scheduledAt is null
      const dueItems = await db
        .select({ id: autopilotQueue.id, userId: autopilotQueue.userId })
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.status, "pending"),
            or(isNull(autopilotQueue.scheduledAt), lte(autopilotQueue.scheduledAt, now)),
          ),
        )
        .limit(50);

      if (dueItems.length === 0) return;

      log.info("Dispatching due autopilot items", { count: dueItems.length });

      for (const item of dueItems) {
        try {
          await enqueue("autopilot.execute-post", {
            queueItemId: item.id,
            userId: item.userId,
          });
        } catch (err: any) {
          log.warn("Failed to enqueue autopilot item", { id: item.id, error: err.message });
        }
      }
    } catch (err: any) {
      log.error("Autopilot scheduler error", { error: err.message });
    }
  }, 60_000);

  log.info("Autopilot scheduler started");
}

export function stopAutopilotScheduler(): void {
  if (stop) {
    stop();
    stop = null;
  }
}
