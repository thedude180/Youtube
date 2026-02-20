import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, lt, isNotNull, asc } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { shouldRunVodOptimization } from "./priority-orchestrator";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";

const logger = createLogger("vod-optimizer");
const openai = getOpenAIClient();

const VODS_PER_BATCH = 5;
const MIN_AGE_DAYS = 7;
const RE_OPTIMIZE_AFTER_DAYS = 30;

interface VodOptimization {
  videoId: number;
  originalTitle: string;
  newTitle: string;
  newDescription: string;
  newTags: string[];
  thumbnailSuggestion: string;
  strategyNotes: string;
  expectedImpact: string;
}

async function findOptimizableVods(userId: string): Promise<any[]> {
  const userChannels = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

  if (userChannels.length === 0) return [];
  const channelIds = userChannels.map(c => c.id);

  const minAge = new Date(Date.now() - MIN_AGE_DAYS * 86400000);
  const reOptCutoff = new Date(Date.now() - RE_OPTIMIZE_AFTER_DAYS * 86400000);

  const allVids = await db.select().from(videos)
    .where(lt(videos.createdAt, minAge))
    .orderBy(asc(videos.createdAt))
    .limit(50);

  const candidateVids = allVids.filter(v => v.channelId !== null && channelIds.includes(v.channelId));

  const recentlyOptimized = await db.select({ sourceVideoId: autopilotQueue.sourceVideoId })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "vod-optimization"),
      gte(autopilotQueue.createdAt, reOptCutoff),
    ));

  const recentIds = new Set(recentlyOptimized.map(r => r.sourceVideoId));
  return candidateVids.filter(v => !recentIds.has(v.id)).slice(0, VODS_PER_BATCH);
}

async function generateOptimizations(vods: any[], userId?: string): Promise<VodOptimization[]> {
  if (vods.length === 0) return [];

  const vodList = vods.map((v, i) => {
    const meta = v.metadata as any;
    return `${i + 1}. Title: "${v.title}" | Views: ${v.viewCount || 0} | Likes: ${v.likeCount || 0} | Duration: ${meta?.duration || "unknown"} | Published: ${v.publishedAt || v.createdAt} | Tags: ${(v.tags as string[] || []).join(", ") || "none"} | Description: ${(v.description || "").substring(0, 150)}`;
  }).join("\n");

  const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a YouTube SEO expert specializing in reviving underperforming gaming content. Your optimizations consistently 3-5x view counts on old videos.
${retentionContext}

Your job: Analyze old gaming VODs and create optimized metadata that the YouTube algorithm will favor. Apply retention beat science to every optimization. Focus on:
- Clickbait-worthy but honest titles that create curiosity gaps (use hook_open and curiosity_gap beats)
- SEO-rich descriptions with timestamps placed at retention beat markers
- Tags that hit trending search terms in gaming
- Thumbnail concepts that demand clicks (use the "stop the scroll" principle from hook_open beats)
- Strategy rooted in retention beat psychology for why this optimization will work

Return ONLY valid JSON array matching this structure:
[{
  "videoIndex": 1,
  "newTitle": "string - max 60 chars, curiosity-driven",
  "newDescription": "string - SEO optimized with hooks and timestamps",
  "newTags": ["array", "of", "trending", "tags"],
  "thumbnailSuggestion": "detailed thumbnail concept description",
  "strategyNotes": "why this optimization will get more views",
  "expectedImpact": "estimated view increase like '2-4x'"
}]`
        },
        {
          role: "user",
          content: `Optimize these underperforming gaming VODs for maximum new viewership:\n\n${vodList}\n\nMake each title irresistible. Use current YouTube gaming trends. Every optimization should feel like a fresh upload to the algorithm.`
        }
      ],
      temperature: 0.8,
      max_tokens: 3000,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error("AI returned non-JSON VOD optimizations");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      videoIndex: number;
      newTitle: string;
      newDescription: string;
      newTags: string[];
      thumbnailSuggestion: string;
      strategyNotes: string;
      expectedImpact: string;
    }>;

    return parsed.map(opt => {
      const vid = vods[(opt.videoIndex || 1) - 1];
      if (!vid) return null;
      return {
        videoId: vid.id,
        originalTitle: vid.title || "Untitled",
        newTitle: opt.newTitle,
        newDescription: opt.newDescription,
        newTags: opt.newTags || [],
        thumbnailSuggestion: opt.thumbnailSuggestion,
        strategyNotes: opt.strategyNotes,
        expectedImpact: opt.expectedImpact,
      };
    }).filter((o): o is VodOptimization => o !== null);
  } catch (err: any) {
    logger.error("Failed to generate VOD optimizations", { error: err.message });
    return [];
  }
}

async function queueOptimizations(userId: string, optimizations: VodOptimization[]): Promise<number> {
  let queued = 0;

  for (const opt of optimizations) {
    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: opt.videoId,
        type: "vod-optimization",
        targetPlatform: "youtube",
        content: JSON.stringify({
          newTitle: opt.newTitle,
          newDescription: opt.newDescription,
          newTags: opt.newTags,
          thumbnailSuggestion: opt.thumbnailSuggestion,
          strategyNotes: opt.strategyNotes,
          expectedImpact: opt.expectedImpact,
        }),
        caption: `VOD Optimize: ${opt.originalTitle} → ${opt.newTitle}`,
        status: "pending",
        scheduledAt: new Date(Date.now() + Math.random() * 60 * 60 * 1000),
        metadata: {
          style: "vod-refresh",
          aiModel: "gpt-4o-mini",
          retentionBeatsApplied: true,
          regenerateThumbnail: true,
        } as any,
      });

      try {
        const [video] = await db.select().from(videos).where(eq(videos.id, opt.videoId));
        if (video) {
          const meta = (video.metadata as any) || {};
          await db.update(videos).set({
            metadata: {
              ...meta,
              autoThumbnailGenerated: false,
              thumbnailRefreshReason: `VOD optimization: ${opt.strategyNotes}`,
            },
          }).where(eq(videos.id, opt.videoId));
        }
      } catch {}

      queued++;
      logger.info("Queued VOD optimization + thumbnail refresh", {
        userId,
        videoId: opt.videoId,
        original: opt.originalTitle,
        optimized: opt.newTitle,
        impact: opt.expectedImpact,
      });
    } catch (err: any) {
      logger.error("Failed to queue VOD optimization", { userId, videoId: opt.videoId, error: err.message });
    }
  }

  return queued;
}

export async function findOptimizableVodCount(userId: string): Promise<number> {
  const vods = await findOptimizableVods(userId);
  return vods.length;
}

export async function runSingleVodBatchForUser(userId: string): Promise<{ didWork: boolean; allDone: boolean }> {
  try {
    const vods = await findOptimizableVods(userId);
    if (vods.length === 0) {
      return { didWork: false, allDone: true };
    }

    const optimizations = await generateOptimizations(vods, userId);
    if (optimizations.length === 0) {
      return { didWork: false, allDone: false };
    }

    const queued = await queueOptimizations(userId, optimizations);

    logger.info("Loop: VOD batch complete", { userId, analyzed: vods.length, queued });

    await db.insert(notifications).values({
      userId,
      type: "autopilot",
      title: "VOD Optimization Batch",
      message: `Optimized ${queued} old videos. AI improvements queued for YouTube.`,
      severity: "info",
    });
    sendSSEEvent(userId, "notification", { type: "new" });

    const remaining = await findOptimizableVods(userId);
    return { didWork: queued > 0, allDone: remaining.length === 0 };
  } catch (err: any) {
    logger.error("Loop: VOD batch failed", { userId, error: err.message });
    return { didWork: false, allDone: false };
  }
}

export async function runVodOptimizationCycle(): Promise<void> {
  logger.info("Starting VOD optimization cycle");

  const userRows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"));

  const userIds = userRows.map(r => r.userId).filter((id): id is string => !!id);

  if (userIds.length === 0) {
    logger.info("No YouTube users found for VOD optimization");
    return;
  }

  for (const userId of userIds) {
    if (!shouldRunVodOptimization(userId)) {
      logger.info("VOD optimization skipped (higher priority active)", { userId });
      continue;
    }

    try {
      const vods = await findOptimizableVods(userId);
      if (vods.length === 0) {
        logger.info("No VODs need optimization", { userId });
        continue;
      }

      const optimizations = await generateOptimizations(vods, userId);
      if (optimizations.length === 0) {
        logger.info("AI produced no valid optimizations", { userId });
        continue;
      }

      const queued = await queueOptimizations(userId, optimizations);

      logger.info("VOD optimization cycle complete", { userId, analyzed: vods.length, queued });

      await db.insert(notifications).values({
        userId,
        type: "autopilot",
        title: "VOD Optimization Complete",
        message: `Analyzed ${vods.length} old videos, queued ${queued} optimizations. Expected impact: more views on existing content.`,
        severity: "info",
      });
      sendSSEEvent(userId, "notification", { type: "new" });
    } catch (err: any) {
      logger.error("VOD optimization failed for user", { userId, error: err.message });
    }
  }

  logger.info("VOD optimization cycle finished");
}

export async function getVodOptimizationStats(userId: string): Promise<{
  totalOptimized: number;
  thisWeek: number;
  pending: number;
  recentOptimizations: Array<{
    videoId: number;
    caption: string;
    status: string;
    createdAt: Date | null;
  }>;
}> {
  const weekStart = new Date(Date.now() - 7 * 86400000);

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization")));

  const [week] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "vod-optimization"),
      gte(autopilotQueue.createdAt, weekStart),
    ));

  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "vod-optimization"),
      eq(autopilotQueue.status, "pending"),
    ));

  const recent = await db.select({
    videoId: autopilotQueue.sourceVideoId,
    caption: autopilotQueue.caption,
    status: autopilotQueue.status,
    createdAt: autopilotQueue.createdAt,
  })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.type, "vod-optimization")))
    .orderBy(desc(autopilotQueue.createdAt))
    .limit(10);

  return {
    totalOptimized: total?.count || 0,
    thisWeek: week?.count || 0,
    pending: pending?.count || 0,
    recentOptimizations: recent.map(r => ({
      videoId: r.videoId || 0,
      caption: r.caption || "",
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}
