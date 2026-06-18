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
import { channels, autopilotQueue } from "@shared/schema";
import { eq, and, isNotNull, count, gte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped, getNextResetTime } from "./youtube-quota-tracker";
import { runBackCatalogMonetizationCycle } from "./youtube-back-catalog-engine";
import { runClipSeoSync } from "./youtube-clip-seo-sync";
import { getContainerMemory } from "../lib/container-memory";
import { CommandCenter } from "../lib/command-center";

const logger = createLogger("back-catalog-runner");

const DEV_BYPASS_USER = "dev_bypass_user";

// ── Timing constants ─────────────────────────────────────────────────────────

/** Jitter helper — returns [base, base + jitterMs) */
function jitter(baseMs: number, jitterMs = baseMs * 0.1): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}

// Delay first run so perpetual-repair (T+5 min) can cancel any already-queued
// permanently-failed items before the runner generates new ones.  A 10-second
// delay caused the Jrt9VPmojMA OOM crash loop — runner fired before any guard
// was active, created 29 bad items, and yt-dlp exhausted container RAM.
const STARTUP_DELAY_MS = jitter(10 * 60_000, 5 * 60_000); // 10–15 min

// ── Adaptive interval constants ───────────────────────────────────────────────
// Interval adapts based on queue depth after every completed cycle.
// This ensures the queue refills fast when depleted and eases back when healthy.
const INTERVAL_URGENT_MS   = jitter( 1 * 60 * 60_000, 10 * 60_000); // ~1h  — queue < 7 items
const INTERVAL_LOW_MS      = jitter( 3 * 60 * 60_000, 30 * 60_000); // ~3h  — queue 7-20 items
const INTERVAL_MODERATE_MS = jitter( 8 * 60 * 60_000, 60 * 60_000); // ~8h  — queue 20-42 items
const INTERVAL_HEALTHY_MS  = jitter(22 * 60 * 60_000,  2 * 60 * 60_000); // ~22-24h — queue ≥ 42

// ── State ────────────────────────────────────────────────────────────────────

let startupTimer:   ReturnType<typeof setTimeout>  | null = null;
let repeatTimer:    ReturnType<typeof setTimeout>  | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let paused = false;
let lastRunAt:      Date | null = null;
let nextRunAt:      Date | null = null;
let lastRunResult:  { usersRun: number; errors: number; queueDepth?: number } | null = null;
let lastIntervalMs: number = INTERVAL_HEALTHY_MS;

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

// ── Queue-depth probe ─────────────────────────────────────────────────────────
// Reads the pending/scheduled YouTube queue without touching the YouTube API.
// Used to decide how aggressively to re-run the back-catalog cycle.

async function getGlobalQueueDepth(): Promise<number> {
  try {
    const now     = new Date();
    const plus60d = new Date(now.getTime() + 60 * 24 * 60 * 60_000);
    const r = await db.select({ n: count() })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.targetPlatform, "youtube"),
        inArray(autopilotQueue.status, ["scheduled", "pending"]),
        gte(autopilotQueue.scheduledAt, now),
        // Shadow YouTube: plan 60 days ahead so staging library stays deep
      ));
    return Number(r[0]?.n ?? 0);
  } catch {
    return 99; // assume healthy on error to avoid spurious extra runs
  }
}

/** Choose the next cycle delay based on how full the queue is. */
function adaptiveIntervalMs(queueDepth: number): number {
  if (queueDepth <   7) return INTERVAL_URGENT_MS;    // ~1h  — nearly empty
  if (queueDepth <  20) return INTERVAL_LOW_MS;        // ~3h  — thin
  if (queueDepth < 180) return INTERVAL_MODERATE_MS;   // ~8h  — building Shadow YouTube library
  return INTERVAL_HEALTHY_MS;                          // ~22-24h — 60-day library staged
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

  // Container memory gate — skip this cycle if the container is already under
  // pressure.  The back-catalog runner fires at T+10-15 min and coincides with
  // the publisher sweep (T+15 min) and content grinder (T+20 min).  Running a
  // heavy AI-scoring cycle when free memory is already low has caused OOM
  // container kills (silent — no logs).  This gate breaks that crash loop.
  const mem = getContainerMemory();
  const freeMB = Math.round(mem.freeBytes / 1024 / 1024);
  if (mem.freeBytes < 300 * 1024 * 1024) {
    logger.warn(`[BackCatalogRunner] Deferred — only ${freeMB}MB container memory free (need 300MB). Will retry on next scheduled run.`);
    return { usersRun: 0, errors: 0 };
  }

  const userIds = await getEligibleUserIds();

  if (userIds.length === 0) {
    logger.info("[BackCatalogRunner] No eligible users found (no connected YouTube channels)");
    return { usersRun: 0, errors: 0 };
  }

  // Record actual first execution (not just when setTimeout fired)
  import("../lib/boot-registry").then(({ recordBootStart }) => recordBootStart("back-catalog-runner")).catch(() => {});

  logger.info(`[BackCatalogRunner] Starting back catalog cycle — ${userIds.length} eligible user(s)`);

  let usersRun = 0;
  let errors = 0;

  for (const userId of userIds) {
    if (isQuotaBreakerTripped()) {
      logger.warn("[BackCatalogRunner] Quota breaker tripped mid-run — stopping remaining users");
      break;
    }

    const gate = await CommandCenter.canRun({
      module: "back-catalog-runner",
      userId,
      platform: "youtube",
      jobType: "backlog",
      requiresYouTubeApi: true,
    });
    if (!gate.allowed) {
      logger.debug(`[BackCatalogRunner] Skipping user ${userId.slice(0, 8)}: ${gate.reason}`);
      continue;
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

      // Audit + fix SEO and thumbnails on all published derivative clips
      try {
        const seoResult = await runClipSeoSync(userId);
        if (seoResult.seoUpdated > 0 || seoResult.thumbUpdated > 0) {
          logger.info(`[BackCatalogRunner] Clip SEO sync for ${userId.slice(0, 8)}: scanned ${seoResult.scanned}, SEO ${seoResult.seoUpdated}, thumbs ${seoResult.thumbUpdated}`);
        } else {
          logger.debug(`[BackCatalogRunner] Clip SEO sync: nothing to update for ${userId.slice(0, 8)}`);
        }
      } catch (seoErr: any) {
        logger.warn(`[BackCatalogRunner] Clip SEO sync failed for ${userId.slice(0, 8)}: ${seoErr?.message?.slice(0, 150)}`);
      }

      // Note: We intentionally do NOT fire a direct runGrindCycle() here.
      // The adaptive grinder scheduler runs every 20-60 min and will pick up
      // newly queued content on its next tick.  A direct fire-and-forget call
      // bypasses the grinderRunning guard and can cause two concurrent grind
      // cycles when the scheduler also fires within the same minute window
      // (T+10-20 min convergence), doubling AI call load and contributing
      // to container OOM crashes.
      const newContent = result.queueResult.shortsQueued + result.queueResult.longFormQueued;
      if (newContent > 0) {
        logger.info(`[BackCatalogRunner] ${newContent} new clips queued for ${userId.slice(0, 8)} — adaptive grinder will pick up on next tick`);
      }

      usersRun++;
    } catch (err: any) {
      errors++;
      logger.error(`[BackCatalogRunner] Cycle failed for user ${userId.slice(0, 8)}: ${err?.message?.slice(0, 200)}`);
    }
  }

  lastRunAt = new Date();
  lastRunResult = { usersRun, errors };

  // Persist last run time so the brain can detect gaps across deployments
  import('../lib/service-state').then(({ setState }) =>
    setState('back-catalog-runner', 'lastRunAt', {
      ms:         Date.now(),
      iso:        new Date().toISOString(),
      usersRun,
      errors,
    })
  ).catch(() => {});

  // Record cycle completion to the permanent event log
  import('../lib/event-log').then(({ logServiceCycle }) =>
    logServiceCycle('back-catalog-runner', null, {
      processed: usersRun + errors,
      succeeded: usersRun,
      failed:    errors,
      keyInsight: `${usersRun} user(s) completed`,
    })
  ).catch(() => {});

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

  logger.info(`[BackCatalogRunner] Scheduled — first run in ${Math.round(STARTUP_DELAY_MS / 60_000)} min, then adaptive (1h–24h based on queue depth)`);

  // Recursive setTimeout — interval shrinks when queue is thin, expands when full.
  // When the quota breaker is active, override the adaptive interval and instead
  // schedule the next run for just after midnight Pacific (the quota reset window),
  // so the runner always gets at least one full-quota attempt per day.
  function msUntilQuotaReset(): number {
    const resetTime = getNextResetTime();
    // Add a 5-min buffer after reset so publishers (07:00 UTC) fire first
    const msUntilReset = resetTime.getTime() - Date.now() + 5 * 60_000;
    // If reset is within 5 min or already past, wait 1h (next reset is tomorrow)
    return msUntilReset > 5 * 60_000 ? msUntilReset : 23 * 60 * 60_000;
  }

  function scheduleNextRun(): void {
    getGlobalQueueDepth().then(depth => {
      // If quota breaker is active, skip the adaptive interval and aim for reset
      if (isQuotaBreakerTripped()) {
        const waitMs = msUntilQuotaReset();
        lastIntervalMs = waitMs;
        nextRunAt = new Date(Date.now() + waitMs);
        logger.info(
          `[BackCatalogRunner] Quota breaker active — rescheduling for quota reset in ${Math.round(waitMs / 60_000)} min`
        );
        repeatTimer = setTimeout(async () => {
          if (running) { scheduleNextRun(); return; }
          running = true;
          try { await runBackCatalogForAllEligibleUsers(); } finally { running = false; }
          scheduleNextRun();
        }, waitMs);
        return;
      }

      const intervalMs = adaptiveIntervalMs(depth);
      lastIntervalMs = intervalMs;
      nextRunAt = new Date(Date.now() + intervalMs);
      logger.info(
        `[BackCatalogRunner] Adaptive schedule: queue=${depth} items → next run in ${Math.round(intervalMs / 60_000)} min`
      );
      repeatTimer = setTimeout(async () => {
        if (running) {
          logger.warn("[BackCatalogRunner] Previous cycle still running — rescheduling");
          scheduleNextRun();
          return;
        }
        running = true;
        logger.info("[BackCatalogRunner] Adaptive cycle triggered");
        try {
          await runBackCatalogForAllEligibleUsers();
        } finally {
          running = false;
        }
        scheduleNextRun(); // recurse with updated queue depth
      }, intervalMs);
    }).catch(err => {
      logger.warn(`[BackCatalogRunner] Queue depth check failed — defaulting to 8h: ${err?.message}`);
      lastIntervalMs = INTERVAL_MODERATE_MS;
      nextRunAt = new Date(Date.now() + INTERVAL_MODERATE_MS);
      repeatTimer = setTimeout(async () => {
        if (!running) {
          running = true;
          try { await runBackCatalogForAllEligibleUsers(); } finally { running = false; }
        }
        scheduleNextRun();
      }, INTERVAL_MODERATE_MS);
    });
  }

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

    scheduleNextRun(); // kick off adaptive repeat
  }, STARTUP_DELAY_MS);

  // Safety-net setInterval — guarantees the daily cycle fires even if the adaptive
  // recursive setTimeout ever stalls (e.g. an uncaught rejection escapes the finally block).
  // Fires every 24 h and forces a re-arm if nextRunAt is already in the past.
  heartbeatTimer = setInterval(async () => {
    if (paused || running) return;
    if (nextRunAt && nextRunAt.getTime() > Date.now()) return; // adaptive timer is ahead — nothing to do
    logger.warn("[BackCatalogRunner] Daily heartbeat: adaptive timer appears stalled — re-arming scheduleNextRun");
    scheduleNextRun();
  }, 24 * 60 * 60_000);
}

export function stopBackCatalogRunner(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (repeatTimer) {
    clearTimeout(repeatTimer);
    repeatTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  logger.info("[BackCatalogRunner] Stopped");
}

export function getBackCatalogRunnerStatus() {
  return {
    running,
    paused,
    lastRunAt:    lastRunAt?.toISOString() ?? null,
    lastRunResult,
    lastIntervalMs,
    nextRunEta:   nextRunAt?.toISOString() ?? null,
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
