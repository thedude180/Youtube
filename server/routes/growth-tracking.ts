import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, gte, lte, sql, asc } from "drizzle-orm";
import { requireAuth, asyncHandler } from "./helpers";
import { cached } from "../lib/cache";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
const logger = createLogger("growth-tracking");
import {
  channelGrowthTracking, analyticsSnapshots, channels, videos,
  autopilotQueue, streamPipelines, channelBaselineSnapshots
} from "@shared/schema";

export function registerGrowthTrackingRoutes(app: Express) {

  app.get("/api/growth/impact", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const range = (req.query.range as string) || "30d";
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "6m": 180, "1y": 365 };
    const days = daysMap[range] || 30;

    const result = await cached(`growth-impact:${userId}:${range}`, 60, async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const snapshots = await db.select().from(channelGrowthTracking)
        .where(and(
          eq(channelGrowthTracking.userId, userId),
          gte(channelGrowthTracking.snapshotDate, since),
        ))
        .orderBy(channelGrowthTracking.snapshotDate)
        .limit(1000);

      if (snapshots.length > 0) {
        return formatGrowthData(snapshots, days);
      }

      const analyticsData = await db.select().from(analyticsSnapshots)
        .where(and(
          eq(analyticsSnapshots.userId, userId),
          gte(analyticsSnapshots.snapshotDate, since),
        ))
        .orderBy(analyticsSnapshots.snapshotDate)
        .limit(1000);

      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId));

      const totalOptimizations = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "completed"),
        ));

      const pipelineCount = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(streamPipelines)
        .where(and(
          eq(streamPipelines.userId, userId),
          eq(streamPipelines.status, "completed"),
        ));

      const optimizationCount = (totalOptimizations[0]?.count || 0) + (pipelineCount[0]?.count || 0);

      return generateProjectedData(analyticsData, userChannels, optimizationCount, days);
    });

    res.json(result);
  }));

  app.get("/api/growth/summary", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const result = await cached(`growth-summary:${userId}`, 120, async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId));

      const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
      const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);

      const completedOps = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "completed"),
        ));

      const completedPipelines = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(streamPipelines)
        .where(and(
          eq(streamPipelines.userId, userId),
          eq(streamPipelines.status, "completed"),
        ));

      const recentSnapshots = await db.select().from(analyticsSnapshots)
        .where(and(
          eq(analyticsSnapshots.userId, userId),
          gte(analyticsSnapshots.snapshotDate, thirtyDaysAgo),
        ))
        .orderBy(analyticsSnapshots.snapshotDate)
        .limit(2);

      let viewsGrowth = 0;
      let subsGrowth = 0;
      if (recentSnapshots.length >= 2) {
        const first = recentSnapshots[0].metrics;
        const last = recentSnapshots[recentSnapshots.length - 1].metrics;
        viewsGrowth = first.totalViews > 0
          ? Math.round(((last.totalViews - first.totalViews) / first.totalViews) * 100)
          : 0;
        subsGrowth = first.totalSubscribers > 0
          ? Math.round(((last.totalSubscribers - first.totalSubscribers) / first.totalSubscribers) * 100)
          : 0;
      }

      return {
        totalViews,
        totalSubscribers: totalSubs,
        totalOptimizations: (completedOps[0]?.count || 0) + (completedPipelines[0]?.count || 0),
        connectedPlatforms: userChannels.length,
        viewsGrowth,
        subsGrowth,
        estimatedImpact: {
          viewsMultiplier: Math.max(1, 1 + (completedOps[0]?.count || 0) * 0.02),
          subsMultiplier: Math.max(1, 1 + (completedPipelines[0]?.count || 0) * 0.015),
          revenueMultiplier: Math.max(1, 1 + ((completedOps[0]?.count || 0) + (completedPipelines[0]?.count || 0)) * 0.01),
        },
      };
    });

    res.json(result);
  }));

  app.post("/api/growth/snapshot", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const userChannels = await db.select().from(channels)
      .where(eq(channels.userId, userId));

    const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
    const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);

    const completedOps = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "completed"),
      ));

    const existing = await db.select().from(channelGrowthTracking)
      .where(eq(channelGrowthTracking.userId, userId))
      .orderBy(channelGrowthTracking.snapshotDate)
      .limit(1);

    const baselineViews = existing.length > 0 ? existing[0].baselineViews || 0 : totalViews;
    const baselineSubs = existing.length > 0 ? existing[0].baselineSubscribers || 0 : totalSubs;

    const [snapshot] = await db.insert(channelGrowthTracking).values({
      userId,
      snapshotDate: new Date(),
      baselineViews,
      baselineSubscribers: baselineSubs,
      actualViews: totalViews,
      actualSubscribers: totalSubs,
      aiOptimizationsApplied: completedOps[0]?.count || 0,
      projectedViews: Math.round(baselineViews * 1.02),
      projectedSubscribers: Math.round(baselineSubs * 1.005),
    }).returning();

    res.json(snapshot);
  }));

  app.get("/api/growth/channels", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const result = await cached(`growth-channels:${userId}`, 60, async () => {
      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId));

      if (userChannels.length === 0) {
        return { channels: [] };
      }

      const channelTimelines = [];

      for (const ch of userChannels) {
        const snapshots = await db.select().from(channelBaselineSnapshots)
          .where(eq(channelBaselineSnapshots.channelId, ch.id))
          .orderBy(asc(channelBaselineSnapshots.snapshotDate))
          .limit(500);

        const baseline = snapshots.find(s => s.snapshotType === "baseline");
        const periodic = snapshots.filter(s => s.snapshotType === "periodic");
        const latest = periodic.length > 0 ? periodic[periodic.length - 1] : baseline;

        const connectedDate = ch.createdAt || baseline?.snapshotDate || new Date();

        const viewsDelta = baseline && latest
          ? (latest.views || 0) - (baseline.views || 0)
          : 0;
        const subsDelta = baseline && latest
          ? (latest.subscribers || 0) - (baseline.subscribers || 0)
          : 0;
        const viewsPct = baseline && (baseline.views || 0) > 0
          ? Math.round((viewsDelta / (baseline.views || 1)) * 100)
          : 0;
        const subsPct = baseline && (baseline.subscribers || 0) > 0
          ? Math.round((subsDelta / (baseline.subscribers || 1)) * 100)
          : 0;

        const milestones: string[] = [];
        for (const s of periodic) {
          if (s.metadata && (s.metadata as any).milestones) {
            milestones.push(...(s.metadata as any).milestones);
          }
        }

        const timeline = snapshots.map(s => ({
          date: new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          rawDate: s.snapshotDate,
          type: s.snapshotType,
          views: s.views || 0,
          subscribers: s.subscribers || 0,
          videoCount: s.videoCount || 0,
          avgViewsPerVideo: s.avgViewsPerVideo || 0,
          optimizations: s.aiOptimizationsAtSnapshot || 0,
        }));

        channelTimelines.push({
          channelId: ch.id,
          channelName: ch.channelName,
          platform: ch.platform,
          connectedDate: new Date(connectedDate).toISOString(),
          current: {
            views: ch.viewCount || 0,
            subscribers: ch.subscriberCount || 0,
            videoCount: ch.videoCount || 0,
          },
          baseline: baseline ? {
            views: baseline.views || 0,
            subscribers: baseline.subscribers || 0,
            videoCount: baseline.videoCount || 0,
          } : null,
          delta: {
            views: viewsDelta,
            subscribers: subsDelta,
            viewsPct,
            subsPct,
          },
          milestones: Array.from(new Set(milestones)),
          timeline,
          totalSnapshots: snapshots.length,
          lastOptimizations: latest?.aiOptimizationsAtSnapshot || 0,
        });
      }

      return { channels: channelTimelines };
    });

    res.json(result);
  }));

  app.get("/api/growth/trajectory", asyncHandler(async (req, res) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const result = await cached(`growth-trajectory:${userId}`, 300, async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const userChannels = await db.select().from(channels)
        .where(eq(channels.userId, userId));

      const snapshots = await db.select().from(channelGrowthTracking)
        .where(and(
          eq(channelGrowthTracking.userId, userId),
          gte(channelGrowthTracking.snapshotDate, ninetyDaysAgo),
        ))
        .orderBy(asc(channelGrowthTracking.snapshotDate))
        .limit(500);

      const baselineSnapshots = await db.select().from(channelBaselineSnapshots)
        .where(and(
          eq(channelBaselineSnapshots.userId, userId),
          gte(channelBaselineSnapshots.snapshotDate, ninetyDaysAgo),
        ))
        .orderBy(asc(channelBaselineSnapshots.snapshotDate))
        .limit(500);

      const completedOps = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "completed"),
        ));

      const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
      const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
      const totalVideos = userChannels.reduce((s, c) => s + (c.videoCount || 0), 0);
      const optimizations = completedOps[0]?.count || 0;

      const viewsTimeline: number[] = [];
      const subsTimeline: number[] = [];
      const dateLabels: string[] = [];

      if (snapshots.length >= 3) {
        for (const s of snapshots) {
          viewsTimeline.push(s.actualViews || 0);
          subsTimeline.push(s.actualSubscribers || 0);
          dateLabels.push(new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        }
      } else if (baselineSnapshots.length >= 3) {
        for (const s of baselineSnapshots) {
          viewsTimeline.push(s.views || 0);
          subsTimeline.push(s.subscribers || 0);
          dateLabels.push(new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        }
      }

      const growthRates = computeGrowthRates(viewsTimeline);
      const subsGrowthRates = computeGrowthRates(subsTimeline);
      const plateau = detectPlateau(growthRates);
      const subsPlateau = detectPlateau(subsGrowthRates);
      const inflection = predictInflection(viewsTimeline, growthRates, optimizations, totalVideos);

      const curveData = buildTrajectoryData(viewsTimeline, subsTimeline, dateLabels, totalViews, totalSubs, optimizations, totalVideos);

      let aiInsights = null;
      try {
        const openai = getOpenAIClient();
        const prompt = buildTrajectoryPrompt({
          totalViews, totalSubs, totalVideos, optimizations,
          growthRates, subsGrowthRates,
          plateau, subsPlateau, inflection,
          channelCount: userChannels.length,
          platforms: userChannels.map(c => c.platform),
        });

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1200,
          temperature: 0.7,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            aiInsights = {
              inflectionAnalysis: typeof parsed.inflectionAnalysis === "string" ? parsed.inflectionAnalysis : "Analysis unavailable.",
              plateauBreakers: Array.isArray(parsed.plateauBreakers) ? parsed.plateauBreakers.slice(0, 5).map((b: any) => ({
                title: String(b.title || "Strategy"),
                description: String(b.description || ""),
                impact: ["high", "medium", "low"].includes(b.impact) ? b.impact : "medium",
                timeframe: String(b.timeframe || "1-2 weeks"),
              })) : [],
              growthAccelerators: Array.isArray(parsed.growthAccelerators) ? parsed.growthAccelerators.slice(0, 5).map(String) : [],
              riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors.slice(0, 4).map(String) : [],
              nextMilestone: parsed.nextMilestone && typeof parsed.nextMilestone === "object" ? {
                metric: String(parsed.nextMilestone.metric || "views"),
                target: Number(parsed.nextMilestone.target) || 10000,
                estimatedDays: Number(parsed.nextMilestone.estimatedDays) || 30,
                description: String(parsed.nextMilestone.description || "Growth milestone"),
              } : { metric: "views", target: totalViews * 2 || 10000, estimatedDays: 60, description: "Double your current views" },
            };
          } catch (parseErr: any) {
            logger.error("Failed to parse AI trajectory response", { error: parseErr.message });
          }
        }
      } catch (err: any) {
        logger.error("Failed to get AI trajectory insights", { error: err.message });
      }

      return {
        currentMetrics: { totalViews, totalSubs, totalVideos, optimizations, channelCount: userChannels.length },
        trajectory: curveData,
        inflection,
        plateau: {
          views: plateau,
          subscribers: subsPlateau,
        },
        aiInsights,
      };
    });

    res.json(result);
  }));
}

function computeGrowthRates(values: number[]): number[] {
  const rates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev > 0) {
      rates.push((values[i] - prev) / prev);
    } else {
      rates.push(values[i] > 0 ? 1 : 0);
    }
  }
  return rates;
}

function detectPlateau(growthRates: number[]): {
  detected: boolean;
  severity: "none" | "mild" | "moderate" | "severe";
  durationDays: number;
  avgGrowthRate: number;
} {
  if (growthRates.length < 3) {
    return { detected: false, severity: "none", durationDays: 0, avgGrowthRate: 0 };
  }

  const recentRates = growthRates.slice(-7);
  const avgRate = recentRates.reduce((a, b) => a + b, 0) / recentRates.length;

  let plateauDays = 0;
  for (let i = growthRates.length - 1; i >= 0; i--) {
    if (Math.abs(growthRates[i]) < 0.005) {
      plateauDays++;
    } else {
      break;
    }
  }

  let severity: "none" | "mild" | "moderate" | "severe" = "none";
  if (plateauDays >= 14) severity = "severe";
  else if (plateauDays >= 7) severity = "moderate";
  else if (plateauDays >= 3) severity = "mild";

  return {
    detected: plateauDays >= 3,
    severity,
    durationDays: plateauDays,
    avgGrowthRate: Math.round(avgRate * 10000) / 100,
  };
}

function predictInflection(
  viewsTimeline: number[],
  growthRates: number[],
  optimizations: number,
  totalVideos: number,
): {
  predicted: boolean;
  estimatedDays: number | null;
  estimatedDate: string | null;
  confidence: number;
  currentPhase: string;
  phaseDescription: string;
} {
  const avgRate = growthRates.length > 0
    ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length
    : 0;

  const recentRate = growthRates.length >= 3
    ? growthRates.slice(-3).reduce((a, b) => a + b, 0) / 3
    : avgRate;

  const acceleration = growthRates.length >= 5
    ? (growthRates.slice(-3).reduce((a, b) => a + b, 0) / 3) -
      (growthRates.slice(-6, -3).reduce((a, b) => a + b, 0) / Math.min(3, growthRates.slice(-6, -3).length || 1))
    : 0;

  let currentPhase = "Building Foundation";
  let phaseDescription = "Growing your content library and audience base";

  if (recentRate > 0.05) {
    currentPhase = "Explosive Growth";
    phaseDescription = "You've hit the inflection point - growth is compounding rapidly";
  } else if (recentRate > 0.02) {
    currentPhase = "Acceleration";
    phaseDescription = "Growth is picking up speed - algorithm is noticing your consistency";
  } else if (recentRate > 0.005) {
    currentPhase = "Momentum Building";
    phaseDescription = "Steady upward trend - keep pushing content to trigger the algorithm";
  } else if (recentRate < -0.005) {
    currentPhase = "Recovery Needed";
    phaseDescription = "Growth has dipped - time to refresh strategy and increase output";
  }

  const contentVelocityFactor = Math.min(1, totalVideos / 50);
  const optimizationFactor = Math.min(1, optimizations / 100);
  const consistencyFactor = Math.min(1, viewsTimeline.length / 30);

  let readiness = (contentVelocityFactor * 0.35 + optimizationFactor * 0.25 + consistencyFactor * 0.2 + Math.min(1, recentRate * 20) * 0.2);
  readiness = Math.round(readiness * 100) / 100;

  let estimatedDays: number | null = null;
  if (readiness < 0.9 && currentPhase !== "Explosive Growth") {
    if (acceleration > 0) {
      estimatedDays = Math.max(7, Math.round((1 - readiness) * 120 / Math.max(0.01, acceleration * 10 + recentRate * 5)));
    } else {
      estimatedDays = Math.max(14, Math.round((1 - readiness) * 180));
    }
    estimatedDays = Math.min(estimatedDays, 365);
  }

  const estimatedDate = estimatedDays
    ? new Date(Date.now() + estimatedDays * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return {
    predicted: estimatedDays !== null,
    estimatedDays,
    estimatedDate,
    confidence: Math.round(readiness * 100),
    currentPhase,
    phaseDescription,
  };
}

function buildTrajectoryData(
  viewsTimeline: number[],
  subsTimeline: number[],
  dateLabels: string[],
  currentViews: number,
  currentSubs: number,
  optimizations: number,
  totalVideos: number,
) {
  const historical: { date: string; views: number; subscribers: number; type: "historical" }[] = [];

  if (viewsTimeline.length > 0) {
    for (let i = 0; i < viewsTimeline.length; i++) {
      historical.push({
        date: dateLabels[i] || `Day ${i + 1}`,
        views: viewsTimeline[i],
        subscribers: subsTimeline[i] || 0,
        type: "historical",
      });
    }
  } else {
    const baseViews = Math.max(1, currentViews);
    const baseSubs = Math.max(1, currentSubs);
    for (let i = 30; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const factor = 1 - (i * 0.008);
      historical.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        views: Math.round(baseViews * Math.max(0.7, factor)),
        subscribers: Math.round(baseSubs * Math.max(0.85, factor)),
        type: "historical",
      });
    }
  }

  const last = historical[historical.length - 1];
  const baseGrowth = 0.003;
  const aiBoost = Math.min(0.04, optimizations * 0.001 + totalVideos * 0.0005);
  const projected: { date: string; projectedViews: number; projectedSubs: number; inflectionViews: number; inflectionSubs: number; type: "projected" }[] = [];

  for (let i = 1; i <= 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);

    const compoundFactor = Math.pow(1 + baseGrowth + aiBoost, i);
    const inflectionFactor = Math.pow(1 + baseGrowth + aiBoost * 2, i);

    projected.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      projectedViews: Math.round(last.views * compoundFactor),
      projectedSubs: Math.round(last.subscribers * compoundFactor),
      inflectionViews: Math.round(last.views * inflectionFactor),
      inflectionSubs: Math.round(last.subscribers * inflectionFactor),
      type: "projected",
    });
  }

  return { historical, projected };
}

function buildTrajectoryPrompt(data: {
  totalViews: number;
  totalSubs: number;
  totalVideos: number;
  optimizations: number;
  growthRates: number[];
  subsGrowthRates: number[];
  plateau: ReturnType<typeof detectPlateau>;
  subsPlateau: ReturnType<typeof detectPlateau>;
  inflection: ReturnType<typeof predictInflection>;
  channelCount: number;
  platforms: string[];
}): string {
  return `You are a YouTube growth strategist AI. Analyze this creator's growth data and provide actionable insights.

CHANNEL DATA:
- Total Views: ${data.totalViews.toLocaleString()}
- Total Subscribers: ${data.totalSubs.toLocaleString()}
- Total Videos: ${data.totalVideos}
- AI Optimizations Applied: ${data.optimizations}
- Connected Platforms: ${data.platforms.join(", ") || "None"}
- Current Growth Phase: ${data.inflection.currentPhase}
- Views Growth Rate (recent): ${data.growthRates.slice(-3).map(r => (r * 100).toFixed(1) + "%").join(", ") || "N/A"}
- Subs Growth Rate (recent): ${data.subsGrowthRates.slice(-3).map(r => (r * 100).toFixed(1) + "%").join(", ") || "N/A"}
- Views Plateau: ${data.plateau.detected ? `Yes (${data.plateau.severity}, ${data.plateau.durationDays} days)` : "No"}
- Subs Plateau: ${data.subsPlateau.detected ? `Yes (${data.subsPlateau.severity}, ${data.subsPlateau.durationDays} days)` : "No"}
- Predicted Inflection: ${data.inflection.predicted ? `${data.inflection.estimatedDays} days (${data.inflection.confidence}% readiness)` : "Already in explosive growth"}

Respond in JSON with this exact structure:
{
  "inflectionAnalysis": "2-3 sentence analysis of when and why the inflection point will happen",
  "plateauBreakers": [
    {"title": "short action title", "description": "1-2 sentence specific actionable strategy", "impact": "high|medium|low", "timeframe": "immediate|1-2 weeks|1 month"},
    {"title": "short action title", "description": "1-2 sentence specific actionable strategy", "impact": "high|medium|low", "timeframe": "immediate|1-2 weeks|1 month"},
    {"title": "short action title", "description": "1-2 sentence specific actionable strategy", "impact": "high|medium|low", "timeframe": "immediate|1-2 weeks|1 month"}
  ],
  "growthAccelerators": [
    "specific action that will speed up reaching inflection",
    "specific action that will speed up reaching inflection",
    "specific action that will speed up reaching inflection"
  ],
  "riskFactors": ["potential risk to growth", "potential risk to growth"],
  "nextMilestone": {"metric": "views or subscribers", "target": number, "estimatedDays": number, "description": "what hitting this milestone means"}
}`;
}

function formatGrowthData(snapshots: any[], days: number) {
  const chartData = snapshots.map(s => ({
    date: new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    rawDate: s.snapshotDate,
    baselineViews: s.baselineViews || 0,
    actualViews: s.actualViews || 0,
    projectedViews: s.projectedViews || 0,
    baselineSubscribers: s.baselineSubscribers || 0,
    actualSubscribers: s.actualSubscribers || 0,
    projectedSubscribers: s.projectedSubscribers || 0,
    baselineRevenue: s.baselineRevenue || 0,
    actualRevenue: s.actualRevenue || 0,
    projectedRevenue: s.projectedRevenue || 0,
    optimizations: s.aiOptimizationsApplied || 0,
  }));

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const viewsLift = first.baselineViews > 0
    ? Math.round(((last.actualViews - last.baselineViews) / first.baselineViews) * 100)
    : 0;
  const subsLift = first.baselineSubscribers > 0
    ? Math.round(((last.actualSubscribers - last.baselineSubscribers) / first.baselineSubscribers) * 100)
    : 0;

  return {
    chartData,
    summary: {
      viewsLift,
      subsLift,
      totalOptimizations: last.optimizations,
      dataPoints: chartData.length,
      range: `${days}d`,
    },
  };
}

function generateProjectedData(analyticsData: any[], userChannels: any[], optimizationCount: number, days: number) {
  const totalViews = userChannels.reduce((s: number, c: any) => s + (c.viewCount || 0), 0);
  const totalSubs = userChannels.reduce((s: number, c: any) => s + (c.subscriberCount || 0), 0);

  const dataPoints = Math.min(days, 30);
  const chartData = [];
  const now = new Date();

  const baseGrowthRate = 0.003;
  const aiBoostRate = Math.min(0.05, optimizationCount * 0.002);

  for (let i = dataPoints; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const dayIndex = dataPoints - i;
    const progress = dayIndex / dataPoints;

    const baselineMultiplier = 1 + (baseGrowthRate * dayIndex);
    const aiMultiplier = 1 + ((baseGrowthRate + aiBoostRate) * dayIndex);
    const projectedMultiplier = 1 + ((baseGrowthRate + aiBoostRate * 1.5) * dayIndex);

    const startViews = Math.max(0, totalViews - Math.round(totalViews * aiBoostRate * dataPoints * 0.5));
    const startSubs = Math.max(0, totalSubs - Math.round(totalSubs * aiBoostRate * dataPoints * 0.3));

    chartData.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      rawDate: date.toISOString(),
      baselineViews: Math.round(startViews * baselineMultiplier),
      actualViews: Math.round(startViews * aiMultiplier),
      projectedViews: Math.round(startViews * projectedMultiplier),
      baselineSubscribers: Math.round(startSubs * baselineMultiplier),
      actualSubscribers: Math.round(startSubs * aiMultiplier),
      projectedSubscribers: Math.round(startSubs * projectedMultiplier),
      baselineRevenue: Math.round(startViews * baselineMultiplier * 0.003),
      actualRevenue: Math.round(startViews * aiMultiplier * 0.004),
      projectedRevenue: Math.round(startViews * projectedMultiplier * 0.005),
      optimizations: Math.round(optimizationCount * progress),
    });
  }

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const viewsLift = first.baselineViews > 0
    ? Math.round(((last.actualViews - last.baselineViews) / first.baselineViews) * 100)
    : 0;
  const subsLift = first.baselineSubscribers > 0
    ? Math.round(((last.actualSubscribers - last.baselineSubscribers) / first.baselineSubscribers) * 100)
    : 0;

  return {
    chartData,
    summary: {
      viewsLift,
      subsLift,
      totalOptimizations: optimizationCount,
      dataPoints: chartData.length,
      range: `${days}d`,
    },
  };
}
