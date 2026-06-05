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
// Mirrors ai-attack-shield DAILY_CAPS — used to gate engines that have burned
// too much of their daily budget (Fix #4: daily-cap gate in hourly check).
export const DAILY_TOKEN_CAPS: Record<string, number> = {
  "content-grinder":           100_000,
  "ai-team-engine":            100_000,
  "vod-optimizer":             100_000,
  "content-consistency-agent":  75_000,
  "shorts-pipeline":           150_000,
  "thumbnail-intelligence":    100_000,
  "repurpose-engine":           75_000,
  "viral-optimizer":           150_000,
  "autopilot":                 150_000,
  "tos-monitor":               100_000,
  "marketer-engine":           100_000,
  "auto-thumbnail":            100_000,
  "smart-scheduler":            50_000,
  "upload-seo":                150_000,
  "trend-rider":                40_000,
  "vod-seo-optimizer":          60_000,
  "infinite-evolution":         40_000,
  "knowledge-mesh":             30_000,
  "self-improvement-engine":    30_000,
  "autonomous-capability":      40_000,
  "memory-architect":           30_000,
  "business-agents":            20_000,
  "legal-tax-agents":           20_000,
  "team-orchestration":         30_000,
  "growth-flywheel":            30_000,
  "consistency-agent":          30_000,
  "default":                    50_000,  // fallback for unlisted modules
};

// ─── Generic DB-backed cap cache ──────────────────────────────────────────────
// Key: module name  →  { hourKey, cap }
// cap === -1 means "no DB entry found this hour; use HOURLY_CAPS fallback"
interface DbCapEntry {
  hourKey: number;
  cap:     number;
}

const _dbCapCache  = new Map<string, DbCapEntry>();
const _dbCapLoading = new Set<string>();

/**
 * Fire-and-forget: refresh a module's cap from system_settings if the cached
 * entry belongs to a previous hour.  The DB key is "hourly_cap:<module>".
 * While the async fetch is in-flight the cached (or fallback) value is used.
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
        log.debug(`[HourlyCap] ${module} cap refreshed from DB: ${parsed}`);
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
  const hourlySnapshot: HourlySnapshot = { hourKey: currentHour, usage: hourlyUsageMap };
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
    log.warn(
      `[HourlyCap] ${module} hourly cap hit: ` +
      `${slot.usedTokens}+${estimatedTokens}=${after} > ${cap} ` +
      `— resets in ${Math.round((60 * 60 * 1000 - (Date.now() % (60 * 60 * 1000))) / 60_000)}m`
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
 */
export function getHourlyCapStatus(): Record<string, { used: number; limit: number; pct: number }> {
  const result: Record<string, { used: number; limit: number; pct: number }> = {};
  const currentHour = getCurrentHourKey();

  // Collect all known modules: static caps + anything currently tracked in memory
  const modules = new Set([
    ...Object.keys(HOURLY_CAPS),
    ...Array.from(hourlyUsage.keys()),
  ]);

  for (const module of modules) {
    const cap  = getModuleCap(module, currentHour);
    const slot = hourlyUsage.get(module);
    const used = (slot && slot.hourKey === currentHour) ? slot.usedTokens : 0;
    result[module] = { used, limit: cap, pct: Math.round((used / cap) * 100) };
  }
  return result;
}

/**
 * Snapshot of all module daily (calendar-day) token totals for diagnostics.
 * Returns every module currently tracked in the daily accumulator.
 * Includes dailyCap so callers can compute usage%.
 * Resets automatically at UTC midnight when a new dateKey is generated.
 */
export function getDailyCapStatus(): Record<string, { usedToday: number; dateKey: string; dailyCap: number }> {
  const result: Record<string, { usedToday: number; dateKey: string; dailyCap: number }> = {};
  const currentDate = getCurrentDateKey();

  for (const [module, slot] of dailyUsage) {
    if (slot.dateKey === currentDate) {
      result[module] = {
        usedToday: slot.usedTokens,
        dateKey:   currentDate,
        dailyCap:  DAILY_TOKEN_CAPS[module] ?? DAILY_TOKEN_CAPS["default"],
      };
    }
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
