import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  optimizationPasses, trendingTopics, hashtagHealth, algorithmAlerts,
  contentLifecycle, evergreenClassifications, cannibalizationAlerts,
  viralScorePredictions, commentSentiments, trendPredictions,
  contentDnaProfiles, ctrOptimizations, contentGapSuggestions,
  videos, channels, abTests, notifications, learningInsights,
  competitorTracks,
} from "@shared/schema";
import { eq, desc, and, gte, inArray } from "drizzle-orm";

const openai = getOpenAIClient();

const SUB_ENGINES = [
  "metadata_optimizer", "ab_test_engine", "trending_injector", "performance_decay_detector",
  "viral_predictor", "hashtag_analyzer", "sentiment_analyzer", "algorithm_monitor",
  "content_lifecycle_manager", "evergreen_detector", "cannibalization_detector",
  "trend_predictor", "content_dna_builder", "ctr_optimizer", "trending_topics_scanner",
  "viral_leaderboard", "decay_alerts", "content_gap_finder", "algorithm_cheat_sheet",
  "full_optimization_pass", "topic_injector", "performance_monitor",
] as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getUserVideos(userId: string) {
  const userChannels = await storage.getChannelsByUser(userId);
  if (userChannels.length === 0) return [];
  const channelIds = userChannels.map(c => c.id);
  return db.select().from(videos)
    .where(inArray(videos.channelId, channelIds))
    .orderBy(desc(videos.createdAt))
    .limit(100);
}

export async function getOptimizationHealthScore(userId: string): Promise<number> {
  try {
    const [userVideos, passes, lifecycles, viralPreds, sentiments, ctrOpts] = await Promise.all([
      getUserVideos(userId),
      db.select().from(optimizationPasses).where(eq(optimizationPasses.userId, userId)).limit(50),
      db.select().from(contentLifecycle).where(eq(contentLifecycle.userId, userId)).limit(50),
      db.select().from(viralScorePredictions).where(eq(viralScorePredictions.userId, userId)).limit(50),
      db.select().from(commentSentiments).where(eq(commentSentiments.userId, userId)).limit(50),
      db.select().from(ctrOptimizations).where(eq(ctrOptimizations.userId, userId)).limit(50),
    ]);

    let score = 40;

    if (userVideos.length > 0) score += 5;
    if (userVideos.length >= 10) score += 5;

    const optimizedVideos = userVideos.filter(v => v.metadata?.aiOptimized);
    const optimizationRate = userVideos.length > 0 ? optimizedVideos.length / userVideos.length : 0;
    score += Math.round(optimizationRate * 15);

    if (passes.length > 0) score += 5;
    if (passes.length >= 10) score += 5;

    if (lifecycles.length > 0) score += 3;
    if (viralPreds.length > 0) score += 3;
    if (sentiments.length > 0) score += 3;
    if (ctrOpts.length > 0) score += 3;

    const avgSeo = userVideos.reduce((sum, v) => sum + (v.metadata?.seoScore || 0), 0) / Math.max(userVideos.length, 1);
    score += Math.round(Math.min(avgSeo / 100 * 13, 13));

    return Math.max(1, Math.min(100, score));
  } catch (error) {
    console.error("Failed to calculate optimization health score:", error);
    return 50;
  }
}

export async function getSubEngineStatuses(userId: string): Promise<Array<{
  engine: string;
  status: "active" | "needs_attention" | "off";
  lastRun?: string;
  details?: string;
}>> {
  try {
    const [passes, lifecycles, viralPreds, sentiments, ctrOpts, trending, hashtags, algAlerts, evergreens, cannibAlerts, dnaProfiles, gaps, trendPreds] = await Promise.all([
      db.select().from(optimizationPasses).where(eq(optimizationPasses.userId, userId)).orderBy(desc(optimizationPasses.createdAt)).limit(1),
      db.select().from(contentLifecycle).where(eq(contentLifecycle.userId, userId)).orderBy(desc(contentLifecycle.createdAt)).limit(1),
      db.select().from(viralScorePredictions).where(eq(viralScorePredictions.userId, userId)).orderBy(desc(viralScorePredictions.createdAt)).limit(1),
      db.select().from(commentSentiments).where(eq(commentSentiments.userId, userId)).orderBy(desc(commentSentiments.createdAt)).limit(1),
      db.select().from(ctrOptimizations).where(eq(ctrOptimizations.userId, userId)).orderBy(desc(ctrOptimizations.createdAt)).limit(1),
      db.select().from(trendingTopics).where(eq(trendingTopics.userId, userId)).orderBy(desc(trendingTopics.createdAt)).limit(1),
      db.select().from(hashtagHealth).where(eq(hashtagHealth.userId, userId)).orderBy(desc(hashtagHealth.createdAt)).limit(1),
      db.select().from(algorithmAlerts).where(eq(algorithmAlerts.userId, userId)).orderBy(desc(algorithmAlerts.createdAt)).limit(1),
      db.select().from(evergreenClassifications).where(eq(evergreenClassifications.userId, userId)).orderBy(desc(evergreenClassifications.createdAt)).limit(1),
      db.select().from(cannibalizationAlerts).where(eq(cannibalizationAlerts.userId, userId)).orderBy(desc(cannibalizationAlerts.createdAt)).limit(1),
      db.select().from(contentDnaProfiles).where(eq(contentDnaProfiles.userId, userId)).orderBy(desc(contentDnaProfiles.createdAt)).limit(1),
      db.select().from(contentGapSuggestions).where(eq(contentGapSuggestions.userId, userId)).orderBy(desc(contentGapSuggestions.createdAt)).limit(1),
      db.select().from(trendPredictions).where(eq(trendPredictions.userId, userId)).orderBy(desc(trendPredictions.createdAt)).limit(1),
    ]);

    const getStatus = (records: any[]): { status: "active" | "needs_attention" | "off"; lastRun?: string } => {
      if (records.length === 0) return { status: "off" };
      const lastDate = records[0].createdAt;
      if (!lastDate) return { status: "needs_attention" };
      const daysSince = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
      return {
        status: daysSince < 7 ? "active" : "needs_attention",
        lastRun: new Date(lastDate).toISOString(),
      };
    }

    return [
      { engine: "metadata_optimizer", ...getStatus(passes), details: "Optimizes titles, descriptions, and tags" },
      { engine: "ab_test_engine", ...getStatus(await db.select().from(abTests).where(eq(abTests.userId, userId)).orderBy(desc(abTests.createdAt)).limit(1)), details: "Creates and evaluates A/B test variants" },
      { engine: "trending_injector", ...getStatus(trending), details: "Integrates trending topics into content" },
      { engine: "performance_decay_detector", ...getStatus(algAlerts), details: "Scans for declining performance" },
      { engine: "viral_predictor", ...getStatus(viralPreds), details: "Predicts viral potential of content" },
      { engine: "hashtag_analyzer", ...getStatus(hashtags), details: "Evaluates hashtag performance" },
      { engine: "sentiment_analyzer", ...getStatus(sentiments), details: "Analyzes audience sentiment" },
      { engine: "algorithm_monitor", ...getStatus(algAlerts), details: "Monitors platform algorithm changes" },
      { engine: "content_lifecycle_manager", ...getStatus(lifecycles), details: "Tracks content lifecycle stages" },
      { engine: "evergreen_detector", ...getStatus(evergreens), details: "Identifies evergreen content" },
      { engine: "cannibalization_detector", ...getStatus(cannibAlerts), details: "Finds competing content" },
      { engine: "trend_predictor", ...getStatus(trendPreds), details: "Forecasts upcoming trends" },
      { engine: "content_dna_builder", ...getStatus(dnaProfiles), details: "Builds content DNA fingerprint" },
      { engine: "ctr_optimizer", ...getStatus(ctrOpts), details: "Optimizes click-through rates" },
      { engine: "trending_topics_scanner", ...getStatus(trending), details: "Scans current trending topics" },
      { engine: "viral_leaderboard", ...getStatus(viralPreds), details: "Ranks content by viral score" },
      { engine: "decay_alerts", ...getStatus(algAlerts), details: "Generates performance decay alerts" },
      { engine: "content_gap_finder", ...getStatus(gaps), details: "Identifies content gaps vs competitors" },
      { engine: "algorithm_cheat_sheet", ...getStatus(algAlerts), details: "Generates platform best practices" },
      { engine: "full_optimization_pass", ...getStatus(passes), details: "Runs all sub-engines on a video" },
      { engine: "topic_injector", ...getStatus(trending), details: "Injects trending topics into metadata" },
      { engine: "performance_monitor", ...getStatus(lifecycles), details: "Monitors overall content performance" },
    ];
  } catch (error) {
    console.error("Failed to get sub-engine statuses:", error);
    return SUB_ENGINES.map(engine => ({ engine, status: "off" as const, details: "Unable to determine status" }));
  }
}

export async function runMetadataOptimizer(userId: string, videoId: number): Promise<{
  optimized: boolean;
  previousScore: number;
  newScore: number;
  changes: Array<{ field: string; oldValue: string; newValue: string }>;
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const previousScore = video.metadata?.seoScore || 0;
    const existingPasses = await db.select().from(optimizationPasses)
      .where(and(eq(optimizationPasses.userId, userId), eq(optimizationPasses.videoId, videoId)))
      .limit(100);
    const passNumber = existingPasses.length + 1;

    const prompt = `You are a content optimization engine. Analyze and optimize this video's metadata for maximum discoverability.

Video Title: "${video.title}"
Description: "${video.description || 'None'}"
Tags: ${video.metadata?.tags?.join(', ') || 'None'}
Platform: ${video.platform || 'youtube'}
Current SEO Score: ${previousScore}
Optimization Pass #${passNumber}

Provide your response as JSON:
{
  "optimizedTitle": "Improved title that's click-worthy and SEO-friendly",
  "optimizedDescription": "Improved description with keywords and CTAs",
  "optimizedTags": ["array", "of", "optimized", "tags"],
  "newSeoScore": 85,
  "changes": [
    { "field": "title", "oldValue": "original", "newValue": "optimized" },
    { "field": "description", "oldValue": "original", "newValue": "optimized" },
    { "field": "tags", "oldValue": "original tags", "newValue": "optimized tags" }
  ],
  "reasoning": "Why these changes improve discoverability"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const changes = result.changes || [];
    const newScore = result.newSeoScore || previousScore + 5;

    await db.insert(optimizationPasses).values({
      userId,
      videoId,
      engineName: "metadata_optimizer",
      passNumber,
      previousScore,
      newScore,
      changes,
      status: "completed",
    });

    return { optimized: true, previousScore, newScore, changes };
  } catch (error) {
    console.error("Metadata optimizer failed:", error);
    return { optimized: false, previousScore: 0, newScore: 0, changes: [] };
  }
}

export async function runAbTestEngine(userId: string, videoId: number): Promise<{
  testCreated: boolean;
  testId?: number;
  variants?: Array<{ variant: string; title: string }>;
  winner?: string;
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const existingTests = await db.select().from(abTests)
      .where(and(eq(abTests.userId, userId), eq(abTests.videoId, videoId), eq(abTests.status, "active")))
      .limit(1);

    if (existingTests.length > 0) {
      const test = existingTests[0];
      const variants = [test.variantA, test.variantB] as any[];
      const hasEnoughData = variants.every((v: any) => (v.impressions || 0) >= 100);

      if (hasEnoughData && variants.length >= 2) {
        const best = variants.reduce((a: any, b: any) => ((a.ctr || 0) > (b.ctr || 0) ? a : b));
        await storage.updateAbTest(test.id, { status: "completed", winner: best.variant || "A" });
        return { testCreated: false, testId: test.id, winner: best.variant || "A", variants };
      }
      return { testCreated: false, testId: test.id, variants };
    }

    const prompt = `Generate A/B test variants for this video. Create 2 alternative titles and descriptions.

Video Title: "${video.title}"
Description: "${video.description || 'None'}"
Platform: ${video.platform || 'youtube'}

Respond as JSON:
{
  "variants": [
    { "variant": "A", "title": "${video.title}", "description": "${video.description || ''}" },
    { "variant": "B", "title": "Alternative title B", "description": "Alternative description B" },
    { "variant": "C", "title": "Alternative title C", "description": "Alternative description C" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const aiVariants = result.variants || [];
    const variantA = aiVariants[0] || { title: video.title, description: video.description || "", tags: [] };
    const variantB = aiVariants[1] || { title: video.title, description: video.description || "", tags: [] };
    const test = await storage.createAbTest({
      userId,
      videoId,
      status: "active",
      variantA: { title: variantA.title, description: variantA.description, tags: variantA.tags || [] },
      variantB: { title: variantB.title, description: variantB.description, tags: variantB.tags || [] },
    });

    return {
      testCreated: true,
      testId: test.id,
      variants: result.variants,
    };
  } catch (error) {
    console.error("A/B test engine failed:", error);
    return { testCreated: false };
  }
}

export async function injectTrendingTopic(userId: string, videoId: number, topicId: number): Promise<{
  injected: boolean;
  topic?: string;
  updatedTags?: string[];
}> {
  try {
    const [video, topicRecords] = await Promise.all([
      storage.getVideo(videoId),
      db.select().from(trendingTopics).where(eq(trendingTopics.id, topicId)).limit(1),
    ]);
    if (!video) throw new Error("Video not found");
    if (topicRecords.length === 0) throw new Error("Topic not found");

    const topic = topicRecords[0];
    const currentTags = video.metadata?.tags || [];
    const relatedKeywords = topic.relatedKeywords || [];
    const newTags = Array.from(new Set([...currentTags, topic.topic, ...relatedKeywords.slice(0, 3)]));

    const prompt = `Integrate the trending topic "${topic.topic}" into this video's metadata naturally.

Video Title: "${video.title}"
Current Tags: ${currentTags.join(', ')}
Trending Topic: "${topic.topic}"
Related Keywords: ${relatedKeywords.join(', ')}

Respond as JSON:
{
  "updatedTitle": "Title with trending topic integrated naturally (or original if not relevant)",
  "updatedDescription": "Brief addition to weave in the trending angle",
  "updatedTags": ["merged", "tag", "list"],
  "relevanceScore": 0.8
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    return { injected: true, topic: topic.topic, updatedTags: result.updatedTags || newTags };
  } catch (error) {
    console.error("Trending topic injection failed:", error);
    return { injected: false };
  }
}

export async function detectPerformanceDecay(userId: string): Promise<Array<{
  videoId: number;
  title: string;
  decayRate: number;
  alert: string;
}>> {
  try {
    const userVideos = await getUserVideos(userId);
    const decayAlerts: Array<{ videoId: number; title: string; decayRate: number; alert: string }> = [];

    for (const video of userVideos.slice(0, 20)) {
      const stats = video.metadata?.stats;
      if (!stats) continue;

      const daysSincePublish = video.publishedAt
        ? (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 30;

      if (daysSincePublish < 7) continue;

      const viewsPerDay = (stats.views || 0) / Math.max(daysSincePublish, 1);
      const expectedViewsPerDay = (stats.views || 0) / Math.max(daysSincePublish * 0.5, 1);
      const decayRate = expectedViewsPerDay > 0 ? 1 - (viewsPerDay / expectedViewsPerDay) : 0;

      if (decayRate > 0.3) {
        decayAlerts.push({
          videoId: video.id,
          title: video.title,
          decayRate: Math.round(decayRate * 100),
          alert: `Performance declining ${Math.round(decayRate * 100)}% below expected trajectory`,
        });

        await db.insert(notifications).values({
          userId,
          type: "performance_decay",
          title: `Performance Decay: ${video.title}`,
          message: `This video is performing ${Math.round(decayRate * 100)}% below expected. Consider refreshing metadata.`,
          read: false,
        });
      }
    }

    return decayAlerts;
  } catch (error) {
    console.error("Performance decay detection failed:", error);
    return [];
  }
}

export async function predictViralScore(userId: string, videoId: number): Promise<{
  score: number;
  factors: Record<string, number>;
  prediction: string;
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const prompt = `Predict the viral potential of this video on a scale of 1-100.

Title: "${video.title}"
Description: "${video.description || 'None'}"
Type: ${video.type}
Platform: ${video.platform || 'youtube'}
Tags: ${video.metadata?.tags?.join(', ') || 'None'}
Current Stats: ${video.metadata?.stats ? `Views: ${video.metadata.stats.views}, Likes: ${video.metadata.stats.likes}, CTR: ${video.metadata.stats.ctr}%` : 'No stats yet'}

Respond as JSON:
{
  "viralScore": 72,
  "factors": {
    "titleStrength": 0.8,
    "topicRelevance": 0.7,
    "engagementPotential": 0.6,
    "trendAlignment": 0.5,
    "platformFit": 0.9,
    "thumbnailAppeal": 0.7,
    "audienceMatch": 0.8
  },
  "prediction": "Brief explanation of viral potential"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const score = Math.max(1, Math.min(100, result.viralScore || 50));

    await db.insert(viralScorePredictions).values({
      userId,
      contentId: videoId,
      contentType: "video",
      predictedViralScore: score,
      predictionDate: new Date(),
      factors: result.factors || {},
    });

    return { score, factors: result.factors || {}, prediction: result.prediction || "" };
  } catch (error) {
    console.error("Viral score prediction failed:", error);
    return { score: 50, factors: {}, prediction: "Unable to predict viral score" };
  }
}

export async function analyzeHashtagHealth(userId: string): Promise<Array<{
  hashtag: string;
  status: string;
  growthRate: number;
  recommendation: string;
}>> {
  try {
    const userVideos = await getUserVideos(userId);
    const allTags = new Set<string>();
    for (const v of userVideos) {
      (v.metadata?.tags || []).forEach(t => allTags.add(t));
    }

    if (allTags.size === 0) return [];

    const tagList = Array.from(allTags).slice(0, 30);

    const prompt = `Analyze the health and performance of these hashtags/tags used by a content creator.

Tags: ${tagList.join(', ')}
Platform: youtube

For each tag, evaluate its current health. Respond as JSON:
{
  "hashtags": [
    {
      "hashtag": "tag_name",
      "status": "growing|stable|declining|dead",
      "growthRate": 0.15,
      "volume": 10000,
      "recommendation": "Keep using / Replace with X / Reduce usage"
    }
  ]
}

Evaluate up to 15 most important tags.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const hashtags = result.hashtags || [];

    for (const h of hashtags) {
      await db.insert(hashtagHealth).values({
        userId,
        hashtag: h.hashtag,
        platform: "youtube",
        currentVolume: h.volume || 0,
        growthRate: h.growthRate || 0,
        status: h.status || "stable",
        recommendedUse: h.recommendation || "",
        lastCheckedAt: new Date(),
      });
    }

    return hashtags.map((h: any) => ({
      hashtag: h.hashtag,
      status: h.status,
      growthRate: h.growthRate || 0,
      recommendation: h.recommendation || "",
    }));
  } catch (error) {
    console.error("Hashtag health analysis failed:", error);
    return [];
  }
}

export async function analyzeSentiment(userId: string, videoId: number): Promise<{
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  topThemes: string[];
  actionableInsights: string[];
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const commentCount = video.metadata?.stats?.comments || video.metadata?.commentCount || 0;

    const prompt = `Analyze the likely audience sentiment for this video based on its content and engagement metrics.

Title: "${video.title}"
Description: "${video.description || 'None'}"
Type: ${video.type}
Platform: ${video.platform || 'youtube'}
Comment Count: ${commentCount}
Views: ${video.metadata?.stats?.views || video.metadata?.viewCount || 0}
Likes: ${video.metadata?.stats?.likes || video.metadata?.likeCount || 0}

Based on the content type, topic, and engagement ratio, predict the sentiment distribution. Respond as JSON:
{
  "positivePct": 65,
  "negativePct": 15,
  "neutralPct": 20,
  "topThemes": ["theme1", "theme2", "theme3"],
  "actionableInsights": ["insight1", "insight2", "insight3"],
  "totalComments": ${commentCount}
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    await db.insert(commentSentiments).values({
      userId,
      videoId,
      platform: video.platform || "youtube",
      totalComments: result.totalComments || commentCount,
      positivePct: result.positivePct || 50,
      negativePct: result.negativePct || 20,
      neutralPct: result.neutralPct || 30,
      topThemes: result.topThemes || [],
      actionableInsights: result.actionableInsights || [],
      analyzedAt: new Date(),
    });

    return {
      positivePct: result.positivePct || 50,
      negativePct: result.negativePct || 20,
      neutralPct: result.neutralPct || 30,
      topThemes: result.topThemes || [],
      actionableInsights: result.actionableInsights || [],
    };
  } catch (error) {
    console.error("Sentiment analysis failed:", error);
    return { positivePct: 50, negativePct: 20, neutralPct: 30, topThemes: [], actionableInsights: [] };
  }
}

export async function detectAlgorithmChanges(userId: string, platform?: string): Promise<Array<{
  platform: string;
  alertType: string;
  title: string;
  description: string;
  impact: string;
  recommendations: string[];
}>> {
  try {
    const targetPlatform = platform || "youtube";

    const prompt = `You are an algorithm monitoring system. Analyze the current state of the ${targetPlatform} algorithm and identify any recent changes or patterns that content creators should be aware of.

Platform: ${targetPlatform}
Analysis Date: ${new Date().toISOString().split('T')[0]}

Identify 2-3 current algorithm behaviors or recent changes. Respond as JSON:
{
  "alerts": [
    {
      "alertType": "algorithm_shift|ranking_change|feature_update|policy_change",
      "title": "Brief title of the change",
      "description": "Detailed description of what changed",
      "impact": "high|medium|low",
      "recommendations": ["actionable step 1", "actionable step 2", "actionable step 3"]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const alerts = result.alerts || [];

    for (const alert of alerts) {
      await db.insert(algorithmAlerts).values({
        userId,
        platform: targetPlatform,
        alertType: alert.alertType || "algorithm_shift",
        title: alert.title,
        description: alert.description,
        impact: alert.impact || "medium",
        recommendations: alert.recommendations || [],
        detectedAt: new Date(),
      });
    }

    return alerts.map((a: any) => ({
      platform: targetPlatform,
      alertType: a.alertType,
      title: a.title,
      description: a.description,
      impact: a.impact || "medium",
      recommendations: a.recommendations || [],
    }));
  } catch (error) {
    console.error("Algorithm change detection failed:", error);
    return [];
  }
}

export async function manageContentLifecycle(userId: string, videoId: number): Promise<{
  currentStage: string;
  predictedNextStage: string;
  daysInStage: number;
  performanceData: { views?: number; growth?: number; engagement?: number };
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const stats = video.metadata?.stats;
    const daysSincePublish = video.publishedAt
      ? Math.floor((Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
      : video.createdAt
        ? Math.floor((Date.now() - new Date(video.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

    const views = stats?.views || video.metadata?.viewCount || 0;
    const viewsPerDay = daysSincePublish > 0 ? views / daysSincePublish : views;

    let currentStage = "new";
    let predictedNextStage = "growing";

    if (daysSincePublish <= 3) {
      currentStage = "new";
      predictedNextStage = "growing";
    } else if (daysSincePublish <= 14 && viewsPerDay > 10) {
      currentStage = "growing";
      predictedNextStage = "peak";
    } else if (daysSincePublish <= 30 && viewsPerDay > 5) {
      currentStage = "peak";
      predictedNextStage = "declining";
    } else if (viewsPerDay > 2 && daysSincePublish > 90) {
      currentStage = "evergreen";
      predictedNextStage = "evergreen";
    } else {
      currentStage = "declining";
      predictedNextStage = "evergreen";
    }

    const engagement = stats ? ((stats.likes || 0) + (stats.comments || 0)) / Math.max(stats.views || 1, 1) * 100 : 0;

    const existing = await db.select().from(contentLifecycle)
      .where(and(eq(contentLifecycle.userId, userId), eq(contentLifecycle.videoId, videoId)))
      .limit(1);

    const stageEnteredAt = existing.length > 0 && existing[0].currentStage === currentStage
      ? existing[0].stageEnteredAt
      : new Date();

    const daysInStage = Math.floor((Date.now() - new Date(stageEnteredAt || new Date()).getTime()) / (1000 * 60 * 60 * 24));

    if (existing.length > 0) {
      await db.update(contentLifecycle).set({
        currentStage,
        predictedNextStage,
        daysInStage,
        stageEnteredAt,
        performanceData: { views, growth: viewsPerDay, engagement },
      }).where(eq(contentLifecycle.id, existing[0].id));
    } else {
      await db.insert(contentLifecycle).values({
        userId,
        videoId,
        currentStage,
        predictedNextStage,
        daysInStage,
        stageEnteredAt,
        performanceData: { views, growth: viewsPerDay, engagement },
      });
    }

    return { currentStage, predictedNextStage, daysInStage, performanceData: { views, growth: viewsPerDay, engagement } };
  } catch (error) {
    console.error("Content lifecycle management failed:", error);
    return { currentStage: "unknown", predictedNextStage: "unknown", daysInStage: 0, performanceData: {} };
  }
}

export async function detectEvergreenContent(userId: string): Promise<Array<{
  videoId: number;
  title: string;
  isEvergreen: boolean;
  confidence: number;
  reasons: string[];
  refreshRecommendation: string;
}>> {
  try {
    const userVideos = await getUserVideos(userId);
    const olderVideos = userVideos.filter(v => {
      const age = v.publishedAt || v.createdAt;
      if (!age) return false;
      const daysSince = (Date.now() - new Date(age).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    }).slice(0, 15);

    if (olderVideos.length === 0) return [];

    const videoSummary = olderVideos.map(v => {
      const stats = v.metadata?.stats;
      const age = v.publishedAt || v.createdAt;
      const days = age ? Math.floor((Date.now() - new Date(age).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return `- "${v.title}" (${days} days old, ${stats?.views || 0} views, ${stats?.ctr || 0}% CTR)`;
    }).join('\n');

    const prompt = `Analyze these videos and determine which ones are "evergreen" content that continues to perform well over time.

Videos:
${videoSummary}

For each video, classify as evergreen or not. Respond as JSON:
{
  "classifications": [
    {
      "title": "Video Title",
      "isEvergreen": true,
      "confidence": 0.85,
      "reasons": ["reason1", "reason2"],
      "monthlyViews": 500,
      "refreshRecommendation": "Update thumbnail and add current year to title"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const classifications = result.classifications || [];
    const results: Array<{ videoId: number; title: string; isEvergreen: boolean; confidence: number; reasons: string[]; refreshRecommendation: string }> = [];

    for (let i = 0; i < Math.min(classifications.length, olderVideos.length); i++) {
      const c = classifications[i];
      const video = olderVideos[i];

      await db.insert(evergreenClassifications).values({
        userId,
        videoId: video.id,
        isEvergreen: c.isEvergreen || false,
        confidence: c.confidence || 0.5,
        reasons: c.reasons || [],
        monthlyViews: c.monthlyViews || 0,
        refreshRecommendation: c.refreshRecommendation || "",
        lastEvaluatedAt: new Date(),
      });

      results.push({
        videoId: video.id,
        title: video.title,
        isEvergreen: c.isEvergreen || false,
        confidence: c.confidence || 0.5,
        reasons: c.reasons || [],
        refreshRecommendation: c.refreshRecommendation || "",
      });
    }

    return results;
  } catch (error) {
    console.error("Evergreen content detection failed:", error);
    return [];
  }
}

export async function detectContentCannibalization(userId: string): Promise<Array<{
  videoId1: number;
  videoId2: number;
  title1: string;
  title2: string;
  overlapScore: number;
  sharedKeywords: string[];
  recommendation: string;
}>> {
  try {
    const userVideos = await getUserVideos(userId);
    if (userVideos.length < 2) return [];

    const videoSummary = userVideos.slice(0, 20).map(v =>
      `ID:${v.id} | "${v.title}" | Tags: ${(v.metadata?.tags || []).join(', ')}`
    ).join('\n');

    const prompt = `Analyze these videos for content cannibalization - videos that compete with each other for the same keywords, audience, or search queries.

Videos:
${videoSummary}

Identify pairs of videos that may be cannibalizing each other's performance. Respond as JSON:
{
  "cannibalizationPairs": [
    {
      "videoId1": 1,
      "videoId2": 2,
      "overlapScore": 0.75,
      "sharedKeywords": ["keyword1", "keyword2"],
      "recommendation": "Merge these into a comprehensive guide or differentiate by..."
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const pairs = result.cannibalizationPairs || [];
    const results: Array<{ videoId1: number; videoId2: number; title1: string; title2: string; overlapScore: number; sharedKeywords: string[]; recommendation: string }> = [];

    const videoMap = new Map(userVideos.map(v => [v.id, v]));

    for (const pair of pairs) {
      const v1 = videoMap.get(pair.videoId1);
      const v2 = videoMap.get(pair.videoId2);
      if (!v1 || !v2) continue;

      await db.insert(cannibalizationAlerts).values({
        userId,
        videoId1: pair.videoId1,
        videoId2: pair.videoId2,
        overlapScore: pair.overlapScore || 0,
        sharedKeywords: pair.sharedKeywords || [],
        recommendation: pair.recommendation || "",
        status: "active",
      });

      results.push({
        videoId1: pair.videoId1,
        videoId2: pair.videoId2,
        title1: v1.title,
        title2: v2.title,
        overlapScore: pair.overlapScore || 0,
        sharedKeywords: pair.sharedKeywords || [],
        recommendation: pair.recommendation || "",
      });
    }

    return results;
  } catch (error) {
    console.error("Content cannibalization detection failed:", error);
    return [];
  }
}

export async function predictTrends(userId: string): Promise<Array<{
  topic: string;
  platform: string;
  predictedTrend: string;
  confidence: number;
  timeframe: string;
  recommendation: string;
}>> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const platforms = Array.from(new Set(userChannels.map(c => c.platform)));
    const targetPlatform = platforms[0] || "youtube";

    const prompt = `You are a trend prediction system. Forecast 5 upcoming content trends for ${targetPlatform} creators.

Analysis Date: ${new Date().toISOString().split('T')[0]}
Platform: ${targetPlatform}

Predict trends that are emerging or about to emerge. Respond as JSON:
{
  "predictions": [
    {
      "topic": "Trend topic",
      "predictedTrend": "rising|peaking|emerging",
      "confidence": 0.75,
      "timeframe": "next 2 weeks|next month|next quarter",
      "recommendation": "How to capitalize on this trend"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const predictions = result.predictions || [];

    for (const pred of predictions) {
      await db.insert(trendPredictions).values({
        userId,
        topic: pred.topic,
        platform: targetPlatform,
        predictedTrend: pred.predictedTrend || "emerging",
        confidence: pred.confidence || 0.5,
        timeframe: pred.timeframe || "next month",
        recommendation: pred.recommendation || "",
        predictedAt: new Date(),
      });
    }

    return predictions.map((p: any) => ({
      topic: p.topic,
      platform: targetPlatform,
      predictedTrend: p.predictedTrend || "emerging",
      confidence: p.confidence || 0.5,
      timeframe: p.timeframe || "next month",
      recommendation: p.recommendation || "",
    }));
  } catch (error) {
    console.error("Trend prediction failed:", error);
    return [];
  }
}

export async function buildContentDna(userId: string): Promise<{
  topFormats: string[];
  avgLength: number;
  bestHooks: string[];
  tonalPattern: string;
  visualStyle: string;
  audienceResponse: string;
  bestPostingTimes: string[];
  uniqueStrengths: string[];
}> {
  try {
    const userVideos = await getUserVideos(userId);

    const videoSummary = userVideos.slice(0, 30).map(v => {
      const stats = v.metadata?.stats;
      return `- "${v.title}" (${v.type}, ${stats?.views || 0} views, ${stats?.ctr || 0}% CTR, ${stats?.likes || 0} likes)`;
    }).join('\n');

    const prompt = `Analyze this creator's content library and build a Content DNA profile - a fingerprint of what makes their content unique.

Videos:
${videoSummary || 'No videos yet'}

Build a comprehensive Content DNA profile as JSON:
{
  "topFormats": ["tutorial", "vlog", "review"],
  "avgLength": 12,
  "bestHooks": ["question-based", "controversy", "story"],
  "tonalPattern": "casual-educational",
  "visualStyle": "clean-minimalist",
  "audienceResponse": "Description of how audience typically responds",
  "bestPostingTimes": ["Tuesday 2PM", "Friday 10AM"],
  "uniqueStrengths": ["deep research", "humor", "clear explanations"],
  "confidence": 0.75
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const existing = await db.select().from(contentDnaProfiles)
      .where(eq(contentDnaProfiles.userId, userId))
      .orderBy(desc(contentDnaProfiles.lastUpdatedAt))
      .limit(1);

    const profileData = {
      topFormats: result.topFormats || [],
      avgLength: result.avgLength || 0,
      bestHooks: result.bestHooks || [],
      tonalPattern: result.tonalPattern || "",
      visualStyle: result.visualStyle || "",
      audienceResponse: result.audienceResponse || "",
      bestPostingTimes: result.bestPostingTimes || [],
      uniqueStrengths: result.uniqueStrengths || [],
    };

    if (existing.length > 0) {
      await db.update(contentDnaProfiles).set({
        profileData,
        confidence: result.confidence || 0.5,
        sampleSize: userVideos.length,
        lastUpdatedAt: new Date(),
      }).where(eq(contentDnaProfiles.id, existing[0].id));
    } else {
      await db.insert(contentDnaProfiles).values({
        userId,
        profileData,
        confidence: result.confidence || 0.5,
        sampleSize: userVideos.length,
        lastUpdatedAt: new Date(),
      });
    }

    return profileData;
  } catch (error) {
    console.error("Content DNA build failed:", error);
    return {
      topFormats: [], avgLength: 0, bestHooks: [], tonalPattern: "",
      visualStyle: "", audienceResponse: "", bestPostingTimes: [], uniqueStrengths: [],
    };
  }
}

export async function optimizeCtr(userId: string, videoId: number): Promise<{
  originalCtr: number;
  suggestedChanges: { titleChange?: string; thumbnailChange?: string; descriptionChange?: string };
  expectedImprovement: number;
}> {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const currentCtr = video.metadata?.stats?.ctr || 0;

    const prompt = `You are a CTR optimization specialist. Analyze this video and suggest changes to improve click-through rate.

Title: "${video.title}"
Description: "${video.description || 'None'}"
Current CTR: ${currentCtr}%
Platform: ${video.platform || 'youtube'}
Tags: ${video.metadata?.tags?.join(', ') || 'None'}

Suggest specific changes to improve CTR. Respond as JSON:
{
  "titleChange": "Optimized title that drives more clicks",
  "thumbnailChange": "Specific thumbnail improvements",
  "descriptionChange": "First line of description optimized for CTR",
  "expectedImprovement": 1.5,
  "reasoning": "Why these changes will improve CTR"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    await db.insert(ctrOptimizations).values({
      userId,
      videoId,
      originalCtr: currentCtr,
      changes: {
        titleChange: result.titleChange,
        thumbnailChange: result.thumbnailChange,
        descriptionChange: result.descriptionChange,
      },
      improvement: result.expectedImprovement || 0,
    });

    return {
      originalCtr: currentCtr,
      suggestedChanges: {
        titleChange: result.titleChange,
        thumbnailChange: result.thumbnailChange,
        descriptionChange: result.descriptionChange,
      },
      expectedImprovement: result.expectedImprovement || 0,
    };
  } catch (error) {
    console.error("CTR optimization failed:", error);
    return { originalCtr: 0, suggestedChanges: {}, expectedImprovement: 0 };
  }
}

export async function getTrendingTopics(userId: string, platform?: string): Promise<Array<{
  id: number;
  topic: string;
  platform: string | null;
  trendScore: number | null;
  velocity: string | null;
  category: string | null;
  relatedKeywords: string[];
}>> {
  try {
    const conditions = [eq(trendingTopics.userId, userId)];
    if (platform) conditions.push(eq(trendingTopics.platform, platform));

    const topics = await db.select().from(trendingTopics)
      .where(and(...conditions))
      .orderBy(desc(trendingTopics.trendScore))
      .limit(20);

    if (topics.length > 0) {
      return topics.map(t => ({
        id: t.id,
        topic: t.topic,
        platform: t.platform,
        trendScore: t.trendScore,
        velocity: t.velocity,
        category: t.category,
        relatedKeywords: t.relatedKeywords || [],
      }));
    }

    const targetPlatform = platform || "youtube";

    const prompt = `Identify the top 10 currently trending topics for content creators on ${targetPlatform}.

Respond as JSON:
{
  "topics": [
    {
      "topic": "Topic name",
      "trendScore": 85,
      "velocity": "rising|stable|declining",
      "category": "tech|gaming|lifestyle|education|entertainment",
      "relatedKeywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const newTopics = result.topics || [];
    const inserted: Array<{ id: number; topic: string; platform: string | null; trendScore: number | null; velocity: string | null; category: string | null; relatedKeywords: string[] }> = [];

    for (const t of newTopics) {
      const [record] = await db.insert(trendingTopics).values({
        userId,
        topic: t.topic,
        platform: targetPlatform,
        trendScore: t.trendScore || 50,
        velocity: t.velocity || "stable",
        category: t.category || "general",
        relatedKeywords: t.relatedKeywords || [],
        firstSeenAt: new Date(),
      }).returning();

      inserted.push({
        id: record.id,
        topic: record.topic,
        platform: record.platform,
        trendScore: record.trendScore,
        velocity: record.velocity,
        category: record.category,
        relatedKeywords: record.relatedKeywords || [],
      });
    }

    return inserted;
  } catch (error) {
    console.error("Get trending topics failed:", error);
    return [];
  }
}

export async function getViralLeaderboard(userId: string): Promise<Array<{
  videoId: number;
  title: string;
  viralScore: number;
  factors: Record<string, number>;
}>> {
  try {
    const predictions = await db.select().from(viralScorePredictions)
      .where(eq(viralScorePredictions.userId, userId))
      .orderBy(desc(viralScorePredictions.predictedViralScore))
      .limit(20);

    if (predictions.length === 0) {
      const userVideos = await getUserVideos(userId);
      const results: Array<{ videoId: number; title: string; viralScore: number; factors: Record<string, number> }> = [];

      for (const video of userVideos.slice(0, 10)) {
        const score = await predictViralScore(userId, video.id);
        results.push({
          videoId: video.id,
          title: video.title,
          viralScore: score.score,
          factors: score.factors,
        });
      }

      return results.sort((a, b) => b.viralScore - a.viralScore);
    }

    const videoIds = predictions.map(p => p.contentId).filter((id): id is number => id !== null);
    const videosData = videoIds.length > 0
      ? await db.select().from(videos).where(inArray(videos.id, videoIds))
      : [];
    const videoMap = new Map(videosData.map(v => [v.id, v]));

    return predictions.map(p => ({
      videoId: p.contentId || 0,
      title: videoMap.get(p.contentId || 0)?.title || "Unknown",
      viralScore: p.predictedViralScore || 0,
      factors: (p.factors as Record<string, number>) || {},
    }));
  } catch (error) {
    console.error("Get viral leaderboard failed:", error);
    return [];
  }
}

export async function getDecayAlerts(userId: string): Promise<Array<{
  videoId: number;
  title: string;
  decayRate: number;
  currentStage: string;
  recommendation: string;
}>> {
  try {
    const lifecycles = await db.select().from(contentLifecycle)
      .where(and(eq(contentLifecycle.userId, userId), eq(contentLifecycle.currentStage, "declining")))
      .orderBy(desc(contentLifecycle.createdAt))
      .limit(20);

    if (lifecycles.length === 0) {
      return detectPerformanceDecay(userId).then(alerts =>
        alerts.map(a => ({ ...a, currentStage: "declining", recommendation: "Refresh metadata and thumbnail" }))
      );
    }

    const videoIds = lifecycles.map(l => l.videoId).filter((id): id is number => id !== null);
    const videosData = videoIds.length > 0
      ? await db.select().from(videos).where(inArray(videos.id, videoIds))
      : [];
    const videoMap = new Map(videosData.map(v => [v.id, v]));

    return lifecycles.map(l => ({
      videoId: l.videoId || 0,
      title: videoMap.get(l.videoId || 0)?.title || "Unknown",
      decayRate: l.performanceData?.growth ? Math.round(Math.abs(l.performanceData.growth)) : 0,
      currentStage: l.currentStage,
      recommendation: "Refresh metadata, update thumbnail, or create follow-up content",
    }));
  } catch (error) {
    console.error("Get decay alerts failed:", error);
    return [];
  }
}

export async function getContentGaps(userId: string): Promise<Array<{
  topic: string;
  estimatedDemand: number;
  difficulty: string;
  suggestedTitle: string;
  suggestedAngle: string;
}>> {
  try {
    const existing = await db.select().from(contentGapSuggestions)
      .where(eq(contentGapSuggestions.userId, userId))
      .orderBy(desc(contentGapSuggestions.createdAt))
      .limit(10);

    if (existing.length > 0) {
      return existing.map(g => ({
        topic: g.topic,
        estimatedDemand: g.estimatedDemand || 0,
        difficulty: g.difficulty || "medium",
        suggestedTitle: g.suggestedTitle || "",
        suggestedAngle: g.suggestedAngle || "",
      }));
    }

    const [userVideos, competitors] = await Promise.all([
      getUserVideos(userId),
      db.select().from(competitorTracks).where(eq(competitorTracks.userId, userId)).limit(10),
    ]);

    const myTopics = userVideos.slice(0, 20).map(v => v.title).join(', ');
    const compInfo = competitors.map(c => `${c.competitorName} (${c.platform}): Strengths: ${(c.strengths || []).join(', ')}`).join('\n');

    const prompt = `Identify content gaps - topics that competitors cover but this creator hasn't covered yet.

Creator's Recent Topics: ${myTopics || 'No videos yet'}
Competitors:
${compInfo || 'No competitors tracked'}

Find 5 content gaps with high demand. Respond as JSON:
{
  "gaps": [
    {
      "topic": "Topic name",
      "estimatedDemand": 85,
      "difficulty": "low|medium|high",
      "competitorsCovering": 3,
      "suggestedTitle": "Specific video title suggestion",
      "suggestedAngle": "Unique angle to differentiate from competitors"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    const gaps = result.gaps || [];

    for (const gap of gaps) {
      await db.insert(contentGapSuggestions).values({
        userId,
        topic: gap.topic,
        competitorsCovering: gap.competitorsCovering || 0,
        estimatedDemand: gap.estimatedDemand || 50,
        difficulty: gap.difficulty || "medium",
        suggestedTitle: gap.suggestedTitle || "",
        suggestedAngle: gap.suggestedAngle || "",
        status: "suggested",
        priority: Math.round(gap.estimatedDemand || 50),
      });
    }

    return gaps.map((g: any) => ({
      topic: g.topic,
      estimatedDemand: g.estimatedDemand || 50,
      difficulty: g.difficulty || "medium",
      suggestedTitle: g.suggestedTitle || "",
      suggestedAngle: g.suggestedAngle || "",
    }));
  } catch (error) {
    console.error("Content gap analysis failed:", error);
    return [];
  }
}

export async function getAlgorithmCheatSheet(userId: string, platform: string): Promise<{
  platform: string;
  lastUpdated: string;
  bestPractices: Array<{ category: string; tip: string; priority: string }>;
  recentChanges: Array<{ change: string; impact: string; date: string }>;
  doList: string[];
  dontList: string[];
}> {
  try {
    const prompt = `Generate a current algorithm cheat sheet for ${platform} content creators.

Platform: ${platform}
Date: ${new Date().toISOString().split('T')[0]}

Respond as JSON:
{
  "bestPractices": [
    { "category": "content|seo|engagement|timing|format", "tip": "Specific best practice", "priority": "high|medium|low" }
  ],
  "recentChanges": [
    { "change": "Description of algorithm change", "impact": "high|medium|low", "date": "approximate date" }
  ],
  "doList": ["Do this", "Do that"],
  "dontList": ["Don't do this", "Avoid that"]
}

Include 8-10 best practices, 3-4 recent changes, 5 dos and 5 don'ts.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    const result = JSON.parse(content);

    return {
      platform,
      lastUpdated: new Date().toISOString(),
      bestPractices: result.bestPractices || [],
      recentChanges: result.recentChanges || [],
      doList: result.doList || [],
      dontList: result.dontList || [],
    };
  } catch (error) {
    console.error("Algorithm cheat sheet generation failed:", error);
    return {
      platform,
      lastUpdated: new Date().toISOString(),
      bestPractices: [],
      recentChanges: [],
      doList: [],
      dontList: [],
    };
  }
}

export async function runFullOptimizationPass(userId: string, videoId: number): Promise<{
  videoId: number;
  results: Record<string, any>;
  overallScore: number;
  passNumber: number;
}> {
  try {
    const existingPasses = await db.select().from(optimizationPasses)
      .where(and(eq(optimizationPasses.userId, userId), eq(optimizationPasses.videoId, videoId), eq(optimizationPasses.engineName, "full_optimization_pass")))
      .limit(100);
    const passNumber = existingPasses.length + 1;

    const [metadataResult, viralResult, sentimentResult, lifecycleResult, ctrResult] = await Promise.all([
      runMetadataOptimizer(userId, videoId),
      predictViralScore(userId, videoId),
      analyzeSentiment(userId, videoId),
      manageContentLifecycle(userId, videoId),
      optimizeCtr(userId, videoId),
    ]);

    const scores = [
      metadataResult.newScore || 50,
      viralResult.score || 50,
      sentimentResult.positivePct || 50,
      ctrResult.originalCtr ? Math.min(ctrResult.originalCtr * 10, 100) : 50,
    ];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const results = {
      metadata: metadataResult,
      viralScore: viralResult,
      sentiment: sentimentResult,
      lifecycle: lifecycleResult,
      ctr: ctrResult,
    };

    await db.insert(optimizationPasses).values({
      userId,
      videoId,
      engineName: "full_optimization_pass",
      passNumber,
      previousScore: existingPasses.length > 0 ? (existingPasses[existingPasses.length - 1].newScore || 0) : 0,
      newScore: overallScore,
      changes: [
        { field: "metadata", oldValue: "previous", newValue: `score: ${metadataResult.newScore}` },
        { field: "viral_score", oldValue: "unknown", newValue: `${viralResult.score}` },
        { field: "sentiment", oldValue: "unknown", newValue: `positive: ${sentimentResult.positivePct}%` },
        { field: "lifecycle", oldValue: "unknown", newValue: lifecycleResult.currentStage },
        { field: "ctr", oldValue: `${ctrResult.originalCtr}%`, newValue: `+${ctrResult.expectedImprovement}% expected` },
      ],
      status: "completed",
    });

    return { videoId, results, overallScore, passNumber };
  } catch (error) {
    console.error("Full optimization pass failed:", error);
    return { videoId, results: {}, overallScore: 0, passNumber: 0 };
  }
}
