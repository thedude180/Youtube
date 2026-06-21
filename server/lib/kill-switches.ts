/**
 * server/lib/kill-switches.ts
 *
 * Phase 5 — Kill Switches
 *
 * Centralized kill switch system that can pause any module cleanly.
 * Reads from two sources (in priority order):
 *   1. Environment variable KILL_SWITCH_<NAME>=true (set at startup, highest priority)
 *   2. system_settings table key kill_switch:<name> (runtime control)
 *
 * Cache TTL: 60 seconds (so DB changes take effect within one minute).
 * When a switch is active: logs one summary line, affected workers drain
 * in-flight work and refuse new work. No data is deleted.
 */

import { createLogger } from "./logger";

const log = createLogger("kill-switches");

export type KillSwitchKey =
  | "all_automation"
  | "youtube_api"
  | "ai_calls"
  | "uploads"
  | "thumbnail_uploads"
  | "metadata_updates"
  | "vault_downloads"
  | "backlog_processing"
  | "self_healing"
  | "growth_experiments";

const ALL_KEYS: KillSwitchKey[] = [
  "all_automation",
  "youtube_api",
  "ai_calls",
  "uploads",
  "thumbnail_uploads",
  "metadata_updates",
  "vault_downloads",
  "backlog_processing",
  "self_healing",
  "growth_experiments",
];

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  value: boolean;
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const _cache = new Map<KillSwitchKey, CacheEntry>();
const _loggedActive = new Set<KillSwitchKey>();

// ── Env-var overrides (never expire) ─────────────────────────────────────────

const _envOverrides = new Map<KillSwitchKey, boolean>();

function loadEnvOverrides(): void {
  for (const key of ALL_KEYS) {
    const envKey = `KILL_SWITCH_${key.toUpperCase()}`;
    if (process.env[envKey] === "true" || process.env[envKey] === "1") {
      _envOverrides.set(key, true);
      log.warn(`[KillSwitch] Env override active: ${key} = ENABLED`);
    }
  }
}

loadEnvOverrides();

// ── DB loader (lazy import to avoid circular deps) ────────────────────────────

async function loadFromDb(key: KillSwitchKey): Promise<boolean> {
  try {
    const { db } = await import("../db");
    const { systemSettings } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, `kill_switch:${key}`))
      .limit(1);
    return row?.value === "true" || row?.value === "1";
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const KillSwitches = {
  /**
   * Returns true if the kill switch is active (module should stop accepting new work).
   * Env overrides take precedence. DB value is cached for 60s.
   */
  async isEnabled(key: KillSwitchKey): Promise<boolean> {
    // Env override: always enabled, never expires.
    if (_envOverrides.get(key) === true) {
      maybeLogActive(key);
      return true;
    }
    // all_automation env override implies all keys.
    if (_envOverrides.get("all_automation") === true) {
      maybeLogActive(key);
      return true;
    }

    // Cache check.
    const now = Date.now();
    const cached = _cache.get(key);
    if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
      if (cached.value) maybeLogActive(key);
      return cached.value;
    }

    // DB check (also check all_automation).
    const [isKey, isAll] = await Promise.all([
      loadFromDb(key),
      key !== "all_automation" ? loadFromDb("all_automation") : Promise.resolve(false),
    ]);
    const value = isKey || isAll;
    _cache.set(key, { value, loadedAt: now });
    if (value) maybeLogActive(key);
    return value;
  },

  /**
   * Synchronous check using only the cache (no DB hit).
   * Returns false if cache is cold (safe — just means no block).
   */
  isEnabledSync(key: KillSwitchKey): boolean {
    if (_envOverrides.get(key) === true) return true;
    if (_envOverrides.get("all_automation") === true) return true;
    const cached = _cache.get(key);
    return !!(cached && cached.value);
  },

  /**
   * Force-reload all kill switches from DB immediately (bypasses cache).
   * Call on startup to prime the cache.
   */
  async reload(): Promise<void> {
    await Promise.all(
      ALL_KEYS.map(async (key) => {
        const value = await loadFromDb(key);
        _cache.set(key, { value, loadedAt: Date.now() });
      }),
    );
    log.info(`[KillSwitches] Loaded from DB: ${ALL_KEYS.filter(k => _cache.get(k)?.value).join(", ") || "none active"}`);
  },

  /**
   * Set a kill switch value in the DB and update the local cache.
   */
  async set(key: KillSwitchKey, enabled: boolean): Promise<void> {
    try {
      const { db } = await import("../db");
      const { systemSettings } = await import("@shared/schema");
      await db
        .insert(systemSettings)
        .values({ key: `kill_switch:${key}`, value: String(enabled), updatedAt: new Date() } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: String(enabled), updatedAt: new Date() },
        });
      _cache.set(key, { value: enabled, loadedAt: Date.now() });
      log.info(`[KillSwitch] ${key} set to ${enabled} in DB`);
    } catch (err: any) {
      log.warn(`[KillSwitch] Failed to write ${key} to DB: ${err?.message}`);
    }
  },

  /**
   * Current state snapshot for dashboard.
   */
  getStatus(): Record<KillSwitchKey, { active: boolean; source: string }> {
    const result = {} as Record<KillSwitchKey, { active: boolean; source: string }>;
    for (const key of ALL_KEYS) {
      if (_envOverrides.get(key) || _envOverrides.get("all_automation")) {
        result[key] = { active: true, source: "env" };
      } else {
        const cached = _cache.get(key);
        result[key] = {
          active: cached?.value ?? false,
          source: cached ? "db" : "unchecked",
        };
      }
    }
    return result;
  },
};

function maybeLogActive(key: KillSwitchKey): void {
  if (!_loggedActive.has(key)) {
    _loggedActive.add(key);
    log.warn(`[KillSwitch] ${key} is ACTIVE — new work for this module is blocked`);
  }
}

export default KillSwitches;
