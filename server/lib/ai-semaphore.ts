// Shared AI concurrency semaphore with integrated circuit-breaker.
//
// Design:
// 1. Only 1 AI request in-flight at a time (prevents concurrent burst).
// 2. 3-second mandatory gap between consecutive calls (≤ 20/min max).
// 3. Circuit-breaker: any 429 from the proxy sets a global "back-off until"
//    timestamp; ALL callers re-check this after every wake-up, so a late 429
//    seen by one caller immediately pauses all callers waiting in queue.
// 4. 40-second startup grace so the engine-boot wave can't burst the proxy.
// 5. Queue cap of MAX_QUEUE_DEPTH: callers that arrive when the queue is full
//    throw immediately rather than waiting indefinitely (prevents unbounded growth).
// 6. Hard reset: clears circuit breaker AND rejects all queued callers instantly,
//    so tests/dev tooling can get a clean slate without waiting through the backlog.

export const MIN_INTER_CALL_DELAY_MS = 3_000;
const STARTUP_HOLD_MS = 40_000;
const MAX_QUEUE_DEPTH = 10;
const _bootTime = Date.now();

let _busy = false;
let _lastReleaseAt = 0;

type WakeEntry = { resolve: () => void; reject: (e: Error) => void };
const _releaseListeners: WakeEntry[] = [];

// Circuit-breaker state
let _rateLimitedUntil = 0;
// 5-minute default.  65 seconds was too short — when the window reopened all
// queued callers thundered in simultaneously, triggered another 429, and the
// cycle repeated indefinitely.  5 minutes lets OpenAI's TPM bucket refill.
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

// Track consecutive 429s so we can scale up the cooldown exponentially.
let _consecutive429s = 0;
let _lastRateLimitAt = 0;

// Chat-priority window: after a hard reset, notifyRateLimit() is suppressed for
// CHAT_PRIORITY_WINDOW_MS.  Set to 2 minutes so background processes can't re-arm
// the circuit breaker mid-wave (8-message wave at 4.5s gaps + 1.5s AI time = ~51s).
// and background acquireAISlot() calls fail-fast for this duration so the
// user-facing chat engine gets a clean shot at the API slot.
let _chatPriorityUntil = 0;

export function notifyRateLimit(retryAfterMs?: number): void {
  const now = Date.now();

  // During a chat priority window the CB was just cleared for user-facing
  // chat replies.  Suppress circuit-breaker re-arming so that a stale
  // in-flight background 429 doesn't immediately undo the reset.
  if (_chatPriorityUntil > now) {
    console.log("[ai-semaphore] notifyRateLimit suppressed — chat priority window active");
    return;
  }

  // Count as "consecutive" if the previous 429 was less than 10 minutes ago.
  if (now - _lastRateLimitAt < 10 * 60_000) {
    _consecutive429s = Math.min(_consecutive429s + 1, 8);
  } else {
    _consecutive429s = 1;
  }
  _lastRateLimitAt = now;

  let cooldown: number;
  if (retryAfterMs && retryAfterMs > 0) {
    // Honour the server's hint but cap at 10 minutes.
    cooldown = Math.min(retryAfterMs + 5_000, 10 * 60_000);
  } else {
    // Exponential back-off: 5min → 10min → 10min (capped).
    cooldown = Math.min(DEFAULT_RATE_LIMIT_COOLDOWN_MS * Math.pow(2, _consecutive429s - 1), 10 * 60_000);
  }

  // Add per-caller jitter (0–30 s) so all waiting goroutines don't re-fire
  // at exactly the same millisecond when the circuit breaker opens.
  const jitter = Math.random() * 30_000;
  const until = now + cooldown + jitter;
  if (until > _rateLimitedUntil) {
    _rateLimitedUntil = until;
  }
}

export function resetRateLimitConsecutiveCount(): void {
  _consecutive429s = 0;
}

/** Dev-only: forcefully clear the circuit breaker so tests can run immediately. */
export function resetCircuitBreaker(): void {
  _rateLimitedUntil = 0;
  _consecutive429s = 0;
  _lastRateLimitAt = 0;
}

/**
 * Hard reset: clears the circuit breaker AND immediately rejects every caller
 * currently waiting in the queue.  Also activates a chat-priority window for
 * CHAT_PRIORITY_WINDOW_MS so background callers defer to user-facing chat replies.
 * Use in dev/testing to drain a bloated queue without waiting through the full backlog.
 */
const CHAT_PRIORITY_WINDOW_MS = 120_000;

export function hardResetCircuitBreaker(): void {
  _rateLimitedUntil = 0;
  _consecutive429s = 0;
  _lastRateLimitAt = 0;
  _busy = false;
  _preAcquiredToken = false;
  // Activate priority window so background callers can't steal the slot
  _chatPriorityUntil = Date.now() + CHAT_PRIORITY_WINDOW_MS;
  const drained = _releaseListeners.splice(0);
  for (const { reject } of drained) {
    try { reject(new Error("AI semaphore hard reset")); } catch { /* ignore */ }
  }
  console.log(`[ai-semaphore] Hard reset — drained ${drained.length} queued callers, chat priority for ${CHAT_PRIORITY_WINDOW_MS / 1000}s`);
}

async function _pause(ms: number): Promise<void> {
  if (ms > 0) await new Promise(r => setTimeout(r, ms));
}

async function _waitForStartupGrace(): Promise<void> {
  const rem = STARTUP_HOLD_MS - (Date.now() - _bootTime);
  if (rem > 0) await _pause(rem + Math.random() * 5_000);
}

async function _waitForCircuitBreaker(): Promise<void> {
  const rem = _rateLimitedUntil - Date.now();
  if (rem > 0) await _pause(rem + Math.random() * 3_000);
}

async function _waitForRelease(): Promise<void> {
  if (_releaseListeners.length >= MAX_QUEUE_DEPTH) {
    throw new Error(`AI queue full (${MAX_QUEUE_DEPTH} callers waiting) — request dropped`);
  }
  await new Promise<void>((resolve, reject) => {
    _releaseListeners.push({ resolve, reject });
  });
}

function _inChatPriorityWindow(): boolean {
  return _chatPriorityUntil > Date.now();
}

export async function acquireAISlot(): Promise<void> {
  // If a priority caller already grabbed the slot via tryAcquireAISlotNow(),
  // consume the token and proceed immediately — no need to wait.
  if (consumePreAcquireToken()) return;

  // During a chat priority window background callers fail-fast so that
  // user-facing chat replies get first access after a reset.
  if (_inChatPriorityWindow()) {
    throw new Error("AI slot deferred: chat priority window active");
  }

  await _waitForStartupGrace();

  // Spin until we get the slot, re-checking the circuit breaker after each wake.
  while (true) {
    await _waitForCircuitBreaker();

    if (!_busy) {
      _busy = true;
      // Enforce inter-call gap
      const gap = MIN_INTER_CALL_DELAY_MS - (Date.now() - _lastReleaseAt);
      if (gap > 0) await _pause(gap);
      return; // slot acquired
    }

    // Slot is busy — wait for a release signal, then loop to re-check.
    // This throws if a hard-reset drains the queue.
    await _waitForRelease();
  }
}

export function releaseAISlot(): void {
  _lastReleaseAt = Date.now();
  _busy = false;
  _preAcquiredToken = false; // clear any stale pre-acquire so it can't be misused
  // Wake ONE waiting caller (it will re-check circuit-breaker before proceeding)
  const wake = _releaseListeners.shift();
  if (wake) {
    setTimeout(wake.resolve, MIN_INTER_CALL_DELAY_MS);
  }
}

export function getAISemaphoreStats(): {
  active: number;
  queued: number;
  rateLimitedUntil: number;
  startupGraceRemainingMs: number;
  chatPriorityWindowRemainingMs: number;
  ready: boolean;
} {
  const now = Date.now();
  return {
    active: _busy ? 1 : 0,
    queued: _releaseListeners.length,
    rateLimitedUntil: _rateLimitedUntil,
    startupGraceRemainingMs: Math.max(0, STARTUP_HOLD_MS - (now - _bootTime)),
    chatPriorityWindowRemainingMs: Math.max(0, _chatPriorityUntil - now),
    ready:
      _rateLimitedUntil <= now &&
      !_busy &&
      STARTUP_HOLD_MS - (now - _bootTime) <= 0,
  };
}

/**
 * Returns true if the AI slot is immediately available and the circuit breaker
 * is not open. Use this for non-critical, optional AI calls (e.g. live-chat
 * auto-replies) that should be skipped rather than queued when the system is busy.
 *
 * NOTE: This is a CHECK only — it does NOT reserve the slot.  Use
 * tryAcquireAISlotNow() when you need an atomic check-and-hold.
 */
export function isAIAvailableNow(): boolean {
  const now = Date.now();
  if (_rateLimitedUntil > now) return false;
  if (_busy) return false;
  if (STARTUP_HOLD_MS - (now - _bootTime) > 0) return false;
  if (MIN_INTER_CALL_DELAY_MS - (now - _lastReleaseAt) > 0) return false;
  return true;
}

/**
 * Atomically checks availability AND acquires the slot in a single synchronous
 * operation — no async gap for a competing caller to steal it.
 *
 * Returns true if the slot was acquired (caller MUST call releaseAISlot()).
 * Returns false if the slot is unavailable (nothing to release).
 *
 * Use this instead of isAIAvailableNow() when you want to guarantee that the
 * slot stays reserved until you're done, e.g. live-chat auto-replies.
 */
let _preAcquiredToken = false;
export function tryAcquireAISlotNow(): boolean {
  const now = Date.now();
  // Intentionally skips the MIN_INTER_CALL_DELAY_MS gap — that throttle is for
  // background queue callers, not synchronous user-facing chat replies.
  if (_rateLimitedUntil > now) return false;
  if (_busy) return false;
  if (STARTUP_HOLD_MS - (now - _bootTime) > 0) return false;
  _busy = true;
  _preAcquiredToken = true;
  return true;
}

/**
 * Called by acquireAISlot() internals when a pre-acquire token exists.
 * Exposed for the openai/claude wrappers to consume the token without double-acquiring.
 * @internal
 */
export function consumePreAcquireToken(): boolean {
  if (_preAcquiredToken) {
    _preAcquiredToken = false;
    return true;
  }
  return false;
}

/**
 * Safety cleanup: if tryAcquireAISlotNow() was called but the subsequent AI
 * call threw synchronously before acquireAISlot() could consume the token,
 * call this to release the slot and clear the token.
 */
export function cleanupPreAcquiredToken(): void {
  if (_preAcquiredToken) {
    _preAcquiredToken = false;
    // Release the slot via the normal path so any queued waiters are notified.
    releaseAISlot();
  }
}
