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
 *
 * Fix #3 — Hourly Caps Are Hardcoded (Require Code Deploy to Change)
 *
 * SOLUTION: A generic DB-backed cap helper reads any module's cap from
 * system_settings under key "hourly_cap:<module-name>".  The result is
 * cached for the current hour.  HOURLY_CAPS remains as a compile-time
 * fallback for any module that has no DB entry.
 */
import { createLogger } from "./logger";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const log = createLogger("token-hourly-cap");

// ─── Per-module hourly caps (compile-time fallbacks) ──────────────────────────
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

// ─── Per-module daily caps (compile-time fallbacks) ───────────────────────────
// DB-backed override: system_settings key "daily_cap:<module>" (positive integer).
// A module with no DB entry and no entry here falls back to DAILY_CAPS["default"].
// Also exported as DAILY_TOKEN_CAPS for backward compatibility with ai-attack-shield.
export const DAILY_CAPS: Record<string, number> = {
  "content-grinder":           500_000,
  "shorts-pipeline":           150_000,
  "repurpose-engine":           80_000,
  "thumbnail-intelligence":    100_000,
  "viral-optimizer":           150_000,
  "vod-seo-optimizer":          80_000,
  "infinite-evolution":         60_000,
  "knowledge-mesh":             50_000,
  "self-improvement-engine":    50_000,
  "autonomous-capability":      60_000,
  "memory-architect":           50_000,
  "business-agents":            40_000,
  "legal-tax-agents":           40_000,
  "team-orchestration":         50_000,
  "growth-flywheel":            50_000,
  "consistency-agent":          50_000,
  // Additional modules from incoming branch
  "ai-team-engine":            100_000,
  "vod-optimizer":             100_000,
  "content-consistency-agent":  75_000,
  "autopilot":                 150_000,
  "tos-monitor":               100_000,
  "marketer-engine":           100_000,
  "auto-thumbnail":            100_000,
  "smart-scheduler":            50_000,
  "upload-seo":                150_000,
  "trend-rider":                40_000,
  "default":                    80_000,  // fallback for unlisted modules
};
/** @deprecated Use DAILY_CAPS instead */
export const DAILY_TOKEN_CAPS = DAILY_CAPS;

// ─── Generic DB-backed cap cache (hourly) ────────────────────────────────────
// Key: module name  →  { hourKey, cap }
// cap === -1 means "no DB entry found this hour; use HOURLY_CAPS fallback"
interface DbCapEntry {
  hourKey: number;
  cap:     number;
}

const _dbCapCache  = new Map<string, DbCapEntry>();
const _dbCapLoading = new Set<string>();

/**
 * Fire-and-forget: refresh a module's hourly cap from system_settings if the
 * cached entry belongs to a previous hour.  DB key: "hourly_cap:<module>".
 */
function refreshModuleCapIfStale(module: string, currentHour: number): void {
  const cached = _dbCapCache.get(module);
  if (cached?.hourKey === currentHour) return; // already fresh for this hour
  if (_dbCapLoading.has(module)) return;        // fetch already in-flight

  _dbCapLoading.add(module);

  db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, `hourly_cap:${module}`))
    .limit(1)
    .then((rows) => {
      const raw    = rows[0]?.value;
      const parsed = parseInt(raw ?? "", 10);
      if (!isNaN(parsed) && parsed > 0) {
        _dbCapCache.set(module, { hourKey: currentHour, cap: parsed });
        log.debug(`[HourlyCap] ${module} hourly cap refreshed from DB: ${parsed}`);
      } else {
        // No DB entry — record as checked so we stop querying until next hour
        _dbCapCache.set(module, { hourKey: currentHour, cap: -1 });
      }
    })
    .catch((err: any) => {
      log.warn(`[HourlyCap] Could not refresh hourly_cap:${module}: ${err?.message}`);
      // Mark checked for this hour to avoid per-call DB storms on transient errors
      if (!_dbCapCache.get(module) || _dbCapCache.get(module)!.hourKey !== currentHour) {
        _dbCapCache.set(module, { hourKey: currentHour, cap: -1 });
      }
    })
    .finally(() => {
      _dbCapLoading.delete(module);
    });
}

/**
 * Return the effective hourly cap for a module.
 * Checks DB cache first; falls back to HOURLY_CAPS compile-time constant.
 */
function getModuleCap(module: string, currentHour: number): number {
  refreshModuleCapIfStale(module, currentHour);
  const cached = _dbCapCache.get(module);
  if (cached && cached.hourKey === currentHour && cached.cap > 0) {
    return cached.cap;
  }
  return HOURLY_CAPS[module] ?? HOURLY_CAPS["default"];
}

// ─── Generic DB-backed cap cache (daily) ─────────────────────────────────────
// Key: module name  →  { dateKey, cap }
// cap === -1 means "no DB entry found today; use DAILY_CAPS fallback"
interface DbDailyCapEntry {
  dateKey: string;
  cap:     number;
}

const _dbDailyCapCache   = new Map<string, DbDailyCapEntry>();
const _dbDailyCapLoading = new Set<string>();

/**
 * Fire-and-forget: refresh a module's daily cap from system_settings if the
 * cached entry belongs to a previous date.  DB key: "daily_cap:<module>".
 * While the async fetch is in-flight the cached (or fallback) value is used.
 */
function refreshModuleDailyCapIfStale(module: string, currentDate: string): void {
  const cached = _dbDailyCapCache.get(module);
  if (cached?.dateKey === currentDate) return; // already fresh for today
  if (_dbDailyCapLoading.has(module)) return;  // fetch already in-flight

  _dbDailyCapLoading.add(module);

  db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, `daily_cap:${module}`))
    .limit(1)
    .then((rows) => {
      const raw    = rows[0]?.value;
      const parsed = parseInt(raw ?? "", 10);
      if (!isNaN(parsed) && parsed > 0) {
        _dbDailyCapCache.set(module, { dateKey: currentDate, cap: parsed });
        log.debug(`[HourlyCap] ${module} daily cap refreshed from DB: ${parsed}`);
      } else {
        // No DB entry — record as checked so we stop querying until tomorrow
        _dbDailyCapCache.set(module, { dateKey: currentDate, cap: -1 });
      }
    })
    .catch((err: any) => {
      log.warn(`[HourlyCap] Could not refresh daily_cap:${module}: ${err?.message}`);
      if (!_dbDailyCapCache.get(module) || _dbDailyCapCache.get(module)!.dateKey !== currentDate) {
        _dbDailyCapCache.set(module, { dateKey: currentDate, cap: -1 });
      }
    })
    .finally(() => {
      _dbDailyCapLoading.delete(module);
    });
}

/**
 * Return the effective daily cap for a module.
 * Checks DB cache first; falls back to DAILY_CAPS compile-time constant.
 */
function getModuleDailyCap(module: string, currentDate: string): number {
  refreshModuleDailyCapIfStale(module, currentDate);
  const cached = _dbDailyCapCache.get(module);
  if (cached && cached.dateKey === currentDate && cached.cap > 0) {
    return cached.cap;
  }
  return DAILY_CAPS[module] ?? DAILY_CAPS["default"];
}

// ─── In-memory hourly tracking ────────────────────────────────────────────────
interface HourlySlot {
  hourKey:    number;
  usedTokens: number;
}

const hourlyUsage = new Map<string, HourlySlot>();

// ─── Per-module hourly cap hit counters ──────────────────────────────────────
// Tracks how many times each module was rejected by its hourly cap this hour.
interface HitSlot {
  hourKey: number;
  count:   number;
}

const hourlyHitCounts = new Map<string, HitSlot>();

function getHitSlot(module: string): HitSlot {
  const currentHour = getCurrentHourKey();
  const existing = hourlyHitCounts.get(module);
  if (existing && existing.hourKey === currentHour) return existing;
  const fresh: HitSlot = { hourKey: currentHour, count: 0 };
  hourlyHitCounts.set(module, fresh);
  return fresh;
}

/** Clears the hit counter for `module` in the current hour (call after admin raises the cap). */
export function resetHourlyHitCount(module: string): void {
  const slot = hourlyHitCounts.get(module);
  if (slot) slot.count = 0;
}

/**
 * Evict a module's hourly-cap cache entry so the next checkHourlyTokenBudget
 * call re-reads the cap from the DB immediately instead of waiting for the
 * next hour boundary.  Call this after writing a new hourly_cap:<module> row.
 */
export function invalidateModuleCapCache(module: string): void {
  _dbCapCache.delete(module);
  log.debug(`[HourlyCap] Cache invalidated for ${module} — next call will re-read from DB`);
}

// Snapshot format stored in system_settings under "hourly_tokens:snapshot"
interface HourlySnapshot {
  hourKey: number;
  usage:   Record<string, number>;
  hits?:   Record<string, number>;
}

const SNAPSHOT_KEY       = "hourly_tokens:snapshot";
const DAILY_SNAPSHOT_KEY = "daily_tokens:snapshot";

function getCurrentHourKey(): number {
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

function getCurrentDateKey(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── In-memory daily tracking ─────────────────────────────────────────────────
interface DailySlot {
  dateKey:    string;
  usedTokens: number;
}

// Snapshot format stored in system_settings under "daily_tokens:snapshot"
interface DailySnapshot {
  dateKey: string;
  usage:   Record<string, number>;
}

const dailyUsage = new Map<string, DailySlot>();

function getDailySlot(module: string): DailySlot {
  const currentDate = getCurrentDateKey();
  const existing = dailyUsage.get(module);
  if (existing && existing.dateKey === currentDate) return existing;
  const fresh: DailySlot = { dateKey: currentDate, usedTokens: 0 };
  dailyUsage.set(module, fresh);
  return fresh;
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
let _lastFlushAt: Date | null = null;
let _consecutiveFlushFailures = 0;
let _lastFlushError: string | null = null;

async function flushHourlyUsageToDB(): Promise<void> {
  if (!_dirty) return;
  _dirty = false;

  const currentHour = getCurrentHourKey();
  const currentDate = getCurrentDateKey();
  const now         = new Date();

  // ── Hourly snapshot ──────────────────────────────────────────────────────
  const hourlyUsageMap: Record<string, number> = {};
  for (const [module, slot] of hourlyUsage) {
    if (slot.hourKey === currentHour) {
      hourlyUsageMap[module] = slot.usedTokens;
    }
  }
  const hourlyHitsMap: Record<string, number> = {};
  for (const [module, hitSlot] of hourlyHitCounts) {
    if (hitSlot.hourKey === currentHour && hitSlot.count > 0) {
      hourlyHitsMap[module] = hitSlot.count;
    }
  }
  const hourlySnapshot: HourlySnapshot = { hourKey: currentHour, usage: hourlyUsageMap, hits: hourlyHitsMap };
  const hourlyValue = JSON.stringify(hourlySnapshot);

  // ── Daily snapshot ───────────────────────────────────────────────────────
  const dailyUsageMap: Record<string, number> = {};
  for (const [module, slot] of dailyUsage) {
    if (slot.dateKey === currentDate) {
      dailyUsageMap[module] = slot.usedTokens;
    }
  }
  const dailySnapshot: DailySnapshot = { dateKey: currentDate, usage: dailyUsageMap };
  const dailyValue = JSON.stringify(dailySnapshot);

  try {
    await db
      .insert(systemSettings)
      .values({ key: SNAPSHOT_KEY, value: hourlyValue, createdAt: now, updatedAt: now } as any)
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: hourlyValue, updatedAt: now },
      });

    await db
      .insert(systemSettings)
      .values({ key: DAILY_SNAPSHOT_KEY, value: dailyValue, createdAt: now, updatedAt: now } as any)
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: dailyValue, updatedAt: now },
      });

    _lastFlushAt = now;
    _consecutiveFlushFailures = 0;
    _lastFlushError = null;
    log.debug(
      `[HourlyCap] Flushed hourly (hour ${currentHour}, ${Object.keys(hourlyUsageMap).length} modules) ` +
      `+ daily (${currentDate}, ${Object.keys(dailyUsageMap).length} modules)`
    );
  } catch (err: any) {
    _consecutiveFlushFailures++;
    _lastFlushError = err?.message ?? "Unknown error";
    log.warn(`[HourlyCap] Failed to flush snapshots (failure #${_consecutiveFlushFailures}): ${_lastFlushError}`);
    _dirty = true; // retry next cycle
  }
}

/**
 * Returns the health of the hourly-token flush mechanism.
 *
 * Source of truth is the DB — reads the `updated_at` column of the
 * `hourly_tokens:snapshot` row so the answer survives process restarts.
 * Falls back to the in-memory `_lastFlushAt` if the DB read fails.
 *
 * lastFlushAt    — ISO timestamp of the last successful flush (null = never)
 * snapshotAgeSecs — seconds since last flush (-1 = never flushed)
 * isStale        — true when age > 120 s or no flush has ever succeeded
 */
export async function getFlushHealth(): Promise<{
  lastFlushAt: string | null;
  snapshotAgeSecs: number;
  isStale: boolean;
  consecutiveFailures: number;
  lastErrorMsg: string | null;
}> {
  let flushTime: Date | null = _lastFlushAt;

  try {
    const [row] = await db
      .select({ updatedAt: systemSettings.updatedAt })
      .from(systemSettings)
      .where(eq(systemSettings.key, SNAPSHOT_KEY))
      .limit(1);

    if (row?.updatedAt) {
      const dbTime = new Date(row.updatedAt);
      // Use whichever timestamp is more recent
      if (!flushTime || dbTime > flushTime) {
        flushTime = dbTime;
      }
    }
  } catch (err: any) {
    log.warn(`[HourlyCap] getFlushHealth DB read failed (using in-memory fallback): ${err?.message}`);
  }

  if (!flushTime) {
    return {
      lastFlushAt: null,
      snapshotAgeSecs: -1,
      isStale: true,
      consecutiveFailures: _consecutiveFlushFailures,
      lastErrorMsg: _lastFlushError,
    };
  }
  const ageSecs = Math.floor((Date.now() - flushTime.getTime()) / 1000);
  return {
    lastFlushAt: flushTime.toISOString(),
    snapshotAgeSecs: ageSecs,
    isStale: ageSecs > 120,
    consecutiveFailures: _consecutiveFlushFailures,
    lastErrorMsg: _lastFlushError,
  };
}

// ─── Persistence: restore from DB on boot ────────────────────────────────────
/**
 * Call once at server startup (after DB is ready) to restore hourly token
 * counts from the last flush.  If the stored snapshot belongs to the current
 * hour the counters are loaded into memory.  If the stored snapshot is stale
 * (different hour) it is ignored and the maps stay at zero.
 */
export async function restoreHourlyUsageFromDB(): Promise<void> {
  const currentHour = getCurrentHourKey();
  const currentDate = getCurrentDateKey();

  // ── Restore hourly snapshot ──────────────────────────────────────────────
  try {
    const [row] = await db
      .select({ value: systemSettings.value, updatedAt: systemSettings.updatedAt })
      .from(systemSettings)
      .where(eq(systemSettings.key, SNAPSHOT_KEY))
      .limit(1);

    if (!row?.value) {
      log.info("[HourlyCap] No hourly snapshot found — starting fresh");
    } else {
      const snapshot: HourlySnapshot = JSON.parse(row.value);

      // Initialize _lastFlushAt from the DB row so health survives restarts
      if (row.updatedAt) {
        _lastFlushAt = new Date(row.updatedAt);
      }

      if (snapshot.hourKey !== currentHour) {
        log.info(
          `[HourlyCap] Stored hourly snapshot is from hour ${snapshot.hourKey}, ` +
          `current hour is ${currentHour} — discarding stale hourly snapshot`
        );
      } else {
        let restored = 0;
        for (const [module, used] of Object.entries(snapshot.usage)) {
          if (typeof used === "number" && used > 0) {
            hourlyUsage.set(module, { hourKey: currentHour, usedTokens: used });
            restored++;
          }
        }
        // Restore hit counts from snapshot
        if (snapshot.hits) {
          for (const [module, count] of Object.entries(snapshot.hits)) {
            if (typeof count === "number" && count > 0) {
              hourlyHitCounts.set(module, { hourKey: currentHour, count });
            }
          }
        }
        log.info(
          `[HourlyCap] Restored hourly snapshot for hour ${currentHour}: ` +
          `${restored} module(s) loaded`
        );
      }
    }
  } catch (err: any) {
    log.warn(`[HourlyCap] Could not restore hourly snapshot (non-fatal): ${err?.message}`);
  }

  // ── Restore daily snapshot ───────────────────────────────────────────────
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, DAILY_SNAPSHOT_KEY))
      .limit(1);

    if (!row?.value) {
      log.info("[HourlyCap] No daily snapshot found — daily totals start at zero");
      return;
    }

    const snapshot: DailySnapshot = JSON.parse(row.value);

    if (snapshot.dateKey !== currentDate) {
      log.info(
        `[HourlyCap] Stored daily snapshot is from ${snapshot.dateKey}, ` +
        `today is ${currentDate} — discarding stale daily snapshot`
      );
      return;
    }

    let restored = 0;
    for (const [module, used] of Object.entries(snapshot.usage)) {
      if (typeof used === "number" && used > 0) {
        dailyUsage.set(module, { dateKey: currentDate, usedTokens: used });
        restored++;
      }
    }
    log.info(
      `[HourlyCap] Restored daily snapshot for ${currentDate}: ` +
      `${restored} module(s) loaded`
    );
  } catch (err: any) {
    log.warn(`[HourlyCap] Could not restore daily snapshot (non-fatal): ${err?.message}`);
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
  /** Present only when allowed === false; human-readable reason for the block. */
  reason?:      string;
  /** Present when daily cap data is available (always set by checkTokenBudgets). */
  usedToday?:   number;
  dailyLimit?:  number;
  dailyRemaining?: number;
}

/**
 * Check if a module can make an AI call without exceeding its hourly cap
 * OR its daily cap.  Call BEFORE every AI call in a module.
 *
 * Cap resolution order (hourly):
 *   1. system_settings key "hourly_cap:<module>"  (DB-backed, cached per hour)
 *   2. HOURLY_CAPS compile-time record             (code fallback)
 *   3. HOURLY_CAPS["default"]                      (catch-all)
 *
 * Daily gate (#215): if the module has already used >= its DAILY_TOKEN_CAPS
 * allowance for the current UTC day the call is rejected so engines slow down
 * naturally rather than burning tomorrow's budget.
 */
export function checkHourlyTokenBudget(
  module: string,
  estimatedTokens: number = 1000,
): TokenCapResult {
  const currentHour = getCurrentHourKey();
  const cap  = getModuleCap(module, currentHour);
  const slot = getSlot(module);
  const after = slot.usedTokens + estimatedTokens;

  // ── Daily cap gate ────────────────────────────────────────────────────────
  const dailyCap = DAILY_TOKEN_CAPS[module] ?? DAILY_TOKEN_CAPS["default"];
  const daySlot  = dailyUsage.get(module);
  if (daySlot && daySlot.dateKey === getCurrentDateKey()) {
    if (daySlot.usedTokens + estimatedTokens > dailyCap) {
      log.warn(
        `[HourlyCap] ${module} daily cap reached: ` +
        `${daySlot.usedTokens}+${estimatedTokens} > ${dailyCap} ` +
        `— slowing engine until tomorrow UTC`
      );
      return {
        allowed:      false,
        usedThisHour: slot.usedTokens,
        hourlyLimit:  cap,
        remaining:    Math.max(0, cap - slot.usedTokens),
      };
    }
  }

  // ── Hourly cap gate ───────────────────────────────────────────────────────
  if (after > cap) {
    const minsLeft = Math.round((60 * 60 * 1000 - (Date.now() % (60 * 60 * 1000))) / 60_000);
    // Increment the per-module hit counter so operators can see how often each
    // engine is being throttled from the admin Hourly Caps dashboard.
    const hitSlot = getHitSlot(module);
    hitSlot.count += 1;
    _dirty = true;
    log.warn(
      `[HourlyCap] ${module} hourly cap hit (×${hitSlot.count} this hour): ` +
      `${slot.usedTokens}+${estimatedTokens}=${after} > ${cap} ` +
      `— resets in ${minsLeft}m`
    );
    return {
      allowed:      false,
      usedThisHour: slot.usedTokens,
      hourlyLimit:  cap,
      remaining:    Math.max(0, cap - slot.usedTokens),
      reason:       `Hourly cap reached (used ${slot.usedTokens.toLocaleString()} of ${cap.toLocaleString()} tokens this hour)`,
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
 * Check if a module can make an AI call without exceeding its DAILY cap.
 * Call BEFORE every AI call in a module (alongside checkHourlyTokenBudget).
 *
 * Cap resolution order:
 *   1. system_settings key "daily_cap:<module>"  (DB-backed, cached per day)
 *   2. DAILY_CAPS compile-time record             (code fallback)
 *   3. DAILY_CAPS["default"]                      (catch-all)
 */
export function checkDailyTokenBudget(
  module: string,
  estimatedTokens: number = 1000,
): TokenCapResult {
  const currentDate = getCurrentDateKey();
  const currentHour = getCurrentHourKey();
  const dailyCap    = getModuleDailyCap(module, currentDate);
  const daySlot     = getDailySlot(module);
  const afterDay    = daySlot.usedTokens + estimatedTokens;

  // Also populate hourly fields so callers get a complete picture
  const hourlyCap  = getModuleCap(module, currentHour);
  const hourSlot   = getSlot(module);

  if (afterDay > dailyCap) {
    log.warn(
      `[HourlyCap] ${module} daily cap exhausted: ` +
      `${daySlot.usedTokens}+${estimatedTokens}=${afterDay} > ${dailyCap} (${currentDate})`
    );
    return {
      allowed:         false,
      usedThisHour:    hourSlot.usedTokens,
      hourlyLimit:     hourlyCap,
      remaining:       Math.max(0, hourlyCap - hourSlot.usedTokens),
      usedToday:       daySlot.usedTokens,
      dailyLimit:      dailyCap,
      dailyRemaining:  0,
      reason:          `Daily cap reached (used ${daySlot.usedTokens.toLocaleString()} of ${dailyCap.toLocaleString()} tokens today)`,
    };
  }

  return {
    allowed:         true,
    usedThisHour:    hourSlot.usedTokens,
    hourlyLimit:     hourlyCap,
    remaining:       hourlyCap - hourSlot.usedTokens,
    usedToday:       daySlot.usedTokens,
    dailyLimit:      dailyCap,
    dailyRemaining:  dailyCap - daySlot.usedTokens,
  };
}

/**
 * Combined guard: checks BOTH the hourly cap and the daily cap.
 * Returns the first failure encountered (daily cap checked first, then hourly).
 * Use this as the single call-site check in every engine/module before AI calls.
 *
 * allowed === false → skip the AI call; log result.reason.
 * allowed === true  → proceed, then call recordHourlyTokenUsage() after.
 */
export function checkTokenBudgets(
  module: string,
  estimatedTokens: number = 1000,
): TokenCapResult {
  // Daily cap check first — a daily block should shadow the hourly one
  const daily = checkDailyTokenBudget(module, estimatedTokens);
  if (!daily.allowed) return daily;

  // Hourly cap check
  const hourly = checkHourlyTokenBudget(module, estimatedTokens);
  if (!hourly.allowed) {
    return {
      ...hourly,
      usedToday:      daily.usedToday,
      dailyLimit:     daily.dailyLimit,
      dailyRemaining: daily.dailyRemaining,
    };
  }

  return {
    ...hourly,
    usedToday:      daily.usedToday,
    dailyLimit:     daily.dailyLimit,
    dailyRemaining: daily.dailyRemaining,
  };
}

/**
 * Record tokens actually used after a successful AI call.
 * Updates both the hourly slot (for the current-hour cap) and the daily
 * accumulator (so daily totals survive outages longer than one hour).
 * Call AFTER every AI call completes.
 */
export function recordHourlyTokenUsage(module: string, tokensUsed: number): void {
  const slot = getSlot(module);
  slot.usedTokens += tokensUsed;

  const daySlot = getDailySlot(module);
  daySlot.usedTokens += tokensUsed;

  _dirty = true;
  // Fire-and-forget immediate persist so a crash between 60-s intervals
  // loses at most the tokens recorded since the last flush.
  flushHourlyUsageToDB().catch(() => {/* errors logged inside */});
}

/**
 * Snapshot of all module hourly usage for diagnostics.
 * Includes every module in HOURLY_CAPS plus any active module tracked in memory.
 * `hitsThisHour` is the number of times the module was rejected by its hourly cap
 * this hour — operators can use this to identify which engines are throttling.
 */
export function getHourlyCapStatus(): Record<string, { used: number; limit: number; pct: number; hitsThisHour: number }> {
  const result: Record<string, { used: number; limit: number; pct: number; hitsThisHour: number }> = {};
  const currentHour = getCurrentHourKey();

  // Collect all known modules: static caps + anything currently tracked in memory
  const modules = new Set([
    ...Object.keys(HOURLY_CAPS),
    ...Array.from(hourlyUsage.keys()),
    ...Array.from(hourlyHitCounts.keys()),
  ]);

  for (const module of modules) {
    const cap      = getModuleCap(module, currentHour);
    const slot     = hourlyUsage.get(module);
    const hitSlot  = hourlyHitCounts.get(module);
    const used     = (slot    && slot.hourKey    === currentHour) ? slot.usedTokens : 0;
    const hits     = (hitSlot && hitSlot.hourKey === currentHour) ? hitSlot.count   : 0;
    result[module] = { used, limit: cap, pct: Math.round((used / cap) * 100), hitsThisHour: hits };
  }
  return result;
}

/**
 * Snapshot of all module daily (calendar-day) token totals and caps for diagnostics.
 * Includes every module in DAILY_CAPS plus any module currently tracked in memory.
 * Resets automatically at UTC midnight when a new dateKey is generated.
 */
export function getDailyCapStatus(): Record<string, { usedToday: number; limit: number; pct: number; dateKey: string }> {
  const result: Record<string, { usedToday: number; limit: number; pct: number; dateKey: string }> = {};
  const currentDate = getCurrentDateKey();

  // Collect all known modules: static caps + anything currently tracked in memory
  const modules = new Set([
    ...Object.keys(DAILY_CAPS),
    ...Array.from(dailyUsage.keys()),
  ]);

  for (const module of modules) {
    const cap  = getModuleDailyCap(module, currentDate);
    const slot = dailyUsage.get(module);
    const used = (slot && slot.dateKey === currentDate) ? slot.usedTokens : 0;
    result[module] = { usedToday: used, limit: cap, pct: Math.round((used / cap) * 100), dateKey: currentDate };
  }
  return result;
}

/**
 * Reset the daily token counter for a specific module.
 * Admin-only: wipes the in-memory slot AND schedules an immediate flush so the
 * DB snapshot reflects the reset before the next scheduled 60-second flush.
 */
export function resetDailyTokenCounter(module: string): void {
  const currentDate = getCurrentDateKey();
  dailyUsage.set(module, { dateKey: currentDate, usedTokens: 0 });
  _dirty = true;
  flushHourlyUsageToDB().catch(() => {});
  log.info(`[HourlyCap] Admin reset daily token counter for: ${module}`);
}
