/**
 * publishing-watchdog.ts
 *
 * Dead-man's switch for the YouTube publishing pipeline.
 *
 * Every 30 minutes it checks the channel's public RSS feed.
 * If no Short or VOD has appeared today (UTC) by 10 AM UTC, it runs a full
 * pipeline repair in order of least-to-most invasive:
 *
 *   1. Quota check — if breaker is tripped, bail (nothing can publish until reset)
 *   2. Token refresh  — proactively refresh any expiring OAuth tokens
 *   3. Long-form publisher  — fills the daily long-form slot first
 *   4. Shorts publisher     — fills Short slots
 *   5. Back-catalog cycle   — regenerates content if the queue is empty
 *
 * Recovery is throttled to at most 3 times per day (3-hour cooldown).
 * After each recovery it rechecks the feed; if a video appears it stops.
 */

import { db } from "../db";
import { channels, pipelineTraces, autopilotQueue } from "@shared/schema";
import { eq, and, isNotNull, gte, count } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { fetchChannelVideosViaRss } from "../youtube";
import { isActiveYouTubeUser } from "../lib/active-user-guard";

const logger = createLogger("publishing-watchdog");

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_CHANNEL_ID_LENGTH = 24;        // Real YouTube IDs: "UC" + 22 chars
const CHECK_INTERVAL_MS    = 30 * 60_000; // Poll every 30 min
const STARTUP_DELAY_MS     = 25 * 60_000; // Wait 25 min at boot before first check
const RECOVERY_COOLDOWN_MS = 3 * 60 * 60_000; // 3 h between recovery attempts
const MAX_RECOVERIES_PER_DAY = 3;         // Hard cap so we don't spam publishers
const FIRST_ACTION_HOUR_UTC  = 10;        // Don't act before 10:00 UTC

// ── State ─────────────────────────────────────────────────────────────────────

export interface WatchdogStatus {
  lastCheckAt:         Date | null;
  todayPublishedCount: number;
  lastRecoveryAt:      Date | null;
  recoveryCount:       number;
  lastRecoveryActions: string[];
  recoveryInProgress:  boolean;
  status: 'healthy' | 'recovering' | 'quota_blocked' | 'too_early' | 'no_channel' | 'unknown';
  lastError:           string | null;
  nextCheckAt:         Date | null;
  channelId:           string | null;
}

const state: WatchdogStatus = {
  lastCheckAt:         null,
  todayPublishedCount: 0,
  lastRecoveryAt:      null,
  recoveryCount:       0,
  lastRecoveryActions: [],
  recoveryInProgress:  false,
  status:              'unknown',
  lastError:           null,
  nextCheckAt:         null,
  channelId:           null,
};

// Reset recovery counter at midnight UTC each day
let lastRecoveryDay = "";
function resetDailyCounters(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastRecoveryDay) {
    lastRecoveryDay = today;
    state.recoveryCount = 0;
    state.lastRecoveryAt = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function jitter(baseMs: number, windowMs = baseMs * 0.1): number {
  return baseMs + Math.floor(Math.random() * windowMs);
}

/** Find all real YouTube channels we can check (have access token, real UC ID). */
async function getEligibleChannels(): Promise<Array<{ userId: string; channelId: string }>> {
  const rows = await db
    .select({ userId: channels.userId, channelId: channels.channelId })
    .from(channels)
    .where(and(eq(channels.platform, "youtube"), isNotNull(channels.accessToken)));

  return rows.filter(r =>
    r.userId &&
    r.channelId &&
    isActiveYouTubeUser(r.userId) &&
    r.channelId.startsWith("UC") &&
    r.channelId.length >= MIN_CHANNEL_ID_LENGTH
  ) as Array<{ userId: string; channelId: string }>;
}

/** Check the public RSS feed for videos published today. */
async function countTodayVideos(channelId: string): Promise<{ count: number; titles: string[] }> {
  const today = todayUTC();
  const videos = await fetchChannelVideosViaRss(channelId);
  const todayVideos = videos.filter(v => (v.publishedAt ?? "").slice(0, 10) === today);
  return { count: todayVideos.length, titles: todayVideos.map(v => v.title) };
}

// ── Recovery ──────────────────────────────────────────────────────────────────

async function runRecovery(userId: string): Promise<string[]> {
  const actions: string[] = [];

  // 1. Quota gate — nothing we can do if the daily budget is gone
  if (isQuotaBreakerTripped()) {
    logger.warn("[Watchdog] Recovery aborted — YouTube quota breaker is active");
    state.status = "quota_blocked";
    actions.push("quota_blocked: daily API quota exhausted — pipeline paused until midnight Pacific reset");
    return actions;
  }
  actions.push("quota_ok");

  // 2. Proactively refresh any expiring OAuth tokens
  try {
    const { refreshExpiringTokens } = await import("../token-refresh");
    const r = await refreshExpiringTokens();
    actions.push(`token_refresh: refreshed=${r.refreshed} failed=${r.failed}`);
    logger.info("[Watchdog] Token refresh:", r);
  } catch (err: any) {
    actions.push(`token_refresh_error: ${err.message?.slice(0, 120) ?? "unknown"}`);
    logger.warn("[Watchdog] Token refresh failed:", err.message);
  }

  // 3. Long-form publisher first (fills the daily VOD slot before Shorts consume quota)
  try {
    const { runLongFormClipPublisher } = await import("./long-form-clip-publisher");
    const r = await runLongFormClipPublisher();
    actions.push(`long_form: published=${r.published} failed=${r.failed} skipped=${r.skipped} quotaExhausted=${r.quotaExhausted}`);
    logger.info("[Watchdog] Long-form result:", r);
  } catch (err: any) {
    actions.push(`long_form_error: ${err.message?.slice(0, 120) ?? "unknown"}`);
    logger.warn("[Watchdog] Long-form publisher error:", err.message);
  }

  // 4. Shorts publisher
  try {
    const { runShortsClipPublisher } = await import("./shorts-clip-publisher");
    const r: any = await runShortsClipPublisher();
    actions.push(`shorts: published=${r.published ?? 0} failed=${r.failed ?? 0} skipped=${r.skipped ?? 0}`);
    logger.info("[Watchdog] Shorts result:", r);
  } catch (err: any) {
    actions.push(`shorts_error: ${err.message?.slice(0, 120) ?? "unknown"}`);
    logger.warn("[Watchdog] Shorts publisher error:", err.message);
  }

  // 5. Trigger back-catalog cycle to regenerate content if the queue ran dry
  //    Fire-and-forget — this is long-running and we don't need to await it here
  try {
    const { runBackCatalogMonetizationCycle } = await import("./youtube-back-catalog-engine");
    runBackCatalogMonetizationCycle(userId).catch((e: any) =>
      logger.warn("[Watchdog] Back-catalog cycle error:", e?.message)
    );
    actions.push("back_catalog: monetization cycle triggered (async)");
    logger.info("[Watchdog] Back-catalog cycle triggered for", userId);
  } catch (err: any) {
    actions.push(`back_catalog_error: ${err.message?.slice(0, 120) ?? "unknown"}`);
  }

  return actions;
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export async function runWatchdogCycle(): Promise<void> {
  resetDailyCounters();
  state.lastCheckAt = new Date();
  state.nextCheckAt = new Date(Date.now() + CHECK_INTERVAL_MS);

  try {
    const channels = await getEligibleChannels();
    if (channels.length === 0) {
      logger.warn("[Watchdog] No eligible YouTube channels found — skipping");
      state.status = "no_channel";
      state.channelId = null;
      return;
    }

    // In practice there is one real user/channel — process all eligible channels
    for (const ch of channels) {
      await processChannel(ch.userId, ch.channelId);
    }
  } catch (err: any) {
    logger.error("[Watchdog] Unhandled error in watchdog cycle:", err.message);
    state.lastError = err.message?.slice(0, 200) ?? "unknown";
  }
}

// ── Multi-layer verification helpers ─────────────────────────────────────────

/**
 * Layer 2: Check pipeline_traces for verified_live entries today.
 * Pipeline tracer confirms the video is indexed public via YouTube Data API.
 * RSS can lag 15-30 min; this layer catches that window.
 */
async function checkPipelineTracesToday(userId: string): Promise<number> {
  const startOfDayUTC = new Date();
  startOfDayUTC.setUTCHours(0, 0, 0, 0);
  const result = await db.select({ n: count() })
    .from(pipelineTraces)
    .where(and(
      eq(pipelineTraces.userId, userId),
      eq(pipelineTraces.stage, "verified_live"),
      gte(pipelineTraces.createdAt, startOfDayUTC),
    ));
  return Number(result[0]?.n ?? 0);
}

/**
 * Layer 3: Check autopilot_queue for items marked as published today.
 * Most conservative — confirms our own pipeline has pushed something to YouTube.
 * The video may still be processing on YouTube's side but was sent from our end.
 */
async function checkQueuePublishedToday(userId: string): Promise<number> {
  const startOfDayUTC = new Date();
  startOfDayUTC.setUTCHours(0, 0, 0, 0);
  const result = await db.select({ n: count() })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.publishedAt, startOfDayUTC),
    ));
  return Number(result[0]?.n ?? 0);
}

async function processChannel(userId: string, channelId: string): Promise<void> {
  state.channelId = channelId;

  // Check public feed
  let feedResult: { count: number; titles: string[] };
  try {
    feedResult = await countTodayVideos(channelId);
  } catch (err: any) {
    logger.warn(`[Watchdog] Failed to check public feed for ${channelId}:`, err.message);
    state.lastError = err.message?.slice(0, 200) ?? "unknown";
    return;
  }

  state.todayPublishedCount = feedResult.count;
  state.lastError = null;

  // ── Layer 1: RSS feed ─────────────────────────────────────────────────────
  if (feedResult.count > 0) {
    logger.info(
      `[Watchdog] ✓ L1-RSS: ${feedResult.count} video(s) today — ${feedResult.titles.join(" | ").slice(0, 120)}`
    );
    state.status = "healthy";
    state.todayPublishedCount = feedResult.count;
    return;
  }

  // ── Layer 2: Pipeline traces (YouTube Data API verified) ──────────────────
  try {
    const l2count = await checkPipelineTracesToday(userId);
    if (l2count > 0) {
      logger.info(`[Watchdog] ✓ L2-PipelineTraces: ${l2count} verified_live trace(s) today — RSS may be lagging`);
      state.status = "healthy";
      state.todayPublishedCount = l2count;
      return;
    }
  } catch (err: any) {
    logger.warn(`[Watchdog] L2 check failed: ${err.message?.slice(0, 100)}`);
  }

  // ── Layer 3: autopilot_queue published status ─────────────────────────────
  try {
    const l3count = await checkQueuePublishedToday(userId);
    if (l3count > 0) {
      logger.info(`[Watchdog] ✓ L3-Queue: ${l3count} item(s) published today — awaiting YouTube propagation`);
      state.status = "healthy";
      state.todayPublishedCount = l3count;
      return;
    }
  } catch (err: any) {
    logger.warn(`[Watchdog] L3 check failed: ${err.message?.slice(0, 100)}`);
  }

  state.todayPublishedCount = 0;
  const hourUTC = new Date().getUTCHours();
  logger.warn(`[Watchdog] ⚠ All 3 layers confirm: no videos published today on ${channelId} (${hourUTC}:xx UTC)`);

  // Don't act before the normal publishing window — give the scheduled sweep a chance
  if (hourUTC < FIRST_ACTION_HOUR_UTC) {
    logger.info(`[Watchdog] Too early (${hourUTC}h UTC < ${FIRST_ACTION_HOUR_UTC}h threshold) — waiting for normal publish window`);
    state.status = "too_early";
    return;
  }

  // Daily cap on recovery attempts
  if (state.recoveryCount >= MAX_RECOVERIES_PER_DAY) {
    logger.warn(`[Watchdog] Max recoveries (${MAX_RECOVERIES_PER_DAY}) hit today — giving up until tomorrow`);
    return;
  }

  // Cooldown between attempts
  if (state.lastRecoveryAt) {
    const elapsed = Date.now() - state.lastRecoveryAt.getTime();
    if (elapsed < RECOVERY_COOLDOWN_MS) {
      const waitMin = Math.round((RECOVERY_COOLDOWN_MS - elapsed) / 60_000);
      logger.info(`[Watchdog] Recovery on cooldown — next attempt in ~${waitMin} min`);
      return;
    }
  }

  if (state.recoveryInProgress) {
    logger.info("[Watchdog] Recovery already in progress — skipping duplicate trigger");
    return;
  }

  logger.warn(
    `[Watchdog] 🚨 Starting pipeline repair (attempt ${state.recoveryCount + 1}/${MAX_RECOVERIES_PER_DAY}) for ${channelId}`
  );

  state.recoveryInProgress = true;
  try {
    const actions = await runRecovery(userId);
    state.lastRecoveryAt = new Date();
    state.recoveryCount++;
    state.lastRecoveryActions = actions;
    state.status = "recovering";
    logger.info("[Watchdog] Pipeline repair complete:", actions);
  } finally {
    state.recoveryInProgress = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let initTimer: ReturnType<typeof setTimeout> | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;

export function initPublishingWatchdog(): void {
  if (checkInterval || initTimer) return; // already running

  const startDelayMs = jitter(STARTUP_DELAY_MS, 5 * 60_000); // 25–30 min
  logger.info(
    `[Watchdog] Publishing watchdog initializing — first check in ${Math.round(startDelayMs / 60_000)} min`
  );
  state.nextCheckAt = new Date(Date.now() + startDelayMs);

  initTimer = setTimeout(() => {
    initTimer = null;
    runWatchdogCycle().catch(err => logger.error("[Watchdog] Initial cycle failed:", err));
    checkInterval = setInterval(
      () => runWatchdogCycle().catch(err => logger.error("[Watchdog] Cycle failed:", err)),
      jitter(CHECK_INTERVAL_MS)
    );
  }, startDelayMs);
}

export function stopPublishingWatchdog(): void {
  if (initTimer)     { clearTimeout(initTimer);     initTimer = null; }
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
  logger.info("[Watchdog] Publishing watchdog stopped");
}

export function getWatchdogStatus(): WatchdogStatus {
  return { ...state };
}

/** Force an immediate check cycle (e.g. from the dashboard "Run now" button). */
export async function triggerWatchdogNow(): Promise<WatchdogStatus> {
  logger.info("[Watchdog] Manual trigger requested");
  await runWatchdogCycle();
  return getWatchdogStatus();
}
