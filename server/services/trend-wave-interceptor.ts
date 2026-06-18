/**
 * Trend Wave Interceptor
 *
 * Reads `predictiveTrends` (written every ~6 h by the omni-intelligence-harvester)
 * and acts on them BEFORE they peak.  For each rising trend it finds the best
 * matching source video in the back catalog and immediately queues a
 * catalog-remix Short so the channel is riding the wave, not chasing it.
 *
 * Cycle: every 4 h.  Initial run: T+40 min.
 */

import { db } from "../db";
import {
  predictiveTrends,
  backCatalogVideos,
  autopilotQueue,
  channels,
} from "@shared/schema";
import { getFocusGame, buildFocusGameRegex } from "../lib/game-focus";
import { recordEngineKnowledge } from "./knowledge-mesh";
import { recordOutcome } from "../lib/outcome-recorder";
import { eq, and, gt, isNull, or, sql, desc, ilike, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("trend-wave-interceptor");

const CYCLE_MS         = 4 * 60 * 60 * 1000;
const MIN_VELOCITY     = 0.3;   // must be clearly rising
const MAX_PEAK_DAYS    = 21;    // ignore trends peaking >3 weeks out
const FRESHNESS_DAYS   = 4;     // don't re-act on trends older than 4 days
const MAX_TRENDS_CYCLE = 5;     // cap per run to avoid queue spam

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pull keywords from a trend topic string for catalog matching */
function topicKeywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .split(/[\s\-_,]+/)
    .filter(w => w.length > 2)
    .slice(0, 5);
}

/** Find the best unrepurposed catalog video for a trend topic */
async function findCatalogMatch(
  userId: string,
  topic: string,
): Promise<typeof backCatalogVideos.$inferSelect | null> {
  const keywords = topicKeywords(topic);
  if (keywords.length === 0) return null;

  // Build ILIKE conditions for each keyword (OR match)
  const titleConditions  = keywords.map(kw => ilike(backCatalogVideos.title,    `%${kw}%`));
  const gameConditions   = keywords.map(kw => ilike(backCatalogVideos.gameName, `%${kw}%`));
  const allConditions    = [...titleConditions, ...gameConditions];

  const candidates = await db
    .select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      or(...allConditions),
    ))
    .orderBy(
      desc(backCatalogVideos.totalRevivalScore),
      desc(backCatalogVideos.viewCount),
    )
    .limit(5);

  return candidates[0] ?? null;
}

/** Generate a trend-optimised title for a queue item */
async function generateTrendTitle(
  userId: string,
  topic: string,
  sourceTitle: string,
  gameName: string | null,
  urgencyDays: number,
): Promise<string> {
  const prompt = `You are writing a YouTube Short title for ET Gaming 274.

TRENDING NOW: "${topic}" (peaks in ~${urgencyDays} day${urgencyDays === 1 ? "" : "s"})
SOURCE VIDEO: "${sourceTitle}" | Game: ${gameName ?? "Unknown"}

Write ONE title (≤ 60 chars) that:
- Opens with the trending topic or game name
- Uses urgency language ("RIGHT NOW", "2026", "INSANE", "FINALLY", "OMG")
- Is in ALL CAPS for the key hook phrase
- No clickbait promises we can't keep
- Ends with a strong emotional hook

Return ONLY the title string, no quotes, no explanation.`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "content_generation", userId, maxTokens: 60 },
      "You are a viral YouTube title writer. Return only the title string.",
      prompt,
    );
    const title = result.content.trim().replace(/^["']|["']$/g, "");
    return title.slice(0, 100) || `${topic} — ${await getFocusGame()} (No Commentary)`;
  } catch {
    return `${topic} — ${await getFocusGame()} (No Commentary)`;
  }
}

// ── Core cycle ────────────────────────────────────────────────────────────────

async function runTrendWaveInterceptorCycle(userId: string): Promise<void> {
  logger.info(`[TrendWave] Starting cycle — ${userId.slice(0, 8)}`);

  const _trendFocusGame = await getFocusGame().catch(() => "Battlefield 6");
  const _trendFocusRe = buildFocusGameRegex(_trendFocusGame);

  const freshSince = new Date(Date.now() - FRESHNESS_DAYS * 86_400_000);

  const rising = await db
    .select()
    .from(predictiveTrends)
    .where(and(
      or(
        eq(predictiveTrends.userId, userId),
        isNull(predictiveTrends.userId),
      ),
      eq(predictiveTrends.status, "rising"),
      eq(predictiveTrends.actionTaken, false),
      gt(predictiveTrends.velocity, MIN_VELOCITY),
      gte(predictiveTrends.createdAt, freshSince),
    ))
    .orderBy(desc(predictiveTrends.velocity))
    .limit(MAX_TRENDS_CYCLE);

  if (rising.length === 0) {
    logger.info("[TrendWave] No actionable rising trends — waiting for next harvest cycle");
    return;
  }

  logger.info(`[TrendWave] Found ${rising.length} rising trends to intercept`);
  let queued = 0, noMatch = 0;

  for (const trend of rising) {
    const topic = trend.topic;

    // Estimate days to peak
    const urgencyDays = trend.predictedPeakAt
      ? Math.max(1, Math.round((trend.predictedPeakAt.getTime() - Date.now()) / 86_400_000))
      : 7;

    if (urgencyDays > MAX_PEAK_DAYS) {
      // Peak too far out — mark acted so we don't re-check every cycle
      await db.update(predictiveTrends)
        .set({ actionTaken: true })
        .where(eq(predictiveTrends.id, trend.id));
      continue;
    }

    // Find best matching catalog video
    const source = await findCatalogMatch(userId, topic);

    // Focus-game gate: if the matched source is explicitly a different game, skip it
    if (source && source.gameName && !_trendFocusRe.test(source.gameName)) {
      logger.info(`[TrendWave] Skipping non-focus-game source "${source.gameName}" for trend "${topic.substring(0, 50)}"`);
      noMatch++;
      await db.update(predictiveTrends).set({ actionTaken: true }).where(eq(predictiveTrends.id, trend.id));
      continue;
    }

    if (!source) {
      // Write a content-gap signal for the orchestrator to act on
      recordEngineKnowledge(
        "trend-wave-interceptor", userId,
        "trend_gap", topic,
        `TRENDING NOW: "${topic}" (velocity ${trend.velocity?.toFixed(2)}, peaks ~${urgencyDays}d). No catalog video found — this is a CONTENT GAP. Consider covering "${topic}" gameplay ASAP.`,
        `predictiveTrends id=${trend.id}, confidence=${trend.confidence?.toFixed(2) ?? "?"}`,
        Math.round((trend.confidence ?? 0.6) * 100),
        { topic, velocity: trend.velocity, urgencyDays, trendId: trend.id },
      ).catch(() => {});
      noMatch++;

      await db.update(predictiveTrends)
        .set({ actionTaken: true })
        .where(eq(predictiveTrends.id, trend.id));
      continue;
    }

    // Generate a trend-optimised title
    const title = await generateTrendTitle(
      userId,
      topic,
      source.title,
      source.gameName,
      urgencyDays,
    );

    // Schedule: earliest available slot (publish in 15–60 min for immediate trends)
    const scheduleOffset = urgencyDays <= 2
      ? 15 * 60 * 1000              // imminent peak → publish ASAP
      : 2 * 60 * 60 * 1000;        // normal → next 2 h slot
    const scheduledAt = new Date(Date.now() + scheduleOffset);

    try {
      await db.insert(autopilotQueue).values({
        userId,
        type: "catalog-remix",
        targetPlatform: "youtube",
        content: title,
        caption: `${title}\n\n${source.gameName ?? "Gaming"} PS5 No Commentary #${(topic.replace(/\s+/g, "")).slice(0, 30)} #gaming #ps5`,
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "youtube-short",
          sourceYoutubeId: source.youtubeVideoId,
          gameName: source.gameName ?? undefined,
          trendTopic: topic,
          trendVelocity: trend.velocity ?? 0,
          trendUrgencyDays: urgencyDays,
          trendQueued: true,
          trendCategory: trend.category ?? "trending_game",
          confidence: trend.confidence ?? 0.5,
        } as any,
      });
      queued++;

      logger.info(`[TrendWave] Queued "${title.slice(0, 60)}" for trend "${topic}" (peaks ~${urgencyDays}d, vel=${trend.velocity?.toFixed(2)})`);

      // Record to learning_insights — brain aggregates these to understand which
      // trend categories and velocity thresholds produce the most queued content.
      recordOutcome({
        engine:   "trend-wave-interceptor",
        userId,
        category: "system_telemetry:trend_queued",
        summary:  `Trend-wave catalog-remix queued: "${topic}" (vel=${(trend.velocity ?? 0).toFixed(2)}, peaks ~${urgencyDays}d, cat=${trend.category ?? "?"})`,
        metrics: {
          trendVelocity: trend.velocity ?? 0,
          urgencyDays,
          trendCategory: trend.category ?? "trending_game",
          confidence: trend.confidence ?? 0.5,
          sourceGame: source.gameName ?? "unknown",
        },
        recommendation: urgencyDays <= 3
          ? "Imminent peak — ensure this Short is published within 24h for maximum wave capture."
          : "Standard trend — publish within scheduled window.",
      }).catch(() => {});
    } catch (err: any) {
      logger.warn(`[TrendWave] Failed to queue for trend "${topic}": ${err.message?.slice(0, 80)}`);
    }

    // Mark trend acted
    await db.update(predictiveTrends)
      .set({ actionTaken: true })
      .where(eq(predictiveTrends.id, trend.id));
  }

  logger.info(`[TrendWave] Cycle complete — queued=${queued} noMatch=${noMatch}`);

  import("../lib/event-log").then(({ logServiceCycle }) =>
    logServiceCycle("trend-wave-interceptor", userId, {
      processed: rising.length,
      succeeded: queued,
      skipped:   noMatch,
      keyInsight: `queued=${queued} trends, no-match=${noMatch}`,
    })
  ).catch(() => {});
}

// ── Internal userId lookup ─────────────────────────────────────────────────────

async function getPrimaryUserId(): Promise<string | null> {
  const [row] = await db.select({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"))
    .limit(1);
  return row?.userId ?? null;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export function initTrendWaveInterceptor(): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];

  const INITIAL_DELAY = 40 * 60 * 1000;
  const t = setTimeout(async () => {
    const userId = await getPrimaryUserId();
    if (!userId) { logger.warn("[TrendWave] No YouTube channel found — skipping"); return; }
    await runTrendWaveInterceptorCycle(userId).catch(e =>
      logger.error(`[TrendWave] Cycle error: ${e.message}`)
    );
    const interval = setInterval(async () => {
      const uid = await getPrimaryUserId();
      if (uid) await runTrendWaveInterceptorCycle(uid).catch(e =>
        logger.error(`[TrendWave] Cycle error: ${e.message}`)
      );
    }, CYCLE_MS);
    timers.push(interval);
  }, INITIAL_DELAY);

  timers.push(t);
  logger.info("[TrendWave] Scheduled — first run in 40 min");
  return timers;
}
