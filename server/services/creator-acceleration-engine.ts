/**
 * creator-acceleration-engine.ts
 *
 * The MrBeast flywheel applied to ET Gaming 274:
 *
 *   "When something works, don't wait — flood the algorithm with more of it
 *    before the momentum window closes. When something fails, understand why
 *    immediately and stop repeating it."
 *
 * Runs every 2h.
 *
 * Cycle steps:
 *   1. runRapidFeedback24h — refresh analytics for videos < 39h old, write
 *      hot_streak_formula / avoid_pattern signals to masterKnowledgeBank.
 *   2. Hot streak doubling — for every hot Shorts video (2× channel avg in
 *      first 24h), immediately queue 2 more clips from same/similar source.
 *   3. Failure autopsy — for every cold Short (< 25% avg after 48h), write
 *      an avoid_pattern entry with the specific reason.
 *   4. Velocity check — if total queued Shorts < 3 days of content, flag
 *      an "acceleration_needed" entry so back-catalog-engine refills faster.
 */

import { db } from "../db";
import {
  youtubeOutputMetrics,
  autopilotQueue,
  masterKnowledgeBank,
  backCatalogVideos,
  channels,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, lt, ne, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isAutonomousMode } from "../lib/autonomous";
import { runRapidFeedback24h } from "./youtube-performance-learner";
import { isShortScheduleSaturated, getNextShortPublishTime } from "./youtube-output-schedule";

const logger = createLogger("creator-acceleration");

const CYCLE_INTERVAL_MS      = 2  * 60 * 60 * 1000; // 2h
const STARTUP_DELAY_MS       = 32 * 60 * 1000;       // T+32min (after Wave 11 services settle)
const HOT_STREAK_MULTIPLIER  = 2.0;   // 2× channel avg = hot streak
const COLD_THRESHOLD_MULT    = 0.25;  // <25% channel avg = cold
const HOT_STREAK_COOLDOWN_MS = 40 * 60 * 60 * 1000; // process a hot video at most once per 40h
const MAX_CLIPS_PER_HOT      = 2;     // max new clips queued per hot streak trigger
const MIN_DAYS_AHEAD         = 1;     // don't publish same-day (respect schedule)
const MAX_DAYS_AHEAD         = 14;    // don't schedule too far out

// Guard: don't re-process the same hot streak video within 40h
const _hotStreakProcessed = new Map<string, number>();

// ── Helper: channel average views for Shorts (30-day baseline) ───────────────

async function getChannelAvgViews(userId: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const [row] = await db
    .select({ avg: sql<number>`coalesce(avg(views), 0)::float` })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      eq(youtubeOutputMetrics.contentType, "short"),
      gte(youtubeOutputMetrics.publishedAt, thirtyDaysAgo),
    ));
  return +(row?.avg ?? 0);
}

// ── Hot streak: find Shorts published 12-42h ago with 2× channel avg ─────────

async function findHotStreakVideos(userId: string, channelAvg: number) {
  if (channelAvg < 10) return [];
  const twelveHoursAgo = new Date(Date.now() - 12 * 3600_000);
  const fortyTwoHoursAgo = new Date(Date.now() - 42 * 3600_000);
  return db
    .select({
      youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
      views:          youtubeOutputMetrics.views,
      ctr:            youtubeOutputMetrics.ctr,
      gameName:       youtubeOutputMetrics.gameName,
      durationBucket: youtubeOutputMetrics.durationBucket,
      durationSec:    youtubeOutputMetrics.durationSec,
      sourceVideoId:  youtubeOutputMetrics.sourceVideoId,
      publishedAt:    youtubeOutputMetrics.publishedAt,
    })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      eq(youtubeOutputMetrics.contentType, "short"),
      gte(youtubeOutputMetrics.publishedAt, fortyTwoHoursAgo),
      lte(youtubeOutputMetrics.publishedAt, twelveHoursAgo),
      sql`${youtubeOutputMetrics.views} >= ${Math.ceil(channelAvg * HOT_STREAK_MULTIPLIER)}`,
    ))
    .orderBy(desc(youtubeOutputMetrics.views))
    .limit(3);
}

// ── Cold video: Shorts published 48-96h ago with <25% channel avg ────────────

async function findColdVideos(userId: string, channelAvg: number) {
  if (channelAvg < 10) return [];
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600_000);
  const ninetySevenHoursAgo = new Date(Date.now() - 97 * 3600_000);
  return db
    .select({
      youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
      views:          youtubeOutputMetrics.views,
      gameName:       youtubeOutputMetrics.gameName,
      durationBucket: youtubeOutputMetrics.durationBucket,
      durationSec:    youtubeOutputMetrics.durationSec,
      publishedAt:    youtubeOutputMetrics.publishedAt,
    })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      eq(youtubeOutputMetrics.contentType, "short"),
      gte(youtubeOutputMetrics.publishedAt, ninetySevenHoursAgo),
      lte(youtubeOutputMetrics.publishedAt, fortyEightHoursAgo),
      sql`coalesce(${youtubeOutputMetrics.views}, 0) < ${Math.ceil(channelAvg * COLD_THRESHOLD_MULT)}`,
    ))
    .limit(5);
}

// ── Double-down: queue 2 more clips from same game when a Short goes hot ─────

async function queueAccelerationClips(
  userId: string,
  hotVideo: { gameName?: string | null; youtubeVideoId: string; durationSec?: number | null },
  channelAvgViews: number,
): Promise<number> {
  if (isShortScheduleSaturated(userId)) {
    logger.debug(`[Accel] Short schedule saturated — skipping double-down for ${hotVideo.youtubeVideoId}`);
    return 0;
  }

  const game = hotVideo.gameName;
  if (!game) return 0;

  // Find source videos with same game that have remaining clip capacity
  // (not fully clipped yet — shortsQueuedCount < potential clips)
  const sources = await db
    .select({
      id:              backCatalogVideos.id,
      youtubeVideoId:  backCatalogVideos.youtubeVideoId,
      title:           backCatalogVideos.title,
      durationSec:     backCatalogVideos.durationSec,
      shortsQueuedCount: backCatalogVideos.shortsQueuedCount,
    })
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.gameName, game),
      sql`coalesce(${backCatalogVideos.durationSec}, 0) > 120`, // at least 2 min
    ))
    .orderBy(desc(backCatalogVideos.viewCount))
    .limit(10);

  if (sources.length === 0) return 0;

  let clipsQueued = 0;

  for (const src of sources) {
    if (clipsQueued >= MAX_CLIPS_PER_HOT) break;
    if (isShortScheduleSaturated(userId)) break;
    if (!src.durationSec || src.durationSec < 120) continue;

    // Check that we haven't already over-clipped this source
    const [existingCount] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, "youtubeshorts"),
        sql`metadata->>'sourceYoutubeId' = ${src.youtubeVideoId}`,
        sql`${autopilotQueue.status} IN ('scheduled', 'pending')`,
      ));
    const pendingFromSource = +(existingCount?.cnt ?? 0);

    // Cap: never more than 5 pending clips from the same source
    if (pendingFromSource >= 5) continue;

    // Pick an offset that doesn't duplicate known clip positions
    // Use the golden ratio offset (φ = 0.618) per clip to spread coverage
    const clipIndex    = (src.shortsQueuedCount ?? 0) + clipsQueued;
    const goldenOffset = ((clipIndex * 0.618) % 1.0);
    const startSec     = Math.floor(goldenOffset * Math.max(0, src.durationSec - 45));
    const endSec       = startSec + 38; // 38s sweet-spot for algorithm

    const scheduledAt = await getNextShortPublishTime(userId, MIN_DAYS_AHEAD).catch(() => null);
    if (!scheduledAt) continue;
    if (scheduledAt.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) break;

    const label = `[Acceleration] ${game} highlight from: ${src.title?.slice(0, 60) ?? src.youtubeVideoId}`;
    const caption = `🔥 ${game} ${src.title?.slice(0, 60) ?? "highlight"} #gaming #shorts #${game.replace(/\s+/g, "")}`;

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: src.id,
      type:           "platform_short",
      targetPlatform: "youtubeshorts",
      content:        label,
      caption,
      status:         "scheduled",
      scheduledAt,
      metadata: {
        contentType:        "platform_short",
        sourceYoutubeId:    src.youtubeVideoId,
        gameName:           game,
        startSec,
        endSec,
        backCatalogGenerated: true,
        autoQueued:           true,
        grinderGenerated:     false,
        accelerationDoubleDown: true,
        triggeredByHotStreak:   hotVideo.youtubeVideoId,
        channelAvgViews,
      } as any,
    });

    clipsQueued++;
    logger.info(`[Accel] Double-down clip queued from ${src.youtubeVideoId} (game: ${game}, startSec: ${startSec})`);
  }

  return clipsQueued;
}

// ── Brain writes: hot streak formula + avoid pattern ─────────────────────────

async function writeHotStreakFormula(
  userId: string,
  video: {
    youtubeVideoId: string;
    gameName?: string | null;
    durationBucket?: string | null;
    durationSec?: number | null;
    views: number | null;
    ctr?: number | null;
  },
  channelAvg: number,
  clipsQueued: number,
): Promise<void> {
  const mult = channelAvg > 0 ? (video.views ?? 0) / channelAvg : 0;
  const principle = `HOT STREAK FORMULA: ${video.gameName ?? "gaming"} ${video.durationBucket ?? "short"} ` +
    `performed ${mult.toFixed(1)}× channel avg (${video.views ?? 0} views, CTR ${(video.ctr ?? 0).toFixed(1)}%). ` +
    `Queued ${clipsQueued} double-down clips. Flood algorithm with this format NOW.`;

  await db.insert(masterKnowledgeBank).values({
    userId,
    category:          "hot_streak_formula",
    principle,
    sourceEngines:     ["creator-acceleration-engine"],
    evidenceCount:     1,
    confidenceScore:   Math.min(95, Math.round(60 + mult * 10)),
    applicableEngines: ["content-grinder", "back-catalog-engine", "vod-seo-optimizer"],
    isActive:          true,
    metadata: {
      youtubeVideoId: video.youtubeVideoId,
      views:          video.views,
      mult,
      gameName:       video.gameName,
      durationBucket: video.durationBucket,
      durationSec:    video.durationSec,
      ctr:            video.ctr,
      clipsQueued,
      detectedAt:     new Date().toISOString(),
    },
  } as any).catch(() => {}); // ignore duplicate
}

async function writeAvoidPattern(
  userId: string,
  video: {
    youtubeVideoId: string;
    gameName?: string | null;
    durationBucket?: string | null;
    durationSec?: number | null;
    views: number | null;
  },
  channelAvg: number,
): Promise<void> {
  const mult = channelAvg > 0 ? (video.views ?? 0) / channelAvg : 0;
  const principle = `AVOID PATTERN: ${video.gameName ?? "gaming"} ${video.durationBucket ?? "short"} ` +
    `significantly under-performed at ${(mult * 100).toFixed(0)}% of channel avg after 48h. ` +
    `De-prioritise this game/duration combination until we have 3+ examples to confirm.`;

  await db.insert(masterKnowledgeBank).values({
    userId,
    category:          "avoid_pattern",
    principle,
    sourceEngines:     ["creator-acceleration-engine"],
    evidenceCount:     1,
    confidenceScore:   55,
    applicableEngines: ["content-grinder", "back-catalog-engine"],
    isActive:          true,
    metadata: {
      youtubeVideoId: video.youtubeVideoId,
      views:          video.views,
      mult,
      gameName:       video.gameName,
      durationBucket: video.durationBucket,
      detectedAt:     new Date().toISOString(),
    },
  } as any).catch(() => {});
}

// ── Velocity check: flag "acceleration needed" if queue is thin ───────────────

async function checkQueueVelocity(userId: string): Promise<void> {
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400_000);
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtubeshorts"),
      sql`${autopilotQueue.status} IN ('scheduled', 'pending')`,
      lte(autopilotQueue.scheduledAt, threeDaysFromNow),
    ));
  const queuedNext3Days = +(row?.cnt ?? 0);

  if (queuedNext3Days < 9) { // <3/day × 3 days = acceleration needed
    const principle = `QUEUE VELOCITY ALERT: Only ${queuedNext3Days} Shorts scheduled in next 3 days ` +
      `(target: 9+). Trigger emergency back-catalog sweep to refill pipeline immediately.`;
    await db.insert(masterKnowledgeBank).values({
      userId,
      category:          "acceleration_needed",
      principle,
      sourceEngines:     ["creator-acceleration-engine"],
      evidenceCount:     1,
      confidenceScore:   80,
      applicableEngines: ["back-catalog-engine", "content-grinder", "youtube-ai-orchestrator"],
      isActive:          true,
      metadata: { queuedNext3Days, detectedAt: new Date().toISOString() },
    } as any).catch(() => {});
    logger.warn(`[Accel] Queue thin — only ${queuedNext3Days} Shorts in next 3 days. Flagged acceleration_needed.`);
  }
}

// ── Main cycle ─────────────────────────────────────────────────────────────────

let _running = false;

export async function runAccelerationCycle(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const channel = await db
      .select({ userId: channels.userId })
      .from(channels)
      .where(sql`${channels.accessToken} IS NOT NULL AND trim(${channels.accessToken}) <> ''`)
      .limit(1);
    if (!channel[0]?.userId) return;
    const userId = channel[0].userId;

    if (!(await isAutonomousMode(userId))) return;

    // Step 1: Rapid 24h feedback (refresh analytics + write hot/cold signals)
    logger.debug(`[Accel] Step 1: runRapidFeedback24h`);
    await runRapidFeedback24h(userId);

    // Step 2: Channel average (needed for hot streak + cold detection)
    const channelAvg = await getChannelAvgViews(userId);
    if (channelAvg < 10) {
      logger.debug(`[Accel] Channel avg too low (${channelAvg}) — skipping hot streak detection`);
      await checkQueueVelocity(userId);
      return;
    }

    // Step 3: Hot streak — double down on winners
    const hotVideos = await findHotStreakVideos(userId, channelAvg);
    for (const hot of hotVideos) {
      const key = hot.youtubeVideoId;
      const lastProcessed = _hotStreakProcessed.get(key) ?? 0;
      if (Date.now() - lastProcessed < HOT_STREAK_COOLDOWN_MS) continue;

      logger.info(`[Accel] 🔥 Hot streak detected: ${key} — ${hot.views} views (${(( hot.views ?? 0) / channelAvg).toFixed(1)}× avg)`);
      const clipsQueued = await queueAccelerationClips(userId, hot, channelAvg);
      await writeHotStreakFormula(userId, hot, channelAvg, clipsQueued);
      _hotStreakProcessed.set(key, Date.now());

      if (clipsQueued > 0) {
        logger.info(`[Accel] Double-down: queued ${clipsQueued} new clips following hot streak on ${key}`);
      }
    }

    // Step 4: Failure autopsy — learn from cold videos
    const coldVideos = await findColdVideos(userId, channelAvg);
    for (const cold of coldVideos) {
      const pct = channelAvg > 0 ? ((cold.views ?? 0) / channelAvg * 100).toFixed(0) : "0";
      logger.info(`[Accel] ❄️ Cold video: ${cold.youtubeVideoId} — ${pct}% of channel avg after 48h`);
      await writeAvoidPattern(userId, cold, channelAvg);
    }

    // Step 5: Queue velocity check
    await checkQueueVelocity(userId);

    if (hotVideos.length > 0 || coldVideos.length > 0) {
      logger.info(`[Accel] Cycle complete — ${hotVideos.length} hot streak(s), ${coldVideos.length} cold video(s) processed`);
    }
  } catch (err: any) {
    logger.error(`[Accel] Cycle failed: ${err?.message?.slice(0, 300)}`);
  } finally {
    _running = false;
  }
}

// ── Public init ───────────────────────────────────────────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null;

export function initCreatorAccelerationEngine(): ReturnType<typeof setInterval> {
  logger.info(`[Accel] Creator acceleration engine starting in ${STARTUP_DELAY_MS / 60000}min`);
  const timeout = setTimeout(async () => {
    await runAccelerationCycle();
    _interval = setInterval(runAccelerationCycle, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  (timeout as any).unref?.();
  // Return a dummy interval handle for backgroundIntervals array compatibility
  const dummy = setInterval(() => {}, 1 << 30);
  dummy.unref?.();
  return dummy;
}

export function stopCreatorAccelerationEngine(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}
