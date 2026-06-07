/**
 * Autopilot Queue Rescheduler
 *
 * Runs every 30 minutes. Finds all past-due `scheduled` items in autopilot_queue
 * (items whose scheduledAt < NOW that were never published), groups them by
 * game name, and assigns them new future slots in game-grouped order.
 *
 * Game-grouping ensures the schedule stays coherent: BF6 content lands on BF6
 * days, AC content on AC days — rather than randomly scattering past-due items
 * across the calendar. The current focus game is always assigned slots first.
 */

import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { and, eq, inArray, lt, isNull, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isProductionAutomationAllowed } from "../lib/production-guard";
import { storage } from "../storage";
import {
  getNextShortPublishTime,
  getNextLongFormPublishTime,
  isShortScheduleSaturated,
  isLongFormScheduleSaturated,
} from "./youtube-output-schedule";

const logger = createLogger("queue-rescheduler");

const RUN_INTERVAL_MS      = 30 * 60_000;  // every 30 min
const MAX_PER_RUN          = 60;           // cap total reschedules per pass
const MAX_PER_GAME_PER_RUN = 20;           // cap per game-group to avoid monopoly

const SHORT_TYPES   = ["youtube_short", "platform_short", "vod-short", "auto-clip"];
const LONGFORM_TYPES = ["vod-long-form", "longform"];

let reschedulerTimer: ReturnType<typeof setTimeout> | null = null;

/** Extract gameName from an autopilot_queue row's metadata. */
function extractGameName(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "Unknown";
  const m = meta as Record<string, unknown>;
  const raw = (m.gameName as string) || (m.gameTitle as string) || "";
  return raw.trim() || "Unknown";
}

/** Determine if an item is short-form or long-form. */
function itemCategory(type: string): "short" | "longform" | "unknown" {
  if (SHORT_TYPES.includes(type))    return "short";
  if (LONGFORM_TYPES.includes(type)) return "longform";
  return "unknown";
}

/**
 * Reschedule past-due items for one user.
 * Groups by gameName so same-game content gets consecutive calendar slots.
 */
async function rescheduleForUser(userId: string): Promise<{ rescheduled: number }> {
  // Get the current focus game (defaults to "Battlefield 6") so it gets
  // priority over other games when assigning slots.
  let focusGame = "Battlefield 6";
  try {
    const { getFocusGame } = await import("../lib/game-focus");
    focusGame = await getFocusGame();
  } catch { /* non-fatal */ }

  // Find all past-due scheduled items for this user on YouTube.
  const now = new Date();
  const pastDueItems = await db
    .select()
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      eq(autopilotQueue.status, "scheduled"),
      or(
        lt(autopilotQueue.scheduledAt, now),
        isNull(autopilotQueue.scheduledAt),
      ),
    ))
    .limit(MAX_PER_RUN);

  if (pastDueItems.length === 0) return { rescheduled: 0 };

  // Separate into short and long-form buckets.
  const shorts   = pastDueItems.filter(i => itemCategory(i.type) === "short");
  const longforms = pastDueItems.filter(i => itemCategory(i.type) === "longform");

  // ── Group each bucket by gameName ──────────────────────────────────────────
  function groupByGame<T extends typeof pastDueItems[number]>(items: T[]) {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const game = extractGameName(item.metadata);
      if (!map.has(game)) map.set(game, []);
      map.get(game)!.push(item);
    }
    return map;
  }

  // Sort game groups: focus game first, then alphabetically.
  function sortedGroups<T extends typeof pastDueItems[number]>(map: Map<string, T[]>) {
    return [...map.entries()].sort(([a], [b]) => {
      const aFocus = a.toLowerCase().includes(focusGame.toLowerCase()) ? -1 : 0;
      const bFocus = b.toLowerCase().includes(focusGame.toLowerCase()) ? 1  : 0;
      return aFocus + bFocus || a.localeCompare(b);
    });
  }

  let rescheduled = 0;

  // ── Reschedule Shorts ──────────────────────────────────────────────────────
  if (shorts.length > 0 && !isShortScheduleSaturated(userId)) {
    const groups = sortedGroups(groupByGame(shorts));
    for (const [gameName, items] of groups) {
      let gameCount = 0;
      for (const item of items) {
        if (rescheduled >= MAX_PER_RUN) break;
        if (gameCount >= MAX_PER_GAME_PER_RUN) break;
        // Re-check saturation inside the loop: the first getNextShortPublishTime
        // call sets the cache; subsequent calls in the same loop should be fast
        // cache-hits, but if saturation was already set before this loop started
        // we can break early and avoid any DB scan at all.
        if (isShortScheduleSaturated(userId)) break;
        try {
          const newSlot = await getNextShortPublishTime(userId);
          await db.update(autopilotQueue)
            .set({ scheduledAt: newSlot })
            .where(eq(autopilotQueue.id, item.id));
          logger.info(
            `[QueueRescheduler] Short #${item.id} (${gameName.slice(0, 30)}) ` +
            `→ ${newSlot.toISOString()}`,
          );
          rescheduled++;
          gameCount++;
        } catch (err: any) {
          logger.warn(
            `[QueueRescheduler] Failed to reschedule short #${item.id}: ` +
            `${err.message?.slice(0, 100)}`,
          );
        }
      }
    }
  } else if (isShortScheduleSaturated(userId) && shorts.length > 0) {
    logger.info(
      `[QueueRescheduler] Short schedule saturated — skipping ${shorts.length} past-due shorts`,
    );
  }

  // ── Reschedule Long-form ───────────────────────────────────────────────────
  if (longforms.length > 0 && !isLongFormScheduleSaturated(userId)) {
    const groups = sortedGroups(groupByGame(longforms));
    for (const [gameName, items] of groups) {
      let gameCount = 0;
      for (const item of items) {
        if (rescheduled >= MAX_PER_RUN) break;
        if (gameCount >= MAX_PER_GAME_PER_RUN) break;
        try {
          const newSlot = await getNextLongFormPublishTime(userId);
          await db.update(autopilotQueue)
            .set({ scheduledAt: newSlot })
            .where(eq(autopilotQueue.id, item.id));
          logger.info(
            `[QueueRescheduler] Long-form #${item.id} (${gameName.slice(0, 30)}) ` +
            `→ ${newSlot.toISOString()}`,
          );
          rescheduled++;
          gameCount++;
        } catch (err: any) {
          logger.warn(
            `[QueueRescheduler] Failed to reschedule long-form #${item.id}: ` +
            `${err.message?.slice(0, 100)}`,
          );
        }
      }
    }
  } else if (isLongFormScheduleSaturated(userId) && longforms.length > 0) {
    logger.info(
      `[QueueRescheduler] Long-form schedule saturated — skipping ${longforms.length} past-due long-forms`,
    );
  }

  return { rescheduled };
}

/** Run one full rescheduling pass across all eligible users. */
export async function runReschedulerCycle(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    let totalRescheduled = 0;

    for (const user of allUsers) {
      const guard = isProductionAutomationAllowed(user.id);
      if (!guard.allowed) continue;

      const { rescheduled } = await rescheduleForUser(user.id);
      totalRescheduled += rescheduled;
    }

    if (totalRescheduled > 0) {
      logger.info(`[QueueRescheduler] Cycle complete — ${totalRescheduled} items rescheduled`);
    } else {
      logger.debug("[QueueRescheduler] Cycle complete — no past-due items found");
    }
  } catch (err: any) {
    logger.error(`[QueueRescheduler] Cycle failed: ${err.message?.slice(0, 200)}`);
  }
}

/** Start the rescheduler — runs immediately, then every 30 min. */
export function startQueueRescheduler(): void {
  if (reschedulerTimer) return;

  // First run after 5 minutes (let publishers, migrations, and purge settle first).
  reschedulerTimer = setTimeout(async () => {
    await runReschedulerCycle().catch(() => undefined);

    // Recurring 30-min cycle.
    reschedulerTimer = setInterval(() => {
      runReschedulerCycle().catch(() => undefined);
    }, RUN_INTERVAL_MS);
  }, 5 * 60_000);

  logger.info("[QueueRescheduler] Started — first run in 5 min, then every 30 min");
}

export function stopQueueRescheduler(): void {
  if (reschedulerTimer) {
    clearInterval(reschedulerTimer);
    clearTimeout(reschedulerTimer);
    reschedulerTimer = null;
  }
}
