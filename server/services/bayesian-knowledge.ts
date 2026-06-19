/**
 * Bayesian Knowledge Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies Bayesian confidence updates to every entry in the masterKnowledgeBank.
 * Entries derived from 2 data points are treated very differently from entries
 * derived from 200 data points. This gives the adversarial evaluator and all
 * AI prompts a honest view of how certain the system actually is.
 *
 * Core mechanic:
 *   Prior = current confidenceScore (0-100, treated as %)
 *   Evidence = confirming/contradicting signals from outcomes
 *   Posterior = Bayesian-updated score
 *
 * A confirming signal (real view-count improvement, CTR lift, etc.) raises the
 * score. A contradicting signal (expected lift didn't materialise) lowers it.
 * Entries with low evidence count are penalised (high uncertainty).
 *
 * Runs daily as part of Step 9y in the learning brain.
 */

import { db } from "../db";
import { masterKnowledgeBank, autopilotQueue, shadowVideoAnalytics } from "@shared/schema";
import { eq, and, sql, gte, lt, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";

const logger = createLogger("bayesian-knowledge");

const SERVICE_KEY    = "bayesian-knowledge";
const RUN_COOLDOWN   = 22 * 60 * 60_000; // ~daily

// ── Bayesian update formula ──────────────────────────────────────────────────
// We use a simplified Beta distribution update:
//   Given current confidence p (0-1) and evidence weight w (0-1):
//   confirming:     p' = p + (1 - p) * w * learnRate
//   contradicting:  p' = p - p * w * learnRate
// learnRate decays as evidenceCount grows (early evidence has more impact)

function bayesianUpdate(
  currentScore: number,
  evidenceCount: number,
  direction: "confirming" | "contradicting",
  weight = 0.5,
): number {
  const p = currentScore / 100;
  const learnRate = Math.max(0.05, 0.4 / Math.sqrt(Math.max(1, evidenceCount)));

  let pNew: number;
  if (direction === "confirming") {
    pNew = p + (1 - p) * weight * learnRate;
  } else {
    pNew = p - p * weight * learnRate;
  }

  // Uncertainty penalty: entries with <3 evidence are capped at 70
  const cap = evidenceCount < 3 ? 70 : evidenceCount < 10 ? 88 : 98;
  pNew = Math.min(pNew, cap / 100);
  pNew = Math.max(0.05, pNew);

  return Math.round(pNew * 100);
}

// ── Corroborate knowledge entries against real outcome data ──────────────────

async function scoreEntryAgainstOutcomes(
  userId: string,
  entry: { id: number; principle: string; category: string; confidenceScore: number | null; evidenceCount: number | null; timesApplied: number | null; successRate: number | null },
): Promise<{ direction: "confirming" | "contradicting" | "neutral"; weight: number } | null> {
  try {
    const principleText = entry.principle.toLowerCase();
    const timesApplied  = entry.timesApplied ?? 0;

    // Timing-related principle — check against actual publish-time performance
    if (principleText.includes("morning") || principleText.includes("evening") ||
        principleText.includes("utc") || principleText.includes("pm") || principleText.includes("am")) {

      const recentPublished = await db.select({
        viewCount:   shadowVideoAnalytics.views,
        ctr:         shadowVideoAnalytics.impressionsCtr,
        publishedAt: sql<string>`${autopilotQueue}.published_at`,
      })
        .from(autopilotQueue)
        .leftJoin(shadowVideoAnalytics, sql`${shadowVideoAnalytics}.video_id = ${autopilotQueue}.metadata->>'youtubeVideoId'`)
        .where(and(
          sql`${autopilotQueue}.user_id = ${userId}`,
          sql`${autopilotQueue}.status = 'published'`,
          gte(sql`${autopilotQueue}.published_at`, sql`NOW() - INTERVAL '30 days'`),
          sql`${shadowVideoAnalytics}.views > 0`,
        ))
        .limit(20);

      if (recentPublished.length >= 5) {
        const avgViews = recentPublished.reduce((s, r) => s + (r.viewCount ?? 0), 0) / recentPublished.length;
        if (timesApplied > 0 && avgViews > 1000) {
          return { direction: "confirming", weight: 0.4 };
        }
        if (timesApplied > 0 && avgViews < 100) {
          return { direction: "contradicting", weight: 0.3 };
        }
      }
    }

    // Performance-related principle — check successRate from metadata
    if (entry.successRate !== null) {
      if (entry.successRate > 0.7)  return { direction: "confirming",    weight: 0.6 };
      if (entry.successRate < 0.3)  return { direction: "contradicting", weight: 0.5 };
    }

    // timesApplied > 0 with no contradicting data = weak confirmation
    if ((entry.timesApplied ?? 0) > 0) {
      return { direction: "confirming", weight: 0.15 };
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main reweighting pass ────────────────────────────────────────────────────

export interface BayesianReweightResult {
  total:        number;
  increased:    number;
  decreased:    number;
  avgConfidence: number;
}

export async function runBayesianReweighting(userId: string): Promise<BayesianReweightResult> {
  const lastRun = await getState(SERVICE_KEY, "last_run") as any;
  if (lastRun?.at && Date.now() - new Date(lastRun.at).getTime() < RUN_COOLDOWN) {
    return { total: 0, increased: 0, decreased: 0, avgConfidence: 0 };
  }

  logger.info(`[BayesianKnowledge] Starting reweighting pass for ${userId.slice(0, 8)}`);

  try {
    const entries = await db.select({
      id:              masterKnowledgeBank.id,
      principle:       masterKnowledgeBank.principle,
      category:        masterKnowledgeBank.category,
      confidenceScore: masterKnowledgeBank.confidenceScore,
      evidenceCount:   masterKnowledgeBank.evidenceCount,
      timesApplied:    masterKnowledgeBank.timesApplied,
      successRate:     masterKnowledgeBank.successRate,
    })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
        lt(masterKnowledgeBank.confidenceScore, 99),
      ))
      .orderBy(desc(masterKnowledgeBank.timesApplied))
      .limit(100);

    let increased = 0;
    let decreased = 0;
    let scoreSum  = 0;

    for (const entry of entries) {
      const cs  = entry.confidenceScore ?? 50;
      const ec  = entry.evidenceCount   ?? 0;
      const evidence = await scoreEntryAgainstOutcomes(userId, entry);
      if (!evidence || evidence.direction === "neutral") {
        scoreSum += cs;
        continue;
      }

      const newScore = bayesianUpdate(cs, ec, evidence.direction, evidence.weight);

      if (newScore !== cs) {
        await db.update(masterKnowledgeBank)
          .set({
            confidenceScore: newScore,
            evidenceCount:   ec + 1,
          } as any)
          .where(eq(masterKnowledgeBank.id, entry.id));

        if (newScore > cs) increased++;
        else decreased++;
      }

      scoreSum += newScore;
    }

    const avgConfidence = entries.length > 0 ? Math.round(scoreSum / entries.length) : 0;

    await setState(SERVICE_KEY, "last_run", {
      at:            new Date().toISOString(),
      total:         entries.length,
      increased,
      decreased,
      avgConfidence,
    });

    logger.info(`[BayesianKnowledge] Reweighted ${entries.length} entries — ↑${increased} ↓${decreased}, avg confidence ${avgConfidence}%`);
    return { total: entries.length, increased, decreased, avgConfidence };
  } catch (err: any) {
    logger.debug(`[BayesianKnowledge] Reweighting non-fatal: ${err?.message?.slice(0, 100)}`);
    return { total: 0, increased: 0, decreased: 0, avgConfidence: 0 };
  }
}

// ── Confidence-weighted principle retrieval ──────────────────────────────────

export async function getConfidenceWeightedPrinciples(
  userId: string,
  category?: string,
  minConfidence = 55,
  limit = 20,
): Promise<Array<{ principle: string; confidence: number; category: string }>> {
  try {
    const q = db.select({
      principle:       masterKnowledgeBank.principle,
      confidenceScore: masterKnowledgeBank.confidenceScore,
      category:        masterKnowledgeBank.category,
    })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
        gte(masterKnowledgeBank.confidenceScore, minConfidence),
        category ? eq(masterKnowledgeBank.category, category) : sql`true`,
      ))
      .orderBy(
        desc(masterKnowledgeBank.confidenceScore),
        desc(masterKnowledgeBank.timesApplied),
      )
      .limit(limit);

    const rows = await q;
    return rows.map(r => ({
      principle:  r.principle,
      confidence: r.confidenceScore ?? 50,
      category:   r.category ?? "general",
    }));
  } catch {
    return [];
  }
}
