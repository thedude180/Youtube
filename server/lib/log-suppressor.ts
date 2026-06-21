/**
 * server/lib/log-suppressor.ts
 *
 * Phase 6 — Log Suppressor
 *
 * Deduplicates repeated error log lines. The first occurrence logs immediately.
 * Subsequent occurrences within a 10-minute window are counted but suppressed.
 * Every 10 minutes a summary fires: "[Suppressor] module: errorCode — N occurrences (last: target)"
 *
 * Key format: "${module}:${errorCode}:${targetId}"
 *
 * Wire into the error paths most prone to spam:
 *   - viral-optimizer deferred
 *   - quota breaker
 *   - token budget exhausted
 *   - yt-dlp failures
 *   - capability engine parse failures
 *   - AI queue full
 */

import { createLogger } from "./logger";

const _internalLog = createLogger("log-suppressor");

const SUMMARY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface SuppressEntry {
  count: number;
  firstAt: number;
  lastAt: number;
  lastMessage: string;
  lastTarget?: string;
  summaryTimer: ReturnType<typeof setTimeout> | null;
}

const _entries = new Map<string, SuppressEntry>();

function getOrCreate(key: string): SuppressEntry {
  let entry = _entries.get(key);
  if (!entry) {
    entry = {
      count: 0,
      firstAt: Date.now(),
      lastAt: Date.now(),
      lastMessage: "",
      lastTarget: undefined,
      summaryTimer: null,
    };
    _entries.set(key, entry);
  }
  return entry;
}

function scheduleSummary(key: string, module: string, errorCode: string): void {
  const entry = _entries.get(key);
  if (!entry || entry.summaryTimer) return;

  entry.summaryTimer = setTimeout(() => {
    const e = _entries.get(key);
    if (!e) return;
    if (e.count > 1) {
      _internalLog.warn(
        `[Suppressor] ${module}: ${errorCode} — ${e.count} occurrences suppressed in last 10 min (last: ${e.lastTarget ?? e.lastMessage.slice(0, 80)})`,
      );
    }
    // Reset for next window
    _entries.delete(key);
  }, SUMMARY_INTERVAL_MS);

  // Don't prevent Node from exiting
  if (entry.summaryTimer && typeof (entry.summaryTimer as any).unref === "function") {
    (entry.summaryTimer as any).unref();
  }
}

function _suppress(
  level: "warn" | "error",
  key: string,
  message: string,
  data?: Record<string, unknown>,
  target?: string,
): void {
  const entry = getOrCreate(key);
  entry.count++;
  entry.lastAt = Date.now();
  entry.lastMessage = message;
  if (target) entry.lastTarget = target;

  const parts = key.split(":");
  const module = parts[0] ?? key;
  const errorCode = parts[1] ?? "UNKNOWN";

  if (entry.count === 1) {
    // First occurrence — log immediately
    const payload = {
      level,
      module,
      message,
      ...(data ? { meta: data } : {}),
    };
    if (level === "warn") {
      console.warn(JSON.stringify(payload));
    } else {
      console.error(JSON.stringify(payload));
    }
    scheduleSummary(key, module, errorCode);
  }
  // Subsequent occurrences within the 10-min window are silently counted.
}

export const LogSuppressor = {
  /**
   * Suppress-after-first warning log.
   * @param key   "${module}:${errorCode}:${targetId}"
   * @param message  Human-readable log line
   * @param data     Optional structured data (only logged on first occurrence)
   * @param target   Short description of the subject (for summary line)
   */
  warn(key: string, message: string, data?: Record<string, unknown>, target?: string): void {
    _suppress("warn", key, message, data, target);
  },

  /**
   * Suppress-after-first error log.
   */
  error(key: string, message: string, data?: Record<string, unknown>, target?: string): void {
    _suppress("error", key, message, data, target);
  },

  /**
   * Force-emit a summary for all active suppressions (for diagnostics).
   */
  flushSummary(): void {
    for (const [key, entry] of _entries) {
      if (entry.count > 1) {
        const parts = key.split(":");
        _internalLog.warn(
          `[Suppressor] ${parts[0]}: ${parts[1]} — ${entry.count} total occurrences (last: ${entry.lastTarget ?? entry.lastMessage.slice(0, 80)})`,
        );
      }
    }
  },

  /**
   * Current suppression state snapshot for dashboard.
   */
  getStats(): Array<{ key: string; count: number; firstAt: number; lastAt: number }> {
    return Array.from(_entries.entries()).map(([key, e]) => ({
      key,
      count: e.count,
      firstAt: e.firstAt,
      lastAt: e.lastAt,
    }));
  },

  /**
   * Clear all entries (for testing).
   */
  reset(): void {
    for (const entry of _entries.values()) {
      if (entry.summaryTimer) clearTimeout(entry.summaryTimer);
    }
    _entries.clear();
  },
};

export default LogSuppressor;
