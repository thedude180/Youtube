/**
 * Viral Prediction Engine
 *
 * Extracts the channel's "viral DNA" from its top/bottom performers, then
 * scores every upcoming queue item (0–100) BEFORE it publishes.  High-scoring
 * items bubble up within their priority tier so the queue always ships the
 * strongest content first.
 *
 * Cycle: every 6 h.  Initial run: T+45 min (after publishers settle).
 */

import { db } from "../db";
import { autopilotQueue, youtubeOutputMetrics, discoveredStrategies, channels } from "@shared/schema";
import { desc, eq, gte, lte, and, sql, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("viral-prediction-engine");

const CYCLE_MS  = 6 * 60 * 60 * 1000;
const MIN_SAMPLE_SIZE = 5;

// ── Types ────────────────────────────────────────────────────────────────────

interface ViralDNA {
  winPatterns:    string[];
  losePatterns:   string[];
  winningGames:   string[];
  winningFormats: string[];
  winningHooks:   string[];
  winningTimings: string[];
  avgWinScore:    number;
  extractedAt:    string;
}

// ── DNA extraction ───────────────────────────────────────────────────────────

async function extractViralDNA(userId: string): Promise<ViralDNA | null> {
  const since = new Date(Date.now() - 90 * 86_400_000);

  const [topPerformers, bottomPerformers] = await Promise.all([
    db.select({
      contentType: youtubeOutputMetrics.contentType,
      gameName:    youtubeOutputMetrics.gameName,
      durationBucket: youtubeOutputMetrics.durationBucket,
      postingWindow:  youtubeOutputMetrics.postingWindow,
      ctr:            youtubeOutputMetrics.ctr,
      performanceScore: youtubeOutputMetrics.performanceScore,
      thumbnailStyleTag: youtubeOutputMetrics.thumbnailStyleTag,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        gte(youtubeOutputMetrics.performanceScore, 65),
        gte(youtubeOutputMetrics.publishedAt, since),
      ))
      .orderBy(desc(youtubeOutputMetrics.performanceScore))
      .limit(25),

    db.select({
      contentType: youtubeOutputMetrics.contentType,
      gameName:    youtubeOutputMetrics.gameName,
      durationBucket: youtubeOutputMetrics.durationBucket,
      postingWindow:  youtubeOutputMetrics.postingWindow,
      ctr:            youtubeOutputMetrics.ctr,
      performanceScore: youtubeOutputMetrics.performanceScore,
      thumbnailStyleTag: youtubeOutputMetrics.thumbnailStyleTag,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        lte(youtubeOutputMetrics.performanceScore, 30),
        gte(youtubeOutputMetrics.publishedAt, since),
      ))
      .orderBy(youtubeOutputMetrics.performanceScore)
      .limit(25),
  ]);

  if (topPerformers.length < MIN_SAMPLE_SIZE) {
    logger.info(`Not enough performance data (${topPerformers.length} winners) — skipping DNA extraction`);
    return null;
  }

  const prompt = `You are a YouTube viral-content analyst for ET Gaming 274 (PS5 gaming, @etgaming274).

TOP PERFORMERS (score ≥ 65, ${topPerformers.length} videos):
${topPerformers.map(v =>
  `type=${v.contentType} | game=${v.gameName ?? "?"} | duration=${v.durationBucket ?? "?"} | timing=${v.postingWindow ?? "?"} | ctr=${(v.ctr ?? 0).toFixed(2)}% | score=${(v.performanceScore ?? 0).toFixed(0)} | thumb=${v.thumbnailStyleTag ?? "?"}`
).join("\n")}

BOTTOM PERFORMERS (score ≤ 30, ${bottomPerformers.length} videos):
${bottomPerformers.map(v =>
  `type=${v.contentType} | game=${v.gameName ?? "?"} | duration=${v.durationBucket ?? "?"} | timing=${v.postingWindow ?? "?"} | ctr=${(v.ctr ?? 0).toFixed(2)}% | score=${(v.performanceScore ?? 0).toFixed(0)} | thumb=${v.thumbnailStyleTag ?? "?"}`
).join("\n")}

Extract the precise viral DNA.  Return ONLY valid JSON with this structure:
{
  "winPatterns": ["what the top performers share — be specific, e.g. 'shorts under 45s outperform 60s+ by 3x'"],
  "losePatterns": ["what bottom performers share — specific"],
  "winningGames": ["game names that consistently rank high"],
  "winningFormats": ["content formats that win, e.g. 'no-commentary short'"],
  "winningHooks": ["hook/thumbnail styles that drive clicks"],
  "winningTimings": ["posting windows that outperform, e.g. 'morning 9-11am'"],
  "avgWinScore": ${topPerformers.reduce((s, v) => s + (v.performanceScore ?? 0), 0) / topPerformers.length}
}`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "trend_detection", userId, maxTokens: 1200 },
      "You are a YouTube viral content analyst. Extract precise DNA patterns from performance data. Return only valid JSON.",
      prompt,
    );
    const parsed = safeParseJSON<Omit<ViralDNA, "extractedAt"> | null>(result.content, null);
    if (!parsed) return null;
    return { ...parsed, extractedAt: new Date().toISOString() };
  } catch (err: any) {
    logger.warn(`DNA extraction AI call failed: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ── Queue item scoring ───────────────────────────────────────────────────────

async function scoreQueueItems(userId: string, dna: ViralDNA): Promise<number> {
  const upcoming = await db.select({
    id:       autopilotQueue.id,
    type:     autopilotQueue.type,
    content:  autopilotQueue.content,
    metadata: autopilotQueue.metadata,
  })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      ne(autopilotQueue.type, "metadata_update"),
    ))
    .limit(60);

  if (upcoming.length === 0) return 0;

  const prompt = `You are scoring YouTube content queue items for viral potential.

CHANNEL VIRAL DNA (what works for this channel):
Win patterns: ${dna.winPatterns.join(" | ")}
Lose patterns: ${dna.losePatterns.join(" | ")}
Winning games: ${dna.winningGames.join(", ")}
Winning formats: ${dna.winningFormats.join(", ")}
Winning hooks: ${dna.winningHooks.join(", ")}

ITEMS TO SCORE (id → description):
${upcoming.map(item => {
  const m = (item.metadata ?? {}) as Record<string, any>;
  return `id=${item.id}: type=${item.type} | game=${m.gameName ?? "?"} | title="${(item.content ?? "").slice(0, 80)}"`;
}).join("\n")}

Score each item 0–100 for viral potential based on the DNA above.
0 = almost certainly weak.  50 = average.  100 = matches every winning pattern.
Return ONLY valid JSON: { "scores": { "id": score, ... } }
IDs are numbers.`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "content_generation", userId, maxTokens: 600 },
      "Score YouTube queue items 0–100 for viral potential. Return only valid JSON.",
      prompt,
    );
    const parsed = safeParseJSON<{ scores?: Record<string, number> } | null>(result.content, null);
    if (!parsed?.scores) return 0;

    let updated = 0;
    for (const [idStr, score] of Object.entries(parsed.scores)) {
      const id = parseInt(idStr, 10);
      if (isNaN(id) || typeof score !== "number") continue;
      const clamped = Math.max(0, Math.min(100, Math.round(score)));
      try {
        await db.update(autopilotQueue)
          .set({
            metadata: sql`jsonb_set(
              COALESCE(${autopilotQueue.metadata}, '{}'),
              '{viralScore}',
              ${String(clamped)}::text::jsonb
            )`,
          })
          .where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId)));
        updated++;
      } catch { /* non-critical */ }
    }
    return updated;
  } catch (err: any) {
    logger.warn(`Scoring AI call failed: ${err.message?.slice(0, 80)}`);
    return 0;
  }
}

// ── Accuracy tracking ────────────────────────────────────────────────────────

async function trackPredictionAccuracy(userId: string): Promise<void> {
  // Find published items that had a viralScore and now have performance data
  const published = await db.select({
    id:           autopilotQueue.id,
    metadata:     autopilotQueue.metadata,
  })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      sql`${autopilotQueue.metadata}->>'viralScore' IS NOT NULL`,
      sql`${autopilotQueue.metadata}->>'predictionChecked' IS NULL`,
      gte(autopilotQueue.publishedAt, new Date(Date.now() - 14 * 86_400_000)),
    ))
    .limit(20);

  if (published.length === 0) return;

  // Join with output metrics to compare predicted vs actual
  let correct = 0, total = 0;
  for (const item of published) {
    const m = (item.metadata ?? {}) as Record<string, any>;
    const predicted = parseFloat(m.viralScore ?? "50");
    const ytId = m.youtubeVideoId as string | undefined;
    if (!ytId) continue;

    const [metric] = await db.select({ performanceScore: youtubeOutputMetrics.performanceScore })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, userId),
        eq(youtubeOutputMetrics.youtubeVideoId, ytId),
      ))
      .limit(1);

    if (!metric?.performanceScore) continue;
    total++;
    // "Correct" = both above 50 or both below 50
    const predictedHigh = predicted >= 50;
    const actualHigh    = metric.performanceScore >= 50;
    if (predictedHigh === actualHigh) correct++;

    // Mark as checked
    await db.update(autopilotQueue)
      .set({
        metadata: sql`jsonb_set(
          COALESCE(${autopilotQueue.metadata}, '{}'),
          '{predictionChecked}',
          'true'::jsonb
        )`,
      })
      .where(eq(autopilotQueue.id, item.id));
  }

  if (total > 0) {
    const accuracy = Math.round((correct / total) * 100);
    logger.info(`Prediction accuracy check: ${correct}/${total} correct (${accuracy}%)`);
  }
}

// ── Main cycle ───────────────────────────────────────────────────────────────

async function runViralPredictionCycle(userId: string): Promise<void> {
  logger.info(`[ViralPredict] Starting cycle — ${userId.slice(0, 8)}`);

  const dna = await extractViralDNA(userId);
  if (!dna) {
    logger.info("[ViralPredict] No DNA extracted — need more performance data");
    return;
  }

  // Persist the DNA so other engines can reference it
  try {
    await db.insert(discoveredStrategies).values({
      userId,
      strategyType: "viral_dna_pattern",
      title: "Channel Viral DNA",
      description: [
        "WIN: " + dna.winPatterns.join("; "),
        "LOSE: " + dna.losePatterns.join("; "),
        "TOP GAMES: " + dna.winningGames.join(", "),
        "FORMATS: " + dna.winningFormats.join(", "),
        "HOOKS: " + dna.winningHooks.join(", "),
      ].join("\n"),
      effectiveness: Math.round(dna.avgWinScore),
      isActive: true,
      metadata: dna as any,
    } as any).onConflictDoNothing();
  } catch { /* non-critical */ }

  const scored = await scoreQueueItems(userId, dna);
  await trackPredictionAccuracy(userId);

  logger.info(`[ViralPredict] Done — scored ${scored} queue items | avgWinScore=${dna.avgWinScore.toFixed(1)}`);
}

// ── Internal userId lookup ────────────────────────────────────────────────────

async function getPrimaryUserId(): Promise<string | null> {
  const [row] = await db.select({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"))
    .limit(1);
  return row?.userId ?? null;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export function initViralPredictionEngine(): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];

  const INITIAL_DELAY = 45 * 60 * 1000;
  const t = setTimeout(async () => {
    const userId = await getPrimaryUserId();
    if (!userId) { logger.warn("[ViralPredict] No YouTube channel found — skipping"); return; }
    await runViralPredictionCycle(userId).catch(e =>
      logger.error(`[ViralPredict] Cycle error: ${e.message}`)
    );
    const interval = setInterval(async () => {
      const uid = await getPrimaryUserId();
      if (uid) await runViralPredictionCycle(uid).catch(e =>
        logger.error(`[ViralPredict] Cycle error: ${e.message}`)
      );
    }, CYCLE_MS);
    timers.push(interval);
  }, INITIAL_DELAY);

  timers.push(t);
  logger.info("[ViralPredict] Scheduled — first run in 45 min");
  return timers;
}
