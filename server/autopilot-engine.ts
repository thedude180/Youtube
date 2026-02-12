import { db } from "./db";
import { autopilotQueue, commentResponses, autopilotConfig, videos, channels, notifications } from "@shared/schema";
import { eq, and, desc, lte, sql, gte } from "drizzle-orm";
import { sendSSEEvent } from "./routes/events";
import OpenAI from "openai";
import { getCreatorStyleContext, buildHumanizationPrompt } from "./creator-intelligence";

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
] as const;

type AutopilotFeature = typeof AUTOPILOT_FEATURES[number];

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
      temperature: 0.8,
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
    await generateAutoClips(userId, video, creatorTone, autoClipConfig?.settings as any);
  }

  const discordConfig = await getAutopilotConfig(userId, "discord-announce");
  if (!discordConfig || discordConfig.enabled !== false) {
    await generateDiscordAnnouncement(userId, video, creatorTone);
  }
}

async function generateAutoClips(
  userId: string,
  video: any,
  creatorTone: string,
  settings?: { platforms?: string[]; maxPostsPerDay?: number },
) {
  const platforms = settings?.platforms || ["tiktok", "x"];

  for (const platform of platforms) {
    const platformLabel = platform === "x" ? "X (Twitter)" : "TikTok";

    const systemMsg = `You are a social media manager who writes posts that sound completely human and natural - never robotic or corporate.
${creatorTone}

RULES:
- Write like a real person excited to share their content
- Use casual language, slang, and natural speech patterns
- Include 2-3 relevant hashtags (not more)
- Keep it short and punchy
- Never use corporate phrases like "check out" or "don't miss"
- Make it feel like the creator typed this themselves
- For ${platformLabel}: ${platform === "tiktok" ? "Keep under 150 chars, trending vibe, use viral hooks" : "Keep under 280 chars, conversational tone"}`;

    const prompt = `Write a ${platformLabel} post promoting this video:
Title: "${video.title}"
Description: "${video.description || ""}"
Type: ${video.type}

Generate a single post that sounds like the creator naturally talking about their content. Output ONLY the post text, nothing else.`;

    const content = await generateWithAI(prompt, systemMsg);
    if (!content) continue;

    const now = new Date();
    const delayHours = platforms.indexOf(platform) * 2 + Math.random() * 3;
    const scheduledAt = new Date(now.getTime() + delayHours * 3600000);

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: video.id,
      type: "auto-clip",
      targetPlatform: platform,
      content,
      caption: `Auto-clip from: ${video.title}`,
      status: "scheduled",
      scheduledAt,
      metadata: {
        hashtags: extractHashtags(content),
        style: "human",
        aiModel: "gpt-5-mini",
        humanScore: 0.9,
      },
    });
  }

  await createNotification(userId, "autopilot", "Auto-clips generated",
    `${platforms.length} posts scheduled for "${video.title}" across ${platforms.map(p => p === "x" ? "X" : "TikTok").join(", ")}`,
    "info");
}

async function generateDiscordAnnouncement(userId: string, video: any, creatorTone: string) {
  const systemMsg = `You are writing a Discord server announcement for a creator's community.
${creatorTone}

RULES:
- Write like you're the creator talking to their fans in their own server
- Be excited but natural
- Include the video title
- Keep it 2-3 sentences max
- Don't use @everyone or @here
- Make fans feel special, like they're getting an inside scoop
- Sound human, not like a bot notification`;

  const prompt = `Write a Discord announcement for this new video:
Title: "${video.title}"
Description: "${video.description || ""}"
Type: ${video.type}

Output ONLY the announcement text.`;

  const content = await generateWithAI(prompt, systemMsg);
  if (!content) return;

  const scheduledAt = new Date(Date.now() + 30 * 60000);

  await db.insert(autopilotQueue).values({
    userId,
    sourceVideoId: video.id,
    type: "discord-announce",
    targetPlatform: "discord",
    content,
    caption: `Discord announcement for: ${video.title}`,
    status: "scheduled",
    scheduledAt,
    metadata: {
      style: "human",
      aiModel: "gpt-5-mini",
      humanScore: 0.95,
    },
  });
}

export async function processCommentResponses(userId: string) {
  const config = await getAutopilotConfig(userId, "comment-responder");
  if (config && config.enabled === false) return;

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

    const systemMsg = `You are the creator responding to a YouTube comment on your video.
${creatorTone}

RULES:
- Sound like a real person, not a corporate social media team
- Keep responses short (1-2 sentences)
- Be warm and appreciative
- If someone asks a question, actually answer it
- Use the creator's natural speaking style
- Don't be overly formal or stiff
- Match the energy of the original comment`;

    const prompt = `Comment on "${sample.videoTitle}" by ${sample.author}: "${sample.comment}"

Write a short, natural reply as the creator. Output ONLY the reply text.`;

    const response = await generateWithAI(prompt, systemMsg);
    if (!response) continue;

    const approvalMode = (config?.settings as any)?.commentApprovalMode || "auto";

    await db.insert(commentResponses).values({
      userId,
      videoId: userVideos[0]?.id,
      platform: "youtube",
      originalComment: sample.comment,
      originalAuthor: sample.author,
      aiResponse: response,
      status: approvalMode === "auto" ? "approved" : "pending",
      sentiment: detectSentiment(sample.comment),
      priority: sample.comment.includes("?") ? "high" : "normal",
      metadata: {
        isQuestion: sample.comment.includes("?"),
        tone: "friendly",
      },
    });
  }
}

export async function processContentRecycling(userId: string) {
  const config = await getAutopilotConfig(userId, "content-recycler");
  if (config && config.enabled === false) return;

  const recycleAfterDays = (config?.settings as any)?.recycleAfterDays || 30;
  const cutoffDate = new Date(Date.now() - recycleAfterDays * 86400000);

  const oldVideos = await db.select().from(videos)
    .where(and(
      eq(videos.platform, "youtube"),
      lte(videos.createdAt, cutoffDate),
    ))
    .orderBy(desc(videos.createdAt))
    .limit(5);

  if (oldVideos.length === 0) return;

  const creatorTone = await getCreatorTone(userId);
  const platforms = (config?.settings as any)?.platforms || ["x", "tiktok"];

  const video = oldVideos[Math.floor(Math.random() * oldVideos.length)];

  const alreadyRecycled = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
      eq(autopilotQueue.type, "content-recycle"),
      gte(autopilotQueue.createdAt, new Date(Date.now() - 7 * 86400000)),
    ))
    .limit(1);

  if (alreadyRecycled.length > 0) return;

  for (const platform of platforms) {
    const platformLabel = platform === "x" ? "X (Twitter)" : "TikTok";

    const systemMsg = `You are resharing an older video in a fresh, natural way. The goal is to drive new views to existing content.
${creatorTone}

RULES:
- Don't say "throwback" or "icymi" - be more creative
- Frame it as relevant NOW, not as old content
- Sound completely natural and human
- Use a different angle/hook than the original title
- For ${platformLabel}: ${platform === "tiktok" ? "Under 150 chars, trending vibe" : "Under 280 chars, conversational"}
- Include 1-2 hashtags max`;

    const prompt = `Create a fresh post to re-promote this video that was published ${Math.round((Date.now() - (video.createdAt?.getTime() || 0)) / 86400000)} days ago:
Title: "${video.title}"
Description: "${video.description || ""}"

Output ONLY the post text.`;

    const content = await generateWithAI(prompt, systemMsg);
    if (!content) continue;

    const delayHours = Math.random() * 12;
    const scheduledAt = new Date(Date.now() + delayHours * 3600000);

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: video.id,
      type: "content-recycle",
      targetPlatform: platform,
      content,
      caption: `Recycled: ${video.title}`,
      status: "scheduled",
      scheduledAt,
      metadata: {
        hashtags: extractHashtags(content),
        isRecycled: true,
        originalPostDate: video.createdAt?.toISOString(),
        style: "human",
        aiModel: "gpt-5-mini",
        humanScore: 0.85,
      },
    });
  }

  await createNotification(userId, "autopilot", "Content recycled",
    `Fresh posts created for "${video.title}" on ${platforms.map(p => p === "x" ? "X" : "TikTok").join(", ")}`,
    "info");
}

export async function processScheduledPosts() {
  const now = new Date();
  const duePosts = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      lte(autopilotQueue.scheduledAt, now),
    ))
    .limit(20);

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

  return {
    totalPosts: queueItems?.count || 0,
    scheduledPosts: scheduledCount?.count || 0,
    publishedPosts: publishedCount?.count || 0,
    totalCommentResponses: commentCount?.count || 0,
    pendingCommentApprovals: pendingComments?.count || 0,
    recentActivity,
    featureStatuses,
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

function extractHashtags(text: string): string[] {
  const matches = text.match(/#\w+/g);
  return matches || [];
}

function detectSentiment(text: string): string {
  const positive = ["love", "amazing", "great", "awesome", "best", "thank", "excellent", "fantastic"];
  const negative = ["hate", "bad", "worst", "terrible", "awful", "horrible", "sucks"];
  const lower = text.toLowerCase();
  if (positive.some(w => lower.includes(w))) return "positive";
  if (negative.some(w => lower.includes(w))) return "negative";
  return "neutral";
}
