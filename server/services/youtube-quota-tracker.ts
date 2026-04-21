import { db } from "../db";
import { youtubeQuotaUsage } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("youtube-quota-tracker");
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
const SAFETY_BUFFER = 200; // Reduced from 500 — gives ~300 more usable API units per day

function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getNextResetTime(): Date {
  const now = new Date();
  const todayPT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  const todayDate = new Date(`${todayPT}T00:00:00`);
  const tomorrowDate = new Date(todayDate.getTime() + 86400000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10) + 'T00:00:00';

  const ptMidnightPDT = new Date(`${tomorrowStr}-07:00`);
  const checkParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ptMidnightPDT);

  if (!checkParts.includes('00:00') && !checkParts.includes('24:00')) {
    return new Date(`${tomorrowStr}-08:00`);
  }
  return ptMidnightPDT;
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
    logger.error(`[QuotaTracker] Failed to track quota for ${userId}:`, err);
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

let _globalQuotaTripDate: string | null = null;

export function tripGlobalQuotaBreaker(): void {
  const today = getPacificDate();
  if (_globalQuotaTripDate !== today) {
    logger.warn(`[QuotaBreaker] YouTube API quota circuit breaker TRIPPED for ${today} — all YouTube API calls blocked until midnight Pacific`);
  }
  _globalQuotaTripDate = today;
}

export function isQuotaBreakerTripped(): boolean {
  if (!_globalQuotaTripDate) return false;
  const today = getPacificDate();
  if (_globalQuotaTripDate !== today) {
    _globalQuotaTripDate = null;
    return false;
  }
  return true;
}

export function markQuotaErrorFromResponse(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = err?.code;
  if (code === 403 || code === "QUOTA_EXCEEDED" || msg.includes("quota") || msg.includes("ratelimitexceeded") || msg.includes("dailylimitexceeded")) {
    tripGlobalQuotaBreaker();
    return true;
  }
  return false;
}

export { QUOTA_COSTS, type QuotaOperation, getPacificDate, getNextResetTime };
