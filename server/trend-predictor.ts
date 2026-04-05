import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { predictiveTrends, videos, channels } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

export async function scanForTrends(userId: string, platform?: string) {
  const userChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId));

  const recentVideos = await db
    .select()
    .from(videos)
    .orderBy(desc(videos.createdAt))
    .limit(100);

  const contentSummary = recentVideos.map((v) => ({
    title: v.title,
    platform: v.platform,
    tags: v.metadata?.tags || [],
    views: v.metadata?.viewCount || 0,
    publishedAt: v.publishedAt?.toISOString() || v.createdAt?.toISOString(),
  }));

  const channelContext = userChannels.map((c) => ({
    platform: c.platform,
    subscribers: c.subscriberCount,
    views: c.viewCount,
  }));

  const prompt = `You are an expert trend analyst for content creators. Analyze the creator's content landscape and predict 5-8 upcoming trends they should capitalize on.

CREATOR CONTEXT:
Channels: ${JSON.stringify(channelContext)}
Recent content: ${JSON.stringify(contentSummary.slice(0, 30))}
${platform ? `Focus platform: ${platform}` : "Analyze across all platforms"}

For each trend, provide realistic data including:
- Topic name and category
- Current volume estimate (search/social mentions per day)
- Predicted peak volume
- Days until predicted peak
- Confidence score (0-1)
- Velocity (rate of growth, -1 to 1 scale)
- Signals that indicate this trend is rising
- Status: "rising", "peaking", "emerging", or "declining"

Respond as JSON:
{
  "trends": [
    {
      "topic": "string",
      "category": "string",
      "platform": "string or null",
      "currentVolume": number,
      "predictedPeakVolume": number,
      "daysUntilPeak": number,
      "confidence": number,
      "velocity": number,
      "status": "rising" | "peaking" | "emerging" | "declining",
      "signals": [
        { "source": "string", "indicator": "string", "strength": number }
      ]
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for trend scan");

  const result = JSON.parse(content);
  const inserted = [];

  for (const trend of result.trends) {
    const peakDate = new Date();
    peakDate.setDate(peakDate.getDate() + (trend.daysUntilPeak || 14));

    const [row] = await db
      .insert(predictiveTrends)
      .values({
        userId,
        platform: trend.platform || platform || null,
        topic: trend.topic,
        category: trend.category,
        currentVolume: trend.currentVolume,
        predictedPeakVolume: trend.predictedPeakVolume,
        predictedPeakAt: peakDate,
        confidence: trend.confidence,
        velocity: trend.velocity,
        status: trend.status || "rising",
        signals: trend.signals || [],
        actionTaken: false,
      })
      .returning();

    inserted.push(row);
  }

  sendSSEEvent(userId, "trends_scanned", {
    count: inserted.length,
    topTrend: inserted[0]?.topic,
  });

  return inserted;
}

export async function getPredictedTrends(userId: string, status?: string) {
  if (status) {
    return db
      .select()
      .from(predictiveTrends)
      .where(
        and(
          eq(predictiveTrends.userId, userId),
          eq(predictiveTrends.status, status)
        )
      )
      .orderBy(desc(predictiveTrends.confidence));
  }

  return db
    .select()
    .from(predictiveTrends)
    .where(eq(predictiveTrends.userId, userId))
    .orderBy(desc(predictiveTrends.confidence));
}

export async function markTrendActioned(trendId: number) {
  const [updated] = await db
    .update(predictiveTrends)
    .set({ actionTaken: true })
    .where(eq(predictiveTrends.id, trendId))
    .returning();

  return updated;
}

export async function generateTrendContent(userId: string, trendId: number) {
  const [trend] = await db
    .select()
    .from(predictiveTrends)
    .where(eq(predictiveTrends.id, trendId));

  if (!trend) throw new Error("Trend not found");

  const prompt = `You are a content strategist. Generate 3-5 content ideas for a creator to capitalize on this predicted trend.

TREND:
- Topic: ${trend.topic}
- Category: ${trend.category || "general"}
- Platform: ${trend.platform || "multi-platform"}
- Current Volume: ${trend.currentVolume} mentions/day
- Predicted Peak: ${trend.predictedPeakVolume} mentions/day
- Days Until Peak: ${trend.predictedPeakAt ? Math.ceil((new Date(trend.predictedPeakAt).getTime() - Date.now()) / 86400000) : "unknown"}
- Confidence: ${(trend.confidence || 0) * 100}%
- Velocity: ${trend.velocity}
- Signals: ${JSON.stringify(trend.signals)}

For each content idea provide:
- Title (click-worthy, platform-optimized)
- Format (short, long-form, live, story, etc.)
- Hook (first 5 seconds / opening line)
- Why it will work with this trend
- Urgency level (post now, this week, this month)
- Estimated performance multiplier vs normal content

Respond as JSON:
{
  "ideas": [
    {
      "title": "string",
      "format": "string",
      "hook": "string",
      "trendAlignment": "string",
      "urgency": "post_now" | "this_week" | "this_month",
      "performanceMultiplier": number,
      "tags": ["string"],
      "script_outline": "string"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for trend content");

  const result = JSON.parse(content);

  sendSSEEvent(userId, "trend_content_generated", {
    trendId,
    topic: trend.topic,
    ideaCount: result.ideas?.length || 0,
  });

  return {
    trend,
    ideas: result.ideas,
  };
}
