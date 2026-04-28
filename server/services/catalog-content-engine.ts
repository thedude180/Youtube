import { sanitizeForPrompt, sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { videos, channels, autopilotQueue } from "@shared/schema";
import { eq, desc, and, gte, sql, lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getOpenAIClientBackground as getOpenAIClient } from "../lib/openai";
import { storage } from "../storage";
import { sendSSEEvent } from "../routes/events";
import { recordHeartbeat } from "./engine-heartbeat";

const logger = createLogger("catalog-content-engine");
const openai = getOpenAIClient();

const ENGINE_INTERVAL_MS = 60 * 60 * 1000;
const MAX_OPPORTUNITIES_PER_CYCLE = 8;

const userTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningCycles = new Set<string>();

function peakHourSlot(index: number, total: number): Date {
  const now = new Date();
  const start = new Date(now);
  start.setHours(10, 0, 0, 0);
  if (start < now) start.setDate(start.getDate() + 1);
  const windowMs = 14 * 3600_000;
  const spacing = total > 1 ? windowMs / total : windowMs / 2;
  const jitter = (Math.random() - 0.5) * 1_200_000;
  return new Date(start.getTime() + index * spacing + jitter);
}

interface CatalogOpportunity {
  sourceVideoTitle: string;
  repurposeType: string;
  platform: string;
  editingBrief: string;
  estimatedViralScore: number;
  urgency: string;
}

const JAMIE_SYSTEM_PROMPT = `You are Jamie Cruz — the Catalog Content Director and world-class video editor. Your singular mission: make sure the YouTube catalog NEVER goes stale. Every video already published is raw material for new content. You mine the catalog continuously, finding angles and formats that breathe new life into existing footage.

REPURPOSING STRATEGIES (ranked by effort vs. impact):
1. VIRAL CLIP EXTRACTION — Find the single best 15-60 second moment in any video. Low effort, potentially massive reach.
2. THEMED COMPILATIONS — Group 3-5 videos around a theme (funniest moments, best kills, biggest fails). Extremely high retention.
3. BEST OF SERIES — Take top 5 videos from the past year and create a "Best Of" video. Proven format.
4. TREND-JACK RE-FRAME — When a new game patch or trend hits, find the old video that becomes newly relevant.
5. THROWBACK ACTIVATION — "I posted this 2 years ago" framing on X/TikTok with clip and YouTube link.
6. DEEP CUT SERIES — Take a long video (30+ minutes) and re-cut into 3-4 shorter tighter videos.
7. REACTION TO OWN CONTENT — React to old videos showing skill progression. Nostalgia + growth = great watch time.

EDITING PHILOSOPHY:
- First 10 seconds is everything: open on action, not intro
- Cut every pause and filler — viewers leave at dead air
- Text overlays for every punchline and key stat: 20% watching on mute still gets it
- Loop engineering for Shorts: last frame must flow into first frame

Analyze the provided catalog and return ONLY valid JSON in this exact format:
{
  "action": "catalog_mining",
  "catalog_opportunities": [
    {
      "sourceVideoTitle": "exact video title",
      "repurposeType": "viral_clip|compilation|best_of|trend_reframe|throwback|deep_cut|reaction",
      "platform": "youtube|tiktok|shorts|discord",
      "editingBrief": "detailed editing instructions",
      "estimatedViralScore": 85,
      "urgency": "immediate|this_week|this_month"
    }
  ]
}`;

async function aiAnalyzeCatalog(videos: any[]): Promise<CatalogOpportunity[]> {
  try {
    const videoSummary = videos.map(v => ({
      title: v.title,
      views: v.metadata?.viewCount || v.metadata?.stats?.views || 0,
      likes: v.metadata?.likeCount || v.metadata?.stats?.likes || 0,
      published: v.publishedAt ? new Date(v.publishedAt).toISOString().split("T")[0] : "unknown",
      durationMins: v.metadata?.duration
        ? Math.round(parseDurationToSeconds(v.metadata.duration) / 60)
        : null,
    }));

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: JAMIE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this YouTube catalog and identify the top ${MAX_OPPORTUNITIES_PER_CYCLE} repurposing opportunities. Return valid JSON matching your output format.\n\nCATALOG:\n${JSON.stringify(sanitizeObjectForPrompt(videoSummary), null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    return (parsed.catalog_opportunities as CatalogOpportunity[]) || [];
  } catch (err: any) {
    logger.warn(`AI catalog analysis failed: ${sanitizeForPrompt(err.message)}`);
    return [];
  }
}

function parseDurationToSeconds(dur: string): number {
  try {
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
  } catch { return 0; }
}

function repurposeTypeToQueueType(type: string): string {
  if (type === "viral_clip" || type === "deep_cut") return "catalog-clip";
  if (type === "compilation" || type === "best_of") return "catalog-compilation";
  if (type === "throwback" || type === "trend_reframe") return "catalog-reactivation";
  if (type === "reaction") return "catalog-reaction";
  return "catalog-remix";
}

function platformToTarget(platform: string): string {
  if (platform === "tiktok") return "tiktok";
  if (platform === "shorts") return "youtube";
  return "youtube";
}

export async function runCatalogCycle(userId: string): Promise<void> {
  if (runningCycles.has(userId)) {
    logger.info(`[${userId}] Catalog cycle already running, skipping`);
    return;
  }
  runningCycles.add(userId);

  try {
    await recordHeartbeat("catalog-content-engine", "completed");

    const [channel] = await db.select().from(channels).where(eq(channels.userId, userId)).limit(1);
    if (!channel) {
      logger.info(`[${userId}] No channel found, skipping catalog cycle`);
      return;
    }

    const allVideos = await db.select({
      id: videos.id,
      title: videos.title,
      publishedAt: videos.publishedAt,
      metadata: videos.metadata,
      status: videos.status,
    })
      .from(videos)
      .where(and(
        eq(videos.channelId, channel.id),
        eq(videos.platform, "youtube"),
      ))
      .orderBy(desc(sql`COALESCE((${videos.metadata}->>'viewCount')::int, 0)`))
      .limit(50);

    if (allVideos.length === 0) {
      logger.info(`[${userId}] No catalog videos found`);
      return;
    }

    logger.info(`[${userId}] Analyzing catalog of ${allVideos.length} videos for repurposing opportunities`);
    sendSSEEvent(userId, "catalog-engine", { status: "analyzing", videoCount: allVideos.length });

    const opportunities = await aiAnalyzeCatalog(allVideos);
    if (opportunities.length === 0) {
      logger.info(`[${userId}] No opportunities identified this cycle`);
      return;
    }

    logger.info(`[${userId}] Found ${opportunities.length} catalog repurposing opportunities`);

    const itemsToQueue = opportunities
      .sort((a, b) => b.estimatedViralScore - a.estimatedViralScore)
      .slice(0, MAX_OPPORTUNITIES_PER_CYCLE);

    for (let i = 0; i < itemsToQueue.length; i++) {
      const opp = itemsToQueue[i];
      try {
        const matchedVideo = allVideos.find(v =>
          v.title?.toLowerCase().includes(opp.sourceVideoTitle?.toLowerCase()?.slice(0, 20))
        );

        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: matchedVideo?.id || null,
          type: repurposeTypeToQueueType(opp.repurposeType),
          targetPlatform: platformToTarget(opp.platform),
          content: opp.editingBrief,
          caption: `[${opp.repurposeType.replace(/_/g, " ").toUpperCase()}] ${sanitizeForPrompt(opp.sourceVideoTitle)}`,
          status: opp.urgency === "immediate" ? "pending" : "scheduled",
          scheduledAt: opp.urgency === "immediate" ? new Date() : peakHourSlot(i, itemsToQueue.length),
          metadata: {
            contentType: opp.repurposeType,
            aiModel: "gpt-4o-mini",
            humanScore: opp.estimatedViralScore,
            isRecycled: true,
          },
        });
      } catch (insertErr: any) {
        logger.warn(`[${userId}] Failed to queue opportunity: ${sanitizeForPrompt(insertErr.message)}`);
      }
    }

    await storage.createAgentActivity({
      userId,
      agentId: "ai-catalog-director",
      action: "catalog_mining",
      target: `${allVideos.length} catalog videos`,
      status: "completed",
      details: {
        description: `Analyzed ${allVideos.length} catalog videos and queued ${itemsToQueue.length} repurposing opportunities`,
        impact: `${itemsToQueue.length} new content pieces scheduled for distribution`,
        metrics: {
          videosScanned: allVideos.length,
          opportunitiesFound: opportunities.length,
          itemsQueued: itemsToQueue.length,
        },
      },
    });

    sendSSEEvent(userId, "catalog-engine", {
      status: "complete",
      itemsQueued: itemsToQueue.length,
      message: `Jamie Cruz queued ${itemsToQueue.length} catalog repurposing opportunities`,
    });

    logger.info(`[${userId}] Catalog cycle complete — queued ${itemsToQueue.length} items`);
  } catch (err: any) {
    logger.error(`[${userId}] Catalog cycle error: ${sanitizeForPrompt(err.message)}`);
    sendSSEEvent(userId, "catalog-engine", { status: "error", error: err.message });
  } finally {
    runningCycles.delete(userId);
  }
}

export function initCatalogEngineForUser(userId: string): void {
  if (userTimers.has(userId)) {
    clearTimeout(userTimers.get(userId)!);
    userTimers.delete(userId);
  }

  const randomDelay = 30_000 + Math.random() * 60_000;

  const scheduleNext = () => {
    const jitter = (Math.random() - 0.5) * 30 * 60_000;
    const interval = ENGINE_INTERVAL_MS + jitter;
    const timer = setTimeout(async () => {
      try {
        await runCatalogCycle(userId);
      } catch (err: any) {
        logger.warn(`[${userId}] Catalog engine tick error: ${sanitizeForPrompt(err.message)}`);
      }
      scheduleNext();
    }, interval);
    userTimers.set(userId, timer);
  };

  const initTimer = setTimeout(async () => {
    try {
      await runCatalogCycle(userId);
    } catch (err: any) {
      logger.warn(`[${userId}] Catalog engine init error: ${sanitizeForPrompt(err.message)}`);
    }
    scheduleNext();
  }, randomDelay);

  userTimers.set(userId, initTimer);
  logger.info(`[${userId}] Catalog content engine initialized — first run in ${Math.round(randomDelay / 1000)}s`);
}

export function stopCatalogEngineForUser(userId: string): void {
  const timer = userTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    userTimers.delete(userId);
  }
}
