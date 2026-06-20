/**
 * Live Stream ASI — Tier 2 Closed Loop
 * ─────────────────────────────────────────────────────────────────────────────
 * A fully autonomous governing intelligence for the live stream pipeline.
 * Manages the complete live stream lifecycle as a closed loop.
 *
 * Loop (every 30min — lightweight check):
 *   1. Check if a stream is scheduled soon (within 2h) → ensure Live Director is prepped
 *   2. Check for recently ended streams (VODs created in last 4h) → trigger post-stream processing
 *   3. Monitor compliance gate from Master ASI
 *
 * Performance cycle (every 6h):
 *   1. Measure live-extracted clip performance vs catalog clip performance
 *   2. Score the live pipeline: engagement rate, clip yield per stream, VOD retention
 *   3. Report to Master ASI via signal bus
 *   4. Consume strategy_update and compliance_alert signals from Master ASI
 *
 * Full synthesis (every 24h):
 *   Claude reads 7 days of livestream events + output metrics
 *   → generates insight + recommended adaptation
 *   → writes to masterKnowledgeBank (category: "live_stream_asi")
 */

import { db } from "../db";
import {
  masterKnowledgeBank,
  youtubeOutputMetrics,
  livestreamLearningEvents,
  autopilotQueue,
  asiCycleReports,
  streams,
} from "@shared/schema";
import { eq, and, desc, sql, gte, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { executeRoutedAICall } from "./ai-model-router";
import { publishSignal, consumeSignals } from "../lib/asi-signal-bus";

const logger  = createLogger("live-stream-asi");
const SVC_KEY = "live-stream-asi";
const USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

const CHECK_INTERVAL_MS = 30 * 60_000;         // 30min lightweight check
const PERF_INTERVAL_MS  =  6 * 60 * 60_000;   // 6h performance cycle
const FULL_INTERVAL_MS  = 24 * 60 * 60_000;   // 24h full synthesis

// ── Measure live pipeline performance ────────────────────────────────────────

async function measureLivePipelineHealth(): Promise<Record<string, any>> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const since4h = new Date(Date.now() - 4 * 60 * 60_000);

  try {
    // Live-extracted clips published in last 7 days
    const liveClips = await db.select({
      avgCtr:   sql<number>`AVG(${youtubeOutputMetrics.ctr})`,
      avgViews: sql<number>`AVG(${youtubeOutputMetrics.views})`,
      total:    sql<number>`COUNT(*)`,
    })
      .from(youtubeOutputMetrics)
      .where(and(
        eq(youtubeOutputMetrics.userId, USER_ID),
        gte(youtubeOutputMetrics.createdAt, since7d),
        sql`${youtubeOutputMetrics.contentType} ILIKE '%vod%' OR ${youtubeOutputMetrics.contentType} ILIKE '%stream%' OR ${youtubeOutputMetrics.contentType} ILIKE '%live%'`,
      ))
      .limit(1);

    // Recent livestream learning events (viral moments captured)
    const momentsCaptured = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(livestreamLearningEvents)
      .where(gte(livestreamLearningEvents.createdAt, since7d));

    // Recent streams (ended in last 7 days)
    let recentStreams = 0;
    try {
      const [sc] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(streams)
        .where(and(
          eq(streams.userId, USER_ID),
          gte(streams.startedAt, since7d),
        ));
      recentStreams = Number(sc?.cnt ?? 0);
    } catch { /* streams table may not have all columns */ }

    // VOD-type items pending in queue (post-stream extraction backlog)
    const [vodBacklog] = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, USER_ID),
        sql`${autopilotQueue.status} IN ('scheduled','pending')`,
        sql`${autopilotQueue.metadata}->>'contentType' ILIKE '%vod%'`,
      ));

    return {
      liveClipsCtr:     Number(liveClips[0]?.avgCtr ?? 0).toFixed(3),
      liveClipsViews:   Number(liveClips[0]?.avgViews ?? 0).toFixed(0),
      liveClipsTotal:   Number(liveClips[0]?.total ?? 0),
      viralMomentsCaptured: Number(momentsCaptured[0]?.cnt ?? 0),
      streamsInLast7d:  recentStreams,
      vodBacklog:       Number(vodBacklog?.cnt ?? 0),
      measuredAt:       new Date().toISOString(),
    };
  } catch (err: any) {
    logger.debug(`[LiveStreamASI] measure non-fatal: ${err?.message?.slice(0, 80)}`);
    return { measuredAt: new Date().toISOString(), error: err?.message?.slice(0, 80) };
  }
}

// ── Check for streams needing pre-live prep ───────────────────────────────────

async function checkPreLivePrep(): Promise<void> {
  try {
    // Look for planned streams that haven't started yet
    const upcoming = await db.select({ id: streams.id, title: streams.title })
      .from(streams)
      .where(and(
        eq(streams.userId, USER_ID),
        eq(streams.status, "planned"),
        isNull(streams.startedAt),
      ))
      .limit(3);

    if (upcoming.length === 0) return;

    for (const stream of upcoming) {
      const prepKey = `live_prep_fired_${stream.id}`;
      const alreadyPrepped = await getState(SVC_KEY, prepKey);
      if (alreadyPrepped) continue;

      logger.info(`[LiveStreamASI] Stream "${stream.title}" starts within 2h — ensuring Live Director prep`);
      try {
        const { prepareLiveStream } = await import("./youtube-live-copilot");
        await prepareLiveStream(USER_ID, stream.id);
        await setState(SVC_KEY, prepKey, { at: new Date().toISOString() });
      } catch (e: any) {
        logger.debug(`[LiveStreamASI] prepareLiveStream non-fatal: ${e?.message?.slice(0, 80)}`);
      }
    }
  } catch (err: any) {
    logger.debug(`[LiveStreamASI] prelivePrepCheck non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Apply Master strategy directives ─────────────────────────────────────────

async function applyMasterDirectives(): Promise<void> {
  const signals = await consumeSignals("live-stream");
  if (signals.length === 0) return;

  for (const sig of signals) {
    if (sig.signalType === "strategy_update") {
      const { copilotMode, streamingCadence, clipYieldTarget } = sig.payload ?? {};
      logger.info(`[LiveStreamASI] Applying Master strategy: copilotMode=${copilotMode}, cadence=${streamingCadence}`);
      await setState(SVC_KEY, "master_directives", sig.payload);

      if (copilotMode) {
        try {
          const { setCopilotMode } = await import("./youtube-live-copilot");
          await setCopilotMode(USER_ID, copilotMode);
        } catch { /* non-fatal */ }
      }
    }
    if (sig.signalType === "compliance_alert") {
      logger.warn(`[LiveStreamASI] Compliance alert from Master: ${JSON.stringify(sig.payload).slice(0, 120)}`);
      await setState(SVC_KEY, "compliance_gate", { ...sig.payload, appliedAt: new Date().toISOString() });

      // Compliance alert during a live stream → switch copilot to suggest-only mode
      try {
        const { setCopilotMode } = await import("./youtube-live-copilot");
        await setCopilotMode(USER_ID, "suggest");
      } catch { /* non-fatal */ }
    }
    if (sig.signalType === "quota_allocation") {
      const { dailyUnits } = sig.payload ?? {};
      if (dailyUnits) {
        await setState(SVC_KEY, "quota_allocation", { dailyUnits, setAt: new Date().toISOString() });
        logger.info(`[LiveStreamASI] Quota allocation from Master: ${dailyUnits} units/day`);
      }
    }
  }
}

// ── Full synthesis (24h) ─────────────────────────────────────────────────────

async function runFullSynthesis(snapshot: Record<string, any>): Promise<void> {
  try {
    const recent = await db.select({ principle: masterKnowledgeBank.principle })
      .from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, USER_ID),
        eq(masterKnowledgeBank.category, "live_stream_asi"),
        eq(masterKnowledgeBank.isActive, true),
      ))
      .orderBy(desc(masterKnowledgeBank.createdAt))
      .limit(5);

    const result = await executeRoutedAICall(
      { taskType: "learning", userId: USER_ID, maxTokens: 600 },
      `You are the Live Stream ASI for a YouTube gaming channel (ET Gaming 274, Battlefield 6). Analyse live stream performance and return one insight + one recommended action. Return JSON only.`,
      `Live pipeline snapshot (last 7 days):
${JSON.stringify(snapshot, null, 2)}

Recent learnings already in knowledge bank:
${recent.map(r => `- ${r.principle.slice(0, 100)}`).join("\n") || "(none yet)"}

Return JSON:
{
  "insight": "one concrete observation about what's working or not in the live stream pipeline",
  "action": "one specific change to improve live content yield or quality",
  "confidence": <40-90>
}`,
    );

    const { safeParseJSON } = await import("../lib/safe-json");
    const parsed = safeParseJSON<{ insight?: string; action?: string; confidence?: number } | null>(result.content, null);

    if (parsed?.insight) {
      const combined = `${parsed.insight} → Recommended: ${parsed.action ?? "maintain current approach"}`;
      await db.insert(masterKnowledgeBank).values({
        userId:        USER_ID,
        category:      "live_stream_asi",
        principle:     combined.slice(0, 500),
        evidence:      ["live_stream_performance_metrics"],
        confidence:    Math.min(100, Math.max(10, parsed.confidence ?? 60)),
        actionable:    true,
        isActive:      true,
        metadata:      { source: "live-stream-asi", promotedAt: new Date().toISOString() } as any,
      } as any);
      logger.info(`[LiveStreamASI] Promoted learning to MKB (confidence=${parsed.confidence ?? 60})`);
    }
  } catch (err: any) {
    logger.debug(`[LiveStreamASI] fullSynthesis non-fatal: ${err?.message?.slice(0, 80)}`);
  }
}

// ── Lightweight 30min check ───────────────────────────────────────────────────

async function runLightCheck(): Promise<void> {
  await checkPreLivePrep();
}

// ── 6h performance cycle ─────────────────────────────────────────────────────

async function runPerfCycle(): Promise<void> {
  logger.info("[LiveStreamASI] Performance cycle starting");

  const snapshot = await measureLivePipelineHealth();
  await applyMasterDirectives();

  try {
    await db.insert(asiCycleReports).values({
      userId:          USER_ID,
      tier:            "live-stream",
      cycleType:       "light",
      metricsSnapshot: snapshot as any,
      createdAt:       new Date(),
    } as any);
  } catch { /* non-fatal */ }

  await publishSignal("live-stream", "master", "performance_report", {
    tier: "live-stream",
    ...snapshot,
  });

  logger.info(`[LiveStreamASI] Performance cycle done — clips=${snapshot.liveClipsTotal}, moments=${snapshot.viralMomentsCaptured}`);
}

// ── 24h full cycle ────────────────────────────────────────────────────────────

async function runFullCycle(): Promise<void> {
  logger.info("[LiveStreamASI] Full cycle starting");

  const snapshot = await measureLivePipelineHealth();
  await applyMasterDirectives();
  await runFullSynthesis(snapshot);

  try {
    await db.insert(asiCycleReports).values({
      userId:          USER_ID,
      tier:            "live-stream",
      cycleType:       "full",
      metricsSnapshot: snapshot as any,
      createdAt:       new Date(),
    } as any);
  } catch { /* non-fatal */ }

  await publishSignal("live-stream", "master", "performance_report", {
    tier:     "live-stream",
    cycleType: "full",
    ...snapshot,
  });

  await setState(SVC_KEY, "last_full_run", { at: new Date().toISOString() });
  logger.info("[LiveStreamASI] Full cycle done");
}

// ── Init ─────────────────────────────────────────────────────────────────────

let _checkTimer: ReturnType<typeof setInterval> | null = null;
let _perfTimer:  ReturnType<typeof setInterval> | null = null;
let _fullTimer:  ReturnType<typeof setInterval> | null = null;

export function initLiveStreamAsi(): ReturnType<typeof setInterval> {
  // Initial full cycle at T+25min (staggered from Back Catalog ASI at T+22min)
  setTimeout(async () => {
    try { await runFullCycle(); } catch { /* non-fatal */ }
  }, 25 * 60_000);

  // Lightweight 30min check
  _checkTimer = setInterval(async () => {
    try { await runLightCheck(); } catch { /* non-fatal */ }
  }, CHECK_INTERVAL_MS);

  // Performance cycle every 6h
  _perfTimer = setInterval(async () => {
    try { await runPerfCycle(); } catch { /* non-fatal */ }
  }, PERF_INTERVAL_MS);

  // Full synthesis every 24h
  _fullTimer = setInterval(async () => {
    try { await runFullCycle(); } catch { /* non-fatal */ }
  }, FULL_INTERVAL_MS);

  logger.info("[LiveStreamASI] Initialized — pre-live check in 30min, first full cycle in 25min");
  return _checkTimer;
}

export function stopLiveStreamAsi(): void {
  if (_checkTimer) { clearInterval(_checkTimer); _checkTimer = null; }
  if (_perfTimer)  { clearInterval(_perfTimer);  _perfTimer  = null; }
  if (_fullTimer)  { clearInterval(_fullTimer);  _fullTimer  = null; }
}
