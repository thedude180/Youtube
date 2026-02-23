import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { contentQualityScores, videos } from "@shared/schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";

const PLATFORM_CONSTRAINTS: Record<string, { title: number; description: number; maxTags?: number; maxHashtags?: number }> = {
  youtube: { title: 100, description: 5000, maxTags: 500 },
  tiktok: { title: 150, description: 2200 },
  x: { title: 280, description: 280 },
  twitter: { title: 280, description: 280 },
  instagram: { title: 2200, description: 2200, maxHashtags: 30 },
};

export async function scoreContentQuality(userId: string, videoId: number): Promise<{
  overallScore: number;
  titleScore: number;
  descriptionScore: number;
  seoScore: number;
  engagementPrediction: number;
  improvements: { field: string; suggestion: string; impact: number }[];
}> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) {
    return { overallScore: 0, titleScore: 0, descriptionScore: 0, seoScore: 0, engagementPrediction: 0, improvements: [] };
  }

  const tags = (video.metadata as any)?.tags || [];
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a content quality analyzer. Score video content on a scale of 0-100 for each category. Provide actionable improvement suggestions with estimated impact (1-10). Respond in JSON format only.`,
      },
      {
        role: "user",
        content: `Analyze this video content quality:
Title: "${video.title}"
Description: "${video.description || "None"}"
Tags: ${tags.length > 0 ? tags.join(", ") : "None"}
Platform: ${video.platform || "youtube"}

Respond with this exact JSON structure:
{
  "titleScore": <0-100>,
  "descriptionScore": <0-100>,
  "seoScore": <0-100>,
  "engagementPrediction": <0-100>,
  "improvements": [
    { "field": "<title|description|tags|thumbnail|seo>", "suggestion": "<actionable suggestion>", "impact": <1-10> }
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  const titleScore = Math.min(100, Math.max(0, result.titleScore || 50));
  const descriptionScore = Math.min(100, Math.max(0, result.descriptionScore || 50));
  const seoScore = Math.min(100, Math.max(0, result.seoScore || 50));
  const engagementPrediction = Math.min(100, Math.max(0, result.engagementPrediction || 50));
  const improvements = Array.isArray(result.improvements) ? result.improvements : [];
  const overallScore = Math.round((titleScore + descriptionScore + seoScore + engagementPrediction) / 4);

  await db.insert(contentQualityScores).values({
    userId,
    videoId,
    overallScore,
    titleScore,
    descriptionScore,
    seoScore,
    engagementPrediction,
    improvements,
    modelUsed: "gpt-4o-mini",
  });

  return { overallScore, titleScore, descriptionScore, seoScore, engagementPrediction, improvements };
}

export async function smartSchedule(userId: string, contentType: string, platform: string): Promise<{
  recommendedTime: string;
  dayOfWeek: string;
  confidence: number;
  reasoning: string;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentVideos = await db
    .select()
    .from(videos)
    .where(
      and(
        gte(videos.publishedAt, thirtyDaysAgo),
        eq(videos.platform, platform)
      )
    )
    .orderBy(desc(videos.publishedAt))
    .limit(50);

  const performanceData = recentVideos.map((v) => {
    const stats = (v.metadata as any)?.stats || {};
    return {
      title: v.title,
      type: v.type,
      publishedAt: v.publishedAt?.toISOString() || "",
      views: stats.views || stats.viewCount || (v.metadata as any)?.viewCount || 0,
      likes: stats.likes || stats.likeCount || (v.metadata as any)?.likeCount || 0,
      comments: stats.comments || stats.commentCount || (v.metadata as any)?.commentCount || 0,
    };
  });

  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a content scheduling expert. Analyze past performance data to recommend optimal posting times. Respond in JSON format only.`,
      },
      {
        role: "user",
        content: `Based on this creator's past performance data, recommend the optimal posting time.

Content Type: ${contentType}
Platform: ${platform}
Recent Videos (${performanceData.length} total):
${JSON.stringify(performanceData.slice(0, 20), null, 2)}

Respond with this exact JSON structure:
{
  "recommendedTime": "<HH:MM in 24hr format, e.g. 14:00>",
  "dayOfWeek": "<Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation of why this time is optimal>"
}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  return {
    recommendedTime: result.recommendedTime || "14:00",
    dayOfWeek: result.dayOfWeek || "Wednesday",
    confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
    reasoning: result.reasoning || "Based on general platform best practices.",
  };
}

export async function getPlatformOptimizations(platform: string, content: { title: string; description: string; tags?: string[] }): Promise<{
  platform: string;
  titleOptimized: string;
  descriptionOptimized: string;
  tagsOptimized: string[];
  characterLimits: { title: number; description: number };
  compliance: { passed: boolean; issues: string[] };
}> {
  const normalizedPlatform = platform.toLowerCase();
  const constraints = PLATFORM_CONSTRAINTS[normalizedPlatform] || PLATFORM_CONSTRAINTS.youtube;
  const issues: string[] = [];

  let titleOptimized = content.title;
  let descriptionOptimized = content.description;
  let tagsOptimized = content.tags ? [...content.tags] : [];

  if (titleOptimized.length > constraints.title) {
    issues.push(`Title exceeds ${constraints.title} character limit (${titleOptimized.length} chars)`);
    titleOptimized = titleOptimized.substring(0, constraints.title - 3) + "...";
  }

  if (descriptionOptimized.length > constraints.description) {
    issues.push(`Description exceeds ${constraints.description} character limit (${descriptionOptimized.length} chars)`);
    descriptionOptimized = descriptionOptimized.substring(0, constraints.description - 3) + "...";
  }

  if (constraints.maxTags && tagsOptimized.length > constraints.maxTags) {
    issues.push(`Too many tags: ${tagsOptimized.length} exceeds limit of ${constraints.maxTags}`);
    tagsOptimized = tagsOptimized.slice(0, constraints.maxTags);
  }

  if (constraints.maxHashtags) {
    const hashtagCount = (descriptionOptimized.match(/#\w+/g) || []).length;
    if (hashtagCount > constraints.maxHashtags) {
      issues.push(`Too many hashtags: ${hashtagCount} exceeds limit of ${constraints.maxHashtags}`);
    }
  }

  if (normalizedPlatform === "youtube") {
    if (!titleOptimized || titleOptimized.length < 10) {
      issues.push("Title is too short for YouTube discovery");
    }
    if (!descriptionOptimized || descriptionOptimized.length < 100) {
      issues.push("Description should be at least 100 characters for YouTube SEO");
    }
    if (tagsOptimized.length < 5) {
      issues.push("Add at least 5 tags for better YouTube discoverability");
    }
  }

  if (normalizedPlatform === "tiktok") {
    if (!descriptionOptimized.match(/#\w+/)) {
      issues.push("TikTok descriptions should include relevant hashtags");
    }
  }

  if (normalizedPlatform === "x" || normalizedPlatform === "twitter") {
    const totalLength = titleOptimized.length + (descriptionOptimized ? descriptionOptimized.length + 1 : 0);
    if (totalLength > 280) {
      issues.push("Combined title and description exceed X's 280 character limit");
      descriptionOptimized = descriptionOptimized.substring(0, 280 - titleOptimized.length - 4) + "...";
    }
  }

  if (normalizedPlatform === "instagram") {
    if (!descriptionOptimized.match(/#\w+/)) {
      issues.push("Instagram captions should include relevant hashtags for reach");
    }
  }

  return {
    platform: normalizedPlatform,
    titleOptimized,
    descriptionOptimized,
    tagsOptimized,
    characterLimits: { title: constraints.title, description: constraints.description },
    compliance: { passed: issues.length === 0, issues },
  };
}

export async function batchScoreContent(userId: string, videoIds: number[]): Promise<{
  scored: number;
  averageScore: number;
  topPerformers: number[];
  needsImprovement: number[];
}> {
  const results: { videoId: number; score: number }[] = [];

  for (const videoId of videoIds) {
    try {
      const result = await scoreContentQuality(userId, videoId);
      results.push({ videoId, score: result.overallScore });
    } catch {
      results.push({ videoId, score: 0 });
    }
  }

  const validResults = results.filter((r) => r.score > 0);
  const averageScore = validResults.length > 0 ? Math.round(validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length) : 0;

  const topPerformers = validResults.filter((r) => r.score >= 75).map((r) => r.videoId);
  const needsImprovement = validResults.filter((r) => r.score < 50).map((r) => r.videoId);

  return {
    scored: validResults.length,
    averageScore,
    topPerformers,
    needsImprovement,
  };
}

export async function getQualityTrend(userId: string, days: number = 30): Promise<{
  trend: "improving" | "stable" | "declining";
  averageScore: number;
  recentScores: { date: string; score: number }[];
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const scores = await db
    .select()
    .from(contentQualityScores)
    .where(
      and(
        eq(contentQualityScores.userId, userId),
        gte(contentQualityScores.createdAt, cutoff)
      )
    )
    .orderBy(desc(contentQualityScores.createdAt));

  if (scores.length === 0) {
    return { trend: "stable", averageScore: 0, recentScores: [] };
  }

  const recentScores = scores.map((s) => ({
    date: s.createdAt?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
    score: s.overallScore || 0,
  }));

  const averageScore = Math.round(recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length);

  let trend: "improving" | "stable" | "declining" = "stable";
  if (recentScores.length >= 3) {
    const halfPoint = Math.floor(recentScores.length / 2);
    const recentHalf = recentScores.slice(0, halfPoint);
    const olderHalf = recentScores.slice(halfPoint);

    const recentAvg = recentHalf.reduce((s, r) => s + r.score, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((s, r) => s + r.score, 0) / olderHalf.length;
    const diff = recentAvg - olderAvg;

    if (diff > 5) trend = "improving";
    else if (diff < -5) trend = "declining";
  }

  return { trend, averageScore, recentScores };
}
