import { db } from "../db";
import { youtubeQuotaUsage } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const QUOTA_COSTS = {
  read: 1,
  list: 1,
  search: 100,
  write: 50,
  upload: 1600,
  thumbnail: 50,
} as const;

type QuotaOperation = keyof typeof QUOTA_COSTS;

const DEFAULT_DAILY_LIMIT = 10000;
const SAFETY_BUFFER = 500;

function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getNextResetTime(): Date {
  const now = new Date();
  const pacificStr = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const pacificNow = new Date(pacificStr);
  const midnight = new Date(pacificNow);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const diff = midnight.getTime() - pacificNow.getTime();
  return new Date(now.getTime() + diff);
}

async function getOrCreateDailyRecord(userId: string) {
  const today = getPacificDate();
  const existing = await db.select().from(youtubeQuotaUsage)
    .where(and(eq(youtubeQuotaUsage.userId, userId), eq(youtubeQuotaUsage.date, today)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  try {
    const [record] = await db.insert(youtubeQuotaUsage).values({
      userId,
      date: today,
      unitsUsed: 0,
      readOps: 0,
      writeOps: 0,
      searchOps: 0,
      uploadOps: 0,
      quotaLimit: DEFAULT_DAILY_LIMIT,
    }).returning();
    return record;
  } catch (err: any) {
    if (err.code === "23505") {
      const [record] = await db.select().from(youtubeQuotaUsage)
        .where(and(eq(youtubeQuotaUsage.userId, userId), eq(youtubeQuotaUsage.date, today)))
        .limit(1);
      return record;
    }
    throw err;
  }
}

export async function trackQuotaUsage(userId: string, operation: QuotaOperation, count: number = 1): Promise<void> {
  try {
    const cost = QUOTA_COSTS[operation] * count;
    const record = await getOrCreateDailyRecord(userId);

    const opField = operation === "read" || operation === "list" ? "readOps"
      : operation === "write" || operation === "thumbnail" ? "writeOps"
      : operation === "search" ? "searchOps"
      : "uploadOps";

    await db.update(youtubeQuotaUsage)
      .set({
        unitsUsed: sql`${youtubeQuotaUsage.unitsUsed} + ${cost}`,
        [opField]: sql`${youtubeQuotaUsage[opField as keyof typeof youtubeQuotaUsage]} + ${count}`,
        lastUpdatedAt: new Date(),
      } as any)
      .where(eq(youtubeQuotaUsage.id, record.id));
  } catch (err) {
    console.error(`[QuotaTracker] Failed to track quota for ${userId}:`, err);
  }
}

export async function getQuotaStatus(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  isNearLimit: boolean;
  isExceeded: boolean;
  resetsAt: string;
  breakdown: { reads: number; writes: number; searches: number; uploads: number };
}> {
  const record = await getOrCreateDailyRecord(userId);
  const remaining = Math.max(0, record.quotaLimit - record.unitsUsed);
  const percentUsed = Math.round((record.unitsUsed / record.quotaLimit) * 100);

  return {
    used: record.unitsUsed,
    limit: record.quotaLimit,
    remaining,
    percentUsed,
    isNearLimit: remaining < SAFETY_BUFFER,
    isExceeded: record.unitsUsed >= record.quotaLimit,
    resetsAt: getNextResetTime().toISOString(),
    breakdown: {
      reads: record.readOps,
      writes: record.writeOps,
      searches: record.searchOps,
      uploads: record.uploadOps,
    },
  };
}

export async function canAffordOperation(userId: string, operation: QuotaOperation, count: number = 1): Promise<boolean> {
  const status = await getQuotaStatus(userId);
  const cost = QUOTA_COSTS[operation] * count;
  return status.remaining >= cost + SAFETY_BUFFER;
}

export async function hasQuotaResetSinceLastPush(userId: string, lastPushDate: string): Promise<boolean> {
  const today = getPacificDate();
  return today !== lastPushDate;
}

export async function getQuotaForAllUsers(): Promise<Array<{ userId: string; remaining: number; isExceeded: boolean }>> {
  const today = getPacificDate();
  const records = await db.select().from(youtubeQuotaUsage)
    .where(eq(youtubeQuotaUsage.date, today));

  return records.map(r => ({
    userId: r.userId,
    remaining: Math.max(0, r.quotaLimit - r.unitsUsed),
    isExceeded: r.unitsUsed >= r.quotaLimit,
  }));
}

export { QUOTA_COSTS, type QuotaOperation, getPacificDate, getNextResetTime };
