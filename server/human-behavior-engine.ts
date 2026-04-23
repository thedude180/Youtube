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
  // YouTube long-form: active gaming creators post 1–2/day, spread 6+ hours apart.
  // Peak hours align with after-school/after-work gaming audience.
  youtube: {
    peakHours: [14, 15, 16, 17, 18, 19, 20],
    offPeakHours: [10, 11, 12, 13, 21],
    maxPostsPerDay: 2,
    minGapMinutes: 360,   // 6 hours minimum between uploads
    avgGapMinutes: 480,   // target ~8 hours apart
    weekendMultiplier: 1.0,
  },
  // YouTube Shorts: more frequent than long-form, gaming clips do well 2–5/day.
  // Gap reduced 2h→90min to match platform-budget-tracker's PLATFORM_MIN_GAP_MS.
  youtubeshorts: {
    peakHours: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    offPeakHours: [10, 11, 22, 23],
    maxPostsPerDay: 4,
    minGapMinutes: 90,    // 90 min minimum (synced with budget tracker)
    avgGapMinutes: 135,   // target ~2.25 hours apart across the day
    weekendMultiplier: 1.1,
  },
  // TikTok: 5/day at 90-min spacing. Gaming content peaks evenings + late night.
  // 23:00 added to peak hours — gaming TikTok performs strongly 10pm-midnight.
  // maxPostsPerDay and minGapMinutes synced with platform-budget-tracker.
  tiktok: {
    peakHours: [15, 16, 17, 18, 19, 20, 21, 22, 23],
    offPeakHours: [11, 12, 13, 14],
    maxPostsPerDay: 5,
    minGapMinutes: 90,    // 90 min minimum (synced with budget tracker)
    avgGapMinutes: 150,   // target ~2.5 hours apart across the day
    weekendMultiplier: 1.2,
  },
  // X/Twitter: shorter content, higher frequency is acceptable.
  x: {
    peakHours: [10, 11, 12, 13, 14, 15, 17, 18, 19, 20],
    offPeakHours: [8, 9, 16, 21, 22],
    maxPostsPerDay: 8,
    minGapMinutes: 45,
    avgGapMinutes: 90,
    weekendMultiplier: 0.8,
  },
  // Discord: announcement-channel style. Posts shortly after YouTube/TikTok.
  // 12/day at 20-min gap — one announcement per content piece (11/day total)
  // plus buffer. Synced with platform-budget-tracker PLATFORM_DAILY_LIMITS.
  discord: {
    peakHours: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    offPeakHours: [10, 11, 12, 13],
    maxPostsPerDay: 12,
    minGapMinutes: 20,    // 20 min — one announcement per content piece
    avgGapMinutes: 45,    // follows YouTube/TikTok schedule naturally
    weekendMultiplier: 1.3,
  },
  // NOTE: twitch, kick, rumble are LIVE-STREAM ONLY (RTMP). They have no
  // content upload API and are not in ALL_DISTRIBUTION_PLATFORMS. No timing
  // profile needed — autopilot never schedules content posts to these platforms.
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

// Platform posting priority — defines the order in which ACTIVE distribution
// platforms receive content. YouTube goes first, Discord announces shortly
// after, then TikTok follows with a wider gap. Mirrors real creator behavior.
// twitch, kick, and rumble are RTMP live-stream only — omitted intentionally.
const PLATFORM_PRIORITY_ORDER = [
  "youtube",        // primary — uploads here first
  "youtubeshorts",  // same channel, Shorts have their own schedule
  "discord",        // announcement follows shortly after
  "tiktok",         // short-form clip, delayed for stagger
];

// Cross-platform stagger gaps (minutes). After the primary platform posts,
// each subsequent platform waits this long before its slot. Values are
// intentionally varied so all platforms don't march in lockstep.
// Only includes platforms with real publishers and upload capability.
const CROSS_PLATFORM_STAGGER_MINUTES: Record<string, number> = {
  youtube: 0,          // primary — base time, no stagger
  youtubeshorts: 0,    // own schedule, parallel to long-form
  discord: 20,         // announce ~20 min after YouTube goes live
  tiktok: 60,          // TikTok clip ~1 hour after YouTube
};

export function generateStaggeredSchedule(
  platforms: string[],
  contentType: "new-video" | "recycle" | "engagement",
  userId: string,
): Map<string, Date> {
  const schedule = new Map<string, Date>();

  // Sort platforms by priority order so content flows:
  //   YouTube → Discord → TikTok → Kick → Rumble (not random)
  const ordered = [...platforms].sort((a, b) => {
    const ai = PLATFORM_PRIORITY_ORDER.indexOf(a);
    const bi = PLATFORM_PRIORITY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Anchor: the primary platform picks a real audience-driven time
  const primaryPlatform = ordered[0];
  const primaryTime = generateHumanScheduledTime({
    platform: primaryPlatform,
    userId,
    contentType,
    urgency: contentType === "new-video" ? "normal" : "low",
  });

  for (const platform of ordered) {
    const staggerBase = CROSS_PLATFORM_STAGGER_MINUTES[platform] ?? 60;
    // Add Gaussian jitter (±10 min) so posts don't all land at the exact offset
    const jitterMinutes = gaussianRandom(0, 10);
    const totalOffsetMs = (staggerBase + jitterMinutes) * 60_000;
    schedule.set(platform, new Date(primaryTime.getTime() + totalOffsetMs));
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

  // 0.97 base = ~3% skip rate across all distribution decisions.
  // This keeps the channel posting almost every day while still
  // preventing a perfectly-robotic "exactly N posts every single day"
  // pattern that platform algorithms and viewers both notice.
  // (Was 0.85 — that skipped ~1 in 7 decisions, causing visible gaps.)
  let probability = 0.97;
  if (weekend) {
    probability *= timing.weekendMultiplier;
  }

  const dayOfWeek = now.getDay();
  if (dayOfWeek === 1) probability *= 1.03; // slight Monday boost
  if (dayOfWeek === 3) probability *= 1.02; // slight Wednesday boost

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

        // Cap scheduling at 2 days out.  The "find the next occurrence of the
        // best day-of-week" logic used to jump a full 7 days when today's slot
        // had already passed (e.g. missed Tuesday → wait until NEXT Tuesday).
        // With a 30+ item backlog that stacks content into June.  Instead we
        // pick the closest upcoming peak hour within the next 48 hours.
        const MAX_DAYS_OUT = 2;
        const candidate = new Date(now);
        const currentDay = candidate.getDay();
        let daysUntil = (picked.dayOfWeek - currentDay + 7) % 7;
        if (daysUntil === 0 && getLocalHourForTimezone(candidate, timezone) >= (picked.hourOfDay + 1)) {
          daysUntil = 1; // tomorrow, not next week
        }
        if (daysUntil > MAX_DAYS_OUT) daysUntil = MAX_DAYS_OUT;
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
