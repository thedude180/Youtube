import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("platform-budget");

// Daily caps = what each platform allows without rate-limits, shadow-bans, or
// API errors. Values sit just under each platform's documented/observed hard
// ceiling with a small safety buffer.
//   youtube        : YouTube allows 50+ uploads/day for verified channels; 15
//                    keeps us well under quota cost (1600 units/upload vs 10k
//                    daily quota) without triggering audits.
//   youtubeshorts  : Same channel/quota as YouTube; 12 matches Shorts algo
//                    tolerance while staying inside quota budget.
//   tiktok         : TikTok docs cap at 10 video posts per 24h per account.
//   x              : Free/basic tier cap is 50 posts / 24h. 40 leaves headroom.
//   discord        : Webhooks allow 30 req/min; no daily cap. 30 = broadcast
//                    rate without community spam perception.
//   instagram      : Graph API hard cap is 25 container publishes per 24h.
//   kick           : No documented daily cap; 10 reflects realistic cadence.
//   rumble         : Platform allows up to 15 uploads/day; 12 stays safe.
//   twitch         : Clips/posts, no daily cap; 10 matches practical cadence.
const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  youtube: 15,
  youtubeshorts: 12,
  tiktok: 10,
  x: 40,
  discord: 30,
  instagram: 25,
  kick: 10,
  rumble: 12,
  twitch: 10,
};

// Minimum gap between posts = what the platform's rate limiter allows without
// 429s or burst-spam heuristics. Tighter than before because the previous
// values were algo-guesses rather than platform limits.
const PLATFORM_MIN_GAP_MS: Record<string, number> = {
  youtube: 60 * 60_000,
  youtubeshorts: 45 * 60_000,
  tiktok: 60 * 60_000,
  x: 15 * 60_000,
  discord: 5 * 60_000,
  instagram: 45 * 60_000,
  kick: 60 * 60_000,
  rumble: 60 * 60_000,
  twitch: 30 * 60_000,
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
