/**
 * brain-association-engine.ts
 *
 * The "aha moment" layer of the learning brain.
 *
 * Runs every 2 hours.  Reads what's happening externally (predictive trends,
 * niche video samples, gaming news signals) alongside what the channel's own
 * data says performs best (success DNA, master knowledge, recent metrics), and
 * uses AI to make cross-signal connections — generating real-time insights like:
 *
 *   "BF6 Season 3 just dropped + our best patch-drop format got 50k last time
 *    + it's been 2 days since we posted a patch Short → queue 3 Shorts NOW"
 *
 * Outputs are written to masterKnowledgeBank (category="association_insight")
 * and optionally to engineKnowledge for cross-pollination.
 *
 * This is the bridge between "the internet" and "what to create next."
 */

import { db } from "../db";
import {
  users, channels, predictiveTrends, nicheVideoSamples, youtubeOutputMetrics,
  channelSuccessDna, masterKnowledgeBank, intelligenceSignals,
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { getFocusGame } from "../lib/game-focus";
import { CommandCenter } from "../lib/command-center";
import { AIScheduler } from "../lib/ai-scheduler";
import { recordEngineKnowledge } from "./knowledge-mesh";

const logger = createLogger("brain-association");

const ASSOCIATION_CYCLE_MS = 2 * 60 * 60_000;  // every 2 hours
const INITIAL_DELAY_MS     = 28 * 60_000;       // T+28min — after harvester at T+22min

// ── Main association cycle ─────────────────────────────────────────────────────

async function runAssociationForUser(userId: string): Promise<void> {
  const now = new Date();
  const last24h  = new Date(now.getTime() - 24 * 3_600_000);
  const last7d   = new Date(now.getTime() - 7 * 86_400_000);
  const last30d  = new Date(now.getTime() - 30 * 86_400_000);

  const focusGame = await getFocusGame();

  // ── 1. External signals (what's happening in the world) ────────────────────
  const [trends, competitors, newsSignals] = await Promise.all([
    db.select({
      topic:      predictiveTrends.topic,
      category:   predictiveTrends.category,
      confidence: predictiveTrends.confidence,
      velocity:   predictiveTrends.velocity,
    })
      .from(predictiveTrends)
      .where(and(eq(predictiveTrends.userId, userId), gte(predictiveTrends.createdAt, last7d)))
      .orderBy(desc(predictiveTrends.confidence))
      .limit(12),

    db.select({
      title:     nicheVideoSamples.title,
      viewCount: nicheVideoSamples.viewCount,
      isShort:   nicheVideoSamples.isShort,
    })
      .from(nicheVideoSamples)
      .where(eq(nicheVideoSamples.userId, userId))
      .orderBy(desc(nicheVideoSamples.viewCount))
      .limit(10),

    db.select({ title: intelligenceSignals.title, source: intelligenceSignals.source })
      .from(intelligenceSignals)
      .where(and(eq(intelligenceSignals.userId, userId), gte(intelligenceSignals.createdAt, last24h)))
      .orderBy(desc(intelligenceSignals.score))
      .limit(20),
  ]);

  // ── 2. Channel's own performance patterns ──────────────────────────────────
  const [successDna, recentMetrics, topPrinciples] = await Promise.all([
    db.select({
      pattern:    channelSuccessDna.patternType,
      value:      channelSuccessDna.pattern,
      avgScore:   channelSuccessDna.avgPerformanceScore,
      confidence: channelSuccessDna.confidenceScore,
      sampleSize: channelSuccessDna.sampleCount,
    })
      .from(channelSuccessDna)
      .where(eq(channelSuccessDna.userId, userId))
      .orderBy(desc(channelSuccessDna.confidenceScore))
      .limit(10),

    db.select({
      videoId:   youtubeOutputMetrics.youtubeVideoId,
      views:     youtubeOutputMetrics.views,
      ctr:       youtubeOutputMetrics.ctr,
      avgWatch:  youtubeOutputMetrics.averageViewPercent,
      duration:  youtubeOutputMetrics.durationSec,
      measuredAt: youtubeOutputMetrics.measuredAt,
    })
      .from(youtubeOutputMetrics)
      .where(and(eq(youtubeOutputMetrics.userId, userId), gte(youtubeOutputMetrics.measuredAt, last30d)))
      .orderBy(desc(youtubeOutputMetrics.views))
      .limit(15),

    db.select({ principle: masterKnowledgeBank.principle, category: masterKnowledgeBank.category, confidence: masterKnowledgeBank.confidenceScore })
      .from(masterKnowledgeBank)
      .where(and(eq(masterKnowledgeBank.userId, userId), eq(masterKnowledgeBank.isActive, true)))
      .orderBy(desc(masterKnowledgeBank.confidenceScore))
      .limit(8),
  ]);

  if (trends.length === 0 && competitors.length === 0 && newsSignals.length === 0) {
    logger.debug(`[Association] No external signals yet for ${userId.slice(0, 8)} — skipping`);
    return;
  }

  // ── 3. AI cross-signal synthesis ───────────────────────────────────────────
  const prompt = `You are the association layer of an autonomous YouTube channel AI brain for the channel "ET Gaming 274" — a no-commentary ${focusGame} gameplay highlights channel.

Your job: connect what's happening externally with what this channel's data proves works, and generate 3-5 immediately-actionable insights.

## FOCUS GAME: ${focusGame}

## EXTERNAL SIGNALS (what the world is doing right now):
### Trending Topics (by confidence):
${trends.map(t => `- "${t.topic}" [${t.category}] confidence=${((+(t.confidence ?? 0)) * 100).toFixed(0)}% velocity=${(+(t.velocity ?? 0)) > 0 ? "+" : ""}${(+(t.velocity ?? 0)).toFixed(2)}`).join("\n") || "none yet"}

### Competitor/Niche Top Videos:
${competitors.map(c => `- "${c.title}" | ${(c.viewCount ?? 0).toLocaleString()} views | ${c.isShort ? "Short" : "Long"}`).join("\n") || "none yet"}

### Recent News & Signals:
${newsSignals.map(s => `- [${s.source}] ${s.title}`).join("\n") || "none"}

## CHANNEL'S OWN PERFORMANCE DNA:
### Winning Patterns (what works on THIS channel):
${successDna.map(d => `- ${d.pattern}="${d.value}" | avg score ${d.avgScore?.toFixed(1)} | ${d.sampleSize} videos | confidence ${d.confidence}%`).join("\n") || "not enough data yet"}

### Top Performing Videos (last 30d):
${recentMetrics.map(m => `- ytId:${m.videoId} | ${(m.views ?? 0).toLocaleString()} views | CTR ${m.ctr?.toFixed(1)}% | ${m.avgWatch?.toFixed(0)}% watch time`).join("\n") || "none"}

### Current Master Knowledge (top principles):
${topPrinciples.map(p => `- [${p.confidence}%] ${p.principle?.slice(0, 120)}`).join("\n") || "none"}

## YOUR TASK:
Make cross-signal connections between the external world and this channel's proven patterns.
Find the "aha moments" — where external opportunity meets internal strength.

Return JSON:
{
  "associations": [
    {
      "insight": "one clear sentence connecting an external signal to a channel pattern",
      "externalSignal": "what triggered this — the trend/news/competitor that caught attention",
      "channelPattern": "which proven pattern from the channel's data this connects to",
      "immediateAction": "what to do RIGHT NOW (e.g. 'queue 3 Shorts about X using Y format')",
      "urgency": "now|soon|watch",
      "confidenceScore": 50-95,
      "category": "content_opportunity|timing_signal|format_signal|avoid_signal|trend_gap"
    }
  ]
}

Return 3-5 associations. Only return valid JSON.`;

  let result: any;
  try {
    result = await executeRoutedAICall(
      { taskType: "association_synthesis", userId, priority: "low", maxTokens: 1500 },
      "You are a strategic pattern-matcher for a YouTube channel AI brain. Connect external signals to channel performance data. Return only valid JSON.",
      prompt,
    );
  } catch (err: any) {
    logger.debug(`[Association] AI call failed (non-fatal): ${err.message?.slice(0, 100)}`);
    return;
  }

  const parsed = safeParseJSON<{ associations?: any[] } | null>(result?.content ?? "", null);
  if (!parsed?.associations?.length) return;

  let written = 0;
  for (const assoc of parsed.associations.slice(0, 5)) {
    if (!assoc?.insight) continue;
    try {
      await db.insert(masterKnowledgeBank).values({
        userId,
        category:          "association_insight",
        principle:         `[Association] ${assoc.insight} → Action: ${assoc.immediateAction ?? "monitor"}`,
        sourceEngines:     ["brain-association-engine", "omni-intelligence-harvester"],
        evidenceCount:     1,
        confidenceScore:   Math.min(95, Math.max(50, assoc.confidenceScore ?? 70)),
        applicableEngines: ["content-grinder", "back-catalog-engine", "youtube-ai-orchestrator"],
        isActive:          true,
        metadata: {
          externalSignal:  assoc.externalSignal,
          channelPattern:  assoc.channelPattern,
          immediateAction: assoc.immediateAction,
          urgency:         assoc.urgency,
          category:        assoc.category,
          focusGame,
          generatedAt:     now.toISOString(),
        },
      } as any);
      written++;

      // Also write to engineKnowledge for cross-pollination mesh
      await recordEngineKnowledge(
        "brain-association-engine", userId,
        "association", `${assoc.category ?? "content_opportunity"}:${Date.now()}`,
        assoc.insight,
        `${assoc.externalSignal} → ${assoc.channelPattern}`,
        Math.min(90, assoc.confidenceScore ?? 70),
      ).catch(() => {});
    } catch { /* duplicate — ok */ }
  }

  if (written > 0) {
    logger.info(`[Association] Wrote ${written} cross-signal associations → masterKnowledgeBank for ${userId.slice(0, 8)}`);
  }
}

// ── Public cycle function ──────────────────────────────────────────────────────

let _running = false;

export async function runAssociationCycle(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const allUsers = await db.select({ id: users.id })
      .from(users)
      .where(sql`EXISTS (SELECT 1 FROM channels c WHERE c.user_id = ${users.id} AND c.platform = 'youtube')`);

    for (const { id: userId } of allUsers) {
      const gate = await CommandCenter.canRun({
        module: "brain-association-engine",
        userId,
        requiresAI: true,
        priority: 9,
      });
      if (!gate.allowed) continue;

      try {
        await AIScheduler.enqueue({
          taskType:        "association_synthesis",
          userId,
          priority:        9,
          module:          "brain-association-engine",
          estimatedTokens: 1500,
          fn:              () => runAssociationForUser(userId),
        });
      } catch (err: any) {
        logger.debug(`[Association] Skipped ${userId.slice(0, 8)}: ${err.message?.slice(0, 80)}`);
      }
    }
  } finally {
    _running = false;
  }
}

// ── Initializer ────────────────────────────────────────────────────────────────

export function initBrainAssociationEngine(): ReturnType<typeof setInterval> {
  logger.info(`Brain Association Engine initialised — first run in ${INITIAL_DELAY_MS / 60_000}m, then every ${ASSOCIATION_CYCLE_MS / 3_600_000}h`);

  setTimeout(() => {
    runAssociationCycle().catch(err =>
      logger.error("Initial association cycle failed", { err: String(err) }),
    );
  }, INITIAL_DELAY_MS);

  return setInterval(() => {
    runAssociationCycle().catch(err =>
      logger.error("Association cycle failed", { err: String(err) }),
    );
  }, ASSOCIATION_CYCLE_MS);
}
