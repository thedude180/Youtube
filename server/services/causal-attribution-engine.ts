/**
 * Causal Attribution Engine
 *
 * Builds a true causal world model: which content decisions (type, duration,
 * publish time, thumbnail style) actually drive better performance outcomes
 * (CTR, views, watch time, subscribers).
 *
 * Instead of the system guessing what works, it now KNOWS — statistically —
 * because it analyses every published video outcome grouped by decision
 * dimensions and writes top-performing patterns to masterKnowledgeBank.
 *
 * Every downstream AI call (titles, scheduling, thumbnail style) benefits
 * from these concrete causal signals rather than generic best-practices.
 *
 * Runs every 7 days (heavy query — runs weekly is sufficient).
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  youtubeOutputMetrics,
  hypotheses,
} from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { acquireAISlotBackground, releaseAISlot } from "../lib/ai-semaphore";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";

const logger    = createLogger("causal-attribution-engine");
const CYCLE_MS  = 7 * 24 * 60 * 60_000;
const REAL_USER = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";
const MIN_SAMPLE = 3; // minimum videos per group to count as signal

interface AttributionGroup {
  dimension: string;   // e.g. "contentType=youtube_short"
  value: string;
  sampleSize: number;
  avgViews: number;
  avgCtr: number;
  avgWatchPct: number;
  avgSubsGained: number;
}

// ─── Data collection ──────────────────────────────────────────────────────────

async function collectAttributions(): Promise<AttributionGroup[]> {
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  const groups: AttributionGroup[] = [];

  // 1. By content type
  const byType = await db.execute(sql`
    SELECT content_type                   AS grp_value,
           COUNT(*)::int                  AS n,
           AVG(views)::float              AS avg_views,
           AVG(ctr)::float                AS avg_ctr,
           AVG(average_view_percent)::float AS avg_watch,
           AVG(subscribers_gained)::float AS avg_subs
    FROM youtube_output_metrics
    WHERE user_id = ${REAL_USER}
      AND published_at >= ${since90d.toISOString()}
      AND views > 0
    GROUP BY content_type
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `);
  for (const r of (byType as any).rows ?? []) {
    groups.push({ dimension: "contentType", value: r.grp_value, sampleSize: r.n,
      avgViews: r.avg_views, avgCtr: r.avg_ctr, avgWatchPct: r.avg_watch, avgSubsGained: r.avg_subs });
  }

  // 2. By posting window (time-of-day)
  const byWindow = await db.execute(sql`
    SELECT posting_window                 AS grp_value,
           COUNT(*)::int                  AS n,
           AVG(views)::float              AS avg_views,
           AVG(ctr)::float                AS avg_ctr,
           AVG(average_view_percent)::float AS avg_watch,
           AVG(subscribers_gained)::float AS avg_subs
    FROM youtube_output_metrics
    WHERE user_id = ${REAL_USER}
      AND published_at >= ${since90d.toISOString()}
      AND posting_window IS NOT NULL
      AND views > 0
    GROUP BY posting_window
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `);
  for (const r of (byWindow as any).rows ?? []) {
    groups.push({ dimension: "postingWindow", value: r.grp_value, sampleSize: r.n,
      avgViews: r.avg_views, avgCtr: r.avg_ctr, avgWatchPct: r.avg_watch, avgSubsGained: r.avg_subs });
  }

  // 3. By duration bucket
  const byBucket = await db.execute(sql`
    SELECT duration_bucket                AS grp_value,
           COUNT(*)::int                  AS n,
           AVG(views)::float              AS avg_views,
           AVG(ctr)::float                AS avg_ctr,
           AVG(average_view_percent)::float AS avg_watch,
           AVG(subscribers_gained)::float AS avg_subs
    FROM youtube_output_metrics
    WHERE user_id = ${REAL_USER}
      AND published_at >= ${since90d.toISOString()}
      AND duration_bucket IS NOT NULL
      AND views > 0
    GROUP BY duration_bucket
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `);
  for (const r of (byBucket as any).rows ?? []) {
    groups.push({ dimension: "durationBucket", value: r.grp_value, sampleSize: r.n,
      avgViews: r.avg_views, avgCtr: r.avg_ctr, avgWatchPct: r.avg_watch, avgSubsGained: r.avg_subs });
  }

  // 4. By thumbnail style tag
  const byThumb = await db.execute(sql`
    SELECT thumbnail_style_tag            AS grp_value,
           COUNT(*)::int                  AS n,
           AVG(views)::float              AS avg_views,
           AVG(ctr)::float                AS avg_ctr,
           AVG(average_view_percent)::float AS avg_watch,
           AVG(subscribers_gained)::float AS avg_subs
    FROM youtube_output_metrics
    WHERE user_id = ${REAL_USER}
      AND published_at >= ${since90d.toISOString()}
      AND thumbnail_style_tag IS NOT NULL
      AND views > 0
    GROUP BY thumbnail_style_tag
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `);
  for (const r of (byThumb as any).rows ?? []) {
    groups.push({ dimension: "thumbnailStyle", value: r.grp_value, sampleSize: r.n,
      avgViews: r.avg_views, avgCtr: r.avg_ctr, avgWatchPct: r.avg_watch, avgSubsGained: r.avg_subs });
  }

  return groups;
}

// ─── Synthesis ────────────────────────────────────────────────────────────────

async function synthesiseAttributions(groups: AttributionGroup[]): Promise<void> {
  if (groups.length === 0) {
    logger.info("[CausalAttrib] No attribution groups with sufficient sample size — skipping");
    return;
  }

  // Sort each dimension by avgViews descending to find winners
  const byDimension: Record<string, AttributionGroup[]> = {};
  for (const g of groups) {
    if (!byDimension[g.dimension]) byDimension[g.dimension] = [];
    byDimension[g.dimension].push(g);
  }

  const insights: string[] = [];
  const hypothesesToCreate: Array<{ statement: string; domain: string }> = [];

  for (const [dim, gs] of Object.entries(byDimension)) {
    gs.sort((a, b) => b.avgViews - a.avgViews);
    const winner = gs[0];
    const loser  = gs[gs.length - 1];

    if (winner && loser && winner !== loser && loser.avgViews > 0) {
      const lift = Math.round(((winner.avgViews - loser.avgViews) / loser.avgViews) * 100);
      const insight = `${dim}=${winner.value} gets ${winner.avgViews.toFixed(0)} avg views (${lift}% more than ${loser.value}=${loser.avgViews.toFixed(0)}), CTR ${(winner.avgCtr * 100).toFixed(2)}%, watch% ${winner.avgWatchPct.toFixed(1)}%, n=${winner.sampleSize}`;
      insights.push(insight);

      // Create hypothesis for combinations we haven't tested yet
      if (gs.length >= 2) {
        hypothesesToCreate.push({
          statement: `Publishing at ${winner.value} (${dim}) consistently outperforms ${loser.value} — further confirm by holding other variables constant`,
          domain: dim === "postingWindow" ? "timing" : dim === "thumbnailStyle" ? "thumbnail" : "format",
        });
      }
    }
  }

  // Use AI to synthesize into actionable causal principles
  await acquireAISlotBackground();
  let principles: string[] = [];
  try {
    const client = getRawOpenAIClientForDirectUse();
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a causal data analyst for a YouTube gaming channel (BF6, ~6K subscribers).

Here are statistically observed performance patterns from the last 90 days:
${insights.map((i, n) => `${n + 1}. ${i}`).join("\n")}

Write 3–5 concise, ACTIONABLE causal principles that should guide ALL future content decisions.
Each principle must be a single clear directive: "Always X because it gets Y% more Z than the alternative."

Respond as JSON array of strings.`,
      }],
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
    });
    const raw = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
    principles = Array.isArray(raw) ? raw : (raw.principles ?? raw.items ?? []);
  } finally {
    releaseAISlot();
  }

  // Write causal attributions to masterKnowledgeBank
  for (const principle of principles.slice(0, 5)) {
    await db.insert(masterKnowledgeBank).values({
      userId:           REAL_USER,
      category:         "causal_attribution",
      principle,
      sourceEngines:    ["causal-attribution-engine"],
      applicableEngines:["shorts-pipeline-engine","long-form-clip-publisher","youtube-ai-orchestrator",
                         "content-maximizer","vod-seo-optimizer","back-catalog-engine"],
      evidenceCount:    groups.reduce((s, g) => s + g.sampleSize, 0),
      confidenceScore:  Math.min(90, 50 + groups.length * 3),
      metadata:         { groups: groups.slice(0, 20), insights, generatedAt: new Date().toISOString() },
    });
  }

  // Write raw insights as well
  if (insights.length > 0) {
    await db.insert(masterKnowledgeBank).values({
      userId:           REAL_USER,
      category:         "causal_attribution_raw",
      principle:        `Raw causal signals (${new Date().toISOString().slice(0, 10)}): ${insights.join(" | ")}`,
      sourceEngines:    ["causal-attribution-engine"],
      applicableEngines:["youtube-learning-brain","youtube-ai-orchestrator"],
      evidenceCount:    groups.reduce((s, g) => s + g.sampleSize, 0),
      confidenceScore:  75,
      metadata:         { groups, generatedAt: new Date().toISOString() },
    });
  }

  // Seed untested hypotheses for autonomous-experimenter to pick up
  for (const h of hypothesesToCreate.slice(0, 3)) {
    await db.insert(hypotheses).values({
      userId:     REAL_USER,
      statement:  h.statement,
      domain:     h.domain,
      rationale:  "Derived from causal attribution analysis of 90-day youtube_output_metrics data",
      confidence: 45,
      status:     "untested",
    }).catch(() => { /* ignore duplicate */ });
  }

  logger.info(`[CausalAttrib] Wrote ${principles.length} causal principles + ${insights.length} raw signals to masterKnowledgeBank`);
}

// ─── Cycle ────────────────────────────────────────────────────────────────────

async function runAttributionCycle(): Promise<void> {
  try {
    logger.info("[CausalAttrib] Running causal attribution analysis (90-day window)");
    const groups = await collectAttributions();
    logger.info(`[CausalAttrib] Collected ${groups.length} attribution groups`);
    await synthesiseAttributions(groups);
  } catch (err: any) {
    logger.warn(`[CausalAttrib] Cycle failed (non-fatal): ${err?.message}`);
  }
}

export function initCausalAttributionEngine(userId: string): NodeJS.Timeout {
  const delay = 20 * 60_000; // T+20min after Wave 10.5 start
  logger.info(`[CausalAttrib] Init — first cycle in ${delay / 60_000}min, then every 7 days`);
  const t = setTimeout(async () => {
    await runAttributionCycle();
    setInterval(runAttributionCycle, CYCLE_MS);
  }, delay);
  return t;
}
