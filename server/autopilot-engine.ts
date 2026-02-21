import { db } from "./db";
import { autopilotQueue, commentResponses, autopilotConfig, videos, channels, notifications, streams, PLATFORM_CAPABILITIES, VIDEO_PLATFORMS, TEXT_ONLY_PLATFORMS, LIVE_STREAM_PLATFORMS } from "@shared/schema";
import { eq, and, desc, lte, sql, gte } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClient } from "./lib/openai";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import { createLogger } from "./lib/logger";
import { storage } from "./storage";

const logger = createLogger("autopilot");
import {
  getAudienceDrivenTime,
  getAudienceDrivenStaggeredSchedule,
  addHumanMicroDelay,
  shouldPostToday,
  getActivityWindow,
  calculateDailyPostBudget,
  getCommentResponseDelay,
  simulateTypingDelay,
} from "./human-behavior-engine";
import {
  generateUniqueContent,
  checkContentSafety,
  getStealthReport,
  getUserChannelLinks,
  type ChannelLinks,
} from "./content-variation-engine";
import { getKeywordContext } from "./services/keyword-learning-engine";
import { trafficStrategies } from "@shared/schema";

function buildVideoUrl(video: any): string | undefined {
  const meta = video?.metadata as any;
  const youtubeId = meta?.youtubeId || meta?.youtubeVideoId || meta?.externalId;
  if (youtubeId) return `https://youtu.be/${youtubeId}`;
  if (meta?.shortLink) return meta.shortLink;
  if (meta?.externalUrl) return meta.externalUrl;
  if (meta?.url) return meta.url;
  if (video?.filePath && /youtube\.com|youtu\.be/.test(video.filePath)) return video.filePath;
  return undefined;
}

async function getTrafficStrategyContext(userId: string): Promise<string> {
  try {
    const activeStrategies = await db.select().from(trafficStrategies)
      .where(and(eq(trafficStrategies.userId, userId), eq(trafficStrategies.status, "active")))
      .orderBy(desc(trafficStrategies.priority))
      .limit(3);
    if (activeStrategies.length === 0) return "";
    const lines = activeStrategies.map(s => `- ${s.strategyType}: ${s.title}${s.description ? ` (${s.description.slice(0, 100)})` : ""}`);
    return `CURRENT TRAFFIC GROWTH FOCUS (align content with these strategies when naturally relevant):\n${lines.join("\n")}\nOnly reference these themes if they fit the content naturally — never force them.`;
  } catch {
    return "";
  }
}

const openai = getOpenAIClient();

const AUTOPILOT_FEATURES = [
  "auto-clip",
  "smart-schedule",
  "comment-responder",
  "discord-announce",
  "content-recycler",
  "cross-promo",
  "stealth-mode",
] as const;

type AutopilotFeature = typeof AUTOPILOT_FEATURES[number];

const ALL_DISTRIBUTION_PLATFORMS = ["x", "discord", "tiktok"];
const ALL_ANNOUNCE_PLATFORMS = ["x", "discord"];

function getContentTypeForPlatform(platform: string, sourceContentType: string): "video" | "text" | "short_video" {
  const caps = PLATFORM_CAPABILITIES[platform as keyof typeof PLATFORM_CAPABILITIES];
  if (!caps) return "text";

  const isVideoSource = ["new-video", "post-stream", "auto-clip"].includes(sourceContentType);
  const isLiveSource = sourceContentType === "go-live";

  if (isVideoSource) {
    if (caps.supports.includes("short_video")) return "short_video";
    if (caps.supports.includes("video")) return "video";
    return "text";
  }

  if (isLiveSource) {
    return "text";
  }

  if (sourceContentType === "recycle" || sourceContentType === "cross-promo") {
    if (caps.supports.includes("short_video")) return "short_video";
    if (caps.supports.includes("video")) return "video";
    return "text";
  }

  return caps.primaryType === "video" ? "video" : "text";
}

function getPlatformsForContentType(contentType: string, connectedPlatforms: Set<string>): { videoPlatforms: string[]; textPlatforms: string[] } {
  const videoPlatforms: string[] = [];
  const textPlatforms: string[] = [];

  for (const platform of ALL_DISTRIBUTION_PLATFORMS) {
    if (!connectedPlatforms.has(platform)) continue;
    const deliveryType = getContentTypeForPlatform(platform, contentType);
    if (deliveryType === "video" || deliveryType === "short_video") {
      videoPlatforms.push(platform);
    } else {
      textPlatforms.push(platform);
    }
  }

  return { videoPlatforms, textPlatforms };
}

async function getUserConnectedPlatforms(userId: string): Promise<Set<string>> {
  const userChannels = await db.select({ platform: channels.platform, accessToken: channels.accessToken, platformData: channels.platformData })
    .from(channels)
    .where(eq(channels.userId, userId));
  return new Set(userChannels.filter(c => {
    if (!c.accessToken) return false;
    const pd = (c.platformData || {}) as any;
    if (pd._connectionStatus === "expired") return false;
    return true;
  }).map(c => c.platform));
}

async function getAutopilotConfig(userId: string, feature: AutopilotFeature) {
  const [config] = await db
    .select()
    .from(autopilotConfig)
    .where(and(eq(autopilotConfig.userId, userId), eq(autopilotConfig.feature, feature)));
  return config;
}

async function getCreatorTone(userId: string): Promise<string> {
  try {
    const [style, humanization] = await Promise.all([
      getCreatorStyleContext(userId),
      buildHumanizationPrompt(userId),
    ]);
    return [style, humanization].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

async function generateWithAI(prompt: string, systemMsg: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 500,
    });
    return response.choices[0]?.message?.content || "";
  } catch (err) {
    logger.error("AI generation error", { error: String(err) });
    return "";
  }
}

export async function processNewVideoUpload(userId: string, videoId: number) {
  logger.info("Processing new video upload", { videoId, userId });

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return;

  const creatorTone = await getCreatorTone(userId);

  const autoClipConfig = await getAutopilotConfig(userId, "auto-clip");
  if (!autoClipConfig || autoClipConfig.enabled !== false) {
    const platforms = (autoClipConfig?.settings as any)?.platforms || ALL_DISTRIBUTION_PLATFORMS;
    await generateFullThrottleDistribution(userId, video, creatorTone, platforms, "new-video");
  }

  const discordConfig = await getAutopilotConfig(userId, "discord-announce");
  if (!discordConfig || discordConfig.enabled !== false) {
    await generateDiscordAnnouncement(userId, video, creatorTone);
  }

  const meta = video.metadata as any;
  const youtubeVideoId = meta?.youtubeVideoId;
  if (youtubeVideoId && video.platform === "youtube") {
    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find(c => c.accessToken);
    if (ytChannel) {
      autoPinComment(userId, ytChannel.id, youtubeVideoId, videoId).catch(err => {
        logger.error("Auto-pin on new upload failed", { videoId, error: String(err) });
      });
    }
  }
}

async function generateFullThrottleDistribution(
  userId: string,
  video: any,
  creatorTone: string,
  platforms: string[],
  contentType: "new-video" | "recycle" | "cross-promo" | "go-live" | "post-stream",
) {
  const connectedPlatforms = await getUserConnectedPlatforms(userId);
  const supportedPlatforms = platforms.filter(p => ALL_DISTRIBUTION_PLATFORMS.includes(p) && connectedPlatforms.has(p));

  if (supportedPlatforms.length === 0) {
    logger.info("No connected platforms, skipping distribution", { userId, contentType });
    return;
  }

  const capabilityFilteredPlatforms = supportedPlatforms.filter(p => {
    const caps = PLATFORM_CAPABILITIES[p as keyof typeof PLATFORM_CAPABILITIES];
    if (!caps) return true;
    if (caps.supports.length === 0) {
      logger.info("Platform has no posting capabilities, skipping", { platform: p });
      return false;
    }
    if (!caps.supports.includes("text") && !caps.supports.includes("video") && !caps.supports.includes("short_video") && !caps.supports.includes("image")) {
      logger.info("Platform only supports live streaming, no posting — skipping", { platform: p });
      return false;
    }
    return true;
  });

  const activePlatforms = capabilityFilteredPlatforms.filter(p => {
    if (contentType === "new-video" || contentType === "go-live" || contentType === "post-stream") return true;
    return shouldPostToday(p);
  });

  if (activePlatforms.length === 0) {
    logger.info("No eligible platforms after capability filtering", { userId, contentType });
    return;
  }

  const { videoPlatforms, textPlatforms } = getPlatformsForContentType(contentType, new Set(activePlatforms));
  logger.info("Platform-aware distribution enforced", {
    userId, contentType,
    videoPlatforms, textPlatforms,
    totalActive: activePlatforms.length,
    filtered: supportedPlatforms.length - capabilityFilteredPlatforms.length,
  });

  const [kwContext, tsContext, channelLinks] = await Promise.all([
    getKeywordContext(userId).catch(() => ""),
    getTrafficStrategyContext(userId),
    getUserChannelLinks(userId),
  ]);

  const scheduleType = contentType === "cross-promo" ? "engagement" : contentType === "go-live" ? "new-video" : contentType === "post-stream" ? "new-video" : contentType;
  const schedule = await getAudienceDrivenStaggeredSchedule(activePlatforms, scheduleType, userId);

  let queuedVideo = 0;
  let queuedText = 0;

  for (const platform of activePlatforms) {
    const budget = calculateDailyPostBudget(platform);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.targetPlatform, platform),
        gte(autopilotQueue.createdAt, todayStart),
      ));

    if ((todayCount?.count || 0) >= budget) {
      logger.info("Daily budget reached", { platform, count: todayCount?.count, budget });
      continue;
    }

    const deliveryType = getContentTypeForPlatform(platform, contentType);
    const isVideoDelivery = deliveryType === "video" || deliveryType === "short_video";

    const effectiveContentType = isVideoDelivery
      ? contentType
      : (contentType === "new-video" || contentType === "post-stream" ? "cross-promo" as const : contentType);

    const effectiveQueueType = isVideoDelivery
      ? (contentType === "new-video" ? "auto-clip" : contentType === "recycle" ? "content-recycle" : contentType === "go-live" ? "go-live" : contentType === "post-stream" ? "post-stream" : "cross-promo")
      : (contentType === "go-live" ? "go-live" : "cross-promo");

    const videoUrl = buildVideoUrl(video);

    const result = await generateUniqueContent({
      videoTitle: video.title,
      videoDescription: video.description || "",
      videoType: isVideoDelivery ? (video.type || "video") : "text-promo",
      platform,
      contentType: effectiveContentType,
      creatorTone,
      userId,
      keywordContext: kwContext,
      trafficStrategyContext: tsContext,
      videoUrl,
      channelLinks,
    });

    if (!result.content) continue;

    const safety = await checkContentSafety(result.content, userId, platform);

    if (!safety.safe) {
      logger.warn("Content failed safety check", { platform, issues: safety.issues });
      const retry = await generateUniqueContent({
        videoTitle: video.title,
        videoDescription: video.description || "",
        videoType: isVideoDelivery ? (video.type || "video") : "text-promo",
        platform,
        contentType: effectiveContentType,
        creatorTone,
        userId,
        keywordContext: kwContext,
        trafficStrategyContext: tsContext,
        videoUrl,
        channelLinks,
      });

      if (!retry.content) continue;

      const retrySafety = await checkContentSafety(retry.content, userId, platform);
      if (!retrySafety.safe) {
        logger.warn("Retry also failed safety, skipping", { platform });
        continue;
      }

      Object.assign(result, retry);
    }

    const urgency = contentType === "go-live" ? "immediate" as const : contentType === "new-video" || contentType === "post-stream" ? "normal" as const : "low" as const;
    const scheduledAt = schedule.get(platform) || await getAudienceDrivenTime({
      platform,
      userId,
      contentType: contentType === "go-live" || contentType === "post-stream" ? "new-video" : contentType as any,
      urgency,
    });

    const microDelay = addHumanMicroDelay();
    const finalSchedule = new Date(scheduledAt.getTime() + microDelay);

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: video.id,
      type: effectiveQueueType,
      targetPlatform: platform,
      content: result.content,
      caption: `${isVideoDelivery ? "video" : "text"}: ${video.title}`,
      status: "scheduled",
      scheduledAt: finalSchedule,
      metadata: {
        contentType: effectiveContentType,
        deliveryType,
        isVideoDelivery,
        angle: "ai-selected",
        style: "human",
        aiModel: "gpt-5-mini",
        humanScore: result.stealthScore,
        uniquenessScore: result.uniquenessScore,
        fingerprint: result.fingerprint,
        safetyGrade: safety.overallGrade,
        schedulingMethod: "audience-driven",
      },
    } as any);

    if (isVideoDelivery) queuedVideo++; else queuedText++;
    logger.info("Queued content", { platform, deliveryType, isVideoDelivery, effectiveContentType, effectiveQueueType, scheduledAt: finalSchedule.toISOString() });
  }

  await createNotification(userId, "autopilot", "Content distributed",
    `${queuedVideo + queuedText} platform${(queuedVideo + queuedText) !== 1 ? "s" : ""} queued for "${video.title}" — ${queuedVideo} video, ${queuedText} text-optimized — audience-driven scheduling`,
    "info");
}

async function generateDiscordAnnouncement(userId: string, video: any, creatorTone: string) {
  const connectedPlatforms = await getUserConnectedPlatforms(userId);
  if (!connectedPlatforms.has("discord")) {
    logger.info("Discord not connected, skipping announcement", { userId });
    return;
  }

  const videoUrl = buildVideoUrl(video);
  const channelLinks = await getUserChannelLinks(userId);

  const result = await generateUniqueContent({
    videoTitle: video.title,
    videoDescription: video.description || "",
    videoType: video.type || "video",
    platform: "discord",
    contentType: "new-video",
    creatorTone,
    userId,
    videoUrl,
    channelLinks,
  });

  if (!result.content) return;

  const scheduledAt = await getAudienceDrivenTime({
    platform: "discord",
    userId,
    contentType: "new-video",
    urgency: "immediate",
  });

  await db.insert(autopilotQueue).values({
    userId,
    sourceVideoId: video.id,
    type: "discord-announce" as any,
    targetPlatform: "discord",
    content: result.content,
    caption: `Discord announcement for: ${video.title}`,
    status: "scheduled",
    scheduledAt,
    metadata: {
      style: "human",
      aiModel: "gpt-5-mini",
      humanScore: result.stealthScore,
      uniquenessScore: result.uniquenessScore,
      fingerprint: result.fingerprint,
      schedulingMethod: "audience-driven",
    },
  } as any);
}

export async function processGoLiveAnnouncements(userId: string, streamId: number, streamTitle: string, streamDescription: string, streamPlatforms: string[]) {
  logger.info("Processing go-live announcements", { streamTitle, userId });

  const smartScheduleConfig = await getAutopilotConfig(userId, "smart-schedule");
  if (smartScheduleConfig && smartScheduleConfig.enabled === false) return;

  const creatorTone = await getCreatorTone(userId);

  const streamAsVideo = {
    id: streamId,
    title: streamTitle,
    description: streamDescription,
    type: "live-stream",
  };

  const announcePlatforms = ALL_ANNOUNCE_PLATFORMS;

  const goLiveConnected = await getUserConnectedPlatforms(userId);
  const connectedAnnouncePlatforms = announcePlatforms.filter(p => goLiveConnected.has(p));

  if (connectedAnnouncePlatforms.length > 0) {
    await generateFullThrottleDistribution(userId, streamAsVideo, creatorTone, connectedAnnouncePlatforms, "go-live");
  }

  const discordConfig = await getAutopilotConfig(userId, "discord-announce");
  if (goLiveConnected.has("discord") && (!discordConfig || discordConfig.enabled !== false)) {
    const goLiveChannelLinks = await getUserChannelLinks(userId);
    const result = await generateUniqueContent({
      videoTitle: streamTitle,
      videoDescription: streamDescription || "",
      videoType: "live-stream",
      platform: "discord",
      contentType: "go-live",
      creatorTone,
      userId,
      channelLinks: goLiveChannelLinks,
    });

    if (result.content) {
      const scheduledAt = await getAudienceDrivenTime({
        platform: "discord",
        userId,
        contentType: "new-video",
        urgency: "immediate",
      });

      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: streamId,
        type: "go-live" as any,
        targetPlatform: "discord",
        content: result.content,
        caption: `LIVE NOW: ${streamTitle}`,
        status: "scheduled",
        scheduledAt,
        metadata: {
          streamId,
          isLiveAnnouncement: true,
          style: "human",
          aiModel: "gpt-5-mini",
          humanScore: result.stealthScore,
          uniquenessScore: result.uniquenessScore,
          fingerprint: result.fingerprint,
          schedulingMethod: "audience-driven",
        },
      } as any);
    }
  }

  const totalLivePlatforms = connectedAnnouncePlatforms.length + (goLiveConnected.has("discord") ? 1 : 0);
  if (totalLivePlatforms > 0) {
    await createNotification(userId, "autopilot", "Live announcements sent",
      `Going live across ${totalLivePlatforms} connected platform${totalLivePlatforms !== 1 ? "s" : ""} for "${streamTitle}"`,
      "info");
  }
}

export async function processPostStreamHighlights(userId: string, streamId: number, streamTitle: string, streamDescription: string, streamPlatforms: string[]) {
  logger.info("Processing post-stream highlights", { streamTitle, userId });

  const smartScheduleConfig = await getAutopilotConfig(userId, "smart-schedule");
  if (smartScheduleConfig && smartScheduleConfig.enabled === false) return;

  const creatorTone = await getCreatorTone(userId);

  const streamAsVideo = {
    id: streamId,
    title: streamTitle,
    description: streamDescription,
    type: "stream-vod",
  };

  const postStreamConnected = await getUserConnectedPlatforms(userId);
  const highlightPlatforms = ALL_DISTRIBUTION_PLATFORMS.filter(p => postStreamConnected.has(p));

  if (highlightPlatforms.length === 0) {
    logger.info("No connected platforms, skipping post-stream highlights", { userId });
    return;
  }

  const { videoPlatforms: postVideoPlats, textPlatforms: postTextPlats } = getPlatformsForContentType("post-stream", postStreamConnected);
  logger.info("Post-stream distribution routing", {
    userId, videoPlatforms: postVideoPlats, textPlatforms: postTextPlats,
  });

  await generateFullThrottleDistribution(userId, streamAsVideo, creatorTone, highlightPlatforms, "post-stream");

  await createNotification(userId, "autopilot", "Stream highlights queued",
    `Post-stream content queued — ${postVideoPlats.length} video platform${postVideoPlats.length !== 1 ? "s" : ""}, ${postTextPlats.length} text platform${postTextPlats.length !== 1 ? "s" : ""} for "${streamTitle}"`,
    "info");
}

export async function processCommentResponses(userId: string) {
  const config = await getAutopilotConfig(userId, "comment-responder");
  if (config && config.enabled === false) return;

  const { isActive } = getActivityWindow();
  if (!isActive) {
    logger.info("Outside activity window, skipping comments", { userId });
    return;
  }

  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) return;

  const connectedChannel = userChannels.find(c => c.accessToken);
  if (!connectedChannel) {
    logger.info("No connected YouTube channel, skipping comments", { userId });
    return;
  }

  const userVideos = await db.select().from(videos)
    .where(and(eq(videos.platform, "youtube"), eq(videos.channelId, connectedChannel.id)))
    .orderBy(desc(videos.createdAt))
    .limit(10);

  if (userVideos.length === 0) return;

  const creatorTone = await getCreatorTone(userId);
  const approvalMode = (config?.settings as any)?.commentApprovalMode || "auto";
  let totalProcessed = 0;

  const { fetchYouTubeComments } = await import("./youtube");

  for (const video of userVideos) {
    const ytId = (video.metadata as any)?.youtubeId;
    if (!ytId) continue;

    let realComments: { commentId: string; author: string; text: string; likeCount: number; publishedAt: string }[];
    try {
      realComments = await fetchYouTubeComments(connectedChannel.id, ytId, 20);
    } catch (err: any) {
      if (err.code === 403 || err.message?.includes("quota")) {
        logger.warn("YouTube quota hit fetching comments", { videoId: ytId });
        break;
      }
      logger.error("Failed to fetch comments", { videoId: ytId, error: err.message });
      continue;
    }

    if (realComments.length === 0) continue;

    for (const comment of realComments) {
      if (!comment.commentId || !comment.text) continue;

      const existing = await db.select({ id: commentResponses.id }).from(commentResponses)
        .where(
          sql`${commentResponses.userId} = ${userId} AND ${commentResponses.metadata}->>'commentId' = ${comment.commentId}`
        )
        .limit(1);

      if (existing.length > 0) continue;

      const systemMsg = `You ARE this creator responding to a comment on your own video. First person. Your voice.
${creatorTone}

CRITICAL RULES:
- 1-2 sentences MAX, no more
- Sound like you typed this on your phone between matches
- Use their name sometimes but not always
- If they ask a question, give a real answer (not generic)
- Match their energy level
- Use the creator's actual speaking style
- Occasional typos or shortcuts are fine (ur, rn, ngl, tbh)
- NEVER sound corporate, formal, or like a brand account
- Vary response length and style from reply to reply`;

      const prompt = `Comment on your video "${video.title}" by ${comment.author}: "${comment.text}"

Write a quick reply as yourself. Output ONLY the reply text.`;

      const response = await generateWithAI(prompt, systemMsg);
      if (!response) continue;

      let processedResponse = response.replace(/^["']|["']$/g, "").trim();

      if (Math.random() < 0.15) {
        const shortcuts: Record<string, string> = { "you": "u", "your": "ur", "to be honest": "tbh", "right now": "rn" };
        for (const [full, short] of Object.entries(shortcuts)) {
          if (processedResponse.toLowerCase().includes(full) && Math.random() < 0.3) {
            processedResponse = processedResponse.replace(new RegExp(full, "i"), short);
            break;
          }
        }
      }

      await db.insert(commentResponses).values({
        userId,
        videoId: video.id,
        platform: "youtube",
        originalComment: comment.text,
        originalAuthor: comment.author,
        aiResponse: processedResponse,
        status: approvalMode === "auto" ? "approved" : "pending",
        sentiment: detectSentiment(comment.text),
        priority: comment.text.includes("?") ? "high" : "normal",
        metadata: {
          commentId: comment.commentId,
          likeCount: comment.likeCount,
          isQuestion: comment.text.includes("?"),
          tone: "friendly",
        },
      } as any);

      totalProcessed++;
      if (totalProcessed >= 15) break;
    }

    if (totalProcessed >= 15) break;
  }

  logger.info("Processed YouTube comments", { count: totalProcessed, userId });
}

export async function processContentRecycling(userId: string) {
  const config = await getAutopilotConfig(userId, "content-recycler");
  if (config && config.enabled === false) return;

  const recycleAfterDays = (config?.settings as any)?.recycleAfterDays || 14;
  const cutoffDate = new Date(Date.now() - recycleAfterDays * 86400000);

  const oldVideos = await db.select().from(videos)
    .where(and(
      eq(videos.platform, "youtube"),
      lte(videos.createdAt, cutoffDate),
    ))
    .orderBy(desc(videos.createdAt))
    .limit(10);

  if (oldVideos.length === 0) return;

  const creatorTone = await getCreatorTone(userId);
  const configPlatforms = (config?.settings as any)?.platforms;
  const platforms = configPlatforms
    ? configPlatforms.filter((p: string) => ALL_DISTRIBUTION_PLATFORMS.includes(p))
    : ALL_DISTRIBUTION_PLATFORMS;

  const video = oldVideos[Math.floor(Math.random() * oldVideos.length)];

  const alreadyRecycled = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
      eq(autopilotQueue.type, "content-recycle"),
      gte(autopilotQueue.createdAt, new Date(Date.now() - 5 * 86400000)),
    ))
    .limit(1);

  if (alreadyRecycled.length > 0) return;

  await generateFullThrottleDistribution(userId, video, creatorTone, platforms, "recycle");
}

export async function processCrossPromotion(userId: string) {
  const config = await getAutopilotConfig(userId, "cross-promo");
  if (config && config.enabled === false) return;

  const connectedPlatforms = await getUserConnectedPlatforms(userId);
  if (connectedPlatforms.size === 0) {
    logger.info("No connected platforms, skipping cross-promo", { userId });
    return;
  }

  const recentPublished = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      gte(autopilotQueue.publishedAt, new Date(Date.now() - 48 * 3600000)),
    ))
    .orderBy(desc(autopilotQueue.publishedAt))
    .limit(5);

  if (recentPublished.length === 0) return;

  const bestPost = recentPublished[0];
  if (!bestPost.sourceVideoId) return;

  const [video] = await db.select().from(videos).where(eq(videos.id, bestPost.sourceVideoId));
  if (!video) return;

  const otherPlatforms = ALL_DISTRIBUTION_PLATFORMS.filter(p => p !== bestPost.targetPlatform && connectedPlatforms.has(p));
  const crossPlatform = otherPlatforms[Math.floor(Math.random() * otherPlatforms.length)];

  if (!crossPlatform || !shouldPostToday(crossPlatform)) return;

  const creatorTone = await getCreatorTone(userId);

  await generateFullThrottleDistribution(userId, video, creatorTone, [crossPlatform], "cross-promo");
}

async function handleStreamClipPublish(post: any, meta: any): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string; skipped?: boolean }> {
  try {
    const streamId = meta.sourceStreamId;
    const startMin = meta.segmentStartMin;
    const endMin = meta.segmentEndMin;
    const contentType = meta.contentType;
    const isShort = contentType === "youtube-short";

    const [stream] = await db.select().from(streams).where(eq(streams.id, streamId));
    if (!stream) return { success: false, error: "Source stream not found" };

    let streamVideo: any = null;

    if (stream.vodVideoId) {
      const [vodVideo] = await db.select().from(videos).where(eq(videos.id, stream.vodVideoId));
      if (vodVideo && (vodVideo.metadata as any)?.youtubeId) {
        streamVideo = vodVideo;
      }
    }

    if (!streamVideo) {
      const streamVideos = await db.select().from(videos)
        .where(eq(videos.userId, post.userId))
        .orderBy(desc(videos.createdAt))
        .limit(50);

      streamVideo = streamVideos.find(v => {
        const vm = (v.metadata as any) || {};
        return vm.youtubeId && (vm.sourceStreamId === streamId || v.title?.toLowerCase().includes(stream.title?.toLowerCase()?.substring(0, 20) || ""));
      });
    }

    if (!streamVideo) {
      logger.info("No source video with YouTube ID found for stream clip, falling back to text publish", { streamId, postId: post.id });
      const { publishToplatform } = await import("./platform-publisher");
      return publishToplatform(post.userId, post.targetPlatform, post.content || "", { ...meta, sourceVideoId: post.sourceVideoId });
    }

    const youtubeSourceId = (streamVideo.metadata as any)?.youtubeId;
    if (!youtubeSourceId) {
      logger.info("Stream video has no YouTube ID, falling back to text publish", { videoId: streamVideo.id });
      const { publishToplatform } = await import("./platform-publisher");
      return publishToplatform(post.userId, post.targetPlatform, post.content || "", { ...meta, sourceVideoId: post.sourceVideoId });
    }

    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, post.userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find(c => c.accessToken);
    if (!ytChannel) return { success: false, error: "No YouTube channel connected" };

    const { downloadSourceVideo, cutClipFromVideo, cleanupClipFile } = await import("./clip-video-processor");
    const sourcePath = await downloadSourceVideo(youtubeSourceId);
    const clipPath = await cutClipFromVideo(sourcePath, startMin * 60, endMin * 60, post.id);

    const { uploadVideoToYouTube } = await import("./youtube");
    const { isMonetizationUnlocked } = await import("./services/monetization-check");
    const { copyrightCheckAndFix } = await import("./services/copyright-check");
    let title = isShort ? `${(post.caption || "Clip").substring(0, 90)} #Shorts` : (post.caption || "Stream Highlight").substring(0, 100);
    let description = post.content || "";

    const clipCopyright = await copyrightCheckAndFix(description, title, "youtube", meta);
    if (!clipCopyright.approved) {
      logger.warn("Copyright check blocked stream clip", { postId: post.id, issues: clipCopyright.issues.map(i => i.description) });
      await createNotification(post.userId, "compliance", "Stream clip blocked by copyright check",
        `A clip from "${stream.title || "stream"}" was blocked before upload: ${clipCopyright.issues[0]?.description || "Copyright risk detected"}`, "warning");
      return { success: false, error: `Copyright check blocked: ${clipCopyright.issues[0]?.description || "Risk detected"}` };
    }
    if (clipCopyright.wasRewritten) {
      title = (clipCopyright.caption || title).substring(0, isShort ? 90 : 100);
      if (isShort && !title.includes("#Shorts")) title += " #Shorts";
      description = clipCopyright.content || description;
      logger.info("Copyright check auto-fixed clip content", { postId: post.id });
    }

    const monetizationEnabled = await isMonetizationUnlocked(post.userId, "youtube");

    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title,
      description,
      tags: meta.tags || (isShort ? ["shorts", "highlights", "clips", "gaming"] : ["highlights", "stream", "gameplay", "gaming"]),
      categoryId: "20",
      privacyStatus: "public",
      videoFilePath: clipPath,
      enableMonetization: monetizationEnabled,
    });

    cleanupClipFile(clipPath);

    if (uploadResult) {
      logger.info("Stream clip uploaded to YouTube", { postId: post.id, youtubeId: uploadResult.youtubeId, isShort });

      try {
        const existingClips = await db.select().from(videos)
          .where(and(
            eq(videos.channelId, ytChannel.id),
            sql`${videos.metadata}->>'youtubeId' = ${uploadResult.youtubeId}`,
          ))
          .limit(1);
        const alreadyExists = existingClips[0];

        let clipVideoId: number;
        if (alreadyExists) {
          clipVideoId = alreadyExists.id;
          logger.info("Clip video record already exists, skipping duplicate", { youtubeId: uploadResult.youtubeId });
        } else {
          const clipVideo = await storage.createVideo({
            channelId: ytChannel.id,
            title: post.caption || "Stream Clip",
            thumbnailUrl: streamVideo.thumbnailUrl || "",
            type: isShort ? "short" : "long",
            status: "published",
            platform: "youtube",
            description: post.content || "",
            metadata: {
              youtubeId: uploadResult.youtubeId,
              sourceStreamId: streamId,
              sourceVideoId: streamVideo.id,
              contentType: isShort ? "youtube-short" : "long-form-compilation",
              tags: meta.tags || [],
              duration: isShort ? `PT${Math.round((endMin - startMin) * 60)}S` : `PT${Math.round(endMin - startMin)}M`,
              publishedAt: new Date().toISOString(),
              autoGenerated: true,
            },
          });
          clipVideoId = clipVideo.id;
        }

        const { assignSingleVideoToPlaylist } = await import("./playlist-manager");
        assignSingleVideoToPlaylist(post.userId, clipVideoId, ytChannel.id).catch(err => {
          logger.error("Post-upload playlist assignment failed", { error: String(err) });
        });

        const { generateThumbnailForNewVideo } = await import("./auto-thumbnail-engine");
        generateThumbnailForNewVideo(post.userId, clipVideoId).catch(() => {});
      } catch (err) {
        logger.error("Failed to create clip video record", { postId: post.id, error: String(err) });
        const { generateThumbnailForNewVideo } = await import("./auto-thumbnail-engine");
        generateThumbnailForNewVideo(post.userId, streamVideo.id).catch(() => {});
      }

      autoPinComment(post.userId, ytChannel.id, uploadResult.youtubeId, streamVideo.id).catch(err => {
        logger.error("Auto-pin comment failed", { postId: post.id, error: String(err) });
      });

      return {
        success: true,
        postId: uploadResult.youtubeId,
        postUrl: `https://www.youtube.com/watch?v=${uploadResult.youtubeId}`,
      };
    }

    return { success: false, error: "YouTube upload returned no result" };
  } catch (err: any) {
    logger.error("Stream clip publish failed", { postId: post.id, error: err.message });
    return { success: false, error: err.message };
  }
}

export async function processScheduledPosts() {
  const now = new Date();
  const { isActive } = getActivityWindow();

  await retryFailedPosts();

  const duePosts = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      lte(autopilotQueue.scheduledAt, now),
    ))
    .limit(isActive ? 10 : 3);

  if (duePosts.length === 0) return;

  logger.info("Processing due posts", { count: duePosts.length, isActive });

  const connectedByUser = new Map<string, Set<string>>();
  const { publishToplatform } = await import("./platform-publisher");

  for (const post of duePosts) {
    try {
      if (!connectedByUser.has(post.userId)) {
        connectedByUser.set(post.userId, await getUserConnectedPlatforms(post.userId));
      }
      const connected = connectedByUser.get(post.userId)!;

      if (!connected.has(post.targetPlatform)) {
        logger.info("Platform not connected, cancelling post", { platform: post.targetPlatform, userId: post.userId, postId: post.id });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: `${post.targetPlatform} is not connected. Connect your account to enable posting.` })
          .where(eq(autopilotQueue.id, post.id));
        continue;
      }

      const meta = (post.metadata as any) || {};

      const { copyrightCheckAndFix } = await import("./services/copyright-check");
      const copyrightResult = await copyrightCheckAndFix(
        post.content || "",
        post.caption,
        post.targetPlatform,
        meta,
      );

      if (!copyrightResult.approved) {
        logger.warn("Copyright check BLOCKED post", {
          postId: post.id,
          platform: post.targetPlatform,
          riskLevel: copyrightResult.riskLevel,
          issues: copyrightResult.issues.map(i => i.description),
        });
        await db.update(autopilotQueue)
          .set({
            status: "failed",
            errorMessage: `Copyright check blocked: ${copyrightResult.issues.map(i => i.description).join("; ")}`,
            metadata: {
              ...meta,
              copyrightCheck: {
                riskLevel: copyrightResult.riskLevel,
                issues: copyrightResult.issues,
                blockedAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(autopilotQueue.id, post.id));
        await createNotification(post.userId, "compliance", "Content blocked by copyright check",
          `A post to ${post.targetPlatform} was blocked to protect your account: ${copyrightResult.issues[0]?.description || "Copyright risk detected"}`, "warning");
        continue;
      }

      let publishContent = copyrightResult.content;
      let publishCaption = copyrightResult.caption;

      if (copyrightResult.wasRewritten) {
        logger.info("Copyright check auto-fixed content before publish", {
          postId: post.id,
          platform: post.targetPlatform,
          riskLevel: copyrightResult.riskLevel,
        });
        await db.update(autopilotQueue)
          .set({
            content: publishContent,
            caption: publishCaption,
            metadata: {
              ...meta,
              copyrightCheck: {
                riskLevel: copyrightResult.riskLevel,
                wasRewritten: true,
                issueCount: copyrightResult.issues.length,
                checkedAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(autopilotQueue.id, post.id));
      }

      await db.update(autopilotQueue)
        .set({ status: "publishing" as any })
        .where(eq(autopilotQueue.id, post.id));

      let result: any;

      if (post.type === "auto-clip" && post.targetPlatform === "youtube" && meta.sourceStreamId && meta.segmentStartMin != null) {
        result = await handleStreamClipPublish(post, meta);
      } else {
        result = await publishToplatform(
          post.userId,
          post.targetPlatform,
          publishContent || "",
          {
            ...meta,
            sourceVideoId: post.sourceVideoId,
          },
        );
      }

      if (result.success) {
        await db.update(autopilotQueue)
          .set({
            status: "published",
            publishedAt: new Date(),
            verificationStatus: "pending",
            metadata: {
              ...((post.metadata as any) || {}),
              publishResult: {
                postId: result.postId,
                postUrl: result.postUrl,
                publishedAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(autopilotQueue.id, post.id));

        logger.info("Published post, queued for verification", { postId: post.id, platform: post.targetPlatform, url: result.postUrl || result.postId });
        sendSSEEvent(post.userId, "autopilot", { type: "post_published", postId: post.id, platform: post.targetPlatform, url: result.postUrl });

        if (result.postId) {
          const { verifyPostImmediately } = await import("./publish-verifier");
          verifyPostImmediately(post.id, post.userId, post.targetPlatform, result.postId).catch(err => {
            logger.warn("Immediate verification failed, will retry in sweep", { postId: post.id, error: String(err) });
          });
        }

        await createNotification(post.userId, "autopilot", `Posted to ${post.targetPlatform}`,
          `Content published${result.postUrl ? `: ${result.postUrl}` : ""} — verifying...`, "info");
      } else if (result.skipped) {
        logger.info("Post skipped (platform not applicable)", { postId: post.id, platform: post.targetPlatform, reason: result.error });
        await db.update(autopilotQueue)
          .set({ status: "cancelled" as any, errorMessage: result.error || "Skipped" })
          .where(eq(autopilotQueue.id, post.id));
      } else {
        logger.error("Publish failed", { postId: post.id, platform: post.targetPlatform, error: result.error });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: result.error || "Unknown publish error" })
          .where(eq(autopilotQueue.id, post.id));

        await createNotification(post.userId, "autopilot", `Failed to post to ${post.targetPlatform}`,
          result.error || "Publishing failed", "warning");
      }
    } catch (err) {
      logger.error("Failed to publish post", { postId: post.id, error: String(err) });
      await db.update(autopilotQueue)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(autopilotQueue.id, post.id));
    }
  }

  await retryFailedPosts();
}

async function autoPinComment(userId: string, channelId: number, youtubeVideoId: string, videoId: number) {
  try {
    await new Promise(resolve => setTimeout(resolve, 30_000));

    const { generatePinnedComment } = await import("./youtube-manager");
    const result = await generatePinnedComment(userId, videoId);

    if (!result?.comment) {
      logger.warn("Auto-pin: AI generated empty comment, skipping", { videoId });
      return;
    }

    const { postAndPinComment } = await import("./youtube");
    const pinResult = await postAndPinComment(channelId, youtubeVideoId, result.comment);

    if (pinResult.success) {
      logger.info("Auto-pinned comment on video", {
        userId, videoId, youtubeVideoId,
        commentId: pinResult.commentId,
        strategy: result.strategy,
      });

      await db.insert(notifications).values({
        userId,
        type: "autopilot",
        title: "Pinned Comment Added",
        message: `AI posted & pinned an engagement comment on your new video`,
        severity: "info",
      });
    } else {
      logger.warn("Auto-pin comment post failed", { videoId, error: pinResult.error });
    }
  } catch (err: any) {
    logger.error("Auto-pin comment error", { userId, videoId, error: err.message });
  }
}

async function retryFailedPosts() {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const failedPosts = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "failed"),
      gte(autopilotQueue.createdAt, twoHoursAgo),
      lte(autopilotQueue.scheduledAt, fifteenMinutesAgo),
    ))
    .limit(3);

  const retryable = failedPosts.filter(p => {
    const err = p.errorMessage || "";
    if (err.includes("reconnect") || err.includes("revoked") || err.includes("expired")) return false;
    if (err.includes("webhook URL") || err.includes("not supported") || err.includes("Data API pipeline")) return false;
    const retryCount = ((p.metadata as any)?.retryCount) || 0;
    return retryCount < 2;
  });

  if (retryable.length === 0) return;

  logger.info("Retrying failed posts", { count: retryable.length });
  const { publishToplatform } = await import("./platform-publisher");

  for (const post of retryable) {
    try {
      const retryCount = ((post.metadata as any)?.retryCount || 0) + 1;

      await db.update(autopilotQueue)
        .set({
          status: "scheduled" as any,
          scheduledAt: new Date(),
          errorMessage: null,
          metadata: { ...((post.metadata as any) || {}), retryCount },
        })
        .where(eq(autopilotQueue.id, post.id));

      logger.info("Queued failed post for retry", { postId: post.id, platform: post.targetPlatform, attempt: retryCount });
    } catch (err) {
      logger.error("Failed to queue retry", { postId: post.id, error: String(err) });
    }
  }
}

export async function getAutopilotStats(userId: string) {
  const [queueItems] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(eq(autopilotQueue.userId, userId));

  const [scheduledCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "scheduled")));

  const [publishedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published")));

  const [verifiedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), eq(autopilotQueue.verificationStatus, "verified")));

  const [verificationFailedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), eq(autopilotQueue.verificationStatus, "failed")));

  const [verificationPendingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"), eq(autopilotQueue.verificationStatus, "pending")));

  const [failedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed")));

  const [processingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      sql`${autopilotQueue.status} IN ('publishing', 'processing', 'generating', 'queued')`
    ));

  const [commentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentResponses)
    .where(eq(commentResponses.userId, userId));

  const [pendingComments] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentResponses)
    .where(and(eq(commentResponses.userId, userId), eq(commentResponses.status, "pending")));

  const recentActivity = await db.select().from(autopilotQueue)
    .where(eq(autopilotQueue.userId, userId))
    .orderBy(desc(autopilotQueue.createdAt))
    .limit(20);

  const configs = await db.select().from(autopilotConfig)
    .where(eq(autopilotConfig.userId, userId));

  const featureStatuses: Record<string, boolean> = {};
  for (const feature of AUTOPILOT_FEATURES) {
    const cfg = configs.find(c => c.feature === feature);
    featureStatuses[feature] = cfg ? cfg.enabled : true;
  }

  let stealthData = null;
  try {
    stealthData = await getStealthReport(userId);
  } catch {
    stealthData = { overallScore: 1.0, platformGrades: {}, recentIssues: [], recommendations: [] };
  }

  return {
    totalPosts: queueItems?.count || 0,
    scheduledPosts: scheduledCount?.count || 0,
    publishedPosts: publishedCount?.count || 0,
    failedPosts: failedCount?.count || 0,
    processingPosts: processingCount?.count || 0,
    verifiedPosts: verifiedCount?.count || 0,
    verificationFailed: verificationFailedCount?.count || 0,
    verificationPending: verificationPendingCount?.count || 0,
    totalCommentResponses: commentCount?.count || 0,
    pendingCommentApprovals: pendingComments?.count || 0,
    recentActivity,
    featureStatuses,
    stealth: stealthData,
  };
}

export async function getAutopilotActivity(userId: string, limit = 50) {
  const posts = await db.select().from(autopilotQueue)
    .where(eq(autopilotQueue.userId, userId))
    .orderBy(desc(autopilotQueue.createdAt))
    .limit(limit);

  const comments = await db.select().from(commentResponses)
    .where(eq(commentResponses.userId, userId))
    .orderBy(desc(commentResponses.createdAt))
    .limit(limit);

  return { posts, comments };
}

export async function updateAutopilotFeatureConfig(userId: string, feature: string, enabled: boolean, settings?: any) {
  const existing = await db.select().from(autopilotConfig)
    .where(and(eq(autopilotConfig.userId, userId), eq(autopilotConfig.feature, feature)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db.update(autopilotConfig)
      .set({ enabled, settings: settings || existing[0].settings, updatedAt: new Date() })
      .where(eq(autopilotConfig.id, existing[0].id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(autopilotConfig)
      .values({ userId, feature, enabled, settings: settings || {} })
      .returning();
    return created;
  }
}

async function createNotification(userId: string, type: string, title: string, message: string, severity: string) {
  await db.insert(notifications).values({ userId, type, title, message, severity });
  sendSSEEvent(userId, "notification", { type: "new" });
}

function detectSentiment(text: string): string {
  const positive = ["love", "amazing", "great", "awesome", "best", "thank", "excellent", "fantastic", "fire", "goat", "w", "peak"];
  const negative = ["hate", "bad", "worst", "terrible", "awful", "horrible", "sucks", "mid", "L", "trash"];
  const lower = text.toLowerCase();
  if (positive.some(w => lower.includes(w))) return "positive";
  if (negative.some(w => lower.includes(w))) return "negative";
  return "neutral";
}
