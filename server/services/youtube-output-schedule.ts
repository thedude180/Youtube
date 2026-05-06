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

import { db } from "../db";
import { autopilotQueue, channels } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("yt-schedule");

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
const MAX_DAYS_AHEAD     = 14;
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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Find the next valid Short publish time for a user.
 *
 * Walks forward day by day (up to 14 days) and picks the earliest window
 * slot that satisfies all cadence constraints.  Returns a UTC Date.
 */
export async function getNextShortPublishTime(userId: string): Promise<Date> {
  const tz     = await getUserTz(userId);
  const now    = new Date();
  const today  = getLocalDay(tz, now);
  const lastSt = await getLastScheduledShortTime(userId);

  for (let d = 0; d < MAX_DAYS_AHEAD; d++) {
    const day = d === 0 ? today : offsetDay(tz, today, d);
    const [allUploads, shortsToday] = await Promise.all([
      getUploadsOnDay(userId, tz, day),
      getShortsOnDay(userId, tz, day),
    ]);

    if (shortsToday.length >= MAX_SHORTS_PER_DAY) continue;
    if (allUploads.length >= MAX_TOTAL_PER_DAY) continue;

    for (const win of SHORTS_WINDOWS) {
      const winStart  = localHmToUtc(tz, day.y, day.mo, day.dy, win.startH,  win.startM);
      const winEnd    = localHmToUtc(tz, day.y, day.mo, day.dy, win.endH,    win.endM);
      const winTarget = localHmToUtc(tz, day.y, day.mo, day.dy, win.targetH, win.targetM);
      const candidate = withJitter(winTarget, winStart, winEnd);

      // Must be meaningfully in the future
      if (candidate.getTime() <= now.getTime() + 60_000) continue;

      // 5.5 h minimum gap from last Short
      if (lastSt && candidate.getTime() - lastSt.getTime() < MIN_SHORT_GAP_MS) continue;

      // 90 min minimum gap from any upload already on this day
      const tooClose = allUploads.some(
        t => Math.abs(t.getTime() - candidate.getTime()) < MIN_ANY_GAP_MS,
      );
      if (tooClose) continue;

      // Window not already occupied by a Short today
      const winOccupied = shortsToday.some(
        t => t.getTime() >= winStart.getTime() && t.getTime() <= winEnd.getTime(),
      );
      if (winOccupied) continue;

      logger.debug(`[YouTubeSchedule] Short slot → window ${win.targetH}:${String(win.targetM).padStart(2, "0")} local (${candidate.toISOString()})`);
      return candidate;
    }
  }

  // Hard fallback — should not happen in normal operation
  logger.warn(`[YouTubeSchedule] No Short window found for ${userId.slice(0, 8)} in ${MAX_DAYS_AHEAD} days — using +6h`);
  return new Date(now.getTime() + 6 * 3_600_000);
}

/**
 * Find the next valid long-form publish time for a user.
 * Prefers the 17:30–19:30 evening window with ≥ 20 h gap enforcement.
 */
export async function getNextLongFormPublishTime(userId: string): Promise<Date> {
  const tz     = await getUserTz(userId);
  const now    = new Date();
  const today  = getLocalDay(tz, now);
  const lastLf = await getLastScheduledLongFormTime(userId);

  for (let d = 0; d < MAX_DAYS_AHEAD; d++) {
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
