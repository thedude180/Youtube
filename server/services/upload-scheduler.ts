import { db } from "../db";
import { audienceActivityPatterns, autopilotQueue, videos } from "@shared/schema";
import { eq, and, desc, gte, sql, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("upload-scheduler");

const YOUTUBE_NATURAL_PEAK_HOURS = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
const MIN_GAP_BETWEEN_UPLOADS_MS = 3 * 3600_000;

// Real upload timestamps should never land on a whole minute boundary — that's
// an automation tell.  These helpers sprinkle a natural sub-minute offset.
const rSec = () => Math.floor(Math.random() * 60);
const rMs  = () => Math.floor(Math.random() * 1000);

// Q4 revenue multiplier: gaming ad RPMs are 3-5x higher Oct-Dec vs January.
// During Q4 we compress the search window (prefer sooner slots) to capture peak advertiser spend.
// Outside Q4 we use the full 14-day lookahead to find the most optimal audience slot.
function getQ4SchedulerConfig(): { lookaheadDays: number; isQ4: boolean; q4Month: string } {
  const month = new Date().getMonth(); // 0-indexed
  const q4Names: Record<number, string> = { 9: "October", 10: "November", 11: "December" };
  const isQ4 = month >= 9 && month <= 11;
  return {
    lookaheadDays: isQ4 ? 4 : 14,
    isQ4,
    q4Month: q4Names[month] || "",
  };
}

function getLocalDayOfWeek(utcDate: Date, offsetHours: number): number {
  const localMs = utcDate.getTime() + offsetHours * 3600_000;
  return new Date(localMs).getUTCDay();
}

async function loadOccupiedSlots(userId: string, platform: string, now: Date): Promise<Set<string>> {
  const occupied = new Set<string>();

  const queueRows = await db.select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, platform),
      gte(autopilotQueue.scheduledAt, now),
      or(
        eq(autopilotQueue.status, "scheduled"),
        eq(autopilotQueue.status, "publishing"),
      ),
    ))
    .orderBy(autopilotQueue.scheduledAt);

  for (const r of queueRows) {
    if (r.scheduledAt) {
      const d = new Date(r.scheduledAt);
      occupied.add(`${d.toISOString().slice(0, 10)}-${d.getUTCHours()}`);
    }
  }

  const recentPublished = await db.select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, platform),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.scheduledAt, now),
    ))
    .orderBy(desc(autopilotQueue.scheduledAt))
    .limit(50);

  for (const r of recentPublished) {
    if (r.scheduledAt) {
      const d = new Date(r.scheduledAt);
      occupied.add(`${d.toISOString().slice(0, 10)}-${d.getUTCHours()}`);
    }
  }

  return occupied;
}

export async function getNextOptimalPublishTime(userId: string, platform: string = "youtube"): Promise<Date> {
  const now = new Date();

  let timezone = "America/New_York";
  let getOffsetFn: (tz: string, d: Date) => number = () => -5;
  try {
    const hbe = await import("../human-behavior-engine");
    timezone = await hbe.getUserTimezone(userId);
    getOffsetFn = hbe.getTimezoneOffsetHours;
  } catch {}

  const occupiedSlots = await loadOccupiedSlots(userId, platform, now);

  let lastScheduledMs = now.getTime();
  const queueTimes = await db.select({ scheduledAt: autopilotQueue.scheduledAt })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, platform),
      gte(autopilotQueue.scheduledAt, now),
    ))
    .orderBy(desc(autopilotQueue.scheduledAt))
    .limit(1);

  if (queueTimes.length > 0 && queueTimes[0].scheduledAt) {
    const t = new Date(queueTimes[0].scheduledAt).getTime();
    if (t > lastScheduledMs) lastScheduledMs = t;
  }

  const earliestAllowed = new Date(Math.max(
    lastScheduledMs + MIN_GAP_BETWEEN_UPLOADS_MS,
    now.getTime() + 30 * 60_000,
  ));

  const patterns = await db.select({
    dayOfWeek: audienceActivityPatterns.dayOfWeek,
    hourOfDay: audienceActivityPatterns.hourOfDay,
    activityLevel: audienceActivityPatterns.activityLevel,
    sampleSize: audienceActivityPatterns.sampleSize,
  })
    .from(audienceActivityPatterns)
    .where(and(
      eq(audienceActivityPatterns.userId, userId),
      eq(audienceActivityPatterns.platform, platform),
    ))
    .orderBy(desc(audienceActivityPatterns.activityLevel))
    .limit(20);

  const hasAudienceData = patterns.length >= 3;
  const q4Config = getQ4SchedulerConfig();
  const lookahead = q4Config.lookaheadDays;

  if (q4Config.isQ4) {
    logger.info("Q4 scheduler active — compressed lookahead to capture peak RPM window", {
      userId: userId.slice(0, 8),
      q4Month: q4Config.q4Month,
      lookaheadDays: lookahead,
    });
  }

  if (hasAudienceData) {
    const topSlots = patterns.slice(0, 10);

    for (let dayOffset = 0; dayOffset < lookahead; dayOffset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);

      const dayOffset_offset = getOffsetFn(timezone, candidate);
      const candidateLocalDay = getLocalDayOfWeek(candidate, dayOffset_offset);

      for (const slot of topSlots) {
        if (slot.dayOfWeek !== candidateLocalDay) continue;

        const offset = getOffsetFn(timezone, candidate);
        const targetUtcHour = (((slot.hourOfDay ?? 0) - offset) % 24 + 24) % 24;
        candidate.setUTCHours(Math.round(targetUtcHour), Math.floor(Math.random() * 45) + 5, rSec(), rMs());

        if (candidate.getTime() < earliestAllowed.getTime()) continue;

        const slotKey = `${candidate.toISOString().slice(0, 10)}-${candidate.getUTCHours()}`;
        if (occupiedSlots.has(slotKey)) continue;

        logger.info("Optimal publish time from audience data", {
          userId: userId.slice(0, 8),
          scheduledAt: candidate.toISOString(),
          dayOfWeek: slot.dayOfWeek,
          hourOfDay: slot.hourOfDay,
          activityLevel: slot.activityLevel,
          source: "audience-data",
        });
        return candidate;
      }
    }
  }

  for (let dayOffset = 0; dayOffset < lookahead; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);

    const offset = getOffsetFn(timezone, candidate);
    const shuffledHours = [...YOUTUBE_NATURAL_PEAK_HOURS].sort(() => Math.random() - 0.5);

    for (const localHour of shuffledHours) {
      const targetUtcHour = ((localHour - offset) % 24 + 24) % 24;
      candidate.setUTCHours(Math.round(targetUtcHour), Math.floor(Math.random() * 45) + 5, rSec(), rMs());

      if (candidate.getTime() < earliestAllowed.getTime()) continue;

      const slotKey = `${candidate.toISOString().slice(0, 10)}-${candidate.getUTCHours()}`;
      if (occupiedSlots.has(slotKey)) continue;

      logger.info("Optimal publish time from peak hours", {
        userId: userId.slice(0, 8),
        scheduledAt: candidate.toISOString(),
        localHour,
        source: "youtube-peak-hours",
      });
      return candidate;
    }
  }

  const fallback = new Date(earliestAllowed.getTime() + Math.random() * 3600_000);
  logger.info("Using fallback publish time", { userId: userId.slice(0, 8), scheduledAt: fallback.toISOString(), source: "fallback" });
  return fallback;
}

export async function getUploadScheduleSummary(userId: string): Promise<{
  nextSlot: Date;
  queueDepth: number;
  schedulingSource: string;
  isQ4: boolean;
  q4Month: string;
  upcomingSlots: { time: Date; source: string }[];
}> {
  const nextSlot = await getNextOptimalPublishTime(userId, "youtube");

  const queueResult = await db.select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      gte(autopilotQueue.scheduledAt, new Date()),
    ));

  const patterns = await db.select().from(audienceActivityPatterns)
    .where(and(eq(audienceActivityPatterns.userId, userId), eq(audienceActivityPatterns.platform, "youtube")))
    .limit(1);

  const q4Cfg = getQ4SchedulerConfig();
  const baseSource = patterns.length > 0 ? "audience-analytics" : "youtube-peak-hours";
  const schedulingSource = q4Cfg.isQ4 ? `${baseSource}+q4-priority` : baseSource;

  return {
    nextSlot,
    queueDepth: queueResult[0]?.count || 0,
    schedulingSource,
    isQ4: q4Cfg.isQ4,
    q4Month: q4Cfg.q4Month,
    upcomingSlots: [{ time: nextSlot, source: schedulingSource }],
  };
}
