/**
 * channel-intelligence-engine.ts
 *
 * Unified signal reader and growth intelligence layer.
 *
 * Every 2 hours it reads ALL available performance signals from the DB
 * (no extra YouTube API quota spent) and:
 *
 *   1. Computes a composite Channel Health Score (0–100)
 *   2. Detects "zombie" videos — live and indexed but < 50 views after 12h
 *   3. Identifies top-performing game / format / duration combos
 *   4. Triggers targeted repair or content-generation actions
 *   5. Logs every decision as a learning_event so the orchestrator can learn
 *
 * Signal sources (DB only, no API calls per-cycle):
 *   - autopilot_queue     → publish rate, queue depth
 *   - youtube_output_metrics → performance per game / format / duration
 *   - pipeline_traces     → live-verification view counts
 *   - youtube-quota-tracker  → in-memory quota breaker state
 *
 * Scoring breakdown (100 pts max):
 *   publish_rate  25 pts — recent publish rate vs. 4 videos/day target
 *   queue_depth   25 pts — days of content queued (full marks at 7+ days)
 *   zombie_free   25 pts — fraction of recent videos NOT zombies
 *   quota_health  25 pts — quota breaker not tripped
 */

import { db } from "../db";
import {
  autopilotQueue,
  channels,
  pipelineTraces,
  youtubeOutputMetrics,
  learningEvents,
} from "@shared/schema";
import { eq, and, gte, lte, lt, inArray, desc, count, avg, sql, not, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped, getQuotaStatus } from "./youtube-quota-tracker";
import { isActiveYouTubeUser } from "../lib/active-user-guard";

const logger = createLogger("channel-intelligence");

// ── Constants ─────────────────────────────────────────────────────────────────

const CYCLE_INTERVAL_MS   = 2 * 60 * 60_000;  // 2 h
const STARTUP_DELAY_MS    = 35 * 60_000;        // 35 min (after watchdog, back-catalog, etc.)
const TARGET_DAILY_VIDEOS = 4;                   // 3 Shorts + 1 long-form
const ZOMBIE_VIEW_THRESHOLD = 50;               // < 50 views after 12h = zombie
const ZOMBIE_MIN_AGE_HOURS  = 12;
const ZOMBIE_MAX_AGE_HOURS  = 72;
const QUEUE_LOW_THRESHOLD   = 7;                // Shorts queued for next 3 days
const DEV_BYPASS_USER       = "dev_bypass_user";

// ── State ─────────────────────────────────────────────────────────────────────

export interface IntelligenceReport {
  channelHealthScore:  number;
  publishedLast24h:    number;
  publishedLast7days:  number;
  queueDepth:          number;   // items queued next 7 days
  queueHealthDays:     number;   // estimated days of content (queue/4)
  zombieCount:         number;
  topGame:             string | null;
  topFormat:           string | null;
  topDurationBucket:   string | null;
  quotaBlocked:        boolean;
  actions:             string[];
  lastRunAt:           Date | null;
  nextRunAt:           Date | null;
  scores: {
    publishRate:  number;
    queueDepth:   number;
    zombieFree:   number;
    quotaHealth:  number;
  };
}

const report: IntelligenceReport = {
  channelHealthScore:  0,
  publishedLast24h:    0,
  publishedLast7days:  0,
  queueDepth:          0,
  queueHealthDays:     0,
  zombieCount:         0,
  topGame:             null,
  topFormat:           null,
  topDurationBucket:   null,
  quotaBlocked:        false,
  actions:             [],
  lastRunAt:           null,
  nextRunAt:           null,
  scores: { publishRate: 0, queueDepth: 0, zombieFree: 0, quotaHealth: 0 },
};

// ── Signal gathering ──────────────────────────────────────────────────────────

interface Signals {
  userId:            string;
  publishedLast24h:  number;
  publishedLast7days:number;
  queueDepth:        number;
  zombieVideoIds:    string[];  // YouTube video IDs that are zombies
  topGame:           string | null;
  topFormat:         string | null;
  topDurationBucket: string | null;
  quotaBlocked:      boolean;
}

async function gatherSignals(userId: string): Promise<Signals> {
  const now            = new Date();
  const minus24h       = new Date(now.getTime() - 24 * 60 * 60_000);
  const minus7d        = new Date(now.getTime() - 7  * 24 * 60 * 60_000);
  const plus7d         = new Date(now.getTime() + 7  * 24 * 60 * 60_000);
  const zombieMinAge   = new Date(now.getTime() - ZOMBIE_MIN_AGE_HOURS * 60 * 60_000);
  const zombieMaxAge   = new Date(now.getTime() - ZOMBIE_MAX_AGE_HOURS * 60 * 60_000);

  const [pub24h, pub7d, queue, zombies, topGameRows, topFormatRows, topBucketRows] = await Promise.all([
    // Publish rate — last 24h
    db.select({ n: count() })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, "youtube"),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, minus24h),
      ))
      .then(r => Number(r[0]?.n ?? 0)),

    // Publish rate — last 7 days
    db.select({ n: count() })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, "youtube"),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, minus7d),
      ))
      .then(r => Number(r[0]?.n ?? 0)),

    // Queue depth — scheduled / pending in next 7 days
    db.select({ n: count() })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, "youtube"),
        inArray(autopilotQueue.status, ["scheduled", "pending"]),
        gte(autopilotQueue.scheduledAt, now),
        lte(autopilotQueue.scheduledAt, plus7d),
      ))
      .then(r => Number(r[0]?.n ?? 0)),

    // Zombie detection — videos published 12–72h ago with very few views
    db.select({ youtubeVideoId: youtubeOutputMetrics.youtubeVideoId })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        lt(youtubeOutputMetrics.views, ZOMBIE_VIEW_THRESHOLD),
        lte(youtubeOutputMetrics.publishedAt, zombieMinAge),
        gte(youtubeOutputMetrics.publishedAt, zombieMaxAge),
      ))
      .then(r => r.map(row => row.youtubeVideoId).filter(Boolean) as string[]),

    // Top game — highest avg performance score last 7 days
    db.select({
        gameName: youtubeOutputMetrics.gameName,
        avgScore: avg(youtubeOutputMetrics.performanceScore),
        n: count(),
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, minus7d),
        not(isNull(youtubeOutputMetrics.gameName)),
      ))
      .groupBy(youtubeOutputMetrics.gameName)
      .orderBy(desc(avg(youtubeOutputMetrics.performanceScore)))
      .limit(3),

    // Top format (short vs long_form)
    db.select({
        contentType: youtubeOutputMetrics.contentType,
        avgViews: avg(youtubeOutputMetrics.views),
        n: count(),
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, minus7d),
      ))
      .groupBy(youtubeOutputMetrics.contentType)
      .orderBy(desc(avg(youtubeOutputMetrics.views)))
      .limit(1),

    // Top duration bucket
    db.select({
        bucket: youtubeOutputMetrics.durationBucket,
        avgScore: avg(youtubeOutputMetrics.performanceScore),
        n: count(),
      })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.publishedAt, minus7d),
        not(isNull(youtubeOutputMetrics.durationBucket)),
      ))
      .groupBy(youtubeOutputMetrics.durationBucket)
      .orderBy(desc(avg(youtubeOutputMetrics.performanceScore)))
      .limit(1),
  ]);

  return {
    userId,
    publishedLast24h:   pub24h,
    publishedLast7days: pub7d,
    queueDepth:         queue,
    zombieVideoIds:     zombies,
    topGame:            topGameRows[0]?.gameName ?? null,
    topFormat:          topFormatRows[0]?.contentType ?? null,
    topDurationBucket:  topBucketRows[0]?.bucket ?? null,
    quotaBlocked:       isQuotaBreakerTripped(),
  };
}

// ── Health score ──────────────────────────────────────────────────────────────

function computeHealthScore(s: Signals): {
  total: number;
  publishRate: number;
  queueDepth: number;
  zombieFree: number;
  quotaHealth: number;
} {
  // Publish rate score (0–25): rate per day over 7 days vs target
  const avgDailyRate  = s.publishedLast7days / 7;
  const publishRate   = Math.min(25, Math.round((avgDailyRate / TARGET_DAILY_VIDEOS) * 25));

  // Queue depth score (0–25): days of runway (queue / target_per_day, full at 7 days)
  const queueDays     = s.queueDepth / TARGET_DAILY_VIDEOS;
  const queueDepth    = Math.min(25, Math.round((queueDays / 7) * 25));

  // Zombie score (0–25): penalise zombies proportional to recent publish count
  const recentPublished = Math.max(s.publishedLast7days, 1);
  const zombieRate    = s.zombieVideoIds.length / recentPublished;
  const zombieFree    = Math.max(0, Math.round((1 - zombieRate) * 25));

  // Quota score (0–25): all 25 unless the breaker is tripped
  const quotaHealth   = s.quotaBlocked ? 0 : 25;

  const total = publishRate + queueDepth + zombieFree + quotaHealth;
  return { total, publishRate, queueDepth, zombieFree, quotaHealth };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function logLearningEvent(
  userId: string,
  eventType: string,
  data: Record<string, any>,
  outcome?: string,
): Promise<void> {
  try {
    await db.insert(learningEvents).values({
      userId,
      eventType,
      sourceAgent: "channel-intelligence",
      data,
      outcome,
    });
  } catch (_) { /* non-fatal */ }
}

async function actOnSignals(userId: string, s: Signals, score: ReturnType<typeof computeHealthScore>): Promise<string[]> {
  const actions: string[] = [];

  // 1. Quota blocked — log and bail (nothing can be published anyway)
  if (s.quotaBlocked) {
    await logLearningEvent(userId, "quota_blocked", { score: score.total }, "waiting_for_reset");
    actions.push("quota_blocked: all actions deferred until midnight Pacific reset");
    return actions;
  }

  // 2. Log health snapshot
  await logLearningEvent(userId, "health_snapshot", {
    score: score.total,
    publishedLast24h:   s.publishedLast24h,
    publishedLast7days: s.publishedLast7days,
    queueDepth:         s.queueDepth,
    zombieCount:        s.zombieVideoIds.length,
    topGame:            s.topGame,
    topFormat:          s.topFormat,
    topDurationBucket:  s.topDurationBucket,
  });

  // 3. Zombie videos — flag them in learning_events and trigger metric refresh
  if (s.zombieVideoIds.length > 0) {
    logger.warn(
      `[Intelligence] ${s.zombieVideoIds.length} zombie video(s) detected for ${userId}: ${s.zombieVideoIds.join(", ")}`
    );
    await logLearningEvent(userId, "zombie_detected", {
      videoIds: s.zombieVideoIds,
      count: s.zombieVideoIds.length,
      thresholdViews: ZOMBIE_VIEW_THRESHOLD,
      thresholdHours: ZOMBIE_MIN_AGE_HOURS,
    }, "flagged_for_repair");
    // Trigger stale metric refresh so the performance learner re-evaluates them
    // and the orchestrator can pick them up for metadata optimization
    try {
      const { refreshStaleVideoMetrics } = await import("./youtube-performance-learner");
      refreshStaleVideoMetrics(userId).catch(() => {});
      actions.push(`zombie_repair: ${s.zombieVideoIds.length} video(s) flagged + metric refresh triggered`);
    } catch { actions.push(`zombie_flagged: ${s.zombieVideoIds.length} video(s) logged for repair`); }
  }

  // 4. Queue depth low — trigger back-catalog cycle if queue is thin
  const shortsInQueue = Math.round(s.queueDepth * 0.75); // rough estimate: 75% of queue is Shorts
  if (shortsInQueue < QUEUE_LOW_THRESHOLD) {
    logger.warn(
      `[Intelligence] Queue depth low (${s.queueDepth} items ≈ ${shortsInQueue} Shorts) — triggering content generation`
    );
    await logLearningEvent(userId, "queue_depth_low", {
      queueDepth: s.queueDepth,
      estimatedShorts: shortsInQueue,
      threshold: QUEUE_LOW_THRESHOLD,
    }, "triggering_back_catalog");
    try {
      const { runBackCatalogMonetizationCycle } = await import("./youtube-back-catalog-engine");
      runBackCatalogMonetizationCycle(userId).catch(() => {});
      actions.push(`queue_refill: back-catalog cycle triggered (queue=${s.queueDepth} items)`);
    } catch { actions.push("queue_refill_error: failed to trigger back-catalog cycle"); }
  }

  // 5. Low health — trigger a publisher sweep to push anything ready to publish
  if (score.total < 60 && s.publishedLast24h < 1) {
    logger.warn(`[Intelligence] Health score ${score.total}/100 with 0 videos today — triggering publisher sweep`);
    await logLearningEvent(userId, "low_health_sweep", {
      score: score.total,
      publishedLast24h: s.publishedLast24h,
    }, "publisher_sweep_triggered");
    try {
      const [lfResult, spResult] = await Promise.allSettled([
        import("./long-form-clip-publisher").then(m => m.runLongFormClipPublisher()),
        import("./shorts-clip-publisher").then(m => (m as any).runShortsClipPublisher()),
      ]);
      const lfStr = lfResult.status === "fulfilled"
        ? `lf=${(lfResult.value as any).published ?? 0}`
        : `lf_err`;
      const spStr = spResult.status === "fulfilled"
        ? `sp=${(spResult.value as any).published ?? 0}`
        : `sp_err`;
      actions.push(`publisher_sweep: ${lfStr} ${spStr}`);
    } catch { actions.push("publisher_sweep_error"); }
  }

  // 6. Top performer insight — log so the orchestrator/UI can surface it
  if (s.topGame) {
    await logLearningEvent(userId, "top_performer_identified", {
      topGame:          s.topGame,
      topFormat:        s.topFormat,
      topDurationBucket:s.topDurationBucket,
    }, "insight_recorded");
    actions.push(`insight: top game="${s.topGame}" format="${s.topFormat}" bucket="${s.topDurationBucket}"`);
  }

  // 7. If publish rate is very healthy, record a positive signal too
  if (score.total >= 80) {
    actions.push(`healthy: score=${score.total}/100 — pipeline nominal`);
  }

  return actions;
}

// ── Eligible user resolution ──────────────────────────────────────────────────

async function getEligibleUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: channels.userId })
    .from(channels)
    .where(and(eq(channels.platform, "youtube"), not(isNull(channels.accessToken))));

  return [...new Set(
    rows
      .map(r => r.userId)
      .filter((id): id is string => !!id && id !== DEV_BYPASS_USER && isActiveYouTubeUser(id)),
  )];
}

// ── Main cycle ────────────────────────────────────────────────────────────────

let running = false;

export async function runIntelligenceCycle(): Promise<void> {
  if (running) {
    logger.info("[Intelligence] Cycle already running — skipping");
    return;
  }
  running = true;
  report.lastRunAt = new Date();
  report.nextRunAt = new Date(Date.now() + CYCLE_INTERVAL_MS);

  try {
    const userIds = await getEligibleUserIds();
    if (userIds.length === 0) {
      logger.info("[Intelligence] No eligible users — standing by");
      return;
    }

    for (const userId of userIds) {
      try {
        const signals = await gatherSignals(userId);
        const score   = computeHealthScore(signals);
        const actions = await actOnSignals(userId, signals, score);

        // Update in-memory report (last user wins — single-user system in practice)
        report.channelHealthScore  = score.total;
        report.publishedLast24h    = signals.publishedLast24h;
        report.publishedLast7days  = signals.publishedLast7days;
        report.queueDepth          = signals.queueDepth;
        report.queueHealthDays     = Math.round((signals.queueDepth / TARGET_DAILY_VIDEOS) * 10) / 10;
        report.zombieCount         = signals.zombieVideoIds.length;
        report.topGame             = signals.topGame;
        report.topFormat           = signals.topFormat;
        report.topDurationBucket   = signals.topDurationBucket;
        report.quotaBlocked        = signals.quotaBlocked;
        report.actions             = actions;
        report.scores              = { publishRate: score.publishRate, queueDepth: score.queueDepth, zombieFree: score.zombieFree, quotaHealth: score.quotaHealth };

        logger.info(
          `[Intelligence] User ${userId}: health=${score.total}/100 ` +
          `pub24h=${signals.publishedLast24h} queue=${signals.queueDepth} ` +
          `zombies=${signals.zombieVideoIds.length} actions=${actions.length}`
        );

        // ── Brain feed: push full health snapshot into learningInsights ────────
        try {
          const { recordOutcome } = await import("../lib/outcome-recorder");
          await recordOutcome({
            engine:     "channel-intelligence",
            userId,
            category:   "health_snapshot",
            summary:    `Channel health ${score.total}/100 — pub24h=${signals.publishedLast24h} queue=${signals.queueDepth} zombies=${signals.zombieVideoIds.length}${signals.quotaBlocked ? " QUOTA_BLOCKED" : ""}`,
            metrics:    {
              healthScore:        score.total,
              publishRate:        score.publishRate,
              queueDepthScore:    score.queueDepth,
              zombiFreeScore:     score.zombieFree,
              quotaHealthScore:   score.quotaHealth,
              publishedLast24h:   signals.publishedLast24h,
              publishedLast7days: signals.publishedLast7days,
              queueDepth:         signals.queueDepth,
              zombieCount:        signals.zombieVideoIds.length,
              quotaBlocked:       signals.quotaBlocked ? 1 : 0,
            },
            confidence: 0.92,
            recommendation: score.total < 50
              ? "CRITICAL: channel health below 50 — investigate publish blockers, quota state, and queue depth immediately"
              : score.total < 75
              ? "Channel health degraded — check queue depth and zombie videos; publishing may slow"
              : "Channel healthy — continue current BF6 publishing cadence",
          });
        } catch { /* non-fatal */ }
      } catch (err: any) {
        logger.error(`[Intelligence] Error processing user ${userId}:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let initTimer:   ReturnType<typeof setTimeout>  | null = null;
let cycleTimer:  ReturnType<typeof setInterval> | null = null;

export function initChannelIntelligenceEngine(): void {
  if (cycleTimer || initTimer) return;

  function jitter(base: number): number { return base + Math.floor(Math.random() * base * 0.1); }

  const delay = jitter(STARTUP_DELAY_MS);
  report.nextRunAt = new Date(Date.now() + delay);

  logger.info(`[Intelligence] Channel intelligence engine initializing — first cycle in ${Math.round(delay / 60_000)} min`);

  initTimer = setTimeout(() => {
    initTimer = null;
    runIntelligenceCycle().catch(err => logger.error("[Intelligence] Initial cycle error:", err));
    cycleTimer = setInterval(
      () => runIntelligenceCycle().catch(err => logger.error("[Intelligence] Cycle error:", err)),
      jitter(CYCLE_INTERVAL_MS),
    );
  }, delay);
}

export function stopChannelIntelligenceEngine(): void {
  if (initTimer)  { clearTimeout(initTimer);   initTimer  = null; }
  if (cycleTimer) { clearInterval(cycleTimer);  cycleTimer = null; }
  logger.info("[Intelligence] Channel intelligence engine stopped");
}

export function getIntelligenceReport(): IntelligenceReport {
  return { ...report, scores: { ...report.scores } };
}

/** Force an immediate cycle (dashboard "Run now" button). */
export async function triggerIntelligenceNow(): Promise<IntelligenceReport> {
  await runIntelligenceCycle();
  return getIntelligenceReport();
}
