/**
 * Content Expansion Engine
 *
 * Monitors BF6 catalog exhaustion and channel growth trajectory.
 * When the primary content supply is running out OR growth is plateauing,
 * it autonomously evaluates expansion opportunities and proposes a concrete
 * plan — without waiting for a human to notice.
 *
 * Expansion is proposed (not silently executed) so the safe-self-implementer
 * and orchestrator can validate before committing to a new content strategy.
 *
 * Runs every 48 h (Wave 10.5).
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  discoveredStrategies,
  improvementGoals,
  backCatalogVideos,
  youtubeOutputMetrics,
} from "@shared/schema";
import { eq, and, gte, sql, count, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { acquireAISlotBackground, releaseAISlot } from "../lib/ai-semaphore";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";

const logger    = createLogger("content-expansion-engine");
const CYCLE_MS  = 48 * 60 * 60_000;
const REAL_USER = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

interface ExpansionSignal {
  bf6MinedPct: number;
  growthTrend: "growing" | "flat" | "declining";
  avgViewsLast14d: number;
  avgViewsPrior14d: number;
  shouldExpand: boolean;
  reason: string;
}

// ─── Signal evaluation ────────────────────────────────────────────────────────

async function evaluateExpansionSignals(): Promise<ExpansionSignal> {
  const [catalogTotal, catalogMined] = await Promise.all([
    db.select({ n: count() }).from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, REAL_USER)),
    db.select({ n: count() }).from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, REAL_USER),
        sql`(short_mined_at IS NOT NULL OR long_form_mined_at IS NOT NULL)`,
      )),
  ]);

  const total  = catalogTotal[0]?.n  ?? 0;
  const mined  = catalogMined[0]?.n  ?? 0;
  const minedPct = total > 0 ? mined / total : 0;

  const now14d  = new Date(Date.now() - 14 * 24 * 60 * 60_000);
  const now28d  = new Date(Date.now() - 28 * 24 * 60 * 60_000);

  const [recentMetrics, priorMetrics] = await Promise.all([
    db.select({ avg: sql<number>`AVG(views)` }).from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, REAL_USER),
        gte(youtubeOutputMetrics.publishedAt, now14d),
      )),
    db.select({ avg: sql<number>`AVG(views)` }).from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, REAL_USER),
        gte(youtubeOutputMetrics.publishedAt, now28d),
        sql`published_at < ${now14d.toISOString()}`,
      )),
  ]);

  const recentAvg = Number(recentMetrics[0]?.avg ?? 0);
  const priorAvg  = Number(priorMetrics[0]?.avg ?? 0);

  let growthTrend: ExpansionSignal["growthTrend"] = "flat";
  if (priorAvg > 0) {
    const delta = (recentAvg - priorAvg) / priorAvg;
    if (delta > 0.1)  growthTrend = "growing";
    if (delta < -0.1) growthTrend = "declining";
  }

  // Expansion is warranted when catalog is nearly exhausted OR growth is stalling
  const catalogExhausted = minedPct >= 0.85;
  const growthStalling   = growthTrend !== "growing" && recentAvg > 0;
  const shouldExpand     = catalogExhausted || growthStalling;

  const reason = catalogExhausted
    ? `BF6 catalog ${Math.round(minedPct * 100)}% mined — primary content supply running low`
    : growthStalling
    ? `Growth ${growthTrend} (recent: ${recentAvg.toFixed(0)} vs prior: ${priorAvg.toFixed(0)} avg views)`
    : "No expansion needed — catalog healthy and growth positive";

  return { bf6MinedPct: minedPct, growthTrend, avgViewsLast14d: recentAvg,
           avgViewsPrior14d: priorAvg, shouldExpand, reason };
}

// ─── Expansion planning ───────────────────────────────────────────────────────

async function planExpansion(signal: ExpansionSignal): Promise<void> {
  // Check if we've already proposed expansion recently (avoid duplicates)
  const recent = await db.select({ id: improvementGoals.id })
    .from(improvementGoals)
    .where(and(
      eq(improvementGoals.userId, REAL_USER),
      eq(improvementGoals.goalType, "content_expansion"),
      eq(improvementGoals.status, "active"),
    ))
    .limit(1);

  if (recent.length > 0) {
    logger.info("[ContentExpansion] Active expansion goal already exists — skipping proposal");
    return;
  }

  // Read causal attributions + top performing games from masterKnowledgeBank
  const knowledgeRows = await db.select({ principle: masterKnowledgeBank.principle })
    .from(masterKnowledgeBank)
    .where(and(
      eq(masterKnowledgeBank.userId, REAL_USER),
      eq(masterKnowledgeBank.isActive, true),
      sql`category IN ('causal_attribution','strategic_directive','autonomous_goal')`,
    ))
    .orderBy(desc(masterKnowledgeBank.confidenceScore))
    .limit(10);

  const context = knowledgeRows.map(r => r.principle).join("\n");

  await acquireAISlotBackground();
  let plan: { nextGame: string; rationale: string; strategy: string } | null = null;
  try {
    const client = getRawOpenAIClientForDirectUse();
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are the content expansion planner for ET Gaming 274 (BF6 YouTube channel, ~6,140 subscribers).

Expansion trigger: ${signal.reason}
BF6 catalog mined: ${Math.round(signal.bf6MinedPct * 100)}%
Growth trend: ${signal.growthTrend}
Known performance context:
${context || "No causal data yet — use general gaming knowledge"}

The channel is currently BF6-only (no-commentary gameplay). Identify the SINGLE best game to expand into next.
Consider: audience overlap with BF6 fans, trending games in 2026, competition level, clip-ability.
Do NOT suggest Battlefield 2042 (channel has it but it's less popular than BF6).

Respond as JSON:
{
  "nextGame": "Game Title",
  "rationale": "2-3 sentences why this game is the right expansion",
  "strategy": "Brief description of the expansion approach (e.g., start with 3 Shorts/week while BF6 continues)"
}`,
      }],
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    plan = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  } finally {
    releaseAISlot();
  }

  if (!plan?.nextGame) return;

  // Write expansion goal to improvementGoals
  await db.insert(improvementGoals).values({
    userId:       REAL_USER,
    goalType:     "content_expansion",
    title:        `Expand content to ${plan.nextGame}`,
    description:  `${plan.rationale} Strategy: ${plan.strategy}`,
    targetMetric: "new_game_clips_published",
    currentValue: 0,
    targetValue:  10, // first 10 clips validates the expansion
    unit:         "clips",
    status:       "active",
    progress:     0,
  });

  // Write to discoveredStrategies so other engines can reference it
  await db.insert(discoveredStrategies).values({
    userId:       REAL_USER,
    strategyType: "content_expansion",
    title:        `Expand to ${plan.nextGame}`,
    description:  `${plan.rationale} ${plan.strategy}`,
    source:       "content-expansion-engine",
    applicableTo: ["back-catalog-runner","shorts-pipeline-engine","content-maximizer"],
    isActive:     false, // not active until self-implementer or orchestrator validates
    metadata:     { trigger: signal, plan, proposedAt: new Date().toISOString() },
  });

  // Write expansion signal to masterKnowledgeBank as action_required
  // (safe-self-implementer will pick this up and evaluate if it's config-safe)
  await db.insert(masterKnowledgeBank).values({
    userId:           REAL_USER,
    category:         "action_required",
    principle:        `CONTENT EXPANSION PROPOSED: Add ${plan.nextGame} to the channel. ${plan.rationale} Implementation: ${plan.strategy}. Trigger: ${signal.reason}.`,
    sourceEngines:    ["content-expansion-engine"],
    applicableEngines:["youtube-ai-orchestrator","back-catalog-runner","safe-self-implementer"],
    confidenceScore:  70,
    evidenceCount:    1,
    metadata:         { plan, signal, proposedAt: new Date().toISOString() },
  });

  logger.info(`[ContentExpansion] Expansion proposed: ${plan.nextGame} — ${signal.reason}`);
}

// ─── Cycle ────────────────────────────────────────────────────────────────────

async function runExpansionCycle(): Promise<void> {
  try {
    const signal = await evaluateExpansionSignals();
    logger.info(`[ContentExpansion] Signal: ${signal.reason} | expand=${signal.shouldExpand}`);

    if (signal.shouldExpand) {
      await planExpansion(signal);
    } else {
      // Write positive signal to MKB so orchestrator knows catalog is healthy
      await db.insert(masterKnowledgeBank).values({
        userId:           REAL_USER,
        category:         "catalog_health",
        principle:        `BF6 catalog healthy (${Math.round(signal.bf6MinedPct * 100)}% mined, growth ${signal.growthTrend}). No expansion needed at this time.`,
        sourceEngines:    ["content-expansion-engine"],
        applicableEngines:["youtube-ai-orchestrator"],
        confidenceScore:  75,
        metadata:         { signal, checkedAt: new Date().toISOString() },
      }).catch(() => {}); // ignore duplicate errors
    }
  } catch (err: any) {
    logger.warn(`[ContentExpansion] Cycle failed (non-fatal): ${err?.message}`);
  }
}

export function initContentExpansionEngine(userId: string): NodeJS.Timeout {
  const delay = 25 * 60_000; // T+25min after Wave 10.5 start
  logger.info(`[ContentExpansion] Init — first cycle in ${delay / 60_000}min, then every 48h`);
  const t = setTimeout(async () => {
    await runExpansionCycle();
    setInterval(runExpansionCycle, CYCLE_MS);
  }, delay);
  return t;
}
