/**
 * AI concurrency semaphore with integrated circuit breaker.
 *
 * - 1 slot in-flight at a time (prevents burst)
 * - 2 s mandatory inter-call gap (≤ 30 calls/min)
 * - Circuit breaker: any upstream 429 pauses all callers
 * - Background-tier callers fail fast when bg queue is saturated
 * - Hard reset drains the queue instantly (for dev/testing)
 */
import { createLogger } from "../core/logger.js";

const log = createLogger("ai-semaphore");

const MIN_GAP_MS = 2_000;
const STARTUP_HOLD_MS = 30_000;
const MAX_QUEUE = 12;
const BG_MAX_QUEUE = 8;
const DEFAULT_CB_COOLDOWN_MS = 5 * 60_000;
const CHAT_PRIORITY_MS = 120_000;

const boot = Date.now();
let busy = false;
let lastRelease = 0;
let rateLimitedUntil = 0;
let consecutive429s = 0;
let last429At = 0;
let chatPriorityUntil = 0;
let bgQueueCount = 0;
let bgDepthOverride: number | null = null;
let preAcquiredToken = false;

type Waiter = { resolve: () => void; reject: (e: Error) => void; bg: boolean };
const queue: Waiter[] = [];

export function setBackgroundConcurrency(limit: number | null) {
  bgDepthOverride = limit;
}

export function notifyRateLimit(retryAfterMs?: number) {
  const now = Date.now();
  if (chatPriorityUntil > now) return; // suppressed during priority window
  consecutive429s = now - last429At < 10 * 60_000
    ? Math.min(consecutive429s + 1, 8)
    : 1;
  last429At = now;
  const cooldown = retryAfterMs
    ? Math.min(retryAfterMs + 5_000, 10 * 60_000)
    : Math.min(DEFAULT_CB_COOLDOWN_MS * 2 ** (consecutive429s - 1), 10 * 60_000);
  const until = now + cooldown + Math.random() * 30_000;
  if (until > rateLimitedUntil) rateLimitedUntil = until;
}

export function resetCircuitBreaker() {
  rateLimitedUntil = 0;
  consecutive429s = 0;
  last429At = 0;
}

export function hardReset() {
  resetCircuitBreaker();
  busy = false;
  preAcquiredToken = false;
  chatPriorityUntil = Date.now() + CHAT_PRIORITY_MS;
  const drained = queue.splice(0);
  bgQueueCount = 0;
  for (const w of drained) {
    try { w.reject(new Error("AI semaphore hard reset")); } catch { /**/ }
  }
  log.info(`Hard reset — drained ${drained.length} waiters`);
}

async function pause(ms: number) {
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

async function waitForRelease(bg: boolean) {
  const bgLimit = bgDepthOverride ?? BG_MAX_QUEUE;
  if (bg && bgQueueCount >= bgLimit)
    throw new Error(`AI bg queue full (${bgQueueCount}/${bgLimit}) — dropped`);
  if (queue.length >= MAX_QUEUE)
    throw new Error(`AI queue full (${MAX_QUEUE}) — dropped`);
  if (bg) bgQueueCount++;
  await new Promise<void>((resolve, reject) => queue.push({ resolve, reject, bg }));
}

async function acquireInternal(bg: boolean) {
  if (preAcquiredToken) { preAcquiredToken = false; return; }
  if (bg && chatPriorityUntil > Date.now())
    throw new Error("AI slot deferred: chat priority window");

  const startupRem = STARTUP_HOLD_MS - (Date.now() - boot);
  if (startupRem > 0) await pause(startupRem + Math.random() * 5_000);

  while (true) {
    const cbRem = rateLimitedUntil - Date.now();
    if (cbRem > 0) await pause(cbRem + Math.random() * 3_000);
    if (!busy) {
      busy = true;
      const gap = MIN_GAP_MS - (Date.now() - lastRelease);
      if (gap > 0) await pause(gap);
      return;
    }
    await waitForRelease(bg);
  }
}

export async function acquireSlot() { await acquireInternal(false); }
export async function acquireSlotBackground() { await acquireInternal(true); }

export function releaseSlot() {
  lastRelease = Date.now();
  busy = false;
  preAcquiredToken = false;
  const critIdx = queue.findIndex((w) => !w.bg);
  const idx = critIdx >= 0 ? critIdx : 0;
  const w = queue.splice(idx, 1)[0];
  if (w) {
    if (w.bg) bgQueueCount = Math.max(0, bgQueueCount - 1);
    setTimeout(w.resolve, MIN_GAP_MS);
  }
}

export function tryAcquireNow(): boolean {
  const now = Date.now();
  if (rateLimitedUntil > now || busy || STARTUP_HOLD_MS - (now - boot) > 0) return false;
  busy = true;
  preAcquiredToken = true;
  return true;
}

export function stats() {
  const now = Date.now();
  return {
    busy,
    queued: queue.length,
    bgQueued: bgQueueCount,
    rateLimitedUntil,
    startupGraceMs: Math.max(0, STARTUP_HOLD_MS - (now - boot)),
    chatPriorityMs: Math.max(0, chatPriorityUntil - now),
  };
}
