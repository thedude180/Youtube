const TIMEZONE_OFFSET_HOURS = -5;

interface HumanScheduleOptions {
  platform: string;
  userId: string;
  contentType: "new-video" | "recycle" | "engagement" | "comment";
  urgency?: "immediate" | "normal" | "low";
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
    maxPostsPerDay: 2,
    minGapMinutes: 120,
    avgGapMinutes: 300,
    weekendMultiplier: 0.7,
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
  twitch: {
    peakHours: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    offPeakHours: [10, 11, 12, 13],
    maxPostsPerDay: 2,
    minGapMinutes: 180,
    avgGapMinutes: 360,
    weekendMultiplier: 1.1,
  },
  kick: {
    peakHours: [15, 16, 17, 18, 19, 20, 21, 22, 23],
    offPeakHours: [11, 12, 13, 14],
    maxPostsPerDay: 2,
    minGapMinutes: 180,
    avgGapMinutes: 360,
    weekendMultiplier: 1.1,
  },
};

function gaussianRandom(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stddev + mean;
}

function getLocalHour(date: Date): number {
  const utcHour = date.getUTCHours();
  return ((utcHour + TIMEZONE_OFFSET_HOURS) % 24 + 24) % 24;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function generateHumanScheduledTime(options: HumanScheduleOptions): Date {
  const { platform, contentType, urgency = "normal" } = options;
  const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;

  const now = new Date();
  const currentLocalHour = getLocalHour(now);

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
  const targetUtcHour = ((targetHour - TIMEZONE_OFFSET_HOURS) % 24 + 24) % 24;
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

      const localHour = getLocalHour(baseTime);
      if (localHour < 8 || localHour > 23) {
        baseTime.setUTCHours(((10 - TIMEZONE_OFFSET_HOURS) % 24 + 24) % 24);
        if (baseTime.getTime() < lastScheduledTime.getTime()) {
          baseTime = new Date(baseTime.getTime() + 86400000);
        }
      }
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
  const localHour = getLocalHour(now);

  const wakeHour = Math.floor(gaussianRandom(8, 0.5));
  const sleepHour = Math.floor(gaussianRandom(23, 0.5));

  return {
    start: Math.max(7, wakeHour),
    end: Math.min(24, sleepHour),
    isActive: localHour >= Math.max(7, wakeHour) && localHour <= Math.min(24, sleepHour),
  };
}

export function calculateDailyPostBudget(platform: string): number {
  const timing = PLATFORM_TIMING[platform] || PLATFORM_TIMING.x;
  const now = new Date();
  const weekend = isWeekend(now);

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
