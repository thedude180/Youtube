import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("platform-budget");

const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  youtube: 4,
  youtubeshorts: 6,
  tiktok: 3,
  x: 5,
  discord: 2,
  instagram: 2,
  kick: 2,
  rumble: 2,
  twitch: 3,
};

const PLATFORM_MIN_GAP_MS: Record<string, number> = {
  youtube: 120 * 60_000,
  youtubeshorts: 90 * 60_000,
  tiktok: 90 * 60_000,
  x: 45 * 60_000,
  discord: 180 * 60_000,
  instagram: 120 * 60_000,
  kick: 120 * 60_000,
  rumble: 120 * 60_000,
  twitch: 60 * 60_000,
};

export interface PlatformBudgetStatus {
  platform: string;
  dailyLimit: number;
  scheduledToday: number;
  publishedToday: number;
  totalToday: number;
  remaining: number;
  canPost: boolean;
  reason: string;
  minGapMs: number;
  lastPostAt: Date | null;
  gapSatisfied: boolean;
}

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1 || 0.001)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * std;
}

const _dailyVarianceCache = new Map<string, { date: string; variance: number }>();

function getDailyVariance(platform: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const key = platform;
  const cached = _dailyVarianceCache.get(key);
  if (cached && cached.date === today) return cached.variance;

  const variance = Math.random() < 0.3 ? -1 : 0;
  _dailyVarianceCache.set(key, { date: today, variance });

  for (const [k, v] of Array.from(_dailyVarianceCache)) {
    if (v.date !== today) _dailyVarianceCache.delete(k);
  }

  return variance;
}

export async function getPlatformBudgetStatus(userId: string, platform: string): Promise<PlatformBudgetStatus> {
  const dailyLimit = PLATFORM_DAILY_LIMITS[platform] || 3;
  const minGapMs = PLATFORM_MIN_GAP_MS[platform] || 90 * 60_000;
  const effectiveLimit = Math.max(1, dailyLimit + getDailyVariance(platform));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    const [scheduledResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, platform),
        inArray(autopilotQueue.status, ["scheduled", "pending", "processing"]),
        gte(autopilotQueue.scheduledAt, todayStart),
        lte(autopilotQueue.scheduledAt, todayEnd),
      ));

    const [publishedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, platform),
        inArray(autopilotQueue.status, ["published", "publishing"]),
        gte(autopilotQueue.publishedAt, todayStart),
      ));

    const [lastPost] = await db
      .select({ publishedAt: autopilotQueue.publishedAt })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, platform),
        eq(autopilotQueue.status, "published"),
      ))
      .orderBy(sql`${autopilotQueue.publishedAt} DESC NULLS LAST`)
      .limit(1);

    const scheduledToday = scheduledResult?.count || 0;
    const publishedToday = publishedResult?.count || 0;
    const totalToday = scheduledToday + publishedToday;
    const remaining = Math.max(0, effectiveLimit - totalToday);
    const lastPostAt = lastPost?.publishedAt || null;
    const gapSatisfied = !lastPostAt || (Date.now() - new Date(lastPostAt).getTime()) >= minGapMs;

    let canPost = remaining > 0 && gapSatisfied;
    let reason = "ok";

    if (remaining <= 0) {
      reason = "daily_limit_reached";
      canPost = false;
    } else if (!gapSatisfied) {
      reason = "min_gap_not_met";
      canPost = false;
    }

    if (platform === "youtube" || platform === "youtubeshorts") {
      try {
        const { getQuotaStatus, isQuotaBreakerTripped } = await import("./youtube-quota-tracker");

        if (isQuotaBreakerTripped()) {
          canPost = false;
          reason = "youtube_quota_breaker_tripped";
        } else {
          const quotaStatus = await getQuotaStatus(userId);
          if (quotaStatus.isExceeded) {
            canPost = false;
            reason = "youtube_quota_exceeded";
          } else if (quotaStatus.isNearLimit) {
            canPost = false;
            reason = "youtube_quota_near_limit";
          }
        }
      } catch {}
    }

    return {
      platform,
      dailyLimit: effectiveLimit,
      scheduledToday,
      publishedToday,
      totalToday,
      remaining,
      canPost,
      reason,
      minGapMs,
      lastPostAt: lastPostAt ? new Date(lastPostAt) : null,
      gapSatisfied,
    };
  } catch (err: any) {
    logger.warn("Budget status check failed, blocking conservatively", { userId, platform, error: err.message });
    return {
      platform,
      dailyLimit,
      scheduledToday: 0,
      publishedToday: 0,
      totalToday: 0,
      remaining: 0,
      canPost: false,
      reason: "check_failed",
      minGapMs,
      lastPostAt: null,
      gapSatisfied: false,
    };
  }
}

export async function canPostToPlatformToday(userId: string, platform: string): Promise<{ allowed: boolean; reason: string; remaining: number }> {
  const status = await getPlatformBudgetStatus(userId, platform);
  return { allowed: status.canPost, reason: status.reason, remaining: status.remaining };
}

export async function getAllPlatformBudgets(userId: string): Promise<PlatformBudgetStatus[]> {
  const platforms = Object.keys(PLATFORM_DAILY_LIMITS);
  const results: PlatformBudgetStatus[] = [];
  for (const platform of platforms) {
    results.push(await getPlatformBudgetStatus(userId, platform));
  }
  return results;
}

export function getNextPostWindow(lastPostAt: Date | null, platform: string): Date {
  const minGapMs = PLATFORM_MIN_GAP_MS[platform] || 90 * 60_000;
  const jitterMs = gaussianRandom(5, 2) * 60_000;

  if (!lastPostAt) {
    return new Date(Date.now() + Math.max(0, jitterMs));
  }

  const earliestNext = new Date(lastPostAt.getTime() + minGapMs + Math.max(0, jitterMs));
  return earliestNext.getTime() > Date.now() ? earliestNext : new Date(Date.now() + Math.max(0, jitterMs));
}

export { PLATFORM_DAILY_LIMITS, PLATFORM_MIN_GAP_MS };
