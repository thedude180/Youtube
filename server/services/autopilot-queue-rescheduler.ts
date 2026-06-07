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
import { and, eq, inArray, lt, isNull, or, gt } from "drizzle-orm";
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

/**
 * Reprioritize future-scheduled items so the focus-game's content occupies
 * the earliest available slots.
 *
 * Called immediately when a stream ends and a new focus game is detected.
 * Unlike rescheduleForUser (which only moves past-due items), this function
 * operates on ALL future-scheduled items and swaps their dates so that
 * focus-game content rises to the front of the calendar.
 *
 * No new slots are created and no cadence rules are violated — we redistribute
 * the existing pool of already-valid scheduledAt values.
 */
export async function reprioritizeFutureQueue(
  userId: string,
  focusGame: string,
): Promise<{ swapped: number }> {
  if (!isProductionAutomationAllowed(userId).allowed) return { swapped: 0 };

  const { matchesFocusGame } = await import("../lib/game-focus");
  const now = new Date();
  let swapped = 0;

  async function reprioritizeBucket(types: string[]): Promise<number> {
    const items = await db
      .select()
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, "youtube"),
        eq(autopilotQueue.status, "scheduled"),
        gt(autopilotQueue.scheduledAt, now),
        inArray(autopilotQueue.type, types),
      ))
      .orderBy(autopilotQueue.scheduledAt);

    if (items.length < 2) return 0;

    // Pool of existing scheduledAt dates (already in ascending order)
    const dates = items.map(i => i.scheduledAt!);

    // Split focus-game items from everything else
    const focusItems = items.filter(i =>
      matchesFocusGame(focusGame, { gameName: extractGameName(i.metadata) }),
    );
    const otherItems = items.filter(i =>
      !matchesFocusGame(focusGame, { gameName: extractGameName(i.metadata) }),
    );

    // Nothing to reorder if one bucket is empty
    if (focusItems.length === 0 || otherItems.length === 0) return 0;

    // Focus items get the earliest dates; other games get the remainder
    const reordered = [...focusItems, ...otherItems];
    let count = 0;
    for (let i = 0; i < reordered.length; i++) {
      const item = reordered[i];
      const newDate = dates[i];
      if (!newDate || item.scheduledAt?.getTime() === newDate.getTime()) continue;
      try {
        await db
          .update(autopilotQueue)
          .set({ scheduledAt: newDate })
          .where(and(
            eq(autopilotQueue.id, item.id),
            eq(autopilotQueue.status, "scheduled"),
          ));
        count++;
      } catch { /* non-fatal */ }
    }
    return count;
  }

  swapped += await reprioritizeBucket(SHORT_TYPES);
  swapped += await reprioritizeBucket(LONGFORM_TYPES);

  if (swapped > 0) {
    logger.info(
      `[QueueRescheduler] Future queue reprioritized for "${focusGame}" — ` +
      `${swapped} items moved to earlier slots`,
    );
  } else {
    logger.debug(`[QueueRescheduler] Future queue already ordered correctly for "${focusGame}"`);
  }

  return { swapped };
}

/** Run one full rescheduling pass across all eligible users. */
export async function runReschedulerCycle(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    let totalRescheduled = 0;

    // Resolve focus game once — same for all users on this deployment
    let focusGame = "Battlefield 6";
    try {
      const { getFocusGame } = await import("../lib/game-focus");
      focusGame = await getFocusGame();
    } catch { /* non-fatal */ }

    for (const user of allUsers) {
      const guard = isProductionAutomationAllowed(user.id);
      if (!guard.allowed) continue;

      const { rescheduled } = await rescheduleForUser(user.id);
      totalRescheduled += rescheduled;

      // Always reprioritize the future queue so the focus-game's content
      // stays at the front — catches manual focus changes (API/admin) that
      // don't trigger a stream-end event.
      await reprioritizeFutureQueue(user.id, focusGame).catch(() => undefined);
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
