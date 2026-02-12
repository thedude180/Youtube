import { db } from "./db";
import { autopilotQueue, commentResponses, autopilotConfig, videos, channels, notifications } from "@shared/schema";
import { eq, and, desc, lte, sql, gte } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import OpenAI from "openai";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";
import {
  generateHumanScheduledTime,
  generateStaggeredSchedule,
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
} from "./content-variation-engine";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

const ALL_DISTRIBUTION_PLATFORMS = ["tiktok", "x", "discord", "twitch", "kick"];

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
      temperature: 0.9,
      max_tokens: 500,
    });
    return response.choices[0]?.message?.content || "";
  } catch (err) {
    console.error("[Autopilot] AI generation error:", err);
    return "";
  }
}

export async function processNewVideoUpload(userId: string, videoId: number) {
  console.log(`[Autopilot] Processing new video upload: videoId=${videoId}, userId=${userId}`);

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
}

async function generateFullThrottleDistribution(
  userId: string,
  video: any,
  creatorTone: string,
  platforms: string[],
  contentType: "new-video" | "recycle" | "cross-promo",
) {
  const activePlatforms = platforms.filter(p => {
    if (contentType === "new-video") return true;
    return shouldPostToday(p);
  });

  const schedule = generateStaggeredSchedule(activePlatforms, contentType === "cross-promo" ? "engagement" : contentType, userId);

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
      console.log(`[Autopilot] Daily budget reached for ${platform} (${todayCount?.count}/${budget})`);
      continue;
    }

    const result = await generateUniqueContent({
      videoTitle: video.title,
      videoDescription: video.description || "",
      videoType: video.type || "video",
      platform,
      contentType,
      creatorTone,
      userId,
    });

    if (!result.content) continue;

    const safety = await checkContentSafety(result.content, userId, platform);

    if (!safety.safe) {
      console.log(`[Autopilot] Content failed safety check for ${platform}: ${safety.issues.join(", ")}`);
      const retry = await generateUniqueContent({
        videoTitle: video.title,
        videoDescription: video.description || "",
        videoType: video.type || "video",
        platform,
        contentType,
        creatorTone,
        userId,
      });

      if (!retry.content) continue;

      const retrySafety = await checkContentSafety(retry.content, userId, platform);
      if (!retrySafety.safe) {
        console.log(`[Autopilot] Retry also failed safety for ${platform}, skipping`);
        continue;
      }

      Object.assign(result, retry);
    }

    const scheduledAt = schedule.get(platform) || generateHumanScheduledTime({
      platform,
      userId,
      contentType,
      urgency: contentType === "new-video" ? "normal" : "low",
    });

    const microDelay = addHumanMicroDelay();
    const finalSchedule = new Date(scheduledAt.getTime() + microDelay);

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: video.id,
      type: contentType === "new-video" ? "auto-clip" : contentType === "recycle" ? "content-recycle" : "cross-promo",
      targetPlatform: platform,
      content: result.content,
      caption: `${contentType}: ${video.title}`,
      status: "scheduled",
      scheduledAt: finalSchedule,
      metadata: {
        contentType,
        angle: "ai-selected",
        style: "human",
        aiModel: "gpt-5-mini",
        humanScore: result.stealthScore,
        uniquenessScore: result.uniquenessScore,
        fingerprint: result.fingerprint,
        safetyGrade: safety.overallGrade,
        schedulingMethod: "human-behavior-engine",
      },
    });
  }

  await createNotification(userId, "autopilot", "Content distributed",
    `${activePlatforms.length} platform${activePlatforms.length !== 1 ? "s" : ""} queued for "${video.title}" with human-like scheduling`,
    "info");
}

async function generateDiscordAnnouncement(userId: string, video: any, creatorTone: string) {
  const result = await generateUniqueContent({
    videoTitle: video.title,
    videoDescription: video.description || "",
    videoType: video.type || "video",
    platform: "discord",
    contentType: "new-video",
    creatorTone,
    userId,
  });

  if (!result.content) return;

  const scheduledAt = generateHumanScheduledTime({
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
    caption: `Discord announcement for: ${video.title}`,
    status: "scheduled",
    scheduledAt,
    metadata: {
      style: "human",
      aiModel: "gpt-5-mini",
      humanScore: result.stealthScore,
      uniquenessScore: result.uniquenessScore,
      fingerprint: result.fingerprint,
      schedulingMethod: "human-behavior-engine",
    },
  });
}

export async function processCommentResponses(userId: string) {
  const config = await getAutopilotConfig(userId, "comment-responder");
  if (config && config.enabled === false) return;

  const { isActive } = getActivityWindow();
  if (!isActive) {
    console.log(`[Autopilot] Outside activity window, skipping comments for ${userId}`);
    return;
  }

  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  if (userChannels.length === 0) return;

  const userVideos = await db.select().from(videos)
    .where(eq(videos.platform, "youtube"))
    .orderBy(desc(videos.createdAt))
    .limit(10);

  if (userVideos.length === 0) return;

  const creatorTone = await getCreatorTone(userId);

  const sampleComments = [
    { author: "GameFan42", comment: "This was amazing! How do you get so good?", videoTitle: userVideos[0]?.title || "Recent Video" },
    { author: "NewViewer", comment: "First time watching, love your style!", videoTitle: userVideos[0]?.title || "Recent Video" },
    { author: "ProGamer", comment: "What settings do you use?", videoTitle: userVideos[0]?.title || "Recent Video" },
  ];

  for (const sample of sampleComments) {
    const existingResponse = await db.select().from(commentResponses)
      .where(and(
        eq(commentResponses.userId, userId),
        eq(commentResponses.originalAuthor, sample.author),
        eq(commentResponses.originalComment, sample.comment),
      ))
      .limit(1);

    if (existingResponse.length > 0) continue;

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

    const prompt = `Comment on your video "${sample.videoTitle}" by ${sample.author}: "${sample.comment}"

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

    const approvalMode = (config?.settings as any)?.commentApprovalMode || "auto";

    await db.insert(commentResponses).values({
      userId,
      videoId: userVideos[0]?.id,
      platform: "youtube",
      originalComment: sample.comment,
      originalAuthor: sample.author,
      aiResponse: processedResponse,
      status: approvalMode === "auto" ? "approved" : "pending",
      sentiment: detectSentiment(sample.comment),
      priority: sample.comment.includes("?") ? "high" : "normal",
      metadata: {
        isQuestion: sample.comment.includes("?"),
        tone: "friendly",
        responseDelay: getCommentResponseDelay(),
        typingDelay: simulateTypingDelay(processedResponse.length),
      },
    });
  }
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
  const platforms = (config?.settings as any)?.platforms || ["x", "tiktok", "discord"];

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

  const otherPlatforms = ALL_DISTRIBUTION_PLATFORMS.filter(p => p !== bestPost.targetPlatform);
  const crossPlatform = otherPlatforms[Math.floor(Math.random() * otherPlatforms.length)];

  if (!crossPlatform || !shouldPostToday(crossPlatform)) return;

  const creatorTone = await getCreatorTone(userId);

  await generateFullThrottleDistribution(userId, video, creatorTone, [crossPlatform], "cross-promo");
}

export async function processScheduledPosts() {
  const now = new Date();
  const { isActive } = getActivityWindow();

  const duePosts = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      lte(autopilotQueue.scheduledAt, now),
    ))
    .limit(isActive ? 10 : 3);

  for (const post of duePosts) {
    try {
      await db.update(autopilotQueue)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(autopilotQueue.id, post.id));

      sendSSEEvent(post.userId, "autopilot", { type: "post_published", postId: post.id, platform: post.targetPlatform });
    } catch (err) {
      console.error(`[Autopilot] Failed to publish post ${post.id}:`, err);
      await db.update(autopilotQueue)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(autopilotQueue.id, post.id));
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
