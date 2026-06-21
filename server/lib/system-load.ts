/**
 * System Load Signal Hub
 * ─────────────────────────────────────────────────────────────────────────────
 * The nervous system of CreatorOS — a central signal bus that every background
 * service can read before doing heavy work.
 *
 * Instead of each service independently hammering the AI queue or quota budget
 * until something crashes, they ask the body first: "Is it safe to run?"
 *
 * Signals tracked (updated every 30 s):
 *   • aiSlotsPct  — background AI slot saturation (0–100)
 *   • quotaTripped — whether the YouTube quota circuit-breaker is active
 *   • heapMB      — Node.js heap in use
 *   • phase       — boot phase (see SystemPhase below)
 *
 * Boot phases (like a body waking up):
 *   startup   → brainstem only; DB, auth, HTTP — no heavy work allowed
 *   warming   → skeleton + nervous system up; watchers running — no heavy AI
 *   steady    → all vital organs running — full operation allowed
 *   stressed  → AI queue near-full OR quota near-limit OR heap high — defer
 *   recovering → coming down from stressed — light work only
 *
 * Usage:
 *   import { canRunHeavyWork, getSystemPhase, signalBootComplete } from "../lib/system-load";
 *   if (!canRunHeavyWork()) { logger.info("System stressed — deferring cycle"); return; }
 */

import { createLogger } from "./logger";

const logger = createLogger("system-load");

export type SystemPhase = "startup" | "warming" | "steady" | "stressed" | "recovering";

interface SystemLoadSnapshot {
  aiSlotsPct:   number;
  quotaTripped: boolean;
  heapMB:       number;
  phase:        SystemPhase;
  updatedAt:    number;
}

let _snapshot: SystemLoadSnapshot = {
  aiSlotsPct:   0,
  quotaTripped: false,
  heapMB:       0,
  phase:        "startup",
  updatedAt:    Date.now(),
};

let _bootCompleteAt: number | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function getSystemLoad(): Readonly<SystemLoadSnapshot> {
  return _snapshot;
}

export function getSystemPhase(): SystemPhase {
  return _snapshot.phase;
}

/**
 * Returns true when the system is healthy enough for heavy background work
 * (catalog scans, AI scoring cycles, metadata sweeps).
 *
 * Returns false during: startup, warming (first 10 min), stressed, recovering.
 * Services that get false should log and skip their current cycle — their
 * natural timer will retry on the next interval.
 */
export function canRunHeavyWork(): boolean {
  const { phase, quotaTripped, aiSlotsPct, heapMB } = _snapshot;
  if (phase === "startup" || phase === "warming") return false;
  if (phase === "stressed" || phase === "recovering") return false;
  if (quotaTripped) return false;
  if (aiSlotsPct >= 87) return false;
  if (heapMB > 900) return false;
  return true;
}

/**
 * Returns true when it is safe to make AI calls (less strict than
 * canRunHeavyWork — allows "warming" phase since some services start early).
 */
export function canRunAIWork(): boolean {
  const { phase, aiSlotsPct, heapMB } = _snapshot;
  if (phase === "startup") return false;
  return aiSlotsPct < 75 && heapMB < 800;
}

/**
 * Called by Wave 3 (watchers + live detection up) to signal that the
 * "body is alive" — skeleton and nervous system are running.
 * Transitions phase from "startup" → "warming".
 * Phase transitions to "steady" automatically 10 minutes later.
 */
export function signalBootComplete(): void {
  if (_bootCompleteAt) return;
  _bootCompleteAt = Date.now();
  _refreshSnapshot();
  logger.info("[SystemLoad] Boot complete — entering warming phase (steady in ~10 min)");

  setTimeout(() => {
    _refreshSnapshot();
    logger.info(`[SystemLoad] Warming complete — phase is now: ${_snapshot.phase}`);
  }, 10 * 60_000);
}

/**
 * Allow services to push a real-time signal without waiting for the 30-s poll.
 * Currently used by: quota-tracker (on trip/clear) and ai-semaphore (on acquire/release).
 */
export function pushLoadSignal(partial: Partial<Pick<SystemLoadSnapshot, "aiSlotsPct" | "quotaTripped">>): void {
  Object.assign(_snapshot, partial);
  _snapshot.updatedAt = Date.now();
  _recomputePhase();
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _recomputePhase(): void {
  if (!_bootCompleteAt) {
    _snapshot.phase = "startup";
    return;
  }
  const { quotaTripped, aiSlotsPct, heapMB } = _snapshot;
  const uptimeSec = (Date.now() - _bootCompleteAt) / 1000;

  if (uptimeSec < 10 * 60) {
    _snapshot.phase = "warming";
    return;
  }
  if (heapMB > 850 || aiSlotsPct >= 87) {
    _snapshot.phase = "stressed";
    return;
  }
  if (heapMB > 650 || aiSlotsPct >= 62 || quotaTripped) {
    _snapshot.phase = "recovering";
    return;
  }
  _snapshot.phase = "steady";
}

function _refreshSnapshot(): void {
  const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  let aiSlotsPct = 0;
  let quotaTripped = false;

  try {
    const { getAISemaphoreStats } = require("./ai-semaphore");
    const stats = getAISemaphoreStats();
    const MAX_BACKGROUND_SLOTS = 4;
    const inFlight = stats.active + stats.backgroundQueued;
    aiSlotsPct = Math.round((inFlight / MAX_BACKGROUND_SLOTS) * 100);
  } catch {
  }

  try {
    const { isQuotaBreakerTripped } = require("../services/youtube-quota-tracker");
    quotaTripped = isQuotaBreakerTripped();
  } catch {
  }

  _snapshot = {
    aiSlotsPct,
    quotaTripped,
    heapMB,
    phase:     _snapshot.phase,
    updatedAt: Date.now(),
  };
  _recomputePhase();
}

setInterval(_refreshSnapshot, 30_000).unref();
