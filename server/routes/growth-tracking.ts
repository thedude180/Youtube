import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, gte, lte, sql, asc } from "drizzle-orm";
import { requireAuth, asyncHandler } from "./helpers";
import { cached } from "../lib/cache";
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
