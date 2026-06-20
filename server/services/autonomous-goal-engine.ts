/**
 * Autonomous Goal Engine
 *
 * Sets and evolves channel growth goals without any human input.
 * Reads real performance trajectory from youtube_output_metrics, computes
 * what the channel can realistically achieve, creates/revises improvementGoals
 * autonomously, and writes strategic intent to masterKnowledgeBank so every
 * downstream AI call knows what the system is optimising toward.
 *
 * Runs every 24 h (Wave 10.5).
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  improvementGoals,
  youtubeOutputMetrics,
  backCatalogVideos,
} from "@shared/schema";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { acquireAISlotBackground, releaseAISlot } from "../lib/ai-semaphore";
import { getRawOpenAIClientForDirectUse } from "../lib/openai";

const logger = createLogger("autonomous-goal-engine");
const CYCLE_MS  = 24 * 60 * 60_000;
const REAL_USER = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

// ─── Performance snapshot ─────────────────────────────────────────────────────

interface PerfSnapshot {
  totalPublished: number;
  avgViewsLast30d: number;
  avgCtrLast30d: number;
  avgWatchPctLast30d: number;
  subsGainedLast30d: number;
  bf6MinedPct: number;       // 0–1: how exhausted is the BF6 catalog?
  velocityTrend: "growing" | "flat" | "declining";
}

async function getPerformanceSnapshot(): Promise<PerfSnapshot> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  const [metrics, catalogCount, minedCount] = await Promise.all([
    db.select({
      totalPublished: count(),
      avgViews:       sql<number>`AVG(views)`,
      avgCtr:         sql<number>`AVG(ctr)`,
      avgWatchPct:    sql<number>`AVG(average_view_percent)`,
      subsGained:     sql<number>`SUM(subscribers_gained)`,
    }).from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, REAL_USER),
        gte(youtubeOutputMetrics.publishedAt, since30d),
      )),

    db.select({ n: count() }).from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, REAL_USER)),

    db.select({ n: count() }).from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, REAL_USER),
        sql`(short_mined_at IS NOT NULL OR long_form_mined_at IS NOT NULL)`,
      )),
  ]);

  const m    = metrics[0];
  const tot  = catalogCount[0]?.n ?? 0;
  const mined = minedCount[0]?.n ?? 0;

  // Simple trend: compare first-15d avg vs last-15d avg within the 30d window
  const mid15d = new Date(Date.now() - 15 * 24 * 60 * 60_000);
  const [early, late] = await Promise.all([
    db.select({ avg: sql<number>`AVG(views)` }).from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, REAL_USER),
        gte(youtubeOutputMetrics.publishedAt, since30d),
        sql`published_at < ${mid15d.toISOString()}`,
      )),
    db.select({ avg: sql<number>`AVG(views)` }).from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, REAL_USER),
        gte(youtubeOutputMetrics.publishedAt, mid15d),
      )),
  ]);

  const earlyAvg = Number(early[0]?.avg ?? 0);
  const lateAvg  = Number(late[0]?.avg ?? 0);
  let trend: PerfSnapshot["velocityTrend"] = "flat";
  if (lateAvg > earlyAvg * 1.15) trend = "growing";
  if (lateAvg < earlyAvg * 0.85) trend = "declining";

  return {
    totalPublished:   Number(m?.totalPublished ?? 0),
    avgViewsLast30d:  Math.round(Number(m?.avgViews ?? 0)),
    avgCtrLast30d:    Number((m?.avgCtr ?? 0)).toFixed(3) as unknown as number,
    avgWatchPctLast30d: Number((m?.avgWatchPct ?? 0)).toFixed(1) as unknown as number,
    subsGainedLast30d:  Number(m?.subsGained ?? 0),
    bf6MinedPct:      tot > 0 ? mined / tot : 0,
    velocityTrend:    trend,
  };
}

// ─── Goal synthesis ───────────────────────────────────────────────────────────

async function synthesiseGoals(snap: PerfSnapshot): Promise<void> {
  await acquireAISlotBackground();
  let client: ReturnType<typeof getRawOpenAIClientForDirectUse> | null = null;
  try {
    client = getRawOpenAIClientForDirectUse();

    const prompt = `You are the autonomous goal engine for a YouTube channel (ET Gaming 274, BF6 gameplay, ~6,140 subscribers).

Current 30-day performance:
- Published: ${snap.totalPublished} videos
- Avg views/video: ${snap.avgViewsLast30d}
- Avg CTR: ${(snap.avgCtrLast30d * 100).toFixed(2)}%
- Avg watch %: ${snap.avgWatchPctLast30d}%
- Subscribers gained: ${snap.subsGainedLast30d}
- BF6 catalog mined: ${Math.round(snap.bf6MinedPct * 100)}%
- Growth trend: ${snap.velocityTrend}

Set 3–5 specific, measurable, achievable goals for the next 30 days.
Each goal must have: metric, currentValue, targetValue, unit, rationale.

Respond as JSON array:
[
  { "metric": "avg_views_per_video", "title": "...", "currentValue": N, "targetValue": N, "unit": "views", "rationale": "..." },
  ...
]
Only output valid JSON.`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let goals: Array<{
      metric: string; title: string; currentValue: number;
      targetValue: number; unit: string; rationale: string;
    }> = [];
    try {
      const parsed = JSON.parse(raw);
      goals = Array.isArray(parsed) ? parsed : (parsed.goals ?? []);
    } catch { return; }

    // Upsert each goal — if an active goal of the same metric exists, update it
    for (const g of goals.slice(0, 5)) {
      const existing = await db.select({ id: improvementGoals.id })
        .from(improvementGoals)
        .where(and(
          eq(improvementGoals.userId, REAL_USER),
          eq(improvementGoals.targetMetric, g.metric),
          eq(improvementGoals.status, "active"),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(improvementGoals)
          .set({
            targetValue: g.targetValue,
            currentValue: g.currentValue,
            reflectionOnProgress: g.rationale,
            updatedAt: new Date(),
          })
          .where(eq(improvementGoals.id, existing[0].id));
      } else {
        await db.insert(improvementGoals).values({
          userId:       REAL_USER,
          goalType:     "channel_growth",
          title:        g.title,
          description:  g.rationale,
          targetMetric: g.metric,
          currentValue: g.currentValue,
          targetValue:  g.targetValue,
          unit:         g.unit,
          status:       "active",
          progress:     g.targetValue > 0 ? Math.min(1, g.currentValue / g.targetValue) : 0,
        });
      }
    }

    // Write strategic intent to masterKnowledgeBank
    const summary = goals.map(g => `${g.metric}: ${g.currentValue}→${g.targetValue} ${g.unit}`).join("; ");
    await db.insert(masterKnowledgeBank).values({
      userId:           REAL_USER,
      category:         "autonomous_goal",
      principle:        `Active growth targets (${new Date().toISOString().slice(0, 10)}): ${summary}. Trend: ${snap.velocityTrend}. BF6 catalog: ${Math.round(snap.bf6MinedPct * 100)}% mined.`,
      sourceEngines:    ["autonomous-goal-engine"],
      applicableEngines:["youtube-ai-orchestrator","back-catalog-runner","shorts-pipeline-engine","content-maximizer"],
      evidenceCount:    snap.totalPublished,
      confidenceScore:  snap.totalPublished > 20 ? 80 : 55,
      metadata:         { goals, snap, generatedAt: new Date().toISOString() },
    });

    logger.info(`[AutonomousGoal] Set/updated ${goals.length} goals — trend: ${snap.velocityTrend}, BF6 mined: ${Math.round(snap.bf6MinedPct * 100)}%`);

    // Flag catalog exhaustion so content-expansion-engine can pick it up
    if (snap.bf6MinedPct >= 0.85) {
      const existing = await db.select({ id: masterKnowledgeBank.id })
        .from(masterKnowledgeBank)
        .where(and(
          eq(masterKnowledgeBank.userId, REAL_USER),
          eq(masterKnowledgeBank.category, "catalog_exhaustion_signal"),
          eq(masterKnowledgeBank.isActive, true),
        ))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(masterKnowledgeBank).values({
          userId:           REAL_USER,
          category:         "catalog_exhaustion_signal",
          principle:        `BF6 back catalog is ${Math.round(snap.bf6MinedPct * 100)}% mined. Content expansion should be evaluated.`,
          sourceEngines:    ["autonomous-goal-engine"],
          applicableEngines:["content-expansion-engine","back-catalog-runner"],
          confidenceScore:  85,
          metadata:         { bf6MinedPct: snap.bf6MinedPct, detectedAt: new Date().toISOString() },
        });
        logger.warn("[AutonomousGoal] BF6 catalog ≥85% mined — expansion signal written");
      }
    }
  } finally {
    releaseAISlot();
  }
}

// ─── Cycle ────────────────────────────────────────────────────────────────────

async function runGoalCycle(): Promise<void> {
  try {
    const snap = await getPerformanceSnapshot();
    if (snap.totalPublished === 0) {
      logger.info("[AutonomousGoal] No published videos yet — skipping goal synthesis");
      return;
    }
    await synthesiseGoals(snap);
  } catch (err: any) {
    logger.warn(`[AutonomousGoal] Cycle failed (non-fatal): ${err?.message}`);
  }
}

export function initAutonomousGoalEngine(userId: string): NodeJS.Timeout {
  const delay = 8 * 60_000; // T+8min after Wave 10.5 start
  logger.info(`[AutonomousGoal] Init — first cycle in ${delay / 60_000}min, then every 24h`);
  const t = setTimeout(async () => {
    await runGoalCycle();
    setInterval(runGoalCycle, CYCLE_MS);
  }, delay);
  return t;
}
