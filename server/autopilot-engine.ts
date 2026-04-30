import { db, withRetry } from "./db";
import { runInBatches } from "./lib/db-semaphore";
import { autopilotQueue, commentResponses, autopilotConfig, videos, channels, notifications, streams, PLATFORM_CAPABILITIES, VIDEO_PLATFORMS, TEXT_ONLY_PLATFORMS, LIVE_STREAM_PLATFORMS } from "@shared/schema";
import { eq, and, desc, lte, sql, gte, inArray } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClientBackground } from "./lib/openai";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { createLogger } from "./lib/logger";
import { storage } from "./storage";
import { jobQueue } from "./services/intelligent-job-queue";

const logger = createLogger("autopilot");

const COMMENT_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const commentQuotaCooldown = new Map<string, number>();

function isCommentQuotaOnCooldown(userId: string): boolean {
  const hitAt = commentQuotaCooldown.get(userId);
  if (!hitAt) return false;
  if (Date.now() - hitAt > COMMENT_QUOTA_COOLDOWN_MS) {
    commentQuotaCooldown.delete(userId);
    return false;
  }
  return true;
}

function isVideoPostable(video: any): boolean {
  const meta = (video.metadata as any) || {};
  const privacy = meta.privacyStatus || "";

  if (privacy === "unlisted") {
    logger.info("Skipping unlisted video", { videoId: video.id, title: video.title });
    return false;
  }

  if (privacy === "public") return true;

  if (privacy === "private") {
    logger.info("Skipping private video", { videoId: video.id, title: video.title });
    return false;
  }

  return true;
}
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
    const lines = activeStrategies.map(s => `- ${sanitizeForPrompt(s.strategyType)}: ${sanitizeForPrompt(s.title)}${s.description ? ` (${sanitizeForPrompt(s.description.slice(0, 100))})` : ""}`);
    return `CURRENT TRAFFIC GROWTH FOCUS (align content with these strategies when naturally relevant):\n${lines.join("\n")}\nOnly reference these themes if they fit the content naturally — never force them.`;
  } catch {
    return "";
  }
}

const openai = getOpenAIClientBackground();

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

const ALL_DISTRIBUTION_PLATFORMS = ["youtube", "discord", "tiktok"];
const ALL_ANNOUNCE_PLATFORMS = ["discord"];

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

// Cache connected-platforms lookups for 30 seconds.
// The autopilot processes many videos in parallel for the same user — without
// this cache every video fires its own DB query simultaneously, exhausting the
// 5-connection pool and causing "timeout exceeded when trying to connect" errors
// in production. 30s TTL is safe because platform connections change rarely.
const _connectedPlatformsCache = new Map<string, { result: Set<string>; expiresAt: number }>();

async function getUserConnectedPlatforms(userId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = _connectedPlatformsCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.result;

  const userChannels = await withRetry(() => db.select({ platform: channels.platform, accessToken: channels.accessToken, platformData: channels.platformData })
    .from(channels)
    .where(eq(channels.userId, userId)), "autopilot-connected-platforms");
  const result = new Set(userChannels.filter(c => {
    if (!c.accessToken) return false;
    const pd = (c.platformData || {}) as any;
    if (pd._connectionStatus === "expired") return false;
    return true;
  }).map(c => c.platform));

  _connectedPlatformsCache.set(userId, { result, expiresAt: now + 30_000 });
  return result;
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
      model: "gpt-4o-mini",
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

  if (!isVideoPostable(video)) return;

  // If a live stream is in progress, defer all heavy AI work so the streaming
  // path always has full AI budget available for announcements and live ops.
  try {
    const { isLiveStreamActive } = await import("./priority-orchestrator");
    if (isLiveStreamActive(userId)) {
      logger.info("Stream active — deferring new-video AI pipeline 2h", { videoId, userId });
      setTimeout(() => {
        processNewVideoUpload(userId, videoId).catch(err =>
          logger.warn("Deferred new-video upload pipeline failed", { videoId, error: String(err).substring(0, 200) })
        );
      }, 2 * 60 * 60_000);
      return;
    }
  } catch {}

  const creatorTone = await getCreatorTone(userId);

  const autoClipConfig = await getAutopilotConfig(userId, "auto-clip");
  if (!autoClipConfig || autoClipConfig.enabled !== false) {
    const configPlatforms = (autoClipConfig?.settings as any)?.platforms || ALL_DISTRIBUTION_PLATFORMS;
    const sourcePlatform = video.platform || "youtube";
    const platforms = configPlatforms.filter((p: string) => p !== sourcePlatform);
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

  const videoDuration = meta?.duration || (video as any).duration || 0;
  if (video.platform === "youtube" && videoDuration >= 900) {
    import("./smart-edit-engine").then(m => {
      m.queueVideoForSmartEdit(userId, videoId)
        .then(jobId => {
          if (jobId) {
            logger.info("Long video auto-queued for smart edit", { videoId, duration: videoDuration });
            m.processSmartEditQueue(userId).catch(() => undefined);
          }
        })
        .catch(err => logger.warn("Auto smart-edit queue failed", { videoId, error: String(err).substring(0, 200) }));
    }).catch(() => undefined);
  }

  // Only run viral optimization for new videos when not streaming — the
  // priority-orchestrator's "livestream" mode already handles stream-time
  // optimization via viralOptimizeVideo in agent-events.ts at T+45s / T+18min.
  import("./priority-orchestrator").then(({ isLiveStreamActive }) => {
    if (isLiveStreamActive(userId)) {
      logger.info("Stream active — skipping viral opt for new video (will run post-stream)", { videoId });
      return;
    }
    import("./backlog-engine").then(m => {
      m.viralOptimizeVideo(userId, videoId)
        .then(result => {
          if (result.optimized) {
            logger.info("Viral optimization completed for new video", {
              videoId,
              seoScore: result.seoScore,
              youtubeUpdated: result.youtubeUpdated,
              thumbnailQueued: result.thumbnailQueued,
            });
          }
        })
        .catch(err => logger.warn("Viral optimization failed for new video", { videoId, error: String(err).substring(0, 200) }));
    }).catch(() => undefined);
  }).catch(() => undefined);
}

const MAX_CROSS_POSTS_PER_DAY = 20;

async function getAutopilotDailyCount(userId: string): Promise<number> {
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

async function generateFullThrottleDistribution(
  userId: string,
  video: any,
  creatorTone: string,
  platforms: string[],
  contentType: "new-video" | "recycle" | "cross-promo" | "go-live" | "post-stream",
) {
  const isPriorityContent = contentType === "new-video" || contentType === "go-live" || contentType === "post-stream";
  const dailyCount = await getAutopilotDailyCount(userId);
  if (!isPriorityContent && dailyCount >= MAX_CROSS_POSTS_PER_DAY) {
    logger.info("Daily cross-post limit reached, skipping distribution", { userId, dailyCount, limit: MAX_CROSS_POSTS_PER_DAY, contentType });
    return;
  }

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
  const schedule = await getAudienceDrivenStaggeredSchedule(activePlatforms, scheduleType, userId).catch((err: Error) => {
    logger.warn("Audience-driven schedule unavailable, using immediate distribution", {
      userId, contentType, error: err.message?.substring(0, 120),
    });
    return new Map<string, Date>();
  });

  let queuedVideo = 0;
  let queuedText = 0;

  for (const platform of activePlatforms) {
    try {
      const { canPostToPlatformToday } = await import("./services/platform-budget-tracker");
      const budgetCheck = await canPostToPlatformToday(userId, platform);
      if (!budgetCheck.allowed && !isPriorityContent) {
        logger.info("Platform daily budget exhausted", { platform, reason: budgetCheck.reason, remaining: budgetCheck.remaining });
        continue;
      }
    } catch (err: any) {
      if (!isPriorityContent) {
        logger.warn("Platform budget check failed, skipping conservatively", { platform, error: err.message });
        continue;
      }
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
      caption: `${isVideoDelivery ? "video" : "text"}: ${sanitizeForPrompt(video.title)}`,
      status: "scheduled",
      scheduledAt: finalSchedule,
      metadata: {
        contentType: effectiveContentType,
        deliveryType,
        isVideoDelivery,
        angle: "ai-selected",
        style: "human",
        aiModel: "gpt-4o-mini",
        humanScore: result.stealthScore,
        uniquenessScore: result.uniquenessScore,
        fingerprint: result.fingerprint,
        safetyGrade: safety.overallGrade,
        schedulingMethod: "audience-driven",
      },
    });

    if (isVideoDelivery) queuedVideo++; else queuedText++;
    logger.info("Queued content", { platform, deliveryType, isVideoDelivery, effectiveContentType, effectiveQueueType, scheduledAt: finalSchedule.toISOString() });
  }

  const totalQueued = queuedVideo + queuedText;
  if (totalQueued > 0) {
    await createNotification(userId, "autopilot", "Content distributed",
      `${totalQueued} platform${totalQueued !== 1 ? "s" : ""} queued for "${sanitizeForPrompt(video.title)}" — ${queuedVideo} video, ${queuedText} text-optimized — audience-driven scheduling`,
      "info");
  }
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
    type: "discord-announce",
    targetPlatform: "discord",
    content: result.content,
    caption: `Discord announcement for: ${sanitizeForPrompt(video.title)}`,
    status: "scheduled",
    scheduledAt,
    metadata: {
      style: "human",
      aiModel: "gpt-4o-mini",
      humanScore: result.stealthScore,
      uniquenessScore: result.uniquenessScore,
      fingerprint: result.fingerprint,
      schedulingMethod: "audience-driven",
    },
  });
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
        type: "go-live",
        targetPlatform: "discord",
        content: result.content,
        caption: `LIVE NOW: ${streamTitle}`,
        status: "scheduled",
        scheduledAt,
        metadata: {
          streamId,
          isLiveAnnouncement: true,
          style: "human",
          aiModel: "gpt-4o-mini",
          humanScore: result.stealthScore,
          uniquenessScore: result.uniquenessScore,
          fingerprint: result.fingerprint,
          schedulingMethod: "audience-driven",
        },
      });
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
  if (isCommentQuotaOnCooldown(userId)) {
    return;
  }

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
      if (err.code === "DEV_BYPASS") continue;
      if (err.code === 403 || err.message?.includes("quota")) {
        logger.warn("YouTube quota hit fetching comments — cooling down 24h", { videoId: ytId, userId });
        commentQuotaCooldown.set(userId, Date.now());
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

      const prompt = `Comment on your video "${sanitizeForPrompt(video.title)}" by ${sanitizeForPrompt(comment.author)}: "${sanitizeForPrompt(comment.text)}"

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
      });

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

  const postableVideos = oldVideos.filter(isVideoPostable);
  if (postableVideos.length === 0) return;

  const creatorTone = await getCreatorTone(userId);
  const configPlatforms = (config?.settings as any)?.platforms;
  const platforms = configPlatforms
    ? configPlatforms.filter((p: string) => ALL_DISTRIBUTION_PLATFORMS.includes(p))
    : ALL_DISTRIBUTION_PLATFORMS;

  const video = postableVideos[Math.floor(Math.random() * postableVideos.length)];

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
  if (!video || !isVideoPostable(video)) return;

  const otherPlatforms = ALL_DISTRIBUTION_PLATFORMS.filter(p => p !== bestPost.targetPlatform && connectedPlatforms.has(p));
  const crossPlatform = otherPlatforms[Math.floor(Math.random() * otherPlatforms.length)];

  if (!crossPlatform || !shouldPostToday(crossPlatform)) return;

  const creatorTone = await getCreatorTone(userId);

  await generateFullThrottleDistribution(userId, video, creatorTone, [crossPlatform], "cross-promo");
}

function sanitizeErrorForNotification(rawError: string, platform: string): string {
  if (rawError.includes("not connected") || rawError.includes("Connect your account")) {
    return `${sanitizeForPrompt(platform)} is not connected. Go to Settings → Platforms to connect your account.`;
  }
  if (rawError.includes("No YouTube channel") || rawError.includes("No YouTube")) {
    return "YouTube channel not connected. Connect your YouTube account in Settings to enable uploads.";
  }
  if (rawError.includes("quota") || rawError.includes("Quota")) {
    return "YouTube API quota temporarily exceeded. Uploads will automatically retry when quota resets.";
  }
  if (rawError.includes("token") && (rawError.includes("expired") || rawError.includes("invalid") || rawError.includes("revoked"))) {
    return `Your ${sanitizeForPrompt(platform)} connection needs to be refreshed. Go to Settings → Platforms to reconnect.`;
  }
  if (rawError.includes("yt-dlp") || rawError.includes("Command failed")) {
    return `Video source temporarily unavailable for clip extraction. The system will automatically retry. If this persists, the source video may have restrictions.`;
  }
  if (rawError.includes("quota") || rawError.includes("rateLimitExceeded")) {
    return `${sanitizeForPrompt(platform)} API quota reached. Posts will resume automatically when the quota resets.`;
  }
  if (rawError.includes("token") || rawError.includes("auth") || rawError.includes("401") || rawError.includes("403")) {
    return `${sanitizeForPrompt(platform)} authentication needs refreshing. Please reconnect your ${sanitizeForPrompt(platform)} account in Settings.`;
  }
  if (rawError.includes("Copyright") || rawError.includes("copyright")) {
    return rawError;
  }
  if (rawError.length > 150) {
    return rawError.substring(0, 147) + "...";
  }
  // Guard: never return empty string — the notifications table has a NOT NULL constraint
  return rawError || `Publishing to ${sanitizeForPrompt(platform)} failed. The system will retry automatically.`;
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
      const userChannels = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, post.userId));
      const channelIds = userChannels.map(c => c.id);
      const streamVideos = channelIds.length > 0
        ? await db.select().from(videos)
            .where(inArray(videos.channelId, channelIds))
            .orderBy(desc(videos.createdAt))
            .limit(50)
        : [];

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

    const { isLiveActive: _isLiveActive1 } = await import("./lib/live-gate");
    if (_isLiveActive1()) {
      logger.info("Stream clip upload held — live stream in progress, will retry after stream ends", { postId: post.id });
      return { success: false, error: "Live stream in progress — clip deferred until stream ends" };
    }

    const { downloadSourceVideo, cutClipFromVideo, cleanupClipFile } = await import("./clip-video-processor");
    const startSec = meta.segmentStartSec ?? startMin * 60;
    const endSec = meta.segmentEndSec ?? endMin * 60;
    const sourcePath = await downloadSourceVideo(youtubeSourceId, post.userId);
    const clipPath = await cutClipFromVideo(sourcePath, startSec, endSec, post.id);

    const { uploadVideoToYouTube } = await import("./youtube");
    const { isMonetizationUnlocked } = await import("./services/monetization-check");
    const { copyrightCheckAndFix } = await import("./services/copyright-check");
    let title = isShort ? `${(post.caption || "Clip").substring(0, 90)} #Shorts` : (post.caption || "Stream Highlight").substring(0, 100);
    let description = post.content || "";

    const sourceMeta = (streamVideo.metadata as any) || {};
    const sourceTags: string[] = sourceMeta.tags || (streamVideo.tags as string[]) || [];
    const sourceCategory = sourceMeta.categoryId || sourceMeta.contentCategory || "20";

    const allTags = ([] as string[]).concat(meta.tags || [], sourceTags, isShort ? ["shorts", "highlights", "clips"] : ["highlights", "stream"]);
    const inheritedTags = allTags.filter((t, i) => allTags.indexOf(t) === i).slice(0, 25);

    if (!description || description.length < 50) {
      const sourceTitle = streamVideo.title || stream.title || "";
      const sourceDesc = (streamVideo.description || "").substring(0, 300);
      description = `${description ? description + "\n\n" : ""}From: ${sourceTitle}\n${sourceDesc ? sourceDesc + "\n" : ""}`;
    }

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

    let scheduledStartTime: string | undefined;
    try {
      const { getNextOptimalPublishTime } = await import("./services/upload-scheduler");
      const optimalTime = await getNextOptimalPublishTime(post.userId, "youtube");
      if (optimalTime && optimalTime.getTime() > Date.now() + 10 * 60_000) {
        scheduledStartTime = optimalTime.toISOString();
      }
    } catch (err: any) {
      logger.warn("Failed to get optimal publish time for stream clip, uploading as public", { error: err.message });
    }

    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title,
      description,
      tags: inheritedTags,
      categoryId: sourceCategory,
      privacyStatus: "public",
      videoFilePath: clipPath,
      enableMonetization: monetizationEnabled,
      scheduledStartTime,
    });

    cleanupClipFile(clipPath);

    if (uploadResult) {
      logger.info("Stream clip uploaded to YouTube", { postId: post.id, youtubeId: uploadResult.youtubeId, isShort, scheduled: scheduledStartTime || "immediate" });

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
            title: title,
            thumbnailUrl: streamVideo.thumbnailUrl || "",
            type: isShort ? "short" : "long",
            status: "published",
            platform: "youtube",
            description: description,
            metadata: {
              youtubeId: uploadResult.youtubeId,
              contentType: isShort ? "youtube-short" : "long-form-compilation",
              tags: inheritedTags,
              duration: isShort ? `PT${Math.round((endMin - startMin) * 60)}S` : `PT${Math.round(endMin - startMin)}M`,
              publishedAt: new Date().toISOString(),
              sourceStreamId: stream.id,
              sourceVideoId: streamVideo.id,
              sourceVideoTitle: streamVideo.title,
              thumbnailConcept: meta.thumbnailConcept || null,
              categoryId: sourceCategory,
              gameName: (meta as any)?.gameName || ((streamVideo?.metadata as any)?.gameName) || "PS5 Gameplay",
              noCommentary: true,
            } as any,
          });
          clipVideoId = clipVideo.id;
        }

        await jobQueue.enqueue({
          type: "post_upload_playlist",
          userId: post.userId,
          priority: 3,
          payload: { videoId: clipVideoId, channelId: ytChannel.id },
          dedupeKey: `post_upload_playlist:${clipVideoId}`,
        });

        await jobQueue.enqueue({
          type: "post_upload_thumbnail",
          userId: post.userId,
          priority: 3,
          payload: { videoId: clipVideoId },
          dedupeKey: `post_upload_thumbnail:${clipVideoId}`,
        });

        const clipGameName = (meta as any)?.gameName || ((streamVideo?.metadata as any)?.gameName);
        if (clipGameName && clipGameName !== "PS5 Gameplay" && clipGameName !== "Unknown") {
          await jobQueue.enqueue({
            type: "post_upload_game_tag",
            userId: post.userId,
            priority: 2,
            payload: { gameName: clipGameName, source: "stream-clip-publish" },
            dedupeKey: `post_upload_game_tag:${clipVideoId}:${clipGameName}`,
          });
        }

        await jobQueue.enqueue({
          type: "post_upload_verify",
          userId: post.userId,
          priority: 4,
          payload: { videoId: clipVideoId, youtubeId: uploadResult.youtubeId, source: "stream_clip_autopilot" },
          dedupeKey: `post_upload_verify:${clipVideoId}`,
        });
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
        postUrl: `https://www.youtube.com/watch?v=${sanitizeForPrompt(uploadResult.youtubeId)}`,
      };
    }

    return { success: false, error: "YouTube upload returned no result" };
  } catch (err: any) {
    logger.error("Stream clip publish failed", { postId: post.id, error: err.message });
    return { success: false, error: err.message };
  }
}

async function handleVodLongFormPublish(
  post: any, meta: any,
): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string; skipped?: boolean }> {
  try {
    if (!post.sourceVideoId) return { success: false, error: "No source video ID for VOD long-form" };
    const [video] = await db.select().from(videos).where(eq(videos.id, post.sourceVideoId));
    if (!video) return { success: false, error: "Source video not found" };
    const ytMeta = (video.metadata as any) || {};
    const youtubeId: string | null = ytMeta.youtubeId || ytMeta.youtubeVideoId || null;
    if (!youtubeId) return { success: false, error: "Source video has no YouTube ID — cannot update metadata" };

    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, post.userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find((c: any) => c.accessToken);
    if (!ytChannel) return { success: false, error: "No YouTube channel connected" };

    const newTitle = (post.caption || meta.optimizedTitle || video.title || "").substring(0, 100);
    const newDescription = (post.content || video.description || "").substring(0, 5000);
    const newTags: string[] = Array.isArray(meta.tags) ? meta.tags.slice(0, 30) : (ytMeta.tags || []);

    const { updateYouTubeVideo } = await import("./youtube");
    const { trackQuotaUsage } = await import("./services/youtube-quota-tracker");
    await updateYouTubeVideo(ytChannel.id, youtubeId, { title: newTitle, description: newDescription, tags: newTags });
    await trackQuotaUsage(post.userId, "write");

    await storage.updateVideo(post.sourceVideoId, {
      title: newTitle,
      description: newDescription,
      metadata: { ...ytMeta, tags: newTags, vodAutopilotOptimized: true, vodAutopilotOptimizedAt: new Date().toISOString() },
    });
    logger.info("VOD long-form metadata pushed to YouTube", { postId: post.id, youtubeId, title: newTitle.substring(0, 60) });
    return { success: true, postId: youtubeId, postUrl: `https://www.youtube.com/watch?v=${youtubeId}` };
  } catch (err: any) {
    logger.error("VOD long-form publish failed", { postId: post.id, error: err.message });
    return { success: false, error: err.message };
  }
}

async function handleVodShortPublish(
  post: any, meta: any,
): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string; skipped?: boolean }> {
  try {
    const clipId = meta?.clipId;
    if (!clipId) return { success: false, error: "No clip ID in metadata for VOD short" };
    const { processClipForYouTubeShorts } = await import("./clip-video-processor");
    const result = await processClipForYouTubeShorts(Number(clipId), post.userId);
    if (!result) return { success: false, error: "Clip processing failed or source file unavailable" };
    logger.info("VOD short uploaded to YouTube", { postId: post.id, youtubeId: result.youtubeId, title: result.title });
    return { success: true, postId: result.youtubeId, postUrl: `https://www.youtube.com/shorts/${result.youtubeId}` };
  } catch (err: any) {
    logger.error("VOD short publish failed", { postId: post.id, error: err.message });
    return { success: false, error: err.message };
  }
}

async function handleVodOptimizationPublish(
  post: any, meta: any,
): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string; skipped?: boolean }> {
  try {
    if (!post.sourceVideoId) return { success: false, error: "No source video ID for VOD optimization" };
    const [video] = await db.select().from(videos).where(eq(videos.id, post.sourceVideoId));
    if (!video) return { success: false, error: "Source video not found" };
    const ytMeta = (video.metadata as any) || {};
    const youtubeId: string | null = ytMeta.youtubeId || ytMeta.youtubeVideoId || null;
    if (!youtubeId) return { success: false, error: "Source video has no YouTube ID — cannot optimize metadata" };

    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, post.userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find((c: any) => c.accessToken);
    if (!ytChannel) return { success: false, error: "No YouTube channel connected" };

    let newTitle = (video.title || "").substring(0, 100);
    let newDescription = (video.description || "").substring(0, 5000);
    let newTags: string[] = ytMeta.tags || [];
    try {
      const parsed = typeof post.content === "string" ? JSON.parse(post.content) : (post.content || {});
      if (parsed.newTitle) newTitle = String(parsed.newTitle).substring(0, 100);
      if (parsed.newDescription) newDescription = String(parsed.newDescription).substring(0, 5000);
      if (Array.isArray(parsed.newTags)) newTags = parsed.newTags.slice(0, 30);
    } catch { /* keep video defaults on parse error */ }

    const { updateYouTubeVideo } = await import("./youtube");
    const { trackQuotaUsage } = await import("./services/youtube-quota-tracker");
    await updateYouTubeVideo(ytChannel.id, youtubeId, { title: newTitle, description: newDescription, tags: newTags });
    await trackQuotaUsage(post.userId, "write");

    await storage.updateVideo(post.sourceVideoId, {
      title: newTitle,
      description: newDescription,
      metadata: { ...ytMeta, tags: newTags, vodOptimizerApplied: true, vodOptimizerAppliedAt: new Date().toISOString() },
    });
    logger.info("VOD optimization pushed to YouTube", { postId: post.id, youtubeId, title: newTitle.substring(0, 60) });
    return { success: true, postId: youtubeId, postUrl: `https://www.youtube.com/watch?v=${youtubeId}` };
  } catch (err: any) {
    logger.error("VOD optimization publish failed", { postId: post.id, error: err.message });
    return { success: false, error: err.message };
  }
}

async function handleMaximizerClipPublish(post: any, meta: any): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string; skipped?: boolean }> {
  try {
    const sourceYoutubeId = meta.sourceYoutubeId;
    const startSec = meta.segmentStartSec ?? (meta.segmentStartMin ?? 0) * 60;
    const endSec = meta.segmentEndSec ?? (meta.segmentEndMin ?? 0) * 60;
    const isShort = meta.contentType === "youtube-short";
    const gameName = meta.gameName || "PS5 Gameplay";

    if (!sourceYoutubeId || endSec <= startSec) {
      return { success: false, error: "Missing sourceYoutubeId or invalid timestamps" };
    }

    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, post.userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find(c => c.accessToken);
    if (!ytChannel) return { success: false, error: "No YouTube channel connected" };

    const { isLiveActive: _isLiveActive2 } = await import("./lib/live-gate");
    if (_isLiveActive2()) {
      logger.info("Maximizer clip upload held — live stream in progress, will retry after stream ends", { postId: post.id });
      return { success: false, error: "Live stream in progress — clip deferred until stream ends" };
    }

    const { downloadSourceVideo, cutClipFromVideo, cleanupClipFile } = await import("./clip-video-processor");
    const sourcePath = await downloadSourceVideo(sourceYoutubeId, post.userId);
    const clipPath = await cutClipFromVideo(sourcePath, startSec, endSec, post.id);

    let title = (post.caption || `${sanitizeForPrompt(gameName)} Gameplay`).substring(0, isShort ? 95 : 100);
    let description = post.content || "";
    const tags: string[] = meta.tags || [];

    const { copyrightCheckAndFix } = await import("./services/copyright-check");
    const copyCheck = await copyrightCheckAndFix(description, title, "youtube", meta);
    if (!copyCheck.approved) {
      cleanupClipFile(clipPath);
      return { success: false, error: `Copyright blocked: ${copyCheck.issues[0]?.description || "Risk detected"}` };
    }
    if (copyCheck.wasRewritten) {
      title = (copyCheck.caption || title).substring(0, isShort ? 95 : 100);
      description = copyCheck.content || description;
    }

    const { uploadVideoToYouTube } = await import("./youtube");
    const { isMonetizationUnlocked } = await import("./services/monetization-check");
    const monetizationEnabled = await isMonetizationUnlocked(post.userId, "youtube");

    let maxScheduledStartTime: string | undefined;
    try {
      const { getNextOptimalPublishTime } = await import("./services/upload-scheduler");
      const optimalTime = await getNextOptimalPublishTime(post.userId, "youtube");
      if (optimalTime && optimalTime.getTime() > Date.now() + 10 * 60_000) {
        maxScheduledStartTime = optimalTime.toISOString();
      }
    } catch (err: any) {
      logger.warn("Failed to get optimal publish time for maximizer clip, uploading as public", { error: err.message });
    }

    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title,
      description,
      tags,
      categoryId: meta.categoryId || "20",
      privacyStatus: "public",
      videoFilePath: clipPath,
      enableMonetization: monetizationEnabled,
      scheduledStartTime: maxScheduledStartTime,
    });

    cleanupClipFile(clipPath);

    if (uploadResult?.youtubeId) {
      logger.info("Maximizer clip uploaded", { postId: post.id, youtubeId: uploadResult.youtubeId, isShort, gameName, scheduled: maxScheduledStartTime || "immediate" });

      try {
        const clipVideo = await storage.createVideo({
          channelId: ytChannel.id,
          title,
          thumbnailUrl: "",
          type: isShort ? "short" : "long",
          status: "published",
          platform: "youtube",
          description,
          metadata: {
            youtubeId: uploadResult.youtubeId,
            contentType: isShort ? "youtube-short" : "long-form-compilation",
            tags,
            durationSec: endSec - startSec,
            publishedAt: new Date().toISOString(),
            sourceVideoId: post.sourceVideoId,
            gameName,
            noCommentary: true,
            maximizerGenerated: true,
            experimentalDuration: meta.experimentalDuration,
          } as any,
        });

        await jobQueue.enqueue({
          type: "post_upload_playlist",
          userId: post.userId,
          priority: 3,
          payload: { videoId: clipVideo.id, channelId: ytChannel.id },
          dedupeKey: `post_upload_playlist:${clipVideo.id}`,
        });

        await jobQueue.enqueue({
          type: "post_upload_thumbnail",
          userId: post.userId,
          priority: 3,
          payload: { videoId: clipVideo.id },
          dedupeKey: `post_upload_thumbnail:${clipVideo.id}`,
        });

        if (gameName && gameName !== "PS5 Gameplay" && gameName !== "Unknown") {
          await jobQueue.enqueue({
            type: "post_upload_game_tag",
            userId: post.userId,
            priority: 2,
            payload: { gameName, source: "maximizer-publish" },
            dedupeKey: `post_upload_game_tag:${clipVideo.id}:${gameName}`,
          });
        }

        await jobQueue.enqueue({
          type: "post_upload_verify",
          userId: post.userId,
          priority: 4,
          payload: { videoId: clipVideo.id, youtubeId: uploadResult.youtubeId, source: "content_maximizer" },
          dedupeKey: `post_upload_verify:${clipVideo.id}`,
        });

        const { contentExperiments } = await import("@shared/schema");
        await db.update(contentExperiments).set({
          resultVideoYoutubeId: uploadResult.youtubeId,
          resultVideoDbId: clipVideo.id,
          status: "published",
        }).where(and(
          eq(contentExperiments.userId, post.userId),
          eq(contentExperiments.sourceVideoId, post.sourceVideoId || 0),
          eq(contentExperiments.durationSec, meta.experimentalDuration || (endSec - startSec)),
          eq(contentExperiments.status, "pending"),
        )).catch(() => undefined);
      } catch (err) {
        logger.warn("Failed to create maximizer clip video record", { error: String(err).substring(0, 200) });
      }

      return {
        success: true,
        postId: uploadResult.youtubeId,
        postUrl: `https://www.youtube.com/watch?v=${sanitizeForPrompt(uploadResult.youtubeId)}`,
      };
    }

    return { success: false, error: "YouTube upload returned no result" };
  } catch (err: any) {
    logger.error("Maximizer clip publish failed", { postId: post.id, error: err.message?.substring(0, 300) });
    return { success: false, error: err.message };
  }
}

/**
 * Reschedules all future-dated "scheduled" queue items to fire within the next
 * 1-5 minutes, staggered so they don't all hit the APIs simultaneously.
 * Called once at server startup so any backlog of tomorrow+ content fires ASAP.
 */
export async function flushQueueToAsap(): Promise<number> {
  try {
    const now = new Date();
    const maxFutureWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const flushPriority = sql`CASE 
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'go-live' THEN 1
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'new-video' THEN 2
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'post-stream' THEN 3
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'auto-clip' THEN 4
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'cross-promo' THEN 6
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'content-recycle' THEN 7
      WHEN ${sanitizeForPrompt(autopilotQueue.type)} = 'evergreen_recycler' THEN 8
      ELSE 5
    END`;

    const futurePosts = await db
      .select({ id: autopilotQueue.id, type: autopilotQueue.type })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "scheduled"),
        sql`${autopilotQueue.scheduledAt} > NOW()`,
        sql`${autopilotQueue.scheduledAt} < ${maxFutureWindow}`,
      ))
      .orderBy(flushPriority, autopilotQueue.scheduledAt);

    if (futurePosts.length === 0) return 0;

    const staggerWindowMs = 5 * 60_000;
    await runInBatches(futurePosts, (post, i) => {
      const jitterMs = (i / futurePosts.length) * staggerWindowMs + Math.random() * 30_000;
      const asapTime = new Date(now.getTime() + jitterMs);
      return db.update(autopilotQueue)
        .set({ scheduledAt: asapTime })
        .where(eq(autopilotQueue.id, post.id));
    }, 3);

    logger.info("Flushed future queue items to ASAP", { count: futurePosts.length });

    // Reset auto-clip Shorts that were falsely blocked by the yt_shorts_duration
    // compliance rule (which matched "#Shorts" keyword in descriptions).
    // Those are now exempt from that check, so re-queue them as scheduled.
    const falselyBlocked = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "failed"),
        eq(autopilotQueue.type, "auto-clip" as any),
        sql`${autopilotQueue.errorMessage} ILIKE '%yt_shorts_duration%' OR ${autopilotQueue.errorMessage} ILIKE '%Shorts must be 60 seconds%'`,
      ));

    if (falselyBlocked.length > 0) {
      await runInBatches(falselyBlocked, (post, i) => {
        const jitterMs = (i / falselyBlocked.length) * staggerWindowMs + Math.random() * 30_000;
        const asapTime = new Date(now.getTime() + jitterMs);
        return db.update(autopilotQueue)
          .set({
            status: "scheduled",
            scheduledAt: asapTime,
            errorMessage: null,
            metadata: sql`${autopilotQueue.metadata} - 'complianceBlocked' - 'violations'`,
          })
          .where(eq(autopilotQueue.id, post.id));
      }, 3);
      logger.info("Reset falsely-blocked Shorts to scheduled", { count: falselyBlocked.length });
    }

    return futurePosts.length + falselyBlocked.length;
  } catch (err: any) {
    logger.warn("flushQueueToAsap failed", { error: err.message });
    return 0;
  }
}

export async function processScheduledPosts() {
  const now = new Date();
  const { isActive } = getActivityWindow();

  try {
    const { autoFixFailedPosts } = await import("./auto-fix-engine");
    await autoFixFailedPosts();
  } catch (err: any) {
    logger.warn("Auto-fix pre-scan failed", { error: err.message });
  }

  // Recovery: posts stuck in 'processing' for > 60 min are reset to 'scheduled'.
  // 60 min is the safe floor — it is much longer than the worst-case batch
  // processing time (25 posts × multi-minute video uploads) so legitimately
  // in-flight posts are never incorrectly reclaimed by a concurrent run
  // whose outer cron-lock has already expired.
  // We key on metadata->>'processingStartedAt' (written at claim time), NOT
  // scheduled_at (publish time), so the check is exact.
  const recovered = await db.execute(sql`
    UPDATE autopilot_queue
    SET status = 'scheduled',
        metadata = metadata - 'processingStartedAt'
    WHERE status = 'processing'
      AND (metadata->>'processingStartedAt')::timestamptz < NOW() - INTERVAL '60 minutes'
  `).catch((err: any) => {
    logger.warn("Could not recover stuck processing posts", { error: err?.message });
    return { rowCount: 0 };
  });
  if ((recovered.rowCount ?? 0) > 0) {
    logger.warn("Recovered stuck processing posts to scheduled", { count: recovered.rowCount });
  }

  // Atomically claim due posts using FOR UPDATE SKIP LOCKED so two concurrent
  // executions cannot pick up the same posts twice.
  // processingStartedAt is written into metadata so the recovery query above
  // has an exact lease timestamp to check.
  // Only RETURNING id — rows are then re-fetched via Drizzle so the rest of
  // the function gets properly typed, camelCase-mapped objects.
  const claimResult = await db.execute(sql`
    UPDATE autopilot_queue
    SET status = 'processing',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'processingStartedAt',
          to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    WHERE id IN (
      SELECT id FROM autopilot_queue
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY
        CASE type
          WHEN 'go-live'            THEN 1
          WHEN 'new-video'          THEN 2
          WHEN 'post-stream'        THEN 3
          WHEN 'auto-clip'          THEN 4
          WHEN 'cross-promo'        THEN 6
          WHEN 'content-recycle'    THEN 7
          WHEN 'evergreen_recycler' THEN 8
          ELSE 5
        END, scheduled_at
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const claimedIds = (claimResult.rows as Array<{ id: number }>).map(r => r.id);

  if (claimedIds.length === 0) return;

  // Re-fetch claimed rows via Drizzle so the rest of the function gets
  // properly typed, camelCase-mapped objects (db.execute returns raw snake_case).
  // Re-apply content-priority ordering so higher-value posts are processed first.
  const duePosts = await db.select().from(autopilotQueue)
    .where(inArray(autopilotQueue.id, claimedIds))
    .orderBy(
      sql`CASE ${autopilotQueue.type}
        WHEN 'go-live'            THEN 1
        WHEN 'new-video'          THEN 2
        WHEN 'post-stream'        THEN 3
        WHEN 'auto-clip'          THEN 4
        WHEN 'cross-promo'        THEN 6
        WHEN 'content-recycle'    THEN 7
        WHEN 'evergreen_recycler' THEN 8
        ELSE 5
      END`,
      autopilotQueue.scheduledAt,
    );

  const newContentCount = duePosts.filter(p => ["go-live", "new-video", "post-stream", "auto-clip"].includes(p.type)).length;
  const recycledCount = duePosts.filter(p => ["content-recycle", "evergreen_recycler"].includes(p.type)).length;
  logger.info("Processing due posts (new-content-first)", { count: duePosts.length, newContentCount, recycledCount, isActive });

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
          .set({ status: "failed", errorMessage: `${sanitizeForPrompt(post.targetPlatform)} is not connected. Connect your account to enable posting.` })
          .where(eq(autopilotQueue.id, post.id));
        continue;
      }

      if (post.targetPlatform === "youtube" || post.targetPlatform === "youtubeshorts") {
        try {
          const { isQuotaBreakerTripped } = await import("./services/youtube-quota-tracker");
          if (isQuotaBreakerTripped()) {
            const { getNextResetTime } = await import("./services/youtube-quota-tracker");
            const resetTime = getNextResetTime();
            const deferTo = new Date(resetTime.getTime() + 5 * 60_000);
            logger.info("YouTube quota breaker active — deferring post until reset", { postId: post.id, deferTo: deferTo.toISOString() });
            await db.update(autopilotQueue)
              .set({
                status: "scheduled",
                scheduledAt: deferTo,
                metadata: {
                  ...((post.metadata as any) || {}),
                  quotaDeferred: true,
                  deferredAt: new Date().toISOString(),
                  deferredUntil: deferTo.toISOString(),
                },
              })
              .where(eq(autopilotQueue.id, post.id));
            continue;
          }
        } catch (quotaErr: any) {
          logger.warn("Quota pre-check failed, proceeding cautiously", { postId: post.id, error: quotaErr?.message });
        }
      }

      try {
        const { checkTrustBudget } = await import("./kernel/trust-budget");
        const trustCost = post.targetPlatform === "youtube" ? 10 : 5;
        const trustResult = await checkTrustBudget(post.userId, `distribution:${sanitizeForPrompt(post.targetPlatform)}`, trustCost);
        if (trustResult.blocked) {
          const deferTo = new Date(Date.now() + 60 * 60_000);
          logger.info("Trust budget exhausted — deferring post", { postId: post.id, platform: post.targetPlatform, remaining: trustResult.remaining, deferTo: deferTo.toISOString() });
          await db.update(autopilotQueue)
            .set({
              status: "scheduled",
              scheduledAt: deferTo,
              metadata: {
                ...((post.metadata as any) || {}),
                trustBudgetDeferred: true,
                deferredAt: new Date().toISOString(),
                deferredUntil: deferTo.toISOString(),
              },
            })
            .where(eq(autopilotQueue.id, post.id));
          continue;
        }
      } catch (trustErr: any) {
        logger.warn("Trust budget pre-check failed, proceeding cautiously", { postId: post.id, platform: post.targetPlatform, error: trustErr?.message });
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
          `A post to ${sanitizeForPrompt(post.targetPlatform)} was blocked to protect your account: ${copyrightResult.issues[0]?.description || "Copyright risk detected"}`, "warning");
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

      try {
        const { enforceComplianceRules } = await import("./services/platform-policy-tracker");
        const compliance = await enforceComplianceRules(
          publishContent || "",
          publishCaption || post.caption || "",
          post.targetPlatform as any,
          meta,
        );

        if (!compliance.compliant) {
          // Skip duration-rule violations for verified auto-clip Shorts — the clip
          // processor already enforces the 60s ceiling, so this is always a false
          // positive caused by "#Shorts" matching the keyword "shorts" in the rule.
          const isVerifiedShort = meta?.contentType === "youtube-short" && post.type === "auto-clip";
          const criticalViolations = compliance.violations.filter(v =>
            v.severity === "critical" &&
            !(isVerifiedShort && v.rule === "yt_shorts_duration")
          );

          if (criticalViolations.length > 0) {
            logger.warn("Content blocked by compliance check", {
              postId: post.id, platform: post.targetPlatform,
              violations: criticalViolations.map(v => v.rule),
            });

            await db.update(autopilotQueue)
              .set({
                status: "failed",
                errorMessage: `Compliance violation: ${criticalViolations.map(v => v.description).join("; ")}`,
                metadata: { ...meta, complianceBlocked: true, violations: criticalViolations },
              })
              .where(eq(autopilotQueue.id, post.id));
            continue;
          }
        }

        if (compliance.autoFixes.length > 0) {
          publishContent = compliance.fixedContent;
          publishCaption = compliance.fixedTitle;
          logger.info("Compliance auto-fixes applied", {
            postId: post.id, fixes: compliance.autoFixes.map(f => f.reason),
          });
        }
      } catch (complianceErr: any) {
        logger.warn("Compliance check skipped (non-blocking)", { postId: post.id, error: complianceErr.message?.substring(0, 100) });
      }

      await db.update(autopilotQueue)
        .set({ status: "publishing" })
        .where(eq(autopilotQueue.id, post.id));

      let result: any;

      if (post.type === "auto-clip" && post.targetPlatform === "youtube" && meta.maximizerGenerated && meta.sourceYoutubeId) {
        result = await handleMaximizerClipPublish(post, meta);
      } else if (post.type === "auto-clip" && post.targetPlatform === "youtube" && meta.sourceStreamId && meta.segmentStartMin != null) {
        result = await handleStreamClipPublish(post, meta);
      } else if (post.type === "vod-long-form" && post.targetPlatform === "youtube") {
        result = await handleVodLongFormPublish(post, meta);
      } else if (post.type === "vod-short" && post.targetPlatform === "youtube") {
        result = await handleVodShortPublish(post, meta);
      } else if (post.type === "vod-optimization" && post.targetPlatform === "youtube") {
        result = await handleVodOptimizationPublish(post, meta);
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

        await createNotification(post.userId, "autopilot", `Posted to ${sanitizeForPrompt(post.targetPlatform)}`,
          `Content published${result.postUrl ? `: ${sanitizeForPrompt(result.postUrl)}` : ""} — verifying...`, "info");
      } else if (result.skipped) {
        logger.info("Post skipped (platform not applicable)", { postId: post.id, platform: post.targetPlatform, reason: result.error });
        await db.update(autopilotQueue)
          .set({ status: "cancelled", errorMessage: result.error || "Skipped" })
          .where(eq(autopilotQueue.id, post.id));
      } else {
        const errorMsg = result.error || "Unknown publish error";
        logger.error("Publish failed", { postId: post.id, platform: post.targetPlatform, error: errorMsg });

        const { classifyFailure, getAutoFixSummary } = await import("./auto-fix-engine");
        const failureCategory = classifyFailure(errorMsg, post.targetPlatform);

        await db.update(autopilotQueue)
          .set({
            status: "failed",
            errorMessage: errorMsg,
            metadata: { ...((post.metadata as any) || {}), failureCategory },
          })
          .where(eq(autopilotQueue.id, post.id));

        const retryCount = ((post.metadata as any)?.retryCount) || 0;
        // Silent: permanent/auto-handled failures that don't need user attention
        const silentCategories = new Set(["config_missing", "auth_expired", "unknown", "network", "platform_down", "rate_limit", "quota_cap", "video_unavailable", "compliance_violation"]);
        if (retryCount === 0 && !silentCategories.has(failureCategory)) {
          const friendlyError = getAutoFixSummary(failureCategory, post.targetPlatform);
          await createNotification(post.userId, "autopilot", `Issue with ${sanitizeForPrompt(post.targetPlatform)} post`,
            friendlyError, "warning");
        }
      }
    } catch (err) {
      const errorMsg = String(err);
      logger.error("Failed to publish post", { postId: post.id, error: errorMsg });

      const { classifyFailure } = await import("./auto-fix-engine");
      const failureCategory = classifyFailure(errorMsg, post.targetPlatform);

      await db.update(autopilotQueue)
        .set({
          status: "failed",
          errorMessage: errorMsg,
          metadata: { ...((post.metadata as any) || {}), failureCategory },
        })
        .where(eq(autopilotQueue.id, post.id));

      const retryCount = ((post.metadata as any)?.retryCount) || 0;
      const silentCatch = new Set(["config_missing", "auth_expired", "unknown", "network", "platform_down", "rate_limit", "quota_cap", "video_unavailable", "compliance_violation"]);
      if (retryCount === 0 && !silentCatch.has(failureCategory)) {
        const friendlyError = sanitizeErrorForNotification(errorMsg, post.targetPlatform);
        await createNotification(post.userId, "autopilot", `Failed to post to ${sanitizeForPrompt(post.targetPlatform)}`, friendlyError, "warning");
      }
    }
  }

  const { autoFixFailedPosts } = await import("./auto-fix-engine");
  await autoFixFailedPosts();
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

    } else {
      logger.warn("Auto-pin comment post failed", { videoId, error: pinResult.error });
    }
  } catch (err: any) {
    logger.error("Auto-pin comment error", { userId, videoId, error: err.message });
  }
}

// retryFailedPosts is now handled by auto-fix-engine.ts (autoFixFailedPosts)
// which classifies failures, defers quota/cap issues until reset, auto-refreshes tokens, etc.

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

export async function createNotification(userId: string, type: string, title: string, message: string, severity: string) {
  if (severity === "info") return;
  const safeMessage = message || `${sanitizeForPrompt(title)} — the system is handling this automatically.`;
  const safeTitle = title || "System notification";
  await storage.createNotification({ userId, type, title: safeTitle, message: safeMessage, severity });
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
