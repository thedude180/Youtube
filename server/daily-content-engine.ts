import { db } from "./db";
import { videos, streams, contentClips, autopilotQueue, channels, notifications } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNotNull } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { storage } from "./storage";
import { generateHumanScheduledTime } from "./human-behavior-engine";
import { sendSSEEvent } from "./routes/events";
import { shouldRunDailyContent } from "./priority-orchestrator";

const logger = createLogger("daily-content");
const openai = getOpenAIClient();

const LAUNCH_DATE = new Date("2026-02-20T00:00:00Z");
const LONG_FORM_MAX_MINUTES = 15;
const SHORTS_PER_DAY = 3;
const LONG_FORM_PER_DAY = 1;

interface ContentPlan {
  longForm: {
    title: string;
    description: string;
    segments: Array<{ sourceTitle: string; startTime: string; endTime: string; hook: string }>;
    totalDurationEstimate: string;
    tags: string[];
    thumbnailConcept: string;
  };
  shorts: Array<{
    title: string;
    description: string;
    sourceTitle: string;
    startTime: string;
    endTime: string;
    hook: string;
    hashtags: string[];
    targetDuration: string;
  }>;
}

async function notify(userId: string, title: string, message: string, severity: string) {
  await db.insert(notifications).values({ userId, type: "autopilot", title, message, severity });
  sendSSEEvent(userId, "notification", { type: "new" });
}

async function getUserIdsWithYouTube(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(eq(channels.platform, "youtube"));
  return rows.map(r => r.userId).filter((id): id is string => !!id);
}

async function getAvailableSourceContent(userId: string) {
  const userChannelIds = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId)));

  const channelIds = userChannelIds.map(c => c.id);

  let userVideos: any[] = [];
  if (channelIds.length > 0) {
    userVideos = await db.select().from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(50);
    userVideos = userVideos.filter(v => channelIds.includes(v.channelId));
  }

  const userStreams = await db.select().from(streams)
    .where(and(eq(streams.userId, userId), isNotNull(streams.endedAt)))
    .orderBy(desc(streams.startedAt))
    .limit(20);

  return { videos: userVideos, streams: userStreams };
}

async function getUsedContentIds(userId: string): Promise<Set<string>> {
  const recentPosts = await db.select({ sourceVideoId: autopilotQueue.sourceVideoId })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      gte(autopilotQueue.createdAt, new Date(Date.now() - 7 * 86400000)),
    ));

  return new Set(recentPosts.map(p => String(p.sourceVideoId)).filter(s => s !== "null"));
}

async function generateDailyContentPlan(
  sourceContent: { videos: any[]; streams: any[] },
  usedIds: Set<string>,
): Promise<ContentPlan | null> {
  const available = [
    ...sourceContent.streams.map(s => ({
      id: String(s.id),
      title: s.title || "Untitled Stream",
      description: s.description || "",
      type: "livestream" as const,
      duration: s.endedAt && s.startedAt
        ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
        : null,
    })),
    ...sourceContent.videos.map(v => ({
      id: String(v.id),
      title: v.title || "Untitled Video",
      description: v.description || "",
      type: (v.type === "live-stream" ? "livestream" : "video") as "livestream" | "video",
      duration: (v.metadata as any)?.duration
        ? parseInt(String((v.metadata as any).duration))
        : null,
    })),
  ];

  const unused = available.filter(item => !usedIds.has(item.id));
  const pool = unused.length > 0 ? unused : available;

  if (pool.length === 0) return null;

  const contentList = pool.slice(0, 15).map((item, i) =>
    `${i + 1}. [${item.type.toUpperCase()}] "${item.title}" - ${item.duration ? `${item.duration} min` : "unknown duration"} - ${item.description.substring(0, 100)}`
  ).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a top-tier YouTube content strategist specializing in gaming content. Your job is to plan daily content that maximizes watch time, engagement, and algorithmic favor.

Rules:
- Long-form video MUST NOT exceed ${LONG_FORM_MAX_MINUTES} minutes total
- Create exactly ${SHORTS_PER_DAY} shorts (21-59 seconds each, sweet spot is 30-45 seconds)
- Long-form should be a highlight compilation or themed edit from livestream/video footage
- Shorts should be the most exciting, funny, or skill-showcasing moments
- Every title must be clickbait-worthy but honest
- Use timestamps from the source content for segment references
- Gaming content should emphasize epic moments, fails, clutch plays, reactions
- Include trending hooks and patterns from current YouTube gaming meta

Return ONLY valid JSON matching this structure:
{
  "longForm": {
    "title": "string - clickbait title under 60 chars",
    "description": "string - SEO optimized description",
    "segments": [{"sourceTitle": "string", "startTime": "MM:SS", "endTime": "MM:SS", "hook": "what makes this segment exciting"}],
    "totalDurationEstimate": "string like 12:30",
    "tags": ["array of SEO tags"],
    "thumbnailConcept": "description of ideal thumbnail"
  },
  "shorts": [
    {
      "title": "string - hook title under 50 chars",
      "description": "string",
      "sourceTitle": "string - which source video/stream",
      "startTime": "MM:SS",
      "endTime": "MM:SS",
      "hook": "what makes this viral-worthy",
      "hashtags": ["array"],
      "targetDuration": "string like 0:34"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Plan today's YouTube content (1 long-form max ${LONG_FORM_MAX_MINUTES} min + ${SHORTS_PER_DAY} shorts) using these available source materials:\n\n${contentList}\n\nPrioritize livestream footage. Use every available minute of content. Make it gaming-focused and designed to grow the channel fast.`
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error("AI returned non-JSON content plan", { text: text.substring(0, 200) });
      return null;
    }

    const plan = JSON.parse(jsonMatch[0]) as ContentPlan;

    if (!plan.longForm?.title || !plan.shorts || plan.shorts.length === 0) {
      logger.error("AI content plan missing required fields");
      return null;
    }

    if (plan.shorts.length > SHORTS_PER_DAY) {
      plan.shorts = plan.shorts.slice(0, SHORTS_PER_DAY);
    }

    return plan;
  } catch (err: any) {
    logger.error("Failed to generate content plan", { error: err.message });
    return null;
  }
}

async function queueContentForDay(userId: string, plan: ContentPlan): Promise<{ longFormQueued: boolean; shortsQueued: number }> {
  let longFormQueued = false;
  let shortsQueued = 0;

  const longFormTime = generateHumanScheduledTime({
    platform: "youtube",
    userId,
    contentType: "new-video",
    urgency: "normal",
  });

  try {
    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: null,
      type: "auto-clip",
      targetPlatform: "youtube",
      content: plan.longForm.description,
      caption: plan.longForm.title,
      status: "scheduled",
      scheduledAt: longFormTime,
      metadata: {
        contentType: "long-form-compilation",
        style: "highlight-reel",
        aiModel: "gpt-4o-mini",
      } as any,
    });
    longFormQueued = true;
    logger.info("Queued long-form video", { userId, title: plan.longForm.title, scheduledAt: longFormTime });
  } catch (err: any) {
    logger.error("Failed to queue long-form", { userId, error: err.message });
  }

  for (let i = 0; i < plan.shorts.length; i++) {
    const short = plan.shorts[i];
    const shortTime = new Date(longFormTime.getTime() + (i + 1) * 90 * 60 * 1000 + Math.random() * 30 * 60 * 1000);

    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: null,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: `${short.title}\n\n${short.description}\n\n${short.hashtags.join(" ")}`,
        caption: short.title,
        status: "scheduled",
        scheduledAt: shortTime,
        metadata: {
          contentType: "youtube-short",
          style: "short-clip",
          aiModel: "gpt-4o-mini",
        } as any,
      });
      shortsQueued++;
      logger.info("Queued YouTube Short", { userId, title: short.title, index: i + 1, scheduledAt: shortTime });
    } catch (err: any) {
      logger.error("Failed to queue short", { userId, index: i + 1, error: err.message });
    }
  }

  return { longFormQueued, shortsQueued };
}

async function hasContentForToday(userId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      gte(autopilotQueue.scheduledAt, todayStart),
      lte(autopilotQueue.scheduledAt, todayEnd),
      sql`${autopilotQueue.metadata}->>'contentType' IN ('long-form-compilation', 'youtube-short')`,
    ));

  return (existing?.count || 0) >= (LONG_FORM_PER_DAY + SHORTS_PER_DAY);
}

export async function runDailyContentGeneration(): Promise<void> {
  const now = new Date();

  if (now < LAUNCH_DATE) {
    logger.info("Daily content engine not yet active", { launchDate: LAUNCH_DATE.toISOString(), now: now.toISOString() });
    return;
  }

  logger.info("Starting daily content generation cycle");

  const userIds = await getUserIdsWithYouTube();
  if (userIds.length === 0) {
    logger.info("No users with YouTube channels found");
    return;
  }

  for (const userId of userIds) {
    try {
      if (!shouldRunDailyContent(userId)) {
        logger.info("Daily content skipped (livestream active)", { userId });
        continue;
      }

      const alreadyPlanned = await hasContentForToday(userId);
      if (alreadyPlanned) {
        logger.info("Content already planned for today", { userId });
        continue;
      }

      const sourceContent = await getAvailableSourceContent(userId);
      if (sourceContent.videos.length === 0 && sourceContent.streams.length === 0) {
        logger.info("No source content available", { userId });
        continue;
      }

      const usedIds = await getUsedContentIds(userId);
      const plan = await generateDailyContentPlan(sourceContent, usedIds);

      if (!plan) {
        logger.warn("Could not generate content plan", { userId });
        continue;
      }

      const result = await queueContentForDay(userId, plan);
      logger.info("Daily content queued", {
        userId,
        longForm: result.longFormQueued,
        shorts: result.shortsQueued,
        totalItems: (result.longFormQueued ? 1 : 0) + result.shortsQueued,
      });

      await notify(
        userId,
        "Daily content plan ready",
        `Queued ${result.longFormQueued ? "1 long-form (max 15 min)" : "0 long-form"} + ${result.shortsQueued} shorts for YouTube today. Priority: TOP.`,
        "info",
      );
    } catch (err: any) {
      logger.error("Daily content generation failed for user", { userId, error: err.message });
    }
  }

  logger.info("Daily content generation cycle complete");
}

export async function getDailyContentStatus(userId: string): Promise<{
  active: boolean;
  launchDate: string;
  todayPlanned: boolean;
  longFormPerDay: number;
  shortsPerDay: number;
  maxLongFormMinutes: number;
  todayItems: number;
}> {
  const now = new Date();
  const active = now >= LAUNCH_DATE;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      gte(autopilotQueue.scheduledAt, todayStart),
      lte(autopilotQueue.scheduledAt, todayEnd),
      sql`${autopilotQueue.metadata}->>'contentType' IN ('long-form-compilation', 'youtube-short')`,
    ));

  return {
    active,
    launchDate: LAUNCH_DATE.toISOString(),
    todayPlanned: (todayCount?.count || 0) >= (LONG_FORM_PER_DAY + SHORTS_PER_DAY),
    longFormPerDay: LONG_FORM_PER_DAY,
    shortsPerDay: SHORTS_PER_DAY,
    maxLongFormMinutes: LONG_FORM_MAX_MINUTES,
    todayItems: todayCount?.count || 0,
  };
}
