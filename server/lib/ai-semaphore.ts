// Shared AI concurrency semaphore with integrated circuit-breaker.
//
// Design:
// 1. Only 1 AI request in-flight at a time (prevents concurrent burst).
// 2. 3-second mandatory gap between consecutive calls (≤ 20/min max).
// 3. Circuit-breaker: any 429 from the proxy sets a global "back-off until"
//    timestamp; ALL callers re-check this after every wake-up, so a late 429
//    seen by one caller immediately pauses all callers waiting in queue.
// 4. 40-second startup grace so the engine-boot wave can't burst the proxy.

export const MIN_INTER_CALL_DELAY_MS = 3_000;
const STARTUP_HOLD_MS = 40_000;
const _bootTime = Date.now();

let _busy = false;
let _lastReleaseAt = 0;
const _releaseListeners: Array<() => void> = [];

// Circuit-breaker state
let _rateLimitedUntil = 0;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 65_000;

export function notifyRateLimit(retryAfterMs?: number): void {
  const cooldown = retryAfterMs && retryAfterMs > 0
    ? Math.min(retryAfterMs + 5_000, 120_000)
    : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  const until = Date.now() + cooldown;
  if (until > _rateLimitedUntil) {
    _rateLimitedUntil = until;
  }
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
  await new Promise<void>(resolve => _releaseListeners.push(resolve));
}

export async function acquireAISlot(): Promise<void> {
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

    // Slot is busy — wait for a release signal, then loop to re-check
    await _waitForRelease();
  }
}

export function releaseAISlot(): void {
  _lastReleaseAt = Date.now();
  _busy = false;
  // Wake ONE waiting caller (it will re-check circuit-breaker before proceeding)
  const listener = _releaseListeners.shift();
  if (listener) {
    setTimeout(listener, MIN_INTER_CALL_DELAY_MS);
  }
}

export function getAISemaphoreStats(): { active: number; queued: number; rateLimitedUntil: number } {
  return {
    active: _busy ? 1 : 0,
    queued: _releaseListeners.length,
    rateLimitedUntil: _rateLimitedUntil,
  };
}
