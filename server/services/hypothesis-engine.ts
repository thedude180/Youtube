/**
 * Hypothesis Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Scans the masterKnowledgeBank for unexplained variance and generates
 * testable hypotheses that feed into the autonomous-experimenter.
 *
 * The difference from the autonomous-experimenter:
 *   • Experimenter: picks ONE hypothesis (AI-generated) and designs a test
 *   • Hypothesis Engine: systematically mines the KNOWLEDGE BASE for gaps —
 *     entries with high variance, low evidence, or contradicting signals —
 *     and generates a structured hypothesis list the experimenter can consume
 *
 * This is the "what should we be curious about?" loop.
 *
 * Runs every 3 days. Writes to the hypotheses table. Promotes confirmed
 * hypotheses to masterKnowledgeBank with high confidence.
 */

import { db } from "../db";
import { hypotheses, masterKnowledgeBank, autopilotQueue, shadowVideoAnalytics } from "@shared/schema";
import { eq, and, sql, gte, desc, lt, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("hypothesis-engine");

const SERVICE_KEY   = "hypothesis-engine";
const RUN_INTERVAL  = 3 * 24 * 60 * 60_000;
const MAX_NEW_HYPS  = 5;

// ── Find knowledge gaps (unexplained variance) ───────────────────────────────

async function findKnowledgeGaps(userId: string): Promise<Array<{
  area:       string;
  question:   string;
  domain:     string;
  evidence:   string;
}>> {
  const gaps: Array<{ area: string; question: string; domain: string; evidence: string }> = [];

  try {
    // Low-confidence principles with high application count — trusted but not validated
    const lowConfHighApply = await db.select({
      principle:       masterKnowledgeBank.principle,
      category:        masterKnowledgeBank.category,
      confidenceScore: masterKnowledgeBank.confidenceScore,
      timesApplied:    masterKnowledgeBank.timesApplied,
    })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
        lt(masterKnowledgeBank.confidenceScore, 55),
        gte(masterKnowledgeBank.timesApplied, 3),
      ))
      .limit(5);

    for (const entry of lowConfHighApply) {
      gaps.push({
        area:     entry.principle.slice(0, 100),
        question: `We apply "${entry.principle.slice(0, 80)}" frequently (${entry.timesApplied}× applied) but confidence is only ${entry.confidenceScore}%. Is this actually working?`,
        domain:   mapCategoryToDomain(entry.category ?? "general"),
        evidence: `Low confidence (${entry.confidenceScore}%) + high application count (${entry.timesApplied})`,
      });
    }

    // Check if timing theories are validated
    const timingPrinciples = await db.select({
      principle:       masterKnowledgeBank.principle,
      evidenceCount:   masterKnowledgeBank.evidenceCount,
    })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
        eq(masterKnowledgeBank.category, "performance"),
        sql`${masterKnowledgeBank.principle} ILIKE '%post%' OR ${masterKnowledgeBank.principle} ILIKE '%publish%' OR ${masterKnowledgeBank.principle} ILIKE '%time%'`,
      ))
      .limit(3);

    if (timingPrinciples.some(p => (p.evidenceCount ?? 0) < 5)) {
      gaps.push({
        area:     "publish timing",
        question: "We believe certain publish times outperform others — but is this statistically significant for this channel, or just noise from a small sample?",
        domain:   "timing",
        evidence: "Timing principles have <5 evidence points",
      });
    }

    // Check for missing thumbnail/hook data
    const hookPrinciples = await db.select({ id: masterKnowledgeBank.id })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.category, "hook_performance"),
      ))
      .limit(1);

    if (hookPrinciples.length === 0) {
      gaps.push({
        area:     "Short hook effectiveness",
        question: "We have no data on which hook style (action hook vs question hook vs result hook) drives the highest Shorts completion rate for BF6 content",
        domain:   "hook",
        evidence: "No hook performance principles in knowledge base",
      });
    }
  } catch (err: any) {
    logger.debug(`[HypothesisEngine] Gap scan non-fatal: ${err?.message?.slice(0, 80)}`);
  }

  return gaps;
}

function mapCategoryToDomain(category: string): string {
  if (category.includes("timing") || category.includes("window") || category.includes("publish")) return "timing";
  if (category.includes("hook") || category.includes("short"))  return "hook";
  if (category.includes("seo") || category.includes("tag"))     return "seo";
  if (category.includes("thumbnail"))                           return "thumbnail";
  if (category.includes("format") || category.includes("duration")) return "format";
  return "engagement";
}

// ── Generate hypotheses from gaps ────────────────────────────────────────────

export async function runHypothesisGeneration(userId: string): Promise<number> {
  const lastRun = await getState(SERVICE_KEY, "last_run") as any;
  if (lastRun?.at && Date.now() - new Date(lastRun.at).getTime() < RUN_INTERVAL) return 0;

  logger.info(`[HypothesisEngine] Scanning for knowledge gaps and generating hypotheses`);

  try {
    await setState(SERVICE_KEY, "last_run", { at: new Date().toISOString() });

    const gaps = await findKnowledgeGaps(userId);

    // Don't duplicate existing untested hypotheses
    const existingUntested = await db.select({ statement: hypotheses.statement })
      .from(hypotheses)
      .where(and(
        eq(hypotheses.userId, userId),
        eq(hypotheses.status, "untested"),
      ))
      .limit(20);

    const existingTexts = new Set(existingUntested.map(h => h.statement.slice(0, 60).toLowerCase()));

    // Use AI to generate structured hypotheses from the gaps
    const gapSummary = gaps.map((g, i) => `${i + 1}. AREA: ${g.area}\n   QUESTION: ${g.question}\n   EVIDENCE: ${g.evidence}`).join("\n\n");

    const result = await executeRoutedAICall(
      { taskType: "learning", userId, maxTokens: 1200 },
      "You are a scientific hypothesis designer for a YouTube gaming channel. You create precise, testable hypotheses from knowledge gaps. Return only valid JSON.",
      `Generate testable hypotheses for ET Gaming 274 (no-commentary BF6 gaming channel, ~6K subs).

KNOWLEDGE GAPS IDENTIFIED:
${gapSummary || "No specific gaps — generate general high-value hypotheses about what might improve channel performance."}

Generate up to ${MAX_NEW_HYPS} hypotheses. Each must be:
- Specific and falsifiable (can be proven true or false by running the channel)
- Actionable (testing it requires publishing content, not survey data)
- High-impact (confirming it would meaningfully change how we operate)

For each hypothesis, specify the domain: timing|format|hook|seo|thumbnail|engagement

Return JSON:
{
  "hypotheses": [
    {
      "statement": "If we publish Shorts within 2 hours of a BF6 trending event, CTR will be 40%+ higher than baseline",
      "domain": "timing",
      "rationale": "Trending events create search demand spikes; time-sensitive content captures surge impressions",
      "initialConfidence": 35
    }
  ]
}`,
    );

    const parsed = safeParseJSON<{
      hypotheses?: Array<{ statement: string; domain: string; rationale: string; initialConfidence?: number }>;
    } | null>(result.content, null);

    if (!parsed?.hypotheses?.length) return 0;

    let written = 0;
    for (const hyp of parsed.hypotheses.slice(0, MAX_NEW_HYPS)) {
      if (!hyp.statement || !hyp.domain) continue;
      // Skip near-duplicates
      if (existingTexts.has(hyp.statement.slice(0, 60).toLowerCase())) continue;

      await db.insert(hypotheses).values({
        userId,
        statement:  hyp.statement,
        domain:     hyp.domain,
        rationale:  hyp.rationale ?? "",
        confidence: Math.min(60, Math.max(10, hyp.initialConfidence ?? 30)),
        status:     "untested",
      } as any).onConflictDoNothing();

      written++;
    }

    logger.info(`[HypothesisEngine] Generated ${written} new hypotheses from ${gaps.length} knowledge gap(s)`);
    return written;
  } catch (err: any) {
    logger.debug(`[HypothesisEngine] Generation non-fatal: ${err?.message?.slice(0, 120)}`);
    return 0;
  }
}

// ── Resolve confirmed/rejected hypotheses ────────────────────────────────────
// Called by autonomous-experimenter when an experiment concludes

export async function resolveHypothesis(
  userId: string,
  hypothesisId: number,
  outcome: "confirmed" | "rejected",
  evidenceSummary: string,
): Promise<void> {
  try {
    await db.update(hypotheses)
      .set({
        status:   outcome,
        testedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(and(eq(hypotheses.id, hypothesisId), eq(hypotheses.userId, userId)));

    if (outcome === "confirmed") {
      // Write to masterKnowledgeBank as a validated fact
      const hyp = await db.select().from(hypotheses).where(eq(hypotheses.id, hypothesisId)).limit(1);
      if (hyp[0]) {
        await db.insert(masterKnowledgeBank).values({
          userId,
          category:         "validated_hypothesis",
          principle:        `CONFIRMED HYPOTHESIS: ${hyp[0].statement}. Evidence: ${evidenceSummary}`,
          sourceEngines:    ["hypothesis-engine", "autonomous-experimenter"],
          evidenceCount:    2,
          confidenceScore:  75,
          applicableEngines: ["youtube-ai-orchestrator"],
          isActive:         true,
        } as any).onConflictDoNothing();
      }
    }
  } catch (err: any) {
    logger.debug(`[HypothesisEngine] resolveHypothesis non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Get top untested hypotheses for autonomous-experimenter ──────────────────

export async function getTopHypotheses(userId: string, limit = 3): Promise<Array<{
  id: number; statement: string; domain: string; rationale: string; confidence: number;
}>> {
  try {
    const rows = await db.select({
      id:         hypotheses.id,
      statement:  hypotheses.statement,
      domain:     hypotheses.domain,
      rationale:  hypotheses.rationale,
      confidence: hypotheses.confidence,
    })
      .from(hypotheses)
      .where(and(
        eq(hypotheses.userId, userId),
        eq(hypotheses.status, "untested"),
      ))
      .orderBy(desc(hypotheses.confidence))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initHypothesisEngine(userId: string): ReturnType<typeof setInterval> {
  setTimeout(() => runHypothesisGeneration(userId).catch(() => {}), 12 * 60_000);
  return setInterval(() => runHypothesisGeneration(userId).catch(() => {}), RUN_INTERVAL);
}
