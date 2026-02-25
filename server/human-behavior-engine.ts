import { db } from "./db";
import { notificationPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Returns the UTC offset in hours for a given IANA timezone on a specific date.
 * Positive = east of UTC (e.g., +5.5 for IST), negative = west (e.g., -5 for EST).
 * Automatically accounts for Daylight Saving Time.
 */
export function getTimezoneOffsetHours(timezone: string, date: Date): number {
  try {
    const tzTime = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    const utcTime = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    return (tzTime.getTime() - utcTime.getTime()) / 3600000;
  } catch {
    return 0;
  }
}

/**
 * Looks up the creator's IANA timezone from their notification preferences.
 * Falls back to "UTC" if not set or not found.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const [prefs] = await db
      .select({ timezone: notificationPreferences.timezone })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    const tz = prefs?.timezone;
    if (tz && tz !== "UTC") {
      // Validate it's a real IANA timezone
      Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
    return "UTC";
  } catch {
    return "UTC";
  }
}

interface HumanScheduleOptions {
  platform: string;
  userId: string;
  contentType: "new-video" | "recycle" | "engagement" | "comment";
  urgency?: "immediate" | "normal" | "low";
  timezone?: string;
}

interface PlatformTimingProfile {
  peakHours: number[];
  offPeakHours: number[];
  maxPostsPerDay: number;
  minGapMinutes: number;
  avgGapMinutes: number;
  weekendMultiplier: number;
}

const PLATFORM_TIMING: Record<string, PlatformTimingProfile> = {
  youtube: {
    peakHours: [10, 11, 12, 14, 15, 16, 17, 18, 19, 20],
    offPeakHours: [8, 9, 13, 21, 22],
    maxPostsPerDay: 4,
    minGapMinutes: 90,
    avgGapMinutes: 180,
    weekendMultiplier: 1.0,
  },
  tiktok: {
    peakHours: [11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22],
    offPeakHours: [9, 10, 16, 23],
    maxPostsPerDay: 3,
    minGapMinutes: 90,
    avgGapMinutes: 240,
    weekendMultiplier: 1.2,
  },
  x: {
    peakHours: [9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21],
    offPeakHours: [8, 16, 22, 23],
    maxPostsPerDay: 5,
    minGapMinutes: 45,
    avgGapMinutes: 120,
    weekendMultiplier: 0.8,
  },
  discord: {
    peakHours: [15, 16, 17, 18, 19, 20, 21, 22, 23],
    offPeakHours: [10, 11, 12, 13, 14],
    maxPostsPerDay: 2,
    minGapMinutes: 180,
    avgGapMinutes: 480,
    weekendMultiplier: 1.3,
  },
};

function gaussianRandom(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stddev + mean;
}

function getLocalHourForTimezone(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(date);
    return parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  } catch {
    return date.getUTCHours();
  }
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function generateHumanScheduledTime(options: HumanScheduleOptions): Date {
  const { platform, contentType, urgency = "normal", timezone = "UTC" } = options;
  const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;
  const offset = getTimezoneOffsetHours(timezone, new Date());

  const now = new Date();

  if (urgency === "immediate") {
    const delayMinutes = gaussianRandom(8, 4);
    return new Date(now.getTime() + Math.max(3, delayMinutes) * 60000);
  }

  let targetHour: number;
  const usePeak = Math.random() < 0.7;

  if (usePeak && timing.peakHours.length > 0) {
    targetHour = timing.peakHours[Math.floor(Math.random() * timing.peakHours.length)];
  } else if (timing.offPeakHours.length > 0) {
    targetHour = timing.offPeakHours[Math.floor(Math.random() * timing.offPeakHours.length)];
  } else {
    targetHour = 10 + Math.floor(Math.random() * 12);
  }

  const minuteJitter = Math.floor(gaussianRandom(25, 15));
  const targetMinute = Math.max(0, Math.min(59, minuteJitter));

  let scheduledDate = new Date(now);
  const targetUtcHour = ((targetHour - offset) % 24 + 24) % 24;
  scheduledDate.setUTCHours(targetUtcHour, targetMinute, Math.floor(Math.random() * 60), 0);

  if (scheduledDate.getTime() <= now.getTime() + timing.minGapMinutes * 60000) {
    scheduledDate = new Date(scheduledDate.getTime() + 86400000);
  }

  if (contentType === "recycle" && urgency === "low") {
    const extraDays = Math.floor(Math.random() * 3);
    scheduledDate = new Date(scheduledDate.getTime() + extraDays * 86400000);
  }

  return scheduledDate;
}

export function generateStaggeredSchedule(
  platforms: string[],
  contentType: "new-video" | "recycle" | "engagement",
  userId: string,
): Map<string, Date> {
  const schedule = new Map<string, Date>();
  const now = new Date();

  const shuffled = [...platforms].sort(() => Math.random() - 0.5);

  let lastScheduledTime = now;

  for (let i = 0; i < shuffled.length; i++) {
    const platform = shuffled[i];
    const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;

    let baseTime: Date;
    if (i === 0) {
      baseTime = generateHumanScheduledTime({
        platform,
        userId,
        contentType,
        urgency: contentType === "new-video" ? "normal" : "low",
      });
    } else {
      const gapMinutes = gaussianRandom(timing.avgGapMinutes, timing.avgGapMinutes * 0.3);
      const actualGap = Math.max(timing.minGapMinutes, gapMinutes);
      baseTime = new Date(lastScheduledTime.getTime() + actualGap * 60000);
    }

    const jitterMinutes = gaussianRandom(0, 7);
    baseTime = new Date(baseTime.getTime() + jitterMinutes * 60000);

    schedule.set(platform, baseTime);
    lastScheduledTime = baseTime;
  }

  return schedule;
}

export function addHumanMicroDelay(): number {
  return Math.floor(gaussianRandom(0, 3) * 60000);
}

export function shouldPostToday(platform: string): boolean {
  const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;
  const now = new Date();
  const weekend = isWeekend(now);

  let probability = 0.85;
  if (weekend) {
    probability *= timing.weekendMultiplier;
  }

  const dayOfWeek = now.getDay();
  if (dayOfWeek === 1) probability *= 1.1;
  if (dayOfWeek === 3) probability *= 1.05;

  return Math.random() < Math.min(1, probability);
}

export function getActivityWindow(): { start: number; end: number; isActive: boolean } {
  const now = new Date();
  const localHour = now.getUTCHours();

  const wakeHour = Math.floor(gaussianRandom(8, 0.5));
  const sleepHour = Math.floor(gaussianRandom(23, 0.5));

  return {
    start: Math.max(7, wakeHour),
    end: Math.min(24, sleepHour),
    isActive: localHour >= Math.max(7, wakeHour) && localHour <= Math.min(24, sleepHour),
  };
}

export function calculateDailyPostBudget(platform: string, date?: Date): number {
  const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;
  const targetDate = date || new Date();
  const weekend = isWeekend(targetDate);

  let budget = timing.maxPostsPerDay;
  if (weekend) {
    budget = Math.round(budget * timing.weekendMultiplier);
  }

  const variance = Math.random() < 0.3 ? -1 : 0;
  return Math.max(1, budget + variance);
}

export function getCommentResponseDelay(): number {
  const baseMinutes = gaussianRandom(15, 10);
  const capped = Math.max(3, Math.min(120, baseMinutes));
  return capped * 60000;
}

export function getEngagementGapMs(): number {
  const minutes = gaussianRandom(35, 15);
  return Math.max(10, minutes) * 60000;
}

export function simulateTypingDelay(textLength: number): number {
  const charsPerMinute = gaussianRandom(250, 50);
  const typingMs = (textLength / charsPerMinute) * 60000;
  const thinkingMs = gaussianRandom(5000, 3000);
  return Math.max(2000, typingMs + thinkingMs);
}

export async function getAudienceDrivenTime(options: HumanScheduleOptions): Promise<Date> {
  const timezone = options.timezone ?? (await getUserTimezone(options.userId));

  try {
    const { getOptimalPostingTimes } = await import("./smart-scheduler");
    const result = await getOptimalPostingTimes(options.userId, options.platform);

    if (result.source === "data" && result.slots?.length > 0) {
      const sorted = [...result.slots]
        .filter((s: any) => s.dayOfWeek != null && s.hourOfDay != null && (s.activityLevel ?? 0) > 0)
        .sort((a: any, b: any) => (b.activityLevel ?? 0) - (a.activityLevel ?? 0));

      if (sorted.length > 0) {
        const topSlots = sorted.slice(0, Math.min(5, sorted.length));
        const picked = topSlots[Math.floor(Math.random() * topSlots.length)] as any;
        const now = new Date();

        if (options.urgency === "immediate") {
          const delayMinutes = gaussianRandom(8, 4);
          return new Date(now.getTime() + Math.max(3, delayMinutes) * 60000);
        }

        const candidate = new Date(now);
        const currentDay = candidate.getDay();
        let daysUntil = (picked.dayOfWeek - currentDay + 7) % 7;
        if (daysUntil === 0 && getLocalHourForTimezone(candidate, timezone) >= (picked.hourOfDay + 1)) {
          daysUntil = 7;
        }
        candidate.setDate(candidate.getDate() + daysUntil);
        const minuteJitter = Math.floor(gaussianRandom(25, 15));
        const offset = getTimezoneOffsetHours(timezone, candidate);
        const targetUtcHour = ((picked.hourOfDay - offset) % 24 + 24) % 24;
        candidate.setUTCHours(Math.round(targetUtcHour), Math.max(0, Math.min(59, minuteJitter)), 0, 0);

        return candidate;
      }
    }
  } catch {
  }

  return generateHumanScheduledTime({ ...options, timezone });
}

export async function getAudienceDrivenStaggeredSchedule(
  platforms: string[],
  contentType: "new-video" | "recycle" | "engagement",
  userId: string,
): Promise<Map<string, Date>> {
  const schedule = new Map<string, Date>();
  let lastTime = new Date();

  const timezone = await getUserTimezone(userId);
  const shuffled = [...platforms].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i++) {
    const platform = shuffled[i];
    const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;

    let time: Date;
    if (i === 0) {
      time = await getAudienceDrivenTime({
        platform,
        userId,
        contentType,
        urgency: contentType === "new-video" ? "normal" : "low",
        timezone,
      });
    } else {
      const gapMinutes = gaussianRandom(timing.avgGapMinutes, timing.avgGapMinutes * 0.3);
      const actualGap = Math.max(timing.minGapMinutes, gapMinutes);
      const afterGap = new Date(lastTime.getTime() + actualGap * 60000);

      try {
        const { getOptimalPostingTimes } = await import("./smart-scheduler");
        const result = await getOptimalPostingTimes(userId, platform);

        if (result.source === "data" && result.slots?.length > 0) {
          const sorted = [...result.slots]
            .filter((s: any) => s.dayOfWeek != null && s.hourOfDay != null && (s.activityLevel ?? 0) > 0)
            .sort((a: any, b: any) => (b.activityLevel ?? 0) - (a.activityLevel ?? 0));

          if (sorted.length > 0) {
            const topSlots = sorted.slice(0, Math.min(5, sorted.length));
            const picked = topSlots[Math.floor(Math.random() * topSlots.length)] as any;
            const candidate = new Date(afterGap);
            const currentDay = candidate.getDay();
            let daysUntil = (picked.dayOfWeek - currentDay + 7) % 7;
            candidate.setDate(candidate.getDate() + daysUntil);
            const offset = getTimezoneOffsetHours(timezone, candidate);
            const targetUtcHour = ((picked.hourOfDay - offset) % 24 + 24) % 24;
            candidate.setUTCHours(Math.round(targetUtcHour), Math.floor(Math.random() * 45) + 5, 0, 0);
            if (candidate.getTime() < afterGap.getTime()) {
              candidate.setDate(candidate.getDate() + 7);
            }
            time = candidate;
          } else {
            time = afterGap;
          }
        } else {
          time = afterGap;
        }
      } catch {
        time = afterGap;
      }
    }

    const jitterMinutes = gaussianRandom(0, 7);
    time = new Date(time.getTime() + jitterMinutes * 60000);

    schedule.set(platform, time);
    lastTime = time;
  }

  return schedule;
}
