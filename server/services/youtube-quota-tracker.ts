import { db } from "../db";
import { youtubeQuotaUsage } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("youtube-quota-tracker");

/**
 * Official YouTube Data API v3 quota costs per endpoint call.
 * https://developers.google.com/youtube/v3/determine_quota_cost
 */
const QUOTA_COSTS = {
  read: 1,           // channels.list, videos.list, playlistItems.list, etc.
  list: 1,           // alias for read
  search: 100,       // search.list — very expensive, use sparingly
  write: 50,         // videos.update, playlists.insert, playlistItems.insert
  upload: 1600,      // videos.insert
  thumbnail: 50,     // thumbnails.set
  broadcast: 50,     // liveBroadcasts.list, liveBroadcasts.insert
  livechat: 50,      // liveChatMessages.insert, comments.insert, commentThreads.insert
} as const;

type QuotaOperation = keyof typeof QUOTA_COSTS;

/**
 * Shared in-memory liveChatId cache — so live-chat-agent, stream-idle-engagement,
 * and live-revenue-activator all share one broadcast lookup per active stream
 * instead of each independently calling liveBroadcasts.list (50 units each).
 */
interface LiveChatEntry {
  liveChatId: string | null;
  broadcastId?: string;
  resolvedAt: number;
  ttlMs: number;
}
const _liveChatCache = new Map<number, LiveChatEntry>();
const LIVE_CHAT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function cacheLiveChatId(channelDbId: number, liveChatId: string | null, broadcastId?: string): void {
  _liveChatCache.set(channelDbId, {
    liveChatId,
    broadcastId,
    resolvedAt: Date.now(),
    ttlMs: LIVE_CHAT_CACHE_TTL_MS,
  });
}

export function getCachedLiveChatId(channelDbId: number): { liveChatId: string | null; hit: boolean } {
  const entry = _liveChatCache.get(channelDbId);
  if (!entry) return { liveChatId: null, hit: false };
  if (Date.now() - entry.resolvedAt > entry.ttlMs) {
    _liveChatCache.delete(channelDbId);
    return { liveChatId: null, hit: false };
  }
  return { liveChatId: entry.liveChatId, hit: true };
}

export function invalidateLiveChatCache(channelDbId: number): void {
  _liveChatCache.delete(channelDbId);
}

const DEFAULT_DAILY_LIMIT = 10000;
const SAFETY_BUFFER = 200; // Hard floor — never go below this for any operation

/**
 * Upload / write reserve — quota headroom that is always kept available
 * for uploads and metadata updates, which have NO non-API alternative.
 *
 * 2 uploads/day  × 1600 units = 3200
 * 10 metadata updates × 50 units =  500
 * ─────────────────────────────────────
 * Total reserve                   3700  (rounded up to 4000 for safety margin)
 *
 * Operations that HAVE non-API alternatives (reads, list, scraping-backed
 * catalog indexing) must check canAffordOperation() which enforces this
 * reserve so uploads and metadata always have room to run.
 *
 * Operations with NO alternative (upload, write, thumbnail) bypass the
 * reserve and only require the hard SAFETY_BUFFER floor.
 */
const UPLOAD_RESERVE = 4000;

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

/**
 * Two-tier quota gate:
 *
 *  TIER 1 — no-alternative operations (upload, write, thumbnail):
 *    Allowed as long as remaining >= cost + SAFETY_BUFFER.
 *    These use the quota first because there is no other way to accomplish them.
 *
 *  TIER 2 — has-alternative operations (read, list, search, broadcast, livechat):
 *    Allowed only when remaining >= cost + SAFETY_BUFFER + UPLOAD_RESERVE.
 *    These must leave room for Tier-1 uploads/updates and should prefer
 *    their non-API alternatives (yt-dlp scraping, page scraping) whenever
 *    possible — only falling back to the API when alternatives are exhausted.
 */
export async function canAffordOperation(userId: string, operation: QuotaOperation, count: number = 1): Promise<boolean> {
  const status = await getQuotaStatus(userId);
  const cost = QUOTA_COSTS[operation] * count;

  const isTier1 = operation === "upload" || operation === "write" || operation === "thumbnail";
  const required = isTier1
    ? cost + SAFETY_BUFFER                  // Tier 1: just the floor
    : cost + SAFETY_BUFFER + UPLOAD_RESERVE; // Tier 2: must leave room for uploads

  return status.remaining >= required;
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

/**
 * Called once at server startup — reads today's quota record from the DB
 * and pre-trips the in-memory circuit breaker if the quota is already exhausted.
 *
 * Without this, every deploy resets the in-memory breaker to "not tripped."
 * All background services then simultaneously fire YouTube API calls on boot,
 * hit 403 quota-exceeded errors, and waste the startup window before the
 * breaker finally trips from the first 403 response.
 *
 * With this call early in startup, the breaker is armed before any service
 * runs, so zero wasted calls happen if the quota was spent before the deploy.
 */
export async function restoreQuotaBreakerOnStartup(): Promise<void> {
  try {
    const allUsers = await getQuotaForAllUsers();
    const exhausted = allUsers.find(u => u.isExceeded || u.remaining < SAFETY_BUFFER);
    if (exhausted) {
      tripGlobalQuotaBreaker();
      logger.info(`[QuotaBreaker] Startup restore: quota exhausted for user ${exhausted.userId} (${exhausted.remaining} remaining) — circuit breaker pre-tripped until midnight Pacific`);
    } else {
      logger.info(`[QuotaBreaker] Startup restore: quota healthy — breaker stays open`);
    }
  } catch (err: any) {
    logger.warn(`[QuotaBreaker] Could not restore state from DB on startup (non-fatal): ${err.message}`);
  }
}

export { QUOTA_COSTS, type QuotaOperation, getPacificDate, getNextResetTime };
