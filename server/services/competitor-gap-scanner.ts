/**
 * Competitor Gap Scanner
 *
 * Reads the top-performing competitor videos from `nicheVideoSamples`
 * (populated by the niche-video-researcher), identifies topics/formats that
 * rivals are winning on but ET Gaming 274 isn't covering, then:
 *  1. Queues gap-filling catalog-remix items for any matching source video.
 *  2. Writes un-fillable gaps to `masterKnowledgeBank` as strategic priorities.
 *
 * Cycle: every 168 h (weekly).  Initial run: T+55 min.
 */

import { db } from "../db";
import {
  nicheVideoSamples,
  backCatalogVideos,
  autopilotQueue,
  masterKnowledgeBank,
  discoveredStrategies,
  channels,
} from "@shared/schema";
import { eq, and, desc, gte, ilike, or, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";

const logger = createLogger("competitor-gap-scanner");

const CYCLE_MS          = 7 * 24 * 60 * 60 * 1000; // weekly
const MIN_COMPETITOR_VIEWS = 30_000;
const MAX_GAPS_PER_RUN  = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentGap {
  topic:             string;
  game:              string;
  format:            string;   // "short" | "long-form" | "compilation"
  competitorViews:   number;
  competitorChannel: string;
  whyWeWin:          string;   // angle ET Gaming 274 can exploit
  urgency:           "high" | "medium" | "low";
}

// ── Gap analysis ──────────────────────────────────────────────────────────────

async function analyseGaps(
  userId: string,
  competitorVideos: Array<{ title: string; channelName: string | null; viewCount: number | null; isShort: boolean | null }>,
  channelTitles: string[],
): Promise<ContentGap[]> {
  const prompt = `You are a YouTube competitive intelligence analyst for ET Gaming 274 (PS5 gaming, no-commentary, @etgaming274).

COMPETITOR TOP VIDEOS (sorted by views):
${competitorVideos.slice(0, 30).map((v, i) =>
  `${i + 1}. "${v.title}" | channel: ${v.channelName ?? "?"} | views: ${(v.viewCount ?? 0).toLocaleString()} | format: ${v.isShort ? "Short" : "Long-form"}`
).join("\n")}

ET GAMING 274 EXISTING CONTENT (recent titles):
${channelTitles.slice(0, 40).map((t, i) => `${i + 1}. "${t}"`).join("\n")}

Identify the top ${MAX_GAPS_PER_RUN} CONTENT GAPS — topics or formats where:
- Competitors are getting 30k+ views
- ET Gaming 274 has ZERO or minimal coverage
- ET Gaming 274 could realistically cover on PS5

For each gap explain the exact angle ET Gaming 274 should take.
Return ONLY valid JSON:
{
  "gaps": [
    {
      "topic": "specific topic/game/theme",
      "game": "game name or 'multi-game'",
      "format": "short|long-form|compilation",
      "competitorViews": highest_views_seen,
      "competitorChannel": "channel that owns this space",
      "whyWeWin": "specific angle ET Gaming 274 can take to outperform",
      "urgency": "high|medium|low"
    }
  ]
}`;

  try {
    const result = await executeRoutedAICall(
      { taskType: "competitive_intel", userId, maxTokens: 1500 },
      "You are a YouTube competitive intelligence analyst. Identify precise content gaps. Return only valid JSON.",
      prompt,
    );
    const parsed = safeParseJSON<{ gaps?: ContentGap[] } | null>(result.content, null);
    return parsed?.gaps ?? [];
  } catch (err: any) {
    logger.warn(`Gap analysis AI call failed: ${err.message?.slice(0, 80)}`);
    return [];
  }
}

// ── Queue a gap-filling item if we have source material ───────────────────────

async function queueGapFiller(userId: string, gap: ContentGap): Promise<boolean> {
  const keywords = gap.topic.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 2);
  const gameKw   = gap.game.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 2);
  const allKw    = [...new Set([...keywords, ...gameKw])];

  const conditions = allKw.flatMap(kw => [
    ilike(backCatalogVideos.title,    `%${kw}%`),
    ilike(backCatalogVideos.gameName, `%${kw}%`),
  ]);

  const candidates = await db
    .select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      or(...conditions),
    ))
    .orderBy(desc(backCatalogVideos.totalRevivalScore))
    .limit(3);

  const source = candidates[0];
  if (!source) return false;

  const isShortGap = gap.format === "short";
  const title = `${gap.topic} — PS5 No Commentary ${isShortGap ? "#Shorts" : "Full Gameplay"} 2026`.slice(0, 100);

  const scheduledAt = new Date(Date.now() + (gap.urgency === "high" ? 2 : gap.urgency === "medium" ? 12 : 24) * 60 * 60 * 1000);

  try {
    await db.insert(autopilotQueue).values({
      userId,
      type: "catalog-remix",
      targetPlatform: "youtube",
      content: title,
      caption: `${title}\n\n${gap.whyWeWin}\n\n#gaming #ps5 #${gap.game.replace(/\s+/g, "").toLowerCase()}`,
      status: "scheduled",
      scheduledAt,
      metadata: {
        contentType: isShortGap ? "youtube-short" : "long-form-clip",
        sourceYoutubeId: source.youtubeVideoId,
        gameName: source.gameName ?? gap.game,
        gapTopic: gap.topic,
        gapCompetitorViews: gap.competitorViews,
        gapCompetitorChannel: gap.competitorChannel,
        gapAngle: gap.whyWeWin,
        competitorGapQueued: true,
      } as any,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main cycle ────────────────────────────────────────────────────────────────

async function runCompetitorGapScannerCycle(userId: string): Promise<void> {
  logger.info(`[CompetitorGap] Starting weekly scan — ${userId.slice(0, 8)}`);

  const since = new Date(Date.now() - 30 * 86_400_000);

  // Read top competitor videos
  const competitorVideos = await db
    .select({
      title:       nicheVideoSamples.title,
      channelName: nicheVideoSamples.channelName,
      viewCount:   nicheVideoSamples.viewCount,
      isShort:     nicheVideoSamples.isShort,
    })
    .from(nicheVideoSamples)
    .where(and(
      eq(nicheVideoSamples.userId, userId),
      gte(nicheVideoSamples.createdAt, since),
      gte(nicheVideoSamples.viewCount, MIN_COMPETITOR_VIEWS),
    ))
    .orderBy(desc(nicheVideoSamples.viewCount))
    .limit(50);

  if (competitorVideos.length < 5) {
    logger.info("[CompetitorGap] Not enough competitor data — niche researcher may not have run yet");
    return;
  }

  // Read channel's existing titles
  const channelContent = await db
    .select({ title: backCatalogVideos.title })
    .from(backCatalogVideos)
    .where(eq(backCatalogVideos.userId, userId))
    .orderBy(desc(backCatalogVideos.viewCount))
    .limit(60);

  const channelTitles = channelContent.map(v => v.title);

  // Identify gaps
  const gaps = await analyseGaps(userId, competitorVideos, channelTitles);

  if (gaps.length === 0) {
    logger.info("[CompetitorGap] No actionable gaps found this week");
    return;
  }

  logger.info(`[CompetitorGap] Found ${gaps.length} content gaps`);
  let queued = 0, strategized = 0;

  for (const gap of gaps.slice(0, MAX_GAPS_PER_RUN)) {
    // Try to queue a gap-filler immediately
    const wasQueued = await queueGapFiller(userId, gap);

    if (wasQueued) {
      queued++;
      logger.info(`[CompetitorGap] Queued gap-filler for "${gap.topic}" (${gap.competitorViews.toLocaleString()} competitor views)`);
    } else {
      // No source video — write to masterKnowledgeBank as strategic priority
      const knowledgeKey = `competitor_gap:${gap.topic.toLowerCase().replace(/\s+/g, "_")}`;
      try {
        await db.insert(masterKnowledgeBank).values({
          userId,
          category: "competitive_gap",
          principle: `COMPETITOR GAP — "${gap.topic}" (${gap.game}): ${gap.competitorChannel} is getting ${gap.competitorViews.toLocaleString()} views. ET Gaming 274 has no content here. Angle: ${gap.whyWeWin}. Urgency: ${gap.urgency}.`,
          sourceEngines: ["competitor-gap-scanner"],
          evidenceCount: 1,
          confidenceScore: gap.urgency === "high" ? 90 : gap.urgency === "medium" ? 70 : 50,
          metadata: { gap },
        });
        strategized++;
      } catch { /* non-critical — upsert pattern not needed, row deduped by scanner cycle */ }
    }

    // Also persist as a discoveredStrategy for the AI orchestrator
    try {
      await db.insert(discoveredStrategies).values({
        userId,
        strategyType: "competitor_gap",
        title: `Gap: ${gap.topic} (${gap.competitorViews.toLocaleString()} views by ${gap.competitorChannel})`,
        description: gap.whyWeWin,
        effectiveness: gap.urgency === "high" ? 80 : gap.urgency === "medium" ? 60 : 40,
        isActive: true,
        metadata: { gap } as any,
      } as any).onConflictDoNothing();
    } catch { /* non-critical */ }
  }

  logger.info(`[CompetitorGap] Scan complete — queued=${queued} strategized=${strategized}`);
}

// ── Internal userId lookup ─────────────────────────────────────────────────────

async function getPrimaryUserId(): Promise<string | null> {
  const [row] = await db.select({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"))
    .limit(1);
  return row?.userId ?? null;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export function initCompetitorGapScanner(): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];

  const INITIAL_DELAY = 55 * 60 * 1000;
  const t = setTimeout(async () => {
    const userId = await getPrimaryUserId();
    if (!userId) { logger.warn("[CompetitorGap] No YouTube channel found — skipping"); return; }
    await runCompetitorGapScannerCycle(userId).catch(e =>
      logger.error(`[CompetitorGap] Cycle error: ${e.message}`)
    );
    const interval = setInterval(async () => {
      const uid = await getPrimaryUserId();
      if (uid) await runCompetitorGapScannerCycle(uid).catch(e =>
        logger.error(`[CompetitorGap] Cycle error: ${e.message}`)
      );
    }, CYCLE_MS);
    timers.push(interval);
  }, INITIAL_DELAY);

  timers.push(t);
  logger.info("[CompetitorGap] Scheduled — first run in 55 min");
  return timers;
}
