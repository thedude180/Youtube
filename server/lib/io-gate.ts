/**
 * io-gate.ts — Global single-slot heavy-I/O gate.
 *
 * Ensures only ONE heavy I/O operation (vault yt-dlp download or YouTube
 * multipart video upload) runs at a time across the entire system.
 *
 * Running a download and an upload concurrently doubles RAM and network
 * pressure and has caused OOM crashes in production. This gate serialises
 * all callers into a FIFO queue so they take turns rather than piling on.
 *
 * Typical usage:
 *
 *   const { acquireIOSlot, releaseIOSlot } = await import("../lib/io-gate");
 *   await acquireIOSlot("my-service");
 *   const result = await doHeavyWork().finally(() => releaseIOSlot("my-service"));
 */

import { createLogger } from "./logger";

const logger = createLogger("io-gate");

// ── State ────────────────────────────────────────────────────────────────────
let _holder: string | null = null;
let _heldSince: number | null = null;
type Waiter = { who: string; resolve: () => void };
const _waiters: Waiter[] = [];

// Safety-net: force-release after this long regardless.
// yt-dlp hard limit is ~20 min; the largest long-form uploads rarely exceed 60 min.
const MAX_HOLD_MS = 90 * 60_000;

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Acquire the single heavy-I/O slot.
 * If another caller currently holds it, this waits (async queue) until released.
 * Always pair with releaseIOSlot() in a finally block.
 */
export async function acquireIOSlot(who: string): Promise<void> {
  if (_holder === null) {
    _holder = who;
    _heldSince = Date.now();
    logger.debug(`[IOGate] "${who}" acquired slot`);
    return;
  }
  const waitSec = _heldSince ? Math.round((Date.now() - _heldSince) / 1000) : 0;
  logger.info(
    `[IOGate] "${who}" queuing — slot held by "${_holder}" for ${waitSec}s ` +
    `(${_waiters.length + 1} caller(s) now waiting)`,
  );
  await new Promise<void>(resolve => _waiters.push({ who, resolve }));
  // releaseIOSlot() already updated _holder before calling resolve().
  logger.debug(`[IOGate] "${who}" acquired slot`);
}

/**
 * Release the heavy-I/O slot.
 * Wakes the next queued caller (if any) before returning.
 */
export function releaseIOSlot(who: string): void {
  if (_holder !== who) {
    // Mis-matched release — safe to ignore (can happen after a watchdog force-release).
    logger.debug(`[IOGate] releaseIOSlot("${who}") ignored — holder is "${_holder}"`);
    return;
  }
  const next = _waiters.shift();
  if (next) {
    // Update _holder BEFORE resolving so any synchronous check sees the correct value.
    _holder = next.who;
    _heldSince = Date.now();
    logger.debug(`[IOGate] "${who}" → "${next.who}" (${_waiters.length} still queued)`);
    next.resolve();
  } else {
    _holder = null;
    _heldSince = null;
    logger.debug(`[IOGate] "${who}" released — slot free`);
  }
}

/** True if no heavy-I/O operation is currently running. */
export function isIOSlotFree(): boolean {
  return _holder === null;
}

/** Diagnostics snapshot — safe to call any time. */
export function getIOGateStatus(): {
  held: boolean;
  holder: string | null;
  heldSec: number;
  waiters: number;
} {
  return {
    held:    _holder !== null,
    holder:  _holder,
    heldSec: _heldSince ? Math.round((Date.now() - _heldSince) / 1000) : 0,
    waiters: _waiters.length,
  };
}

// ── Watchdog ─────────────────────────────────────────────────────────────────
// If the slot is held longer than MAX_HOLD_MS the caller likely crashed or stalled.
// Force-wake the next waiter so the queue doesn't block permanently.
setInterval(() => {
  if (!_holder || !_heldSince) return;
  if (Date.now() - _heldSince <= MAX_HOLD_MS) return;

  const heldMin = Math.round((Date.now() - _heldSince) / 60_000);
  logger.warn(
    `[IOGate] Stuck slot — "${_holder}" held for ${heldMin} min ` +
    `(limit ${MAX_HOLD_MS / 60_000} min). Force-releasing to unblock ${_waiters.length} caller(s).`,
  );
  const next = _waiters.shift();
  if (next) {
    _holder = next.who;
    _heldSince = Date.now();
    logger.info(`[IOGate] Watchdog force-woke "${next.who}"`);
    next.resolve();
  } else {
    _holder = null;
    _heldSince = null;
    logger.info(`[IOGate] Watchdog cleared stuck slot — no waiters`);
  }
}, 60_000).unref();
