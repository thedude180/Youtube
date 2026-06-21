/**
 * EngineQueue — global engine-cycle concurrency limiter.
 *
 * Prevents all 50+ background engines from running their full cycles simultaneously.
 * At most MAX_CONCURRENT engine cycles can run at the same time. All others are
 * deferred by CommandCenter.canRun() and retry on their next natural schedule interval.
 *
 * Slots auto-release after CYCLE_TTL_MS (5 min) so a hung or long-running engine
 * can never permanently block others. Engines that complete early should call the
 * returned release() function so the slot becomes available sooner.
 */

import { createLogger } from "./logger";

const logger = createLogger("engine-queue");

const MAX_CONCURRENT = Math.max(1, parseInt(process.env.ENGINE_QUEUE_MAX ?? "3", 10));
const CYCLE_TTL_MS = 5 * 60_000;

type SlotEntry = {
  module: string;
  userId?: string;
  acquiredAt: number;
  timerId: ReturnType<typeof setTimeout>;
};

const _slots: SlotEntry[] = [];

function _expireStale(): void {
  const now = Date.now();
  for (let i = _slots.length - 1; i >= 0; i--) {
    if (now - _slots[i].acquiredAt >= CYCLE_TTL_MS) {
      clearTimeout(_slots[i].timerId);
      _slots.splice(i, 1);
    }
  }
}

/**
 * Try to acquire an engine-cycle slot.
 *
 * Returns a `release()` function on success (call it when the cycle completes
 * so the slot becomes available sooner than the TTL). Returns `null` if
 * MAX_CONCURRENT slots are already occupied.
 */
export function tryAcquireEngineCycle(module: string, userId?: string): (() => void) | null {
  _expireStale();
  if (_slots.length >= MAX_CONCURRENT) {
    logger.debug(`[EngineQueue] ${module} deferred — ${_slots.length}/${MAX_CONCURRENT} slots busy`);
    return null;
  }

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    clearTimeout(entry.timerId);
    const idx = _slots.indexOf(entry);
    if (idx >= 0) _slots.splice(idx, 1);
    logger.debug(`[EngineQueue] ${module} released slot — active: ${_slots.length}/${MAX_CONCURRENT}`);
  };

  const timerId = setTimeout(release, CYCLE_TTL_MS);
  const entry: SlotEntry = { module, userId, acquiredAt: Date.now(), timerId };
  _slots.push(entry);
  logger.debug(`[EngineQueue] ${module} acquired slot — active: ${_slots.length}/${MAX_CONCURRENT}`);
  return release;
}

/** Whether at least one slot is free without acquiring it. */
export function isEngineSlotAvailable(): boolean {
  _expireStale();
  return _slots.length < MAX_CONCURRENT;
}

/** Diagnostic snapshot for /api/health and admin dashboards. */
export function getEngineQueueStats(): {
  active: number;
  max: number;
  slots: { module: string; userId?: string; heldMs: number }[];
} {
  _expireStale();
  return {
    active: _slots.length,
    max: MAX_CONCURRENT,
    slots: _slots.map(s => ({
      module: s.module,
      userId: s.userId ? s.userId.slice(0, 8) + "…" : undefined,
      heldMs: Date.now() - s.acquiredAt,
    })),
  };
}
