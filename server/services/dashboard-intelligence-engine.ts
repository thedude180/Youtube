import { getOpenAIClientBackground } from "../lib/openai";
import { getAISemaphoreStats } from "../lib/ai-semaphore";
import { sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { aiInsights, videos, channels, analyticsSnapshots } from "@shared/schema";
import { eq, desc, and, sql, gte, isNull, or } from "drizzle-orm";

/** Returns true when the OpenAI circuit-breaker is currently open (rate-limited). */
function isRateLimited(): boolean {
  return getAISemaphoreStats().rateLimitedUntil > Date.now();
}

export async function generateDashboardInsights(userId: string): Promise<{
  insights: Array<{
    type: string;
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'success' | 'critical';
    actionable: boolean;
    suggestedAction?: string;
  }>;
  opportunities: Array<{
    title: string;
    description: string;
    potentialImpact: string;
    urgency: 'low' | 'medium' | 'high';
    expiresAt?: string;
  }>;
}> {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelIds = userChannels.map(c => c.id);

  let userVideos: any[] = [];
  if (channelIds.length > 0) {
    userVideos = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt))
      .limit(50);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSnapshots = await db.select().from(analyticsSnapshots)
    .where(and(eq(analyticsSnapshots.userId, userId), gte(analyticsSnapshots.snapshotDate, thirtyDaysAgo)))
    .orderBy(desc(analyticsSnapshots.snapshotDate))
    .limit(30);

  const channelSummary = userChannels.map(c => ({
    platform: c.platform,
    name: c.channelName,
    subscribers: c.subscriberCount || 0,
    videoCount: c.videoCount || 0,
    viewCount: c.viewCount || 0,
    niche: c.contentNiche || "unknown",
  }));

  const videoSummary = userVideos.slice(0, 20).map(v => ({
    title: v.title,
    type: v.type,
    status: v.status,
    platform: v.platform,
    views: v.metadata?.viewCount || v.metadata?.stats?.views || 0,
    likes: v.metadata?.likeCount || v.metadata?.stats?.likes || 0,
    ctr: v.metadata?.stats?.ctr || 0,
    publishedAt: v.publishedAt?.toISOString() || v.createdAt?.toISOString(),
  }));

  const snapshotSummary = recentSnapshots.slice(0, 10).map(s => ({
    date: s.snapshotDate.toISOString(),
    metrics: s.metrics,
  }));

  const prompt = `You are a YouTube/content creator analytics advisor. Analyze this creator's data and generate actionable insights and opportunities.

Channels: ${JSON.stringify(sanitizeObjectForPrompt(channelSummary))}
Recent Videos (up to 20): ${JSON.stringify(sanitizeObjectForPrompt(videoSummary))}
Analytics Snapshots (last 30 days): ${JSON.stringify(sanitizeObjectForPrompt(snapshotSummary))}

Generate a JSON response with:
1. "insights" - array of observations about their content performance. Each insight has:
   - type: category like "performance", "content_gap", "engagement", "growth", "optimization"
   - title: short headline
   - description: 1-2 sentence explanation
   - severity: "info" | "warning" | "success" | "critical"
   - actionable: boolean
   - suggestedAction: optional action they can take

2. "opportunities" - array of growth opportunities. Each has:
   - title: short headline
   - description: explanation
   - potentialImpact: estimated impact description
   - urgency: "low" | "medium" | "high"
   - expiresAt: optional ISO date if time-sensitive

Look for: declining CTR, best performing content types, posting frequency gaps, subscriber growth trends, platform-specific opportunities, content optimization potential, engagement patterns.

Return 3-6 insights and 2-4 opportunities. Return ONLY valid JSON.`;

  let insights: any[] = [];
  let opportunities: any[] = [];

  if (isRateLimited()) {
    insights = [{
      type: "system",
      title: "Analysis Temporarily Unavailable",
      description: "AI analysis will resume shortly. Your data is still being collected.",
      severity: "info" as const,
      actionable: false,
    }];
  } else {
    try {
      const openai = getOpenAIClientBackground();
      const timeoutMs = 8_000;
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("Dashboard insights timeout"), { status: 429, throttled: true })), timeoutMs)
        ),
      ]);

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      insights = parsed.insights || [];
      opportunities = parsed.opportunities || [];
    } catch (e) {
      insights = [{
        type: "system",
        title: "Analysis Temporarily Unavailable",
        description: "AI analysis could not be completed at this time. Your data is still being collected.",
        severity: "info" as const,
        actionable: false,
      }];
    }
  }

  for (const insight of insights) {
    try {
      await db.insert(aiInsights).values({
        userId,
        insightType: insight.type,
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        category: "dashboard",
        actionable: insight.actionable,
        data: { suggestedAction: insight.suggestedAction },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    } catch (_) {}
  }

  return { insights, opportunities };
}

export async function detectTrends(userId: string): Promise<{
  trends: Array<{
    topic: string;
    trendScore: number;
    velocity: 'rising' | 'stable' | 'falling';
    relevance: number;
    recommendation: string;
  }>;
}> {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelIds = userChannels.map(c => c.id);

  let userVideos: any[] = [];
  if (channelIds.length > 0) {
    userVideos = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt))
      .limit(30);
  }

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const snapshots = await db.select().from(analyticsSnapshots)
    .where(and(eq(analyticsSnapshots.userId, userId), gte(analyticsSnapshots.snapshotDate, sixtyDaysAgo)))
    .orderBy(desc(analyticsSnapshots.snapshotDate))
    .limit(60);

  const videoData = userVideos.map(v => ({
    title: v.title,
    type: v.type,
    views: v.metadata?.viewCount || v.metadata?.stats?.views || 0,
    likes: v.metadata?.likeCount || v.metadata?.stats?.likes || 0,
    ctr: v.metadata?.stats?.ctr || 0,
    avgWatchTime: v.metadata?.stats?.avgWatchTime || 0,
    tags: v.metadata?.tags || [],
    publishedAt: v.publishedAt?.toISOString() || v.createdAt?.toISOString(),
    platform: v.platform,
  }));

  const metricTimeline = snapshots.map(s => ({
    date: s.snapshotDate.toISOString(),
    views: s.metrics?.totalViews || 0,
    subscribers: s.metrics?.totalSubscribers || 0,
    revenue: s.metrics?.totalRevenue || 0,
    videosPublished: s.metrics?.videosPublished || 0,
  }));

  const niches = userChannels.map(c => c.contentNiche).filter(Boolean);

  const prompt = `You are a content trend analyst. Analyze this creator's recent performance data and detect trends.

Content Niche(s): ${niches.join(", ") || "general"}
Recent Videos: ${JSON.stringify(sanitizeObjectForPrompt(videoData))}
Performance Timeline: ${JSON.stringify(sanitizeObjectForPrompt(metricTimeline))}

Identify 3-5 trends in their content and performance. For each trend:
- topic: what the trend is about
- trendScore: 0-100 indicating strength
- velocity: "rising" | "stable" | "falling"
- relevance: 0-1 how relevant to this creator
- recommendation: specific action to take

Look for: content type performance patterns, engagement velocity changes, topic popularity shifts, platform algorithm signals, seasonal patterns.

Return ONLY valid JSON with a "trends" array.`;

  if (isRateLimited()) return { trends: [] };

  try {
    const openai = getOpenAIClientBackground();
    const timeoutMs = 8_000;
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("Trends timeout"), { status: 429, throttled: true })), timeoutMs)
      ),
    ]);

    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    return { trends: parsed.trends || [] };
  } catch (e) {
    return { trends: [] };
  }
}

export async function getOpportunityAlerts(userId: string): Promise<Array<{
  id: number;
  type: string;
  title: string;
  description: string;
  severity: string;
  actionable: boolean;
  createdAt: string;
}>> {
  const now = new Date();
  const activeInsights = await db.select().from(aiInsights)
    .where(and(
      eq(aiInsights.userId, userId),
      or(isNull(aiInsights.expiresAt), gte(aiInsights.expiresAt, now))
    ))
    .orderBy(desc(aiInsights.createdAt))
    .limit(20);

  return activeInsights.map(i => ({
    id: i.id,
    type: i.insightType,
    title: i.title,
    description: i.description,
    severity: i.severity || "info",
    actionable: i.actionable ?? true,
    createdAt: i.createdAt?.toISOString() || new Date().toISOString(),
  }));
}

export async function getPerformanceSummary(userId: string): Promise<{
  totalVideos: number;
  totalViews: number;
  avgViews: number;
  bestVideo: { title: string; views: number } | null;
  contentVelocity: number;
  healthScore: number;
  trends: { metric: string; direction: 'up' | 'down' | 'stable'; change: number }[];
}> {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const channelIds = userChannels.map(c => c.id);

  let userVideos: any[] = [];
  if (channelIds.length > 0) {
    userVideos = await db.select().from(videos)
      .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(videos.createdAt));
  }

  const totalVideos = userVideos.length;

  let totalViews = 0;
  let bestVideo: { title: string; views: number } | null = null;

  for (const v of userVideos) {
    const views = v.metadata?.viewCount || v.metadata?.stats?.views || 0;
    totalViews += views;
    if (!bestVideo || views > bestVideo.views) {
      bestVideo = { title: v.title, views };
    }
  }

  const avgViews = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentVideos = userVideos.filter(v => {
    const d = v.publishedAt || v.createdAt;
    return d && d >= thirtyDaysAgo;
  });
  const contentVelocity = recentVideos.length;

  const snapshots = await db.select().from(analyticsSnapshots)
    .where(and(eq(analyticsSnapshots.userId, userId), gte(analyticsSnapshots.snapshotDate, thirtyDaysAgo)))
    .orderBy(desc(analyticsSnapshots.snapshotDate))
    .limit(30);

  const trends: { metric: string; direction: 'up' | 'down' | 'stable'; change: number }[] = [];

  if (snapshots.length >= 2) {
    const latest = snapshots[0];
    const oldest = snapshots[snapshots.length - 1];

    const viewChange = (latest.metrics?.totalViews || 0) - (oldest.metrics?.totalViews || 0);
    const subChange = (latest.metrics?.totalSubscribers || 0) - (oldest.metrics?.totalSubscribers || 0);
    const revChange = (latest.metrics?.totalRevenue || 0) - (oldest.metrics?.totalRevenue || 0);

    trends.push({
      metric: "views",
      direction: viewChange > 0 ? 'up' : viewChange < 0 ? 'down' : 'stable',
      change: viewChange,
    });
    trends.push({
      metric: "subscribers",
      direction: subChange > 0 ? 'up' : subChange < 0 ? 'down' : 'stable',
      change: subChange,
    });
    trends.push({
      metric: "revenue",
      direction: revChange > 0 ? 'up' : revChange < 0 ? 'down' : 'stable',
      change: Math.round(revChange * 100) / 100,
    });
  }

  let healthScore = 50;
  if (totalVideos > 0) healthScore += 10;
  if (contentVelocity >= 4) healthScore += 15;
  else if (contentVelocity >= 1) healthScore += 5;
  if (avgViews > 1000) healthScore += 10;
  else if (avgViews > 100) healthScore += 5;
  if (userChannels.length > 1) healthScore += 5;
  const upTrends = trends.filter(t => t.direction === 'up').length;
  healthScore += upTrends * 5;
  healthScore = Math.min(100, Math.max(0, healthScore));

  return {
    totalVideos,
    totalViews,
    avgViews,
    bestVideo: bestVideo && bestVideo.views > 0 ? bestVideo : null,
    contentVelocity,
    healthScore,
    trends,
  };
}

export async function refreshInsights(userId: string): Promise<{ generated: number }> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  await db.delete(aiInsights).where(and(
    eq(aiInsights.userId, userId),
    eq(aiInsights.category, "dashboard"),
    sql`${aiInsights.createdAt} < ${sevenDaysAgo}`
  ));

  const result = await generateDashboardInsights(userId);
  const generated = result.insights.length + result.opportunities.length;

  return { generated };
}
