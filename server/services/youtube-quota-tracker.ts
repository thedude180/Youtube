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
  write: 50,         // videos.update for NEW content (new uploads, autopilot, user-triggered)
  backlogWrite: 50,  // videos.update via youtube-push-backlog (retroactive metadata optimisation)
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

/**
 * Daily operation COUNT caps — independent of unit budget.
 *
 * Even if units remain, these hard limits prevent any single operation type
 * from monopolising the full daily budget.  They are enforced in-memory
 * (per Pacific date) so the check adds zero DB round-trips to the hot path.
 *
 * Budget breakdown at these caps:
 *   upload       4 × 1600 =  6,400  (hard ceiling; studio uploads rarely reach 4)
 *   write       20 ×   50 =  1,000  (NEW content only: new uploads, autopilot, user-triggered)
 *   backlogWrite 20 ×   50 =  1,000  (retroactive backlog optimisation of existing videos)
 *   thumbnail   20 ×   50 =  1,000  (AI thumbnail uploads spread across 24 h)
 *   broadcast   40 ×   50 =  2,000  (live detection during an active stream)
 *   search       3 × 100  =    300  (search.list is 100 units — use sparingly)
 *   read/list/livechat: uncapped (1 unit each, negligible)
 *   ──────────────────────────────────────
 *   Worst-case total              11,700  (all caps hit simultaneously — rare)
 *   Normal daily usage            ~3,000–6,000 units with typical streaming
 *
 * IMPORTANT: write vs backlogWrite separation
 *   "write"       — new content publishing paths (videos.update for just-uploaded
 *                   content, autopilot pushes, user-triggered updates). Always
 *                   has its own 20-op budget so new content is never blocked by
 *                   backlog activity.
 *   "backlogWrite" — youtube-push-backlog retroactive metadata optimisation of
 *                   existing videos.  Has its own independent 20-op budget so
 *                   heavy backlog processing cannot starve new content.
 *
 * The unit-budget gate in canAffordOperation() is still the ultimate backstop.
 */
const DAILY_OP_CAPS: Record<string, number> = {
  upload:      4,
  write:       20,
  backlogWrite: 20,
  thumbnail:   20,
  broadcast:   20,   // 20 × 50 = 1,000 units — enough for live detection + chat startup
  search:      3,
  livechat:    60,   // 60 × 50 = 3,000 units — caps chat inserts so a 12-h stream can't drain the day
  read:        Infinity,
  list:        Infinity,
};

interface DailyOpCounter {
  date: string;
  upload: number;
  write: number;
  backlogWrite: number;
  thumbnail: number;
  broadcast: number;
  search: number;
  livechat: number;
}

const _dailyOpCounters = new Map<string, DailyOpCounter>();

function getDailyOpCounter(userId: string): DailyOpCounter {
  const today = getPacificDate();
  const existing = _dailyOpCounters.get(userId);
  if (existing && existing.date === today) return existing;
  const fresh: DailyOpCounter = { date: today, upload: 0, write: 0, backlogWrite: 0, thumbnail: 0, broadcast: 0, search: 0, livechat: 0 };
  _dailyOpCounters.set(userId, fresh);
  return fresh;
}

function incrementDailyOpCounter(userId: string, operation: string): void {
  const counter = getDailyOpCounter(userId);
  if (operation in counter && operation !== "date") {
    (counter as any)[operation] = ((counter as any)[operation] ?? 0) + 1;
  }
}

export function getDailyOpCounts(userId: string): Record<string, number> {
  const c = getDailyOpCounter(userId);
  return {
    upload: c.upload,
    write: c.write,
    backlogWrite: c.backlogWrite,
    thumbnail: c.thumbnail,
    broadcast: c.broadcast,
    search: c.search,
    livechat: c.livechat,
  };
}

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
      : operation === "write" || operation === "backlogWrite" || operation === "thumbnail" ? "writeOps"
      : operation === "search" ? "searchOps"
      : "uploadOps";

    await db.update(youtubeQuotaUsage)
      .set({
        unitsUsed: sql`${youtubeQuotaUsage.unitsUsed} + ${cost}`,
        [opField]: sql`${youtubeQuotaUsage[opField as keyof typeof youtubeQuotaUsage]} + ${count}`,
        lastUpdatedAt: new Date(),
      } as any)
      .where(eq(youtubeQuotaUsage.id, record.id));

    // Mirror into in-memory daily op counter so canAffordOperation() can
    // enforce count caps without an extra DB round-trip.
    for (let i = 0; i < count; i++) incrementDailyOpCounter(userId, operation);
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
  // Gate 1: daily operation COUNT cap (in-memory, zero DB round-trips).
  // Prevents any one operation type from monopolising the unit budget even when
  // units appear plentiful (e.g. metadata pushes at midnight burning all 10k units).
  const cap = DAILY_OP_CAPS[operation];
  if (isFinite(cap)) {
    const counter = getDailyOpCounter(userId);
    const todayCount = (counter as any)[operation] ?? 0;
    if (todayCount + count > cap) {
      logger.info(`[QuotaTracker] Daily op cap reached for "${operation}": ${todayCount}/${cap} — operation blocked until midnight Pacific`);
      return false;
    }
  }

  // Gate 2: unit budget check.
  const status = await getQuotaStatus(userId);
  const cost = QUOTA_COSTS[operation] * count;

  const isTier1 = operation === "upload" || operation === "write" || operation === "backlogWrite" || operation === "thumbnail";
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
 * Stamps the DB record for today as fully exhausted the moment a 403 quota
 * error is returned from Google.
 *
 * trackQuotaUsage() only increments usage for *successful* API calls, so the
 * DB can underestimate real consumption by thousands of units when calls fail
 * with 403.  On the next server restart, restoreQuotaBreakerOnStartup() reads
 * that stale DB value, concludes quota is healthy, and the startup burst fires
 * again.  persistQuotaExhaustion() closes that gap: it sets unitsUsed = quotaLimit
 * so every subsequent canAffordOperation() and restoreQuotaBreakerOnStartup()
 * call sees the true "fully exhausted" state.
 */
export async function persistQuotaExhaustion(userId: string): Promise<void> {
  try {
    const record = await getOrCreateDailyRecord(userId);
    if (record.unitsUsed < record.quotaLimit) {
      await db.update(youtubeQuotaUsage)
        .set({ unitsUsed: record.quotaLimit, lastUpdatedAt: new Date() })
        .where(eq(youtubeQuotaUsage.id, record.id));
      logger.info(`[QuotaTracker] Persisted exhaustion to DB for user ${userId} — unitsUsed stamped to ${record.quotaLimit}`);
    }
  } catch (err: any) {
    logger.warn(`[QuotaTracker] Failed to persist quota exhaustion (non-fatal): ${err.message}`);
  }
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
    const today = getPacificDate();
    const allRecords = await db.select().from(youtubeQuotaUsage)
      .where(eq(youtubeQuotaUsage.date, today));

    for (const record of allRecords) {
      const userId = record.userId;

      // Restore in-memory daily op counters from DB so post-deploy restarts
      // don't reset count caps to zero and allow another burst.
      //
      // DB stores writeOps as write+thumbnail combined (no separate column).
      // Seed both write and thumbnail conservatively with writeOps so neither
      // cap is exceeded if the full writeOps budget was already spent on one type.
      const counter = getDailyOpCounter(userId);
      counter.write        = Math.min(record.writeOps ?? 0, DAILY_OP_CAPS.write);
      counter.backlogWrite = Math.min(record.writeOps ?? 0, DAILY_OP_CAPS.backlogWrite);
      counter.thumbnail    = Math.min(record.writeOps ?? 0, DAILY_OP_CAPS.thumbnail);
      counter.search    = Math.min(record.searchOps ?? 0, DAILY_OP_CAPS.search);
      counter.upload    = Math.min(record.uploadOps ?? 0, DAILY_OP_CAPS.upload);

      // Restore broadcast + livechat from DB.
      //
      // The DB `uploadOps` column stores the combined count of upload + broadcast +
      // livechat operations (all go to the same DB field in trackQuotaUsage).
      // Subtract the actual upload count to get the broadcast+livechat ops already fired.
      //
      // CONSERVATIVE RESTORE: both broadcast AND livechat are capped against the
      // full nonUploadOps value (not nonUploadOps minus broadcast).  If the server
      // restarts before the DB has fully flushed in-flight ops (a race condition),
      // the old "subtract broadcast first" formula understated livechat usage and
      // allowed another burst of ~50 × 50-unit chat inserts to fire.  Using the
      // larger base ensures we never under-restore livechat at the cost of a few
      // fewer AI chat messages — a safe trade.
      const nonUploadOps = Math.max(0, (record.uploadOps ?? 0) - counter.upload);
      counter.broadcast = Math.min(nonUploadOps, DAILY_OP_CAPS.broadcast);
      counter.livechat  = Math.min(nonUploadOps, DAILY_OP_CAPS.livechat);

      const isExhausted = record.unitsUsed >= record.quotaLimit;
      const isNearLimit = record.quotaLimit - record.unitsUsed < SAFETY_BUFFER;
      if (isExhausted || isNearLimit) {
        tripGlobalQuotaBreaker();
        logger.info(
          `[QuotaBreaker] Startup restore: quota exhausted for user ${userId} ` +
          `(${record.quotaLimit - record.unitsUsed} remaining) — circuit breaker pre-tripped until midnight Pacific`
        );
      }

      logger.info(
        `[QuotaBreaker] Startup op-counter restore for ${userId}: ` +
        `write=${counter.write}/${DAILY_OP_CAPS.write} ` +
        `backlogWrite=${counter.backlogWrite}/${DAILY_OP_CAPS.backlogWrite} ` +
        `thumbnail=${counter.thumbnail}/${DAILY_OP_CAPS.thumbnail} ` +
        `search=${counter.search}/${DAILY_OP_CAPS.search} ` +
        `upload=${counter.upload}/${DAILY_OP_CAPS.upload} ` +
        `broadcast=${counter.broadcast}/${DAILY_OP_CAPS.broadcast} ` +
        `livechat=${counter.livechat}/${DAILY_OP_CAPS.livechat}`
      );
    }

    if (allRecords.length === 0) {
      logger.info(`[QuotaBreaker] Startup restore: no quota records for today — breaker stays open, counters at zero`);
    }
  } catch (err: any) {
    logger.warn(`[QuotaBreaker] Could not restore state from DB on startup (non-fatal): ${err.message}`);
  }
}

/**
 * Check whether there is enough quota to perform a catalog listing operation
 * (channels.list, playlistItems.list, videos.list for indexing).
 *
 * Unlike canAffordOperation("read"), this does NOT require leaving the full
 * UPLOAD_RESERVE headroom — because listing the channel catalog costs ~27 units
 * for 1340 videos, which is negligible compared to a 1600-unit upload.
 * We only require the hard SAFETY_BUFFER floor (200 units) so that metadata
 * writes can always complete even if listing runs first.
 *
 * The quota breaker still blocks listing when it is fully tripped (quota = 0).
 */
export async function canAffordCatalogListing(userId: string, estimatedUnits: number = 50): Promise<boolean> {
  if (isQuotaBreakerTripped()) return false;
  const status = await getQuotaStatus(userId);
  return status.remaining >= estimatedUnits + SAFETY_BUFFER;
}

export { QUOTA_COSTS, type QuotaOperation, getPacificDate, getNextResetTime };
