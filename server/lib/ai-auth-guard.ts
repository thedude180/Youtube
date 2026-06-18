/**
 * server/lib/ai-auth-guard.ts
 *
 * Global AI 401 circuit breaker.
 *
 * When any AI call returns a 401 (Replit AI integration key expired / quota
 * exceeded / key rotation), every subsequent call should fail-fast instead of
 * burning 15–20 s waiting for the TCP timeout.  Without this, the backlog-engine
 * iterates 78,000+ videos at ~20 s/video → weeks of useless spinning that holds
 * AI slots, blocks the pre-encoder, and saturates the event loop.
 *
 * Usage:
 *   import { checkAI401Circuit, tripAI401Circuit } from "./ai-auth-guard";
 *
 *   function myAICall() {
 *     checkAI401Circuit();                 // throws immediately if open
 *     try {
 *       const res = await openai.chat...create({...});
 *     } catch (err: any) {
 *       if (err.status === 401 || err.message?.includes('401')) {
 *         tripAI401Circuit('myAICall');
 *       }
 *       throw err;
 *     }
 *   }
 */

import { createLogger } from "./logger";

const log = createLogger("ai-auth-guard");

const BACKOFF_MS = 60 * 60 * 1000; // 1 hour

let _circuitOpenUntil = 0; // epoch-ms; 0 = circuit closed
let _tripCount = 0;        // running count of trips this session

export function checkAI401Circuit(): void {
  if (_circuitOpenUntil > 0 && Date.now() < _circuitOpenUntil) {
    const minsLeft = Math.ceil((_circuitOpenUntil - Date.now()) / 60_000);
    throw new Error(
      `AI_401_CIRCUIT_OPEN: Replit AI integration returning 401 — ` +
      `all AI calls suppressed for ${minsLeft} more minute(s). ` +
      `Circuit will auto-reset at ${new Date(_circuitOpenUntil).toISOString()}.`
    );
  }
  // Cache expired — reset
  if (_circuitOpenUntil > 0 && Date.now() >= _circuitOpenUntil) {
    log.info(`[AI-AuthGuard] Circuit auto-reset after backoff — AI calls re-enabled`);
    _circuitOpenUntil = 0;
  }
}

export function tripAI401Circuit(callerContext: string): void {
  if (_circuitOpenUntil > 0 && Date.now() < _circuitOpenUntil) return; // already open
  _circuitOpenUntil = Date.now() + BACKOFF_MS;
  _tripCount++;
  log.error(
    `[AI-AuthGuard] 🔴 AI 401 circuit TRIPPED by [${callerContext}] ` +
    `(trip #${_tripCount} this session) — suppressing all AI calls for 60 min. ` +
    `Resumes at ${new Date(_circuitOpenUntil).toISOString()}.`
  );
}

export function isAI401CircuitOpen(): boolean {
  if (_circuitOpenUntil <= 0) return false;
  if (Date.now() >= _circuitOpenUntil) {
    _circuitOpenUntil = 0;
    return false;
  }
  return true;
}

export function getAI401CircuitStatus(): { open: boolean; resetsAt: Date | null; tripCount: number } {
  const open = isAI401CircuitOpen();
  return {
    open,
    resetsAt: open ? new Date(_circuitOpenUntil) : null,
    tripCount: _tripCount,
  };
}
