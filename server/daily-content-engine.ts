import { db } from "./db";
import { videos, streams, autopilotQueue, channels, notifications } from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNotNull, ne, inArray } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { generateHumanScheduledTime } from "./human-behavior-engine";
import { sendSSEEvent } from "./routes/events";
import { shouldRunDailyContent } from "./priority-orchestrator";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { detectGamingContext, buildGamingPromptSection, detectContentContext, buildContentPromptSection, getNicheLabel, ContentContext } from "./ai-engine";
import { getActiveTrendOverride, getCooldownTrendOverrides, selectStreamByTrend, onStreamDetected } from "./trend-rider-engine";

const logger = createLogger("stream-exhaust");
const openai = getOpenAIClient();

function isVideoPostable(video: any): boolean {
  const meta = (video.metadata as any) || {};
  const privacy = meta.privacyStatus || "";

  if (privacy === "unlisted") {
    logger.info("Skipping unlisted video for content extraction", { videoId: video.id, title: video.title });
    return false;
  }

  if (privacy === "public") return true;

  if (privacy === "private") {
    logger.info("Skipping private video for content extraction", { videoId: video.id, title: video.title });
    return false;
  }

  return true;
}

const LONG_FORM_MAX_MINUTES = 15;
const SHORTS_PER_BATCH = 4;
const LONG_FORM_PER_BATCH = 1;
const MINUTES_PER_BATCH = 30;
const MAX_BATCHES_PER_RUN = 10;
const CORE_YOUTUBE_PER_DAY = 15; // 3 long-form + 12 shorts — constant content flow is top priority
const MAX_CROSS_POSTS_PER_DAY = 30;
const MAX_SCHEDULED_PER_DAY = CORE_YOUTUBE_PER_DAY + MAX_CROSS_POSTS_PER_DAY; // 45 total
const VIDEO_PLATFORMS = ["tiktok"];
const TEXT_PLATFORMS = ["x", "discord"];
const CROSS_PLATFORMS = [...VIDEO_PLATFORMS, ...TEXT_PLATFORMS];

async function getDailyCoreYouTubeCount(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      eq(autopilotQueue.targetPlatform, "youtube"),
      gte(autopilotQueue.scheduledAt, todayStart),
      lte(autopilotQueue.scheduledAt, todayEnd),
    ));
  return result?.count || 0;
}

async function getDailyCrossPostCount(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "scheduled"),
      sql`${autopilotQueue.targetPlatform} != 'youtube'`,
      gte(autopilotQueue.scheduledAt, todayStart),
      lte(autopilotQueue.scheduledAt, todayEnd),
    ));
  return result?.count || 0;
}

async function getDailyScheduledCount(userId: string): Promise<number> {
  const core = await getDailyCoreYouTubeCount(userId);
  const cross = await getDailyCrossPostCount(userId);
  return core + cross;
}

interface ContentPlan {
  longForm: {
    title: string;
    description: string;
    segments: Array<{ startMinute: number; endMinute: number; hook: string }>;
    totalDurationEstimate: string;
    tags: string[];
    thumbnailConcept: string;
    retentionBrief?: {
      hookStrategy?: string;
      reHookAt30s?: string;
      curiosityLoops?: string[];
      endScreenCTA?: string;
    };
    titleVariants?: string[];
  };
  shorts: Array<{
    title: string;
    description: string;
    startMinute: number;
    endMinute: number;
    hook: string;
    hashtags: string[];
    targetDuration: string;
    tiktokCaption?: string;
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

interface ConnectedPlatforms {
  all: string[];
  video: string[];
  text: string[];
}

async function getUserConnectedPlatforms(userId: string): Promise<ConnectedPlatforms> {
  const userChannels = await db
    .select({ platform: channels.platform, accessToken: channels.accessToken })
    .from(channels)
    .where(eq(channels.userId, userId));
  const connected = userChannels
    .filter(c => c.accessToken && CROSS_PLATFORMS.includes(c.platform))
    .map(c => c.platform);
  return {
    all: connected,
    video: connected.filter(p => VIDEO_PLATFORMS.includes(p)),
    text: connected.filter(p => TEXT_PLATFORMS.includes(p)),
  };
}

interface StreamWithRemaining {
  stream: typeof streams.$inferSelect;
  totalMinutes: number;
  extractedMinutes: number;
  remainingMinutes: number;
  nextSegmentStart: number;
}

async function getStreamsWithRemainingContent(userId: string): Promise<StreamWithRemaining[]> {
  const endedStreams = await db.select().from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      isNotNull(streams.startedAt),
      eq(streams.contentFullyExhausted, false),
    ))
    .orderBy(desc(streams.startedAt))
    .limit(100);

  const results: StreamWithRemaining[] = [];
  for (const stream of endedStreams) {
    if (!stream.startedAt || !stream.endedAt) continue;
    const totalMinutes = Math.floor(
      (new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000
    );
    if (totalMinutes < 5) continue;

    const extractedMinutes = stream.contentMinutesExtracted || 0;
    const remainingMinutes = totalMinutes - extractedMinutes;
    if (remainingMinutes < 1) {
      await db.update(streams)
        .set({ contentFullyExhausted: true })
        .where(eq(streams.id, stream.id));
      continue;
    }

    results.push({
      stream,
      totalMinutes,
      extractedMinutes,
      remainingMinutes,
      nextSegmentStart: extractedMinutes,
    });
  }

  return results;
}

async function getCurrentLiveStream(userId: string): Promise<typeof streams.$inferSelect | null> {
  const [live] = await db.select().from(streams)
    .where(and(eq(streams.userId, userId), eq(streams.status, "live")))
    .limit(1);
  return live || null;
}

async function generateBatchPlan(
  stream: StreamWithRemaining,
  batchNumber: number,
  userId?: string,
): Promise<ContentPlan | null> {
  const segStart = stream.nextSegmentStart;
  const availableMinutes = Math.min(stream.remainingMinutes, MINUTES_PER_BATCH);
  const segEnd = segStart + availableMinutes;

  const retentionContext = await getRetentionBeatsPromptContext(userId || undefined);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a team of world-class experts working together to create the most optimized YouTube content possible:

🎯 WORLD'S BEST SEO EXPERT: You reverse-engineer the YouTube algorithm. You know exactly which keywords rank, how to structure descriptions for maximum discoverability, and how to exploit search intent. Every tag is researched, every keyword is placed with surgical precision.

📝 WORLD'S BEST COPYWRITER: You write titles that are impossible to scroll past. You craft descriptions that convert viewers into subscribers. You use power words, emotional triggers, and curiosity gaps that outperform 99% of YouTube creators.

📊 WORLD'S BEST GROWTH HACKER: You understand viral mechanics — why some videos get 10M views and others get 100. You engineer shareability, re-watchability, and algorithmic favor into every piece of content.

🧠 WORLD'S BEST AUDIENCE PSYCHOLOGIST: You know exactly what makes viewers click, watch, and subscribe. You use proven psychological triggers — FOMO, curiosity gaps, pattern interrupts, emotional peaks — to maximize retention and engagement.

🎬 WORLD'S BEST CONTENT EDITOR: You identify the most compelling moments in raw footage — the standout moments, hilarious fails, emotional reactions, and "did that just happen?" moments that viewers share with friends.

STREAM INFO:
- Title: "${stream.stream.title}"
- Total Duration: ${stream.totalMinutes} minutes
- Current Segment: ${segStart} min to ${segEnd} min (${availableMinutes} min available)
- Batch #${batchNumber} from this stream
${buildContentPromptSection(detectContentContext(stream.stream.title, null, (stream.stream as any).category || null, { gameName: (stream.stream as any).gameName || null }))}
${retentionContext}

CONTENT-ADAPTIVE REQUIREMENTS:
- ALL content MUST be specifically about what happened in "${stream.stream.title}" — reference the actual topic, specific moments, and events.
- Do NOT create generic content. Every title, description, hook, and caption must relate to the SPECIFIC content of this stream segment.
- Use niche-specific terminology and community language relevant to this stream.

RULES:
- Long-form MUST NOT exceed ${LONG_FORM_MAX_MINUTES} minutes. Use segments from ${segStart}-${segEnd} minutes.
- Create exactly ${SHORTS_PER_BATCH} shorts (21-59 seconds each, sweet spot 30-45 seconds)
- All timestamps MUST be within the ${segStart}-${segEnd} minute range
- Titles: Use power words, numbers, emotional triggers, curiosity gaps. Under 60 chars. Front-load keywords. Examples: "I Can't Believe This Actually Worked..." or "This 1v4 Clutch Changed Everything"
- Descriptions: First 2 lines are CRITICAL (shown in search). Include primary keyword in first sentence. Add timestamps at retention beat markers. End with strong CTA (subscribe, comment, share). Include 3-5 related keyword phrases naturally. Add links section and social proof.
- Tags: 15-25 tags mixing broad niche keywords with specific long-tail keywords. Include topic/subject variations, trending terms, and competitor video tags.
- Shorts: Hook in first 0.5 seconds. Title must work as both a YouTube Short title AND TikTok caption. Hashtags must include trending + niche-specific tags.
- Each batch must feel like a FRESH standalone video
- CRITICAL: Structure every piece using retention beats. Hook must grab in first 3 seconds. Include pattern interrupts every 30-60 seconds in long-form.

Return ONLY valid JSON:
{
  "longForm": {
    "title": "string - irresistible clickbait title under 60 chars with power words and curiosity gap",
    "description": "string - SEO-optimized description: keyword-rich first 2 lines, timestamps at retention beats, hashtags, CTA, and social proof",
    "segments": [{"startMinute": number, "endMinute": number, "hook": "string - why this moment is compelling"}],
    "totalDurationEstimate": "string like 12:30",
    "tags": ["array of 15-25 SEO-optimized tags mixing broad and long-tail keywords"],
    "thumbnailConcept": "detailed thumbnail concept: emotion, composition, colors, focal point, contrast technique",
    "retentionBrief": {
      "hookStrategy": "exact first-3-second hook (what viewers see/hear to stop scrolling)",
      "reHookAt30s": "pattern interrupt at 30s to prevent early drop-off",
      "curiosityLoops": ["3 open questions/teases planted throughout to maintain watch time"],
      "endScreenCTA": "specific call-to-action driving to next video or subscribe"
    },
    "titleVariants": ["2 alternative titles for A/B testing with different hook types"]
  },
  "shorts": [
    {
      "title": "string - viral hook title under 50 chars with emotional trigger",
      "description": "string - SEO description with keywords and CTA",
      "startMinute": number,
      "endMinute": number,
      "hook": "what makes this moment impossible to scroll past",
      "hashtags": ["array of 5-8 hashtags mixing trending + niche"],
      "targetDuration": "string like 0:34",
      "tiktokCaption": "TikTok-optimized caption with hooks and trending hashtags"
    }
  ]
}`
        },
        {
          role: "user",
          content: `Create Batch #${batchNumber} YouTube content from stream "${stream.stream.title}". Use footage from minute ${segStart} to minute ${segEnd}. This is ${availableMinutes} minutes of footage. Make it feel fresh — these are brand new videos, not "part 2". Think of unique angles, compilation themes, or highlight moments.`
        }
      ],
      temperature: 0.85,
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

    if (plan.shorts.length > SHORTS_PER_BATCH) {
      plan.shorts = plan.shorts.slice(0, SHORTS_PER_BATCH);
    }

    return plan;
  } catch (err: any) {
    logger.error("Failed to generate batch plan", { error: err.message, batchNumber });
    return null;
  }
}

async function queueBatchContent(
  userId: string,
  plan: ContentPlan,
  stream: StreamWithRemaining,
  batchNumber: number,
  connectedPlatforms: ConnectedPlatforms,
): Promise<{ longFormQueued: boolean; shortsQueued: number; crossPostsQueued: number }> {
  let longFormQueued = false;
  let shortsQueued = 0;
  let crossPostsQueued = 0;
  const groupId = `exhaust-${stream.stream.id}-batch-${batchNumber}-${Date.now()}`;

  const longFormTime = generateHumanScheduledTime({
    platform: "youtube",
    userId,
    contentType: "new-video",
    urgency: "normal",
  });

  const allPlatforms = ["youtube", ...connectedPlatforms.all];

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
        contentCategory: "video",
        style: "highlight-reel",
        aiModel: "gpt-4o-mini",
        sourceStreamId: stream.stream.id,
        segmentStartMin: stream.nextSegmentStart,
        segmentEndMin: stream.nextSegmentStart + Math.min(stream.remainingMinutes, MINUTES_PER_BATCH),
        batchNumber,
        crossPlatformGroupId: groupId,
        crossLinkedPlatforms: allPlatforms,
        tags: plan.longForm.tags || [],
        retentionBeatsApplied: true,
        retentionBrief: plan.longForm.retentionBrief || null,
        titleVariants: plan.longForm.titleVariants || [],
        thumbnailConcept: plan.longForm.thumbnailConcept,
      },
    });
    longFormQueued = true;
  } catch (err: any) {
    logger.error("Failed to queue long-form", { userId, error: err.message });
  }

  for (let i = 0; i < plan.shorts.length; i++) {
    const short = plan.shorts[i];
    const shortTime = new Date(longFormTime.getTime() + (i + 1) * 60 * 60 * 1000 + Math.random() * 20 * 60 * 1000);

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
          contentCategory: "video",
          style: "short-clip",
          aiModel: "gpt-4o-mini",
          sourceStreamId: stream.stream.id,
          segmentStartMin: short.startMinute,
          segmentEndMin: short.endMinute,
          tags: short.hashtags?.map((h: string) => h.replace(/^#/, "")) || [],
          retentionBeatsApplied: true,
          batchNumber,
          crossPlatformGroupId: groupId,
          crossLinkedPlatforms: allPlatforms,
          tiktokCaption: short.tiktokCaption || null,
        },
      });
      shortsQueued++;
    } catch (err: any) {
      logger.error("Failed to queue short", { userId, index: i + 1, error: err.message });
    }
  }

  const crossPostBudget = MAX_CROSS_POSTS_PER_DAY - await getDailyCrossPostCount(userId);

  for (const platform of connectedPlatforms.video) {
    if (crossPostsQueued >= crossPostBudget) break;
    for (let i = 0; i < plan.shorts.length; i++) {
      if (crossPostsQueued >= crossPostBudget) break;
      const short = plan.shorts[i];
      const crossTime = new Date(longFormTime.getTime() + (i + 2) * 60 * 60 * 1000 + Math.random() * 45 * 60 * 1000);
      const platformCaption = platform === "tiktok"
        ? `${short.title} ${short.hashtags.map(h => `#${h.replace('#', '')}`).join(" ")} #fyp`
        : short.title;

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: null,
          type: "auto-clip",
          targetPlatform: platform,
          content: `${short.title}\n\n${short.description}\n\n${short.hashtags.join(" ")}`,
          caption: short.title,
          status: "scheduled",
          scheduledAt: crossTime,
          metadata: {
            contentType: "video-clip",
            contentCategory: "video",
            style: "short-clip",
            aiModel: "gpt-4o-mini",
            sourceStreamId: stream.stream.id,
            segmentStartMin: short.startMinute,
            segmentEndMin: short.endMinute,
            batchNumber,
            crossPlatformGroupId: groupId,
            tiktokCaption: short.tiktokCaption || platformCaption,
            retentionBeatsApplied: true,
          },
        });
        crossPostsQueued++;
      } catch (err: any) {
        logger.error("Failed to queue video cross-post", { platform, error: err.message });
      }
    }
  }

  for (const platform of connectedPlatforms.text) {
    if (crossPostsQueued >= crossPostBudget) break;
    const longFormAnnouncementTime = new Date(longFormTime.getTime() + 15 * 60 * 1000 + Math.random() * 30 * 60 * 1000);
    const topTags = plan.longForm.tags.slice(0, 3).map(t => `#${t.replace('#', '').replace(/\s+/g, '')}`).join(" ");
    let longFormAnnouncement: string;
    if (platform === "x") {
      longFormAnnouncement = `NEW VIDEO: ${plan.longForm.title}\n\n${plan.longForm.description.substring(0, 160)}\n\nWatch now on YouTube!\n${topTags}`;
      if (longFormAnnouncement.length > 280) longFormAnnouncement = longFormAnnouncement.substring(0, 277) + "...";
    } else {
      longFormAnnouncement = `**NEW VIDEO**\n\n**${plan.longForm.title}**\n\n${plan.longForm.description.substring(0, 800)}\n\n${topTags}\n\nWatch now on YouTube!`;
      if (longFormAnnouncement.length > 2000) longFormAnnouncement = longFormAnnouncement.substring(0, 1997) + "...";
    }

    try {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: null,
        type: "cross-post",
        targetPlatform: platform,
        content: longFormAnnouncement,
        caption: `New: ${plan.longForm.title}`,
        status: "scheduled",
        scheduledAt: longFormAnnouncementTime,
        metadata: {
          contentType: "text-announcement",
          contentCategory: "text",
          style: "announcement",
          aiModel: "gpt-4o-mini",
          sourceStreamId: stream.stream.id,
          batchNumber,
          crossPlatformGroupId: groupId,
        },
      });
      crossPostsQueued++;
    } catch (err: any) {
      logger.error("Failed to queue text announcement", { platform, error: err.message });
    }

    for (let i = 0; i < plan.shorts.length; i++) {
      const short = plan.shorts[i];
      const crossTime = new Date(longFormTime.getTime() + (i + 3) * 60 * 60 * 1000 + Math.random() * 45 * 60 * 1000);
      let textContent: string;
      if (platform === "x") {
        textContent = `${short.hook}\n\n${short.hashtags.slice(0, 3).join(" ")}\n\nFull video on YouTube`;
        if (textContent.length > 280) textContent = textContent.substring(0, 277) + "...";
      } else {
        textContent = `**${short.title}**\n\n${short.hook}\n\n${short.hashtags.slice(0, 5).join(" ")}\n\nCheck it out on YouTube!`;
        if (textContent.length > 2000) textContent = textContent.substring(0, 1997) + "...";
      }

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: null,
          type: "cross-post",
          targetPlatform: platform,
          content: textContent,
          caption: short.title,
          status: "scheduled",
          scheduledAt: crossTime,
          metadata: {
            contentType: "text-teaser",
            contentCategory: "text",
            style: "teaser",
            aiModel: "gpt-4o-mini",
            sourceStreamId: stream.stream.id,
            segmentStartMin: short.startMinute,
            segmentEndMin: short.endMinute,
            batchNumber,
            crossPlatformGroupId: groupId,
          },
        });
        crossPostsQueued++;
      } catch (err: any) {
        logger.error("Failed to queue text cross-post", { platform, error: err.message });
      }
    }
  }

  const batchEnd = stream.nextSegmentStart + Math.min(stream.remainingMinutes, MINUTES_PER_BATCH);
  const allSegments = [
    ...plan.longForm.segments.map(s => ({ start: s.startMinute, end: s.endMinute })),
    ...plan.shorts.map(s => ({ start: s.startMinute, end: s.endMinute })),
  ];
  const maxEndMinute = allSegments.length > 0
    ? Math.max(batchEnd, ...allSegments.map(s => s.end))
    : batchEnd;
  const minutesConsumed = Math.max(MINUTES_PER_BATCH, maxEndMinute - stream.nextSegmentStart);
  const clampedConsumed = Math.min(minutesConsumed, stream.remainingMinutes);
  const newTotal = (stream.extractedMinutes || 0) + clampedConsumed;
  const fullyExhausted = newTotal >= stream.totalMinutes - 1;

  await db.update(streams)
    .set({
      contentMinutesExtracted: newTotal,
      contentFullyExhausted: fullyExhausted,
    })
    .where(eq(streams.id, stream.stream.id));

  logger.info("Batch queued + stream progress updated", {
    streamId: stream.stream.id,
    batchNumber,
    minutesConsumed,
    totalExtracted: newTotal,
    totalMinutes: stream.totalMinutes,
    fullyExhausted,
    crossPostsQueued,
  });

  return { longFormQueued, shortsQueued, crossPostsQueued };
}

async function getLiveStreamAsExhaustCandidate(userId: string): Promise<StreamWithRemaining | null> {
  const live = await getCurrentLiveStream(userId);
  if (!live || !live.startedAt) return null;

  const elapsedMinutes = Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 60000);
  const extracted = live.contentMinutesExtracted || 0;
  const availableMinutes = elapsedMinutes - extracted - 10;
  if (availableMinutes < MINUTES_PER_BATCH) return null;

  return {
    stream: live,
    totalMinutes: elapsedMinutes,
    extractedMinutes: extracted,
    remainingMinutes: availableMinutes,
    nextSegmentStart: extracted,
  };
}

export async function runSingleBatchForUser(userId: string): Promise<{ didWork: boolean; exhausted: boolean }> {
  try {
    const coreCount = await getDailyCoreYouTubeCount(userId);
    if (coreCount >= CORE_YOUTUBE_PER_DAY) {
      logger.info("Daily core YouTube limit reached (1 longform + 4 shorts already scheduled), pausing", { userId, coreCount, limit: CORE_YOUTUBE_PER_DAY });
      return { didWork: false, exhausted: true };
    }

    const connectedPlatforms = await getUserConnectedPlatforms(userId);
    const liveCandidate = await getLiveStreamAsExhaustCandidate(userId);
    const endedStreams = await getStreamsWithRemainingContent(userId);

    let streamsWithContent: StreamWithRemaining[] = [];
    if (liveCandidate) streamsWithContent.push(liveCandidate);
    streamsWithContent.push(...endedStreams);

    if (streamsWithContent.length === 0) {
      return { didWork: false, exhausted: true };
    }

    const activeTrend = await getActiveTrendOverride(userId);
    const cooldownTrends = await getCooldownTrendOverrides(userId);
    streamsWithContent = selectStreamByTrend(streamsWithContent, activeTrend, cooldownTrends) as StreamWithRemaining[];

    const streamData = streamsWithContent[0];

    const existingBatches = await db
      .select({ count: sql<number>`count(DISTINCT (${autopilotQueue.metadata}->>'batchNumber'))::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        sql`${autopilotQueue.metadata}->>'sourceStreamId' = ${String(streamData.stream.id)}`,
      ));

    const batchNumber = (existingBatches[0]?.count || 0) + 1;

    logger.info("Loop: generating batch from stream", {
      userId,
      streamId: streamData.stream.id,
      batchNumber,
      remainingMinutes: streamData.remainingMinutes,
    });

    const plan = await generateBatchPlan(streamData, batchNumber, userId);
    if (!plan) {
      if (streamsWithContent.length > 1) {
        const consumed = Math.min(streamData.remainingMinutes, MINUTES_PER_BATCH);
        const newTotal = (streamData.extractedMinutes || 0) + consumed;
        await db.update(streams).set({
          contentMinutesExtracted: newTotal,
          contentFullyExhausted: newTotal >= streamData.totalMinutes - 1,
        }).where(eq(streams.id, streamData.stream.id));
        logger.info("Plan generation failed, advancing stream and will retry next stream", { streamId: streamData.stream.id });
        return { didWork: false, exhausted: false };
      }
      return { didWork: false, exhausted: false };
    }

    const result = await queueBatchContent(userId, plan, streamData, batchNumber, connectedPlatforms);

    const ytCount = (result.longFormQueued ? 1 : 0) + result.shortsQueued;
    logger.info("Loop: batch queued", {
      userId,
      batchNumber,
      youtubeItems: ytCount,
      crossPosts: result.crossPostsQueued,
    });

    const remainingAfter = Math.max(0, streamData.remainingMinutes - Math.min(streamData.remainingMinutes, MINUTES_PER_BATCH));
    await notify(
      userId,
      `Content Batch #${batchNumber} from "${streamData.stream.title}"`,
      `Queued ${ytCount} YouTube pieces + ${result.crossPostsQueued} cross-platform posts. ${Math.round(remainingAfter)} min remaining.`,
      "info",
    );

    sendSSEEvent(userId, "content-update", { source: "content-loop", batches: 1 });
    sendSSEEvent(userId, "autopilot-update", { source: "content-loop" });

    const allExhausted = remainingAfter < 1 && streamsWithContent.length <= 1;

    return { didWork: true, exhausted: allExhausted };
  } catch (err: any) {
    logger.error("Loop: single batch failed", { userId, error: err.message });
    return { didWork: false, exhausted: false };
  }
}

export async function runDailyContentGeneration(): Promise<void> {
  logger.info("Stream Exhaust Engine cycle starting");

  const userIds = await getUserIdsWithYouTube();
  if (userIds.length === 0) {
    logger.info("No users with YouTube channels found");
    return;
  }

  for (const userId of userIds) {
    try {
      const coreCount = await getDailyCoreYouTubeCount(userId);
      if (coreCount >= CORE_YOUTUBE_PER_DAY) {
        logger.info("Daily core YouTube limit reached, skipping user", { userId, coreCount, limit: CORE_YOUTUBE_PER_DAY });
        continue;
      }

      const connectedPlatforms = await getUserConnectedPlatforms(userId);

      const liveCandidate = await getLiveStreamAsExhaustCandidate(userId);
      if (liveCandidate) {
        logger.info("Live stream has harvestable footage", {
          userId,
          streamId: liveCandidate.stream.id,
          elapsedMinutes: liveCandidate.totalMinutes,
          availableMinutes: liveCandidate.remainingMinutes,
        });
      }

      const endedStreams = shouldRunDailyContent(userId)
        ? await getStreamsWithRemainingContent(userId)
        : [];

      let streamsWithContent: StreamWithRemaining[] = [];
      if (liveCandidate) streamsWithContent.push(liveCandidate);
      streamsWithContent.push(...endedStreams);

      if (streamsWithContent.length === 0) {
        logger.info("No streams with remaining content to exhaust", { userId });
        continue;
      }

      const activeTrend = await getActiveTrendOverride(userId);
      const cooldownTrends = await getCooldownTrendOverrides(userId);
      streamsWithContent = selectStreamByTrend(streamsWithContent, activeTrend, cooldownTrends) as StreamWithRemaining[];

      let totalBatchesThisRun = 0;

      for (const streamData of streamsWithContent) {
        if (totalBatchesThisRun >= MAX_BATCHES_PER_RUN) {
          logger.info("Max batches per run reached, saving rest for next cycle", { userId });
          break;
        }

        const existingBatches = await db
          .select({ count: sql<number>`count(DISTINCT (${autopilotQueue.metadata}->>'batchNumber'))::int` })
          .from(autopilotQueue)
          .where(and(
            eq(autopilotQueue.userId, userId),
            sql`${autopilotQueue.metadata}->>'sourceStreamId' = ${String(streamData.stream.id)}`,
          ));

        const batchNumber = (existingBatches[0]?.count || 0) + 1;

        logger.info("Generating batch from stream", {
          userId,
          streamId: streamData.stream.id,
          streamTitle: streamData.stream.title,
          batchNumber,
          remainingMinutes: streamData.remainingMinutes,
          totalMinutes: streamData.totalMinutes,
        });

        const plan = await generateBatchPlan(streamData, batchNumber, userId);
        if (!plan) {
          logger.warn("Could not generate batch plan, skipping stream", {
            userId,
            streamId: streamData.stream.id,
          });
          continue;
        }

        const result = await queueBatchContent(userId, plan, streamData, batchNumber, connectedPlatforms);
        totalBatchesThisRun++;

        const ytCount = (result.longFormQueued ? 1 : 0) + result.shortsQueued;
        const totalPieces = ytCount + result.crossPostsQueued;

        logger.info("Batch complete", {
          userId,
          streamId: streamData.stream.id,
          batchNumber,
          youtubeItems: ytCount,
          crossPosts: result.crossPostsQueued,
          totalPieces,
        });

        await notify(
          userId,
          `Content Batch #${batchNumber} from "${streamData.stream.title}"`,
          `Queued ${ytCount} YouTube pieces + ${result.crossPostsQueued} cross-platform posts. ${Math.round(streamData.remainingMinutes - MINUTES_PER_BATCH)} min of stream footage remaining.`,
          "info",
        );
      }

      if (totalBatchesThisRun > 0) {
        logger.info("Stream exhaust cycle complete for user", { userId, batchesGenerated: totalBatchesThisRun });
        sendSSEEvent(userId, "content-update", { source: "stream-exhaust", batches: totalBatchesThisRun });
        sendSSEEvent(userId, "autopilot-update", { source: "stream-exhaust" });
      }
    } catch (err: any) {
      logger.error("Stream exhaust failed for user", { userId, error: err.message });
    }
  }

  logger.info("Stream Exhaust Engine cycle complete");
}

export async function getStreamExhaustStatus(userId: string): Promise<{
  activeStreamsWithContent: number;
  totalRemainingMinutes: number;
  totalExtractedMinutes: number;
  totalStreamMinutes: number;
  exhaustPercentage: number;
  batchesQueued: number;
  nextBatchEta: string;
  streams: Array<{
    id: number;
    title: string;
    totalMinutes: number;
    extractedMinutes: number;
    remainingMinutes: number;
    exhausted: boolean;
  }>;
}> {
  const allStreams = await db.select().from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      isNotNull(streams.startedAt),
    ))
    .orderBy(desc(streams.startedAt))
    .limit(100);

  let totalRemaining = 0;
  let totalExtracted = 0;
  let totalStreamMinutes = 0;
  let activeCount = 0;
  const streamList: any[] = [];

  for (const stream of allStreams) {
    if (!stream.startedAt || !stream.endedAt) continue;
    const total = Math.floor(
      (new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000
    );
    const extracted = stream.contentMinutesExtracted || 0;
    const remaining = Math.max(0, total - extracted);
    const exhausted = stream.contentFullyExhausted || false;

    totalStreamMinutes += total;
    totalExtracted += extracted;
    totalRemaining += remaining;
    if (!exhausted && remaining >= 1) activeCount++;

    streamList.push({
      id: stream.id,
      title: stream.title,
      totalMinutes: total,
      extractedMinutes: extracted,
      remainingMinutes: remaining,
      exhausted,
    });
  }

  const [batchCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      sql`${autopilotQueue.metadata}->>'sourceStreamId' IS NOT NULL`,
    ));

  return {
    activeStreamsWithContent: activeCount,
    totalRemainingMinutes: totalRemaining,
    totalExtractedMinutes: totalExtracted,
    totalStreamMinutes,
    exhaustPercentage: totalStreamMinutes > 0 ? Math.round((totalExtracted / totalStreamMinutes) * 100) : 0,
    batchesQueued: batchCount?.count || 0,
    nextBatchEta: "Runs every 2 hours",
    streams: streamList,
  };
}

export async function getDailyContentStatus(userId: string): Promise<{
  active: boolean;
  launchDate: string;
  todayPlanned: boolean;
  longFormPerDay: number;
  shortsPerDay: number;
  maxLongFormMinutes: number;
  todayItems: number;
  streamExhaust: Awaited<ReturnType<typeof getStreamExhaustStatus>>;
}> {
  const active = true;

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
    ));

  const streamExhaust = await getStreamExhaustStatus(userId);

  return {
    active,
    launchDate: "2026-02-20T00:00:00.000Z",
    todayPlanned: (todayCount?.count || 0) >= (LONG_FORM_PER_BATCH + SHORTS_PER_BATCH),
    longFormPerDay: LONG_FORM_PER_BATCH,
    shortsPerDay: SHORTS_PER_BATCH,
    maxLongFormMinutes: LONG_FORM_MAX_MINUTES,
    todayItems: todayCount?.count || 0,
    streamExhaust,
  };
}

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 60 + minutes + Math.ceil(seconds / 60);
}

export async function bridgeVodsToStreams(userId: string): Promise<number> {
  const existingStreamVodIds = await db
    .select({ vodVideoId: streams.vodVideoId })
    .from(streams)
    .where(and(eq(streams.userId, userId), isNotNull(streams.vodVideoId)));
  const linkedVodIds = new Set(existingStreamVodIds.map(r => r.vodVideoId).filter(Boolean));

  const userChannels = await db.select({ id: channels.id }).from(channels)
    .where(eq(channels.userId, userId));
  if (userChannels.length === 0) return 0;
  const channelIds = userChannels.map(c => c.id);

  const longVods = await db.select().from(videos)
    .where(and(
      inArray(videos.channelId, channelIds),
      eq(videos.platform, "youtube"),
      eq(videos.type, "long"),
    ))
    .orderBy(desc(videos.createdAt));

  const MIN_STREAM_MINUTES = 20;
  let created = 0;

  for (const vod of longVods) {
    if (linkedVodIds.has(vod.id)) continue;
    if (!isVideoPostable(vod)) continue;

    const meta = (vod.metadata as any) || {};
    const durationStr = meta.duration || meta.contentDetails?.duration || "";
    const totalMinutes = parseIsoDuration(durationStr);

    if (totalMinutes < MIN_STREAM_MINUTES) continue;

    const publishedAt = meta.publishedAt ? new Date(meta.publishedAt) : vod.createdAt;
    const endedAt = new Date(publishedAt!.getTime() + totalMinutes * 60 * 1000);

    try {
      await db.insert(streams).values({
        userId,
        title: vod.title,
        description: vod.description || "",
        category: meta.categoryId || null,
        status: "ended",
        thumbnailUrl: vod.thumbnailUrl || meta.thumbnails?.high?.url || null,
        platforms: ["youtube"],
        startedAt: publishedAt,
        endedAt,
        detectedSource: "vod-bridge",
        isAutoDetected: true,
        vodVideoId: vod.id,
        contentMinutesExtracted: 0,
        contentFullyExhausted: false,
      });
      created++;
      linkedVodIds.add(vod.id);
      logger.info("VOD bridged to stream record", {
        userId,
        videoId: vod.id,
        title: vod.title,
        totalMinutes,
      });

      try {
        const [newStream] = await db.select().from(streams)
          .where(and(eq(streams.userId, userId), eq(streams.vodVideoId, vod.id)))
          .limit(1);
        if (newStream) {
          onStreamDetected(userId, newStream).catch(err =>
            logger.error("Trend detection on bridged VOD failed", { error: String(err) })
          );
        }
      } catch {}
    } catch (err: any) {
      logger.error("Failed to bridge VOD to stream", { videoId: vod.id, error: err.message });
    }
  }

  if (created > 0) {
    logger.info("VOD-to-Stream bridge complete", { userId, newStreams: created });
  }

  return created;
}
