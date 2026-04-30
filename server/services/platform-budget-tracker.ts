import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { runWithDbLimit } from "../lib/db-semaphore";

const logger = createLogger("platform-budget");

// ─── SHORT-LIVED RESULT CACHE ─────────────────────────────────────────────────
// Prevents DB bursts when many callers ask for the same platform budget within
// the same tick (e.g. 19 simultaneous Discord budget checks observed in prod).
// TTL is intentionally short (30 s) so scheduling decisions stay accurate.
const BUDGET_CACHE_TTL_MS = 30_000;
const _budgetCache = new Map<string, { value: PlatformBudgetStatus; expiresAt: number }>();

function _cacheBudget(key: string, value: PlatformBudgetStatus): void {
  _budgetCache.set(key, { value, expiresAt: Date.now() + BUDGET_CACHE_TTL_MS });
}

function _getCachedBudget(key: string): PlatformBudgetStatus | null {
  const entry = _budgetCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _budgetCache.delete(key);
    return null;
  }
  return entry.value;
}

// ─── ACTIVE CONTENT DISTRIBUTION PLATFORMS ───────────────────────────────────
// Only platforms with real publishers are listed here. The autopilot routes
// content exclusively through ALL_DISTRIBUTION_PLATFORMS = ["youtube","discord","tiktok"].
//
// NOT listed (live-stream / RTMP only — no content upload API):
//   twitch  → live relay only (RTMP). Platform-publisher can update stream title
//             and post chat announcements, but autopilot does NOT distribute here.
//   kick    → live relay only (RTMP). No upload API exists. No publisher.
//   rumble  → live relay only (RTMP). No upload API exists. No publisher.
//
// Daily caps tuned for maximum human-like throughput on each platform.
//
//   youtube       : 2/day, 6-hour gap.
//                   *** QUOTA-CONSTRAINED — cannot raise. ***
//                   2 long-form + 4 Shorts = 6 uploads × 1,600 units = 9,600 units.
//                   The 10k daily YouTube API quota is the hard ceiling here.
//                   6-hour spacing matches what active gaming YouTubers maintain.
//
//   youtubeshorts : 4/day, 90-min gap.
//                   *** QUOTA-CONSTRAINED — cannot raise beyond 4. ***
//                   4 Shorts × 1,600 units = 6,400 units (see youtube note above).
//                   Gap reduced 2h → 90 min: gives the scheduler ~50% more
//                   flexibility in slot placement without changing the 4/day cap.
//                   Top Shorts creators: 3-6/day with 1-2h spacing is normal.
//
//   tiktok        : 5/day, 90-min gap.
//                   Top gaming TikTokers (FaZe, SypherPK) post 3-6/day.
//                   5 is the safe aggressive max before TikTok spam heuristics
//                   flag an account; 90-min spacing fits 5 posts naturally into
//                   a 16-hour day without bunching.
//
//   discord       : 12/day, 20-min gap.
//                   Webhooks are free — no API quota constraint.
//                   Content output = 2 YouTube + 4 Shorts + 5 TikTok = 11/day.
//                   12 gives one announcement per piece plus buffer for reposts.
//                   20-min gap is natural for an active gaming community server.
const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  youtube: 2,
  youtubeshorts: 4,
  tiktok: 5,
  discord: 12,
};

// Minimum gap between consecutive posts on the same platform.
const PLATFORM_MIN_GAP_MS: Record<string, number> = {
  youtube: 6 * 60 * 60_000,         // 6 h between long-form uploads
  youtubeshorts: 90 * 60_000,        // 90 min between Shorts (down from 2 h)
  tiktok: 90 * 60_000,              // 90 min between TikTok posts
  discord: 20 * 60_000,             // 20 min between announcements (down from 30 min)
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

  // Return cached result if fresh — prevents DB burst when many callers fire
  // simultaneously for the same user+platform (observed: 19 at once in prod).
  const cacheKey = `${userId}:${platform}`;
  const cached = _getCachedBudget(cacheKey);
  if (cached) return cached;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // All three DB queries run through the global semaphore so they don't pile
    // onto the connection pool alongside other concurrent callers.
    const [scheduledResult] = await runWithDbLimit(() =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.targetPlatform, platform),
          inArray(autopilotQueue.status, ["scheduled"]),
          gte(autopilotQueue.scheduledAt, todayStart),
          lte(autopilotQueue.scheduledAt, todayEnd),
        ))
    );

    const [publishedResult] = await runWithDbLimit(() =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.targetPlatform, platform),
          inArray(autopilotQueue.status, ["published", "publishing"]),
          gte(autopilotQueue.publishedAt, todayStart),
        ))
    );

    const [lastPost] = await runWithDbLimit(() =>
      db
        .select({ publishedAt: autopilotQueue.publishedAt })
        .from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.targetPlatform, platform),
          eq(autopilotQueue.status, "published"),
        ))
        .orderBy(sql`${autopilotQueue.publishedAt} DESC NULLS LAST`)
        .limit(1)
    );

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

    const result: PlatformBudgetStatus = {
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
    _cacheBudget(cacheKey, result);
    return result;
  } catch (err: any) {
    const isTransient = /timeout|connect|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err?.message || "");
    if (isTransient) {
      logger.warn("Budget status check failed (transient DB error) — allowing optimistically", { userId, platform, error: err.message });
      return {
        platform,
        dailyLimit,
        scheduledToday: 0,
        publishedToday: 0,
        totalToday: 0,
        remaining: 1,
        canPost: true,
        reason: "degraded_allow",
        minGapMs,
        lastPostAt: null,
        gapSatisfied: true,
      };
    }
    logger.warn("Budget status check failed (non-transient) — blocking conservatively", { userId, platform, error: err.message });
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
