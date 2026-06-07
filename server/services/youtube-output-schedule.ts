/**
 * youtube-output-schedule.ts
 *
 * Shared scheduling helper for YouTube-only output cadence.
 *
 * Cadence rules:
 *   Shorts  — max 3 / local calendar day
 *     Window 1: 07:00–09:30  target 08:00
 *     Window 2: 13:00–16:30  target 14:30
 *     Window 3: 20:30–23:00  target 21:30
 *     Min gap between Shorts: 5.5 hours
 *
 *   Long-form — max 1 / local calendar day
 *     Window: 17:30–19:30  target 18:30
 *     Min gap between long-form uploads: 20 hours
 *
 *   Shared:
 *     Max 4 total uploads / local calendar day
 *     Min 90 minutes between any two uploads
 *     Jitter: 7–28 min inside window (prefer stable slots)
 *     Never schedule > 14 days out unless backlog requires it
 *
 * Timezone: user/channel configured → fallback America/Chicago.
 * All returned Dates are UTC — pass directly to YouTube API publishAt.
 */

import { db, pool } from "../db";
import { autopilotQueue, channels, shortSlotClaims } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, inArray, lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("yt-schedule");

// ── Concurrent Short-slot serialization ──────────────────────────────────────
//
// Three independent engines (relentless-content-grinder,
// youtube-back-catalog-engine, youtube-output-scheduler) can call
// getNextShortPublishTime() simultaneously.  Without serialization both
// callers would read the same "empty" DB state and return the same window.
//
// Protection is four-layered (outermost → innermost):
//
// 1. Per-user in-process async mutex (Promise queue)
//    Fast-path: serializes concurrent calls within this Node process without
//    any DB round-trips.  Call 2 waits until Call 1 has fully returned so it
//    always reads a fresh reservation map.
//
// 2. PostgreSQL advisory lock — pg_advisory_lock(CLASS, userKey)
//    Session-level DB lock: acquired on a dedicated pool client.  Serializes
//    across multiple Node processes or external writers that share the DB.
//    Held for the duration of the slot-search and released after the DB claim
//    INSERT succeeds.
//
// 3. DB claim table — short_slot_claims (THE durable guarantee)
//    Attempting to claim a window performs:
//      INSERT INTO short_slot_claims (userId, windowKey, claimedSlot, expiresAt)
//      VALUES (...) ON CONFLICT DO NOTHING RETURNING id
//    The UNIQUE index on (userId, windowKey) is the atomic DB-level safety net.
//    If two processes race past the advisory lock, the unique constraint ensures
//    exactly one INSERT wins.  The loser gets 0 rows back and tries the next
//    window.  Claim rows expire after 10 min and are purged on startup.
//
// 4. In-process slot reservation map (secondary / defense-in-depth)
//    Records chosen slots with a 5-min TTL.  Merged (deduplicated) into DB row
//    sets so collision checks treat in-flight slots as already taken.  Provides
//    an extra safety net for callers that bypass the advisory lock.

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Arbitrary namespace so advisory locks don't collide with other table names. */
const ADVISORY_LOCK_CLASS = 20260517;

/**
 * Hash a userId string to a signed int32 for pg_advisory_lock's 2nd param.
 * Uses FNV-1a.  Collisions are harmless (just extra serialization, no bugs).
 */
function userIdToLockKey(userId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) | 0;
  }
  return h;
}

/** Build the DB claim key for a (userId, day, windowIndex) triple. */
function makeWindowKey(userId: string, day: LocalDay, winIdx: number): string {
  const mo = String(day.mo).padStart(2, "0");
  const dy = String(day.dy).padStart(2, "0");
  return `${userId}:${day.y}-${mo}-${dy}:W${winIdx}`;
}

/** Deduplicate an array of Dates by epoch millisecond value. */
function dedupDates(dates: Date[]): Date[] {
  const seen = new Set<number>();
  return dates.filter(d => {
    const ms = d.getTime();
    if (seen.has(ms)) return false;
    seen.add(ms);
    return true;
  });
}

// ── 1. Per-user in-process async mutex ───────────────────────────────────────

const _shortMutexTails = new Map<string, Promise<void>>();

async function withShortScheduleMutex<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prevTail = _shortMutexTails.get(userId) ?? Promise.resolve();
  let myRelease!: () => void;
  const myCompletion = new Promise<void>(r => { myRelease = r; });
  _shortMutexTails.set(userId, myCompletion);
  await prevTail;
  try {
    return await fn();
  } finally {
    myRelease();
    if (_shortMutexTails.get(userId) === myCompletion) _shortMutexTails.delete(userId);
  }
}

// ── 2. PostgreSQL advisory lock ───────────────────────────────────────────────

async function withShortAdvisoryLock<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = userIdToLockKey(userId);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [ADVISORY_LOCK_CLASS, key]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [ADVISORY_LOCK_CLASS, key])
        .catch(() => { /* auto-releases on disconnect */ });
    }
  } finally {
    client.release();
  }
}

// ── 3. DB claim table helpers ─────────────────────────────────────────────────

const CLAIM_TTL_MS = 2 * 3_600_000; // 2 hours — must outlive the longest upload batch

/**
 * Attempt to atomically claim a scheduling window in the DB.
 * Returns the inserted id if the claim succeeded, null if the window was
 * already claimed by another caller (unique conflict → 0 rows back).
 */
async function claimShortWindow(
  userId: string,
  windowKey: string,
  claimedSlot: Date,
): Promise<number | null> {
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
  const result = await db.execute(
    sql`INSERT INTO short_slot_claims (user_id, window_key, claimed_slot, expires_at)
        VALUES (${userId}, ${windowKey}, ${claimedSlot}, ${expiresAt})
        ON CONFLICT DO NOTHING
        RETURNING id`,
  );
  return result.rows.length > 0 ? (result.rows[0].id as number) : null;
}

/**
 * Fetch the set of windowKeys that are already claimed (non-expired) for a
 * given user and local day.  Used to skip windows before even computing a
 * candidate, reducing unnecessary INSERT attempts.
 */
async function getClaimedWindowsForDay(
  userId: string,
  day: LocalDay,
): Promise<Set<string>> {
  const prefix = `${userId}:${day.y}-${String(day.mo).padStart(2, "0")}-${String(day.dy).padStart(2, "0")}:`;
  const now = new Date();
  const rows = await db
    .select({ windowKey: shortSlotClaims.windowKey })
    .from(shortSlotClaims)
    .where(and(
      eq(shortSlotClaims.userId, userId),
      sql`${shortSlotClaims.windowKey} LIKE ${prefix + "%"}`,
      gte(shortSlotClaims.expiresAt, now),
    ));
  return new Set(rows.map(r => r.windowKey));
}

/**
 * Delete expired claim rows.  Call once on startup to keep the table lean.
 * Errors are swallowed — a full table is safe (claims are checked by expiresAt).
 */
export async function purgeExpiredShortSlotClaims(): Promise<void> {
  try {
    await db.delete(shortSlotClaims).where(lt(shortSlotClaims.expiresAt, new Date()));
    logger.debug("[YouTubeSchedule] Purged expired short_slot_claims");
  } catch (e) {
    logger.warn("[YouTubeSchedule] purgeExpiredShortSlotClaims failed (non-fatal)", { error: String(e) });
  }
}

// ── 4. In-process slot reservation map ───────────────────────────────────────

interface SlotReservation {
  slot: Date;
  expires: number;
}

const _shortSlotReservations = new Map<string, SlotReservation[]>();

function getActiveShortReservations(userId: string): Date[] {
  const now = Date.now();
  const list = (_shortSlotReservations.get(userId) ?? []).filter(r => r.expires > now);
  if (list.length === 0) _shortSlotReservations.delete(userId);
  else _shortSlotReservations.set(userId, list);
  return list.map(r => r.slot);
}

function reserveShortSlot(userId: string, slot: Date): void {
  const list = _shortSlotReservations.get(userId) ?? [];
  list.push({ slot, expires: Date.now() + 2 * 3_600_000 }); // 2h — matches CLAIM_TTL_MS
  _shortSlotReservations.set(userId, list);
}

// ── Public constants (re-exported for publisher enforcement) ─────────────────
export const MAX_SHORTS_PER_DAY = 3;
export const MAX_LONGFORM_PER_DAY = 1;

// ── Internal constants ───────────────────────────────────────────────────────
const MAX_TOTAL_PER_DAY = 4;
const MIN_SHORT_GAP_MS   = 5.5 * 3_600_000;   // 5h 30 min
const MIN_LONGFORM_GAP_MS = 20 * 3_600_000;   // 20 hours
const MIN_ANY_GAP_MS     = 90 * 60_000;        // 90 minutes
const JITTER_MIN_MS      = 7  * 60_000;        // 7 minutes
const JITTER_MAX_MS      = 28 * 60_000;        // 28 minutes
const MAX_DAYS_AHEAD     = 14;  // Never schedule more than 14 days out — keeps the queue nimble
const DEFAULT_TZ         = "America/Chicago";

// ── Window definitions (local time) ─────────────────────────────────────────
const SHORTS_WINDOWS = [
  { startH:  7, startM:  0, endH:  9, endM: 30, targetH:  8, targetM:  0 },
  { startH: 13, startM:  0, endH: 16, endM: 30, targetH: 14, targetM: 30 },
  { startH: 20, startM: 30, endH: 23, endM:  0, targetH: 21, targetM: 30 },
] as const;

const LONGFORM_WINDOW = {
  startH: 17, startM: 30, endH: 19, endM: 30, targetH: 18, targetM: 30,
} as const;

// ── Timezone helpers ─────────────────────────────────────────────────────────

function isValidTz(tz: string): boolean {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
  catch { return false; }
}

async function getUserTz(userId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ platformData: channels.platformData })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1);
    const raw = row?.platformData as any;
    const tz: string | undefined = raw?.timezone ?? raw?.userTimezone;
    if (tz && isValidTz(tz)) return tz;
  } catch { /* fallthrough */ }
  return DEFAULT_TZ;
}

/**
 * Convert a local hour:minute on a given local calendar date to a UTC Date.
 * Uses one-step Intl correction — accurate for all standard IANA timezone offsets.
 */
function localHmToUtc(
  tz: string,
  year: number, month: number, day: number,
  localH: number, localM: number,
): Date {
  const rough = new Date(Date.UTC(year, month - 1, day, localH, localM, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(rough);
  const gotH = parseInt(parts.find(p => p.type === "hour")!.value, 10);
  const gotM = parseInt(parts.find(p => p.type === "minute")!.value, 10);
  const want = localH * 60 + localM;
  let got  = (gotH === 24 ? 0 : gotH) * 60 + gotM;
  let diff = want - got;
  if (diff >  720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return new Date(rough.getTime() - diff * 60_000);
}

/** Return local {y, mo, dy} for a UTC instant in the given timezone. */
function getLocalDay(tz: string, d: Date = new Date()): { y: number; mo: number; dy: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const [y, mo, dy] = s.split("-").map(Number);
  return { y, mo, dy };
}

/** Add n calendar days to a local day (handles month/year roll via UTC noon). */
function offsetDay(
  tz: string,
  { y, mo, dy }: { y: number; mo: number; dy: number },
  n: number,
): { y: number; mo: number; dy: number } {
  const noon = localHmToUtc(tz, y, mo, dy, 12, 0);
  return getLocalDay(tz, new Date(noon.getTime() + n * 86_400_000));
}

/** Add random jitter clamped inside the window around the target. */
function withJitter(target: Date, winStart: Date, winEnd: Date): Date {
  const j   = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
  const raw = new Date(target.getTime() + j);
  return new Date(Math.min(Math.max(raw.getTime(), winStart.getTime()), winEnd.getTime()));
}

// ── DB query helpers ─────────────────────────────────────────────────────────

type LocalDay = { y: number; mo: number; dy: number };

function dayBounds(tz: string, day: LocalDay): { start: Date; end: Date } {
  return {
    start: localHmToUtc(tz, day.y, day.mo, day.dy,  0,  1),
    end:   localHmToUtc(tz, day.y, day.mo, day.dy, 23, 59),
  };
}

async function getUploadsOnDay(userId: string, tz: string, day: LocalDay): Promise<Date[]> {
  const { start, end } = dayBounds(tz, day);
  const rows = await db
    .select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "processing", "published"]),
      gte(autopilotQueue.scheduledAt, start),
      lte(autopilotQueue.scheduledAt, end),
    ));
  return rows
    .filter(r => r.scheduledAt != null)
    .map(r => new Date(r.scheduledAt!))
    .sort((a, b) => a.getTime() - b.getTime());
}

async function getShortsOnDay(userId: string, tz: string, day: LocalDay): Promise<Date[]> {
  const { start, end } = dayBounds(tz, day);
  const rows = await db
    .select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "processing", "published"]),
      inArray(autopilotQueue.type, ["youtube_short", "platform_short"]),
      gte(autopilotQueue.scheduledAt, start),
      lte(autopilotQueue.scheduledAt, end),
    ));
  return rows
    .filter(r => r.scheduledAt != null)
    .map(r => new Date(r.scheduledAt!))
    .sort((a, b) => a.getTime() - b.getTime());
}

async function getLongFormOnDay(userId: string, tz: string, day: LocalDay): Promise<Date[]> {
  const { start, end } = dayBounds(tz, day);
  const rows = await db
    .select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "processing", "published"]),
      sql`${autopilotQueue.metadata}->>'contentType' = 'long-form-clip'`,
      gte(autopilotQueue.scheduledAt, start),
      lte(autopilotQueue.scheduledAt, end),
    ));
  return rows
    .filter(r => r.scheduledAt != null)
    .map(r => new Date(r.scheduledAt!))
    .sort((a, b) => a.getTime() - b.getTime());
}

async function getLastScheduledShortTime(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "processing", "published"]),
      inArray(autopilotQueue.type, ["youtube_short", "platform_short"]),
    ))
    .orderBy(desc(autopilotQueue.scheduledAt))
    .limit(1);
  return row?.scheduledAt ? new Date(row.scheduledAt) : null;
}

async function getLastScheduledLongFormTime(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "processing", "published"]),
      sql`${autopilotQueue.metadata}->>'contentType' = 'long-form-clip'`,
    ))
    .orderBy(desc(autopilotQueue.scheduledAt))
    .limit(1);
  return row?.scheduledAt ? new Date(row.scheduledAt) : null;
}

// ── Saturation cache ─────────────────────────────────────────────────────────
// When all available windows for the next MAX_DAYS_AHEAD days are claimed, the
// full day-by-day scan (14 days × 3 DB round-trips = 42 queries) fires for
// every caller before giving up.  With 9+ concurrent callers this saturates the
// DB connection pool, stalls the event loop, and causes health-check timeouts.
//
// Solution: when getNextShortPublishTime exhausts all 14 days, cache the
// "saturated" state per user for SATURATION_CACHE_TTL_MS.  Subsequent callers
// skip the DB scan entirely and return the cached fallback.  The cache is cleared
// automatically when a Short is published (openning new windows).
const SATURATION_CACHE_TTL_MS = 30 * 60_000; // 30 minutes

interface SaturationEntry { expiresAt: number; fallback: Date; }
const shortScheduleSaturationCache   = new Map<string, SaturationEntry>();
const longFormScheduleSaturationCache = new Map<string, SaturationEntry>();

/**
 * Returns true when the in-process saturation cache indicates all Short windows
 * for the next MAX_DAYS_AHEAD days are already claimed.
 *
 * Callers that batch-queue many Shorts should check this BEFORE entering a loop
 * to avoid hammering getNextShortPublishTime when the schedule is already full.
 */
export function isShortScheduleSaturated(userId: string): boolean {
  const entry = shortScheduleSaturationCache.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    shortScheduleSaturationCache.delete(userId);
    return false;
  }
  return true;
}

/**
 * Clear the saturation cache for a user.
 * Call this after a Short is successfully published to let new scheduling attempts
 * scan for genuinely available windows again.
 */
export function clearShortScheduleSaturation(userId: string): void {
  shortScheduleSaturationCache.delete(userId);
}

/**
 * Returns true when the in-process saturation cache indicates the long-form
 * window for the next MAX_DAYS_AHEAD days is already fully claimed.
 *
 * Callers that batch-queue long-form content should check this BEFORE calling
 * getNextLongFormPublishTime to avoid 28 DB queries per exhausted call.
 */
export function isLongFormScheduleSaturated(userId: string): boolean {
  const entry = longFormScheduleSaturationCache.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    longFormScheduleSaturationCache.delete(userId);
    return false;
  }
  return true;
}

/**
 * Clear the long-form saturation cache for a user.
 * Call this after a long-form video is successfully published so the next
 * scheduling attempt scans for genuinely available windows.
 */
export function clearLongFormScheduleSaturation(userId: string): void {
  longFormScheduleSaturationCache.delete(userId);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Find the next valid Short publish time for a user.
 *
 * Walks forward day by day (up to 14 days) and picks the earliest window
 * slot that satisfies all cadence constraints.  Returns a UTC Date.
 *
 * Concurrent-call safety (four layers — see block comment near top of file):
 *   1. In-process async mutex — fast-path serialization within this process
 *   2. pg_advisory_lock — DB-session lock, blocks cross-process duplicates
 *   3. DB claim table (short_slot_claims) — THE durable atomic guarantee;
 *      INSERT ... ON CONFLICT DO NOTHING RETURNING id wins the slot or loses it
 *   4. Reservation map — defense-in-depth for the autopilotQueue insert gap
 */
export async function getNextShortPublishTime(userId: string, minDaysAhead = 0): Promise<Date> {
  // Fast-path: if the schedule is known to be saturated (all windows for the
  // next MAX_DAYS_AHEAD days already claimed), return the cached fallback immediately
  // without touching the DB.  Only applies to the default minDaysAhead=0 case;
  // catalog callers with a non-zero start day bypass the cache since they look
  // further out and may find slots that the default window does not.
  if (minDaysAhead === 0) {
    const cached = shortScheduleSaturationCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      logger.debug(`[YouTubeSchedule] Saturation cache hit for ${userId.slice(0, 8)} — skipping DB scan`);
      // Small jitter so concurrent fallback callers don't all land at the same time.
      return new Date(cached.fallback.getTime() + Math.floor(Math.random() * 60_000));
    }
  }

  return withShortScheduleMutex(userId, async () => {
    // Double-check inside the mutex: many concurrent callers can all pass the
    // fast-path check above before any one of them sets the saturation cache.
    // Without this re-check each queued caller would run the full 42-query DB
    // scan independently — causing a hot-spin of expensive sequential scans.
    if (minDaysAhead === 0) {
      const recheck = shortScheduleSaturationCache.get(userId);
      if (recheck && Date.now() < recheck.expiresAt) {
        logger.debug(`[YouTubeSchedule] Saturation cache hit (inner) for ${userId.slice(0, 8)} — skipping DB scan`);
        return new Date(recheck.fallback.getTime() + Math.floor(Math.random() * 60_000));
      }
    }
    return withShortAdvisoryLock(userId, async () => {
      const tz     = await getUserTz(userId);
      const now    = new Date();
      const today  = getLocalDay(tz, now);
      const lastSt = await getLastScheduledShortTime(userId);
      const inFlightSlots = getActiveShortReservations(userId);

      for (let d = minDaysAhead; d < MAX_DAYS_AHEAD; d++) {
        const day = d === 0 ? today : offsetDay(tz, today, d);

        // Fetch DB rows, in-progress claimed windows, and the reservation map
        // in one round-trip batch.  claimedWindowsForDay lets us skip windows
        // that are already durably claimed before even computing a candidate.
        const [allUploadsRaw, shortsTodayRaw, claimedWindows] = await Promise.all([
          getUploadsOnDay(userId, tz, day),
          getShortsOnDay(userId, tz, day),
          getClaimedWindowsForDay(userId, day),
        ]);

        // Merge reservation map entries (deduplicated to avoid double-counting
        // slots that are already committed to the DB).
        const { start: dayStart, end: dayEnd } = dayBounds(tz, day);
        const reservedOnDay = inFlightSlots.filter(
          t => t.getTime() >= dayStart.getTime() && t.getTime() <= dayEnd.getTime(),
        );
        const allUploads  = dedupDates([...allUploadsRaw,  ...reservedOnDay].sort((a, b) => a.getTime() - b.getTime()));
        const shortsToday = dedupDates([...shortsTodayRaw, ...reservedOnDay].sort((a, b) => a.getTime() - b.getTime()));

        if (shortsToday.length >= MAX_SHORTS_PER_DAY) continue;
        if (allUploads.length >= MAX_TOTAL_PER_DAY) continue;

        for (let winIdx = 0; winIdx < SHORTS_WINDOWS.length; winIdx++) {
          const win = SHORTS_WINDOWS[winIdx];
          const windowKey = makeWindowKey(userId, day, winIdx);

          // Fast-skip windows already durably claimed in the DB.
          if (claimedWindows.has(windowKey)) continue;

          const winStart  = localHmToUtc(tz, day.y, day.mo, day.dy, win.startH,  win.startM);
          const winEnd    = localHmToUtc(tz, day.y, day.mo, day.dy, win.endH,    win.endM);
          const winTarget = localHmToUtc(tz, day.y, day.mo, day.dy, win.targetH, win.targetM);
          const candidate = withJitter(winTarget, winStart, winEnd);

          if (candidate.getTime() <= now.getTime() + 60_000) continue;
          // Gap check: only enforce minimum spacing when the candidate slot comes
          // AFTER the last scheduled Short.  If candidate < lastSt the arithmetic
          // produces a negative number that would incorrectly block every earlier
          // slot and push new items years into the future.
          if (lastSt
              && candidate.getTime() > lastSt.getTime()
              && candidate.getTime() - lastSt.getTime() < MIN_SHORT_GAP_MS) continue;

          const tooClose = allUploads.some(
            t => Math.abs(t.getTime() - candidate.getTime()) < MIN_ANY_GAP_MS,
          );
          if (tooClose) continue;

          const winOccupied = shortsToday.some(
            t => t.getTime() >= winStart.getTime() && t.getTime() <= winEnd.getTime(),
          );
          if (winOccupied) continue;

          // Attempt atomic DB claim.  The UNIQUE index on (userId, windowKey)
          // is the definitive arbiter — only one INSERT wins even if two
          // processes race past the advisory lock above.
          const claimId = await claimShortWindow(userId, windowKey, candidate);
          if (claimId === null) {
            // Another caller claimed this window first; skip and try next.
            logger.debug(`[YouTubeSchedule] window ${windowKey} race-lost, trying next`);
            continue;
          }

          // Claim succeeded.  Also record in the in-process reservation map
          // so callers that bypass the advisory lock still see it as taken.
          reserveShortSlot(userId, candidate);
          logger.debug(`[YouTubeSchedule] Short slot claimed → ${windowKey} (${candidate.toISOString()})`);
          return candidate;
        }
      }

      // Hard fallback — should not happen in normal operation.
      // Protected by advisory lock + mutex so concurrent fallback callers
      // won't collide (only one runs at a time per user).
      logger.warn(`[YouTubeSchedule] No Short window found for ${userId.slice(0, 8)} in ${MAX_DAYS_AHEAD} days — using +6h`);
      const fallback = new Date(now.getTime() + 6 * 3_600_000);
      reserveShortSlot(userId, fallback);

      // Cache the saturation state so subsequent callers skip the 42-query DB scan.
      // Only cache for the default minDaysAhead=0 — non-zero callers look further out.
      if (minDaysAhead === 0) {
        shortScheduleSaturationCache.set(userId, {
          expiresAt: Date.now() + SATURATION_CACHE_TTL_MS,
          fallback,
        });
      }

      return fallback;
    });
  });
}

/**
 * Find the next valid long-form publish time for a user.
 * Prefers the 17:30–19:30 evening window with ≥ 20 h gap enforcement.
 */
export async function getNextLongFormPublishTime(userId: string, minDaysAhead = 0): Promise<Date> {
  // Fast-path: if the schedule is known to be saturated (the 14-day long-form
  // window is fully booked), return the cached fallback immediately without
  // touching the DB.  Only applies to the default minDaysAhead=0 case.
  if (minDaysAhead === 0) {
    const cached = longFormScheduleSaturationCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      logger.debug(`[YouTubeSchedule] Long-form saturation cache hit for ${userId.slice(0, 8)} — skipping DB scan`);
      return new Date(cached.fallback.getTime() + Math.floor(Math.random() * 60_000));
    }
  }

  const tz     = await getUserTz(userId);
  const now    = new Date();
  const today  = getLocalDay(tz, now);
  const lastLf = await getLastScheduledLongFormTime(userId);

  for (let d = minDaysAhead; d < MAX_DAYS_AHEAD; d++) {
    const day = d === 0 ? today : offsetDay(tz, today, d);
    const [allUploads, lfToday] = await Promise.all([
      getUploadsOnDay(userId, tz, day),
      getLongFormOnDay(userId, tz, day),
    ]);

    if (lfToday.length >= MAX_LONGFORM_PER_DAY) continue;
    if (allUploads.length >= MAX_TOTAL_PER_DAY) continue;

    const winStart  = localHmToUtc(tz, day.y, day.mo, day.dy, LONGFORM_WINDOW.startH,  LONGFORM_WINDOW.startM);
    const winEnd    = localHmToUtc(tz, day.y, day.mo, day.dy, LONGFORM_WINDOW.endH,    LONGFORM_WINDOW.endM);
    const winTarget = localHmToUtc(tz, day.y, day.mo, day.dy, LONGFORM_WINDOW.targetH, LONGFORM_WINDOW.targetM);
    const candidate = withJitter(winTarget, winStart, winEnd);

    if (candidate.getTime() <= now.getTime() + 60_000) continue;
    if (lastLf && candidate.getTime() - lastLf.getTime() < MIN_LONGFORM_GAP_MS) continue;

    const tooClose = allUploads.some(
      t => Math.abs(t.getTime() - candidate.getTime()) < MIN_ANY_GAP_MS,
    );
    if (tooClose) continue;

    logger.debug(`[YouTubeSchedule] Long-form slot → ${LONGFORM_WINDOW.targetH}:${String(LONGFORM_WINDOW.targetM).padStart(2, "0")} local (${candidate.toISOString()})`);
    return candidate;
  }

  logger.warn(`[YouTubeSchedule] No long-form window found for ${userId.slice(0, 8)} — using +24h`);
  const fallback = new Date(now.getTime() + 24 * 3_600_000);
  fallback.setUTCHours(18, 30, 0, 0);

  // Cache the saturation state so subsequent callers skip the 28-query DB scan.
  // Only cache for the default minDaysAhead=0 case.
  if (minDaysAhead === 0) {
    longFormScheduleSaturationCache.set(userId, {
      expiresAt: Date.now() + SATURATION_CACHE_TTL_MS,
      fallback,
    });
  }

  return fallback;
}

/** Count today's scheduled/published Shorts and long-form for a user. */
export async function getDailyYouTubeOutputCounts(
  userId: string,
  tz?: string,
): Promise<{ shorts: number; longForm: number; total: number }> {
  const resolvedTz = tz ?? (await getUserTz(userId));
  const today = getLocalDay(resolvedTz, new Date());
  const [allUploads, shortsToday, lfToday] = await Promise.all([
    getUploadsOnDay(userId, resolvedTz, today),
    getShortsOnDay(userId, resolvedTz, today),
    getLongFormOnDay(userId, resolvedTz, today),
  ]);
  return { shorts: shortsToday.length, longForm: lfToday.length, total: allUploads.length };
}

/** True if today has capacity for at least one more Short. */
export async function canQueueShortToday(userId: string): Promise<boolean> {
  const tz  = await getUserTz(userId);
  const day = getLocalDay(tz, new Date());
  const st  = await getShortsOnDay(userId, tz, day);
  return st.length < MAX_SHORTS_PER_DAY;
}

/** True if today has capacity for at least one more long-form. */
export async function canQueueLongFormToday(userId: string): Promise<boolean> {
  const tz  = await getUserTz(userId);
  const day = getLocalDay(tz, new Date());
  const lf  = await getLongFormOnDay(userId, tz, day);
  return lf.length < MAX_LONGFORM_PER_DAY;
}

/**
 * Count Shorts already uploaded/uploading for the local calendar day
 * that contains `forDate`.  Used by the publisher as a safety-net cap check.
 * Counts status=processing|published only (items that have been sent to YouTube).
 */
export async function countUploadedShortsForDate(
  userId: string,
  forDate: Date,
): Promise<number> {
  const tz = await getUserTz(userId);
  const day = getLocalDay(tz, forDate);
  const { start, end } = dayBounds(tz, day);
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.type, ["youtube_short", "platform_short"]),
      inArray(autopilotQueue.status, ["processing", "published"]),
      gte(autopilotQueue.scheduledAt, start),
      lte(autopilotQueue.scheduledAt, end),
    ));
  return row?.cnt ?? 0;
}

/**
 * Count long-form clips already uploaded/uploading for the local calendar day
 * that contains `forDate`.  Used by the publisher as a safety-net cap check.
 */
export async function countUploadedLongFormForDate(
  userId: string,
  forDate: Date,
): Promise<number> {
  const tz = await getUserTz(userId);
  const day = getLocalDay(tz, forDate);
  const { start, end } = dayBounds(tz, day);
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["processing", "published"]),
      sql`${autopilotQueue.metadata}->>'contentType' = 'long-form-clip'`,
      gte(autopilotQueue.scheduledAt, start),
      lte(autopilotQueue.scheduledAt, end),
    ));
  return row?.cnt ?? 0;
}
