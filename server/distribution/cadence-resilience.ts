import { db } from "../db";
import { cadenceIntelligence, distributionEvents, scheduleItems } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

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

type ScheduleAction = {
  platform: string;
  scheduledAt: Date;
  title: string;
  autoPublish: boolean;
  created: boolean;
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

const MIN_WEEKLY_CADENCE: Record<string, number> = {
  youtube: 1,
  tiktok: 3,
  x: 5,
  twitch: 2,
  kick: 2,
  discord: 1,
  rumble: 1,
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86400000);
}

async function checkTrustBudgetForCadence(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    const result = await checkTrustBudget(userId, "cadence-resilience", 2);
    return { allowed: !result.blocked, remaining: result.remaining };
  } catch {
    return { allowed: false, remaining: 0 };
  }
}

export async function assessBufferHealth(userId: string): Promise<ResiliencePlan> {
  const trustCheck = await checkTrustBudgetForCadence(userId);
  if (!trustCheck.allowed) {
    return {
      userId,
      buffers: [],
      overallResilience: 0,
      breakSafetyDays: 0,
      recommendations: ["Trust budget exhausted — cadence assessment blocked"],
      autoScheduleEnabled: false,
    };
  }

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

  const scheduledItems = await db.select().from(scheduleItems)
    .where(and(
      eq(scheduleItems.userId, userId),
      eq(scheduleItems.status, "scheduled"),
      gte(scheduleItems.scheduledAt, new Date())
    ))
    .limit(100);

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

  const platformScheduledCounts: Record<string, number> = {};
  for (const s of scheduledItems) {
    const plat = s.platform || "youtube";
    platformScheduledCounts[plat] = (platformScheduledCounts[plat] || 0) + 1;
  }

  const buffers: ContentBuffer[] = [];
  const recommendations: string[] = [];
  let totalResilience = 0;
  let minBreakDays = Infinity;

  const platforms = new Set([
    ...Object.keys(platformLatest),
    ...Object.keys(platformEventCounts),
    ...Object.keys(platformScheduledCounts),
  ].filter(p => p === "youtube"));
  if (platforms.size === 0) platforms.add("youtube");

  for (const platform of platforms) {
    const cadence = platformLatest[platform];
    const optimalFreq = cadence?.optimalFrequency ?? 3;
    const minBuffer = MIN_BUFFER_DAYS[platform] ?? 3;

    const recentPublished = platformEventCounts[platform] || 0;
    const scheduled = platformScheduledCounts[platform] || 0;

    const estimatedBuffer = Math.max(0, scheduled);
    const daysOfCoverage = optimalFreq > 0
      ? Math.round((estimatedBuffer / (optimalFreq / 7)) * 10) / 10
      : 0;

    let status: "healthy" | "low" | "critical" | "empty" = "healthy";
    if (estimatedBuffer === 0) status = "empty";
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
      const needed = Math.ceil((minBuffer - daysOfCoverage) * (optimalFreq / 7));
      recommendations.push(`${platform}: Queue ${needed} more content items (${daysOfCoverage}/${minBuffer} days covered)`);
    }

    const breakDays = daysOfCoverage > 0 ? Math.floor(daysOfCoverage) : 0;
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

export async function enforceMinimumCadence(userId: string, platforms?: string[]): Promise<{
  enforced: boolean;
  scheduled: ScheduleAction[];
  trustBlocked: boolean;
}> {
  const trustCheck = await checkTrustBudgetForCadence(userId);
  if (!trustCheck.allowed) {
    return { enforced: false, scheduled: [], trustBlocked: true };
  }

  const targetPlatforms = ["youtube"];
  const scheduled: ScheduleAction[] = [];
  const sevenDaysFromNow = daysFromNow(7);

  const upcomingItems = await db.select().from(scheduleItems)
    .where(and(
      eq(scheduleItems.userId, userId),
      eq(scheduleItems.status, "scheduled"),
      gte(scheduleItems.scheduledAt, new Date()),
      lte(scheduleItems.scheduledAt, sevenDaysFromNow)
    ))
    .limit(200);

  const scheduledPerPlatform: Record<string, number> = {};
  for (const item of upcomingItems) {
    const plat = item.platform || "youtube";
    scheduledPerPlatform[plat] = (scheduledPerPlatform[plat] || 0) + 1;
  }

  for (const platform of targetPlatforms) {
    const minWeekly = MIN_WEEKLY_CADENCE[platform] ?? 1;
    const currentScheduled = scheduledPerPlatform[platform] || 0;
    const deficit = minWeekly - currentScheduled;

    if (deficit <= 0) continue;

    const intervalDays = 7 / deficit;
    for (let i = 0; i < deficit; i++) {
      const scheduleDate = daysFromNow(Math.ceil((i + 1) * intervalDays));

      try {
        await db.insert(scheduleItems).values({
          userId,
          title: `[Auto] ${platform} content — cadence maintenance`,
          type: "auto_publish",
          platform,
          scheduledAt: scheduleDate,
          status: "scheduled",
          metadata: {
            autoPublish: true,
            aiOptimized: true,
            description: "Auto-scheduled by cadence resilience to maintain minimum publishing cadence",
          },
        });

        scheduled.push({
          platform,
          scheduledAt: scheduleDate,
          title: `[Auto] ${platform} content — cadence maintenance`,
          autoPublish: true,
          created: true,
        });
      } catch {
        scheduled.push({
          platform,
          scheduledAt: scheduleDate,
          title: `[Auto] ${platform} content — cadence maintenance`,
          autoPublish: true,
          created: false,
        });
      }
    }
  }

  if (scheduled.length > 0) {
    try {
      const { emitDomainEvent } = await import("../kernel/index");
      await emitDomainEvent(userId, "cadence.enforced", {
        scheduledCount: scheduled.filter(s => s.created).length,
        platforms: [...new Set(scheduled.map(s => s.platform))],
      }, "cadence-resilience", "enforce");
    } catch {}
  }

  return { enforced: scheduled.length > 0, scheduled, trustBlocked: false };
}

export async function scheduleBreakCoverage(userId: string, breakStartDate: Date, breakEndDate: Date, platforms?: string[]): Promise<{
  scheduled: ScheduleAction[];
  trustBlocked: boolean;
  coverageDays: number;
}> {
  const trustCheck = await checkTrustBudgetForCadence(userId);
  if (!trustCheck.allowed) {
    return { scheduled: [], trustBlocked: true, coverageDays: 0 };
  }

  const breakDurationMs = breakEndDate.getTime() - breakStartDate.getTime();
  const coverageDays = Math.ceil(breakDurationMs / 86400000);
  const targetPlatforms = ["youtube"];
  const scheduled: ScheduleAction[] = [];

  for (const platform of targetPlatforms) {
    const minWeekly = MIN_WEEKLY_CADENCE[platform] ?? 1;
    const totalNeeded = Math.ceil((coverageDays / 7) * minWeekly);

    if (totalNeeded === 0) continue;

    const intervalMs = breakDurationMs / totalNeeded;

    for (let i = 0; i < totalNeeded; i++) {
      const scheduleDate = new Date(breakStartDate.getTime() + i * intervalMs);

      try {
        await db.insert(scheduleItems).values({
          userId,
          title: `[Break Coverage] ${platform} content`,
          type: "auto_publish",
          platform,
          scheduledAt: scheduleDate,
          status: "scheduled",
          metadata: {
            autoPublish: true,
            aiOptimized: true,
            description: `Pre-scheduled for creator break (${coverageDays} days)`,
          },
        });

        scheduled.push({
          platform,
          scheduledAt: scheduleDate,
          title: `[Break Coverage] ${platform} content`,
          autoPublish: true,
          created: true,
        });
      } catch {
        scheduled.push({
          platform,
          scheduledAt: scheduleDate,
          title: `[Break Coverage] ${platform} content`,
          autoPublish: true,
          created: false,
        });
      }
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "cadence.break.scheduled", {
      coverageDays,
      scheduledCount: scheduled.filter(s => s.created).length,
    }, "cadence-resilience", "break-coverage");
  } catch {}

  return { scheduled, trustBlocked: false, coverageDays };
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
      prepActions.push(`${buffer.platform}: Create ${Math.ceil(deficit)} additional content pieces before break`);
    }
  }

  return {
    feasible: platformsAtRisk.length === 0,
    platformsAtRisk,
    prepActions,
  };
}
