import { db } from "../db";
import { videos, channels, keywordInsights, aiResults } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function analyzeChannelKeywords(userId: string) {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

  if (userChannels.length === 0) return { analyzed: 0, keywords: [] };

  const channelIds = userChannels.map(c => c.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentVideos = await db.select().from(videos)
    .where(and(
      sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`,
      gte(videos.createdAt, thirtyDaysAgo),
    ))
    .orderBy(desc(videos.createdAt))
    .limit(50);

  if (recentVideos.length === 0) return { analyzed: 0, keywords: [] };

  const videoData = recentVideos.map(v => ({
    id: v.id,
    title: v.title,
    tags: (v.metadata as any)?.tags || [],
    views: (v.metadata as any)?.viewCount || (v.metadata as any)?.stats?.views || 0,
    ctr: (v.metadata as any)?.stats?.ctr || 0,
    watchTime: (v.metadata as any)?.stats?.avgWatchTime || 0,
    likes: (v.metadata as any)?.likeCount || (v.metadata as any)?.stats?.likes || 0,
    description: v.description?.slice(0, 200) || "",
  }));

  const prompt = `You are a YouTube SEO analyst. Analyze these videos and their performance to identify which keywords and topics are driving the best results.

VIDEOS DATA:
${JSON.stringify(videoData, null, 2)}

Analyze patterns in titles, tags, and descriptions. Identify:
1. Which keywords appear in the highest-performing videos
2. Which keyword combinations work well together
3. Which topics/themes get the most engagement
4. Long-tail keywords that are working
5. Keywords that should be used more based on performance patterns

Respond with JSON:
{
  "winningKeywords": [
    {
      "keyword": "the keyword or phrase",
      "score": 0-100,
      "reason": "why this keyword works well",
      "videoIds": [ids where this keyword appears],
      "avgViews": 0,
      "category": "topic/brand/game/modifier/long-tail/trending",
      "relatedKeywords": ["related terms to use alongside"],
      "trend": "rising/stable/declining"
    }
  ],
  "keywordCombinations": [
    {
      "keywords": ["keyword1", "keyword2"],
      "synergy": "why these work together",
      "exampleTitle": "example title using both"
    }
  ],
  "underusedOpportunities": [
    {
      "keyword": "keyword that should be used more",
      "reason": "why it has potential",
      "suggestedUsage": "how to use it"
    }
  ],
  "avoidKeywords": [
    {
      "keyword": "keyword to avoid or reduce",
      "reason": "why it's underperforming"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { analyzed: 0, keywords: [] };

  const analysis = JSON.parse(content);

  for (const kw of (analysis.winningKeywords || [])) {
    const existing = await db.select().from(keywordInsights)
      .where(and(
        eq(keywordInsights.userId, userId),
        sql`LOWER(${keywordInsights.keyword}) = LOWER(${kw.keyword})`,
      ))
      .limit(1);

    const data = {
      userId,
      keyword: kw.keyword,
      source: "youtube",
      score: Math.min(100, Math.max(0, kw.score || 50)),
      totalViews: kw.avgViews || 0,
      totalVideos: (kw.videoIds || []).length,
      avgCtr: null as number | null,
      avgWatchTime: null as number | null,
      trend: kw.trend || "stable",
      category: kw.category || "general",
      metadata: {
        topVideoIds: kw.videoIds || [],
        relatedKeywords: kw.relatedKeywords || [],
        lastPerformanceCheck: new Date().toISOString(),
      },
    };

    if (existing.length > 0) {
      await db.update(keywordInsights).set({
        ...data,
        lastAnalyzedAt: new Date(),
      }).where(eq(keywordInsights.id, existing[0].id));
    } else {
      await db.insert(keywordInsights).values(data);
    }
  }

  for (const opp of (analysis.underusedOpportunities || [])) {
    const existing = await db.select().from(keywordInsights)
      .where(and(
        eq(keywordInsights.userId, userId),
        sql`LOWER(${keywordInsights.keyword}) = LOWER(${opp.keyword})`,
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(keywordInsights).values({
        userId,
        keyword: opp.keyword,
        source: "youtube",
        score: 40,
        totalViews: 0,
        totalVideos: 0,
        trend: "rising",
        category: "opportunity",
        metadata: {
          relatedKeywords: [],
          lastPerformanceCheck: new Date().toISOString(),
        },
      });
    }
  }

  await db.insert(aiResults).values({
    userId,
    featureKey: `keyword-analysis-${Date.now()}`,
    result: {
      ...analysis,
      analyzedVideos: recentVideos.length,
      analyzedAt: new Date().toISOString(),
      source: "keyword-learning-engine",
    },
  });

  console.log(`[KeywordEngine] Analyzed ${recentVideos.length} videos for ${userId}, found ${(analysis.winningKeywords || []).length} winning keywords`);

  return {
    analyzed: recentVideos.length,
    keywords: analysis.winningKeywords || [],
    combinations: analysis.keywordCombinations || [],
    opportunities: analysis.underusedOpportunities || [],
    avoid: analysis.avoidKeywords || [],
  };
}

export async function getTopKeywordsForUser(userId: string, limit = 20): Promise<{ keyword: string; score: number; category: string; trend: string; relatedKeywords: string[] }[]> {
  const keywords = await db.select().from(keywordInsights)
    .where(and(
      eq(keywordInsights.userId, userId),
      gte(keywordInsights.score, 30),
    ))
    .orderBy(desc(keywordInsights.score))
    .limit(limit);

  return keywords.map(k => ({
    keyword: k.keyword,
    score: k.score,
    category: k.category || "general",
    trend: k.trend || "stable",
    relatedKeywords: (k.metadata as any)?.relatedKeywords || [],
  }));
}

export async function getKeywordContext(userId: string): Promise<string> {
  const topKeywords = await getTopKeywordsForUser(userId, 15);
  if (topKeywords.length === 0) return "";

  const byCategory: Record<string, string[]> = {};
  for (const kw of topKeywords) {
    const cat = kw.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(kw.keyword);
  }

  let context = `\n\nCHANNEL KEYWORD BANK (proven to drive traffic on this channel):`;
  context += `\nIMPORTANT: Only use keywords that are genuinely relevant to this specific video's topic. Do NOT force unrelated keywords just because they performed well on other videos. Irrelevant keywords hurt watch time and CTR.`;
  for (const [cat, keywords] of Object.entries(byCategory)) {
    context += `\n- ${cat}: ${keywords.join(", ")}`;
  }
  context += `\n- Pick ONLY keywords from this bank that naturally relate to the video subject. Skip any that don't fit — relevance beats volume every time.`;

  return context;
}

export async function refreshKeywordScores(userId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleKeywords = await db.select().from(keywordInsights)
    .where(and(
      eq(keywordInsights.userId, userId),
      sql`${keywordInsights.lastAnalyzedAt} < ${sevenDaysAgo}`,
    ));

  if (staleKeywords.length > 0) {
    for (const kw of staleKeywords) {
      const newScore = Math.max(0, kw.score - 5);
      await db.update(keywordInsights).set({
        score: newScore,
        trend: newScore < 20 ? "declining" : kw.trend,
        lastAnalyzedAt: new Date(),
      }).where(eq(keywordInsights.id, kw.id));
    }
    console.log(`[KeywordEngine] Decayed ${staleKeywords.length} stale keyword scores for ${userId}`);
  }
}

export async function runKeywordLearningCycle() {
  const allUsers = await db.selectDistinct({ userId: channels.userId }).from(channels)
    .where(eq(channels.platform, "youtube"));

  let totalProcessed = 0;
  for (const { userId } of allUsers) {
    if (!userId) continue;
    try {
      await refreshKeywordScores(userId);
      await analyzeChannelKeywords(userId);
      totalProcessed++;
    } catch (err: any) {
      console.error(`[KeywordEngine] Failed for user ${userId}:`, err.message);
    }
  }

  console.log(`[KeywordEngine] Completed learning cycle for ${totalProcessed} users`);
  return totalProcessed;
}
