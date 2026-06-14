/**
 * system-telemetry.ts
 *
 * Records internal system events (quota trips, AI queue saturation, token
 * failures, vault issues, rate limits) to learning_insights so the learning
 * brain can detect patterns and generate scheduling/capacity recommendations.
 *
 * Design rules:
 *  - Auto-resolves userId from the primary YouTube channel (cached after first
 *    successful lookup — channel ownership never changes at runtime).
 *  - Per-event-type 30-minute debounce prevents spam during outage storms.
 *  - All calls are fire-and-forget — never throws, safe to call from hot paths
 *    without await.
 *  - Enriches every event with Pacific-hour context so the brain can detect
 *    time-of-day patterns (e.g., "quota trips at 11am Pacific on 4/5 days").
 */

import { db } from "../db";
import { channels } from "@shared/schema";
import { isNotNull } from "drizzle-orm";
import { recordOutcome } from "./outcome-recorder";
import { createLogger } from "./logger";

const logger = createLogger("system-telemetry");

// ── userId cache ───────────────────────────────────────────────────────────────
let _cachedUserId: string | null = null;

async function getPrimaryUserId(): Promise<string | null> {
  if (_cachedUserId) return _cachedUserId;
  try {
    const [ch] = await db
      .select({ userId: channels.userId })
      .from(channels)
      .where(isNotNull(channels.accessToken))
      .limit(1);
    if (ch?.userId) {
      _cachedUserId = ch.userId;
      return ch.userId;
    }
  } catch { /* non-fatal */ }
  return null;
}

// ── Per-event debounce (30 min) ────────────────────────────────────────────────
const _lastEventMs = new Map<string, number>();
const DEBOUNCE_MS = 30 * 60 * 1000;

function isDebounced(eventKey: string): boolean {
  const last = _lastEventMs.get(eventKey) ?? 0;
  if (Date.now() - last < DEBOUNCE_MS) return true;
  _lastEventMs.set(eventKey, Date.now());
  return false;
}

// ── Pacific hour helper ────────────────────────────────────────────────────────
function getPacificHour(): number {
  try {
    const s = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    });
    return parseInt(s, 10);
  } catch { return -1; }
}

/**
 * Record a system-level event to learning_insights.
 *
 * Safe to call fire-and-forget from any hot path:
 *   recordSystemEvent({ engine: "quota-tracker", event: "quota_trip", ... }).catch(() => {});
 */
export async function recordSystemEvent(opts: {
  engine: string;
  event: string;
  summary: string;
  metrics?: Record<string, number | string | boolean | null | undefined>;
  recommendation?: string;
  debounce?: boolean;
}): Promise<void> {
  try {
    const debounce = opts.debounce !== false;
    if (debounce && isDebounced(`${opts.engine}:${opts.event}`)) return;

    const userId = await getPrimaryUserId();
    if (!userId) return;

    await recordOutcome({
      engine:   opts.engine,
      userId,
      category: `system_telemetry:${opts.event}`,
      summary:  opts.summary,
      metrics: {
        ...opts.metrics,
        pacificHour: getPacificHour(),
        eventEpochMs: Date.now(),
      },
      confidence:     0.92,
      recommendation: opts.recommendation ?? "Monitor for recurring patterns",
    });
  } catch (err: any) {
    logger.debug(`[SystemTelemetry] Non-fatal write failure: ${err?.message?.slice(0, 80)}`);
  }
}
