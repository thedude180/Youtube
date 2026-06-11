/**
 * Perpetual Queue Guardian
 *
 * Active monitor that ensures the publishing queue never runs dry.
 * Runs every 15 minutes and checks:
 *   - Shorts scheduled for the next 5 days (target: 3 Shorts/day → 15 items)
 *   - Long-form scheduled for the next 14 days (target: 1 LF/day → 14 items)
 *
 * Cascade when low:
 *   1. Trigger back-catalog runner (current-game first, then any game)
 *   2. If runner errors → trigger perpetual recycler (reset mined flags for forever loop)
 *
 * Threshold: Shorts < 3 days OR LF < 7 days → immediate refill
 */

import { db } from "../db";
import { eq, and, gte, lte, inArray, sql, count } from "drizzle-orm";
import { autopilotQueue } from "@shared/schema";
import { logger } from "../lib/logger";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { storage } from "../storage";

// ── Thresholds ────────────────────────────────────────────────────────────────
const SHORTS_REFILL_THRESHOLD_DAYS   = 3;   // < 3 days of Shorts  → refill
const LONGFORM_REFILL_THRESHOLD_DAYS = 7;   // < 7 days of LF      → refill
const SHORTS_TARGET_DAYS             = 5;
const LONGFORM_TARGET_DAYS           = 14;
const CHECK_INTERVAL_MS              = 15 * 60_000;

// ── State ─────────────────────────────────────────────────────────────────────
let _lastCheckAt:  Date | null = null;
let _lastRefillAt: Date | null = null;
let _refillsToday = 0;
let _refillDate   = "";
let _guardianTimer: NodeJS.Timeout | null = null;

// Per-user queue depth cache (TTL 5 min) to avoid hammering DB on every check
const _depthCache = new Map<string, { data: QueueDepth; ts: number }>();
const DEPTH_CACHE_TTL = 5 * 60_000;

interface QueueDepth {
  shortsDays:   number;
  longFormDays: number;
  freshCount:   number;
  catalogCount: number;
}

// ── Queue measurement ─────────────────────────────────────────────────────────

async function measureQueueDepth(userId: string): Promise<QueueDepth> {
  const cached = _depthCache.get(userId);
  if (cached && Date.now() - cached.ts < DEPTH_CACHE_TTL) return cached.data;

  const now            = new Date();
  const shortWindow    = new Date(now.getTime() + SHORTS_TARGET_DAYS   * 86400_000);
  const longFormWindow = new Date(now.getTime() + LONGFORM_TARGET_DAYS  * 86400_000);

  const [shortsRows, longFormRows, freshRows] = await Promise.all([
    db.select({ n: count() }).from(autopilotQueue).where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "pending"]),
      sql`${autopilotQueue.type} IN ('youtube_short','platform_short','vod-short','auto-clip')`,
      sql`COALESCE(${autopilotQueue.metadata}->>'contentType','short') NOT IN ('long-form-clip','vod_long_form','long-form-compilation')`,
      gte(autopilotQueue.scheduledAt, now),
      lte(autopilotQueue.scheduledAt, shortWindow),
    )),
    db.select({ n: count() }).from(autopilotQueue).where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "pending"]),
      sql`${autopilotQueue.type} IN ('auto-clip','vod-long-form')`,
      sql`COALESCE(${autopilotQueue.metadata}->>'contentType','long-form-clip') IN ('long-form-clip','vod_long_form','long-form-compilation')`,
      gte(autopilotQueue.scheduledAt, now),
      lte(autopilotQueue.scheduledAt, longFormWindow),
    )),
    db.select({ n: count() }).from(autopilotQueue).where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "pending"]),
      sql`(${autopilotQueue.metadata}->>'isStreamHighlight' = 'true' OR ${autopilotQueue.metadata}->>'isStreamReplay' = 'true' OR ${autopilotQueue.metadata}->>'copilotGenerated' = 'true')`,
    )),
  ]);

  const shortsCount   = Number(shortsRows[0]?.n   ?? 0);
  const longFormCount = Number(longFormRows[0]?.n  ?? 0);
  const freshCount    = Number(freshRows[0]?.n     ?? 0);

  // Convert item counts to approximate days of coverage
  // Cadence: 3 Shorts/day, 1 LF/day
  const data: QueueDepth = {
    shortsDays:   Math.round((shortsCount   / 3)  * 10) / 10,
    longFormDays: Math.round((longFormCount / 1)  * 10) / 10,
    freshCount,
    catalogCount: Math.max(0, shortsCount + longFormCount - freshCount),
  };

  _depthCache.set(userId, { data, ts: Date.now() });
  return data;
}

// ── Refill cascade ────────────────────────────────────────────────────────────

async function triggerRefill(userId: string, reason: string): Promise<void> {
  logger.info(`[QueueGuardian] Refill triggered for ${userId} — ${reason}`);
  _lastRefillAt = new Date();
  const today   = new Date().toISOString().slice(0, 10);
  if (_refillDate !== today) { _refillsToday = 0; _refillDate = today; }
  _refillsToday++;
  _depthCache.delete(userId); // invalidate cache so next check sees fresh data

  try {
    const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
    await runBackCatalogForAllEligibleUsers();
    logger.info(`[QueueGuardian] Back-catalog refill complete for ${userId}`);
  } catch (err: any) {
    logger.warn(`[QueueGuardian] Back-catalog run error: ${err.message} — trying perpetual recycler`);
    try {
      const { runPerpetualRecycler } = await import("./youtube-perpetual-recycler");
      await runPerpetualRecycler();
      logger.info("[QueueGuardian] Perpetual recycler fired as fallback — mined flags reset");
    } catch (recycleErr: any) {
      logger.warn(`[QueueGuardian] Recycler fallback error: ${recycleErr.message}`);
    }
  }
}

// ── Per-user check ────────────────────────────────────────────────────────────

async function checkUser(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const depth = await measureQueueDepth(userId);
    const needsShorts   = depth.shortsDays   < SHORTS_REFILL_THRESHOLD_DAYS;
    const needsLongForm = depth.longFormDays < LONGFORM_REFILL_THRESHOLD_DAYS;

    if (needsShorts || needsLongForm) {
      const parts: string[] = [];
      if (needsShorts)   parts.push(`Shorts ${depth.shortsDays.toFixed(1)}d < ${SHORTS_REFILL_THRESHOLD_DAYS}d`);
      if (needsLongForm) parts.push(`LF ${depth.longFormDays.toFixed(1)}d < ${LONGFORM_REFILL_THRESHOLD_DAYS}d`);
      await triggerRefill(userId, parts.join("; "));
    } else {
      logger.debug(`[QueueGuardian] Healthy: Shorts=${depth.shortsDays.toFixed(1)}d LF=${depth.longFormDays.toFixed(1)}d`);
    }
  } catch (err: any) {
    logger.warn(`[QueueGuardian] Check error for ${userId}: ${err.message}`);
  }
}

// ── Main check loop ───────────────────────────────────────────────────────────

async function runGuardianCheck(): Promise<void> {
  if (isQuotaBreakerTripped()) return;

  try {
    const users = await storage.getAllUsers().catch(() => [] as any[]);
    const activeUsers = Array.isArray(users) && users.length > 0
      ? users
      : (await db.selectDistinct({ userId: autopilotQueue.userId }).from(autopilotQueue).limit(20)).map(r => ({ id: r.userId }));

    for (const user of activeUsers) {
      const uid = typeof user === "string" ? user : (user.id ?? user.userId ?? "");
      if (uid) await checkUser(uid);
    }
  } catch (err: any) {
    logger.warn(`[QueueGuardian] Check loop error: ${err.message}`);
  } finally {
    _lastCheckAt = new Date();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getGuardianStatusForUser(userId: string): Promise<{
  shortsDays:    number;
  longFormDays:  number;
  freshCount:    number;
  catalogCount:  number;
  isHealthy:     boolean;
  lastCheckAt:   Date | null;
  lastRefillAt:  Date | null;
  refillsToday:  number;
}> {
  const depth = await measureQueueDepth(userId).catch(() => ({
    shortsDays: 0, longFormDays: 0, freshCount: 0, catalogCount: 0,
  }));
  return {
    ...depth,
    isHealthy:    depth.shortsDays >= SHORTS_REFILL_THRESHOLD_DAYS && depth.longFormDays >= LONGFORM_REFILL_THRESHOLD_DAYS,
    lastCheckAt:  _lastCheckAt,
    lastRefillAt: _lastRefillAt,
    refillsToday: _refillsToday,
  };
}

export async function manualRefill(userId: string): Promise<void> {
  await triggerRefill(userId, "manual trigger");
}

export function initPerpetualQueueGuardian(): void {
  if (_guardianTimer) { clearInterval(_guardianTimer); _guardianTimer = null; }

  // First check 3 min after wire (don't rush on boot)
  setTimeout(() => {
    runGuardianCheck().catch(e => logger.warn(`[QueueGuardian] Boot check error: ${e.message}`));
  }, 3 * 60_000);

  _guardianTimer = setInterval(() => {
    runGuardianCheck().catch(e => logger.warn(`[QueueGuardian] Interval error: ${e.message}`));
  }, CHECK_INTERVAL_MS);

  logger.info("[QueueGuardian] Perpetual Queue Guardian running — checking every 15 min");
}

export function stopPerpetualQueueGuardian(): void {
  if (_guardianTimer) { clearInterval(_guardianTimer); _guardianTimer = null; }
}
