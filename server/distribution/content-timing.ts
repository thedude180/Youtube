import { db } from "../db";
import { contentTimingIntelligence, distributionEvents, audienceActivityPatterns } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type TimingWindow = {
  platform: string;
  dayOfWeek: number;
  hourOfDay: number;
  score: number;
  viewsMultiplier: number;
  confidence: number;
};

type TimingAnalysis = {
  userId: string;
  platform: string;
  bestWindows: TimingWindow[];
  worstWindows: TimingWindow[];
  timezone: string;
  dataPoints: number;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_OPTIMAL_WINDOWS: Record<string, { day: number; hour: number; score: number }[]> = {
  youtube: [
    { day: 5, hour: 17, score: 0.9 }, { day: 6, hour: 14, score: 0.85 },
    { day: 0, hour: 12, score: 0.8 }, { day: 4, hour: 18, score: 0.75 },
  ],
  tiktok: [
    { day: 2, hour: 19, score: 0.9 }, { day: 4, hour: 20, score: 0.85 },
    { day: 6, hour: 11, score: 0.8 }, { day: 0, hour: 10, score: 0.75 },
  ],
  x: [
    { day: 1, hour: 12, score: 0.9 }, { day: 3, hour: 15, score: 0.85 },
    { day: 5, hour: 9, score: 0.8 }, { day: 2, hour: 17, score: 0.75 },
  ],
  twitch: [
    { day: 5, hour: 20, score: 0.9 }, { day: 6, hour: 19, score: 0.85 },
    { day: 0, hour: 18, score: 0.8 },
  ],
  kick: [
    { day: 5, hour: 21, score: 0.88 }, { day: 6, hour: 20, score: 0.83 },
  ],
  discord: [
    { day: 5, hour: 18, score: 0.85 }, { day: 6, hour: 15, score: 0.8 },
  ],
  rumble: [
    { day: 6, hour: 14, score: 0.85 }, { day: 0, hour: 13, score: 0.8 },
  ],
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

export async function analyzeContentTiming(userId: string, platform: string): Promise<TimingAnalysis> {
  const activityPatterns = await db.select().from(audienceActivityPatterns)
    .where(and(
      eq(audienceActivityPatterns.userId, userId),
      eq(audienceActivityPatterns.platform, platform)
    ))
    .orderBy(desc(audienceActivityPatterns.activityLevel))
    .limit(50);

  const recentEvents = await db.select().from(distributionEvents)
    .where(and(
      eq(distributionEvents.userId, userId),
      eq(distributionEvents.platform, platform),
      gte(distributionEvents.createdAt, daysAgo(60))
    ))
    .limit(100);

  const bestWindows: TimingWindow[] = [];
  const worstWindows: TimingWindow[] = [];

  if (activityPatterns.length > 5) {
    const top = activityPatterns.slice(0, 5);
    for (const p of top) {
      bestWindows.push({
        platform,
        dayOfWeek: p.dayOfWeek,
        hourOfDay: p.hourOfDay,
        score: Math.min(1, (p.activityLevel || 50) / 100),
        viewsMultiplier: 1 + ((p.activityLevel || 50) / 200),
        confidence: Math.min(1, (p.sampleSize || 1) / 20),
      });
    }

    const bottom = activityPatterns.slice(-3);
    for (const p of bottom) {
      worstWindows.push({
        platform,
        dayOfWeek: p.dayOfWeek,
        hourOfDay: p.hourOfDay,
        score: Math.max(0, (p.activityLevel || 20) / 100),
        viewsMultiplier: Math.max(0.5, (p.activityLevel || 20) / 100),
        confidence: Math.min(1, (p.sampleSize || 1) / 20),
      });
    }
  } else {
    const defaults = DEFAULT_OPTIMAL_WINDOWS[platform] || DEFAULT_OPTIMAL_WINDOWS.youtube;
    for (const d of defaults) {
      bestWindows.push({
        platform,
        dayOfWeek: d.day,
        hourOfDay: d.hour,
        score: d.score,
        viewsMultiplier: 1 + d.score * 0.5,
        confidence: 0.3,
      });
    }
  }

  for (const w of bestWindows) {
    await db.insert(contentTimingIntelligence).values({
      userId,
      platform,
      dayOfWeek: w.dayOfWeek,
      hourOfDay: w.hourOfDay,
      timezone: "UTC",
      engagementScore: w.score,
      viewsMultiplier: w.viewsMultiplier,
      sampleSize: activityPatterns.length,
    }).catch(() => {});
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "timing.analyzed", {
      platform, windowCount: bestWindows.length,
    }, "content-timing", platform);
  } catch {}

  return {
    userId,
    platform,
    bestWindows,
    worstWindows,
    timezone: "UTC",
    dataPoints: activityPatterns.length + recentEvents.length,
  };
}

export async function getBestPublishTime(userId: string, platform: string): Promise<{
  dayOfWeek: number;
  dayName: string;
  hourOfDay: number;
  score: number;
  confidence: number;
}> {
  const analysis = await analyzeContentTiming(userId, platform);
  const best = analysis.bestWindows[0];
  if (!best) {
    return { dayOfWeek: 5, dayName: "Friday", hourOfDay: 17, score: 0.7, confidence: 0.2 };
  }
  return {
    dayOfWeek: best.dayOfWeek,
    dayName: DAY_NAMES[best.dayOfWeek] || "Unknown",
    hourOfDay: best.hourOfDay,
    score: best.score,
    confidence: best.confidence,
  };
}

export async function getTimingHistory(userId: string, platform?: string, limit = 30): Promise<any[]> {
  if (platform) {
    return db.select().from(contentTimingIntelligence)
      .where(and(eq(contentTimingIntelligence.userId, userId), eq(contentTimingIntelligence.platform, platform)))
      .orderBy(desc(contentTimingIntelligence.createdAt))
      .limit(limit);
  }
  return db.select().from(contentTimingIntelligence)
    .where(eq(contentTimingIntelligence.userId, userId))
    .orderBy(desc(contentTimingIntelligence.createdAt))
    .limit(limit);
}
