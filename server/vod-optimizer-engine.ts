import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, lt, isNotNull, asc } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { shouldRunVodOptimization } from "./priority-orchestrator";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { detectGamingContext, buildGamingPromptSection, detectContentContext, buildContentPromptSection, getNicheLabel } from "./ai-engine";
import { humanizeText } from "./ai-humanizer-engine";

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
    const contentCtx = detectContentContext(v.title, v.description, meta?.contentCategory, meta);
    const topicLabel = contentCtx.topicName ? ` | Topic: ${contentCtx.topicName}` : "";
    return `${i + 1}. Title: "${v.title}" | Views: ${v.viewCount || 0} | Likes: ${v.likeCount || 0} | Duration: ${meta?.duration || "unknown"} | Published: ${v.publishedAt || v.createdAt} | Tags: ${(v.tags as string[] || []).join(", ") || "none"} | Description: ${(v.description || "").substring(0, 150)}${topicLabel}`;
  }).join("\n");

  const topicNames = [...Array.from(new Set(vods.map(v => {
    const meta = v.metadata as any;
    return detectContentContext(v.title, v.description, meta?.contentCategory, meta).topicName;
  }).filter(Boolean)))];
  const nicheSpecificSection = topicNames.length > 0
    ? `\n\nNICHE-SPECIFIC OPTIMIZATION (CRITICAL):\nThese videos cover: ${topicNames.join(", ")}. Every title, description, tag, and thumbnail MUST reference the specific topic/subject. Use niche-specific terminology and community language. Tags MUST include topic names and related search terms viewers actually search for. Do NOT give generic advice — optimize for the SPECIFIC topic in each video.`
    : "";

  const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a team of world-class experts collaborating to resurrect underperforming content and make the YouTube algorithm push it to millions:

🎯 WORLD'S BEST SEO EXPERT: You reverse-engineer YouTube's ranking algorithm. You know exactly which keywords are surging, how search intent works for content queries, and how to structure metadata so YouTube's crawler treats this as fresh, relevant content. You exploit keyword gaps competitors miss.

📝 WORLD'S BEST DIRECT-RESPONSE COPYWRITER: You write titles with 15%+ CTR. You use proven formulas — curiosity gaps, power words, emotional triggers, number hooks, before/after framing. Every word in the title and first 2 lines of the description is engineered to convert impressions into clicks.

📊 WORLD'S BEST GROWTH HACKER: You know why the algorithm surfaces some old videos and buries others. You engineer "second life" metadata that makes YouTube's recommendation engine think this is a brand new trending video. You exploit browse features, suggested video placement, and search ranking signals.

🧠 WORLD'S BEST AUDIENCE PSYCHOLOGIST: You understand the target audience's decision-making in the 0.5 seconds they decide to click or scroll. You weaponize FOMO, social proof, pattern interrupts, and dopamine triggers in every metadata element.

🎨 WORLD'S BEST THUMBNAIL STRATEGIST: You design thumbnail concepts that achieve 8%+ CTR. You understand visual hierarchy, color psychology, facial expressions, contrast, and the "stop the scroll" principle that makes viewers physically unable to not click.
${retentionContext}${nicheSpecificSection}

OPTIMIZATION STRATEGY:
- Titles: Front-load the primary keyword. Use power words (INSANE, IMPOSSIBLE, NEVER). Create a curiosity gap or emotional hook. Max 60 chars. Make it feel like a video uploaded TODAY about a trending topic.
- Descriptions: First 2 lines must contain the primary keyword and a compelling hook (this is what shows in search). Add retention-beat-timed timestamps. Include 3-5 long-tail keyword phrases naturally woven in. End with subscribe CTA + social links. Add relevant hashtags.
- Tags: 15-25 tags. Mix exact-match keywords, long-tail variations, competitor video keywords, trending search terms, and broad niche tags. Put highest-value tags first.
- Thumbnail: Describe a concept with specific emotion, composition, color scheme, focal point, and contrast technique that would achieve 8%+ CTR.
- Strategy: Explain exactly which algorithm signals this optimization exploits and why it will trigger YouTube to resurface this video.

Return ONLY valid JSON array matching this structure:
[{
  "videoIndex": 1,
  "newTitle": "string - max 60 chars, power words + curiosity gap + front-loaded keyword",
  "newDescription": "string - SEO-optimized: keyword-rich first 2 lines, timestamps, long-tail phrases, CTA, hashtags",
  "newTags": ["15-25 strategically ordered tags mixing exact-match, long-tail, trending, competitor keywords"],
  "thumbnailSuggestion": "detailed concept: subject, emotion, colors, composition, contrast, focal point, text overlay suggestion",
  "strategyNotes": "which algorithm signals this exploits and why YouTube will resurface this video",
  "expectedImpact": "estimated view increase like '3-5x' with reasoning"
}]`
        },
        {
          role: "user",
          content: `Optimize these underperforming VODs for maximum new viewership:\n\n${vodList}\n\nCRITICAL: Each optimization MUST be tailored to the SPECIFIC content of that video. Reference the actual topic, events, and moments in the video. Do NOT give generic titles like "INSANE CONTENT" — instead reference what specifically happened. Make each title irresistible and content-specific. Use current YouTube trends relevant to each video's niche. Every optimization should feel like a fresh upload to the algorithm.`
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
      const titleHumanized = humanizeText(opt.newTitle, { aggressionLevel: "subtle", contentType: "title" });
      const descHumanized = humanizeText(opt.newDescription, { aggressionLevel: "moderate", contentType: "description" });
      return {
        videoId: vid.id,
        originalTitle: vid.title || "Untitled",
        newTitle: titleHumanized.humanized,
        newDescription: descHumanized.humanized,
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
      } catch (err) {
        logger.error("Failed to flag video for thumbnail refresh", { videoId: opt.videoId, error: String(err) });
      }

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
