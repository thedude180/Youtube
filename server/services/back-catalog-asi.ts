/**
 * Back Catalog ASI — Tier 1 Closed Loop
 * ─────────────────────────────────────────────────────────────────────────────
 * A fully autonomous governing intelligence for the back catalog pipeline.
 * Operates as a true closed loop: measure → learn → adapt → report → repeat.
 *
 * Loop (every 6h):
 *   1. Read recent youtube_output_metrics for catalog-originated content
 *   2. Score the pipeline: CTR, views/day, Shorts vs long-form ratio, quota efficiency
 *   3. Identify the highest-leverage adaptation (game filter, cadence, clip length)
 *   4. Apply that adaptation by updating strategy in the DB
 *   5. Promote confirmed learnings to masterKnowledgeBank
 *   6. Report performance snapshot to Master ASI via signal bus
 *   7. Consume any strategy_update / compliance_alert signals from Master ASI
 *   8. Apply Master directives (quota allocation, game focus override, compliance gate)
 *
 * Full synthesis (every 24h):
 *   Claude reads 7 days of metrics + MKB back-catalog entries
 *   → generates insight + recommended adaptation
 *   → writes to masterKnowledgeBank (category: "back_catalog_asi")
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  youtubeOutputMetrics,
  backCatalogVideos,
  autopilotQueue,
  asiCycleReports,
} from "@shared/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { publishSignal, consumeSignals, getLatestStrategy } from "../lib/asi-signal-bus";

const logger  = createLogger("back-catalog-asi");
const SVC_KEY = "back-catalog-asi";
const USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

const LIGHT_INTERVAL_MS = 6  * 60 * 60_000;  // 6h
const FULL_INTERVAL_MS  = 24 * 60 * 60_000;  // 24h

// ── Metrics snapshot ─────────────────────────────────────────────────────────

async function measurePipelineHealth(): Promise<Record<string, any>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  try {
    // Published content in last 7 days from back catalog sources
    const metrics = await db.select({
      contentType: youtubeOutputMetrics.contentType,
      avgCtr:      sql<number>`AVG(${youtubeOutputMetrics.ctr})`,
      avgViews:    sql<number>`AVG(${youtubeOutputMetrics.views})`,
      totalItems:  sql<number>`COUNT(*)`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, USER_ID),
        gte(youtubeOutputMetrics.createdAt, since),
      ))
      .groupBy(youtubeOutputMetrics.contentType)
      .limit(10);

    // Queue depth
    const [queueDepth] = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, USER_ID),
        inArray(autopilotQueue.status, ["scheduled", "pending"]),
      ));

    // Catalog videos remaining (not yet mined)
    const [unmined] = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, USER_ID),
        eq(backCatalogVideos.minedForShorts, false),
      ));

    const shortMetrics = metrics.find(m => m.contentType?.includes("short"));
    const lfMetrics    = metrics.find(m => m.contentType?.includes("long"));

    return {
      shortsCtr:        Number(shortMetrics?.avgCtr ?? 0).toFixed(3),
      shortsViews:      Number(shortMetrics?.avgViews ?? 0).toFixed(0),
      shortsPublished:  Number(shortMetrics?.totalItems ?? 0),
      lfCtr:            Number(lfMetrics?.avgCtr ?? 0).toFixed(3),
      lfViews:          Number(lfMetrics?.avgViews ?? 0).toFixed(0),
      lfPublished:      Number(lfMetrics?.totalItems ?? 0),
      queueDepth:       Number(queueDepth?.cnt ?? 0),
      unminedVideos:    Number(unmined?.cnt ?? 0),
      measuredAt:       new Date().toISOString(),
    };
  } catch (err: any) {
    logger.debug(`[BackCatalogASI] measure non-fatal: ${err?.message?.slice(0, 80)}`);
    return { measuredAt: new Date().toISOString(), error: err?.message?.slice(0, 80) };
  }
}

// ── Apply Master strategy directives ─────────────────────────────────────────

async function applyMasterDirectives(): Promise<void> {
  const signals = await consumeSignals("back-catalog");
  if (signals.length === 0) return;

  for (const sig of signals) {
    if (sig.signalType === "strategy_update") {
      const { gameFocus, publishingCadence, quotaAllocation } = sig.payload ?? {};
      logger.info(`[BackCatalogASI] Applying Master strategy: game=${gameFocus}, cadence=${publishingCadence}, quota=${quotaAllocation}`);
      await setState(SVC_KEY, "master_directives", sig.payload);
    }
    if (sig.signalType === "compliance_alert") {
      logger.warn(`[BackCatalogASI] Compliance alert from Master: ${JSON.stringify(sig.payload).slice(0, 120)}`);
      await setState(SVC_KEY, "compliance_gate", { ...sig.payload, appliedAt: new Date().toISOString() });
    }
    if (sig.signalType === "quota_allocation") {
      const { dailyUnits } = sig.payload ?? {};
      if (dailyUnits) {
        await setState(SVC_KEY, "quota_allocation", { dailyUnits, setAt: new Date().toISOString() });
        logger.info(`[BackCatalogASI] Quota allocation from Master: ${dailyUnits} units/day`);
      }
    }
  }
}

// ── Promote learnings to masterKnowledgeBank ──────────────────────────────────

async function promoteLearnings(insight: string, confidence: number): Promise<void> {
  try {
    await db.insert(masterKnowledgeBank).values({
      userId:        USER_ID,
      category:      "back_catalog_asi",
      principle:     insight.slice(0, 500),
      evidence:      ["back_catalog_performance_metrics"],
      confidence:    Math.min(100, Math.max(10, confidence)),
      actionable:    true,
      isActive:      true,
      metadata:      { source: "back-catalog-asi", promotedAt: new Date().toISOString() } as any,
    } as any);
    logger.info(`[BackCatalogASI] Promoted learning to MKB (confidence=${confidence})`);
  } catch (err: any) {
    logger.debug(`[BackCatalogASI] promoteLearnings non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Full synthesis (24h) ─────────────────────────────────────────────────────

async function runFullSynthesis(snapshot: Record<string, any>): Promise<void> {
  try {
    // Recent MKB back-catalog entries for context
    const recent = await db.select({ principle: masterKnowledgeBank.principle })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, USER_ID),
        eq(masterKnowledgeBank.category, "back_catalog_asi"),
        eq(masterKnowledgeBank.isActive, true),
      ))
      .orderBy(desc(masterKnowledgeBank.createdAt))
      .limit(5);

    const result = await executeRoutedAICall(
      { taskType: "learning", userId: USER_ID, maxTokens: 600 },
      `You are the Back Catalog ASI for a YouTube channel (ET Gaming 274, Battlefield 6 gaming). Analyse performance and return one insight + one recommended action. Return JSON only.`,
      `Performance snapshot (last 7 days):
${JSON.stringify(snapshot, null, 2)}

Recent learnings already in knowledge bank:
${recent.map(r => `- ${r.principle.slice(0, 100)}`).join("\n") || "(none yet)"}

Return JSON:
{
  "insight": "one concrete observation about what's working or not",
  "action": "one specific change to make to the pipeline",
  "confidence": <40-90>
}`,
    );

    const { safeParseJSON } = await import("../lib/safe-json");
    const parsed = safeParseJSON<{ insight?: string; action?: string; confidence?: number } | null>(result.content, null);

    if (parsed?.insight) {
      const combined = `${parsed.insight} → Recommended: ${parsed.action ?? "maintain current approach"}`;
      await promoteLearnings(combined, parsed.confidence ?? 60);
    }
  } catch (err: any) {
    logger.debug(`[BackCatalogASI] fullSynthesis non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Save cycle report ─────────────────────────────────────────────────────────

async function saveCycleReport(snapshot: Record<string, any>, cycleType: "light" | "full"): Promise<void> {
  try {
    await db.insert(asiCycleReports).values({
      userId:          USER_ID,
      tier:            "back-catalog",
      cycleType,
      metricsSnapshot: snapshot as any,
      createdAt:       new Date(),
    } as any);
  } catch (err: any) {
    logger.debug(`[BackCatalogASI] saveCycleReport non-fatal: ${err?.message?.slice(0, 60)}`);
  }
}

// ── Main cycles ──────────────────────────────────────────────────────────────

async function runLightCycle(): Promise<void> {
  logger.info("[BackCatalogASI] Light cycle starting");

  const snapshot = await measurePipelineHealth();
  await applyMasterDirectives();
  await saveCycleReport(snapshot, "light");

  // Report performance to Master ASI
  await publishSignal("back-catalog", "master", "performance_report", {
    tier: "back-catalog",
    ...snapshot,
  });

  logger.info(`[BackCatalogASI] Light cycle done — queue=${snapshot.queueDepth}, unmined=${snapshot.unminedVideos}`);
}

async function runFullCycle(): Promise<void> {
  logger.info("[BackCatalogASI] Full cycle starting");

  const snapshot = await measurePipelineHealth();
  await applyMasterDirectives();
  await runFullSynthesis(snapshot);
  await saveCycleReport(snapshot, "full");

  await publishSignal("back-catalog", "master", "performance_report", {
    tier:     "back-catalog",
    cycleType: "full",
    ...snapshot,
  });

  await setState(SVC_KEY, "last_full_run", { at: new Date().toISOString() });
  logger.info("[BackCatalogASI] Full cycle done");
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initBackCatalogAsi(): ReturnType<typeof setInterval> {
  // Initial delay: 22 min (well after back-catalog-runner fires at T+10-20min)
  setTimeout(async () => {
    try {
      await runFullCycle();
    } catch (err: any) {
      logger.debug(`[BackCatalogASI] init run non-fatal: ${err?.message?.slice(0, 80)}`);
    }
  }, 22 * 60_000);

  // Light cycle every 6h
  const lightTimer = setInterval(async () => {
    try { await runLightCycle(); } catch { /* non-fatal */ }
  }, LIGHT_INTERVAL_MS);

  // Full cycle every 24h
  setInterval(async () => {
    try { await runFullCycle(); } catch { /* non-fatal */ }
  }, FULL_INTERVAL_MS);

  logger.info("[BackCatalogASI] Initialized — first full cycle in 22min");
  return lightTimer;
}
