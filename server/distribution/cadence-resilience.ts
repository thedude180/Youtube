import { db } from "../db";
import { cadenceIntelligence, distributionEvents } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

type ContentBuffer = {
  platform: string;
  bufferedItems: number;
  daysOfCoverage: number;
  minimumRequired: number;
  status: "healthy" | "low" | "critical" | "empty";
};

type ResiliencePlan = {
  userId: string;
  buffers: ContentBuffer[];
  overallResilience: number;
  breakSafetyDays: number;
  recommendations: string[];
  autoScheduleEnabled: boolean;
};

const MIN_BUFFER_DAYS: Record<string, number> = {
  youtube: 7,
  tiktok: 3,
  x: 2,
  twitch: 0,
  kick: 0,
  discord: 1,
  rumble: 5,
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

export async function assessBufferHealth(userId: string): Promise<ResiliencePlan> {
  const cadenceRecords = await db.select().from(cadenceIntelligence)
    .where(eq(cadenceIntelligence.userId, userId))
    .orderBy(desc(cadenceIntelligence.createdAt))
    .limit(20);

  const recentEvents = await db.select().from(distributionEvents)
    .where(and(
      eq(distributionEvents.userId, userId),
      gte(distributionEvents.createdAt, daysAgo(14))
    ))
    .limit(200);

  const platformLatest: Record<string, typeof cadenceRecords[0]> = {};
  for (const r of cadenceRecords) {
    if (!platformLatest[r.platform]) platformLatest[r.platform] = r;
  }

  const platformEventCounts: Record<string, number> = {};
  for (const e of recentEvents) {
    if (e.status === "published" || e.status === "approved") {
      platformEventCounts[e.platform] = (platformEventCounts[e.platform] || 0) + 1;
    }
  }

  const buffers: ContentBuffer[] = [];
  const recommendations: string[] = [];
  let totalResilience = 0;
  let minBreakDays = Infinity;

  const platforms = new Set([...Object.keys(platformLatest), ...Object.keys(platformEventCounts)]);
  if (platforms.size === 0) platforms.add("youtube");

  for (const platform of platforms) {
    const cadence = platformLatest[platform];
    const optimalFreq = cadence?.optimalFrequency ?? 3;
    const minBuffer = MIN_BUFFER_DAYS[platform] ?? 3;

    const recentPublished = platformEventCounts[platform] || 0;
    const estimatedBuffer = Math.max(0, recentPublished - Math.ceil(optimalFreq * 2));
    const daysOfCoverage = optimalFreq > 0 ? Math.round(estimatedBuffer / (optimalFreq / 7)) : 0;

    let status: "healthy" | "low" | "critical" | "empty" = "healthy";
    if (daysOfCoverage === 0) status = "empty";
    else if (daysOfCoverage < minBuffer / 2) status = "critical";
    else if (daysOfCoverage < minBuffer) status = "low";

    buffers.push({
      platform,
      bufferedItems: estimatedBuffer,
      daysOfCoverage,
      minimumRequired: minBuffer,
      status,
    });

    const platformResilience = Math.min(1, daysOfCoverage / Math.max(1, minBuffer));
    totalResilience += platformResilience;

    if (daysOfCoverage < minBuffer) {
      const needed = minBuffer - daysOfCoverage;
      recommendations.push(`${platform}: Build ${needed} more days of content buffer (currently ${daysOfCoverage}/${minBuffer} days)`);
    }

    const breakDays = optimalFreq > 0 ? Math.floor(daysOfCoverage) : 30;
    minBreakDays = Math.min(minBreakDays, breakDays);
  }

  const overallResilience = platforms.size > 0 ? totalResilience / platforms.size : 0;
  const breakSafetyDays = minBreakDays === Infinity ? 0 : minBreakDays;

  if (breakSafetyDays < 3) {
    recommendations.push("Creator can take fewer than 3 days off before cadence drops — build content reserves");
  }

  if (overallResilience < 0.3) {
    recommendations.push("Overall content resilience is critically low — prioritize buffer building");
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "cadence.resilience.assessed", {
      overallResilience, breakSafetyDays, bufferCount: buffers.length,
    }, "cadence-resilience", "assessment");
  } catch {}

  return {
    userId,
    buffers,
    overallResilience,
    breakSafetyDays,
    recommendations,
    autoScheduleEnabled: overallResilience > 0.5,
  };
}

export async function getBreakReadiness(userId: string, breakDays: number): Promise<{
  feasible: boolean;
  platformsAtRisk: string[];
  prepActions: string[];
}> {
  const plan = await assessBufferHealth(userId);
  const platformsAtRisk: string[] = [];
  const prepActions: string[] = [];

  for (const buffer of plan.buffers) {
    if (buffer.daysOfCoverage < breakDays) {
      platformsAtRisk.push(buffer.platform);
      const deficit = breakDays - buffer.daysOfCoverage;
      prepActions.push(`${buffer.platform}: Create ${deficit} additional content pieces before break`);
    }
  }

  return {
    feasible: platformsAtRisk.length === 0,
    platformsAtRisk,
    prepActions,
  };
}
