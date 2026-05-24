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
 *   upload       6 × 1600 =  9,600  (quota-maximising ceiling — builds 2 days ahead per cycle)
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
  upload:       6,    //  6 × 1600 = 9,600 units — hard max given 10k daily quota
  write:        100,  // unit budget is the real gate (50 units each); COUNT cap raised so it never fires first
  backlogWrite: 100,  // same — unit budget gates this before count
  thumbnail:    50,   // 50 × 50 = 2,500 units; unit budget gates this before count
  broadcast:    40,   // raised: 40 × 50 = 2,000 units — live detection polling
  search:       10,   // raised: 10 × 100 = 1,000 units — search.list
  livechat:     24,   // 24 ×   50 = 1,200 units — AI chat (~2/h over a 12-h stream)
  read:         Infinity,
  list:         Infinity,
  // ──────────────────────────────────────────────────────────────────────────
  // Budget summary (worst case, all caps hit simultaneously):
  //   uploads   6 × 1600 = 9,600
  //   50-unit  (8+8+6+12+24) × 50 = 2,900
  //   reads     ~1,000  (scanners at 90-min intervals)
  //   search    3 × 100 =   300
  //   safety buffer     =   200
  //   ─────────────────────────────────────────
  //   Total               10,800  (slack: the 4 upload slots rarely all hit)
  //   Typical day w/ no stream: 6,400 + ~1,000 reads + 600 = ~8,000
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

    // Each operation type maps to its own dedicated DB column so restart
    // restoration can accurately recover every per-type daily cap.
    const opField = operation === "read" || operation === "list" ? "readOps"
      : operation === "write" || operation === "backlogWrite" || operation === "thumbnail" ? "writeOps"
      : operation === "search" ? "searchOps"
      : operation === "broadcast" ? "broadcastOps"
      : operation === "livechat" ? "livechatOps"
      : "uploadOps"; // actual videos.insert (1600 units each)

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

  // Only videos.insert (upload) bypasses the upload reserve.  Every other
  // operation — including writes, thumbnails, broadcasts, and livechat —
  // must leave UPLOAD_RESERVE units available so uploads are never starved.
  //
  // Previously write/backlogWrite/thumbnail were "Tier 1" and only needed
  // cost + SAFETY_BUFFER (250 units) to run.  This allowed metadata pushes
  // and thumbnail uploads to burn the daily quota down to ~250 units, leaving
  // far less than the 1600 units needed for a single videos.insert — so
  // uploads could never happen despite upload_ops = 0 in the DB every day.
  const isUploadOp = operation === "upload";
  const required = isUploadOp
    ? cost + SAFETY_BUFFER                  // uploads only: just the safety floor
    : cost + SAFETY_BUFFER + UPLOAD_RESERVE; // everything else: preserve room for uploads

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

/**
 * Explicitly clear the in-memory quota circuit breaker.
 * Only call this when you know a new quota day has started (i.e. from initQuotaResetCron).
 * Normal callers should rely on the auto-clear inside isQuotaBreakerTripped().
 */
export function clearQuotaBreaker(): void {
  const prev = _globalQuotaTripDate;
  _globalQuotaTripDate = null;
  if (prev) {
    logger.info("[QuotaBreaker] Circuit breaker explicitly cleared — new quota day started");
  }
}

/**
 * Schedule a recurring midnight-Pacific reset that:
 *  1. Clears the in-memory quota circuit breaker
 *  2. Immediately triggers the back catalog runner
 *  3. Immediately triggers the Shorts + long-form clip publishers
 *
 * Uses getNextResetTime() to schedule precisely to midnight Pacific (handles
 * PST/PDT automatically) and re-schedules itself each night so the server
 * never needs a restart to pick up the new quota day.
 */
let _quotaResetTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancel the midnight-Pacific quota reset cron. Called during graceful shutdown. */
export function stopQuotaResetCron(): void {
  if (_quotaResetTimer !== null) {
    clearTimeout(_quotaResetTimer);
    _quotaResetTimer = null;
    logger.info("[QuotaReset] Cron stopped");
  }
}

export function initQuotaResetCron(): void {
  function scheduleNextReset(): void {
    const now = new Date();
    const nextReset = getNextResetTime();
    const msUntilReset = Math.max(nextReset.getTime() - now.getTime(), 1000);
    const hUntil = Math.round(msUntilReset / 3_600_000 * 10) / 10;
    logger.info(`[QuotaReset] Next midnight-Pacific reset scheduled in ${hUntil} h (${nextReset.toISOString()})`);

    _quotaResetTimer = setTimeout(async () => {
      _quotaResetTimer = null;
      logger.info("[QuotaReset] New quota day — breaker cleared, running publish cycle");
      clearQuotaBreaker();

      // Reset the daily op counters so services don't see a full day of fake usage
      // (the getDailyOpCounter map is keyed by userId — clearing it is safe because
      //  restoreQuotaBreakerOnStartup already handles the restart case).
      // We do this by simply letting the next canAffordOperation() call rebuild
      // the counter from DB (today's record won't exist yet, so it starts at 0).

      try {
        const { runShortsClipPublisher } = await import("./shorts-clip-publisher");
        const { runLongFormClipPublisher } = await import("./long-form-clip-publisher");

        // Publishers run FIRST — the entire purpose of the new quota day is to
        // pre-upload scheduled content to YouTube as private videos with publishAt.
        // Back catalog has its own 22h cycle and must NOT steal upload quota at midnight.
        // Thumbnails, SEO writes, and catalog runs happen later in the day only if
        // upload quota is left over.
        const [shortsResult, longFormResult] = await Promise.allSettled([
          runShortsClipPublisher(),
          runLongFormClipPublisher(),
        ]);
        logger.info("[QuotaReset] Shorts publisher result", shortsResult.status === "fulfilled" ? shortsResult.value : { error: String((shortsResult as PromiseRejectedResult).reason) });
        logger.info("[QuotaReset] Long-form publisher result", longFormResult.status === "fulfilled" ? longFormResult.value : { error: String((longFormResult as PromiseRejectedResult).reason) });
      } catch (err: any) {
        logger.error("[QuotaReset] Midnight publish cycle error:", { error: String(err) });
      }

      // Re-schedule for the NEXT midnight so this runs every night
      scheduleNextReset();
    }, msUntilReset);
  }

  stopQuotaResetCron(); // clear any previously scheduled timer before starting
  scheduleNextReset();
}

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
  // Per-second rate limits (rateLimitExceeded, userRateLimitExceeded) are
  // temporary throttles — NOT daily quota exhaustion.  Never trip the circuit
  // breaker for these: doing so would lock out all publishing for the rest of
  // the day when only a momentary burst caused the 403.
  const reason = String(err?.errors?.[0]?.reason || "").toLowerCase();
  const isRateLimit =
    reason === "ratelimitexceeded" ||
    reason === "userratelimitexceeded" ||
    (msg.includes("ratelimitexceeded") && !msg.includes("daily") && !msg.includes("quotaexceeded"));
  if (isRateLimit) return false;

  if (code === 403 || code === "QUOTA_EXCEEDED" || msg.includes("quota") || msg.includes("dailylimitexceeded")) {
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
      // Each operation type now has its own dedicated DB column, so restoration
      // is exact — no heuristics or combined-column arithmetic needed.
      //
      // PREVIOUS BUG: broadcast and livechat ops were stored in the same
      // `uploadOps` column as real video uploads.  On restart, the formula
      // `counter.upload = min(uploadOps, 4)` set upload=4 once any 4+ broadcast
      // calls had fired, permanently blocking all video uploads for the rest of
      // the day — even though zero real uploads had occurred.  The new dedicated
      // columns fix that entirely.
      const counter = getDailyOpCounter(userId);
      counter.upload       = Math.min(record.uploadOps    ?? 0, DAILY_OP_CAPS.upload);
      counter.broadcast    = Math.min(record.broadcastOps ?? 0, DAILY_OP_CAPS.broadcast);
      counter.livechat     = Math.min(record.livechatOps  ?? 0, DAILY_OP_CAPS.livechat);
      // writeOps stores write + backlogWrite + thumbnail combined (no separate column).
      // Divide evenly across the three types — triple-counting the full writeOps
      // value into each counter over-inflates all three and can block thumbnails
      // prematurely when writeOps exceeds the thumbnail cap (50).
      const writeOpsEach = Math.ceil((record.writeOps ?? 0) / 3);
      counter.write        = Math.min(writeOpsEach, DAILY_OP_CAPS.write);
      counter.backlogWrite = Math.min(writeOpsEach, DAILY_OP_CAPS.backlogWrite);
      counter.thumbnail    = Math.min(writeOpsEach, DAILY_OP_CAPS.thumbnail);
      counter.search       = Math.min(record.searchOps ?? 0, DAILY_OP_CAPS.search);

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


/**
 * Hourly budget limiter — prevents front-loading all quota in the first few hours.
 * YouTube resets quota at midnight Pacific (UTC-7 / UTC-8 depending on DST).
 * We divide the day into hourly windows and limit consumption per window.
 *
 * Without this, a restart at any point could burn through the entire daily
 * budget in minutes as dozens of services fire simultaneously.
 */
const HOURLY_BUDGET_FRACTION = 0.08; // Max 8% of daily quota per hour (allows some burst)

export function getHourlyBudget(dailyLimit: number = DEFAULT_DAILY_LIMIT): number {
  return Math.floor(dailyLimit * HOURLY_BUDGET_FRACTION);
}

/**
 * Check if we've exceeded the hourly budget pace.
 * Returns true if we should throttle (slow down API calls).
 */
export async function isHourlyBudgetExceeded(userId: string): Promise<boolean> {
  const record = await getOrCreateDailyRecord(userId);
  const hourlyBudget = getHourlyBudget(record.quotaLimit);

  // Calculate hours elapsed since midnight Pacific
  const now = new Date();
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const hoursElapsed = pacific.getHours() + (pacific.getMinutes() / 60);

  // Expected budget at this point in the day
  const expectedBudget = Math.floor(hoursElapsed * hourlyBudget);

  // If we've used more than expected, we're front-loading
  return record.unitsUsed > expectedBudget + hourlyBudget; // allow 1 hour burst
}
