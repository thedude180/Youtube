/**
 * youtube-learning-brain.ts
 *
 * Phase 6: Central learning brain for the YouTube autopilot.
 *
 * Every subsystem emits events here (uploads, Shorts, live, errors, chat).
 * Once per day the brain runs a full learning cycle:
 *   1. Pull fresh YouTube Analytics data for recent uploads.
 *   2. Update the duration model.
 *   3. Rank posting windows.
 *   4. Identify title and thumbnail patterns from top performers.
 *   5. Generate a plain-English daily learning report.
 *   6. Write updated recommendations.
 *
 * Outputs feed back into:
 *   • chooseBestLongFormDuration  (performance-learner)
 *   • getNextShort/LongFormPublishTime  (output-schedule)
 *   • youtube-live-copilot (chat style recommendations)
 */

import { db } from "../db";
import {
  learningEvents,
  youtubeOutputMetrics,
  livestreamLearningEvents,
  learningInsights,
  autopilotQueue,
  channels,
  masterKnowledgeBank,
  systemIncidentLog,
  growthStrategies,
  predictiveTrends,
  contentVaultBackups,
  backCatalogVideos,
  pipelineTraces,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNotNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import {
  recordVideoPerformance,
  updateDurationModel,
  getBucketRankings,
  getWindowRankings,
  refreshStaleVideoMetrics,
} from "./youtube-performance-learner";
import { refreshSuccessDNA } from "../lib/success-dna";
import { recordEngineKnowledge } from "./knowledge-mesh";
import { runCohortAnalysis } from "./generation-cohort-tracker";
import { promoteIncidentLessonsToKnowledge } from "../lib/incident-log";

const logger = createLogger("learning-brain");
const openai = getRawOpenAIClientForDirectUse();

// ── Cross-engine outcome intake ────────────────────────────────────────────────
// Every service that calls recordOutcome() writes to learningInsights.
// This function reads what ALL engines wrote in the last 24 hours and synthesises
// improvement directives into masterKnowledgeBank so the entire system's
// operational health automatically informs the brain's next decisions.

async function ingestCrossEngineOutcomes(userId: string): Promise<void> {
  try {
    const yesterday = new Date(Date.now() - 24 * 3600_000);

    // Pull every insight written by engines OTHER than the brain's own analysis
    const rows = await db
      .select({
        category:   learningInsights.category,
        pattern:    learningInsights.pattern,
        confidence: learningInsights.confidence,
        data:       learningInsights.data,
      })
      .from(learningInsights)
      .where(and(
        eq(learningInsights.userId, userId),
        gte(learningInsights.createdAt, yesterday),
        sql`${learningInsights.category} NOT LIKE 'youtube_performance%'`,
        sql`${learningInsights.category} NOT LIKE 'daily_digest%'`,
      ))
      .orderBy(desc(learningInsights.createdAt))
      .limit(40);

    if (rows.length === 0) return;

    // Group by engine (prefix before the first colon in category)
    const byEngine = new Map<string, string[]>();
    for (const row of rows) {
      const engine = (row.category ?? "unknown").split(":")[0];
      const patterns = byEngine.get(engine) ?? [];
      patterns.push(row.pattern ?? "");
      byEngine.set(engine, patterns);
    }

    // Promote one operational-telemetry entry per engine to masterKnowledgeBank
    for (const [engine, patterns] of byEngine.entries()) {
      if (!patterns.length) continue;
      const principle =
        `[${engine}] ${patterns.length} outcome(s) last 24h — latest: ${patterns[0].slice(0, 160)}`;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "operational_telemetry",
        principle,
        sourceEngines:     [engine, "learning-brain"],
        evidenceCount:     patterns.length,
        confidenceScore:   70,
        applicableEngines: ["youtube-ai-orchestrator", "content-grinder", "back-catalog-engine"],
        isActive:          true,
        metadata: {
          engine,
          patternCount:  patterns.length,
          latestPattern: patterns[0],
          intakeAt:      new Date().toISOString(),
        },
      } as any).catch(() => {}); // suppress duplicate-key noise
    }

    logger.info(
      `[Brain] Cross-engine intake: ${rows.length} insight(s) from ${byEngine.size} engine(s) → masterKnowledgeBank`,
    );
  } catch (err: any) {
    logger.warn(`[Brain] Cross-engine intake failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── Pipeline intelligence intake ───────────────────────────────────────────────
// Reads raw operational tables the daily cycle never previously touched:
// autopilot_queue outcomes, vault download health, catalog stock, pipeline
// traces, and queue churn.  Every signal becomes a masterKnowledgeBank
// principle so AI generators get a continuous operational picture.

async function ingestPipelineIntelligence(userId: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

    // 1. Queue outcome rates — publish success/fail breakdown by type (last 7d)
    const queueOutcomes = await db.execute(sql`
      SELECT
        type,
        COUNT(*) FILTER (WHERE status = 'published')   AS published,
        COUNT(*) FILTER (WHERE status = 'permanent_fail' OR status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status IN ('scheduled','pending'))               AS pending,
        COUNT(*)                                                                AS total
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND created_at >= ${sevenDaysAgo}
      GROUP BY type
      ORDER BY total DESC
      LIMIT 10
    `);
    const queueRows = (queueOutcomes as unknown as { rows: any[] }).rows ?? [];
    for (const r of queueRows.slice(0, 5)) {
      const total = Number(r.total) || 1;
      const successRate = Math.round((Number(r.published) / total) * 100);
      const principle = `[queue-outcomes] ${r.type}: ${successRate}% publish rate last 7d (${r.published}/${total} published, ${r.failed} failed, ${r.pending} pending)`;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "pipeline_intelligence",
        principle,
        sourceEngines:     ["learning-brain", "autopilot-queue"],
        evidenceCount:     total,
        confidenceScore:   Math.min(85, 50 + Math.floor(total / 2)),
        applicableEngines: ["shorts-publisher", "long-form-publisher", "back-catalog-engine", "youtube-ai-orchestrator"],
        isActive:          true,
        metadata: { type: r.type, published: r.published, failed: r.failed, pending: r.pending, successRate, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // 2. Vault health — source video download availability
    const vaultHealth = await db.execute(sql`
      SELECT status, COUNT(*) AS cnt
      FROM content_vault_backups
      GROUP BY status
      ORDER BY cnt DESC
    `);
    const vaultRows = (vaultHealth as unknown as { rows: any[] }).rows ?? [];
    const vaultTotal = vaultRows.reduce((s: number, r: any) => s + Number(r.cnt), 0) || 1;
    const vaultDownloaded = Number(vaultRows.find((r: any) => r.status === "downloaded")?.cnt ?? 0);
    const vaultFailed = Number(vaultRows.find((r: any) => r.status === "failed")?.cnt ?? 0);
    const vaultIndexed = Number(vaultRows.find((r: any) => r.status === "indexed")?.cnt ?? 0);
    if (vaultTotal > 0) {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "pipeline_intelligence",
        principle:         `[vault-health] ${vaultDownloaded} source videos downloaded and ready for encoding; ${vaultIndexed} queued to download; ${vaultFailed} permanently unavailable (${Math.round(vaultFailed / vaultTotal * 100)}% loss rate)`,
        sourceEngines:     ["learning-brain", "video-vault"],
        evidenceCount:     vaultTotal,
        confidenceScore:   80,
        applicableEngines: ["back-catalog-engine", "pre-encoder", "youtube-ai-orchestrator"],
        isActive:          true,
        metadata: { downloaded: vaultDownloaded, failed: vaultFailed, indexed: vaultIndexed, total: vaultTotal, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // 3. Catalog stock — BF6 mining depth remaining
    const catalogStock = await db.execute(sql`
      SELECT
        game_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE score IS NOT NULL AND score >= 60) AS high_score,
        ROUND(AVG(score)::numeric, 1) AS avg_score
      FROM back_catalog_videos
      WHERE channel_id = 53
      GROUP BY game_name
      ORDER BY total DESC
      LIMIT 8
    `);
    const catalogRows = (catalogStock as unknown as { rows: any[] }).rows ?? [];
    for (const r of catalogRows.slice(0, 4)) {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "pipeline_intelligence",
        principle:         `[catalog-stock] ${r.game_name}: ${r.total} catalog videos (${r.high_score} high-score ≥60, avg score ${r.avg_score ?? "n/a"}) available for clip mining`,
        sourceEngines:     ["learning-brain", "back-catalog-engine"],
        evidenceCount:     Number(r.total),
        confidenceScore:   75,
        applicableEngines: ["back-catalog-engine", "youtube-ai-orchestrator"],
        isActive:          true,
        metadata: { game: r.game_name, total: r.total, highScore: r.high_score, avgScore: r.avg_score, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // 4. Pipeline trace patterns — stuck/missing content from last 7d
    const tracePatterns = await db.execute(sql`
      SELECT
        status,
        stage,
        COUNT(*) AS cnt
      FROM pipeline_traces
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY status, stage
      ORDER BY cnt DESC
      LIMIT 8
    `);
    const traceRows = (tracePatterns as unknown as { rows: any[] }).rows ?? [];
    const stuckCount = traceRows.filter((r: any) => r.status === "stuck" || r.status === "missing").reduce((s: number, r: any) => s + Number(r.cnt), 0);
    const verifiedCount = traceRows.filter((r: any) => r.status === "verified").reduce((s: number, r: any) => s + Number(r.cnt), 0);
    if (stuckCount + verifiedCount > 0) {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "pipeline_intelligence",
        principle:         `[pipeline-traces] Last 7d: ${verifiedCount} videos confirmed live on YouTube; ${stuckCount} stuck/missing — pipeline health ${stuckCount === 0 ? "CLEAN" : stuckCount < 5 ? "MINOR ISSUES" : "NEEDS ATTENTION"}`,
        sourceEngines:     ["learning-brain", "pipeline-tracer"],
        evidenceCount:     stuckCount + verifiedCount,
        confidenceScore:   stuckCount === 0 ? 85 : 65,
        applicableEngines: ["youtube-ai-orchestrator", "shorts-publisher", "long-form-publisher"],
        isActive:          true,
        metadata: { verified: verifiedCount, stuck: stuckCount, stageBreakdown: traceRows.slice(0, 5), intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // 5. Queue churn — items deferred 3+ times (repeated failure signal)
    const churnItems = await db.execute(sql`
      SELECT type, COUNT(*) AS cnt
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND status IN ('scheduled','pending')
        AND (metadata->>'deferCount')::int >= 3
      GROUP BY type
      ORDER BY cnt DESC
      LIMIT 6
    `);
    const churnRows = (churnItems as unknown as { rows: any[] }).rows ?? [];
    const totalChurn = churnRows.reduce((s: number, r: any) => s + Number(r.cnt), 0);
    if (totalChurn > 0) {
      const churnBreakdown = churnRows.map((r: any) => `${r.type}:${r.cnt}`).join(", ");
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "pipeline_intelligence",
        principle:         `[queue-churn] ${totalChurn} queue items deferred 3+ times (repeated failures): ${churnBreakdown} — investigate source availability or encoding issues for these types`,
        sourceEngines:     ["learning-brain", "autopilot-queue"],
        evidenceCount:     totalChurn,
        confidenceScore:   70,
        applicableEngines: ["back-catalog-engine", "pre-encoder", "youtube-ai-orchestrator"],
        isActive:          true,
        metadata: { totalChurn, breakdown: churnRows, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    const signalCount = queueRows.length + (vaultTotal > 0 ? 1 : 0) + catalogRows.length + (stuckCount + verifiedCount > 0 ? 1 : 0) + (totalChurn > 0 ? 1 : 0);
    logger.info(`[Brain] Pipeline intelligence: ${signalCount} signal(s) ingested → masterKnowledgeBank`);
  } catch (err: any) {
    logger.warn(`[Brain] Pipeline intelligence intake failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── Micro-signal harvester (4h) ────────────────────────────────────────────────
// Lightweight harvester that runs every 4 hours between daily cycles.
// No AI calls — pure DB observation → masterKnowledgeBank micro-signals.
// Every publish, failure, and pipeline event in the last 4h becomes a
// living signal so the brain accumulates knowledge continuously, not just
// once per day.

const _lastMicroHarvestAt = new Map<string, number>();
const MICRO_HARVEST_COOLDOWN_MS = 3.5 * 3_600_000; // max once per 3.5h

export async function harvestMicroSignals(userId: string): Promise<void> {
  const last = _lastMicroHarvestAt.get(userId) ?? 0;
  if (Date.now() - last < MICRO_HARVEST_COOLDOWN_MS) return;
  _lastMicroHarvestAt.set(userId, Date.now());

  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 3_600_000);

    // Recent publishing activity
    const recentPublishes = await db.execute(sql`
      SELECT
        type,
        COUNT(*) FILTER (WHERE status = 'published' AND published_at >= ${fourHoursAgo}) AS published,
        COUNT(*) FILTER (WHERE status IN ('failed','permanent_fail') AND updated_at >= ${fourHoursAgo}) AS failed
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND (published_at >= ${fourHoursAgo} OR updated_at >= ${fourHoursAgo})
      GROUP BY type
      HAVING COUNT(*) FILTER (WHERE status = 'published' AND published_at >= ${fourHoursAgo}) > 0
          OR COUNT(*) FILTER (WHERE status IN ('failed','permanent_fail') AND updated_at >= ${fourHoursAgo}) > 0
      ORDER BY published DESC
      LIMIT 6
    `);
    const pubRows = (recentPublishes as unknown as { rows: any[] }).rows ?? [];

    for (const r of pubRows) {
      if (Number(r.published) === 0 && Number(r.failed) === 0) continue;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "micro_signal",
        principle:         `[4h-activity] ${r.type}: ${r.published} published, ${r.failed} failed in last 4h`,
        sourceEngines:     ["micro-signal-harvester"],
        evidenceCount:     Number(r.published) + Number(r.failed),
        confidenceScore:   60,
        applicableEngines: ["youtube-ai-orchestrator"],
        isActive:          true,
        metadata: { type: r.type, published: r.published, failed: r.failed, harvestedAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // Recent vault downloads completed
    const recentVaultDone = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM content_vault_backups
      WHERE updated_at >= ${fourHoursAgo} AND status = 'downloaded'
    `);
    const vaultDone = Number((recentVaultDone as unknown as { rows: any[] }).rows?.[0]?.cnt ?? 0);
    if (vaultDone > 0) {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "micro_signal",
        principle:         `[4h-vault] ${vaultDone} source video(s) finished downloading in last 4h — new raw material available for encoding`,
        sourceEngines:     ["micro-signal-harvester", "video-vault"],
        evidenceCount:     vaultDone,
        confidenceScore:   65,
        applicableEngines: ["pre-encoder", "back-catalog-engine"],
        isActive:          true,
        metadata: { vaultDownloadsCompleted: vaultDone, harvestedAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    const totalSignals = pubRows.length + (vaultDone > 0 ? 1 : 0);
    if (totalSignals > 0) {
      logger.info(`[Brain] Micro-harvest: ${totalSignals} signal(s) written → masterKnowledgeBank`);
    }
  } catch (err: any) {
    logger.debug(`[Brain] Micro-signal harvest non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Track daily cycle per user ─────────────────────────────────────────────────

const _lastCycleAt = new Map<string, number>();
const CYCLE_INTERVAL_MS = 20 * 3_600_000; // run at most once per 20 hours

// ── Track weekly synthesis per user ───────────────────────────────────────────
const _lastWeeklyCycleAt = new Map<string, number>();
const WEEKLY_CYCLE_INTERVAL_MS = 168 * 3_600_000; // once per 7 days

// ── Public: record any learning event ────────────────────────────────────────

export async function recordLearningEvent(
  userId: string,
  eventType: string,
  data: Record<string, any>,
  outcome?: string,
  performanceDelta?: number,
): Promise<void> {
  try {
    await db.insert(learningEvents).values({
      userId,
      eventType,
      sourceAgent: data.sourceAgent ?? "system",
      data,
      outcome: outcome ?? "recorded",
      performanceDelta: performanceDelta ?? null,
    });
  } catch (err: any) {
    logger.debug(`[Brain] recordLearningEvent skipped: ${err.message?.slice(0, 100)}`);
  }
}

// ── Daily learning cycle ──────────────────────────────────────────────────────

export interface DailyLearningReport {
  userId: string;
  generatedAt: string;
  totalUploads: number;
  totalShorts: number;
  totalLongForm: number;
  bestDurationBucket: string;
  worstDurationBucket: string;
  bestPostingWindow: string;
  avgPerformanceScore: number;
  newInsights: string[];
  recommendations: string[];
  summary: string;
}

export async function runDailyLearningCycle(userId: string): Promise<DailyLearningReport | null> {
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < CYCLE_INTERVAL_MS) {
    logger.debug(`[Brain] Daily cycle skipped for ${userId.slice(0, 8)} — ran recently`);
    return null;
  }
  _lastCycleAt.set(userId, Date.now());

  logger.info(`[Brain] Starting daily learning cycle for ${userId.slice(0, 8)}`);

  // Step 0: Ingest what every other engine recorded since the last cycle.
  // This closes the feedback loop — operational outcomes from publishers,
  // SEO engine, pipeline tracer, etc. are synthesised into masterKnowledgeBank
  // before the brain's own analysis runs, so all downstream AI calls have
  // fresh cross-engine context.
  await ingestCrossEngineOutcomes(userId);

  try {
    // 1. Pull analytics for any published videos missing metrics
    await refreshMissingAnalytics(userId);

    // 1b. Refresh analytics for videos already in the metrics table that are
    //     stale (published > 48 h ago, not measured in the last 6 h).
    //     This closes the feedback loop as watch-time accumulates over time.
    await refreshStaleVideoMetrics(userId);

    // 2. Update the duration model
    await updateDurationModel(userId);

    // 3. Get rankings
    const [buckets, windows] = await Promise.all([
      getBucketRankings(userId),
      getWindowRankings(userId),
    ]);

    const longFormBuckets = buckets.filter(b => b.contentType === "long_form");
    const bestBucket = longFormBuckets[0]?.bucket ?? "unknown (not enough data yet)";
    const worstBucket = longFormBuckets.at(-1)?.bucket ?? "unknown";
    const bestWindow = windows[0]?.window ?? "unknown (not enough data yet)";
    const avgScore = buckets.length
      ? buckets.reduce((s, b) => s + b.avgScore, 0) / buckets.length
      : 0;

    // 4. Count uploads
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
    const [uploadStats] = await db.select({
      total: sql<number>`count(*)::int`,
      shorts: sql<number>`count(*) filter (where type in ('platform_short','youtube_short'))::int`,
      longForm: sql<number>`count(*) filter (where metadata->>'contentType' = 'long-form-clip')::int`,
    })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        gte(autopilotQueue.publishedAt, thirtyDaysAgo),
      ));

    // 5. Generate insights
    const insights: string[] = [];
    const recommendations: string[] = [];

    if (longFormBuckets.length >= 2) {
      const best = longFormBuckets[0];
      const worst = longFormBuckets.at(-1)!;
      insights.push(`${best.bucket} long-form videos average a performance score of ${best.avgScore.toFixed(1)} vs ${worst.avgScore.toFixed(1)} for ${worst.bucket}`);
      if (best.avgViewPct > 50) {
        insights.push(`${best.bucket} videos retain over ${best.avgViewPct.toFixed(0)}% of viewers on average — strong completion rate`);
      }
      if (worst.avgScore < best.avgScore * 0.5) {
        recommendations.push(`Reduce ${worst.bucket} clips — they underperform by ${Math.round((1 - worst.avgScore / best.avgScore) * 100)}% vs your best bucket`);
      }
    }

    if (windows.length >= 2) {
      insights.push(`Best posting window is ${bestWindow} with avg score ${windows[0].avgScore.toFixed(1)}`);
      if (windows[0].avgScore > windows.at(-1)!.avgScore * 1.3) {
        recommendations.push(`Focus uploads on the ${bestWindow} window — it outperforms ${windows.at(-1)!.window} by ${Math.round((windows[0].avgScore / windows.at(-1)!.avgScore - 1) * 100)}%`);
      }
    }

    // 6. AI-generated summary
    let summary = "Learning cycle complete. System is monitoring performance across all upload types.";
    if (insights.length && tryAcquireAISlotNow()) {
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You write concise, plain-English performance summaries for a YouTube gaming channel autopilot system. Max 3 sentences. Data-driven. No fluff.",
            },
            {
              role: "user",
              content: `Last 30 days: ${uploadStats?.total ?? 0} published videos, ${uploadStats?.shorts ?? 0} Shorts, ${uploadStats?.longForm ?? 0} long-form.\nInsights: ${insights.join(". ")}\nRecommendations: ${recommendations.join(". ")}\n\nWrite a 2-3 sentence daily learning summary.`,
            },
          ],
          max_completion_tokens: 150,
        });
        releaseAISlot();
        summary = resp.choices[0]?.message?.content?.trim() || summary;
      } catch {
        releaseAISlot();
      }
    }

    // 7. Store insights in learningInsights table
    for (const insight of insights.slice(0, 3)) {
      try {
        await db.insert(learningInsights).values({
          userId,
          category: "youtube_performance",
          pattern: insight.slice(0, 200),
          confidence: 0.7,
          sampleSize: buckets.reduce((s, b) => s + b.sampleCount, 0),
          data: {
            finding: insight,
            evidence: buckets.slice(0, 3).map(b => `${b.bucket}: score=${b.avgScore}`),
            recommendation: recommendations[0] ?? "Continue current approach",
          },
        });
      } catch { /* ok if duplicate */ }
    }

    // 8. Record the cycle completion
    await recordLearningEvent(userId, "daily_cycle_complete", {
      sourceAgent: "learning-brain",
      bestBucket,
      worstBucket,
      bestWindow,
      insightCount: insights.length,
      totalUploads: uploadStats?.total ?? 0,
    }, "success");

    const report: DailyLearningReport = {
      userId,
      generatedAt: new Date().toISOString(),
      totalUploads: uploadStats?.total ?? 0,
      totalShorts: uploadStats?.shorts ?? 0,
      totalLongForm: uploadStats?.longForm ?? 0,
      bestDurationBucket: bestBucket,
      worstDurationBucket: worstBucket,
      bestPostingWindow: bestWindow,
      avgPerformanceScore: +avgScore.toFixed(2),
      newInsights: insights,
      recommendations,
      summary,
    };

    logger.info(`[Brain] Daily cycle complete for ${userId.slice(0, 8)}: ${insights.length} insights, best=${bestBucket}`);

    // 9. Compound the feedback loop — extract winning patterns from real metrics
    //    and write them into masterKnowledgeBank so every AI generator gets smarter.
    try {
      await refreshSuccessDNA(userId);
    } catch (dnaErr: any) {
      logger.warn(`[Brain] refreshSuccessDNA failed (non-fatal): ${dnaErr.message?.slice(0, 120)}`);
    }

    // 9b. Promote unlearned system incident lessons into masterKnowledgeBank.
    //     Any high/critical severity resolved incident that hasn't been promoted yet
    //     gets written as a "system_lesson" principle so every AI agent is aware of
    //     the system's failure modes and the rules that prevent them from recurring.
    try {
      const promoted = await promoteIncidentLessonsToKnowledge(userId);
      if (promoted > 0) {
        logger.info(`[Brain] Promoted ${promoted} system incident lessons → masterKnowledgeBank`);
      }
    } catch (incErr: any) {
      logger.debug(`[Brain] promoteIncidentLessons non-fatal: ${incErr?.message?.slice(0, 80)}`);
    }

    // 9c. Measure generation-over-generation improvement velocity.
    //     Groups content by ISO week and writes a velocity signal to masterKnowledgeBank
    //     so the orchestrator knows if recent changes are actually helping or hurting.
    try {
      const velocity = await runCohortAnalysis(userId);
      if (velocity.trend !== "insufficient_data") {
        logger.info(`[Brain] Improvement velocity: ${velocity.trend} (${velocity.velocityPct != null ? (velocity.velocityPct > 0 ? "+" : "") + velocity.velocityPct + "%" : "no prev cohort"})`);
      }
    } catch (cohortErr: any) {
      logger.debug(`[Brain] Cohort analysis skipped (non-fatal): ${cohortErr.message?.slice(0, 80)}`);
    }

    // 9d. Promote top internet-sourced intelligence into engineKnowledge (→ masterKnowledgeBank).
    //     Reads from growthStrategies + predictiveTrends tables populated by the omni-intelligence
    //     harvester (YouTube trending, Reddit, RSS, DuckDuckGo). Elevates the highest-confidence
    //     signals so every AI content generator benefits from live external intelligence.
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
      const channelRows = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
        .limit(1);
      const channelId = channelRows[0]?.id;

      const [topStrategies, topTrends] = await Promise.all([
        channelId
          ? db.select({ title: growthStrategies.title, description: growthStrategies.description, priority: growthStrategies.priority })
              .from(growthStrategies)
              .where(eq(growthStrategies.channelId, channelId))
              .orderBy(desc(growthStrategies.createdAt))
              .limit(5)
          : Promise.resolve([] as any[]),
        db.select({ topic: predictiveTrends.topic, category: predictiveTrends.category, velocity: predictiveTrends.velocity, confidence: predictiveTrends.confidence })
          .from(predictiveTrends)
          .where(and(
            eq(predictiveTrends.userId, userId),
            gte(predictiveTrends.createdAt, sevenDaysAgo),
          ))
          .orderBy(desc(predictiveTrends.velocity))
          .limit(5),
      ]);

      let internetPromoted = 0;
      for (const s of topStrategies) {
        if (!s.title) continue;
        await recordEngineKnowledge(
          "learning-brain", userId,
          "internet_intelligence", `growth_strategy:${String(s.title).slice(0, 60)}`,
          `GROWTH STRATEGY: ${s.title}${s.description ? " — " + String(s.description).slice(0, 180) : ""}`,
          `priority=${s.priority ?? "medium"}`,
          s.priority === "high" ? 75 : 60,
        ).catch(() => {});
        internetPromoted++;
      }
      for (const t of topTrends) {
        if (!t.topic) continue;
        await recordEngineKnowledge(
          "learning-brain", userId,
          "internet_intelligence", `rising_trend:${String(t.topic).slice(0, 60)}`,
          `RISING TREND: "${t.topic}" (velocity ${Number(t.velocity ?? 0).toFixed(2)}, category: ${t.category ?? "general"}) — prioritise content on this NOW`,
          `confidence=${(Number(t.confidence ?? 0) * 100).toFixed(0)}%`,
          Math.min(88, Math.round(Number(t.confidence ?? 0.5) * 100)),
        ).catch(() => {});
        internetPromoted++;
      }
      if (internetPromoted > 0) {
        logger.info(`[Brain] Promoted ${internetPromoted} internet intelligence signals → engineKnowledge`);
      }
    } catch (internetErr: any) {
      logger.debug(`[Brain] Internet intelligence promotion non-fatal: ${internetErr?.message?.slice(0, 80)}`);
    }

    // 9e. Seed curated SEO templates into masterKnowledgeBank (idempotent) + run
    //     metadata repair cycle to fix any published videos with PS5-fallback or
    //     generic "Live Stream" titles. Both run at most once per 20h per user and
    //     are fully non-fatal — a failure here must never break the daily cycle.
    try {
      const { seedSEOTemplatesToKnowledgeBank } = await import("../lib/seo-templates");
      await seedSEOTemplatesToKnowledgeBank(userId);
    } catch (seoSeedErr: any) {
      logger.debug(`[Brain] SEO template seed non-fatal: ${seoSeedErr?.message?.slice(0, 80)}`);
    }
    try {
      const { runMetadataRepairCycle } = await import("./metadata-repair");
      const { repaired } = await runMetadataRepairCycle(userId);
      if (repaired > 0) {
        logger.info(`[Brain] Metadata repair: ${repaired} video title(s) fixed`);
      }
    } catch (repairErr: any) {
      logger.debug(`[Brain] Metadata repair non-fatal: ${repairErr?.message?.slice(0, 80)}`);
    }

    // 9f. Template performance scoring — adjusts confidenceScore in masterKnowledgeBank
    //     for "seo_template" principles based on real CTR data from youtube_output_metrics.
    //     Non-fatal; runs at most once per 20h per user.
    try {
      const { runTemplatePerfScoring } = await import("./template-performance-scorer");
      const { updated, skipped } = await runTemplatePerfScoring(userId);
      if (updated > 0) {
        logger.info(`[Brain] Template perf scoring: ${updated} principle(s) confidence adjusted`);
      } else if (skipped) {
        logger.debug(`[Brain] Template perf scoring skipped: ${skipped}`);
      }
    } catch (tpsErr: any) {
      logger.debug(`[Brain] Template perf scoring non-fatal: ${tpsErr?.message?.slice(0, 80)}`);
    }

    // 9g. Pipeline intelligence — harvest operational signals from every major
    //     table that the brain previously never read: autopilot_queue outcome
    //     rates, vault download health, catalog stock depth, pipeline trace
    //     patterns, and queue churn.  Each signal becomes a masterKnowledgeBank
    //     principle that flows into every downstream AI generator.
    try {
      await ingestPipelineIntelligence(userId);
    } catch (piErr: any) {
      logger.debug(`[Brain] Pipeline intelligence intake non-fatal: ${piErr?.message?.slice(0, 80)}`);
    }

    // 9h. Causal synthesis — extract causal chains from cross-domain signals
    //     (curiosity + science + psychology + marketing → channel action rules).
    //     ASI pillar #2: the system builds a causal world model, not just patterns.
    try {
      const { runCausalSynthesis } = await import("./causal-synthesis");
      const chains = await runCausalSynthesis(userId);
      if (chains > 0) {
        logger.info(`[Brain] Causal synthesis: ${chains} causal chain(s) added to masterKnowledgeBank`);
      }
    } catch (csErr: any) {
      logger.debug(`[Brain] Causal synthesis non-fatal: ${csErr?.message?.slice(0, 80)}`);
    }

    // 9i. Prediction tracking — measure 14-day outcomes for growth strategies
    //     that had an estimatedImpact. Calibrates AI prediction accuracy over time.
    //     ASI pillar #4: the system corrects its own predictions.
    try {
      const { runPredictionTracking } = await import("./prediction-tracker");
      await runPredictionTracking(userId);
    } catch (ptErr: any) {
      logger.debug(`[Brain] Prediction tracking non-fatal: ${ptErr?.message?.slice(0, 80)}`);
    }

    // 9j. Goal progress measurement — measure 30-day output targets vs actuals.
    //     ASI pillar #5: the system always knows where it wants to be and re-plans.
    try {
      const { measureAndLogGoalProgress } = await import("./goal-planner");
      await measureAndLogGoalProgress(userId);
    } catch (gpErr: any) {
      logger.debug(`[Brain] Goal progress measurement non-fatal: ${gpErr?.message?.slice(0, 80)}`);
    }

    // 10. Write key findings to engineKnowledge so cross-pollination picks them up
    if (buckets.length >= 2) {
      const bestLong = longFormBuckets[0];
      if (bestLong) {
        await recordEngineKnowledge(
          "learning-brain", userId,
          "performance", `best_duration_bucket`,
          `${bestLong.bucket} long-form videos score ${bestLong.avgScore.toFixed(1)} avg — the top-performing duration on this channel`,
          `${bestLong.sampleCount} videos measured`,
          Math.min(90, 50 + bestLong.sampleCount * 5),
        ).catch(() => {});
      }
    }
    if (windows.length >= 1) {
      const bestWin = windows[0];
      if (bestWin) {
        await recordEngineKnowledge(
          "learning-brain", userId,
          "performance", `best_posting_window`,
          `Posting in the ${bestWin.window} window achieves the highest performance score (${bestWin.avgScore.toFixed(1)})`,
          `${bestWin.sampleCount} videos measured`,
          Math.min(88, 50 + bestWin.sampleCount * 5),
        ).catch(() => {});
      }
    }

    // 11. Generate overnight intelligence digest for the dashboard card (fire-and-forget)
    generateAndStoreDigest(userId, {
      bestDurationBucket: bestBucket,
      bestPostingWindow: bestWindow,
      avgPerformanceScore: +avgScore.toFixed(2),
      insightCount: insights.length,
    }).catch((e: any) => logger.debug(`[Brain] digest non-fatal: ${e?.message?.slice(0, 80)}`));

    // 12. Weekly deep synthesis — fire-and-forget, only when 7 days have elapsed
    const lastWeekly = _lastWeeklyCycleAt.get(userId) ?? 0;
    if (Date.now() - lastWeekly >= WEEKLY_CYCLE_INTERVAL_MS) {
      runWeeklySynthesis(userId).catch((e: any) =>
        logger.debug(`[Brain] weekly synthesis non-fatal: ${e?.message?.slice(0, 80)}`),
      );
    }

    return report;
  } catch (err: any) {
    logger.warn(`[Brain] Daily cycle failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
    return null;
  }
}

// ── Weekly deep synthesis ────────────────────────────────────────────────────
// Runs at most once per 7 days. Reads the full knowledge bank + recent insights
// + incident log and produces a comprehensive "weekly strategy brief" that gets
// written as a masterKnowledgeBank entry with category="weekly_strategy_brief".
// This is the "step back and look at the big picture" pass that human creators
// do every week.

async function runWeeklySynthesis(userId: string): Promise<void> {
  const lastWeekly = _lastWeeklyCycleAt.get(userId) ?? 0;
  if (Date.now() - lastWeekly < WEEKLY_CYCLE_INTERVAL_MS) return;
  _lastWeeklyCycleAt.set(userId, Date.now());

  logger.info(`[Brain] Starting weekly synthesis for ${userId.slice(0, 8)}`);

  try {
    const now = new Date();
    const last30d = new Date(now.getTime() - 30 * 86_400_000);
    const last7d  = new Date(now.getTime() - 7  * 86_400_000);

    // Gather all knowledge sources
    const [allPrinciples, recentInsights, recentIncidents, topVideos, associationInsights] = await Promise.all([
      // All active master knowledge (full picture)
      db.select({
        category:   masterKnowledgeBank.category,
        principle:  masterKnowledgeBank.principle,
        confidence: masterKnowledgeBank.confidenceScore,
        evidence:   masterKnowledgeBank.evidenceCount,
      })
        .from(masterKnowledgeBank)
        .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
        .orderBy(desc(masterKnowledgeBank.confidenceScore))
        .limit(30),

      // Learning insights from last 30d
      db.select({ pattern: learningInsights.pattern, confidence: learningInsights.confidence, data: learningInsights.data })
        .from(learningInsights)
        .where(and(eq(learningInsights.userId, userId), gte(learningInsights.createdAt, last30d)))
        .orderBy(desc(learningInsights.confidence))
        .limit(15),

      // System incidents from last 30d (global log — no userId column)
      db.select({ severity: systemIncidentLog.severity, rootCause: systemIncidentLog.rootCause, lesson: systemIncidentLog.lesson })
        .from(systemIncidentLog)
        .where(gte(systemIncidentLog.createdAt, last30d))
        .orderBy(desc(systemIncidentLog.createdAt))
        .limit(10),

      // Top performing videos in last 30d
      db.select({
        videoId:  youtubeOutputMetrics.youtubeVideoId,
        views:    youtubeOutputMetrics.views,
        ctr:      youtubeOutputMetrics.ctr,
        avgWatch: youtubeOutputMetrics.averageViewPercent,
        duration: youtubeOutputMetrics.durationSec,
      })
        .from(youtubeOutputMetrics)
        .where(and(eq(youtubeOutputMetrics.userId, userId), gte(youtubeOutputMetrics.measuredAt, last30d)))
        .orderBy(desc(youtubeOutputMetrics.views))
        .limit(10),

      // Recent association insights from brain-association-engine (last 7d)
      db.select({ principle: masterKnowledgeBank.principle })
        .from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, userId),
          eq(masterKnowledgeBank.isActive, true),
          eq(masterKnowledgeBank.category, "association_insight"),
          gte(masterKnowledgeBank.createdAt, last7d),
        ))
        .orderBy(desc(masterKnowledgeBank.confidenceScore))
        .limit(8),
    ]);

    if (allPrinciples.length < 3 && recentInsights.length < 3) {
      logger.debug(`[Brain] Not enough data for weekly synthesis — skipping`);
      _lastWeeklyCycleAt.delete(userId); // allow retry next daily cycle
      return;
    }

    const slot = tryAcquireAISlotNow();
    if (!slot) {
      logger.debug(`[Brain] Weekly synthesis deferred — no AI slot available`);
      _lastWeeklyCycleAt.delete(userId); // allow retry next daily cycle
      return;
    }

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are the strategic learning brain for an autonomous YouTube channel AI (ET Gaming 274, no-commentary gaming highlights). Write a weekly strategy brief — a comprehensive synthesis of what the system has learned and what the channel should focus on for the next 7 days. Be analytical, specific, and data-driven. Max 5-6 sentences.",
          },
          {
            role: "user",
            content: `WEEKLY SYNTHESIS — synthesize everything learned this week into a strategic brief.

## Master Knowledge Principles (${allPrinciples.length} active, sorted by confidence):
${allPrinciples.slice(0, 15).map(p => `[${p.confidence}%, ${p.evidence} evidence] ${p.principle?.slice(0, 120)}`).join("\n")}

## Learning Insights This Month (${recentInsights.length}):
${recentInsights.slice(0, 8).map(i => `- ${i.pattern}`).join("\n")}

## Recent Association Signals (external world ↔ channel patterns, last 7d):
${associationInsights.map(a => `- ${a.principle?.slice(0, 120)}`).join("\n") || "none yet"}

## Top Performing Videos This Month:
${topVideos.map(v => `- ytId:${v.videoId} | ${(v.views ?? 0).toLocaleString()} views | CTR ${v.ctr?.toFixed(1)}% | ${v.avgWatch?.toFixed(0)}% watch`).join("\n") || "none measured yet"}

## System Incidents (last 30d, ${recentIncidents.length} total):
${recentIncidents.slice(0, 5).map(i => `[${i.severity}] ${i.rootCause} → Lesson: ${i.lesson?.slice(0, 80)}`).join("\n") || "none"}

Write the weekly strategy brief now. It should tell a future AI agent reading it: what the channel's biggest content opportunities are, what format/timing is working best right now, and what the top 2-3 focus areas should be for the next 7 days.`,
          },
        ],
      });
      releaseAISlot();

      const briefText = resp.choices[0]?.message?.content?.trim() ?? "";
      if (!briefText || briefText.length < 50) return;

      await db.insert(masterKnowledgeBank).values({
        userId,
        category: "weekly_strategy_brief",
        principle: briefText,
        sourceEngines: ["learning-brain", "memory-architect", "brain-association-engine", "analytics-intelligence"],
        evidenceCount: allPrinciples.length + recentInsights.length + topVideos.length,
        confidenceScore: 85,
        isActive: true,
        metadata: {
          generatedAt: now.toISOString(),
          principlesReviewed: allPrinciples.length,
          insightsReviewed: recentInsights.length,
          incidentsReviewed: recentIncidents.length,
          topVideoCount: topVideos.length,
          synthesisType: "weekly_deep",
        },
      } as any);

      logger.info(`[Brain] Weekly synthesis complete for ${userId.slice(0, 8)} — ${briefText.length} char brief written to masterKnowledgeBank`);
    } catch {
      releaseAISlot();
      throw new Error("weekly synthesis AI call failed");
    }

    // Prompt self-improvement — runs after the weekly brief so it has the
    // freshest knowledge to incorporate. Improves up to 3 active prompts per week.
    // ASI pillar #3: the system rewrites its own reasoning instructions.
    try {
      const { runPromptSelfImprovement } = await import("./prompt-self-improver");
      const improved = await runPromptSelfImprovement(userId);
      if (improved > 0) {
        logger.info(`[Brain] Prompt self-improvement: ${improved} prompt(s) evolved to next version`);
      }
    } catch (psiErr: any) {
      logger.debug(`[Brain] Prompt self-improvement non-fatal: ${psiErr?.message?.slice(0, 80)}`);
    }
  } catch (err: any) {
    logger.warn(`[Brain] Weekly synthesis failed (non-fatal): ${err.message?.slice(0, 120)}`);
    _lastWeeklyCycleAt.delete(userId); // allow retry next daily cycle
  }
}

// ── Refresh missing analytics ─────────────────────────────────────────────────

async function refreshMissingAnalytics(userId: string): Promise<void> {
  try {
    // Find published queue items with a youtubeVideoId that have no metrics yet
    const published = await db.select({
      id: autopilotQueue.id,
      type: autopilotQueue.type,
      metadata: autopilotQueue.metadata,
      scheduledAt: autopilotQueue.scheduledAt,
      sourceVideoId: autopilotQueue.sourceVideoId,
    })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
      ))
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(20);

    for (const item of published) {
      const meta = (item.metadata ?? {}) as Record<string, any>;
      const youtubeVideoId = meta.youtubeVideoId || meta.youtubeId;
      if (!youtubeVideoId) continue;

      // Skip if measured within the last 6 hours — analytics don't change that fast.
      // Allow re-measurement after that so data improves as the video ages.
      const [existing] = await db
        .select({ id: youtubeOutputMetrics.id, measuredAt: youtubeOutputMetrics.measuredAt })
        .from(youtubeOutputMetrics)
        .where(and(
          eq(youtubeOutputMetrics.userId, userId),
          eq(youtubeOutputMetrics.youtubeVideoId, youtubeVideoId),
        ))
        .limit(1);

      if (existing?.measuredAt && Date.now() - existing.measuredAt.getTime() < 6 * 3600_000) continue;

      // Determine posting window from scheduledAt
      let postingWindow = "unknown";
      if (item.scheduledAt) {
        const h = new Date(item.scheduledAt).getUTCHours();
        if (h >= 6 && h < 12) postingWindow = "morning";
        else if (h >= 12 && h < 17) postingWindow = "afternoon";
        else if (h >= 17 && h < 21) postingWindow = "evening";
        else postingWindow = "late_night";
      }

      await recordVideoPerformance(userId, youtubeVideoId, {
        contentType: ["platform_short", "youtube_short"].includes(item.type) ? "short" : "long_form",
        durationSec: meta.targetDurationSec || meta.actualDurationSec || 0,
        gameName: meta.gameName,
        postingWindow,
        sourceVideoId: item.sourceVideoId ?? undefined,
        publishedAt: item.scheduledAt ? new Date(item.scheduledAt) : undefined,
      });
    }
  } catch (err: any) {
    logger.debug(`[Brain] refreshMissingAnalytics: ${err.message?.slice(0, 200)}`);
  }
}

// ── Recommended output plan ───────────────────────────────────────────────────

export interface RecommendedOutputPlan {
  preferredLongFormDurationMin: number;
  preferredShortDurationSec: number;
  bestPostingWindow: string;
  suggestedLongFormPerWeek: number;
  suggestedShortsPerWeek: number;
  focusGame: string | null;
  explanation: string;
}

export async function getRecommendedOutputPlan(userId: string): Promise<RecommendedOutputPlan> {
  try {
    const [buckets, windows] = await Promise.all([
      getBucketRankings(userId),
      getWindowRankings(userId),
    ]);

    const longFormBuckets = buckets.filter(b => b.contentType === "long_form" && b.sampleCount >= 2);
    const shortBuckets = buckets.filter(b => b.contentType === "short" && b.sampleCount >= 2);
    const bestWindow = windows[0]?.window ?? "evening";

    let preferredLongFormMin = 20;
    if (longFormBuckets.length) {
      const best = longFormBuckets[0].bucket;
      const match = best.match(/long_(\d+)_/);
      if (match) preferredLongFormMin = parseInt(match[1], 10);
    }

    let preferredShortSec = 38;
    if (shortBuckets.length) {
      const best = shortBuckets[0].bucket;
      if (best === "short_15_30") preferredShortSec = 22;
      else if (best === "short_31_45") preferredShortSec = 38;
      else if (best === "short_46_60") preferredShortSec = 53;
    }

    // Most common game in recent uploads
    let focusGame: string | null = null;
    try {
      const [gameRow] = await db.select({
        gameName: youtubeOutputMetrics.gameName,
        cnt: sql<number>`count(*)::int`,
      })
        .from(youtubeOutputMetrics)
        .where(and(eq(youtubeOutputMetrics.userId, userId), sql`game_name is not null`))
        .groupBy(youtubeOutputMetrics.gameName)
        .orderBy(sql`count(*) desc`)
        .limit(1);
      focusGame = gameRow?.gameName ?? null;
    } catch { /* ok */ }

    const explanation = longFormBuckets.length
      ? `Based on ${longFormBuckets.reduce((s, b) => s + b.sampleCount, 0)} uploads: ${longFormBuckets[0].bucket} videos perform best (avg score ${longFormBuckets[0].avgScore.toFixed(1)}). Post in the ${bestWindow} window.`
      : "Insufficient data — using default balanced schedule until more videos are published.";

    return {
      preferredLongFormDurationMin: preferredLongFormMin,
      preferredShortDurationSec: preferredShortSec,
      bestPostingWindow: bestWindow,
      suggestedLongFormPerWeek: 7,
      suggestedShortsPerWeek: 21,
      focusGame,
      explanation,
    };
  } catch {
    return {
      preferredLongFormDurationMin: 20,
      preferredShortDurationSec: 38,
      bestPostingWindow: "evening",
      suggestedLongFormPerWeek: 7,
      suggestedShortsPerWeek: 21,
      focusGame: null,
      explanation: "Default plan — insufficient analytics data yet.",
    };
  }
}

// ── Recommended stream plan ───────────────────────────────────────────────────

export interface RecommendedStreamPlan {
  bestDayToStream: string;
  bestTimeLocal: string;
  suggestedStreamDurationMin: number;
  clipCapacity: number;
  chatResponseRate: string;
  copilotMode: string;
  preparation: string[];
}

export async function getRecommendedStreamPlan(userId: string): Promise<RecommendedStreamPlan> {
  try {
    const [llEvents] = await db.select({
      autoReplied: sql<number>`count(*) filter (where event_type = 'chat_response' and outcome = 'auto_replied')::int`,
      total: sql<number>`count(*)::int`,
    })
      .from(livestreamLearningEvents)
      .where(eq(livestreamLearningEvents.userId, userId));

    const responseRate = llEvents?.total
      ? `${Math.round(((llEvents.autoReplied ?? 0) / llEvents.total) * 100)}%`
      : "not enough data";

    return {
      bestDayToStream: "Friday or Saturday (peak gaming audience)",
      bestTimeLocal: "7:00 PM – 10:00 PM",
      suggestedStreamDurationMin: 90,
      clipCapacity: 3,
      chatResponseRate: responseRate,
      copilotMode: "auto-safe",
      preparation: [
        "Generate title and description 30 min before going live",
        "Verify YouTube connection and stream key",
        "Prepare pinned FAQ message",
        "Enable clip-moment detection",
        "After stream: copilot auto-queues Shorts and long-form",
      ],
    };
  } catch {
    return {
      bestDayToStream: "Any day",
      bestTimeLocal: "7:00 PM – 10:00 PM",
      suggestedStreamDurationMin: 90,
      clipCapacity: 3,
      chatResponseRate: "unknown",
      copilotMode: "auto-safe",
      preparation: ["Connect YouTube account", "Configure stream key", "Go live!"],
    };
  }
}

// ── Learning summary ──────────────────────────────────────────────────────────

export async function getLearningSummary(userId: string): Promise<{
  summary: string;
  lastCycleAt: string | null;
  totalEvents: number;
  topInsight: string | null;
}> {
  try {
    const [countRow] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(learningEvents)
      .where(eq(learningEvents.userId, userId));

    const [latestCycle] = await db.select()
      .from(learningEvents)
      .where(and(
        eq(learningEvents.userId, userId),
        eq(learningEvents.eventType, "daily_cycle_complete"),
      ))
      .orderBy(desc(learningEvents.createdAt))
      .limit(1);

    const [topInsightRow] = await db.select()
      .from(learningInsights)
      .where(eq(learningInsights.userId, userId))
      .orderBy(desc(learningInsights.updatedAt))
      .limit(1);

    const [buckets] = await getBucketRankings(userId);
    const summary = buckets
      ? `Best performing duration: ${buckets.bucket} (score ${buckets.avgScore.toFixed(1)}, ${buckets.sampleCount} samples). System has processed ${countRow?.cnt ?? 0} learning events.`
      : "Learning system active. Collecting performance data from YouTube uploads.";

    return {
      summary,
      lastCycleAt: latestCycle?.createdAt?.toISOString() ?? null,
      totalEvents: countRow?.cnt ?? 0,
      topInsight: topInsightRow?.pattern ?? null,
    };
  } catch {
    return { summary: "Learning system active.", lastCycleAt: null, totalEvents: 0, topInsight: null };
  }
}

// ── Daily intelligence digest ──────────────────────────────────────────────────
// 2-sentence overnight summary of every intelligence engine's last 24h activity.
// Stored in masterKnowledgeBank (category="daily_digest") and served to the
// dashboard "Overnight Intelligence" card. Called fire-and-forget from runDailyCycle.

async function generateAndStoreDigest(
  userId: string,
  summary: {
    bestDurationBucket: string;
    bestPostingWindow: string;
    avgPerformanceScore: number;
    insightCount: number;
  },
): Promise<void> {
  const since = new Date(Date.now() - 24 * 3_600_000);

  const [trendCount, gapCount, scoredCount] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        gte(autopilotQueue.createdAt, since),
        sql`metadata->>'trendQueued' = 'true'`,
      ))
      .then(r => r[0]?.cnt ?? 0),
    db.select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        gte(autopilotQueue.createdAt, since),
        sql`metadata->>'competitorGapQueued' = 'true'`,
      ))
      .then(r => r[0]?.cnt ?? 0),
    db.select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        gte(autopilotQueue.createdAt, since),
        sql`(metadata->>'viralScore')::numeric > 0`,
      ))
      .then(r => r[0]?.cnt ?? 0),
  ]);

  const slot = tryAcquireAISlotNow();
  if (!slot) return;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            "You are CreatorOS, an autonomous AI media OS. Write exactly 2 punchy sentences summarising what your intelligence engines did for this YouTube channel in the last 24h. Be specific and data-driven. No filler words.",
        },
        {
          role: "user",
          content: `Last 24h: ${trendCount} rising trends intercepted and queued, ${gapCount} competitor content gaps filled, ${scoredCount} queue items viral-scored, ${summary.insightCount} learning insights recorded. Best duration bucket: ${summary.bestDurationBucket || "still calibrating"}. Best posting window: ${summary.bestPostingWindow}. Avg performance score: ${summary.avgPerformanceScore}. Write the 2-sentence digest now.`,
        },
      ],
    });

    const digestText = resp.choices[0]?.message?.content?.trim() ?? "";
    if (!digestText) return;

    await db.insert(masterKnowledgeBank).values({
      userId,
      category: "daily_digest",
      principle: digestText,
      sourceEngines: ["learning-brain", "viral-prediction-engine", "trend-wave-interceptor", "competitor-gap-scanner"],
      evidenceCount: trendCount + gapCount + scoredCount + summary.insightCount,
      confidenceScore: 80,
      isActive: true,
      metadata: {
        generatedAt: new Date().toISOString(),
        trendCount,
        gapCount,
        scoredCount,
        insightCount: summary.insightCount,
        bestDurationBucket: summary.bestDurationBucket,
        bestPostingWindow: summary.bestPostingWindow,
        avgPerformanceScore: summary.avgPerformanceScore,
      },
    } as any);

    logger.info(`[Brain] Overnight digest stored (${digestText.length} chars, trend=${trendCount} gap=${gapCount} scored=${scoredCount})`);
  } finally {
    releaseAISlot();
  }
}
