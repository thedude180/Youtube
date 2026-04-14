import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  dailyBriefings, agentScorecards, growthPredictions, contentDnaProfiles,
  learningInsights, analyticsSnapshots, abTests, videos, channels,
  aiAgentActivities, competitorTracks, revenueRecords, scheduleItems,
  wellnessChecks, trendingTopics,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const openai = getOpenAIClient();

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getShortTermMemory(userId: string) {
  const since = hoursAgo(24);
  try {
    const [recentActivities, recentInsights, recentSnapshots] = await Promise.all([
      db.select().from(aiAgentActivities)
        .where(and(eq(aiAgentActivities.userId, userId), gte(aiAgentActivities.createdAt, since)))
        .orderBy(desc(aiAgentActivities.createdAt))
        .limit(20),
      db.select().from(learningInsights)
        .where(and(eq(learningInsights.userId, userId), gte(learningInsights.updatedAt, since)))
        .orderBy(desc(learningInsights.updatedAt))
        .limit(10),
      db.select().from(analyticsSnapshots)
        .where(and(eq(analyticsSnapshots.userId, userId), gte(analyticsSnapshots.createdAt, since)))
        .orderBy(desc(analyticsSnapshots.createdAt))
        .limit(1),
    ]);
    return { recentActivities, recentInsights, recentSnapshots };
  } catch {
    return { recentActivities: [], recentInsights: [], recentSnapshots: [] };
  }
}

async function getMediumTermMemory(userId: string) {
  const since = daysAgo(7);
  try {
    const [weeklyAbTests, weeklyInsights, weeklyRevenue] = await Promise.all([
      db.select().from(abTests)
        .where(and(eq(abTests.userId, userId), gte(abTests.createdAt, since)))
        .orderBy(desc(abTests.createdAt))
        .limit(10),
      db.select().from(learningInsights)
        .where(and(eq(learningInsights.userId, userId), gte(learningInsights.createdAt, since)))
        .orderBy(desc(learningInsights.updatedAt))
        .limit(20),
      db.select().from(revenueRecords)
        .where(and(eq(revenueRecords.userId, userId), gte(revenueRecords.createdAt, since)))
        .limit(50),
    ]);
    return { weeklyAbTests, weeklyInsights, weeklyRevenue };
  } catch {
    return { weeklyAbTests: [], weeklyInsights: [], weeklyRevenue: [] };
  }
}

async function getLongTermMemory(userId: string) {
  try {
    const [styleMemory, dnaProfile, competitors, allInsights] = await Promise.all([
      storage.getCreatorMemory(userId),
      db.select().from(contentDnaProfiles)
        .where(eq(contentDnaProfiles.userId, userId))
        .orderBy(desc(contentDnaProfiles.lastUpdatedAt))
        .limit(1),
      db.select().from(competitorTracks)
        .where(eq(competitorTracks.userId, userId))
        .limit(10),
      db.select().from(learningInsights)
        .where(eq(learningInsights.userId, userId))
        .orderBy(desc(sql`${learningInsights.confidence} * COALESCE(${learningInsights.sampleSize}, 1)`))
        .limit(30),
    ]);
    return {
      styleMemory,
      dnaProfile: dnaProfile[0] || null,
      competitors,
      seasonalPatterns: allInsights.filter(i => i.data?.seasonal),
      audiencePreferences: allInsights.filter(i => i.category === "audience_preference" || i.category === "content_type_performance"),
    };
  } catch {
    return { styleMemory: [], dnaProfile: null, competitors: [], seasonalPatterns: [], audiencePreferences: [] };
  }
}

export async function generateDailyBriefing(userId: string): Promise<{
  overnightSummary: string;
  trendingNow: string;
  todaysPlan: string;
  actionItems: string[];
}> {
  try {
    const [shortTerm, mediumTerm, longTerm, userChannels, trending] = await Promise.all([
      getShortTermMemory(userId),
      getMediumTermMemory(userId),
      getLongTermMemory(userId),
      storage.getChannelsByUser(userId),
      db.select().from(trendingTopics)
        .where(eq(trendingTopics.userId, userId))
        .orderBy(desc(trendingTopics.trendScore))
        .limit(5),
    ]);

    const latestMetrics = shortTerm.recentSnapshots[0]?.metrics;
    const activitySummary = shortTerm.recentActivities.map(a => `${a.agentId}: ${a.action}`).slice(0, 5).join("; ");
    const abTestResults = mediumTerm.weeklyAbTests.filter(t => t.winner).map(t => `A/B test on video ${t.videoId}: variant ${t.winner} won`).join("; ");
    const trendList = trending.map(t => `${t.topic} (score: ${t.trendScore})`).join(", ");
    const totalRevenue = mediumTerm.weeklyRevenue.reduce((sum, r) => sum + (r.amount || 0), 0);

    const prompt = `You are a creator's daily intelligence briefing system. Generate a concise 3-sentence briefing based on this data.

OVERNIGHT ACTIVITY (last 24h):
- Agent actions: ${activitySummary || "No activity"}
- Latest metrics: ${latestMetrics ? `${latestMetrics.totalViews} total views, ${latestMetrics.totalSubscribers} subs, $${latestMetrics.totalRevenue} revenue` : "No metrics available"}
- New insights: ${shortTerm.recentInsights.length} learning events recorded

WEEKLY CONTEXT:
- A/B test results: ${abTestResults || "No completed tests"}
- Weekly revenue: $${totalRevenue.toFixed(2)}
- Active channels: ${userChannels.length}

TRENDING NOW:
${trendList || "No trending topics detected"}

LONG-TERM PATTERNS:
- Content strengths: ${longTerm.dnaProfile?.profileData?.uniqueStrengths?.join(", ") || "Still learning"}
- Competitors tracked: ${longTerm.competitors.length}

Generate exactly this JSON:
{
  "overnightSummary": "1 sentence about what happened overnight (metrics, agent actions, notable changes)",
  "trendingNow": "1 sentence about current trends and opportunities",
  "todaysPlan": "1 sentence with the top priority for today based on all data",
  "actionItems": ["3-5 specific action items that need the creator's attention or decision"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response for daily briefing");

    const briefing = JSON.parse(content);

    await db.insert(dailyBriefings).values({
      userId,
      briefingDate: new Date(),
      overnightSummary: briefing.overnightSummary,
      trendingNow: briefing.trendingNow,
      todaysPlan: briefing.todaysPlan,
      actionItems: briefing.actionItems,
      metadata: {
        metrics: latestMetrics ? {
          totalViews: latestMetrics.totalViews,
          totalSubscribers: latestMetrics.totalSubscribers,
          totalRevenue: latestMetrics.totalRevenue,
        } : undefined,
      },
    });

    return briefing;
  } catch (error) {
    console.error("Failed to generate daily briefing:", error);
    return {
      overnightSummary: "Unable to generate overnight summary. Check back shortly.",
      trendingNow: "Trend analysis is currently being updated.",
      todaysPlan: "Review your dashboard for the latest updates.",
      actionItems: ["Check your channel analytics", "Review any pending A/B tests"],
    };
  }
}

export async function recordLearningEvent(
  userId: string,
  category: string,
  pattern: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const existing = await db.select().from(learningInsights)
      .where(and(
        eq(learningInsights.userId, userId),
        eq(learningInsights.category, category),
        eq(learningInsights.pattern, pattern)
      ))
      .limit(1);

    if (existing.length > 0) {
      const match = existing[0];
      const currentSampleSize = match.sampleSize || 0;
      const currentConfidence = match.confidence || 0.5;
      const newSampleSize = currentSampleSize + 1;
      const confidenceBoost = Math.min(0.05, 1 / (newSampleSize + 5));
      const newConfidence = Math.min(0.99, currentConfidence + confidenceBoost);

      const existingData = match.data || {} as any;
      await db.update(learningInsights)
        .set({
          sampleSize: newSampleSize,
          confidence: newConfidence,
          data: {
            finding: (data.finding as string) || existingData.finding || pattern,
            evidence: [
              ...(existingData.evidence || []),
              ...((data.evidence as string[]) || []),
            ].slice(-20),
            recommendation: (data.recommendation as string) || existingData.recommendation || "",
            performanceImpact: (data.performanceImpact as number) ?? existingData.performanceImpact,
            platform: (data.platform as string) || existingData.platform,
            seasonal: (data.seasonal as boolean) ?? existingData.seasonal,
            lastValidated: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(learningInsights.id, match.id));
    } else {
      await db.insert(learningInsights).values({
        userId,
        category,
        pattern,
        confidence: 0.5,
        sampleSize: 1,
        data: {
          finding: (data.finding as string) || pattern,
          evidence: (data.evidence as string[]) || [],
          recommendation: (data.recommendation as string) || "",
          performanceImpact: data.performanceImpact as number | undefined,
          platform: data.platform as string | undefined,
          seasonal: data.seasonal as boolean | undefined,
          lastValidated: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Failed to record learning event:", error);
  }
}

export async function getLearningContext(userId: string): Promise<string> {
  try {
    const { getYouTubeLearningContext } = await import("./youtube-learning-engine");

    const [insights, dna, styleMemory, youtubeContext] = await Promise.all([
      db.select().from(learningInsights)
        .where(eq(learningInsights.userId, userId))
        .orderBy(desc(sql`${learningInsights.confidence} * COALESCE(${learningInsights.sampleSize}, 1)`))
        .limit(15),
      db.select().from(contentDnaProfiles)
        .where(eq(contentDnaProfiles.userId, userId))
        .orderBy(desc(contentDnaProfiles.lastUpdatedAt))
        .limit(1),
      storage.getCreatorMemory(userId),
      getYouTubeLearningContext(userId).catch(() => ""),
    ]);

    if (insights.length === 0 && styleMemory.length === 0 && !youtubeContext) {
      return "";
    }

    const parts: string[] = [];

    if (youtubeContext) {
      parts.push(youtubeContext);
      parts.push("");
    }

    if (insights.length > 0) {
      parts.push("LEARNING INSIGHTS:");
      for (const insight of insights) {
        const finding = insight.data?.finding || insight.pattern;
        const recommendation = insight.data?.recommendation;
        const confidence = insight.confidence || 0;
        const label = confidence >= 0.8 ? "high confidence" : confidence >= 0.5 ? "moderate confidence" : "low confidence";
        parts.push(`- ${finding} (${label}, ${insight.sampleSize || 0} samples)`);
        if (recommendation) {
          parts.push(`  Action: ${recommendation}`);
        }
      }
    }

    const profile = dna[0];
    if (profile?.profileData) {
      parts.push("\nCONTENT DNA:");
      const pd = profile.profileData;
      if (pd.topFormats?.length) parts.push(`- Top formats: ${pd.topFormats.join(", ")}`);
      if (pd.tonalPattern) parts.push(`- Tonal pattern: ${pd.tonalPattern}`);
      if (pd.bestHooks?.length) parts.push(`- Best hooks: ${pd.bestHooks.join(", ")}`);
      if (pd.bestPostingTimes?.length) parts.push(`- Best posting times: ${pd.bestPostingTimes.join(", ")}`);
      if (pd.uniqueStrengths?.length) parts.push(`- Unique strengths: ${pd.uniqueStrengths.join(", ")}`);
    }

    if (styleMemory.length > 0) {
      const styleEntries = styleMemory.filter(m => m.memoryType === "style_profile");
      if (styleEntries.length > 0) {
        parts.push("\nCREATOR STYLE:");
        for (const entry of styleEntries) {
          const label = entry.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          let displayValue = entry.value;
          try {
            const parsed = JSON.parse(entry.value);
            if (Array.isArray(parsed)) displayValue = parsed.join(", ");
          } catch { /* not JSON */ }
          parts.push(`- ${label}: ${displayValue}`);
        }
      }
    }

    return parts.join("\n");
  } catch (error) {
    console.error("Failed to get learning context:", error);
    return "";
  }
}

export async function getHealthScore(userId: string): Promise<number> {
  try {
    const [userChannels, recentVideos, recentWellness, platformHealthRecords, recentInsights] = await Promise.all([
      storage.getChannelsByUser(userId),
      db.select().from(videos)
        .where(gte(videos.createdAt, daysAgo(30)))
        .limit(100),
      db.select().from(wellnessChecks)
        .where(and(eq(wellnessChecks.userId, userId), gte(wellnessChecks.createdAt, daysAgo(7))))
        .orderBy(desc(wellnessChecks.createdAt))
        .limit(5),
      storage.getPlatformHealth(userId),
      db.select().from(learningInsights)
        .where(eq(learningInsights.userId, userId))
        .limit(50),
    ]);

    const channelIds = userChannels.map(c => c.id);
    const userVideos = recentVideos.filter(v => v.channelId && channelIds.includes(v.channelId));

    let score = 50;

    const uploadConsistency = Math.min(userVideos.length / 4, 1);
    score += uploadConsistency * 15;

    if (userChannels.length > 0) score += 5;
    if (userChannels.length >= 3) score += 5;

    const avgSeo = userVideos.reduce((sum, v) => sum + (v.metadata?.seoScore || 0), 0) / Math.max(userVideos.length, 1);
    score += Math.min(avgSeo / 100 * 10, 10);

    const highConfidenceInsights = recentInsights.filter(i => (i.confidence || 0) >= 0.7).length;
    score += Math.min(highConfidenceInsights * 2, 10);

    if (recentWellness.length > 0) {
      const avgMood = recentWellness.reduce((s, w) => s + w.mood, 0) / recentWellness.length;
      const avgStress = recentWellness.reduce((s, w) => s + w.stress, 0) / recentWellness.length;
      if (avgMood >= 4) score += 3;
      if (avgStress <= 3) score += 2;
      if (avgMood <= 2 || avgStress >= 4) score -= 5;
    }

    return Math.max(1, Math.min(100, Math.round(score)));
  } catch (error) {
    console.error("Failed to calculate health score:", error);
    return 50;
  }
}

export async function updateAgentScorecard(
  userId: string,
  agentId: string,
  taskResult: { success: boolean; action: string; userApproved?: boolean; details?: string }
): Promise<void> {
  try {
    const now = new Date();
    const periodKey = `${now.getFullYear()}-W${Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7)}`;

    const existing = await db.select().from(agentScorecards)
      .where(and(
        eq(agentScorecards.userId, userId),
        eq(agentScorecards.agentId, agentId),
        eq(agentScorecards.period, periodKey)
      ))
      .limit(1);

    if (existing.length > 0) {
      const scorecard = existing[0];
      const prevCompleted = scorecard.tasksCompleted || 0;
      const prevAccuracy = scorecard.accuracy || 0.5;
      const newCompleted = prevCompleted + 1;
      const successWeight = taskResult.success ? 1 : 0;
      const approvalWeight = taskResult.userApproved !== undefined ? (taskResult.userApproved ? 0.1 : -0.1) : 0;
      const newAccuracy = ((prevAccuracy * prevCompleted) + successWeight + approvalWeight) / newCompleted;

      const topActions = scorecard.topActions || [];
      if (taskResult.success && taskResult.action && !topActions.includes(taskResult.action)) {
        topActions.push(taskResult.action);
        if (topActions.length > 5) topActions.shift();
      }

      const improvementAreas = scorecard.improvementAreas || [];
      if (!taskResult.success && taskResult.details && !improvementAreas.includes(taskResult.details)) {
        improvementAreas.push(taskResult.details);
        if (improvementAreas.length > 5) improvementAreas.shift();
      }

      await db.update(agentScorecards)
        .set({
          tasksCompleted: newCompleted,
          accuracy: Math.max(0, Math.min(1, newAccuracy)),
          topActions,
          improvementAreas,
          userRating: taskResult.userApproved !== undefined
            ? Math.max(0, Math.min(5, (scorecard.userRating || 3) + (taskResult.userApproved ? 0.2 : -0.2)))
            : scorecard.userRating,
        })
        .where(eq(agentScorecards.id, scorecard.id));
    } else {
      await db.insert(agentScorecards).values({
        userId,
        agentId,
        period: periodKey,
        tasksCompleted: 1,
        accuracy: taskResult.success ? 0.8 : 0.3,
        userRating: taskResult.userApproved ? 4 : taskResult.userApproved === false ? 2 : 3,
        topActions: taskResult.success ? [taskResult.action] : [],
        improvementAreas: !taskResult.success && taskResult.details ? [taskResult.details] : [],
      });
    }
  } catch (error) {
    console.error("Failed to update agent scorecard:", error);
  }
}

export async function generateGrowthPrediction(userId: string): Promise<{
  subscribers: { current: number; predicted30d: number; predicted90d: number; predicted365d: number };
  views: { current: number; predicted30d: number; predicted90d: number; predicted365d: number };
  revenue: { current: number; predicted30d: number; predicted90d: number; predicted365d: number };
  confidence: number;
  factors: string[];
}> {
  try {
    const [snapshots, userChannels, recentRevenue, insights] = await Promise.all([
      db.select().from(analyticsSnapshots)
        .where(eq(analyticsSnapshots.userId, userId))
        .orderBy(desc(analyticsSnapshots.snapshotDate))
        .limit(30),
      storage.getChannelsByUser(userId),
      db.select().from(revenueRecords)
        .where(and(eq(revenueRecords.userId, userId), gte(revenueRecords.createdAt, daysAgo(90))))
        .limit(200),
      db.select().from(learningInsights)
        .where(eq(learningInsights.userId, userId))
        .orderBy(desc(learningInsights.confidence))
        .limit(10),
    ]);

    const latest = snapshots[0]?.metrics;
    const oldest = snapshots[snapshots.length - 1]?.metrics;

    const currentSubs = latest?.totalSubscribers || 0;
    const currentViews = latest?.totalViews || 0;
    const currentRevenue = latest?.totalRevenue || 0;
    const totalRecentRevenue = recentRevenue.reduce((s, r) => s + (r.amount || 0), 0);

    const daySpan = snapshots.length >= 2
      ? Math.max(1, (new Date(snapshots[0].snapshotDate).getTime() - new Date(snapshots[snapshots.length - 1].snapshotDate).getTime()) / (1000 * 60 * 60 * 24))
      : 30;
    const subGrowthRate = oldest ? (currentSubs - (oldest.totalSubscribers || 0)) / daySpan : 0;
    const viewGrowthRate = oldest ? (currentViews - (oldest.totalViews || 0)) / daySpan : 0;
    const monthlyRevenue = totalRecentRevenue / 3;

    const contextSummary = insights.map(i => i.data?.finding || i.pattern).slice(0, 5).join("; ");

    const prompt = `You are a creator growth forecasting system. Based on this data, predict growth trajectories.

CURRENT METRICS:
- Subscribers: ${currentSubs}
- Total views: ${currentViews}
- Monthly revenue: $${monthlyRevenue.toFixed(2)}
- Channels: ${userChannels.length}
- Daily sub growth rate: ${subGrowthRate.toFixed(1)}
- Daily view growth rate: ${viewGrowthRate.toFixed(0)}
- Data points available: ${snapshots.length}

KEY INSIGHTS: ${contextSummary || "No insights yet"}

Generate growth predictions as JSON:
{
  "subscribers": { "predicted30d": number, "predicted90d": number, "predicted365d": number },
  "views": { "predicted30d": number, "predicted90d": number, "predicted365d": number },
  "revenue": { "predicted30d": number, "predicted90d": number, "predicted365d": number },
  "confidence": 0.0 to 1.0 based on data quality,
  "factors": ["3-5 key factors influencing these predictions"]
}

Be realistic. Account for diminishing returns, seasonality, and typical creator growth curves. If data is limited, lower the confidence score.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response for growth prediction");

    const prediction = JSON.parse(content);

    const metrics = ["subscribers", "views", "revenue"] as const;
    const currentValues = { subscribers: currentSubs, views: currentViews, revenue: currentRevenue };

    for (const metric of metrics) {
      await db.insert(growthPredictions).values({
        userId,
        metric,
        currentValue: currentValues[metric],
        predicted30d: prediction[metric]?.predicted30d || 0,
        predicted90d: prediction[metric]?.predicted90d || 0,
        predicted365d: prediction[metric]?.predicted365d || 0,
        confidence: prediction.confidence || 0.5,
        factors: prediction.factors || [],
      });
    }

    return {
      subscribers: { current: currentSubs, ...prediction.subscribers },
      views: { current: currentViews, ...prediction.views },
      revenue: { current: currentRevenue, ...prediction.revenue },
      confidence: prediction.confidence || 0.5,
      factors: prediction.factors || [],
    };
  } catch (error) {
    console.error("Failed to generate growth prediction:", error);
    return {
      subscribers: { current: 0, predicted30d: 0, predicted90d: 0, predicted365d: 0 },
      views: { current: 0, predicted30d: 0, predicted90d: 0, predicted365d: 0 },
      revenue: { current: 0, predicted30d: 0, predicted90d: 0, predicted365d: 0 },
      confidence: 0,
      factors: ["Insufficient data to generate predictions"],
    };
  }
}

export async function processActionItems(userId: string): Promise<Array<{
  type: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  source: string;
}>> {
  try {
    const [pendingAbTests, pendingSchedule, recentInsights, pendingDeals] = await Promise.all([
      db.select().from(abTests)
        .where(and(eq(abTests.userId, userId), eq(abTests.status, "active")))
        .limit(10),
      db.select().from(scheduleItems)
        .where(and(
          eq(scheduleItems.userId, userId),
          eq(scheduleItems.status, "draft"),
          gte(scheduleItems.scheduledAt, new Date())
        ))
        .orderBy(scheduleItems.scheduledAt)
        .limit(10),
      db.select().from(learningInsights)
        .where(and(
          eq(learningInsights.userId, userId),
          gte(learningInsights.confidence, 0.7),
          gte(learningInsights.updatedAt, daysAgo(7))
        ))
        .orderBy(desc(learningInsights.confidence))
        .limit(5),
      storage.getSponsorshipDeals(userId, "pending"),
    ]);

    const actionItems: Array<{
      type: string;
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      source: string;
    }> = [];

    for (const test of pendingAbTests) {
      const hasEnoughData = (test.performanceA as any)?.views > 100 || (test.performanceB as any)?.views > 100;
      if (hasEnoughData) {
        actionItems.push({
          type: "ab_test_review",
          title: `Review A/B test results for video #${test.videoId}`,
          description: "This test has enough data to pick a winner. Review the results and select the best variant.",
          priority: "high",
          source: "ab_testing",
        });
      }
    }

    for (const item of pendingSchedule) {
      const hoursUntil = (new Date(item.scheduledAt!).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < 24 && hoursUntil > 0) {
        actionItems.push({
          type: "schedule_approval",
          title: `Approve scheduled content: ${item.title}`,
          description: `Scheduled for ${new Date(item.scheduledAt!).toLocaleDateString()}. Review and approve before it goes live.`,
          priority: "high",
          source: "schedule",
        });
      }
    }

    for (const insight of recentInsights) {
      if (insight.data?.recommendation) {
        actionItems.push({
          type: "insight_action",
          title: `Act on insight: ${insight.pattern}`,
          description: insight.data.recommendation,
          priority: (insight.confidence || 0) >= 0.85 ? "high" : "medium",
          source: "learning_engine",
        });
      }
    }

    for (const deal of pendingDeals) {
      actionItems.push({
        type: "sponsorship_review",
        title: `Review sponsorship: ${deal.brandName}`,
        description: `${deal.brandName} deal worth $${deal.dealValue || 0}. Needs your decision.`,
        priority: "high",
        source: "sponsorships",
      });
    }

    return actionItems.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  } catch (error) {
    console.error("Failed to process action items:", error);
    return [];
  }
}

export async function getContentDnaProfile(userId: string): Promise<{
  topFormats: string[];
  avgLength: number;
  bestHooks: string[];
  tonalPattern: string;
  visualStyle: string;
  audienceResponse: string;
  bestPostingTimes: string[];
  uniqueStrengths: string[];
  confidence: number;
  sampleSize: number;
}> {
  const defaultProfile = {
    topFormats: [],
    avgLength: 0,
    bestHooks: [],
    tonalPattern: "Still analyzing",
    visualStyle: "Not enough data",
    audienceResponse: "Not enough data",
    bestPostingTimes: [],
    uniqueStrengths: [],
    confidence: 0,
    sampleSize: 0,
  };

  try {
    const existing = await db.select().from(contentDnaProfiles)
      .where(eq(contentDnaProfiles.userId, userId))
      .orderBy(desc(contentDnaProfiles.lastUpdatedAt))
      .limit(1);

    const needsRefresh = !existing[0] || !existing[0].lastUpdatedAt ||
      (Date.now() - new Date(existing[0].lastUpdatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;

    if (!needsRefresh && existing[0]?.profileData) {
      return {
        ...defaultProfile,
        ...existing[0].profileData,
        confidence: existing[0].confidence || 0,
        sampleSize: existing[0].sampleSize || 0,
      };
    }

    const [userChannels, styleMemory, insights] = await Promise.all([
      storage.getChannelsByUser(userId),
      storage.getCreatorMemory(userId, "style_profile"),
      db.select().from(learningInsights)
        .where(eq(learningInsights.userId, userId))
        .orderBy(desc(learningInsights.confidence))
        .limit(20),
    ]);

    const channelIds = userChannels.map(c => c.id);
    let userVideos: any[] = [];
    if (channelIds.length > 0) {
      const allVideos = await db.select().from(videos).orderBy(desc(videos.createdAt)).limit(200);
      userVideos = allVideos.filter(v => v.channelId && channelIds.includes(v.channelId));
    }

    if (userVideos.length < 3) {
      return defaultProfile;
    }

    const videoSummary = userVideos.slice(0, 50).map(v => ({
      title: v.title,
      type: v.type,
      seoScore: v.metadata?.seoScore,
      views: v.metadata?.stats?.views || v.metadata?.viewCount,
      tags: v.metadata?.tags?.slice(0, 5),
    }));

    const styleSummary = styleMemory.map(m => `${m.key}: ${m.value}`).join("\n");
    const insightSummary = insights.map(i => `${i.category}: ${i.data?.finding}`).slice(0, 10).join("\n");

    const prompt = `Analyze this creator's content and build their Content DNA profile.

VIDEOS (${userVideos.length} total):
${JSON.stringify(videoSummary, null, 1)}

STYLE PROFILE:
${styleSummary || "Not analyzed yet"}

LEARNING INSIGHTS:
${insightSummary || "None yet"}

Generate a Content DNA profile as JSON:
{
  "topFormats": ["top 3 content formats this creator excels at"],
  "avgLength": estimated average video length in minutes,
  "bestHooks": ["3 hook patterns that work best for this creator"],
  "tonalPattern": "description of their tonal pattern",
  "visualStyle": "description of their visual style preferences",
  "audienceResponse": "how their audience typically responds",
  "bestPostingTimes": ["best times to post based on patterns"],
  "uniqueStrengths": ["3 unique strengths that differentiate this creator"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response for content DNA");

    const profileData = JSON.parse(content);
    const sampleSize = userVideos.length;
    const confidence = Math.min(0.95, 0.3 + (sampleSize / 100) * 0.6);

    if (existing[0]) {
      await db.update(contentDnaProfiles)
        .set({
          profileData,
          confidence,
          sampleSize,
          lastUpdatedAt: new Date(),
        })
        .where(eq(contentDnaProfiles.id, existing[0].id));
    } else {
      await db.insert(contentDnaProfiles).values({
        userId,
        profileData,
        confidence,
        sampleSize,
        lastUpdatedAt: new Date(),
      });
    }

    return { ...profileData, confidence, sampleSize };
  } catch (error) {
    console.error("Failed to build content DNA profile:", error);
    return defaultProfile;
  }
}
