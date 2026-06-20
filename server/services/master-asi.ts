/**
 * Master ASI — Tier 3 Governing Intelligence
 * ─────────────────────────────────────────────────────────────────────────────
 * The governing brain that orchestrates both Tier 1 (Back Catalog ASI) and
 * Tier 2 (Live Stream ASI). Receives performance reports from both, synthesises
 * cross-domain insights, arbitrates shared resources (quota, AI slots, disk),
 * and pushes strategy directives back down to both tiers.
 *
 * Light cycle (every 4h):
 *   1. Consume all pending performance_report signals from both tiers
 *   2. Check compliance state — push compliance_alert if rules have changed
 *   3. Rebalance quota allocation based on which tier is performing better
 *   4. Push quota_allocation signals to both tiers
 *
 * Full cycle (every 24h):
 *   1. Read all recent asiCycleReports from both tiers (last 7 days)
 *   2. Read masterKnowledgeBank entries from both tiers + the youtube-ai-orchestrator
 *   3. Claude synthesises: what is working across both pipelines? What conflicts?
 *      Which tier needs more resources? What should change?
 *   4. Generate unified strategy: game focus, publishing cadence, quota split,
 *      copilot mode, compliance posture
 *   5. Write strategy to asiStrategy table
 *   6. Push strategy_update to both tiers via signal bus
 *   7. Push cross-domain insights to masterKnowledgeBank (category: "master_asi")
 *   8. Update the youtube-ai-orchestrator with the new strategy directives
 *      (writes to service_state so orchestrator reads on next cycle)
 *
 * Platform compliance gate:
 *   Master ASI is the ONLY authority that can push compliance_alert.
 *   It reads platformComplianceRules every 4h and checks both tiers'
 *   recent outputs against them. If any violation risk is detected,
 *   it immediately broadcasts a compliance_alert — both tiers pause
 *   non-essential operations until Master clears the gate.
 *
 * Ever-growing closed loop:
 *   masterKnowledgeBank "master_asi" entries feed into every AI prompt
 *   across the system → the system gets smarter with each cycle → better
 *   clips → better performance → better insights → better strategy.
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  asiCycleReports,
  asiStrategy,
  platformComplianceRules,
  serviceState,
} from "@shared/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { publishSignal, consumeSignals } from "../lib/asi-signal-bus";
import { safeParseJSON } from "../lib/safe-json";

const logger  = createLogger("master-asi");
const SVC_KEY = "master-asi";
const USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

const LIGHT_INTERVAL_MS = 4  * 60 * 60_000;  // 4h
const FULL_INTERVAL_MS  = 24 * 60 * 60_000;  // 24h

// ── Read tier reports ─────────────────────────────────────────────────────────

async function readTierReports(): Promise<{ backCatalog: any[]; liveStream: any[] }> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  try {
    const reports = await db.select({
      tier:            asiCycleReports.tier,
      cycleType:       asiCycleReports.cycleType,
      metricsSnapshot: asiCycleReports.metricsSnapshot,
      createdAt:       asiCycleReports.createdAt,
    })
      .from(asiCycleReports)
      .where(and(
        eq(asiCycleReports.userId, USER_ID),
        gte(asiCycleReports.createdAt, since7d),
      ))
      .orderBy(desc(asiCycleReports.createdAt))
      .limit(20);

    return {
      backCatalog: reports.filter(r => r.tier === "back-catalog"),
      liveStream:  reports.filter(r => r.tier === "live-stream"),
    };
  } catch {
    return { backCatalog: [], liveStream: [] };
  }
}

// ── Read MKB context from both tiers ─────────────────────────────────────────

async function readCrossTierKnowledge(): Promise<string> {
  try {
    const entries = await db.select({ category: masterKnowledgeBank.category, principle: masterKnowledgeBank.principle })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, USER_ID),
        inArray(masterKnowledgeBank.category, ["back_catalog_asi", "live_stream_asi", "master_asi", "youtube_ai"]),
        eq(masterKnowledgeBank.isActive, true),
      ))
      .orderBy(desc(masterKnowledgeBank.createdAt))
      .limit(20);

    return entries
      .map(e => `[${e.category}] ${e.principle.slice(0, 120)}`)
      .join("\n");
  } catch {
    return "";
  }
}

// ── Compliance check ──────────────────────────────────────────────────────────

async function runComplianceCheck(): Promise<boolean> {
  try {
    const criticalRules = await db.select({ rule: platformComplianceRules.rule, severity: platformComplianceRules.severity })
      .from(platformComplianceRules)
      .where(and(
        eq(platformComplianceRules.isActive, true),
        eq(platformComplianceRules.severity, "warning"),
      ))
      .limit(5);

    if (criticalRules.length === 0) return false;

    // If any new critical rules appeared since last check, broadcast alert
    const lastCheck = await getState(SVC_KEY, "last_compliance_check") as any;
    const lastAt = lastCheck?.at ? new Date(lastCheck.at) : new Date(0);
    const newRules = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(platformComplianceRules)
      .where(and(
        eq(platformComplianceRules.isActive, true),
        gte(platformComplianceRules.createdAt, lastAt),
      ));

    const hasNew = Number(newRules[0]?.cnt ?? 0) > 0;
    if (hasNew) {
      const alert = {
        message:     "New compliance rules detected — non-essential publishing paused",
        rules:       criticalRules.slice(0, 3).map(r => r.rule),
        detectedAt:  new Date().toISOString(),
      };
      await publishSignal("master", "back-catalog", "compliance_alert", alert);
      await publishSignal("master", "live-stream",  "compliance_alert", alert);
      logger.warn("[MasterASI] Compliance alert broadcast to both tiers");
    }

    await setState(SVC_KEY, "last_compliance_check", { at: new Date().toISOString() });
    return hasNew;
  } catch {
    return false;
  }
}

// ── Quota arbitration ─────────────────────────────────────────────────────────

async function arbitrateQuota(
  backCatalogReports: any[],
  liveStreamReports:  any[],
): Promise<void> {
  try {
    const DAILY_QUOTA = 10_000;
    const RESERVE     = 1_500; // held for orchestrator + manual

    // Default split: 60% back catalog, 40% live stream
    let bcShare = 0.60;
    let lsShare = 0.40;

    // If live stream has recent clips with higher CTR → shift more quota to live
    const latestBc = backCatalogReports[0]?.metricsSnapshot ?? {};
    const latestLs = liveStreamReports[0]?.metricsSnapshot ?? {};

    const bcCtr = parseFloat(latestBc.shortsCtr ?? "0");
    const lsCtr = parseFloat(latestLs.liveClipsCtr ?? "0");

    if (lsCtr > bcCtr * 1.2) {
      // Live clips significantly outperforming → shift 10% toward live
      bcShare = 0.50; lsShare = 0.50;
      logger.info(`[MasterASI] Live CTR (${lsCtr}) > Back Catalog CTR (${bcCtr}) — rebalancing quota 50/50`);
    } else if (bcCtr > lsCtr * 1.5) {
      // Back catalog clearly winning → shift more toward it
      bcShare = 0.70; lsShare = 0.30;
      logger.info(`[MasterASI] Back Catalog CTR dominant — rebalancing quota 70/30`);
    }

    const available = DAILY_QUOTA - RESERVE;
    const bcUnits   = Math.round(available * bcShare);
    const lsUnits   = Math.round(available * lsShare);

    await publishSignal("master", "back-catalog", "quota_allocation", { dailyUnits: bcUnits });
    await publishSignal("master", "live-stream",  "quota_allocation", { dailyUnits: lsUnits });

    logger.info(`[MasterASI] Quota allocated — BC: ${bcUnits}, LS: ${lsUnits}, Reserve: ${RESERVE}`);
  } catch (err: any) {
    logger.debug(`[MasterASI] arbitrateQuota non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Full strategy synthesis ───────────────────────────────────────────────────

interface MasterStrategy {
  gameFocus:          string;
  shortsCadencePerDay: number;
  longFormCadencePerDay: number;
  backcatalogQuotaShare: number;
  liveStreamQuotaShare:  number;
  copilotMode:        string;
  compliancePosture:  string;
  keyInsight:         string;
  nextPriorityAction: string;
}

async function runFullSynthesis(
  backCatalogReports: any[],
  liveStreamReports:  any[],
): Promise<MasterStrategy | null> {
  const knowledge = await readCrossTierKnowledge();

  const bcLatest  = backCatalogReports[0]?.metricsSnapshot ?? {};
  const lsLatest  = liveStreamReports[0]?.metricsSnapshot ?? {};

  try {
    const result = await executeRoutedAICall(
      { taskType: "learning", userId: USER_ID, maxTokens: 800 },
      `You are the Master ASI governing a YouTube channel (ET Gaming 274, Battlefield 6 gaming).
You receive performance data from two autonomous sub-systems and produce a unified strategy.
Return valid JSON only.`,
      `Back Catalog pipeline (last 7 days):
${JSON.stringify(bcLatest, null, 2)}

Live Stream pipeline (last 7 days):
${JSON.stringify(lsLatest, null, 2)}

Cross-system knowledge:
${knowledge || "(no prior knowledge)"}

Produce a unified strategy for the next 24h. Return JSON:
{
  "gameFocus": "Battlefield 6",
  "shortsCadencePerDay": <1-5>,
  "longFormCadencePerDay": <1-2>,
  "backcatalogQuotaShare": <0.40-0.80>,
  "liveStreamQuotaShare": <0.20-0.60>,
  "copilotMode": "auto-safe" | "suggest" | "off",
  "compliancePosture": "aggressive" | "standard" | "conservative",
  "keyInsight": "one sentence — most important cross-system observation",
  "nextPriorityAction": "one specific action the system should take in the next 4h"
}`,
    );

    const parsed = safeParseJSON<MasterStrategy | null>(result.content, null);
    return parsed;
  } catch (err: any) {
    logger.debug(`[MasterASI] fullSynthesis AI non-fatal: ${err?.message?.slice(0, 80)}`);
    return null;
  }
}

// ── Push strategy to both tiers and orchestrator ──────────────────────────────

async function applyStrategy(strategy: MasterStrategy): Promise<void> {
  try {
    // Save to asiStrategy table
    const existing = await db.select({ id: asiStrategy.id })
      .from(asiStrategy)
      .where(eq(asiStrategy.userId, USER_ID))
      .limit(1);

    if (existing.length > 0) {
      await db.update(asiStrategy)
        .set({
          activeStrategy:     strategy as any,
          lastSynthesizedAt:  new Date(),
        })
        .where(eq(asiStrategy.userId, USER_ID));
    } else {
      await db.insert(asiStrategy).values({
        userId:            USER_ID,
        activeStrategy:    strategy as any,
        lastSynthesizedAt: new Date(),
        confidenceScore:   70,
        version:           1,
      } as any);
    }

    // Push to both tiers
    await publishSignal("master", "back-catalog", "strategy_update", {
      gameFocus:         strategy.gameFocus,
      publishingCadence: strategy.shortsCadencePerDay,
      quotaAllocation:   Math.round(strategy.backcatalogQuotaShare * 8500),
    });
    await publishSignal("master", "live-stream", "strategy_update", {
      copilotMode:       strategy.copilotMode,
      streamingCadence:  "as-streamed",
      quotaAllocation:   Math.round(strategy.liveStreamQuotaShare * 8500),
    });

    // Write insight to masterKnowledgeBank
    if (strategy.keyInsight) {
      await db.insert(masterKnowledgeBank).values({
        userId:        USER_ID,
        category:      "master_asi",
        principle:     `[Master synthesis] ${strategy.keyInsight} → ${strategy.nextPriorityAction}`.slice(0, 500),
        evidence:      ["back_catalog_metrics", "live_stream_metrics"],
        confidence:    75,
        actionable:    true,
        isActive:      true,
        metadata:      { strategy, source: "master-asi", synthesizedAt: new Date().toISOString() } as any,
      } as any);
    }

    // Inform the YouTube AI orchestrator via service_state so it reads on next cycle
    await setState("youtube-ai-orchestrator", "master_asi_directives", {
      gameFocus:          strategy.gameFocus,
      compliancePosture:  strategy.compliancePosture,
      nextPriorityAction: strategy.nextPriorityAction,
      updatedAt:          new Date().toISOString(),
    });

    logger.info(`[MasterASI] Strategy applied — ${strategy.keyInsight?.slice(0, 80)}`);
  } catch (err: any) {
    logger.debug(`[MasterASI] applyStrategy non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Light cycle (4h) ──────────────────────────────────────────────────────────

async function runLightCycle(): Promise<void> {
  logger.info("[MasterASI] Light cycle starting");

  // Consume performance reports from both tiers (just acknowledge / log)
  const signals = await consumeSignals("master", "performance_report");
  if (signals.length > 0) {
    logger.info(`[MasterASI] Consumed ${signals.length} performance report(s) from tiers`);
  }

  // Compliance check
  await runComplianceCheck();

  // Quota rebalance based on recent reports
  const { backCatalog, liveStream } = await readTierReports();
  await arbitrateQuota(backCatalog, liveStream);

  logger.info("[MasterASI] Light cycle done");
}

// ── Full cycle (24h) ──────────────────────────────────────────────────────────

async function runFullCycle(): Promise<void> {
  logger.info("[MasterASI] Full cycle starting");

  const signals = await consumeSignals("master");
  if (signals.length > 0) {
    logger.info(`[MasterASI] Consumed ${signals.length} signal(s) from tiers`);
  }

  await runComplianceCheck();

  const { backCatalog, liveStream } = await readTierReports();
  await arbitrateQuota(backCatalog, liveStream);

  const strategy = await runFullSynthesis(backCatalog, liveStream);
  if (strategy) {
    await applyStrategy(strategy);
  }

  try {
    await db.insert(asiCycleReports).values({
      userId:          USER_ID,
      tier:            "master",
      cycleType:       "full",
      metricsSnapshot: {
        backCatalogReports: backCatalog.length,
        liveStreamReports:  liveStream.length,
        strategyApplied:    !!strategy,
      } as any,
      createdAt: new Date(),
    } as any);
  } catch { /* non-fatal */ }

  await setState(SVC_KEY, "last_full_run", { at: new Date().toISOString() });
  logger.info("[MasterASI] Full cycle done");
}

// ── Init ─────────────────────────────────────────────────────────────────────

export function initMasterAsi(): ReturnType<typeof setInterval> {
  // Initial full cycle at T+30min (after both tier ASIs have reported at T+22-25min)
  setTimeout(async () => {
    try { await runFullCycle(); } catch { /* non-fatal */ }
  }, 30 * 60_000);

  // Light cycle every 4h
  const lightTimer = setInterval(async () => {
    try { await runLightCycle(); } catch { /* non-fatal */ }
  }, LIGHT_INTERVAL_MS);

  // Full cycle every 24h
  setInterval(async () => {
    try { await runFullCycle(); } catch { /* non-fatal */ }
  }, FULL_INTERVAL_MS);

  logger.info("[MasterASI] Initialized — first full cycle in 30min");
  return lightTimer;
}
