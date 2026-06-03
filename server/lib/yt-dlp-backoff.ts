/**
 * server/lib/yt-dlp-backoff.ts
 *
 * Fix #4 — yt-dlp Video IDs That Consistently Timeout Block the Download Queue
 *
 * PROBLEM: Video IDs that consistently time out keep hitting the front of the
 * queue at full priority every cycle:
 *   3Dw4UB86S9g timed out 480s — queued 4 times across 4 sessions
 *
 * Each 480s timeout blocks the yt-dlp gate slot for 8 minutes, starving
 * other downloads.
 *
 * SOLUTION: Escalating backoff tracker keyed by video ID + failure type.
 * Consecutive failures for the same video ID get exponentially longer
 * cooldowns. Persisted to DB so backoff survives reboots.
 */
import { createLogger } from "./logger";
import { storage }       from "../storage";

const log = createLogger("yt-dlp-backoff");

// ─── Backoff config ───────────────────────────────────────────────────────────
type FailureType = "timeout" | "format_unavailable" | "network_error" | "unknown";

// Durations in milliseconds, indexed by consecutive fail count (0-based, capped at last entry)
const BACKOFF_SCHEDULE_MS: Record<FailureType, number[]> = {
  timeout:           [ 2, 6, 24, 48, 168].map(h => h * 3600 * 1000),
  format_unavailable:[ 24, 72, 168, 336, 720].map(h => h * 3600 * 1000),
  network_error:     [ 1, 2, 6, 24, 48].map(h => h * 3600 * 1000),
  unknown:           [ 4, 12, 48, 72, 168].map(h => h * 3600 * 1000),
};

// ─── In-memory failure tracking ───────────────────────────────────────────────
interface BackoffEntry {
  youtubeId:       string;
  failureType:     FailureType;
  consecutiveFails:number;
  retryAfter:      Date;
  lastFailureAt:   Date;
}

const backoffMap = new Map<string, BackoffEntry>();

// ─── Error classifier ─────────────────────────────────────────────────────────
export function classifyYtDlpError(errorMessage: string): FailureType {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("timed out") || msg.includes("timeout"))            return "timeout";
  if (msg.includes("requested format is not available") || msg.includes("format"))
    return "format_unavailable";
  if (msg.includes("network") || msg.includes("connection") || msg.includes("econnreset"))
    return "network_error";
  return "unknown";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call when a yt-dlp download fails for a video ID.
 * Returns the next retry time.
 */
export async function recordYtDlpFailure(
  youtubeId:    string,
  errorMessage: string,
): Promise<Date> {
  const failureType     = classifyYtDlpError(errorMessage);
  const existing        = backoffMap.get(youtubeId);
  const consecutiveFails = existing ? existing.consecutiveFails + 1 : 1;
  const scheduleIndex   = Math.min(consecutiveFails - 1, BACKOFF_SCHEDULE_MS[failureType].length - 1);
  const backoffMs       = BACKOFF_SCHEDULE_MS[failureType][scheduleIndex];
  const retryAfter      = new Date(Date.now() + backoffMs);

  const entry: BackoffEntry = { youtubeId, failureType, consecutiveFails, retryAfter, lastFailureAt: new Date() };
  backoffMap.set(youtubeId, entry);

  const backoffHours = Math.round(backoffMs / 3_600_000 * 10) / 10;
  log.warn(
    `[YtDlpBackoff] ${youtubeId} failed (${failureType}) — ` +
    `consecutive fail #${consecutiveFails} — ` +
    `next retry in ${backoffHours}h at ${retryAfter.toISOString()}`
  );

  await persistBackoff(youtubeId, entry);
  return retryAfter;
}

/**
 * Check if a video ID is currently in backoff.
 * Call before attempting a yt-dlp download.
 */
export async function isYtDlpBlocked(youtubeId: string): Promise<{
  blocked:    boolean;
  retryAfter: Date | null;
  reason:     string | null;
}> {
  const inMemory = backoffMap.get(youtubeId);
  if (inMemory && inMemory.retryAfter > new Date()) {
    return {
      blocked:    true,
      retryAfter: inMemory.retryAfter,
      reason:     `${inMemory.failureType} (fail #${inMemory.consecutiveFails})`,
    };
  }

  const dbEntry = await loadBackoff(youtubeId);
  if (dbEntry && dbEntry.retryAfter > new Date()) {
    backoffMap.set(youtubeId, dbEntry);
    return {
      blocked:    true,
      retryAfter: dbEntry.retryAfter,
      reason:     `${dbEntry.failureType} (fail #${dbEntry.consecutiveFails}, persisted)`,
    };
  }

  return { blocked: false, retryAfter: null, reason: null };
}

/**
 * Call when a download succeeds — clears the backoff for that video ID.
 */
export async function clearYtDlpBackoff(youtubeId: string): Promise<void> {
  if (backoffMap.has(youtubeId)) {
    backoffMap.delete(youtubeId);
    log.info(`[YtDlpBackoff] ${youtubeId} succeeded — backoff cleared`);
    await clearPersistedBackoff(youtubeId);
  }
}

// ─── DB persistence helpers ───────────────────────────────────────────────────
async function persistBackoff(youtubeId: string, entry: BackoffEntry): Promise<void> {
  try {
    await storage.setYtDlpBackoff(youtubeId, {
      failureType:      entry.failureType,
      consecutiveFails: entry.consecutiveFails,
      retryAfterIso:    entry.retryAfter.toISOString(),
      lastFailureIso:   entry.lastFailureAt.toISOString(),
    });
  } catch (err) {
    log.warn(`[YtDlpBackoff] Failed to persist backoff for ${youtubeId}:`, err);
  }
}

async function loadBackoff(youtubeId: string): Promise<BackoffEntry | null> {
  try {
    const raw = await storage.getYtDlpBackoff(youtubeId);
    if (!raw) return null;
    return {
      youtubeId,
      failureType:      raw.failureType as FailureType,
      consecutiveFails: raw.consecutiveFails,
      retryAfter:       new Date(raw.retryAfterIso),
      lastFailureAt:    new Date(raw.lastFailureIso),
    };
  } catch {
    return null;
  }
}

async function clearPersistedBackoff(youtubeId: string): Promise<void> {
  try {
    await storage.deleteYtDlpBackoff(youtubeId);
  } catch { /* silent */ }
}
