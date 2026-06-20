import { db } from "../db";
import { youtubeQuotaUsage, channels } from "@shared/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";

import { createLogger } from "../lib/logger";
import { logIncidentOnce } from "../lib/incident-log";

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
 * Upload / write reserve — quota headroom kept available for the ONE remaining
 * upload slot that hasn't fired yet today.  Non-upload ops must leave this
 * much room for the next videos.insert call.
 *
 * 1 upload slot × 1600 units = 1600
 * safety margin              =  200
 * ────────────────────────────────────
 * Reserve                      1800
 *
 * Previously 4000 (2 uploads + 10 writes), which blocked ALL writes/thumbnails
 * after only 5,750 of 10,000 units were used — confirmed Jun 12 2026 via
 * Google Cloud Console showing 4,786 units used when breaker fired.
 * With 1,800: non-upload ops are blocked only when < 2,050 units remain
 * (i.e. after 7,950+ units used), recovering ~2,200 usable units per day.
 *
 * Operations with NO alternative (upload, write, thumbnail) bypass the
 * reserve and only require the hard SAFETY_BUFFER floor.
 */
const UPLOAD_RESERVE = 1800;

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

  try {
    const existing = await db.select().from(youtubeQuotaUsage)
      .where(and(eq(youtubeQuotaUsage.userId, userId), eq(youtubeQuotaUsage.date, today)))
      .limit(1);

    if (existing.length > 0) return existing[0];
  } catch (selectErr: any) {
    // Production schema may be missing new columns (e.g. broadcast_ops, livechat_ops)
    // until db:push runs against prod.  Return a synthetic zero-usage record so
    // uploads are never blocked by a schema migration lag.
    logger.warn(`[QuotaTracker] SELECT failed (schema mismatch?) — returning safe fallback record for ${userId}: ${selectErr?.message?.slice(0, 120)}`);
    return {
      id: -1,
      userId,
      date: today,
      unitsUsed: 0,
      readOps: 0,
      writeOps: 0,
      searchOps: 0,
      uploadOps: 0,
      broadcastOps: 0,
      livechatOps: 0,
      quotaLimit: DEFAULT_DAILY_LIMIT,
      lastUpdatedAt: new Date(),
    };
  }

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
      try {
        const [record] = await db.select().from(youtubeQuotaUsage)
          .where(and(eq(youtubeQuotaUsage.userId, userId), eq(youtubeQuotaUsage.date, today)))
          .limit(1);
        return record;
      } catch {
        // fallback below
      }
    }
    // INSERT also failed (e.g. missing column in INSERT list) — return safe fallback
    logger.warn(`[QuotaTracker] INSERT failed — returning safe fallback record for ${userId}: ${err?.message?.slice(0, 120)}`);
    return {
      id: -1,
      userId,
      date: today,
      unitsUsed: 0,
      readOps: 0,
      writeOps: 0,
      searchOps: 0,
      uploadOps: 0,
      broadcastOps: 0,
      livechatOps: 0,
      quotaLimit: DEFAULT_DAILY_LIMIT,
      lastUpdatedAt: new Date(),
    };
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
    import("../lib/system-load").then(m => m.pushLoadSignal({ quotaTripped: false })).catch(() => {});
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

        // ── SEQUENTIAL, not parallel ────────────────────────────────────────────
        // The Shorts cadence gate queries countUploadedLongFormForDate(today).
        // At the exact moment of reset that count is always 0 (fresh day).
        // Running both publishers in parallel means the gate fires before long-form
        // has finished uploading → Shorts yield EVERY midnight even when items are
        // ready. Sequential execution (long-form → wait 3 s → shorts) guarantees the
        // DB write for the long-form upload commits before Shorts checks the gate.

        // ── IO gate: exclusive bandwidth for the midnight publish window ──────────
        // Acquire the single heavy-I/O slot so no vault download is running
        // concurrently, stealing bandwidth while videos go up to YouTube.
        // The perpetual downloader already skips its cycle in the ±15/30-min
        // reset window, so in practice this acquires immediately — but we gate
        // defensively so any edge-case download must yield before we upload.
        const { acquireIOSlot, releaseIOSlot } = await import("../lib/io-gate");
        logger.info("[QuotaReset] Acquiring IO slot — exclusive bandwidth for midnight publish");
        await acquireIOSlot("quota-reset-cron");

        // Declare with let so the brain-snapshot block below can reference them
        // after the IO slot has already been released.
        let longFormResult: any = { published: 0, failed: 0, skipped: 0, quotaExhausted: false };
        let shortsResult:   any = { published: 0, failed: 0, skipped: 0, quotaExhausted: false };
        let totalPublished = 0;

        try {
          // ── Drain helper ──────────────────────────────────────────────────────
          // Loops the publisher until it returns published=0 (nothing due) or
          // quotaExhausted.  Two-second gap between rounds lets YouTube's ingest
          // pipeline settle.  maxRounds is a safety cap — should never be hit.
          const drainPublisher = async (
            label: string,
            runFn: () => Promise<any>,
            maxRounds: number,
          ): Promise<{ published: number; failed: number; skipped: number; quotaExhausted: boolean }> => {
            let published = 0, failed = 0, skipped = 0, quotaExhausted = false;
            for (let round = 0; round < maxRounds; round++) {
              if (round > 0) await new Promise(rr => setTimeout(rr, 2_000));
              const r: any = await runFn().catch(
                (e: unknown) => ({ published: 0, failed: 0, skipped: 0, quotaExhausted: false, error: String(e) }),
              );
              logger.info(`[QuotaReset] ${label} #${round + 1}:`, r);
              published += r.published ?? 0;
              failed    += r.failed    ?? 0;
              skipped   += r.skipped   ?? 0;
              if ((r.published ?? 0) === 0) break; // nothing left due right now
              if (r.quotaExhausted) { quotaExhausted = true; break; }
            }
            return { published, failed, skipped, quotaExhausted };
          };

          // ── Phase 1: drain long-form (normally 1/day; cap 5 rounds) ──────────
          // All long-form items go out FIRST so the Shorts cadence gate sees the
          // daily long-form count before any short is published.
          // Re-clear the breaker right before each publisher phase.
          // A concurrent service (quota-reset-audit, analytics warm-up) can
          // re-trip it in the same clock-second as the midnight reset.
          // Both publisher calls also receive bypassBreakerCheck:true so they
          // proceed even if another race-trip happens between here and their
          // internal breaker check.
          clearQuotaBreaker();
          logger.info("[QuotaReset] Phase 1 — draining long-form queue…");
          longFormResult = await drainPublisher("long-form", () => runLongFormClipPublisher({ bypassBreakerCheck: true }), 5);
          logger.info(`[QuotaReset] Long-form drain complete: ${longFormResult.published} published`);

          // 3 s breathing room so the DB write is visible to the Shorts cadence gate
          await new Promise(r => setTimeout(r, 3_000));

          // ── Phase 2: drain shorts (normally 3/day; cap 10 rounds) ────────────
          // Items publish in strict priority order (stream clips → new content →
          // back-catalog; BF6 first; then scheduledAt ASC; then viralScore DESC).
          // Every due item at reset goes out in sequence — 1, 2, 3 — before the
          // IO gate is released or any download can restart.
          clearQuotaBreaker();
          logger.info("[QuotaReset] Phase 2 — draining shorts queue…");
          shortsResult = await drainPublisher("shorts", () => runShortsClipPublisher({ bypassBreakerCheck: true }), 10);
          logger.info(`[QuotaReset] Shorts drain complete: ${shortsResult.published} published`);

          totalPublished = (longFormResult.published ?? 0) + (shortsResult.published ?? 0);

          // ── Zero-result safety net ─────────────────────────────────────────────
          // If every drain returned published=0 it usually means both perpetual
          // loops held isRunning=true (lock contention at reset).  Wait 2 min for
          // those runs to finish, then attempt a full drain again.
          if (totalPublished === 0 && !longFormResult.quotaExhausted && !shortsResult.quotaExhausted) {
            logger.info("[QuotaReset] Nothing published on first attempt — retrying in 2 min (probable isRunning contention)");
            await new Promise(r => setTimeout(r, 2 * 60_000));

            clearQuotaBreaker();
            const retryLf = await drainPublisher("retry long-form", () => runLongFormClipPublisher({ bypassBreakerCheck: true }), 5);
            logger.info("[QuotaReset] Retry long-form drain:", retryLf);
            await new Promise(r => setTimeout(r, 3_000));
            clearQuotaBreaker();
            const retrySp = await drainPublisher("retry shorts", () => runShortsClipPublisher({ bypassBreakerCheck: true }), 10);
            logger.info("[QuotaReset] Retry shorts drain:", retrySp);

            longFormResult.published = (longFormResult.published ?? 0) + (retryLf.published ?? 0);
            shortsResult.published   = (shortsResult.published   ?? 0) + (retrySp.published ?? 0);
            totalPublished           = (longFormResult.published ?? 0) + (shortsResult.published ?? 0);

            if ((retryLf.published ?? 0) + (retrySp.published ?? 0) === 0) {
              logger.warn("[QuotaReset] Still 0 published after retry — seeding queue from back-catalog (Phase 3)");

              // ── Phase 3: Emergency post-reset queue seed ───────────────────────
              // The queue was genuinely empty at reset — back-catalog runner hadn't
              // fired yet (it targets reset+2min). Seed it NOW so the pre-encoder
              // can encode clips and the hourly sweep publishes them ~15 min later.
              // Runs fire-and-forget outside the IO slot so downloads/uploads can
              // proceed independently. A final publish pass fires after 12 min.
              const _rfp = { runShortsClipPublisher, runLongFormClipPublisher };
              setImmediate(async () => {
                try {
                  logger.info("[QuotaReset] Phase 3: seeding queue from back-catalog…");
                  const { runBackCatalogForAllEligibleUsers } = await import("./youtube-back-catalog-runner");
                  await Promise.race([
                    runBackCatalogForAllEligibleUsers(),
                    new Promise<void>(r => setTimeout(r, 5 * 60_000)), // 5-min cap
                  ]);
                  logger.info("[QuotaReset] Phase 3: seeding done — triggering pre-encode");

                  // Kick off a pre-encode cycle so items are ready faster
                  import("./pre-encoder").then(m => m.runPreEncodeCycle().catch(() => {})).catch(() => {});

                  // Wait for pre-encoder to work through a cycle (~10 min), then publish
                  await new Promise(r => setTimeout(r, 10 * 60_000));
                  clearQuotaBreaker();
                  const lf3 = await _rfp.runLongFormClipPublisher({ bypassBreakerCheck: true }).catch(() => ({ published: 0 }));
                  await new Promise(r => setTimeout(r, 3_000));
                  clearQuotaBreaker();
                  const sp3 = await _rfp.runShortsClipPublisher({ bypassBreakerCheck: true }).catch(() => ({ published: 0 }));
                  const p3 = ((lf3 as any).published ?? 0) + ((sp3 as any).published ?? 0);
                  if (p3 > 0) {
                    logger.info(`[QuotaReset] Phase 3 success — ${p3} video(s) published after seeding`);
                  } else {
                    logger.info("[QuotaReset] Phase 3 complete — items queued; hourly sweep will publish them");
                  }
                } catch (e: any) {
                  logger.warn("[QuotaReset] Phase 3 failed (non-fatal):", e?.message);
                }
              });
            }
          }
        } finally {
          releaseIOSlot("quota-reset-cron");
        }

        // ── Brain context snapshot ─────────────────────────────────────────────
        // Write a reset-time snapshot so the brain's daily cycle knows exactly
        // what was uploaded at midnight and what remains in the queue.
        try {
          const { db: _db }          = await import("../db");
          const { autopilotQueue: _aq } = await import("@shared/schema");
          const { eq: _eq, sql: _sql }  = await import("drizzle-orm");
          const { recordOutcome }       = await import("../lib/outcome-recorder");
          const { storage: _stor }      = await import("../storage");

          const [pendingRow] = await _db
            .select({
              shorts:   _sql<number>`COUNT(*) FILTER (WHERE ${_aq.metadata}->>'contentType' = 'youtube-short' OR ${_aq.type} IN ('youtube_short','vod-short'))`,
              longForm: _sql<number>`COUNT(*) FILTER (WHERE ${_aq.metadata}->>'contentType' IN ('long-form-clip','long-form','vod_long_form'))`,
            })
            .from(_aq)
            .where(_eq(_aq.status, "scheduled"))
            .catch(() => [] as any[]);

          const shortsQ   = Number((pendingRow as any)?.shorts   ?? 0);
          const longFormQ = Number((pendingRow as any)?.longForm  ?? 0);

          const allUsers = await _stor.getAllUsers().catch(() => [] as any[]);
          const brainUid = allUsers[0]?.id;
          if (brainUid) {
            await recordOutcome({
              engine:     "quota-reset-cron",
              userId:     brainUid,
              category:   "midnight_reset_snapshot",
              summary:    `Midnight quota reset: ${totalPublished} video(s) published — ${shortsQ} shorts + ${longFormQ} long-form remain queued`,
              metrics:    {
                totalPublished,
                longFormPublished: longFormResult.published ?? 0,
                shortsPublished:   shortsResult.published  ?? 0,
                shortsQueued:      shortsQ,
                longFormQueued:    longFormQ,
                hourUTC:           new Date().getUTCHours(),
              },
              confidence: totalPublished > 0 ? 0.92 : 0.5,
              recommendation: totalPublished > 0
                ? "Publishing healthy — content will go live on schedule. Review in 48h for performance data."
                : "Zero published at reset — check OAuth token health and queue depth in the morning.",
            });
          }
        } catch { /* non-critical — never block publishing over a logging failure */ }

        // ── Back-catalog SEO ───────────────────────────────────────────────────
        // Fire 30 min after publishers — uses leftover quota to update
        // title/description/tags on worst-performing back-catalog videos.
        setTimeout(async () => {
          try {
            const { runBackCatalogSeoEngine } = await import("./back-catalog-seo-engine");
            const r = await runBackCatalogSeoEngine();
            logger.info("[QuotaReset] SEO engine complete", r);
          } catch (err2: any) {
            logger.warn("[QuotaReset] SEO engine error", { error: String(err2) });
          }
        }, 30 * 60_000);
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
    // Capture the call stack so we can identify which service triggered the trip.
    // Only the first 6 frames are useful — everything above that is node internals.
    const callerStack = new Error().stack
      ?.split("\n")
      .slice(1, 7)
      .map(l => l.trim().replace(/^\s*at\s*/, ""))
      .join(" | ") ?? "unknown";
    logger.warn(`[QuotaBreaker] YouTube API quota circuit breaker TRIPPED for ${today} — all YouTube API calls blocked until midnight Pacific`, { callerStack });
    import("../lib/system-load").then(m => m.pushLoadSignal({ quotaTripped: true })).catch(() => {});

    // Record to learning_insights so the brain can detect time-of-day patterns
    // (e.g., "quota trips at 11am Pacific on 4/5 recent days → front-load publishing").
    // Fire-and-forget — never await in this synchronous hot path.
    const tripHour = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", hour12: false,
    });
    import("../lib/system-telemetry").then(({ recordSystemEvent }) => {
      recordSystemEvent({
        engine: "quota-tracker",
        event:  "quota_trip",
        summary: `YouTube quota circuit breaker tripped for ${today} at ~${tripHour}:xx Pacific — all API calls blocked until midnight`,
        metrics: {
          tripDate:     today,
          pacificHourOverride: parseInt(tripHour, 10),
          callerContext: callerStack.split("|")[0]?.trim().slice(0, 100) ?? "unknown",
        },
        recommendation:
          "If quota consistently trips before noon Pacific, front-load all publishing to 07:00–10:00 Pacific immediately after the midnight quota reset.",
        debounce: false, // always record first trip of the day
      }).catch(() => {});
    }).catch(() => {});

    // Tell the brain — promoted to masterKnowledgeBank on next daily cycle so
    // the orchestrator learns time-of-day quota patterns and can front-load publishing.
    logIncidentOnce({
      category: "quota_breach",
      service:  "youtube-quota-tracker",
      severity: "high",
      rootCause: `YouTube Data API quota circuit breaker tripped for ${today} — all API calls blocked until midnight Pacific. ` +
                 `First caller: ${callerStack.split("|")[0]?.trim().slice(0, 120) ?? "unknown"}.`,
      lesson: "Quota trips daily if metadata sweeps or optimizer loops run within 2h of the quota-reset window without a headroom guard. " +
              "Always gate bulk-write loops with canAffordOperation() requiring ≥2000 unit headroom before starting.",
      tags:    ["quota", "circuit-breaker", "daily-trip"],
    }).catch(() => {});

    // Write to permanent event log — brain queries quota trip frequency and time-of-day
    import("../lib/event-log").then(({ logEvent }) =>
      logEvent({
        eventType: "quota",
        service:   "quota-tracker",
        title:     `YouTube quota circuit breaker tripped for ${today} at ~${tripHour}:xx Pacific`,
        detail:    {
          tripDate:    today,
          pacificHour: parseInt(tripHour, 10),
          caller:      callerStack.split("|")[0]?.trim().slice(0, 100) ?? "unknown",
        },
        severity:  "warn",
      })
    ).catch(() => {});
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
  const status = err?.status ?? err?.statusCode;
  const reason = String(err?.errors?.[0]?.reason || "").toLowerCase();

  // ── 401 Unauthorized ─────────────────────────────────────────────────────
  // Auth failures (missing/expired/revoked OAuth token) are NOT quota errors.
  // Never trip the breaker for 401 — the fix is reconnecting the channel, not
  // waiting until midnight.
  if (code === 401 || status === 401 || msg.includes("unauthorized") || msg.includes("invalid_grant") || msg.includes("token has been expired")) {
    return false;
  }

  // ── Internal pre-gate errors ──────────────────────────────────────────────
  // canAffordOperation() returns false before calling the YouTube API and the
  // caller throws with { code: "QUOTA_EXCEEDED" } (a string, not an HTTP status).
  // These mean "our internal budget gate blocked this call" — NOT that YouTube
  // returned a 403.  Real YouTube quota errors always have a numeric HTTP status
  // code or an errors[] array from the Google API client.  Tripping the global
  // circuit breaker on internal pre-gate errors kills all publishers for the
  // rest of the day based on one service being at its local budget ceiling,
  // even if plenty of real quota units remain (confirmed: Jun 12 2026 — breaker
  // tripped at 4,786/10,000 units used because studio-publisher threw this).
  const isInternalPreGate = code === "QUOTA_EXCEEDED" && !status && !err?.errors && !err?.response;
  if (isInternalPreGate) return false;

  // ── Per-second rate limits ────────────────────────────────────────────────
  // Temporary throttles — NOT daily quota exhaustion.  Never trip the circuit
  // breaker for these: doing so would lock out all publishing for the rest of
  // the day when only a momentary burst caused the 403.
  const isRateLimit =
    reason === "ratelimitexceeded" ||
    reason === "userratelimitexceeded" ||
    (msg.includes("ratelimitexceeded") && !msg.includes("daily") && !msg.includes("quotaexceeded"));
  if (isRateLimit) return false;

  // ── Auth-flavoured 403 (forbidden without quota context) ─────────────────
  // Google returns 403 "forbidden" for auth issues when the token lacks the
  // required scope or the channel is not accessible — these are NOT quota
  // exhaustion.  Only trip the breaker when the 403 is explicitly quota-related.
  const isAuthForbidden =
    reason === "forbidden" ||
    reason === "accessNotConfigured" ||
    reason === "insufficientPermissions" ||
    msg.includes("access denied") ||
    msg.includes("insufficient permissions") ||
    msg.includes("forbidden") && !msg.includes("quota") && !msg.includes("dailylimit");
  if (code === 403 && isAuthForbidden) return false;

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

    // Build a set of userIds that have an active YouTube channel (non-null token).
    // Only these users can cause a real global quota exhaustion — ghost/stale
    // channel rows (e.g. from users who logged in but never connected YouTube)
    // should not trip the breaker even if their unitsUsed row looks exhausted.
    // This prevents the ghost-channel pattern from blocking all publishing:
    //   ghost channel (lower id) gets GCM calibration → row shows 9,994/10,000
    //   → startup restore trips global breaker → real user can't publish anything.
    const activeYouTubeRows = await db.select({ userId: channels.userId })
      .from(channels)
      .where(and(eq(channels.platform, "youtube"), isNotNull(channels.accessToken)));
    const activeYouTubeUserIds = new Set(activeYouTubeRows.map(r => r.userId));

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
        // ── Ghost-user guard ──────────────────────────────────────────────────
        // Only trip the global breaker if this userId has an active YouTube
        // channel with a token.  Ghost users (e.g. someone who logged in with
        // TikTok OAuth but never connected a real YouTube channel) can accumulate
        // near-exhausted quota rows because the GCM calibration writes the full
        // project-wide quota total to whichever userId it resolves first.  If
        // that userId happens to be a ghost (no active channel), tripping the
        // global breaker here would block the real user from publishing for the
        // rest of the day even though their own quota is essentially untouched.
        if (!activeYouTubeUserIds.has(userId)) {
          logger.warn(
            `[QuotaBreaker] Startup restore: skipping breaker trip for user ${userId} ` +
            `(${record.unitsUsed}/${record.quotaLimit} units) — no active YouTube channel with token; ` +
            `likely a ghost/stale row from GCM calibration attributing project-wide quota to wrong userId`
          );
          continue;
        }
        // ── Google Monitoring confirmation ────────────────────────────────────
        // Before tripping the breaker from a DB row, ask Google Cloud Monitoring
        // for the authoritative unit count.  This catches phantom / stale rows
        // (e.g. a row showing 10,000/10,000 from a crashed previous session while
        // no real uploads occurred) and prevents the breaker from blocking all
        // publishing for the rest of the day based on bad data.
        //
        // Only trust Google's override when it reports WELL below the limit
        // (< 50 %).  Google Monitoring has a 1–2h propagation delay, so if
        // Google says 8,000/10,000 we still trip (quota may have just been spent
        // in the last two hours and Google hasn't caught up yet).  But if Google
        // says 14/10,000 while the DB says 10,000/10,000, that's a clear phantom.
        //
        // Dynamic import avoids a circular module-level dependency:
        //   google-quota-sync → calibrateQuotaUsage (quota-tracker)
        //   quota-tracker     → fetchRealQuotaUnitsPublic (google-quota-sync)
        let shouldTrip = true;
        try {
          const { fetchRealQuotaUnitsPublic } = await import("./google-quota-sync");
          const googleUnits = await Promise.race([
            fetchRealQuotaUnitsPublic(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 15_000)), // 15s timeout
          ]);
          if (googleUnits !== null) {
            const googleExhausted = googleUnits >= record.quotaLimit * 0.5;
            if (!googleExhausted) {
              // Google says we are well below the limit — DB row is stale/phantom
              shouldTrip = false;
              logger.warn(
                `[QuotaBreaker] Google Monitoring reports only ${googleUnits} units used today ` +
                `(DB says ${record.unitsUsed}/${record.quotaLimit}) — DB row appears to be a ` +
                `phantom/stale artifact.  Skipping breaker trip and correcting DB.`
              );
              // Correct the phantom DB row so future restores also see the real value
              try {
                await db.update(youtubeQuotaUsage)
                  .set({ unitsUsed: googleUnits, lastUpdatedAt: new Date() })
                  .where(eq(youtubeQuotaUsage.id, record.id));
              } catch { /* non-fatal — correct value in memory even if DB write fails */ }
            } else {
              logger.info(
                `[QuotaBreaker] Google Monitoring confirms ${googleUnits} units used today ` +
                `(DB: ${record.unitsUsed}/${record.quotaLimit}) — tripping breaker.`
              );
            }
          } else {
            logger.warn(
              `[QuotaBreaker] Google Monitoring unavailable for startup confirmation ` +
              `(null result) — falling back to DB value (${record.unitsUsed}/${record.quotaLimit}).`
            );
          }
        } catch (gErr: any) {
          logger.warn(
            `[QuotaBreaker] Google Monitoring check failed during startup restore ` +
            `(${gErr?.message?.slice(0, 120)}) — falling back to DB (fail-safe, breaker trips).`
          );
        }

        if (shouldTrip) {
          tripGlobalQuotaBreaker();
          logger.info(
            `[QuotaBreaker] Startup restore: quota exhausted for user ${userId} ` +
            `(${record.quotaLimit - record.unitsUsed} remaining) — circuit breaker pre-tripped until midnight Pacific`
          );
        }
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

/**
 * Calibrate internal quota usage against the real number from Google Cloud
 * Monitoring API.  Takes the higher of our internal count and Google's report
 * (Google's data is ~1–2 hours delayed, so if our count is higher we're ahead).
 * Called by google-quota-sync.ts after a successful Monitoring API fetch.
 */
export async function calibrateQuotaUsage(userId: string, realUnitsUsed: number): Promise<void> {
  try {
    const record = await getOrCreateDailyRecord(userId);
    // Trust the higher of the two: our real-time internal count vs Google's
    // authoritative-but-delayed report.  Never decrease — that would hide real usage.
    const newValue = Math.max(record.unitsUsed, realUnitsUsed);
    if (newValue === record.unitsUsed) return; // nothing to update

    await db.update(youtubeQuotaUsage)
      .set({ unitsUsed: newValue, lastUpdatedAt: new Date() })
      .where(eq(youtubeQuotaUsage.id, record.id));

    logger.info(`[QuotaTracker] Calibrated unitsUsed ${record.unitsUsed} → ${newValue} (Google Cloud Monitoring)`);
  } catch (err: any) {
    logger.error(`[QuotaTracker] calibrateQuotaUsage failed: ${err?.message}`);
  }
}

export { QUOTA_COSTS, DAILY_OP_CAPS, UPLOAD_RESERVE, SAFETY_BUFFER, type QuotaOperation, getPacificDate, getNextResetTime };


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
