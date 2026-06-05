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
// The cap for "viral-optimizer" is stored in system_settings under the key
// "viral_optimizer_hourly_tokens" so it can be updated without a code deploy.
// We cache the value for the current hour to avoid a DB hit on every video;
// the function itself stays synchronous — DB refresh runs as fire-and-forget.

const VIRAL_OPTIMIZER_DEFAULT_CAP = 8_000;
let _viralOptimizerCap    = VIRAL_OPTIMIZER_DEFAULT_CAP;
let _viralOptimizerHourKey = -1;   // -1 forces refresh on first call
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
      // DB not yet ready or read failed — keep current cap, retry next hour
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
