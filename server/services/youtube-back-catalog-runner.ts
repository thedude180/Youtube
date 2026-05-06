/**
 * youtube-back-catalog-runner.ts
 *
 * Dedicated autonomous runner for the Back Catalog Monetization Engine.
 * Runs automatically on production startup — no dashboard interaction required.
 *
 * Behavior:
 *  - Waits 10–20 minutes after boot (jittered) before first run
 *  - Repeats once every 22–24 hours (jittered to avoid thundering herd)
 *  - Finds all real users with connected YouTube channels
 *  - Skips dev_bypass_user
 *  - Skips if quota breaker is tripped
 *  - Skips if NODE_ENV === "test"
 *  - Only runs in development when ENABLE_BACK_CATALOG_RUNNER=true
 *  - Per-user error isolation — one bad user never stops the whole run
 *  - All existing daily caps (3 Shorts, 1 long-form, 10 metadata refreshes)
 *    are enforced inside runBackCatalogMonetizationCycle — this runner
 *    does not duplicate that logic
 */

import { db } from "../db";
import { channels } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { runBackCatalogMonetizationCycle } from "./youtube-back-catalog-engine";

const logger = createLogger("back-catalog-runner");

const DEV_BYPASS_USER = "dev_bypass_user";

// ── Timing constants ─────────────────────────────────────────────────────────

/** Jitter helper — returns [base, base + jitterMs) */
function jitter(baseMs: number, jitterMs = baseMs * 0.1): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}

const STARTUP_DELAY_MS = jitter(10 * 60_000, 10 * 60_000); // 10–20 min
const REPEAT_INTERVAL_MS = jitter(22 * 60 * 60_000, 2 * 60 * 60_000); // 22–24 h

// ── State ────────────────────────────────────────────────────────────────────

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let repeatInterval: ReturnType<typeof setInterval> | null = null;
let running = false;
let paused = false;
let lastRunAt: Date | null = null;
let lastRunResult: { usersRun: number; errors: number } | null = null;

// ── Eligible user resolution ─────────────────────────────────────────────────

async function getEligibleUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: channels.userId })
    .from(channels)
    .where(
      and(
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ),
    );

  const unique = [...new Set(
    rows
      .map(r => r.userId)
      .filter((id): id is string => !!id && id !== DEV_BYPASS_USER),
  )];

  return unique;
}

// ── Core cycle ───────────────────────────────────────────────────────────────

export async function runBackCatalogForAllEligibleUsers(): Promise<{ usersRun: number; errors: number }> {
  if (paused) {
    logger.info("[BackCatalogRunner] Skipped — runner is paused");
    return { usersRun: 0, errors: 0 };
  }

  if (isQuotaBreakerTripped()) {
    logger.warn("[BackCatalogRunner] Skipped — YouTube quota breaker is active");
    return { usersRun: 0, errors: 0 };
  }

  const userIds = await getEligibleUserIds();

  if (userIds.length === 0) {
    logger.info("[BackCatalogRunner] No eligible users found (no connected YouTube channels)");
    return { usersRun: 0, errors: 0 };
  }

  logger.info(`[BackCatalogRunner] Starting back catalog cycle — ${userIds.length} eligible user(s)`);

  let usersRun = 0;
  let errors = 0;

  for (const userId of userIds) {
    if (isQuotaBreakerTripped()) {
      logger.warn("[BackCatalogRunner] Quota breaker tripped mid-run — stopping remaining users");
      break;
    }
    try {
      logger.info(`[BackCatalogRunner] Running cycle for user ${userId.slice(0, 8)}…`);
      const result = await runBackCatalogMonetizationCycle(userId);
      logger.info(`[BackCatalogRunner] Cycle complete for ${userId.slice(0, 8)}`, {
        phase: result.phase,
        imported: result.importResult.imported,
        shortsQueued: result.queueResult.shortsQueued,
        longFormQueued: result.queueResult.longFormQueued,
        metadataQueued: result.queueResult.metadataQueued,
        rankedCount: result.rankedCount,
        skippedReason: result.skippedReason ?? null,
      });
      usersRun++;
    } catch (err: any) {
      errors++;
      logger.error(`[BackCatalogRunner] Cycle failed for user ${userId.slice(0, 8)}: ${err?.message?.slice(0, 200)}`);
    }
  }

  lastRunAt = new Date();
  lastRunResult = { usersRun, errors };

  logger.info(`[BackCatalogRunner] All users complete — ran: ${usersRun}, errors: ${errors}`);
  return { usersRun, errors };
}

// ── Init / Stop ───────────────────────────────────────────────────────────────

export function initBackCatalogRunner(): void {
  if (process.env.NODE_ENV === "test") {
    logger.info("[BackCatalogRunner] Skipped — NODE_ENV=test");
    return;
  }

  const isProd = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
  const devEnabled = process.env.ENABLE_BACK_CATALOG_RUNNER === "true";

  if (!isProd && !devEnabled) {
    logger.info("[BackCatalogRunner] Skipped — development mode (set ENABLE_BACK_CATALOG_RUNNER=true to enable locally)");
    return;
  }

  logger.info(`[BackCatalogRunner] Scheduled — first run in ${Math.round(STARTUP_DELAY_MS / 60_000)} min, then every ${Math.round(REPEAT_INTERVAL_MS / 3_600_000)} h`);

  startupTimer = setTimeout(async () => {
    logger.info("[BackCatalogRunner] Startup delay complete — running first back catalog cycle");

    if (running) {
      logger.warn("[BackCatalogRunner] Already running — skipping startup fire");
    } else {
      running = true;
      try {
        await runBackCatalogForAllEligibleUsers();
      } finally {
        running = false;
      }
    }

    repeatInterval = setInterval(async () => {
      if (running) {
        logger.warn("[BackCatalogRunner] Previous cycle still running — skipping this interval");
        return;
      }
      running = true;
      logger.info("[BackCatalogRunner] Daily repeat — starting back catalog cycle");
      try {
        await runBackCatalogForAllEligibleUsers();
      } finally {
        running = false;
      }
    }, REPEAT_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopBackCatalogRunner(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (repeatInterval) {
    clearInterval(repeatInterval);
    repeatInterval = null;
  }
  logger.info("[BackCatalogRunner] Stopped");
}

export function getBackCatalogRunnerStatus() {
  return {
    running,
    paused,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastRunResult,
    startupDelayMs: STARTUP_DELAY_MS,
    repeatIntervalMs: REPEAT_INTERVAL_MS,
    nextRunEta: lastRunAt
      ? new Date(lastRunAt.getTime() + REPEAT_INTERVAL_MS).toISOString()
      : null,
  };
}

export function pauseBackCatalogRunner(): void {
  paused = true;
  logger.info("[BackCatalogRunner] Paused");
}

export function resumeBackCatalogRunner(): void {
  paused = false;
  logger.info("[BackCatalogRunner] Resumed");
}
