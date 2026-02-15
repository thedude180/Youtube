import OpenAI from "openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { audiencePsychographics, videos, channels, commentSentiments } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function analyzeAudience(userId: string, platform?: string) {
  const userChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId));

  const channelIds = userChannels.map((c) => c.id);

  let allVideos: any[] = [];
  for (const cid of channelIds) {
    const vids = await db
      .select()
      .from(videos)
      .where(eq(videos.channelId, cid))
      .orderBy(desc(videos.createdAt))
      .limit(40);
    allVideos.push(...vids);
  }

  const sentimentData = await db
    .select()
    .from(commentSentiments)
    .where(eq(commentSentiments.userId, userId))
    .orderBy(desc(commentSentiments.analyzedAt))
    .limit(20);

  const contentProfile = allVideos.slice(0, 50).map((v) => ({
    title: v.title,
    type: v.type,
    platform: v.platform,
    views: v.metadata?.viewCount || 0,
    likes: v.metadata?.likeCount || 0,
    comments: v.metadata?.commentCount || 0,
    tags: v.metadata?.tags || [],
    category: v.metadata?.contentCategory || "",
  }));

  const sentimentSummary = sentimentData.map((s) => ({
    positivePct: s.positivePct,
    negativePct: s.negativePct,
    themes: s.topThemes,
  }));

  const channelInfo = userChannels.map((c) => ({
    platform: c.platform,
    subscribers: c.subscriberCount,
    totalViews: c.viewCount,
  }));

  const prompt = `You are an audience psychographics expert. Analyze this creator's content and audience data to build detailed audience segments.

CREATOR CHANNELS:
${JSON.stringify(channelInfo)}

CONTENT PROFILE (${contentProfile.length} pieces):
${JSON.stringify(contentProfile, null, 2)}

AUDIENCE SENTIMENT DATA:
${JSON.stringify(sentimentSummary)}

${platform ? `Focus on platform: ${platform}` : "Analyze across all platforms"}

Create 4-6 distinct psychographic audience segments. For each segment provide:
- Segment name (descriptive, like "Competitive Players", "Casual Learners", "Night Owl Binge-Watchers")
- Estimated size as percentage of total audience (0-1)
- Core motivations (why they watch)
- Values (what matters to them)
- Pain points (frustrations, unmet needs)
- Content preferences (what formats/topics they prefer)
- Watch patterns (when, how long, device preferences)
- Engagement drivers (what makes them comment, like, share)
- Churn risk (0-1, likelihood of leaving)
- Lifetime value estimate (relative 0-1 scale)

Respond as JSON:
{
  "segments": [
    {
      "segmentName": "string",
      "platform": "string or null",
      "segmentSize": number,
      "motivations": ["string"],
      "values": ["string"],
      "painPoints": ["string"],
      "contentPrefs": {
        "preferredFormats": ["string"],
        "preferredTopics": ["string"],
        "idealLength": "string",
        "preferredTone": "string"
      },
      "watchPatterns": {
        "peakHours": ["string"],
        "avgSessionLength": "string",
        "bingeFrequency": "string",
        "devicePreference": "string"
      },
      "engagementDrivers": ["string"],
      "churnRisk": number,
      "lifetimeValue": number
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
  if (!content) throw new Error("No response from AI for audience analysis");

  const result = JSON.parse(content);
  const inserted = [];

  for (const seg of result.segments) {
    const [row] = await db
      .insert(audiencePsychographics)
      .values({
        userId,
        platform: seg.platform || platform || null,
        segmentName: seg.segmentName,
        segmentSize: seg.segmentSize,
        motivations: seg.motivations || [],
        values: seg.values || [],
        painPoints: seg.painPoints || [],
        contentPrefs: seg.contentPrefs || {},
        watchPatterns: seg.watchPatterns || {},
        engagementDrivers: seg.engagementDrivers || [],
        churnRisk: seg.churnRisk,
        lifetime_value: seg.lifetimeValue,
      })
      .returning();

    inserted.push(row);
  }

  sendSSEEvent(userId, "audience_analyzed", {
    segmentCount: inserted.length,
    segments: inserted.map((s) => s.segmentName),
  });

  return inserted;
}

export async function getAudienceSegments(userId: string) {
  return db
    .select()
    .from(audiencePsychographics)
    .where(eq(audiencePsychographics.userId, userId))
    .orderBy(desc(audiencePsychographics.segmentSize));
}

export async function predictSegmentEngagement(
  userId: string,
  contentIdea: string
) {
  const segments = await getAudienceSegments(userId);

  if (segments.length === 0) {
    return {
      predictions: [],
      summary: "No audience segments found. Run audience analysis first.",
    };
  }

  const segmentSummary = segments.map((s) => ({
    name: s.segmentName,
    size: s.segmentSize,
    motivations: s.motivations,
    contentPrefs: s.contentPrefs,
    engagementDrivers: s.engagementDrivers,
    churnRisk: s.churnRisk,
  }));

  const prompt = `You are an audience engagement predictor. Given a content idea and audience segments, predict how each segment will respond.

CONTENT IDEA:
"${contentIdea}"

AUDIENCE SEGMENTS:
${JSON.stringify(segmentSummary, null, 2)}

For each segment predict:
- Engagement likelihood (0-1)
- Expected reaction (excited, neutral, disappointed, etc.)
- Will they share it? (0-1 probability)
- Will they comment? (0-1 probability)
- Watch completion rate estimate (0-1)
- Specific feedback they might give
- How to optimize the content for this segment

Respond as JSON:
{
  "predictions": [
    {
      "segmentName": "string",
      "engagementLikelihood": number,
      "reaction": "string",
      "shareProb": number,
      "commentProb": number,
      "watchCompletion": number,
      "likelyFeedback": "string",
      "optimizationTip": "string"
    }
  ],
  "overallScore": number,
  "bestSegments": ["string"],
  "riskSegments": ["string"],
  "summary": "string"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content)
    throw new Error("No response from AI for engagement prediction");

  return JSON.parse(content);
}

export async function getChurnRisks(userId: string) {
  const segments = await getAudienceSegments(userId);

  const highRisk = segments.filter((s) => (s.churnRisk || 0) > 0.5);

  if (highRisk.length === 0) {
    return {
      atRiskSegments: [],
      recommendations: [],
      overallChurnHealth: "healthy",
    };
  }

  const riskSummary = highRisk.map((s) => ({
    name: s.segmentName,
    size: s.segmentSize,
    churnRisk: s.churnRisk,
    motivations: s.motivations,
    painPoints: s.painPoints,
    contentPrefs: s.contentPrefs,
  }));

  const prompt = `You are an audience retention expert. These audience segments have high churn risk. Provide specific, actionable recommendations to retain them.

HIGH CHURN-RISK SEGMENTS:
${JSON.stringify(riskSummary, null, 2)}

For each at-risk segment provide:
- Root cause of churn risk
- Immediate actions (this week)
- Long-term strategy
- Content ideas specifically for retention
- Engagement tactics

Respond as JSON:
{
  "atRiskSegments": [
    {
      "segmentName": "string",
      "churnRisk": number,
      "audienceSize": number,
      "rootCause": "string",
      "immediateActions": ["string"],
      "longTermStrategy": "string",
      "retentionContentIdeas": ["string"],
      "engagementTactics": ["string"]
    }
  ],
  "overallChurnHealth": "healthy" | "warning" | "critical",
  "topPriorityAction": "string"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for churn analysis");

  const result = JSON.parse(content);

  sendSSEEvent(userId, "churn_risks_analyzed", {
    atRiskCount: result.atRiskSegments?.length || 0,
    overallHealth: result.overallChurnHealth,
  });

  return result;
}
