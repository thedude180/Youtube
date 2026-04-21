import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("platform-budget");

// Daily caps — tuned to match what a real active human gaming creator posts.
// The goal is a consistent, organic-looking flow that avoids bot-detection
// on every platform. Caps are intentionally conservative; the system runs
// 24/7 so a lower daily number spread across the day looks far more human
// than a high cap burst-posted in the first few hours.
//
//   youtube        : 1–2 long-form uploads/day is normal for an active gaming
//                    channel. 2 keeps quota cost well under the 10k daily limit
//                    (1600 units/upload) and matches organic creator cadence.
//   youtubeshorts  : Gaming Shorts creators typically post 2–5/day. 4 slots
//                    spread over 2-hour gaps looks natural, not bot-like.
//   tiktok         : 2–3/day is the sweet spot for a consistent creator.
//                    Anything above 4 on a gaming account risks shadow-ban.
//   x              : 5–8 posts/day looks active without triggering auto-review.
//   discord        : Announcement-channel style — posts when YouTube or TikTok
//                    content goes out. 8/day with 30-min gaps is natural.
//   instagram      : Graph API caps at 25, but 4 organic-looking posts/day
//                    avoids the algorithm's over-posting penalty.
//   kick           : 1–2 clips per day on a gaming clip channel.
//   rumble         : Same cadence as YouTube long-form.
//   twitch         : Clips/posts — 3/day matches realistic manual cadence.
const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  youtube: 2,
  youtubeshorts: 4,
  tiktok: 3,
  x: 8,
  discord: 8,
  instagram: 4,
  kick: 2,
  rumble: 2,
  twitch: 3,
};

// Minimum gap between consecutive posts on the same platform.
// These enforce the spacing that real creators naturally have — no human
// uploads a YouTube video every hour. Longer gaps = more human-looking cadence.
const PLATFORM_MIN_GAP_MS: Record<string, number> = {
  youtube: 6 * 60 * 60_000,      // 6 hours between long-forms
  youtubeshorts: 2 * 60 * 60_000, // 2 hours between Shorts
  tiktok: 3 * 60 * 60_000,        // 3 hours between TikToks
  x: 45 * 60_000,                 // 45 min between tweets
  discord: 30 * 60_000,           // 30 min between announcements
  instagram: 4 * 60 * 60_000,     // 4 hours between IG posts
  kick: 4 * 60 * 60_000,          // 4 hours between Kick clips
  rumble: 6 * 60 * 60_000,        // 6 hours (mirrors YouTube)
  twitch: 2 * 60 * 60_000,        // 2 hours between Twitch posts
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

// Hard per-platform character limits enforced before publish so we never trip
// platform validation errors (which trigger shadow-flags / abuse heuristics).
// Numbers track each platform's documented hard cap with a small safety buffer.
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  youtube: 5000,        // description
  youtubeshorts: 5000,
  tiktok: 2150,         // hard cap 2200
  x: 275,               // free tier 280
  discord: 1950,        // hard cap 2000 for messages
  instagram: 2150,      // hard cap 2200
  kick: 1900,
  rumble: 1900,
  twitch: 480,          // 500-char post limit
};

const PLATFORM_HASHTAG_MAX: Record<string, number> = {
  tiktok: 10,
  instagram: 8,
  x: 2,
  youtube: 15,
  youtubeshorts: 15,
  discord: 0,
  kick: 5,
  rumble: 5,
  twitch: 3,
};

export function getPlatformCharLimit(platform: string): number {
  return PLATFORM_CHAR_LIMITS[platform] ?? 1500;
}

export function getPlatformHashtagMax(platform: string): number {
  return PLATFORM_HASHTAG_MAX[platform] ?? 5;
}

// Trim a caption to fit a platform's hard limit while preserving as many
// hashtags as possible. Falls back to a clean truncation with ellipsis.
export function enforceCaptionLimit(caption: string, platform: string): string {
  const limit = getPlatformCharLimit(platform);
  if (caption.length <= limit) return caption;
  const tagMatch = caption.match(/(?:\s#[\w]+)+\s*$/);
  if (tagMatch) {
    const body = caption.slice(0, tagMatch.index).trim();
    const tags = tagMatch[0].trim();
    if (tags.length < limit - 4) {
      const room = limit - tags.length - 2;
      return `${body.slice(0, Math.max(0, room - 1)).trim()}… ${tags}`.slice(0, limit);
    }
  }
  return `${caption.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

// Human-like jitter for scheduling: gaussian around the mean offset minutes
// with reasonable std-dev so consecutive posts never land on round times.
export function humanJitterDelayMs(meanMinutes: number, stdMinutes = 4): number {
  const jitterMin = Math.max(1, gaussianRandom(meanMinutes, stdMinutes));
  return Math.round(jitterMin * 60_000);
}
