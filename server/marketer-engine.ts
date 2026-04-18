import { db } from "./db";
import { marketingCampaigns, marketingConfig, channels, videos, trafficStrategies, keywordInsights, notifications, aiResults, autopilotQueue } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { sanitizeForPrompt, tokenBudget } from "./lib/ai-attack-shield";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";

const logger = createLogger("marketer-engine");
const openai = getOpenAIClient();

const ORGANIC_STRATEGY_MAP = {
  seoOptimization: "SEO Optimization",
  communityEngagement: "Community Engagement",
  crossPlatformDistribution: "Cross-Platform Distribution",
  collaborationOutreach: "Collaboration Outreach",
  contentSeriesBuilding: "Content Series Building",
  audienceRetention: "Audience Retention",
  searchTrendRiding: "Search Trend Riding",
  playlistOptimization: "Playlist Optimization",
  shortsFunnel: "Shorts Funnel",
  endScreenOptimization: "End Screen Optimization",
  commentEngagement: "Comment Engagement",
  socialProofBuilding: "Social Proof Building",
  hashtagStrategy: "Hashtag Strategy",
  thumbnailOptimization: "Thumbnail Optimization",
  communityPosts: "Community Posts",
} as const;

export async function getOrCreateMarketingConfig(userId: string) {
  const existing = await db.select().from(marketingConfig).where(eq(marketingConfig.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [config] = await db.insert(marketingConfig).values({
    userId,
    paidAdsEnabled: false,
    monthlyAdBudget: 0,
  }).returning();

  return config;
}

export async function updateMarketingConfig(userId: string, updates: Partial<{
  paidAdsEnabled: boolean;
  monthlyAdBudget: number;
  organicStrategies: Record<string, boolean>;
  adPlatforms: Record<string, boolean>;
  targetAudience: Record<string, any>;
}>) {
  const config = await getOrCreateMarketingConfig(userId);

  const setValues: any = { updatedAt: new Date() };
  if (updates.paidAdsEnabled !== undefined) setValues.paidAdsEnabled = updates.paidAdsEnabled;
  if (updates.monthlyAdBudget !== undefined) setValues.monthlyAdBudget = updates.monthlyAdBudget;
  if (updates.organicStrategies) setValues.organicStrategies = updates.organicStrategies;
  if (updates.adPlatforms) setValues.adPlatforms = updates.adPlatforms;
  if (updates.targetAudience) setValues.targetAudience = updates.targetAudience;

  const [updated] = await db.update(marketingConfig).set(setValues).where(eq(marketingConfig.id, config.id)).returning();

  if (updates.paidAdsEnabled !== undefined) {
    logger.info(`Paid ads ${updates.paidAdsEnabled ? "ENABLED" : "DISABLED"} by user`, { userId });
    sendSSEEvent(userId, "marketing-update", { type: "config_changed", paidAdsEnabled: updates.paidAdsEnabled });
  }

  return updated;
}

async function gatherMarketingIntelligence(userId: string) {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const ytChannel = userChannels.find(c => c.platform === "youtube");

  const channelIds = userChannels.map(c => c.id);
  const recentVideos = channelIds.length > 0
    ? await db.select().from(videos)
        .where(sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(videos.createdAt))
        .limit(30)
    : [];

  const topKeywords = await db.select().from(keywordInsights)
    .where(and(eq(keywordInsights.userId, userId), gte(keywordInsights.score, 30)))
    .orderBy(desc(keywordInsights.score))
    .limit(20);

  const activeStrategies = await db.select().from(trafficStrategies)
    .where(and(eq(trafficStrategies.userId, userId), eq(trafficStrategies.status, "active")))
    .orderBy(desc(trafficStrategies.priority))
    .limit(15);

  const activeCampaigns = await db.select().from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.userId, userId), eq(marketingCampaigns.status, "active")))
    .limit(10);

  const pendingQueue = await db.select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "pending")));

  return {
    channels: userChannels.map(c => ({
      platform: c.platform,
      name: c.channelName,
      subscribers: c.subscriberCount || 0,
      views: c.viewCount || 0,
      videoCount: c.videoCount || 0,
    })),
    ytChannel: ytChannel ? {
      name: ytChannel.channelName,
      subs: ytChannel.subscriberCount || 0,
      views: ytChannel.viewCount || 0,
    } : null,
    recentVideos: recentVideos.map(v => ({
      title: sanitizeForPrompt(v.title, 150),
      type: v.type,
      views: (v.metadata as any)?.viewCount || 0,
      likes: (v.metadata as any)?.likeCount || 0,
      publishedAt: v.publishedAt || v.createdAt,
    })),
    topKeywords: topKeywords.map(k => ({ keyword: sanitizeForPrompt(k.keyword, 80), score: k.score, trend: k.trend })),
    activeStrategies: activeStrategies.map(s => ({ type: s.strategyType, title: sanitizeForPrompt(s.title, 100), priority: s.priority })),
    activeCampaigns: activeCampaigns.length,
    pendingContent: pendingQueue[0]?.count || 0,
    connectedPlatforms: userChannels.map(c => c.platform),
  };
}

export async function runMarketingCycle(userId: string): Promise<{
  organicActions: number;
  paidActions: number;
  campaignsCreated: number;
  strategiesGenerated: number;
}> {
  const config = await getOrCreateMarketingConfig(userId);
  const intel = await gatherMarketingIntelligence(userId);

  if (!intel.ytChannel && intel.channels.length === 0) {
    logger.info("No channels connected, skipping marketing cycle", { userId });
    return { organicActions: 0, paidActions: 0, campaignsCreated: 0, strategiesGenerated: 0 };
  }

  let organicActions = 0;
  let paidActions = 0;
  let campaignsCreated = 0;
  let strategiesGenerated = 0;

  try {
    const { generateTrafficStrategies } = await import("./services/traffic-growth-engine");
    await generateTrafficStrategies(userId);
    strategiesGenerated++;
    logger.info("Traffic strategies refreshed", { userId });
  } catch (err) {
    logger.error("Traffic strategy generation failed", { userId, error: String(err) });
  }

  try {
    const { analyzeChannelKeywords } = await import("./services/keyword-learning-engine");
    await analyzeChannelKeywords(userId);
    organicActions++;
    logger.info("Keyword analysis complete", { userId });
  } catch (err) {
    logger.error("Keyword analysis failed", { userId, error: String(err) });
  }

  const organic = config.organicStrategies as any || {};
  const retentionContext = await getRetentionBeatsPromptContext(userId);

  try {
    const campaignResult = await generateOrganicCampaign(userId, intel, organic, retentionContext);
    if (campaignResult) {
      campaignsCreated++;
      organicActions += campaignResult.actionsPlanned;
    }
  } catch (err) {
    logger.error("Organic campaign generation failed", { userId, error: String(err) });
  }

  if (config.paidAdsEnabled && (config.monthlyAdBudget || 0) > 0) {
    try {
      const adResult = await generatePaidAdCampaign(userId, intel, config, retentionContext);
      if (adResult) {
        paidActions += adResult.adsPlanned;
        campaignsCreated++;
      }
    } catch (err) {
      logger.error("Paid ad campaign generation failed", { userId, error: String(err) });
    }
  }

  try {
    const { computeSponsorshipReadiness } = await import("./services/brand-partnerships-engine");
    await computeSponsorshipReadiness(userId);
    organicActions++;
  } catch (err) {
    logger.error("Sponsorship readiness check failed", { userId, error: String(err) });
  }

  try {
    const { findCollabCandidates } = await import("./collab-engine");
    await findCollabCandidates(userId);
    organicActions++;
  } catch (err) {
    logger.error("Collab candidate scan failed", { userId, error: String(err) });
  }

  await db.update(marketingConfig).set({ lastCycleAt: new Date() }).where(eq(marketingConfig.userId, userId));

  const summary = {
    organicActions,
    paidActions,
    campaignsCreated,
    strategiesGenerated,
  };

  sendSSEEvent(userId, "marketing-update", { type: "cycle_complete", ...summary });

  logger.info("Marketing cycle complete", { userId, ...summary });
  return summary;
}

async function generateOrganicCampaign(
  userId: string,
  intel: Awaited<ReturnType<typeof gatherMarketingIntelligence>>,
  organicConfig: Record<string, boolean>,
  retentionContext: string,
): Promise<{ actionsPlanned: number } | null> {
  const enabledStrategies = Object.entries(ORGANIC_STRATEGY_MAP)
    .filter(([key]) => organicConfig[key] !== false)
    .map(([, name]) => name);

  const prompt = `You are an elite autonomous content marketer managing a creator's entire marketing operation. Your role covers EVERY aspect of organic growth — no gaps, no missed opportunities.

CHANNEL DATA:
${JSON.stringify(intel.ytChannel || intel.channels[0] || {}, null, 2)}

CONNECTED PLATFORMS: ${intel.connectedPlatforms.join(", ")}

RECENT VIDEOS (${intel.recentVideos.length}):
${JSON.stringify(intel.recentVideos.slice(0, 10), null, 2)}

TOP KEYWORDS: ${intel.topKeywords.map(k => `${k.keyword} (score:${k.score})`).join(", ")}

ACTIVE STRATEGIES: ${intel.activeStrategies.map(s => s.title).join(", ") || "None yet"}

PENDING CONTENT IN QUEUE: ${intel.pendingContent}

ENABLED ORGANIC STRATEGIES: ${enabledStrategies.join(", ")}

${retentionContext}

Create a comprehensive organic marketing campaign that covers ALL enabled strategy types. For each action, specify exactly what to do and when. This campaign will be AUTOMATICALLY executed — zero manual intervention needed.

Focus areas:
1. SEO: Title/tag/description optimization using proven keywords
2. Community: Polls, community posts, pinned comments, reply strategy
3. Cross-Platform: Repurpose content to TikTok, X, Discord with platform-native formats
4. Collaborations: Identify and prep outreach to compatible creators
5. Content Series: Plan binge-worthy series to boost session time
6. Retention: Apply retention beat science to improve watch time
7. Trend Surfing: Ride rising search trends in the niche
8. Shorts Funnel: Use Shorts to drive viewers to long-form
9. Playlists: Organize content to maximize session duration
10. End Screens: Optimize end screens and cards for viewer retention
11. Comment Engagement: Strategic replies that boost engagement signals
12. Social Proof: Leverage milestones and achievements
13. Hashtags: Platform-specific hashtag strategy
14. Thumbnails: A/B test concepts and optimization plans
15. Community Posts: Regular community tab posts for engagement

Respond with JSON:
{
  "campaignName": "descriptive name",
  "weeklyPlan": {
    "monday": { "focus": "area", "actions": ["specific action 1", "action 2"] },
    "tuesday": { "focus": "area", "actions": ["specific action 1"] },
    "wednesday": { "focus": "area", "actions": ["specific action 1"] },
    "thursday": { "focus": "area", "actions": ["specific action 1"] },
    "friday": { "focus": "area", "actions": ["specific action 1"] },
    "saturday": { "focus": "area", "actions": ["specific action 1"] },
    "sunday": { "focus": "area", "actions": ["specific action 1"] }
  },
  "immediateActions": [
    { "strategy": "category", "action": "what to do right now", "platform": "where", "priority": 1-10 }
  ],
  "keywordsToPush": ["keywords to emphasize in upcoming content"],
  "contentAngles": ["fresh content angles based on trends"],
  "audienceGrowthTactics": ["specific tactics for subscriber growth"],
  "retentionImprovements": ["specific retention improvements to apply"],
  "crossPlatformSchedule": { "platform": "posting frequency and strategy" }
}`;

  if (!tokenBudget.checkBudget("marketer-engine", 4000)) {
    logger.warn("[MarketerEngine] Daily budget exhausted — skipping campaign generation");
    return null;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });
  tokenBudget.consumeBudget("marketer-engine", response.usage?.total_tokens ?? 4000);

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  const plan = JSON.parse(content);

  await db.insert(marketingCampaigns).values({
    userId,
    campaignType: "organic-comprehensive",
    name: plan.campaignName || "Organic Growth Campaign",
    status: "active",
    mode: "organic",
    strategies: {
      organic: (plan.immediateActions || []).map((a: any) => `[${a.strategy}] ${a.action}`),
      paid: [],
      platforms: intel.connectedPlatforms,
      audiences: plan.audienceGrowthTactics || [],
      keywords: plan.keywordsToPush || [],
      schedule: plan.weeklyPlan ? Object.fromEntries(
        Object.entries(plan.weeklyPlan).map(([day, val]: [string, any]) => [day, val.focus || ""])
      ) : {},
    },
    targetMetrics: {
      targetViews: (intel.ytChannel?.views || 0) * 1.2,
      targetSubscribers: (intel.ytChannel?.subs || 0) + 100,
      targetEngagementRate: 0.05,
    },
    metadata: {
      aiModel: "gpt-4o-mini",
      generatedAt: new Date().toISOString(),
      retentionBeatsApplied: true,
    },
    lastRunAt: new Date(),
  });

  await db.insert(aiResults).values({
    userId,
    featureKey: `marketing-organic-${Date.now()}`,
    result: {
      ...plan,
      generatedAt: new Date().toISOString(),
      source: "marketer-engine",
    },
  });

  const actionsPlanned = (plan.immediateActions || []).length + Object.values(plan.weeklyPlan || {}).reduce((sum: number, day: any) => sum + (day.actions?.length || 0), 0);

  return { actionsPlanned };
}

async function generatePaidAdCampaign(
  userId: string,
  intel: Awaited<ReturnType<typeof gatherMarketingIntelligence>>,
  config: any,
  retentionContext: string,
): Promise<{ adsPlanned: number } | null> {
  const adPlatforms = config.adPlatforms as any || {};
  const enabledAdPlatforms = Object.entries(adPlatforms)
    .filter(([, enabled]) => enabled)
    .map(([platform]) => platform);

  if (enabledAdPlatforms.length === 0) return null;

  const budget = config.monthlyAdBudget || 0;
  if (budget <= 0) return null;

  const targetAudience = config.targetAudience as any || {};

  const topVideos = intel.recentVideos
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const prompt = `You are a paid advertising strategist for a content creator. Create a data-driven ad campaign plan.

IMPORTANT: You are creating STRATEGY and AD COPY only. The creator will set up the actual ads on the ad platform manually or through their ad account. Your job is to provide the complete blueprint.

CHANNEL: ${JSON.stringify(intel.ytChannel || intel.channels[0] || {})}
MONTHLY AD BUDGET: $${budget}
ENABLED AD PLATFORMS: ${enabledAdPlatforms.join(", ")}
TARGET AUDIENCE: ${JSON.stringify(targetAudience)}
TOP PERFORMING VIDEOS: ${JSON.stringify(topVideos)}
TOP KEYWORDS: ${intel.topKeywords.map(k => k.keyword).join(", ")}
CONNECTED PLATFORMS: ${intel.connectedPlatforms.join(", ")}

${retentionContext}

Create a comprehensive paid advertising strategy:

1. BUDGET ALLOCATION: How to split the $${budget}/month across platforms
2. CAMPAIGN TYPES: Discovery ads, in-stream ads, bumper ads, etc.
3. TARGETING: Audience segments, interests, demographics, remarketing
4. AD CREATIVES: Headlines, descriptions, CTAs for each ad type
5. VIDEOS TO PROMOTE: Which existing videos to boost and why
6. A/B TEST PLAN: What to test (thumbnails, headlines, audiences)
7. OPTIMIZATION SCHEDULE: When to review and adjust
8. KPIs: What metrics to track and target benchmarks
9. NEGATIVE KEYWORDS: What to exclude
10. REMARKETING: Retarget viewers who watched but didn't subscribe

Respond with JSON:
{
  "campaignName": "name",
  "budgetAllocation": { "platform": { "amount": 0, "percentage": 0, "reasoning": "" } },
  "campaigns": [
    {
      "platform": "ad platform",
      "type": "campaign type",
      "objective": "campaign objective",
      "dailyBudget": 0,
      "targeting": {
        "audiences": ["audience segments"],
        "interests": ["interest categories"],
        "demographics": "demographic targeting",
        "placements": ["where ads show"],
        "negativeKeywords": ["exclusions"]
      },
      "adCreatives": [
        {
          "headline": "ad headline",
          "description": "ad description",
          "cta": "call to action",
          "videoToPromote": "which video",
          "format": "ad format"
        }
      ],
      "expectedResults": {
        "impressions": 0,
        "clicks": 0,
        "ctr": 0,
        "cpm": 0,
        "subscriberGain": 0
      }
    }
  ],
  "abTests": [
    { "test": "what to test", "variants": ["variant A", "variant B"], "metric": "what to measure" }
  ],
  "optimizationSchedule": "when to review and adjust",
  "weeklyCheckpoints": ["checkpoint 1", "checkpoint 2"],
  "estimatedMonthlyROI": "expected return description"
}`;

  if (!tokenBudget.checkBudget("marketer-engine", 4000)) {
    logger.warn("[MarketerEngine] Daily budget exhausted — skipping paid campaign generation");
    return null;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });
  tokenBudget.consumeBudget("marketer-engine", response.usage?.total_tokens ?? 4000);

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  const plan = JSON.parse(content);

  await db.insert(marketingCampaigns).values({
    userId,
    campaignType: "paid-advertising",
    name: plan.campaignName || "Paid Growth Campaign",
    status: "active",
    mode: "paid",
    budget,
    spent: 0,
    strategies: {
      organic: [],
      paid: (plan.campaigns || []).map((c: any) => `[${c.platform}] ${c.type}: ${c.objective}`),
      platforms: enabledAdPlatforms,
      audiences: (plan.campaigns || []).flatMap((c: any) => c.targeting?.audiences || []),
      keywords: intel.topKeywords.map(k => k.keyword),
      adCopy: (plan.campaigns || []).flatMap((c: any) => (c.adCreatives || []).map((ad: any) => ad.headline)).join(" | "),
    },
    targetMetrics: {
      targetViews: (plan.campaigns || []).reduce((sum: number, c: any) => sum + (c.expectedResults?.impressions || 0), 0),
      targetSubscribers: (plan.campaigns || []).reduce((sum: number, c: any) => sum + (c.expectedResults?.subscriberGain || 0), 0),
      targetCtr: (plan.campaigns || []).reduce((sum: number, c: any) => sum + (c.expectedResults?.ctr || 0), 0) / Math.max(1, (plan.campaigns || []).length),
      targetCpm: (plan.campaigns || []).reduce((sum: number, c: any) => sum + (c.expectedResults?.cpm || 0), 0) / Math.max(1, (plan.campaigns || []).length),
    },
    metadata: {
      aiModel: "gpt-4o-mini",
      generatedAt: new Date().toISOString(),
      retentionBeatsApplied: true,
      adPlatform: enabledAdPlatforms.join(","),
    },
    lastRunAt: new Date(),
  });

  await db.insert(aiResults).values({
    userId,
    featureKey: `marketing-paid-${Date.now()}`,
    result: {
      ...plan,
      generatedAt: new Date().toISOString(),
      source: "marketer-engine-paid",
    },
  });

  const adsPlanned = (plan.campaigns || []).reduce((sum: number, c: any) => sum + (c.adCreatives?.length || 0), 0);

  logger.info("Paid ad campaign generated", { userId, budget, adsPlanned, platforms: enabledAdPlatforms });

  return { adsPlanned };
}

export async function runMarketingCycleForAllUsers(): Promise<number> {
  const userRows = await db.selectDistinct({ userId: channels.userId }).from(channels)
    .where(eq(channels.platform, "youtube"));

  let processed = 0;
  for (const { userId } of userRows) {
    if (!userId) continue;
    try {
      await runMarketingCycle(userId);
      processed++;
    } catch (err) {
      logger.error("Marketing cycle failed for user", { userId, error: String(err) });
    }
  }

  logger.info("Global marketing cycle complete", { usersProcessed: processed });
  return processed;
}

export async function getMarketingDashboard(userId: string) {
  const config = await getOrCreateMarketingConfig(userId);

  const recentCampaigns = await db.select().from(marketingCampaigns)
    .where(eq(marketingCampaigns.userId, userId))
    .orderBy(desc(marketingCampaigns.createdAt))
    .limit(10);

  const activeStrategies = await db.select().from(trafficStrategies)
    .where(and(eq(trafficStrategies.userId, userId), eq(trafficStrategies.status, "active")))
    .orderBy(desc(trafficStrategies.priority))
    .limit(20);

  const topKeywords = await db.select().from(keywordInsights)
    .where(and(eq(keywordInsights.userId, userId), gte(keywordInsights.score, 30)))
    .orderBy(desc(keywordInsights.score))
    .limit(15);

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [weekCampaigns] = await db.select({ count: sql<number>`count(*)::int` })
    .from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.userId, userId), gte(marketingCampaigns.createdAt, weekAgo)));

  const [weekStrategies] = await db.select({ count: sql<number>`count(*)::int` })
    .from(trafficStrategies)
    .where(and(eq(trafficStrategies.userId, userId), gte(trafficStrategies.createdAt, weekAgo)));

  const organicConfig = config.organicStrategies as any || {};
  const enabledCount = Object.values(organicConfig).filter(Boolean).length;
  const totalStrategies = Object.keys(ORGANIC_STRATEGY_MAP).length;

  return {
    config: {
      paidAdsEnabled: config.paidAdsEnabled,
      monthlyAdBudget: config.monthlyAdBudget,
      organicCoverage: `${enabledCount}/${totalStrategies}`,
      allStrategiesEnabled: enabledCount >= totalStrategies,
      adPlatforms: config.adPlatforms,
      targetAudience: config.targetAudience,
      lastCycleAt: config.lastCycleAt,
    },
    campaigns: {
      total: recentCampaigns.length,
      active: recentCampaigns.filter(c => c.status === "active").length,
      organic: recentCampaigns.filter(c => c.mode === "organic").length,
      paid: recentCampaigns.filter(c => c.mode === "paid").length,
      thisWeek: weekCampaigns?.count || 0,
      recent: recentCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.campaignType,
        mode: c.mode,
        status: c.status,
        budget: c.budget,
        spent: c.spent,
        createdAt: c.createdAt,
      })),
    },
    strategies: {
      active: activeStrategies.length,
      thisWeek: weekStrategies?.count || 0,
      types: activeStrategies.map(s => ({ type: s.strategyType, title: s.title, priority: s.priority })),
    },
    keywords: {
      tracked: topKeywords.length,
      top5: topKeywords.slice(0, 5).map(k => ({ keyword: k.keyword, score: k.score, trend: k.trend })),
    },
    status: {
      mode: config.paidAdsEnabled ? "organic + paid" : "organic only",
      health: enabledCount >= totalStrategies ? "fort-knox" : enabledCount >= 10 ? "strong" : "building",
      coverage: Object.entries(ORGANIC_STRATEGY_MAP).map(([key, name]) => ({
        strategy: name,
        enabled: organicConfig[key] !== false,
      })),
    },
  };
}

export async function togglePaidAds(userId: string, enable: boolean, monthlyBudget?: number) {
  const updates: any = { paidAdsEnabled: enable };
  if (monthlyBudget !== undefined) updates.monthlyAdBudget = monthlyBudget;

  if (!enable) {
    await db.update(marketingCampaigns).set({ status: "paused" })
      .where(and(eq(marketingCampaigns.userId, userId), eq(marketingCampaigns.mode, "paid"), eq(marketingCampaigns.status, "active")));
  }

  return updateMarketingConfig(userId, updates);
}
