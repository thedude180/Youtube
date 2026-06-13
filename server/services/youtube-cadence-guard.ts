/**
 * youtube-cadence-guard.ts
 *
 * Ensures the 3 Shorts/day + 1 long-form/day cadence is maintained and that
 * leftover daily quota is used to pre-queue next-day content.
 *
 * Responsibilities:
 *   1. Rebalancer — moves excess items from over-stocked days to under-stocked
 *      days within a 21-day rolling horizon.
 *   2. Pre-queue fill — if the next 3 days have fewer than 9 Shorts total
 *      (3/day avg), triggers the back-catalog runner to mine more content.
 *
 * Runs on boot (after publishers initialise) then every 6 hours.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import { isProductionAutomationAllowed } from "../lib/production-guard";

const log = createLogger("cadence-guard");

// ── Constants ────────────────────────────────────────────────────────────────
const SHORTS_PER_DAY   = 3;
const LONGFORM_PER_DAY = 1;
const REBALANCE_HORIZON = 21; // days to look ahead when rebalancing
const PREFILL_HORIZON   = 3;  // days to check for thin queue
const PREFILL_THRESHOLD = SHORTS_PER_DAY * PREFILL_HORIZON; // 9 shorts

// UTC hour targets for short slots (spread across day)
const SHORT_SLOT_HOURS = [16, 21, 23.5]; // 09:00, 14:00, 16:30 PDT
const LONGFORM_SLOT_HOUR = 23;           // 16:00 PDT

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateToIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDayOffset(baseIso: string, n: number): string {
  const d = new Date(baseIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function slotTimestamp(dayIso: string, slotHour: number): Date {
  const [y, mo, day] = dayIso.split("-").map(Number);
  const base = Date.UTC(y, mo - 1, day);
  const jitter = Math.floor(Math.random() * 10 * 60_000); // up to 10 min jitter
  return new Date(base + slotHour * 3_600_000 + jitter);
}

// ── Core rebalancer ──────────────────────────────────────────────────────────

interface RebalanceResult {
  shortsRebalanced: number;
  longFormRebalanced: number;
  scheduleReport: string;
}

async function rebalanceForUser(userId: string): Promise<RebalanceResult> {
  const now = new Date();
  const todayIso = dateToIsoDay(now);

  // ── 1. Fetch all future Shorts ──────────────────────────────────────────
  const shortsRaw = await db.execute(sql`
    SELECT id, scheduled_at
    FROM autopilot_queue
    WHERE status IN ('scheduled', 'pending')
      AND user_id = ${userId}
      AND target_platform = 'youtube'
      AND (
        type IN ('youtube_short', 'platform_short', 'vod-short')
        OR (
          type = 'auto-clip'
          AND COALESCE(metadata->>'contentType', '') NOT IN
              ('long-form', 'long-form-clip', 'vod_long_form', 'long-form-compilation')
        )
      )
      AND scheduled_at >= CURRENT_TIMESTAMP
    ORDER BY scheduled_at ASC, id ASC
  `);
  const shorts = ((shortsRaw as any).rows ?? []) as Array<{ id: number; scheduled_at: string }>;

  // Group by UTC day
  const shortsByDay = new Map<string, Array<number>>(); // day → item ids
  for (const s of shorts) {
    const day = dateToIsoDay(new Date(s.scheduled_at));
    if (!shortsByDay.has(day)) shortsByDay.set(day, []);
    shortsByDay.get(day)!.push(Number(s.id));
  }

  // Collect excess items (items at rank > SHORTS_PER_DAY on their day)
  const excessShortIds: number[] = [];
  for (const [, ids] of shortsByDay) {
    if (ids.length > SHORTS_PER_DAY) {
      excessShortIds.push(...ids.slice(SHORTS_PER_DAY));
    }
  }

  // Assign excess to the next under-stocked days in the 21-day horizon
  let shortsMoved = 0;
  let excessIdx = 0;
  for (let d = 0; d < REBALANCE_HORIZON && excessIdx < excessShortIds.length; d++) {
    const dayIso = utcDayOffset(todayIso, d + 1); // start from tomorrow
    const existing = shortsByDay.get(dayIso)?.length ?? 0;
    for (
      let slot = existing;
      slot < SHORTS_PER_DAY && excessIdx < excessShortIds.length;
      slot++
    ) {
      const itemId = excessShortIds[excessIdx++];
      const newTime = slotTimestamp(dayIso, SHORT_SLOT_HOURS[slot] ?? 23.5);
      try {
        await db.execute(sql`
          UPDATE autopilot_queue
          SET scheduled_at = ${newTime}
          WHERE id = ${itemId}
            AND status IN ('scheduled', 'pending')
        `);
        // Update in-memory map so subsequent iterations see the move
        if (!shortsByDay.has(dayIso)) shortsByDay.set(dayIso, []);
        shortsByDay.get(dayIso)!.push(itemId);
        shortsMoved++;
      } catch { /* non-fatal */ }
    }
  }

  // ── 2. Fetch all future long-form ───────────────────────────────────────
  const lfRaw = await db.execute(sql`
    SELECT id, scheduled_at
    FROM autopilot_queue
    WHERE status IN ('scheduled', 'pending')
      AND user_id = ${userId}
      AND target_platform = 'youtube'
      AND (
        type = 'vod-long-form'
        OR (
          type = 'auto-clip'
          AND metadata->>'contentType' IN
              ('long-form', 'long-form-clip', 'vod_long_form', 'long-form-compilation')
        )
      )
      AND scheduled_at >= CURRENT_TIMESTAMP
    ORDER BY scheduled_at ASC, id ASC
  `);
  const longForms = ((lfRaw as any).rows ?? []) as Array<{ id: number; scheduled_at: string }>;

  const lfByDay = new Map<string, Array<number>>();
  for (const lf of longForms) {
    const day = dateToIsoDay(new Date(lf.scheduled_at));
    if (!lfByDay.has(day)) lfByDay.set(day, []);
    lfByDay.get(day)!.push(Number(lf.id));
  }

  const excessLFIds: number[] = [];
  for (const [, ids] of lfByDay) {
    if (ids.length > LONGFORM_PER_DAY) {
      excessLFIds.push(...ids.slice(LONGFORM_PER_DAY));
    }
  }

  let lfMoved = 0;
  let lfExcessIdx = 0;
  for (let d = 0; d < REBALANCE_HORIZON && lfExcessIdx < excessLFIds.length; d++) {
    const dayIso = utcDayOffset(todayIso, d + 1);
    const existing = lfByDay.get(dayIso)?.length ?? 0;
    if (existing < LONGFORM_PER_DAY) {
      const itemId = excessLFIds[lfExcessIdx++];
      const newTime = slotTimestamp(dayIso, LONGFORM_SLOT_HOUR);
      try {
        await db.execute(sql`
          UPDATE autopilot_queue
          SET scheduled_at = ${newTime}
          WHERE id = ${itemId}
            AND status IN ('scheduled', 'pending')
        `);
        if (!lfByDay.has(dayIso)) lfByDay.set(dayIso, []);
        lfByDay.get(dayIso)!.push(itemId);
        lfMoved++;
      } catch { /* non-fatal */ }
    }
  }

  // ── 3. Build a short schedule report for the next 7 days ───────────────
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const dayIso = utcDayOffset(todayIso, d);
    const s = shortsByDay.get(dayIso)?.length ?? 0;
    const lf = lfByDay.get(dayIso)?.length ?? 0;
    const sIcon  = s  >= SHORTS_PER_DAY   ? "✓" : s > 0 ? "~" : "✗";
    const lfIcon = lf >= LONGFORM_PER_DAY ? "✓" : "✗";
    lines.push(`  ${dayIso}: ${s}/${SHORTS_PER_DAY} shorts${sIcon}  ${lf}/${LONGFORM_PER_DAY} long-form${lfIcon}`);
  }

  return {
    shortsRebalanced: shortsMoved,
    longFormRebalanced: lfMoved,
    scheduleReport: lines.join("\n"),
  };
}

// ── Quota-aware pre-fill ─────────────────────────────────────────────────────

async function prefillIfThin(userId: string): Promise<void> {
  try {
    // Count scheduled Shorts for the next PREFILL_HORIZON days
    const cntRaw = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM autopilot_queue
      WHERE status IN ('scheduled', 'pending')
        AND user_id = ${userId}
        AND target_platform = 'youtube'
        AND (
          type IN ('youtube_short', 'platform_short', 'vod-short')
          OR (
            type = 'auto-clip'
            AND COALESCE(metadata->>'contentType', '') NOT IN
                ('long-form', 'long-form-clip', 'vod_long_form', 'long-form-compilation')
          )
        )
        AND scheduled_at >= CURRENT_TIMESTAMP
        AND scheduled_at < CURRENT_TIMESTAMP + (${PREFILL_HORIZON} * INTERVAL '1 day')
    `);
    const cnt = Number(((cntRaw as any).rows?.[0] as Record<string, unknown>)?.cnt ?? 0);

    if (cnt >= PREFILL_THRESHOLD) {
      log.info(
        `[CadenceGuard] Next ${PREFILL_HORIZON}-day short queue healthy ` +
        `(${cnt}/${PREFILL_THRESHOLD})`,
      );
      return;
    }

    log.info(
      `[CadenceGuard] Next ${PREFILL_HORIZON}-day short queue thin ` +
      `(${cnt}/${PREFILL_THRESHOLD}) — triggering back-catalog mining to fill gaps`,
    );

    const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
    await runBackCatalogForAllEligibleUsers();
  } catch (err: unknown) {
    log.warn(`[CadenceGuard] prefillIfThin failed (non-fatal): ${(err as Error)?.message}`);
  }
}

// ── Main cycle ───────────────────────────────────────────────────────────────

export async function runCadenceGuardCycle(): Promise<void> {
  try {
    const users = await storage.getAllUsers();
    for (const user of users) {
      if (!isProductionAutomationAllowed(user.id).allowed) continue;

      const { shortsRebalanced, longFormRebalanced, scheduleReport } =
        await rebalanceForUser(user.id);

      if (shortsRebalanced > 0 || longFormRebalanced > 0) {
        log.info(
          `[CadenceGuard] Rebalanced user ${user.id.slice(0, 8)}: ` +
          `${shortsRebalanced} shorts + ${longFormRebalanced} long-form moved\n` +
          `7-day schedule after rebalance:\n${scheduleReport}`,
        );
      } else {
        log.info(
          `[CadenceGuard] Schedule already balanced for ${user.id.slice(0, 8)}\n` +
          `7-day schedule:\n${scheduleReport}`,
        );
      }

      // After rebalancing, check if the next 3 days are sufficiently pre-queued.
      // If thin, fire the back-catalog engine to mine more content using leftover quota.
      await prefillIfThin(user.id);
    }
  } catch (err: unknown) {
    log.warn(`[CadenceGuard] Cycle error (non-fatal): ${(err as Error)?.message}`);
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let _guardTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the cadence guard.
 * Runs one immediate cycle then every 6 hours.
 * Returns the interval handle so index.ts can push it to backgroundIntervals.
 */
export function initCadenceGuard(): ReturnType<typeof setInterval> {
  if (_guardTimer) return _guardTimer;

  // Immediate first run
  runCadenceGuardCycle().catch(err =>
    log.warn(`[CadenceGuard] Boot cycle failed (non-fatal): ${(err as Error)?.message}`),
  );

  _guardTimer = setInterval(
    () =>
      runCadenceGuardCycle().catch(err =>
        log.warn(`[CadenceGuard] Interval cycle failed (non-fatal): ${(err as Error)?.message}`),
      ),
    6 * 3_600_000, // every 6 hours
  );

  return _guardTimer;
}
