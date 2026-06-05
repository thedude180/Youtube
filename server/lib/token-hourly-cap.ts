/**
 * server/lib/token-hourly-cap.ts
 *
 * Fix #1 — Token Budgets Exhaust in 6 Minutes After Every Reboot
 *
 * PROBLEM: Daily token budgets (content-grinder: 500k, shorts-pipeline: 150k)
 * are stored in DB and persist across reboots. On each boot, 20+ services
 * hammer AI simultaneously, burning through the remaining daily budget in
 * minutes. After that, every pipeline AI call fails for the rest of the day.
 *
 * SOLUTION: Add a per-hour cap on top of the daily cap. Each module can use
 * at most MAX_TOKENS_PER_HOUR tokens per hour, regardless of daily remaining.
 * This spreads consumption across the full day so no single boot burst can
 * exhaust the budget.
 *
 * Fix #2 — Hourly Counts Reset on Server Restart
 *
 * PROBLEM: The in-memory hourlyUsage map is lost on every restart. During the
 * first minutes after a reboot the counters show 0%, and engines that already
 * spent tokens earlier in the same hour have no guard against over-spending.
 *
 * SOLUTION: Persist the snapshot to system_settings under the key
 * "hourly_tokens:snapshot".  On boot, restore from that snapshot if its
 * hourKey matches the current hour.  Flush every 60 s (and after every
 * recordHourlyTokenUsage call via a dirty-flag debounce).
 */
import { createLogger } from "./logger";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const log = createLogger("token-hourly-cap");

// ─── Per-module hourly caps ───────────────────────────────────────────────────
export const HOURLY_CAPS: Record<string, number> = {
  "content-grinder":        50_000,  // daily 500k ÷ 24h × 2.4 buffer
  "shorts-pipeline":        12_000,  // daily 150k ÷ 24h × 1.9 buffer
  "repurpose-engine":        8_000,
  "thumbnail-intelligence":  6_000,  // daily 100k ÷ 24h × 1.4 buffer
  "viral-optimizer":         8_000,  // daily 150k ÷ 24h × 1.3 buffer
  "vod-seo-optimizer":       6_000,
  "infinite-evolution":      4_000,
  "knowledge-mesh":          3_000,
  "self-improvement-engine": 3_000,
  "autonomous-capability":   4_000,
  "memory-architect":        3_000,
  "business-agents":         2_000,
  "legal-tax-agents":        2_000,
  "team-orchestration":      3_000,
  "growth-flywheel":         3_000,
  "consistency-agent":       3_000,
  "default":                 5_000,  // fallback for unlisted modules
};

// ─── Viral-optimizer cap: DB-backed, cached per hour ─────────────────────────
const VIRAL_OPTIMIZER_DEFAULT_CAP = 8_000;
let _viralOptimizerCap    = VIRAL_OPTIMIZER_DEFAULT_CAP;
let _viralOptimizerHourKey = -1;
let _viralOptimizerLoading = false;

function refreshViralOptimizerCapIfStale(currentHour: number): void {
  if (_viralOptimizerHourKey === currentHour || _viralOptimizerLoading) return;
  _viralOptimizerLoading = true;

  db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "viral_optimizer_hourly_tokens"))
    .limit(1)
    .then((rows) => {
      const raw    = rows[0]?.value;
      const parsed = parseInt(raw ?? "", 10);
      if (!isNaN(parsed) && parsed > 0) {
        _viralOptimizerCap = parsed;
        log.debug(`[HourlyCap] viral-optimizer cap refreshed from DB: ${parsed}`);
      }
      _viralOptimizerHourKey = currentHour;
    })
    .catch((err: any) => {
      log.warn(`[HourlyCap] Could not refresh viral_optimizer_hourly_tokens: ${err?.message}`);
      _viralOptimizerHourKey = currentHour;
    })
    .finally(() => {
      _viralOptimizerLoading = false;
    });
}

// ─── In-memory hourly tracking ────────────────────────────────────────────────
interface HourlySlot {
  hourKey:    number;
  usedTokens: number;
}

const hourlyUsage = new Map<string, HourlySlot>();

// Snapshot format stored in system_settings under "hourly_tokens:snapshot"
interface HourlySnapshot {
  hourKey: number;
  usage:   Record<string, number>;
}

const SNAPSHOT_KEY = "hourly_tokens:snapshot";

function getCurrentHourKey(): number {
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

function getSlot(module: string): HourlySlot {
  const currentHour = getCurrentHourKey();
  const existing = hourlyUsage.get(module);
  if (existing && existing.hourKey === currentHour) return existing;
  const fresh: HourlySlot = { hourKey: currentHour, usedTokens: 0 };
  hourlyUsage.set(module, fresh);
  return fresh;
}

// ─── Persistence: flush to DB ─────────────────────────────────────────────────
let _dirty      = false;
let _flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushHourlyUsageToDB(): Promise<void> {
  if (!_dirty) return;
  _dirty = false;

  const currentHour = getCurrentHourKey();
  const usage: Record<string, number> = {};
  for (const [module, slot] of hourlyUsage) {
    if (slot.hourKey === currentHour) {
      usage[module] = slot.usedTokens;
    }
  }

  const snapshot: HourlySnapshot = { hourKey: currentHour, usage };
  const value = JSON.stringify(snapshot);

  try {
    await db
      .insert(systemSettings)
      .values({ key: SNAPSHOT_KEY, value, createdAt: new Date(), updatedAt: new Date() } as any)
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
    log.debug(`[HourlyCap] Flushed snapshot for hour ${currentHour} (${Object.keys(usage).length} modules)`);
  } catch (err: any) {
    log.warn(`[HourlyCap] Failed to flush hourly snapshot: ${err?.message}`);
    _dirty = true; // retry next cycle
  }
}

// ─── Persistence: restore from DB on boot ────────────────────────────────────
/**
 * Call once at server startup (after DB is ready) to restore hourly token
 * counts from the last flush.  If the stored snapshot belongs to the current
 * hour the counters are loaded into memory.  If the stored snapshot is stale
 * (different hour) it is ignored and the maps stay at zero.
 */
export async function restoreHourlyUsageFromDB(): Promise<void> {
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SNAPSHOT_KEY))
      .limit(1);

    if (!row?.value) {
      log.info("[HourlyCap] No hourly snapshot found — starting fresh");
      return;
    }

    const snapshot: HourlySnapshot = JSON.parse(row.value);
    const currentHour = getCurrentHourKey();

    if (snapshot.hourKey !== currentHour) {
      log.info(
        `[HourlyCap] Stored snapshot is from hour ${snapshot.hourKey}, ` +
        `current hour is ${currentHour} — discarding stale snapshot`
      );
      return;
    }

    let restored = 0;
    for (const [module, used] of Object.entries(snapshot.usage)) {
      if (typeof used === "number" && used > 0) {
        hourlyUsage.set(module, { hourKey: currentHour, usedTokens: used });
        restored++;
      }
    }
    log.info(
      `[HourlyCap] Restored hourly snapshot for hour ${currentHour}: ` +
      `${restored} module(s) loaded`
    );
  } catch (err: any) {
    log.warn(`[HourlyCap] Could not restore hourly snapshot (non-fatal): ${err?.message}`);
  }
}

/**
 * Start the 60-second periodic flush.  Call once after restoreHourlyUsageFromDB.
 */
export function startHourlyCapFlusher(): void {
  if (_flushTimer) return; // already running
  _flushTimer = setInterval(() => {
    flushHourlyUsageToDB().catch(() => {/* errors already logged inside */});
  }, 60_000);
  log.info("[HourlyCap] Periodic flush started (every 60 s)");
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface TokenCapResult {
  allowed:      boolean;
  usedThisHour: number;
  hourlyLimit:  number;
  remaining:    number;
}

/**
 * Check if a module can make an AI call without exceeding its hourly cap.
 * Call BEFORE every AI call in a module.
 */
export function checkHourlyTokenBudget(
  module: string,
  estimatedTokens: number = 1000,
): TokenCapResult {
  const currentHour = getCurrentHourKey();
  if (module === "viral-optimizer") {
    refreshViralOptimizerCapIfStale(currentHour);
  }
  const cap  = module === "viral-optimizer"
    ? _viralOptimizerCap
    : (HOURLY_CAPS[module] ?? HOURLY_CAPS["default"]);
  const slot = getSlot(module);
  const after = slot.usedTokens + estimatedTokens;

  if (after > cap) {
    log.debug(
      `[HourlyCap] ${module} would exceed hourly cap: ` +
      `${slot.usedTokens}+${estimatedTokens}=${after} > ${cap}`
    );
    return {
      allowed:      false,
      usedThisHour: slot.usedTokens,
      hourlyLimit:  cap,
      remaining:    Math.max(0, cap - slot.usedTokens),
    };
  }

  return {
    allowed:      true,
    usedThisHour: slot.usedTokens,
    hourlyLimit:  cap,
    remaining:    cap - slot.usedTokens,
  };
}

/**
 * Record tokens actually used after a successful AI call.
 * Call AFTER every AI call completes.
 */
export function recordHourlyTokenUsage(module: string, tokensUsed: number): void {
  const slot = getSlot(module);
  slot.usedTokens += tokensUsed;
  _dirty = true;
  // Fire-and-forget immediate persist so a crash between 60-s intervals
  // loses at most the tokens recorded since the last flush.
  flushHourlyUsageToDB().catch(() => {/* errors logged inside */});
}

/**
 * Snapshot of all module hourly usage for diagnostics.
 */
export function getHourlyCapStatus(): Record<string, { used: number; limit: number; pct: number }> {
  const result: Record<string, { used: number; limit: number; pct: number }> = {};
  const currentHour = getCurrentHourKey();
  for (const [module, staticCap] of Object.entries(HOURLY_CAPS)) {
    const cap  = module === "viral-optimizer" ? _viralOptimizerCap : staticCap;
    const slot = hourlyUsage.get(module);
    const used = (slot && slot.hourKey === currentHour) ? slot.usedTokens : 0;
    result[module] = { used, limit: cap, pct: Math.round((used / cap) * 100) };
  }
  return result;
}
