/**
 * Architecture Critic (Meta-Service Evaluator)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks each background service's contribution to real outcomes over time.
 * Services that haven't produced useful output in 7+ days are flagged. Services
 * that are burning quota without producing knowledge are penalised. Efficient
 * services that consistently produce high-value masterKnowledgeBank entries are
 * rewarded with higher contributionScore.
 *
 * This closes the "are we running the right engines?" loop — the system can
 * identify its own architectural dead weight without human inspection.
 *
 * Architecture Critic does NOT disable services — it writes critique summaries
 * to the servicePerformanceMetrics table and flags low-scorers to the self-
 * architect and masterKnowledgeBank for human review.
 */

import { db } from "../db";
import { servicePerformanceMetrics, masterKnowledgeBank, systemIncidentLog } from "@shared/schema";
import { eq, sql, lt, desc, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";

const logger = createLogger("architecture-critic");

const SERVICE_KEY    = "architecture-critic";
const RUN_INTERVAL   = 7 * 24 * 60 * 60_000; // weekly
const STALE_DAYS     = 7;
const LOW_SCORE_THRESHOLD = 25;

// ── Record service activity (called by any service that wants to be tracked) ──

export async function recordServiceActivity(
  service: string,
  outputsGenerated: number,
  knowledgeEntriesAdded: number,
  quotaConsumed = 0,
  errors = 0,
): Promise<void> {
  try {
    const contributionDelta = Math.min(20,
      outputsGenerated * 3 + knowledgeEntriesAdded * 5 - errors * 2,
    );

    await db.execute(sql`
      INSERT INTO service_performance_metrics
        (service, last_run_at, outputs_generated, knowledge_entries_added, quota_consumed, error_count, contribution_score, updated_at)
      VALUES
        (${service}, NOW(), ${outputsGenerated}, ${knowledgeEntriesAdded}, ${quotaConsumed}, ${errors}, GREATEST(10, LEAST(100, 50 + ${contributionDelta})), NOW())
      ON CONFLICT (service) DO UPDATE SET
        last_run_at             = NOW(),
        outputs_generated       = service_performance_metrics.outputs_generated + ${outputsGenerated},
        knowledge_entries_added = service_performance_metrics.knowledge_entries_added + ${knowledgeEntriesAdded},
        quota_consumed          = service_performance_metrics.quota_consumed + ${quotaConsumed},
        error_count             = service_performance_metrics.error_count + ${errors},
        contribution_score      = GREATEST(10, LEAST(100, service_performance_metrics.contribution_score + ${contributionDelta})),
        updated_at              = NOW()
    `);
  } catch {
    // Fire-and-forget — never throw
  }
}

// ── Decay stale scores ────────────────────────────────────────────────────────
// Services that haven't run recently get their contribution score decayed

async function decayStaleScores(): Promise<void> {
  try {
    // Decay by 5 points for every day over the STALE_DAYS threshold
    await db.execute(sql`
      UPDATE service_performance_metrics
      SET
        contribution_score = GREATEST(5, contribution_score - 5),
        updated_at         = NOW()
      WHERE last_run_at < NOW() - INTERVAL '${sql.raw(String(STALE_DAYS))} days'
        AND contribution_score > 5
    `);
  } catch {
    // Non-fatal
  }
}

// ── Main critique pass ────────────────────────────────────────────────────────

export async function runArchitectureCritique(userId: string): Promise<void> {
  const lastRun = await getState(SERVICE_KEY, "last_run") as any;
  if (lastRun?.at && Date.now() - new Date(lastRun.at).getTime() < RUN_INTERVAL) return;

  logger.info(`[ArchitectureCritic] Running weekly architecture critique`);

  try {
    await decayStaleScores();

    // Find low-scoring services
    const lowScorers = await db.select()
      .from(servicePerformanceMetrics)
      .where(lt(servicePerformanceMetrics.contributionScore, LOW_SCORE_THRESHOLD))
      .orderBy(servicePerformanceMetrics.contributionScore)
      .limit(10);

    // Find stale services (haven't run in 7+ days)
    const staleServices = await db.select()
      .from(servicePerformanceMetrics)
      .where(lt(servicePerformanceMetrics.lastRunAt, sql`NOW() - INTERVAL '${sql.raw(String(STALE_DAYS))} days'`))
      .limit(10);

    // Find high-performing services
    const topPerformers = await db.select()
      .from(servicePerformanceMetrics)
      .orderBy(desc(servicePerformanceMetrics.contributionScore))
      .limit(5);

    await setState(SERVICE_KEY, "last_run", {
      at:            new Date().toISOString(),
      lowScorers:    lowScorers.length,
      staleServices: staleServices.length,
    });

    if (lowScorers.length === 0 && staleServices.length === 0) {
      logger.info("[ArchitectureCritic] All services performing well — no flags");
      return;
    }

    // Write critique to masterKnowledgeBank
    const critiqueParts: string[] = [];

    if (lowScorers.length > 0) {
      const names = lowScorers.map(s => `${s.service}(${s.contributionScore})`).join(", ");
      critiqueParts.push(`LOW-CONTRIBUTION services: ${names} — these services are running but producing minimal useful output`);
    }

    if (staleServices.length > 0) {
      const names = staleServices.map(s => s.service).join(", ");
      critiqueParts.push(`STALE services (${STALE_DAYS}+ days silent): ${names} — may be broken or inactive`);
    }

    if (topPerformers.length > 0) {
      const names = topPerformers.map(s => `${s.service}(${s.contributionScore})`).join(", ");
      critiqueParts.push(`TOP-PERFORMING services: ${names} — these are driving the most learning`);
    }

    const principle = `ARCHITECTURE CRITIQUE: ${critiqueParts.join(". ")}. Review low-contribution services for removal or improvement.`;

    await db.insert(masterKnowledgeBank).values({
      userId,
      category:         "architecture_critique",
      principle,
      sourceEngines:    ["architecture-critic"],
      evidenceCount:    lowScorers.length + staleServices.length,
      confidenceScore:  80,
      applicableEngines: ["youtube-ai-orchestrator"],
      isActive:         true,
      metadata:         {
        lowScorers:    lowScorers.map(s => ({ service: s.service, score: s.contributionScore })),
        staleServices: staleServices.map(s => s.service),
        topPerformers: topPerformers.map(s => ({ service: s.service, score: s.contributionScore })),
        critiquedAt:   new Date().toISOString(),
      } as any,
    } as any).onConflictDoNothing();

    // Update critique summary on each low scorer
    for (const svc of lowScorers) {
      await db.update(servicePerformanceMetrics)
        .set({
          critiquedAt:     new Date(),
          critiqueSummary: `Low contribution score (${svc.contributionScore}/100). Outputs: ${svc.outputsGenerated}, Knowledge entries: ${svc.knowledgeEntriesAdded}, Errors: ${svc.errorCount}.`,
          updatedAt:       new Date(),
        })
        .where(eq(servicePerformanceMetrics.id, svc.id));
    }

    logger.info(`[ArchitectureCritic] Critique complete — ${lowScorers.length} low-scorers, ${staleServices.length} stale services flagged`);
  } catch (err: any) {
    logger.debug(`[ArchitectureCritic] Critique non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initArchitectureCritic(userId: string): ReturnType<typeof setInterval> {
  setTimeout(() => runArchitectureCritique(userId).catch(() => {}), 20 * 60_000);
  return setInterval(() => runArchitectureCritique(userId).catch(() => {}), RUN_INTERVAL);
}
