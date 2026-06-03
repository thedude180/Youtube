/**
 * server/lib/cron-scheduler.ts
 *
 * Fix #3 — 19 Cron Jobs All Fire at Midnight (Thundering Herd)
 *
 * Drop-in replacement for node-cron that staggers jobs scheduled at the
 * same time. All the midnight reset jobs fire at 00:00:00 UTC simultaneously
 * causing a massive event loop stall where every cron misses its execution.
 *
 * Usage — replace:
 *   schedule('0 0 * * *', myHandler)
 *
 * With:
 *   scheduleCron('0 0 * * *', myHandler, { label: 'reset-token-budget' })
 *
 * Jobs with the same cron expression are automatically staggered by
 * STAGGER_INTERVAL_MS between each, so they never fire simultaneously.
 */
import { schedule, ScheduledTask } from "node-cron";
import { createLogger } from "./logger";

const log = createLogger("cron-scheduler");

const STAGGER_INTERVAL_MS = 45_000; // 45 seconds between same-expression jobs

const expressionCounts = new Map<string, number>();
const registeredTasks  = new Map<string, ScheduledTask>();

export interface CronOptions {
  label:      string;
  timezone?:  string;
}

/**
 * Schedules a cron job with automatic staggering.
 * Multiple jobs with the same expression are offset by 45s each.
 */
export function scheduleCron(
  expression: string,
  handler:    () => void | Promise<void>,
  options:    CronOptions,
): ScheduledTask {
  const count  = expressionCounts.get(expression) ?? 0;
  const offset = count * STAGGER_INTERVAL_MS;
  expressionCounts.set(expression, count + 1);

  const wrappedHandler = () => {
    if (offset === 0) {
      Promise.resolve(handler()).catch(err =>
        log.error(`[Cron:${options.label}] Error:`, err)
      );
    } else {
      setTimeout(() => {
        Promise.resolve(handler()).catch(err =>
          log.error(`[Cron:${options.label}] Error:`, err)
        );
      }, offset);
      const offsetSec = Math.round(offset / 1000);
      log.debug(`[Cron:${options.label}] Staggered ${offsetSec}s to avoid thundering herd`);
    }
  };

  const task = schedule(expression, wrappedHandler, {
    timezone: options.timezone ?? "UTC",
  });

  registeredTasks.set(options.label, task);

  const offsetSec = Math.round(offset / 1000);
  log.info(
    `[Cron] Registered "${options.label}" | expr: ${expression} | ` +
    `offset: ${offsetSec}s | stagger slot: ${count}`
  );

  return task;
}

/**
 * Stop a named cron job.
 */
export function stopCron(label: string): void {
  const task = registeredTasks.get(label);
  if (task) {
    task.stop();
    registeredTasks.delete(label);
    log.info(`[Cron] Stopped "${label}"`);
  }
}
