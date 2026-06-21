/**
 * generation-cohort-tracker.ts
 *
 * Measures whether the system is actually improving generation-over-generation.
 *
 * Groups published content by ISO week ("cohorts"), computes the average
 * performance score for each cohort, then calculates improvement velocity:
 *
 *   velocity = (G_n.avg - G_(n-1).avg) / G_(n-1).avg × 100  (%)
 *
 * A positive velocity means the latest cohort outperforms the previous one.
 * A negative velocity triggers a warning signal broadcast to all improvement engines.
 *
 * Velocity signals are written to masterKnowledgeBank so the orchestrator,
 * learning brain, and success DNA can factor in whether recent changes are
 * actually helping or hurting.
 *
 * Called from youtube-learning-brain.ts after refreshSuccessDNA().
 * Also exposed as initCohortTracker() for standalone wiring in index.ts.
 */

import { db } from "../db";
import { youtubeOutputMetrics, masterKnowledgeBank, users } from "@shared/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { recordEngineKnowledge } from "./knowledge-mesh";

const logger = createLogger("cohort-tracker");

// ── ISO week helpers ──────────────────────────────────────────────────────────

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Cohort analysis ───────────────────────────────────────────────────────────

export interface CohortResult {
  week: string;
  contentCount: number;
  avgPerformanceScore: number;
  avgViews: number;
  avgCtr: number;
}

export interface VelocityReport {
  latestCohort: CohortResult | null;
  previousCohort: CohortResult | null;
  velocityPct: number | null;    // null = not enough data
  trend: "improving" | "declining" | "stable" | "insufficient_data";
  message: string;
}

/**
 * Run the cohort analysis for a single user and broadcast the velocity signal.
 */
export async function runCohortAnalysis(userId: string): Promise<VelocityReport> {
  const twelveWeeksAgo = new Date(Date.now() - 84 * 86400_000);

  const rows = await db
    .select({
      publishedAt: youtubeOutputMetrics.publishedAt,
      performanceScore: youtubeOutputMetrics.performanceScore,
      views: youtubeOutputMetrics.views,
      ctr: youtubeOutputMetrics.ctr,
    })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      gte(youtubeOutputMetrics.publishedAt, twelveWeeksAgo),
    ))
    .orderBy(desc(youtubeOutputMetrics.publishedAt));

  if (rows.length < 4) {
    return {
      latestCohort: null,
      previousCohort: null,
      velocityPct: null,
      trend: "insufficient_data",
      message: `Only ${rows.length} metrics rows — need at least 4 to compute velocity`,
    };
  }

  // Group by ISO week
  const byWeek = new Map<string, { scores: number[]; views: number[]; ctrs: number[] }>();
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const week = isoWeek(new Date(row.publishedAt));
    if (!byWeek.has(week)) byWeek.set(week, { scores: [], views: [], ctrs: [] });
    const bucket = byWeek.get(week)!;
    if (row.performanceScore != null) bucket.scores.push(row.performanceScore);
    if (row.views != null) bucket.views.push(row.views);
    if (row.ctr != null) bucket.ctrs.push(row.ctr);
  }

  const cohorts: CohortResult[] = [];
  for (const [week, data] of byWeek.entries()) {
    if (data.scores.length === 0) continue;
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    cohorts.push({
      week,
      contentCount: data.scores.length,
      avgPerformanceScore: +avg(data.scores).toFixed(2),
      avgViews: Math.round(avg(data.views)),
      avgCtr: +avg(data.ctrs).toFixed(3),
    });
  }

  // Sort ascending by week string (lexicographic works for YYYY-Www)
  cohorts.sort((a, b) => a.week.localeCompare(b.week));

  if (cohorts.length < 2) {
    return {
      latestCohort: cohorts[0] ?? null,
      previousCohort: null,
      velocityPct: null,
      trend: "insufficient_data",
      message: "Need at least 2 complete weeks of data",
    };
  }

  const latest = cohorts[cohorts.length - 1];
  const previous = cohorts[cohorts.length - 2];

  let velocityPct: number | null = null;
  let trend: VelocityReport["trend"] = "stable";

  if (previous.avgPerformanceScore > 0) {
    velocityPct = +((latest.avgPerformanceScore - previous.avgPerformanceScore) / previous.avgPerformanceScore * 100).toFixed(1);
    if (velocityPct > 5) trend = "improving";
    else if (velocityPct < -5) trend = "declining";
    else trend = "stable";
  }

  const message = velocityPct != null
    ? `${latest.week}: avg score ${latest.avgPerformanceScore} (${velocityPct > 0 ? "+" : ""}${velocityPct}% vs prev week)`
    : `${latest.week}: avg score ${latest.avgPerformanceScore} — no previous cohort to compare`;

  logger.info(`[CohortTracker] ${userId.slice(0, 8)} ${message} trend=${trend}`);

  // Broadcast velocity signal to masterKnowledgeBank + engineKnowledge
  await broadcastVelocitySignal(userId, { latestCohort: latest, previousCohort: previous, velocityPct, trend, message });

  return { latestCohort: latest, previousCohort: previous, velocityPct, trend, message };
}

async function broadcastVelocitySignal(
  userId: string,
  report: VelocityReport,
): Promise<void> {
  if (!report.latestCohort) return;

  const { velocityPct, trend, latestCohort, previousCohort } = report;

  // Write to masterKnowledgeBank as a "improvement_velocity" principle
  const principle = velocityPct != null
    ? `Content performance is ${trend}. Latest cohort (${latestCohort.week}): avg score ${latestCohort.avgPerformanceScore}, ${velocityPct > 0 ? "+" : ""}${velocityPct}% vs previous week. ${
        trend === "declining"
          ? "ALERT: System outputs are getting worse — the current strategy may need reversal."
          : trend === "improving"
          ? "Current strategy is working — reinforce winning patterns."
          : "Performance stable — look for bigger bets."
      }`
    : `Latest cohort ${latestCohort.week}: avg score ${latestCohort.avgPerformanceScore} over ${latestCohort.contentCount} pieces. No velocity yet — need 2 weeks.`;

  try {
    // Upsert into masterKnowledgeBank (update if exists, insert if not)
    const [existing] = await db
      .select({ id: masterKnowledgeBank.id, evidenceCount: masterKnowledgeBank.evidenceCount })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.category, "improvement_velocity"),
      ))
      .limit(1);

    if (existing) {
      await db.update(masterKnowledgeBank)
        .set({
          principle,
          evidenceCount: sql`${masterKnowledgeBank.evidenceCount} + 1`,
          confidenceScore: Math.min(90, (existing.evidenceCount ?? 1) * 5 + 40),
          successRate: trend === "improving" ? sql`least(${masterKnowledgeBank.successRate} + 5, 95)` :
                       trend === "declining" ? sql`greatest(${masterKnowledgeBank.successRate} - 10, 10)` :
                       masterKnowledgeBank.successRate,
          lastReinforcedAt: new Date(),
          updatedAt: new Date(),
          metadata: { velocityPct, trend, latestWeek: latestCohort.week, latestScore: latestCohort.avgPerformanceScore, updatedAt: new Date().toISOString() },
        })
        .where(eq(masterKnowledgeBank.id, existing.id));
    } else {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category: "improvement_velocity",
        principle,
        sourceEngines: ["generation-cohort-tracker"],
        evidenceCount: 1,
        confidenceScore: 40,
        applicableEngines: ["youtube-ai-orchestrator", "youtube-learning-brain", "self-improvement-engine", "prompt-evolution-engine"],
        timesApplied: 0,
        timesSucceeded: 0,
        successRate: 50,
        isActive: true,
        metadata: { velocityPct, trend, latestWeek: latestCohort.week, latestScore: latestCohort.avgPerformanceScore, createdAt: new Date().toISOString() },
      });
    }
  } catch (err: any) {
    logger.debug(`[CohortTracker] masterKnowledgeBank write failed: ${err.message?.slice(0, 80)}`);
  }

  // Also write to engineKnowledge for per-engine pickup
  await recordEngineKnowledge(
    "generation-cohort-tracker",
    userId,
    "velocity_signal",
    `cohort_${latestCohort.week}`,
    principle,
    `Previous: ${previousCohort ? `${previousCohort.week} score=${previousCohort.avgPerformanceScore}` : "none"}. Trend: ${trend}. Count: ${latestCohort.contentCount}`,
    trend === "improving" ? 80 : trend === "declining" ? 35 : 60,
  ).catch(() => {});
}

// ── Standalone init (standalone wiring from index.ts) ─────────────────────────

const COHORT_INTERVAL_MS = 24 * 3_600_000; // once per day

export function initCohortTracker(): ReturnType<typeof setInterval> {
  logger.info("[CohortTracker] Initialized — measuring generation-over-generation improvement");

  setTimeout(async () => {
    try {
      const allUsers = await db.select({ id: users.id }).from(users).limit(50);
      for (const u of allUsers) {
        await runCohortAnalysis(u.id).catch(() => {});
      }
    } catch {}
  }, 35 * 60_000); // T+35min (after learning brain settles)

  return setInterval(async () => {
    try {
      const allUsers = await db.select({ id: users.id }).from(users).limit(50);
      for (const u of allUsers) {
        await runCohortAnalysis(u.id).catch(() => {});
      }
    } catch {}
  }, COHORT_INTERVAL_MS);
}

/**
 * Convenience: get the latest velocity for a user (used by dashboard / orchestrator)
 */
export async function getImprovementVelocity(userId: string): Promise<VelocityReport> {
  return runCohortAnalysis(userId);
}
