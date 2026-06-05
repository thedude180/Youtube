/**
 * server/lib/ai-scheduler.ts
 *
 * Phase 4 — Central AI Scheduler
 *
 * Wraps ai-semaphore + token-hourly-cap into one unified entry point.
 * Every background AI call goes through AIScheduler.enqueue().
 * Foreground (user-triggered) calls bypass the background cap but still
 * respect hourly + daily budgets.
 *
 * Priority lanes (lower number = higher priority):
 *   1  — user chat reply (live, blocking)
 *   2  — publish pre-flight (blocking pipeline)
 *   3  — shorts-pipeline (time-sensitive)
 *   4  — longform-pipeline (time-sensitive)
 *   5+ — background engines (non-urgent)
 */

import { createLogger } from "./logger";
import {
  acquireAISlot,
  acquireAISlotBackground,
  releaseAISlot,
  getAISemaphoreStats,
  type AiTier,
  TIER_LIMITS,
  getAiSemaphore,
} from "./ai-semaphore";
import {
  checkTokenBudgets,
  recordHourlyTokenUsage,
  getHourlyCapStatus,
} from "./token-hourly-cap";
import { getContainerMemory } from "./container-memory";

const log = createLogger("ai-scheduler");

// Background tier is capped at 4 concurrent (not 8) to leave headroom for
// foreground callers. Priority ≥ 5 = background.
const BACKGROUND_CONCURRENCY_CAP = 4;
let _backgroundActive = 0;

export interface AITask {
  taskType: string;
  userId: string;
  priority: number;  // 1 = highest, 10 = lowest
  module: string;
  estimatedTokens?: number;
  tier?: AiTier;
  fn: () => Promise<unknown>;
}

export interface EnqueueResult {
  queued: boolean;
  reason?: string;
  retryAfterMs?: number;
}

export interface SchedulerStatus {
  semaphore: ReturnType<typeof getAISemaphoreStats>;
  hourly: ReturnType<typeof getHourlyCapStatus>;
  backgroundActive: number;
  backgroundCap: number;
  containerFreePct: number;
}

// ── Memory pressure gate ─────────────────────────────────────────────────────
// Block background AI calls when container is critically full (≥90%)
const MEMORY_BLOCK_RATIO = 0.90;

function isMemoryOk(background: boolean): boolean {
  if (!background) return true; // foreground always allowed
  const mem = getContainerMemory();
  return mem.usedRatio < MEMORY_BLOCK_RATIO;
}

// ── Main scheduler ────────────────────────────────────────────────────────────

export const AIScheduler = {
  /**
   * Enqueue an AI task. Checks all gates before accepting.
   * Returns { queued: false, reason } if any gate blocks the task.
   * On success, runs fn() and returns { queued: true }.
   */
  async enqueue(task: AITask): Promise<EnqueueResult> {
    const isBackground = task.priority >= 5;
    const estimatedTokens = task.estimatedTokens ?? 1000;

    // Gate 1: hourly + daily token budget
    const budgetCheck = checkTokenBudgets(task.module, estimatedTokens);
    if (!budgetCheck.allowed) {
      return {
        queued: false,
        reason: budgetCheck.reason ?? `token cap reached for module ${task.module} (${budgetCheck.usedThisHour}/${budgetCheck.hourlyLimit} this hour)`,
        retryAfterMs: 60 * 60_000,
      };
    }

    // Gate 2: background concurrency cap
    if (isBackground && _backgroundActive >= BACKGROUND_CONCURRENCY_CAP) {
      return {
        queued: false,
        reason: `background AI concurrency cap reached (${_backgroundActive}/${BACKGROUND_CONCURRENCY_CAP})`,
        retryAfterMs: 5 * 60_000,
      };
    }

    // Gate 3: memory pressure
    if (!isMemoryOk(isBackground)) {
      const mem = getContainerMemory();
      return {
        queued: false,
        reason: `memory pressure — container ${Math.round(mem.usedRatio * 100)}% full`,
        retryAfterMs: 10 * 60_000,
      };
    }

    // Gate 4: semaphore slot acquisition
    try {
      if (isBackground) {
        _backgroundActive++;
        try {
          await acquireAISlotBackground();
        } catch (err: any) {
          _backgroundActive--;
          return {
            queued: false,
            reason: err?.message ?? "AI semaphore queue full",
            retryAfterMs: 5 * 60_000,
          };
        }
      } else {
        try {
          await acquireAISlot();
        } catch (err: any) {
          return {
            queued: false,
            reason: err?.message ?? "AI semaphore unavailable",
            retryAfterMs: 60_000,
          };
        }
      }

      // Run the task
      try {
        await task.fn();
        recordHourlyTokenUsage(task.module, estimatedTokens);
        return { queued: true };
      } catch (err: any) {
        // Don't record tokens on failure
        log.warn(`[AIScheduler] Task ${task.taskType} failed: ${err?.message}`);
        throw err;
      } finally {
        releaseAISlot();
        if (isBackground) _backgroundActive--;
      }
    } catch (err: any) {
      // Re-throw non-gate errors so callers can handle them
      throw err;
    }
  },

  /**
   * Tier-pool variant: runs fn() through the named tier's concurrency pool.
   * Gates: hourly budget + memory pressure only (pool handles concurrency).
   */
  async enqueueInTier<T>(
    tier: AiTier,
    module: string,
    estimatedTokens: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const isBackground = tier === "background";

    const budgetCheck = checkTokenBudgets(module, estimatedTokens);
    if (!budgetCheck.allowed) {
      throw new Error(
        `[AIScheduler] ${budgetCheck.reason ?? `token cap reached for ${module} (${budgetCheck.usedThisHour}/${budgetCheck.hourlyLimit} this hour)`}`,
      );
    }

    if (!isMemoryOk(isBackground)) {
      throw new Error(`[AIScheduler] memory pressure — background AI blocked`);
    }

    const pool = getAiSemaphore(tier);
    return pool(async () => {
      try {
        const result = await fn();
        recordHourlyTokenUsage(module, estimatedTokens);
        return result;
      } catch (err) {
        throw err;
      }
    });
  },

  /**
   * Current scheduler status for the dashboard.
   */
  getStatus(): SchedulerStatus {
    const mem = getContainerMemory();
    return {
      semaphore: getAISemaphoreStats(),
      hourly: getHourlyCapStatus(),
      backgroundActive: _backgroundActive,
      backgroundCap: BACKGROUND_CONCURRENCY_CAP,
      containerFreePct: Math.round((1 - mem.usedRatio) * 100),
    };
  },

  /**
   * Shorthand: check if a background AI task is allowed right now.
   */
  canRunBackground(module: string, estimatedTokens = 1000): boolean {
    if (_backgroundActive >= BACKGROUND_CONCURRENCY_CAP) return false;
    if (!isMemoryOk(true)) return false;
    return checkTokenBudgets(module, estimatedTokens).allowed;
  },
};

export default AIScheduler;
