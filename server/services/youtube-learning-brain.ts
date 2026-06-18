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
import { readAndAnalyzeViewerComments } from "./youtube-comments-reader";

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
        COUNT(*) FILTER (WHERE total_revival_score IS NOT NULL AND total_revival_score >= 60) AS high_score,
        ROUND(AVG(total_revival_score)::numeric, 1) AS avg_score
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

// ── System telemetry synthesizer ──────────────────────────────────────────────
// Reads system_telemetry:* events written by quota-tracker, ai-semaphore,
// and other infrastructure services.  Detects time-of-day patterns and writes
// actionable scheduling recommendations to masterKnowledgeBank.
// No AI calls — pure DB observation + deterministic pattern logic.

async function synthesizeSystemTelemetry(userId: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

    const rows = await db
      .select({
        category:  learningInsights.category,
        pattern:   learningInsights.pattern,
        data:      learningInsights.data,
        createdAt: learningInsights.createdAt,
      })
      .from(learningInsights)
      .where(
        and(
          eq(learningInsights.userId, userId),
          gte(learningInsights.createdAt, sevenDaysAgo),
          sql`${learningInsights.category} LIKE 'system_telemetry:%'`,
        ),
      )
      .orderBy(desc(learningInsights.createdAt))
      .limit(100);

    if (rows.length === 0) return;

    // ── Quota trip pattern ─────────────────────────────────────────────────
    const quotaTrips = rows.filter(r => r.category?.includes("quota_trip"));
    if (quotaTrips.length >= 2) {
      const hours: number[] = [];
      for (const t of quotaTrips) {
        const h = (t.data as any)?.evidence?.find((e: string) => e.startsWith("pacificHour:"));
        const override = (t.data as any)?.evidence?.find((e: string) => e.startsWith("pacificHourOverride:"));
        const val = override ?? h;
        if (val) {
          const n = parseInt(val.split(":")[1], 10);
          if (!isNaN(n)) hours.push(n);
        }
      }
      if (hours.length >= 2) {
        const avg = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
        const earliest = Math.min(...hours);
        const recommendation = avg <= 12
          ? `Quota trips at ~${avg}:00 Pacific on ${quotaTrips.length}/${Math.min(7, quotaTrips.length + 2)} recent days. CRITICAL: front-load ALL publishing to the 07:00–${Math.max(7, earliest - 1)}:00 Pacific window immediately after midnight quota reset.`
          : `Quota trips at ~${avg}:00 Pacific — current morning publishing window is acceptable but monitor for earlier trips.`;
        await db.insert(masterKnowledgeBank).values({
          userId,
          category:          "system_pattern",
          principle:         `[quota-timing] Quota circuit breaker has tripped ${quotaTrips.length}x in last 7 days at avg ${avg}:00 Pacific (earliest ${earliest}:00). ${recommendation}`,
          sourceEngines:     ["learning-brain", "quota-tracker"],
          evidenceCount:     quotaTrips.length,
          confidenceScore:   Math.min(95, 70 + quotaTrips.length * 5),
          applicableEngines: ["shorts-publisher", "long-form-publisher", "youtube-ai-orchestrator", "back-catalog-engine"],
          isActive:          true,
          metadata: {
            eventType: "quota_trip", tripCount: quotaTrips.length, avgHour: avg, earliestHour: earliest,
            recommendation, intakeAt: new Date().toISOString(),
          },
        } as any).catch(() => {});
      }
    }

    // ── AI semaphore saturation pattern ───────────────────────────────────
    const aiSaturations = rows.filter(r => r.category?.includes("background_queue_full"));
    if (aiSaturations.length >= 3) {
      const hours: number[] = [];
      for (const t of aiSaturations) {
        const h = (t.data as any)?.evidence?.find((e: string) => e.startsWith("pacificHour:"));
        if (h) {
          const n = parseInt(h.split(":")[1], 10);
          if (!isNaN(n)) hours.push(n);
        }
      }
      const avgHour = hours.length > 0 ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : -1;
      const hourNote = avgHour >= 0 ? ` (most often at ~${avgHour}:00 Pacific)` : "";
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "system_pattern",
        principle:         `[ai-saturation] Background AI queue filled to capacity ${aiSaturations.length}x in last 7 days${hourNote} — background engines are converging faster than the semaphore can drain. Consider staggering engine startup delays by 2–5 min each.`,
        sourceEngines:     ["learning-brain", "ai-semaphore"],
        evidenceCount:     aiSaturations.length,
        confidenceScore:   80,
        applicableEngines: ["youtube-ai-orchestrator", "back-catalog-engine", "omni-intelligence-harvester"],
        isActive:          true,
        metadata: { eventType: "background_queue_full", count: aiSaturations.length, avgHour, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // ── Trend-wave queue activity ──────────────────────────────────────────
    const trendQueued = rows.filter(r => r.category?.includes("trend_queued"));
    if (trendQueued.length > 0) {
      const topics = trendQueued.slice(0, 5).map(r => r.pattern?.slice(0, 80)).join("; ");
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "system_pattern",
        principle:         `[trend-activity] ${trendQueued.length} trend-wave catalog-remix clips queued in last 7 days. Recent topics: ${topics}`,
        sourceEngines:     ["learning-brain", "trend-wave-interceptor"],
        evidenceCount:     trendQueued.length,
        confidenceScore:   75,
        applicableEngines: ["youtube-ai-orchestrator", "back-catalog-engine"],
        isActive:          true,
        metadata: { eventType: "trend_queued", count: trendQueued.length, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    const totalSignals = quotaTrips.length + aiSaturations.length + trendQueued.length;
    logger.info(`[Brain] System telemetry synthesis: ${rows.length} events → ${totalSignals > 0 ? "patterns detected" : "no patterns yet"}`);
  } catch (err: any) {
    logger.warn(`[Brain] System telemetry synthesis failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── Permanent event log synthesizer ───────────────────────────────────────────
// Reads the last 30 days of system_event_log (the cross-deployment audit trail
// written by every boot, publisher, and AI orchestrator call) and promotes
// durable patterns to masterKnowledgeBank.
// No AI calls — pure SQL aggregation + deterministic pattern logic.
// Runs once per daily cycle, right after system telemetry synthesis.

async function synthesizeEventLog(userId: string): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sevenDaysAgo  = new Date(Date.now() -  7 * 86_400_000);

    // ── 1. Publish cadence — how many Shorts vs long-forms per day, trend ──────
    const pubRows = await db.execute(sql`
      SELECT
        DATE(occurred_at AT TIME ZONE 'America/Los_Angeles') AS day,
        SUM(CASE WHEN service = 'shorts-publisher'    THEN 1 ELSE 0 END) AS shorts,
        SUM(CASE WHEN service = 'long-form-publisher' THEN 1 ELSE 0 END) AS longforms
      FROM system_event_log
      WHERE event_type = 'publish'
        AND occurred_at >= ${thirtyDaysAgo}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30
    `);
    const pubDays = ((pubRows as any)?.rows ?? []) as Array<{day:string; shorts:string; longforms:string}>;
    if (pubDays.length >= 3) {
      const totalShorts    = pubDays.reduce((s,r) => s + Number(r.shorts),    0);
      const totalLongforms = pubDays.reduce((s,r) => s + Number(r.longforms), 0);
      const activeDays     = pubDays.filter(r => Number(r.shorts) + Number(r.longforms) > 0).length;
      const principle =
        `[event-log] Publishing: ${totalShorts} Shorts + ${totalLongforms} long-forms over ${pubDays.length}d (${activeDays} active days). ` +
        `Avg ${(totalShorts / pubDays.length).toFixed(1)} Shorts/day, ${(totalLongforms / pubDays.length).toFixed(1)} long-forms/day.`;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "event_log_intelligence",
        principle,
        sourceEngines:     ["event-log-synthesizer"],
        evidenceCount:     pubDays.length,
        confidenceScore:   Math.min(90, 50 + pubDays.length * 2),
        isActive:          true,
        metadata:          { generatedAt: new Date().toISOString(), totalShorts, totalLongforms, activeDays },
      } as any).catch(() => {});
    }

    // ── 2. Boot health trend — how many items prod-heal is fixing each boot ────
    const healRows = await db.execute(sql`
      SELECT
        (detail->>'processingJobsReset')::int  AS processing_reset,
        (detail->>'pipelinesUnstuck')::int     AS pipelines_unstuck,
        (detail->>'stuckDownloads')::int       AS stuck_downloads,
        occurred_at
      FROM system_event_log
      WHERE event_type = 'heal'
        AND service    = 'prod-heal'
        AND occurred_at >= ${sevenDaysAgo}
      ORDER BY occurred_at DESC
      LIMIT 20
    `);
    const healData = ((healRows as any)?.rows ?? []) as Array<{processing_reset:string; pipelines_unstuck:string; stuck_downloads:string; occurred_at:string}>;
    if (healData.length >= 2) {
      const avgReset   = healData.reduce((s,r) => s + Number(r.processing_reset ?? 0), 0) / healData.length;
      const avgPipeline = healData.reduce((s,r) => s + Number(r.pipelines_unstuck ?? 0), 0) / healData.length;
      const avgStuck   = healData.reduce((s,r) => s + Number(r.stuck_downloads ?? 0), 0) / healData.length;
      const severity   = avgReset > 1 ? "WARN: processing jobs keep getting stuck — investigate large stream jobs" : "Boot heal healthy";
      const principle =
        `[event-log] Boot health (last ${healData.length} boots): avg ${avgReset.toFixed(1)} processing→queued, ` +
        `${avgPipeline.toFixed(1)} pipelines→pending, ${avgStuck.toFixed(1)} stuck downloads. ${severity}.`;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "event_log_intelligence",
        principle,
        sourceEngines:     ["event-log-synthesizer"],
        evidenceCount:     healData.length,
        confidenceScore:   Math.min(85, 50 + healData.length * 4),
        isActive:          true,
        metadata:          { generatedAt: new Date().toISOString(), avgReset, avgPipeline, avgStuck },
      } as any).catch(() => {});
    }

    // ── 3. AI orchestrator decisions — which tasks ran, approval-required rate ──
    const decRows = await db.execute(sql`
      SELECT
        detail->>'task'             AS task,
        COUNT(*)                    AS total,
        SUM((detail->>'approvalRequired')::boolean::int) AS approval_needed
      FROM system_event_log
      WHERE event_type = 'decision'
        AND user_id    = ${userId}
        AND occurred_at >= ${sevenDaysAgo}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 15
    `);
    const decData = ((decRows as any)?.rows ?? []) as Array<{task:string; total:string; approval_needed:string}>;
    if (decData.length > 0) {
      const summary = decData.slice(0, 6).map(r => `${r.task}×${r.total}`).join(", ");
      const approvals = decData.reduce((s,r) => s + Number(r.approval_needed ?? 0), 0);
      const principle =
        `[event-log] Orchestrator (last 7d): ${decData.length} task types, top: ${summary}. ` +
        `${approvals} approval-required decisions flagged.`;
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "event_log_intelligence",
        principle,
        sourceEngines:     ["event-log-synthesizer"],
        evidenceCount:     decData.reduce((s,r) => s + Number(r.total), 0),
        confidenceScore:   70,
        isActive:          true,
        metadata:          { generatedAt: new Date().toISOString(), taskCount: decData.length, approvalCount: approvals },
      } as any).catch(() => {});
    }

    // ── 4. Prune events older than 90 days (keep table bounded) ────────────────
    const { pruneOldEvents } = await import("../lib/event-log");
    const pruned = await pruneOldEvents(90);
    if (pruned > 0) {
      logger.info(`[Brain] Event log pruned: ${pruned} entries older than 90d removed`);
    }

    const signalCount = (pubDays.length >= 3 ? 1 : 0) + (healData.length >= 2 ? 1 : 0) + (decData.length > 0 ? 1 : 0);
    logger.info(`[Brain] Event log synthesis: ${signalCount} pattern(s) → masterKnowledgeBank`);
  } catch (err: any) {
    logger.warn(`[Brain] Event log synthesis failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── Service health synthesis ───────────────────────────────────────────────────
// Reads service_state to check when each long-running service last completed a
// full cycle.  Writes a health snapshot to masterKnowledgeBank
// (category="service_health") so the brain can reason about pipeline gaps and
// alert the orchestrator when a critical service has gone quiet.
// No AI calls — pure DB observation + deterministic threshold logic.

async function synthesizeServiceHealth(userId: string): Promise<void> {
  try {
    const { getState } = await import('../lib/service-state');
    const now = Date.now();

    const watched = [
      { service: 'learning-brain',     key: `lastCycleAt:${userId}`,     expectedH: 20, label: 'Learning brain'     },
      { service: 'back-catalog-runner', key: 'lastRunAt',                 expectedH: 24, label: 'Back-catalog runner' },
      { service: 'back-catalog-engine', key: `lastCycleAt:${userId}`,     expectedH: 22, label: 'Back-catalog engine' },
      { service: 'ai-orchestrator',     key: `lastFullCycleAt:${userId}`, expectedH: 24, label: 'AI orchestrator'    },
    ] as const;

    const lines:  string[] = [];
    const overdue: string[] = [];

    for (const w of watched) {
      const stored = await getState<{ ms: number }>(w.service, w.key);
      if (!stored?.ms) {
        lines.push(`${w.label}: no persistent record yet (first run after feature deploy)`);
        continue;
      }
      const hoursSince = (now - stored.ms) / 3_600_000;
      const ago = hoursSince < 1
        ? `${Math.round(hoursSince * 60)}m ago`
        : `${hoursSince.toFixed(1)}h ago`;
      if (hoursSince > w.expectedH * 1.5) {
        lines.push(`${w.label}: OVERDUE — last ran ${ago}, expected every <${w.expectedH}h`);
        overdue.push(w.label);
      } else {
        lines.push(`${w.label}: healthy — last ran ${ago}`);
      }
    }

    const principle = `Service health snapshot:\n${lines.join('\n')}`;
    const recommendation = overdue.length > 0
      ? `ALERT — ${overdue.join(', ')} overdue. Check logs for crash loops or quota locks that may have stalled the pipeline.`
      : `All monitored services completed cycles within expected intervals. Pipeline is healthy.`;

    await db.insert(masterKnowledgeBank).values({
      userId,
      category:          'service_health',
      principle,
      sourceEngines:     ['service-state', 'learning-brain'],
      evidenceCount:     watched.length,
      confidenceScore:   overdue.length === 0 ? 90 : 40,
      applicableEngines: ['youtube-ai-orchestrator', 'back-catalog-runner', 'learning-brain'],
      isActive:          true,
      metadata: {
        overdueServices: overdue,
        snapshotAt:      new Date().toISOString(),
        lines,
      },
    } as any).onConflictDoUpdate?.({
      target: [masterKnowledgeBank.userId, masterKnowledgeBank.category],
      set:    {
        principle,
        confidenceScore:   overdue.length === 0 ? 90 : 40,
        evidenceCount:     watched.length,
        metadata: {
          overdueServices: overdue,
          snapshotAt:      new Date().toISOString(),
          lines,
        },
      },
    }).catch(() => {});

    logger.info(
      `[Brain] Service health synthesis: ${overdue.length === 0 ? 'all healthy' : `${overdue.length} overdue: ${overdue.join(', ')}`}`,
    );
  } catch (err: any) {
    logger.warn(`[Brain] Service health synthesis failed (non-fatal): ${err?.message?.slice(0, 120)}`);
  }
}

// ── 48h Attribution Loop ───────────────────────────────────────────────────────
// Picks up audience_calibration signals created by the publishers after
// ≥48h (enough time for YouTube Analytics to reflect real performance) and
// graduates high-performers to category="audience_insight" with a raised
// confidence score.  Low/mid performers get their score updated and stay as
// audience_calibration so later cycles can see them.
// No AI calls — pure DB + YouTube Analytics API, runs quickly.
async function followUpAudienceCalibrations(userId: string): Promise<void> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3_600_000);

  // Find pending calibration signals (confidenceScore ≤ 35 = not yet followed up)
  const pending = await db.execute(sql`
    SELECT id, principle, metadata, created_at
    FROM master_knowledge_bank
    WHERE user_id    = ${userId}
      AND category   = 'audience_calibration'
      AND is_active  = true
      AND (confidence_score IS NULL OR confidence_score <= 35)
      AND created_at < ${fortyEightHoursAgo}
    ORDER BY created_at ASC
    LIMIT 10
  `);
  const rows = (pending as any)?.rows ?? [];
  if (rows.length === 0) return;

  logger.info(`[Brain] Audience calibration follow-up: ${rows.length} pending signal(s)`);

  const { fetchVideoAnalytics } = await import("./youtube-analytics");

  for (const row of rows) {
    try {
      // youtubeVideoId is stored in the metadata JSONB column
      const meta = (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) ?? {};
      const youtubeVideoId: string | undefined = meta.youtubeVideoId;
      if (!youtubeVideoId) continue;

      const analytics = await fetchVideoAnalytics(userId, youtubeVideoId);
      if (!analytics || Object.keys(analytics).length === 0) continue;

      const views  = (analytics as any).views   ?? 0;
      const ctr    = (analytics as any).ctr     ?? (analytics as any).impressionClickThroughRate ?? 0;
      const avd    = (analytics as any).averageViewDurationSec ?? 0;
      const avgPct = (analytics as any).averageViewPercent ?? 0;

      // Score 0–100 from three signals (equal thirds):
      //  • Views: 0–1000+ → 0–33 pts
      //  • CTR:   0–8%    → 0–33 pts
      //  • AVD %: 0–60%   → 0–34 pts
      const viewScore  = Math.min(33, Math.round((views / 300) * 33));
      const ctrScore   = Math.min(33, Math.round((ctr   / 0.08) * 33));
      const avdScore   = Math.min(34, Math.round((avgPct / 60)  * 34));
      const totalScore = viewScore + ctrScore + avdScore;

      const newConfidence = 40 + Math.round((totalScore / 100) * 50); // range 40–90
      const newCategory   = newConfidence >= 70 ? "audience_insight" : "audience_calibration";

      const updatedPrinciple = (
        (newConfidence >= 70 ? "[Insight] " : "[Updated] ") +
        `Video ${youtubeVideoId}: ` +
        `${views} views, CTR=${(ctr * 100).toFixed(1)}%, AVD=${avd}s (${avgPct.toFixed(0)}%)` +
        `. Audience engagement score: ${totalScore}/100.`
      ).slice(0, 500);

      const updatedMeta = {
        ...meta,
        views, ctrPct: parseFloat((ctr * 100).toFixed(2)),
        avdSec: avd, avdPct: parseFloat(avgPct.toFixed(1)),
        attributionScore: totalScore,
        attributionFollowedUpAt: new Date().toISOString(),
      };

      await db.execute(sql`
        UPDATE master_knowledge_bank
        SET
          category         = ${newCategory},
          principle        = ${updatedPrinciple},
          metadata         = ${JSON.stringify(updatedMeta)}::jsonb,
          confidence_score = ${newConfidence},
          updated_at       = NOW()
        WHERE id = ${row.id}
      `);

      logger.info(`[Brain] Calibration ${row.id} → ${newCategory} (score=${totalScore}, conf=${newConfidence})`, {
        youtubeVideoId, views, ctrPct: (ctr * 100).toFixed(1), avdPct: avgPct.toFixed(1),
      });
    } catch (err: any) {
      logger.debug(`[Brain] Calibration follow-up row ${row.id} non-fatal: ${err?.message?.slice(0, 80)}`);
    }
  }
}

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
  // Restore persistent state on first call after each boot so the 20-hour
  // interval is honoured across deployments (not just within one container session).
  if (!_lastCycleAt.has(userId)) {
    try {
      const { getState } = await import('../lib/service-state');
      const stored = await getState<{ ms: number }>('learning-brain', `lastCycleAt:${userId}`);
      if (stored?.ms) _lastCycleAt.set(userId, stored.ms);
    } catch { /* non-fatal */ }
  }
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < CYCLE_INTERVAL_MS) {
    logger.debug(`[Brain] Daily cycle skipped for ${userId.slice(0, 8)} — ran recently`);
    return null;
  }
  _lastCycleAt.set(userId, Date.now());
  // Persist immediately so the next boot knows this cycle already ran
  import('../lib/service-state').then(({ setState }) =>
    setState('learning-brain', `lastCycleAt:${userId}`, { ms: Date.now(), iso: new Date().toISOString() })
  ).catch(() => {});

  logger.info(`[Brain] Starting daily learning cycle for ${userId.slice(0, 8)}`);

  // Step 0: Ingest what every other engine recorded since the last cycle.
  // This closes the feedback loop — operational outcomes from publishers,
  // SEO engine, pipeline tracer, etc. are synthesised into masterKnowledgeBank
  // before the brain's own analysis runs, so all downstream AI calls have
  // fresh cross-engine context.
  await ingestCrossEngineOutcomes(userId);

  // Synthesize system telemetry patterns (quota timing, AI saturation, trend activity)
  // into actionable masterKnowledgeBank recommendations. No AI calls — pure DB pattern logic.
  await synthesizeSystemTelemetry(userId);

  // Synthesize the permanent cross-deployment event log — publish cadence, boot health
  // trend, and orchestrator decision patterns from the last 30 days.
  // No AI calls — pure SQL aggregation. Also prunes events older than 90 days.
  await synthesizeEventLog(userId);

  // Synthesize service_state snapshots — detects any long-running service that
  // hasn't completed a cycle within its expected interval and writes a health
  // report to masterKnowledgeBank (category="service_health").
  await synthesizeServiceHealth(userId);

  // Step 0d: 48h attribution loop — pick up any pending audience calibration
  // signals that are now old enough to have YouTube Analytics data and graduate
  // them to confirmed audience insights.  Pure DB + Analytics API, no AI calls.
  await followUpAudienceCalibrations(userId).catch(err =>
    logger.warn(`[Brain] Audience calibration follow-up non-fatal: ${err?.message?.slice(0, 80)}`)
  );

  // Step 0c: Read viewer comments from recent videos — direct audience voice.
  // Cost: 1 YouTube Data API quota unit per video, max 5 videos = ≤5 units/day.
  // Results flow into intelligenceSignals (source="viewer_comments") where
  // both the omni-harvester synthesis and brain-association-engine can see them.
  await readAndAnalyzeViewerComments(userId).catch(err =>
    logger.warn(`[Brain] Comment reader failed: ${err.message?.slice(0, 80)}`)
  );

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
          model: "gpt-5",
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

    // 8. Evaluate the hashtag A/B experiment — non-fatal, never blocks the cycle
    await import("../lib/hashtag-ab-test").then(({ evaluateHashtagExperiment }) =>
      evaluateHashtagExperiment(userId)
    ).catch(err => logger.warn(`[Brain] Hashtag A/B evaluation failed (non-fatal): ${err?.message?.slice(0, 80)}`));

    // 9. Record the cycle completion
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

    // Persist cycle completion to the permanent event log so there's a durable record
    // of every brain run across all deployments — queryable for learning velocity trends.
    import("../lib/event-log").then(({ logEventAsync }) =>
      logEventAsync({
        eventType: "learn",
        service:   "learning-brain",
        title:     `Daily cycle complete: ${insights.length} insights, best=${bestBucket}, window=${bestWindow}`,
        detail: {
          insightCount:        insights.length,
          recommendationCount: recommendations.length,
          bestDurationBucket:  bestBucket,
          worstDurationBucket: worstBucket,
          bestPostingWindow:   bestWindow,
          avgPerformanceScore: +avgScore.toFixed(2),
          totalUploads:        uploadStats?.total ?? 0,
          totalShorts:         uploadStats?.shorts ?? 0,
          totalLongForm:       uploadStats?.longForm ?? 0,
          insights:            insights.slice(0, 5),
        },
        userId,
        severity: "info",
      })
    ).catch(() => {});

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

    // 9q. Active incident sweep — synthesize ALL currently "active" (unresolved)
    //     incidents into the masterKnowledgeBank as monitoring/warning principles.
    //     These are problems the system has detected but not yet fixed — surfacing
    //     them ensures every AI agent is aware of ongoing fragility in real-time,
    //     not only after a human manually marks something "resolved".
    //     Also sweeps any remaining un-promoted resolved incidents across ALL
    //     severities (belt-and-suspenders in case Step 9b's 50-row limit was hit).
    try {
      const activeIncidents = await db.execute(sql`
        SELECT id, category, service, root_cause, lesson, severity
        FROM system_incident_log
        WHERE status = 'active'
          AND auto_detected = true
          AND created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 15
      `);
      const activeRows = (activeIncidents as any)?.rows ?? [];
      if (activeRows.length > 0) {
        for (const inc of activeRows) {
          const principle =
            `[Active Issue — ${inc.category}] Service: ${inc.service}. ` +
            `Root cause: ${(inc.root_cause ?? "").slice(0, 150)}. ` +
            `Lesson: ${(inc.lesson ?? "").slice(0, 200)}`;
          await db.insert(masterKnowledgeBank).values({
            userId,
            category:          "system_lesson",
            principle:         principle.slice(0, 500),
            sourceEngines:     ["incident-log", inc.service ?? "unknown"],
            evidenceCount:     1,
            confidenceScore:   60,
            applicableEngines: ["all"],
            isActive:          true,
            metadata: {
              incidentId:  inc.id,
              status:      "active",
              severity:    inc.severity,
              promotedAt:  new Date().toISOString(),
            },
          } as any).catch(() => {});
        }
        logger.info(`[Brain] Step 9q: promoted ${activeRows.length} active incident(s) → masterKnowledgeBank`);
      }
    } catch (aqErr: any) {
      logger.debug(`[Brain] Step 9q active-incident sweep non-fatal: ${aqErr?.message?.slice(0, 80)}`);
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

    // 9k. ASI Skill Learning — the brain masters one skill domain at a time.
    //     Runs a dedicated learning cycle: gathers all available evidence,
    //     extracts new memories, self-assesses mastery, and advances to the next
    //     skill when the threshold is reached.  All memories stored permanently
    //     in brain_skill_memories → top-confidence ones auto-promoted to
    //     masterKnowledgeBank so every content generator benefits immediately.
    //     Independent 4h cycle also runs via initSkillLearner() in index.ts.
    try {
      const { runSkillLearningCycle } = await import("./brain-skill-learner");
      const result = await runSkillLearningCycle(userId);
      if (result) {
        logger.info(
          `[Brain] Skill learning: "${result.skillName}" mastery=${result.masteryScore}/100 ` +
          `+${result.newMemories} memories${result.advanced ? " → MASTERED, advancing" : ""}` +
          (result.knowledgeGap ? ` | gap: "${result.knowledgeGap.slice(0, 60)}"` : ""),
        );
      }
    } catch (sklErr: any) {
      logger.debug(`[Brain] Skill learning non-fatal: ${sklErr?.message?.slice(0, 80)}`);
    }

    // 9l. Ingest negative patterns — reads all recordNegativePattern() entries
    //     accumulated since the last cycle and promotes them into masterKnowledgeBank
    //     as cautionary "AVOID" principles so every future AI generator skips known
    //     failure modes.  Non-fatal; no quota cost.
    try {
      await ingestNegativePatternsIntoBrain(userId);
    } catch (npErr: any) {
      logger.debug(`[Brain] ingestNegativePatternsIntoBrain non-fatal: ${npErr?.message?.slice(0, 80)}`);
    }

    // 9m. Self-healing actions synthesis — count resolution rates per error type and
    //     write trends to masterKnowledgeBank so the orchestrator knows which modules
    //     are generating recurring hard failures.
    try {
      const healStats = await db.execute(sql`
        SELECT error_code, status, COUNT(*)::int AS cnt
        FROM self_healing_actions
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY error_code, status
        ORDER BY cnt DESC
        LIMIT 20
      `);
      const rows = (healStats as any)?.rows ?? [];
      if (rows.length > 0) {
        const topFailures = rows.filter((r: any) => r.status === "staged" || r.status === "failed")
          .slice(0, 5);
        for (const row of topFailures) {
          const principle = `Recurring system failure [${row.error_code}]: ${row.cnt}× in last 7 days, status=${row.status} — strategy should avoid workflows that depend on this module`;
          await db.insert(masterKnowledgeBank).values({
            userId,
            category: "system_lesson",
            principle: principle.slice(0, 500),
            evidence: `error_code=${row.error_code}, count=${row.cnt}, status=${row.status}`,
            applicableEngines: ["youtube-ai-orchestrator", "self-improvement", "predictive-guardian"],
            confidenceScore: Math.min(90, 50 + Math.min(40, row.cnt * 2)),
            isActive: true,
            createdAt: new Date(),
          } as any).catch(() => {});
        }
        logger.debug(`[Brain] self_healing synthesis: ${topFailures.length} failure patterns promoted`);
      }
    } catch (healErr: any) {
      logger.debug(`[Brain] self-healing synthesis non-fatal: ${healErr?.message?.slice(0, 80)}`);
    }

    // 9n. Content performance loops synthesis — extract the top 3 highest-attribution
    //     content patterns and write them as masterKnowledgeBank principles.
    try {
      const topLoops = await db.execute(sql`
        SELECT strategy_used, platform,
               AVG(performance_score)::int AS avg_score,
               COUNT(*)::int AS cnt,
               AVG(actual_views)::int AS avg_views
        FROM content_performance_loops
        WHERE user_id = ${userId}
          AND attribution_complete = true
          AND performance_score IS NOT NULL
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY strategy_used, platform
        HAVING COUNT(*) >= 2
        ORDER BY AVG(performance_score) DESC
        LIMIT 5
      `);
      const loopRows = (topLoops as any)?.rows ?? [];
      for (const row of loopRows.slice(0, 3)) {
        if (!row.strategy_used) continue;
        const principle = `High-performing strategy "${row.strategy_used}" on ${row.platform}: avg score ${row.avg_score}/100 across ${row.cnt} videos (avg ${row.avg_views} views)`;
        await db.insert(masterKnowledgeBank).values({
          userId,
          category: "content_pattern",
          principle: principle.slice(0, 500),
          evidence: `cnt=${row.cnt}, avg_score=${row.avg_score}, platform=${row.platform}`,
          applicableEngines: ["content-grinder", "youtube-ai-orchestrator", "closed-loop-attribution"],
          confidenceScore: Math.min(90, 50 + row.cnt * 3),
          isActive: true,
          createdAt: new Date(),
        } as any).catch(() => {});
      }
      if (loopRows.length > 0) {
        logger.debug(`[Brain] content_performance_loops synthesis: ${Math.min(3, loopRows.length)} patterns promoted`);
      }
    } catch (loopErr: any) {
      logger.debug(`[Brain] content-loops synthesis non-fatal: ${loopErr?.message?.slice(0, 80)}`);
    }

    // 9o. Discovered strategies evaluation — any strategy with status "active" and
    //     >7 days old without promotion gets its effectiveness checked vs recent
    //     performance data and is archived if effectiveness < 25.
    try {
      const staleStrategies = await db.execute(sql`
        SELECT id, title, strategy_type, effectiveness, times_applied
        FROM discovered_strategies
        WHERE user_id = ${userId}
          AND is_active = true
          AND effectiveness < 35
          AND times_applied >= 3
          AND created_at < NOW() - INTERVAL '7 days'
        ORDER BY effectiveness ASC
        LIMIT 10
      `);
      const staleRows = (staleStrategies as any)?.rows ?? [];
      let archived = 0;
      for (const row of staleRows) {
        await db.execute(sql`
          UPDATE discovered_strategies
          SET is_active = false, updated_at = NOW()
          WHERE id = ${row.id} AND user_id = ${userId}
        `).catch(() => {});
        archived++;
        // Record the failure as a negative pattern so others don't repeat it
        await db.insert(masterKnowledgeBank).values({
          userId,
          category: "negative_pattern",
          principle: `[AVOID] Strategy "${row.title}" (type: ${row.strategy_type}) was tried ${row.times_applied}× and achieved only ${row.effectiveness}% effectiveness — do not re-apply`,
          evidence: `effectiveness=${row.effectiveness}, times_applied=${row.times_applied}`,
          applicableEngines: ["youtube-ai-orchestrator", "self-improvement", "growth-flywheel"],
          confidenceScore: 72,
          isActive: true,
          createdAt: new Date(),
        } as any).catch(() => {});
      }
      if (archived > 0) {
        logger.debug(`[Brain] discovered_strategies: archived ${archived} low-effectiveness strategies`);
      }

      // Also promote high-effectiveness validated strategies as positive principles
      // so the orchestrator and content generators actively apply them.
      const goodStrategies = await db.execute(sql`
        SELECT id, title, strategy_type, effectiveness, times_applied
        FROM discovered_strategies
        WHERE user_id = ${userId}
          AND is_active = true
          AND effectiveness >= 65
          AND times_applied >= 2
          AND created_at < NOW() - INTERVAL '7 days'
        ORDER BY effectiveness DESC
        LIMIT 5
      `);
      const goodRows = (goodStrategies as any)?.rows ?? [];
      for (const row of goodRows) {
        const principle = `[DO] Strategy "${row.title}" (${row.strategy_type}) validated: ${row.effectiveness}% effectiveness after ${row.times_applied} applications — continue using this approach`;
        await db.insert(masterKnowledgeBank).values({
          userId,
          category:          "validated_strategy",
          principle:         principle.slice(0, 500),
          evidence:          `effectiveness=${row.effectiveness}, times_applied=${row.times_applied}`,
          applicableEngines: ["youtube-ai-orchestrator", "content-grinder", "growth-flywheel"],
          confidenceScore:   Math.min(90, 50 + Math.round(row.effectiveness / 3)),
          isActive:          true,
          createdAt:         new Date(),
        } as any).catch(() => {});
      }
      if (goodRows.length > 0) {
        logger.debug(`[Brain] discovered_strategies: promoted ${goodRows.length} high-effectiveness strategies`);
      }
    } catch (stratErr: any) {
      logger.debug(`[Brain] discovered-strategies synthesis non-fatal: ${stratErr?.message?.slice(0, 80)}`);
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
        model: "gpt-5",
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are the strategic learning brain for an autonomous YouTube channel AI (ET Gaming 274 — a no-commentary gaming channel; full playthroughs and live stream VODs are the primary content; Shorts are clipped from that footage). Write a weekly strategy brief — a comprehensive synthesis of what the system has learned and what the channel should focus on for the next 7 days. Be analytical, specific, and data-driven. Max 5-6 sentences.",
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

    // ASI cross-platform expansion — checks if YouTube is mature enough to expand
    // to the next social platform and fires a user notification when ready.
    try {
      const { runSocialExpansionCycle } = await import("./social-expansion-engine");
      await runSocialExpansionCycle(userId);
    } catch (seeErr: any) {
      logger.debug(`[Brain] Social expansion cycle non-fatal: ${seeErr?.message?.slice(0, 80)}`);
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
      model: "gpt-5",
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

// ── ASI: Negative pattern recording ───────────────────────────────────────────
// Called by any engine when a content pattern is confirmed to have failed.
// Writes an explicit AVOID principle to masterKnowledgeBank at low confidence
// so every AI prompt can factor in what NOT to do on this channel.

export async function recordNegativePattern(
  userId: string,
  category: string,
  pattern: string,
  evidence?: string,
): Promise<void> {
  try {
    await db.insert(masterKnowledgeBank).values({
      userId,
      category: "negative_pattern",
      principle: `[AVOID] ${pattern.slice(0, 300)}`,
      sourceEngines: ["learning-brain", category],
      evidenceCount: 1,
      confidenceScore: 38,
      applicableEngines: [
        "content-maximizer", "shorts-pipeline-engine",
        "vod-seo-optimizer", "youtube-ai-orchestrator",
      ],
      isActive: true,
      metadata: {
        category,
        evidence: evidence?.slice(0, 200),
        recordedAt: new Date().toISOString(),
      },
    } as any);
    logger.debug(`[Brain] Negative pattern recorded: ${pattern.slice(0, 80)}`);
  } catch (err: any) {
    logger.debug(`[Brain] recordNegativePattern non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── ASI: Online milestone learning ────────────────────────────────────────────
// Call when a published video hits a view milestone (100, 1K, 10K, 100K).
// Immediately records a positive principle into masterKnowledgeBank so the
// learning feedback loop closes within minutes instead of waiting for daily cycles.

export async function onVideoMilestone(
  userId: string,
  youtubeVideoId: string,
  milestone: 100 | 1000 | 10000 | 100000,
): Promise<void> {
  try {
    const [queueItem] = await db
      .select({ caption: autopilotQueue.caption, metadata: autopilotQueue.metadata, type: autopilotQueue.type })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        sql`${autopilotQueue.metadata}->>'youtubeVideoId' = ${youtubeVideoId}`,
      ))
      .limit(1);

    const meta = (queueItem?.metadata ?? {}) as Record<string, any>;
    const title       = queueItem?.caption ?? youtubeVideoId;
    const gameName    = meta.gameName ?? "Battlefield 6";
    const durationSec = meta.targetDurationSec ?? meta.actualDurationSec ?? 0;
    const contentType = queueItem?.type ?? "unknown";
    const ms_k        = milestone >= 1000 ? `${Math.round(milestone / 1000)}K` : String(milestone);

    await db.insert(masterKnowledgeBank).values({
      userId,
      category: "performance_milestone",
      principle: `[MILESTONE-${ms_k}] "${title.slice(0, 80)}" (${contentType}, ${Math.round(durationSec)}s, ${gameName}) hit ${ms_k} views — replicate this content pattern`,
      sourceEngines: ["learning-brain", "milestone-tracker"],
      evidenceCount: 1,
      confidenceScore: Math.min(92, 60 + Math.floor(Math.log10(milestone) * 10)),
      applicableEngines: [
        "content-maximizer", "shorts-pipeline-engine",
        "vod-seo-optimizer", "youtube-ai-orchestrator",
      ],
      isActive: true,
      metadata: {
        youtubeVideoId,
        milestone,
        title: title.slice(0, 100),
        gameName,
        durationSec,
        contentType,
        recordedAt: new Date().toISOString(),
      },
    } as any);

    await db.insert(learningEvents).values({
      userId,
      eventType: "video_milestone",
      sourceAgent: "learning-brain",
      data: { youtubeVideoId, milestone, title: title.slice(0, 100), gameName, contentType },
      outcome: "success",
    });

    logger.info(`[Brain] Milestone ${ms_k} views recorded for "${title.slice(0, 60)}"`);
  } catch (err: any) {
    logger.debug(`[Brain] onVideoMilestone non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── ASI: Ingest negative performance patterns ──────────────────────────────────
// Finds permanently failed queue items and high-churn patterns, synthesises
// explicit AVOID principles and writes them to masterKnowledgeBank.
// Should be called as part of the daily learning cycle.

export async function ingestNegativePatternsIntoBrain(userId: string): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

    // 1. Content types with >40% permanent failure rate (last 30d, ≥5 items)
    const failRes = await db.execute(sql`
      SELECT type,
             COUNT(*) FILTER (WHERE status = 'permanent_fail') AS failed,
             COUNT(*)                                           AS total
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND created_at >= ${thirtyDaysAgo}
      GROUP BY type
      HAVING COUNT(*) >= 5
        AND (COUNT(*) FILTER (WHERE status = 'permanent_fail')::float / COUNT(*)) > 0.4
      ORDER BY failed DESC
      LIMIT 5
    `);
    const failRows = (failRes as any).rows ?? [];
    for (const r of failRows) {
      const failRate = Math.round((Number(r.failed) / Number(r.total)) * 100);
      await db.insert(masterKnowledgeBank).values({
        userId,
        category: "negative_pattern",
        principle: `[AVOID] Content type "${r.type}" has ${failRate}% permanent failure rate (${r.failed}/${r.total} failed last 30d) — investigate pipeline or reduce queuing`,
        sourceEngines: ["learning-brain", "autopilot-queue"],
        evidenceCount: Number(r.total),
        confidenceScore: Math.min(88, 50 + Math.floor(failRate / 2)),
        applicableEngines: ["youtube-ai-orchestrator", "content-maximizer", "back-catalog-engine"],
        isActive: true,
        metadata: { type: r.type, failRate, failed: r.failed, total: r.total, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    // 2. Items deferred ≥4 times — stuck content signals pipeline bottleneck
    const deferRes = await db.execute(sql`
      SELECT type,
             ROUND(AVG((metadata->>'deferCount')::int), 1) AS avg_defers,
             COUNT(*)                                        AS cnt
      FROM autopilot_queue
      WHERE user_id = ${userId}
        AND status IN ('scheduled','pending')
        AND (metadata->>'deferCount')::int >= 4
        AND created_at >= ${thirtyDaysAgo}
      GROUP BY type
      ORDER BY avg_defers DESC
      LIMIT 4
    `);
    const deferRows = (deferRes as any).rows ?? [];
    for (const r of deferRows) {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category: "negative_pattern",
        principle: `[SIGNAL] Type "${r.type}" has ${Number(r.cnt)} items stuck (avg ${Number(r.avg_defers).toFixed(1)} deferrals each) — likely pipeline bottleneck or metadata issue`,
        sourceEngines: ["learning-brain", "autopilot-queue"],
        evidenceCount: Number(r.cnt),
        confidenceScore: 42,
        applicableEngines: ["youtube-ai-orchestrator", "back-catalog-engine"],
        isActive: true,
        metadata: { type: r.type, avgDefers: r.avg_defers, cnt: r.cnt, intakeAt: new Date().toISOString() },
      } as any).catch(() => {});
    }

    logger.info(`[Brain] Negative pattern intake: ${failRows.length + deferRows.length} pattern(s) written`);
  } catch (err: any) {
    logger.warn(`[Brain] ingestNegativePatternsIntoBrain non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}
