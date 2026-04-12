import { db } from "../db";
import { autopilotQueue, users } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { recordEngineKnowledge } from "./knowledge-mesh";

const logger = createLogger("content-distributor");

const DISTRIBUTE_INTERVAL = 30 * 60_000;
let distributeInterval: ReturnType<typeof setInterval> | null = null;

const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  youtube: 4,
  tiktok: 3,
  x: 5,
  discord: 2,
  instagram: 2,
  kick: 2,
  rumble: 2,
};

const PLATFORM_MIN_GAP_MINUTES: Record<string, number> = {
  youtube: 120,
  tiktok: 90,
  x: 45,
  discord: 180,
  instagram: 120,
  kick: 120,
  rumble: 120,
};

const PLATFORM_PEAK_HOURS: Record<string, number[]> = {
  youtube: [10, 11, 12, 14, 15, 16, 17, 18, 19, 20],
  tiktok: [11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22],
  x: [9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21],
  discord: [15, 16, 17, 18, 19, 20, 21, 22, 23],
  instagram: [10, 11, 12, 14, 15, 17, 18, 19, 20, 21],
  kick: [16, 17, 18, 19, 20, 21, 22, 23],
  rumble: [10, 11, 14, 15, 16, 17, 18, 19, 20],
};

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1 || 0.001)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * std;
}

function addHumanJitter(minutes: number): number {
  const jitter = gaussianRandom(0, minutes * 0.2);
  return Math.max(5, Math.round(minutes + jitter));
}

function pickPeakHour(platform: string): number {
  const peaks = PLATFORM_PEAK_HOURS[platform] || [10, 14, 17, 20];
  return peaks[Math.floor(Math.random() * peaks.length)];
}

function shouldSkipDay(): boolean {
  return Math.random() < 0.15;
}

export async function runContentDistribution(): Promise<{
  itemsRedistributed: number;
  conflictsResolved: number;
  daysSpanned: number;
}> {
  let itemsRedistributed = 0;
  let conflictsResolved = 0;
  let maxDaySpan = 0;

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        const result = await distributeForUser(user.id);
        itemsRedistributed += result.redistributed;
        conflictsResolved += result.conflicts;
        maxDaySpan = Math.max(maxDaySpan, result.daysUsed);

        if (result.redistributed > 0 || result.conflicts > 0) {
          recordEngineKnowledge("media-command", user.id, "scheduling_pattern", "cross_platform_scheduling", `Redistributed ${result.redistributed} items, resolved ${result.conflicts} conflicts across ${result.daysUsed} days`, `Platform daily limits applied, human-like spacing enforced`, 60).catch(() => {});
        }
      } catch (err: any) {
        logger.warn("Distribution failed for user", { userId: user.id.substring(0, 8), error: err.message?.substring(0, 200) });
      }
    }

    if (itemsRedistributed > 0) {
      logger.info("Content distribution complete", { itemsRedistributed, conflictsResolved, daysSpanned: maxDaySpan });
    }
  } catch (err: any) {
    logger.error("Content distribution cycle failed", { error: err.message?.substring(0, 300) });
  }

  return { itemsRedistributed, conflictsResolved, daysSpanned: maxDaySpan };
}

async function distributeForUser(userId: string): Promise<{ redistributed: number; conflicts: number; daysUsed: number }> {
  const now = new Date();
  const futureWindow = new Date(now.getTime() + 30 * 86400_000);

  const pendingItems = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      gte(autopilotQueue.scheduledAt, now),
      lte(autopilotQueue.scheduledAt, futureWindow),
    ))
    .orderBy(autopilotQueue.scheduledAt)
    .limit(200);

  if (pendingItems.length === 0) return { redistributed: 0, conflicts: 0, daysUsed: 0 };

  const alreadyPublished = await db.select({
    targetPlatform: autopilotQueue.targetPlatform,
    scheduledAt: autopilotQueue.scheduledAt,
  }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["published", "publishing"]),
      gte(autopilotQueue.publishedAt, new Date(now.getTime() - 24 * 3600_000)),
    ))
    .limit(100);

  const publishedTodayByPlatform = new Map<string, number>();
  const todayStr = now.toISOString().split("T")[0];
  for (const pub of alreadyPublished) {
    const pubDate = pub.scheduledAt ? new Date(pub.scheduledAt).toISOString().split("T")[0] : "";
    if (pubDate === todayStr) {
      publishedTodayByPlatform.set(pub.targetPlatform, (publishedTodayByPlatform.get(pub.targetPlatform) || 0) + 1);
    }
  }

  const byPlatform = new Map<string, typeof pendingItems>();
  for (const item of pendingItems) {
    const platform = item.targetPlatform;
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform)!.push(item);
  }

  let redistributed = 0;
  let conflicts = 0;
  let maxDaysUsed = 0;

  for (const [platform, items] of byPlatform) {
    const dailyLimit = PLATFORM_DAILY_LIMITS[platform] || 3;
    const minGap = PLATFORM_MIN_GAP_MINUTES[platform] || 90;

    const dailyVariance = Math.random() < 0.3 ? -1 : 0;
    const effectiveLimit = Math.max(1, dailyLimit + dailyVariance);

    const dayBuckets = new Map<string, typeof items>();
    for (const item of items) {
      const dayKey = item.scheduledAt ? new Date(item.scheduledAt).toISOString().split("T")[0] : todayStr;
      if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
      dayBuckets.get(dayKey)!.push(item);
    }

    const overflowItems: typeof items = [];
    for (const [dayKey, dayItems] of dayBuckets) {
      const alreadyPublishedOnDay = dayKey === todayStr ? (publishedTodayByPlatform.get(platform) || 0) : 0;
      const available = Math.max(0, effectiveLimit - alreadyPublishedOnDay);

      if (dayItems.length > available) {
        conflicts += dayItems.length - available;
        const sorted = [...dayItems].sort((a, b) => {
          const priorityA = getPriority(a);
          const priorityB = getPriority(b);
          return priorityB - priorityA;
        });

        const keepItems = sorted.slice(0, available);
        const spillItems = sorted.slice(available);
        overflowItems.push(...spillItems);

        const spacedTimes = generateSpacedTimes(dayKey, keepItems.length, minGap, platform);
        for (let i = 0; i < keepItems.length; i++) {
          const newTime = spacedTimes[i];
          if (newTime && keepItems[i].scheduledAt?.getTime() !== newTime.getTime()) {
            await rescheduleItem(keepItems[i].id, newTime);
            redistributed++;
          }
        }
      } else {
        const spacedTimes = generateSpacedTimes(dayKey, dayItems.length, minGap, platform);
        for (let i = 0; i < dayItems.length; i++) {
          const current = dayItems[i].scheduledAt;
          const newTime = spacedTimes[i];
          if (newTime && current) {
            const diff = Math.abs(newTime.getTime() - current.getTime());
            if (diff > 15 * 60_000) {
              await rescheduleItem(dayItems[i].id, newTime);
              redistributed++;
            }
          }
        }
      }
    }

    if (overflowItems.length > 0) {
      const daysUsed = await distributeOverflow(userId, platform, overflowItems, effectiveLimit, minGap);
      redistributed += overflowItems.length;
      maxDaysUsed = Math.max(maxDaysUsed, daysUsed);
    }
  }

  return { redistributed, conflicts, daysUsed: maxDaysUsed };
}

function getPriority(item: any): number {
  const meta = item.metadata || {};
  let priority = 0;

  if (meta.contentType === "youtube-short" || item.type === "auto-clip") priority += 2;
  if (meta.maximizerGenerated) priority += 1;
  if (item.type === "vod-optimization") priority += 3;
  if (meta.contentCategory === "video") priority += 2;
  if (meta.trendRide) priority += 4;

  return priority;
}

function generateSpacedTimes(dayKey: string, count: number, minGapMinutes: number, platform: string): Date[] {
  if (count === 0) return [];

  const peaks = PLATFORM_PEAK_HOURS[platform] || [10, 14, 17, 20];

  const times: Date[] = [];

  if (count === 1) {
    const hour = peaks[Math.floor(Math.random() * peaks.length)];
    const minute = Math.floor(Math.random() * 50) + 5;
    const t = new Date(`${dayKey}T00:00:00Z`);
    t.setUTCHours(hour, minute, Math.floor(Math.random() * 60));
    times.push(t);
    return times;
  }

  const availableSlots = peaks.filter((_, i) => {
    if (count <= peaks.length) {
      const step = Math.floor(peaks.length / count);
      return i % step === 0;
    }
    return true;
  }).slice(0, count);

  while (availableSlots.length < count) {
    availableSlots.push(peaks[Math.floor(Math.random() * peaks.length)]);
  }

  const shuffled = availableSlots.sort(() => Math.random() - 0.5);
  const sorted = shuffled.sort((a, b) => a - b);

  for (let i = 0; i < count; i++) {
    const hour = sorted[i] || pickPeakHour(platform);
    const minute = addHumanJitter(25);
    const t = new Date(`${dayKey}T00:00:00Z`);
    t.setUTCHours(hour, Math.min(59, Math.max(0, minute)), Math.floor(Math.random() * 60));

    if (i > 0 && times.length > 0) {
      const prev = times[times.length - 1];
      const gap = t.getTime() - prev.getTime();
      if (gap < minGapMinutes * 60_000) {
        t.setTime(prev.getTime() + addHumanJitter(minGapMinutes) * 60_000);
      }
    }

    times.push(t);
  }

  return times;
}

async function distributeOverflow(
  userId: string,
  platform: string,
  items: any[],
  dailyLimit: number,
  minGap: number,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingCounts = await db.select({
    day: sql<string>`DATE(${autopilotQueue.scheduledAt})`,
    cnt: sql<number>`count(*)::int`,
  }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, platform),
      eq(autopilotQueue.status, "scheduled"),
      gte(autopilotQueue.scheduledAt, today),
    ))
    .groupBy(sql`DATE(${autopilotQueue.scheduledAt})`)
    .limit(60);

  const dayUsage = new Map<string, number>();
  for (const row of existingCounts) {
    const dateStr = row.day instanceof Date ? row.day.toISOString().split("T")[0] : String(row.day);
    dayUsage.set(dateStr, row.cnt);
  }

  let dayOffset = 1;
  let itemIndex = 0;
  let maxDayUsed = 0;

  while (itemIndex < items.length && dayOffset < 60) {
    const targetDate = new Date(today.getTime() + dayOffset * 86400_000);
    const dayKey = targetDate.toISOString().split("T")[0];

    if (shouldSkipDay()) {
      dayOffset++;
      continue;
    }

    const used = dayUsage.get(dayKey) || 0;
    const available = Math.max(0, dailyLimit - used);

    if (available > 0) {
      const batchSize = Math.min(available, items.length - itemIndex);
      const batchItems = items.slice(itemIndex, itemIndex + batchSize);
      const spacedTimes = generateSpacedTimes(dayKey, batchSize, minGap, platform);

      for (let i = 0; i < batchItems.length; i++) {
        const newTime = spacedTimes[i];
        if (newTime) {
          await rescheduleItem(batchItems[i].id, newTime);
        }
      }

      itemIndex += batchSize;
      dayUsage.set(dayKey, used + batchSize);
      maxDayUsed = Math.max(maxDayUsed, dayOffset);
    }

    dayOffset++;
  }

  return maxDayUsed;
}

async function rescheduleItem(itemId: number, newTime: Date): Promise<void> {
  try {
    await db.update(autopilotQueue)
      .set({
        scheduledAt: newTime,
        metadata: sql`COALESCE(${autopilotQueue.metadata}, '{}'::jsonb) || ${JSON.stringify({
          redistributedAt: new Date().toISOString(),
          distributorScheduled: true,
        })}::jsonb`,
      })
      .where(eq(autopilotQueue.id, itemId));
  } catch (err: any) {
    logger.warn("Failed to reschedule item", { itemId, error: err.message?.substring(0, 100) });
  }
}

export function startSmartContentDistributor(): void {
  if (distributeInterval) return;

  setTimeout(() => {
    runContentDistribution().catch(err =>
      logger.warn("Initial distribution failed", { error: String(err).substring(0, 200) })
    );
  }, 120_000);

  distributeInterval = setInterval(() => {
    runContentDistribution().catch(err =>
      logger.warn("Periodic distribution failed", { error: String(err).substring(0, 200) })
    );
  }, DISTRIBUTE_INTERVAL);

  logger.info("Smart Content Distributor started (30min cycle)");
}

export function stopSmartContentDistributor(): void {
  if (distributeInterval) {
    clearInterval(distributeInterval);
    distributeInterval = null;
  }
}
