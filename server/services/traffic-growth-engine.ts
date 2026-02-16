import { db } from "../db";
import { trafficStrategies, videos, channels, keywordInsights, aiResults } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const LEGIT_STRATEGY_TYPES = [
  "seo-optimization",
  "community-engagement",
  "cross-platform-distribution",
  "collaboration-outreach",
  "content-series-building",
  "audience-retention",
  "search-trend-riding",
  "playlist-optimization",
  "shorts-funnel",
  "end-screen-optimization",
  "comment-engagement",
  "social-proof-building",
] as const;

export async function generateTrafficStrategies(userId: string) {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

  const channelIds = userChannels.map(c => c.id);
  const recentVideos = channelIds.length > 0
    ? await db.select().from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(videos.createdAt))
        .limit(20)
    : [];

  const topKeywords = await db.select().from(keywordInsights)
    .where(and(eq(keywordInsights.userId, userId), gte(keywordInsights.score, 40)))
    .orderBy(desc(keywordInsights.score))
    .limit(15);

  const videoSummary = recentVideos.map(v => ({
    title: v.title,
    views: (v.metadata as any)?.viewCount || 0,
    likes: (v.metadata as any)?.likeCount || 0,
    tags: ((v.metadata as any)?.tags || []).slice(0, 5),
    type: v.type,
  }));

  const keywordSummary = topKeywords.map(k => ({
    keyword: k.keyword,
    score: k.score,
    trend: k.trend,
  }));

  const channelInfo = userChannels[0] ? {
    name: userChannels[0].channelName,
    subscribers: userChannels[0].subscriberCount || 0,
    totalViews: userChannels[0].viewCount || 0,
    videoCount: userChannels[0].videoCount || 0,
  } : { name: "New Channel", subscribers: 0, totalViews: 0, videoCount: 0 };

  const prompt = `You are a YouTube growth strategist. Create actionable, 100% legitimate traffic strategies for this channel. Every strategy must comply with YouTube's Terms of Service and Community Guidelines. ZERO bots, sub4sub, view exchanges, clickfarms, or any artificial inflation.

CHANNEL DATA:
${JSON.stringify(channelInfo)}

RECENT VIDEOS (${videoSummary.length}):
${JSON.stringify(videoSummary)}

TOP PERFORMING KEYWORDS:
${JSON.stringify(keywordSummary)}

Generate 8-12 specific, actionable strategies across these categories:
1. ORGANIC SEO (title/tag/description optimization using proven keywords)
2. COMMUNITY BUILDING (genuine engagement, polls, community posts, replies)
3. CROSS-PLATFORM (repurposing content to TikTok, X, Discord, Shorts)
4. COLLABORATION (finding creators in similar niches for genuine collabs)
5. CONTENT SERIES (building binge-worthy series that boost session time)
6. AUDIENCE RETENTION (improving watch time which YouTube rewards with more impressions)
7. SEARCH TREND SURFING (creating content around rising search trends in the niche)
8. SHORTS FUNNEL (using Shorts to funnel viewers to long-form content)
9. PLAYLIST OPTIMIZATION (organizing content to increase session duration)
10. END SCREEN & CARDS (optimizing end screens to keep viewers on channel)
11. COMMENT ENGAGEMENT (replying to comments to boost engagement signals)
12. SOCIAL PROOF (leveraging milestones, testimonials, achievements)

CRITICAL: Every strategy must be:
- 100% organic and legitimate
- Compliant with YouTube, Twitch, TikTok, X, Discord, and Kick Terms of Service
- Focused on genuine audience growth, not artificial metrics
- Sustainable long-term, not quick hacks that get channels penalized
- NEVER suggest: buying views/subs, sub4sub, view bots, click farms, spam commenting, misleading thumbnails/titles (clickbait that doesn't deliver), engagement pods that artificially inflate metrics, or any service that violates platform guidelines

Respond with JSON:
{
  "strategies": [
    {
      "type": "one of: seo-optimization, community-engagement, cross-platform-distribution, collaboration-outreach, content-series-building, audience-retention, search-trend-riding, playlist-optimization, shorts-funnel, end-screen-optimization, comment-engagement, social-proof-building",
      "title": "Specific strategy name",
      "description": "Detailed description of what to do",
      "priority": 1-10,
      "estimatedImpact": "Expected growth impact",
      "actions": [
        {
          "action": "Specific step to take",
          "timing": "When to do this"
        }
      ],
      "keywords": ["relevant keywords to use"],
      "platform": "primary platform for this strategy",
      "complianceNote": "Why this is 100% ToS compliant"
    }
  ],
  "weeklyPlan": {
    "monday": "focus area",
    "tuesday": "focus area",
    "wednesday": "focus area",
    "thursday": "focus area",
    "friday": "focus area",
    "saturday": "focus area",
    "sunday": "focus area"
  },
  "topPriority": "The single most impactful thing to do right now"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { strategies: [] };

  const plan = JSON.parse(content);

  const BANNED_TACTICS = [
    "bot", "bots", "sub4sub", "sub 4 sub", "view exchange", "view swap",
    "clickfarm", "click farm", "follow4follow", "follow for follow",
    "engagement pod", "engagement group", "buy views", "buy subscribers",
    "buy followers", "buy likes", "fake accounts", "fake engagement",
    "view bot", "auto-click", "traffic exchange", "paid views",
    "subscriber exchange", "like exchange", "comment exchange",
    "artificial inflation", "purchased followers", "purchased views",
    "spam comment", "mass follow", "mass unfollow",
  ];

  plan.strategies = (plan.strategies || []).filter((strategy: any) => {
    const text = `${strategy.title} ${strategy.description} ${JSON.stringify(strategy.actions || [])}`.toLowerCase();
    const hasBanned = BANNED_TACTICS.some(t => text.includes(t));
    if (hasBanned) {
      console.log(`[TrafficEngine] Blocked banned strategy: "${strategy.title}"`);
    }
    return !hasBanned;
  });

  for (const strategy of plan.strategies) {
    const existing = await db.select().from(trafficStrategies)
      .where(and(
        eq(trafficStrategies.userId, userId),
        eq(trafficStrategies.strategyType, strategy.type),
        eq(trafficStrategies.title, strategy.title),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(trafficStrategies).set({
        description: strategy.description,
        priority: strategy.priority || 5,
        results: {
          estimatedImpact: strategy.estimatedImpact,
          actions: (strategy.actions || []).map((a: any) => ({
            action: a.action,
            status: "pending",
          })),
        },
        metadata: {
          platform: strategy.platform || "youtube",
          keywords: strategy.keywords || [],
        },
        lastRunAt: new Date(),
      }).where(eq(trafficStrategies.id, existing[0].id));
    } else {
      await db.insert(trafficStrategies).values({
        userId,
        strategyType: strategy.type || "seo-optimization",
        title: strategy.title,
        description: strategy.description,
        status: "active" as const,
        priority: strategy.priority || 5,
        results: {
          estimatedImpact: strategy.estimatedImpact,
          actions: (strategy.actions || []).map((a: any) => ({
            action: a.action,
            status: "pending",
          })),
        },
        metadata: {
          platform: strategy.platform || "youtube",
          keywords: strategy.keywords || [],
        },
        lastRunAt: new Date(),
      });
    }
  }

  await db.insert(aiResults).values({
    userId,
    featureKey: `traffic-strategy-${Date.now()}`,
    result: {
      ...plan,
      generatedAt: new Date().toISOString(),
      source: "traffic-growth-engine",
    },
  });

  console.log(`[TrafficEngine] Generated ${(plan.strategies || []).length} strategies for ${userId}`);
  return plan;
}

export async function autoApplyKeywordsToNewVideo(
  userId: string,
  videoTitle: string,
  currentTags: string[],
  currentDescription: string,
): Promise<{ optimizedTags: string[]; optimizedDescription: string; keywordsApplied: string[] }> {
  const topKeywords = await db.select().from(keywordInsights)
    .where(and(eq(keywordInsights.userId, userId), gte(keywordInsights.score, 40)))
    .orderBy(desc(keywordInsights.score))
    .limit(20);

  if (topKeywords.length === 0) {
    return { optimizedTags: currentTags, optimizedDescription: currentDescription, keywordsApplied: [] };
  }

  const provenKeywords = topKeywords.map(k => ({
    keyword: k.keyword,
    score: k.score,
    category: k.category || "general",
  }));

  const relevancePrompt = `You are a YouTube SEO expert. A new video is being created. Your job is to determine which proven keywords from the creator's keyword bank are RELEVANT to this specific video's topic.

VIDEO BEING CREATED:
Title: "${videoTitle}"
Description: "${currentDescription.slice(0, 500)}"
Current Tags: ${currentTags.join(", ")}

KEYWORD BANK (proven to drive traffic on this channel):
${provenKeywords.map(k => `- "${k.keyword}" (score: ${k.score}, category: ${k.category})`).join("\n")}

Rules:
- ONLY select keywords that are genuinely related to this video's subject matter
- A gaming keyword should NOT be added to a cooking video, even if it scores 100
- Broad channel-identity keywords (like the creator's name or channel brand) are always relevant
- Topic-specific keywords are only relevant if the video covers that topic
- When in doubt, leave it out — irrelevant keywords hurt CTR and watch time

Respond with JSON:
{
  "relevantKeywords": ["keyword1", "keyword2"],
  "reason": "brief explanation of why these fit this video"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: relevancePrompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { optimizedTags: currentTags, optimizedDescription: currentDescription, keywordsApplied: [] };
    }

    const result = JSON.parse(content);
    const relevant: string[] = result.relevantKeywords || [];

    if (relevant.length === 0) {
      console.log(`[KeywordEngine] No relevant keywords found for video: "${videoTitle}"`);
      return { optimizedTags: currentTags, optimizedDescription: currentDescription, keywordsApplied: [] };
    }

    const optimizedTags = [...currentTags];
    const applied: string[] = [];
    for (const kw of relevant) {
      if (!optimizedTags.some(t => t.toLowerCase() === kw.toLowerCase())) {
        optimizedTags.push(kw);
        applied.push(kw);
      }
    }

    console.log(`[KeywordEngine] Applied ${applied.length} relevant keywords to "${videoTitle}": ${applied.join(", ")}`);

    return {
      optimizedTags: optimizedTags.slice(0, 30),
      optimizedDescription: currentDescription,
      keywordsApplied: applied,
    };
  } catch (err: any) {
    console.error(`[KeywordEngine] Relevance check failed:`, err.message);
    return { optimizedTags: currentTags, optimizedDescription: currentDescription, keywordsApplied: [] };
  }
}

export async function runTrafficGrowthCycle() {
  const allUsers = await db.selectDistinct({ userId: channels.userId }).from(channels)
    .where(eq(channels.platform, "youtube"));

  let totalProcessed = 0;
  for (const { userId } of allUsers) {
    if (!userId) continue;
    try {
      await generateTrafficStrategies(userId);
      totalProcessed++;
    } catch (err: any) {
      console.error(`[TrafficEngine] Failed for user ${userId}:`, err.message);
    }
  }

  console.log(`[TrafficEngine] Completed growth cycle for ${totalProcessed} users`);
  return totalProcessed;
}
