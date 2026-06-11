/**
 * Shadow Analytics Engine
 *
 * Replicates YouTube Analytics without burning the 10k/day Data API quota.
 *
 * Tier 1 — InnerTube (public, no auth, every 4h):
 *   views, likes, comment count, subscriber count
 *   + velocity windows (24h / 7d / 28d) derived from momentum snapshot history
 *
 * Tier 2 — YouTube Studio API (OAuth token, zero Data API quota, every 6h):
 *   watch time, avg view duration, avg view %, impressions, CTR,
 *   subscribers gained, shares, revenue, traffic sources
 *
 * Tier 3 — Official Analytics API (Data API quota, 1 unit/call):
 *   spot-check verification for top 5 performers, max once per 12h
 */

import { db } from "../db";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import {
  shadowVideoAnalytics,
  shadowChannelAnalytics,
  trackedVideos,
  videoMomentumSnapshots,
  channels,
  autopilotQueue,
  ShadowVideoAnalytics,
} from "@shared/schema";
import { logger } from "../lib/logger";
import { isQuotaBreakerTripped } from "../services/youtube-quota-tracker";
import { fetchVideoAnalytics } from "../services/youtube-analytics";
import { storage } from "../storage";

// ── Constants ─────────────────────────────────────────────────────────────────
const SWEEP_INTERVAL_MS  = 4 * 60 * 60_000;  // every 4h
const STUDIO_INTERVAL_MS = 6 * 60 * 60_000;  // studio sweep every 6h
const VERIFY_INTERVAL_MS = 12 * 60 * 60_000; // verification every 12h
const INITIAL_DELAY_MS   = 8 * 60_000;       // first sweep at T+8min after wiring

const STUDIO_URL = "https://studio.youtube.com/youtubei/v1/analytics/query?alt=json";
const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/browse";
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

// Per-user cooldowns so we don't hammer Studio API
const _lastStudioSweep  = new Map<string, number>();
const _lastVerifySweep  = new Map<string, number>();

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudioRow {
  youtubeVideoId:        string;
  watchTimeMinutes:      number | null;
  averageViewDurationSec:number | null;
  averageViewPercent:    number | null;
  impressions:           number | null;
  impressionsCtr:        number | null;
  subscribersGained:     number | null;
  shares:                number | null;
  estimatedRevenue:      number | null;
  trafficSources:        Record<string, number> | null;
}

interface InnerTubeChannel {
  subscriberCount: number | null;
  videoCount:      number | null;
}

// ── Tier 2: YouTube Studio API ────────────────────────────────────────────────
async function fetchStudioVideoMetrics(
  accessToken:   string,
  ytChannelId:   string,
  lookbackDays:  number = 90,
): Promise<StudioRow[]> {
  const now  = new Date();
  const from = new Date(now.getTime() - lookbackDays * 86_400_000);

  const fmt = (d: Date) => ({
    year:  d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day:   d.getUTCDate(),
  });

  const body = {
    context: {
      client: {
        clientName: "WEB_CREATOR",
        clientVersion: "1.20240601.01.00",
        hl: "en",
      },
    },
    dimensions: [{ name: "VIDEO" }],
    metrics: [
      { name: "VIEWS" },
      { name: "WATCH_TIME" },
      { name: "AVERAGE_VIEW_DURATION" },
      { name: "AVERAGE_VIEW_PERCENTAGE" },
      { name: "VIDEO_THUMBNAIL_IMPRESSIONS" },
      { name: "VIDEO_THUMBNAIL_IMPRESSIONS_VPH" },
      { name: "LIKES" },
      { name: "COMMENTS" },
      { name: "SHARES" },
      { name: "SUBSCRIBERS_NET_CHANGE" },
      { name: "ESTIMATED_PARTNER_REVENUE" },
    ],
    restricts: [{
      anyFilters: [{
        inListFilter: {
          dimensionName: "CHANNEL",
          values: [ytChannelId],
        },
      }],
    }],
    dateRange: {
      inclusiveStartDate: fmt(from),
      exclusiveEndDate:   fmt(new Date(now.getTime() + 86_400_000)),
    },
    pageSize: 100,
    orderBy: [{ metricName: "VIEWS", direction: "ANALYTICS_QUERY_SORT_DIRECTION_DESCENDING" }],
  };

  try {
    const res = await fetch(STUDIO_URL, {
      method: "POST",
      headers: {
        Authorization:                `Bearer ${accessToken}`,
        "Content-Type":               "application/json",
        "Origin":                     "https://studio.youtube.com",
        "X-Youtube-Client-Name":      "62",
        "X-Youtube-Client-Version":   "1.20240601.01.00",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      logger.warn(`[ShadowAnalytics] Studio API ${res.status} for channel ${ytChannelId}`);
      return [];
    }

    const data = await res.json() as any;

    // Parse response — Studio API returns columnReportHeader + rows
    const metricHeaders: string[] =
      data?.header?.columnReportHeader?.metricHeaders?.map((h: any) => h.name) ?? [];
    const dimHeaders: string[] =
      data?.header?.columnReportHeader?.dimensionHeaders?.map((h: any) => h.name) ?? [];

    if (!metricHeaders.length || !data?.rows?.length) {
      logger.info(`[ShadowAnalytics] Studio API returned no rows for ${ytChannelId}`);
      return [];
    }

    const idxOf = (name: string) => metricHeaders.indexOf(name);
    const mv = (row: any, name: string): number | null => {
      const i = idxOf(name);
      if (i < 0) return null;
      const v = row.metricValues?.[i];
      if (v == null || v === "") return null;
      const n = parseFloat(String(v));
      return isNaN(n) ? null : n;
    };

    const rows: StudioRow[] = [];
    for (const row of data.rows) {
      // Dimension value is typically "channelId/videoId" or just "videoId"
      const dimRaw: string = row.dimensionValues?.[0] ?? "";
      const videoId = dimRaw.includes("/") ? dimRaw.split("/").pop()! : dimRaw;
      if (!videoId) continue;

      rows.push({
        youtubeVideoId:        videoId,
        watchTimeMinutes:      mv(row, "WATCH_TIME"),
        averageViewDurationSec:mv(row, "AVERAGE_VIEW_DURATION"),
        averageViewPercent:    mv(row, "AVERAGE_VIEW_PERCENTAGE"),
        impressions:           mv(row, "VIDEO_THUMBNAIL_IMPRESSIONS"),
        impressionsCtr:        mv(row, "VIDEO_THUMBNAIL_IMPRESSIONS_VPH"),
        subscribersGained:     mv(row, "SUBSCRIBERS_NET_CHANGE"),
        shares:                mv(row, "SHARES"),
        estimatedRevenue:      mv(row, "ESTIMATED_PARTNER_REVENUE"),
        trafficSources:        null, // separate call needed for traffic breakdown
      });
    }

    logger.info(`[ShadowAnalytics] Studio API returned ${rows.length} video rows`);
    return rows;
  } catch (err: any) {
    logger.warn(`[ShadowAnalytics] Studio API error: ${err.message}`);
    return [];
  }
}

// ── Tier 1: Channel subscriber count via InnerTube ────────────────────────────
async function fetchChannelPublicStats(ytChannelId: string): Promise<InnerTubeChannel> {
  try {
    const res = await fetch(`${INNERTUBE_URL}?key=${INNERTUBE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240601.00.00" } },
        browseId: ytChannelId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { subscriberCount: null, videoCount: null };
    const data = await res.json() as any;
    const header = data?.header?.c4TabbedHeaderRenderer
                ?? data?.header?.pageHeaderRenderer;
    const subText: string =
      header?.subscriberCountText?.simpleText
      ?? header?.subscribeButton?.subscribeButtonRenderer?.subscriberCountText?.simpleText
      ?? "";
    // Parse "6.14K subscribers" → 6140
    let subscriberCount: number | null = null;
    const subMatch = subText.replace(/,/g, "").match(/([\d.]+)\s*([KMB]?)/i);
    if (subMatch) {
      const n = parseFloat(subMatch[1]);
      const mult = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[subMatch[2].toUpperCase()] ?? 1;
      subscriberCount = Math.round(n * mult);
    }
    return { subscriberCount, videoCount: null };
  } catch {
    return { subscriberCount: null, videoCount: null };
  }
}

// ── Velocity windows from InnerTube snapshot history ─────────────────────────
async function computeVelocityWindows(userId: string, youtubeVideoId: string): Promise<{
  velocity24h:     number;
  velocity7d:      number;
  velocity28d:     number;
  velocityPerHour: number;
  engagementRate:  number;
  currentViews:    number;
  currentLikes:    number;
  currentComments: number;
}> {
  const snapshots = await db
    .select()
    .from(videoMomentumSnapshots)
    .where(and(
      eq(videoMomentumSnapshots.userId, userId),
      eq(videoMomentumSnapshots.youtubeVideoId, youtubeVideoId),
    ))
    .orderBy(desc(videoMomentumSnapshots.snapshotAt))
    .limit(100);

  if (!snapshots.length) {
    return { velocity24h: 0, velocity7d: 0, velocity28d: 0, velocityPerHour: 0, engagementRate: 0, currentViews: 0, currentLikes: 0, currentComments: 0 };
  }

  const latest = snapshots[0];
  const now    = Date.now();

  const viewsAt = (msAgo: number): number => {
    const target = now - msAgo;
    const snap   = snapshots.find(s => s.snapshotAt && s.snapshotAt.getTime() <= target);
    return snap?.viewCount ?? 0;
  };

  const v24h  = Math.max(0, latest.viewCount - viewsAt(24 * 3_600_000));
  const v7d   = Math.max(0, latest.viewCount - viewsAt(7 * 86_400_000));
  const v28d  = Math.max(0, latest.viewCount - viewsAt(28 * 86_400_000));

  // Velocity per hour from most recent two snapshots
  let velocityPerHour = 0;
  if (snapshots.length >= 2 && snapshots[1].snapshotAt) {
    const hrs = (now - snapshots[1].snapshotAt.getTime()) / 3_600_000;
    if (hrs >= 0.1) {
      velocityPerHour = (latest.viewCount - snapshots[1].viewCount) / hrs;
    }
  }

  const engagement = latest.viewCount > 0
    ? ((latest.likeCount ?? 0) + (latest.commentCount ?? 0)) / latest.viewCount
    : 0;

  return {
    velocity24h:     v24h,
    velocity7d:      v7d,
    velocity28d:     v28d,
    velocityPerHour: Math.max(0, velocityPerHour),
    engagementRate:  Math.min(1, Math.max(0, engagement)),
    currentViews:    latest.viewCount,
    currentLikes:    latest.likeCount ?? 0,
    currentComments: latest.commentCount ?? 0,
  };
}

// ── Tier 3: Verify top performers with official Analytics API ─────────────────
async function verifyTopPerformers(
  userId:       string,
  channelUserId:string,
  videoIds:     string[],
): Promise<void> {
  const limited = videoIds.slice(0, 5);
  for (const videoId of limited) {
    try {
      if (isQuotaBreakerTripped()) {
        logger.info("[ShadowAnalytics] Quota breaker active — skipping verification");
        return;
      }

      const verData  = await fetchVideoAnalytics(channelUserId, videoId);
      const verViews = verData.views ?? null;
      const verWatch = verData.watchTimeMinutes ?? null;
      const verCtr   = verData.ctr ?? null;

      if (verViews === null) continue;

      const existing = await db
        .select({ views: shadowVideoAnalytics.views })
        .from(shadowVideoAnalytics)
        .where(and(
          eq(shadowVideoAnalytics.userId, userId),
          eq(shadowVideoAnalytics.youtubeVideoId, videoId),
        ))
        .limit(1);

      const shadowViews = existing[0]?.views ?? 0;
      const discrepancy = shadowViews > 0
        ? Math.abs(verViews - shadowViews) / shadowViews * 100
        : null;

      await db
        .update(shadowVideoAnalytics)
        .set({
          verifiedViews:       verViews,
          verifiedWatchTime:   verWatch,
          verifiedCtr:         verCtr,
          discrepancyPct:      discrepancy,
          analyticsVerifiedAt: new Date(),
        })
        .where(and(
          eq(shadowVideoAnalytics.userId, userId),
          eq(shadowVideoAnalytics.youtubeVideoId, videoId),
        ));

      logger.info(`[ShadowAnalytics] Verified ${videoId}: shadow=${shadowViews} official=${verViews} discrepancy=${discrepancy?.toFixed(1) ?? "?"}%`);
    } catch (err: any) {
      logger.warn(`[ShadowAnalytics] Verify error for ${videoId}: ${err.message}`);
    }
  }
}

// ── Collect all tracked video IDs for a user ──────────────────────────────────
async function collectVideoIds(userId: string): Promise<Array<{
  youtubeVideoId: string;
  contentType:    string;
  gameName:       string | null;
  title:          string | null;
  publishedAt:    Date | null;
}>> {
  const seen    = new Set<string>();
  const results: Array<{ youtubeVideoId: string; contentType: string; gameName: string | null; title: string | null; publishedAt: Date | null }> = [];

  const add = (v: { youtubeVideoId: string; contentType: string; gameName?: string | null; title?: string | null; publishedAt?: Date | null }) => {
    if (!v.youtubeVideoId || seen.has(v.youtubeVideoId)) return;
    seen.add(v.youtubeVideoId);
    results.push({ youtubeVideoId: v.youtubeVideoId, contentType: v.contentType, gameName: v.gameName ?? null, title: v.title ?? null, publishedAt: v.publishedAt ?? null });
  };

  // 1. From tracked_videos registry
  const registered = await db
    .select()
    .from(trackedVideos)
    .where(and(eq(trackedVideos.userId, userId), eq(trackedVideos.isActive, true)));
  for (const r of registered) add(r);

  // 2. From autopilot_queue (published items)
  const published = await db
    .select({
      youtubeVideoId: sql<string>`${autopilotQueue.metadata}->>'youtubeVideoId'`,
      youtubeId:      sql<string>`${autopilotQueue.metadata}->>'youtubeId'`,
      contentType:    autopilotQueue.type,
      gameName:       sql<string>`${autopilotQueue.metadata}->>'gameName'`,
      title:          sql<string>`${autopilotQueue.metadata}->>'title'`,
      publishedAt:    autopilotQueue.publishedAt,
    })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
    ))
    .orderBy(desc(autopilotQueue.publishedAt))
    .limit(200);

  for (const p of published) {
    const vid = p.youtubeVideoId || p.youtubeId;
    if (vid) {
      add({
        youtubeVideoId: vid,
        contentType:    p.contentType?.includes("short") ? "short" : "vod",
        gameName:       p.gameName,
        title:          p.title,
        publishedAt:    p.publishedAt,
      });
    }
  }

  return results;
}

// ── Main sweep ────────────────────────────────────────────────────────────────
export async function runShadowAnalyticsSweep(userId: string): Promise<void> {
  logger.info(`[ShadowAnalytics] Starting sweep for user ${userId}`);
  const start = Date.now();

  // Get channel for Studio API access
  const userChannels = await storage.getChannelsByUser(userId);
  const channel = userChannels.find(c => c.accessToken && c.platform === "youtube")
               ?? userChannels.find(c => c.platform === "youtube");
  const accessToken   = channel?.accessToken ?? null;
  const ytChannelId   = channel?.channelId ?? null;

  // Tier 2: Studio API sweep (rate-limited to every 6h per user)
  let studioMap = new Map<string, StudioRow>();
  const lastStudio = _lastStudioSweep.get(userId) ?? 0;
  const doStudio   = accessToken && ytChannelId && (Date.now() - lastStudio > STUDIO_INTERVAL_MS);

  if (doStudio) {
    const studioRows = await fetchStudioVideoMetrics(accessToken!, ytChannelId!, 90);
    for (const r of studioRows) studioMap.set(r.youtubeVideoId, r);
    if (studioRows.length) _lastStudioSweep.set(userId, Date.now());
  }

  // Tier 1: Collect videos and compute velocity from snapshot history
  const videos = await collectVideoIds(userId);
  logger.info(`[ShadowAnalytics] Processing ${videos.length} videos`);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  let totalViews = 0, totalLikes = 0, totalComments = 0;
  let totalWatch = 0, totalImpressions = 0, totalSubs = 0;
  let ctrSum = 0, ctrCount = 0;
  let engagementSum = 0;

  const gainingSteamIds: string[] = [];

  for (const video of videos) {
    try {
      const vel = await computeVelocityWindows(userId, video.youtubeVideoId);
      const studio = studioMap.get(video.youtubeVideoId) ?? null;

      // Engagement rate (public)
      const engRate = vel.engagementRate;
      const isGaining = vel.velocityPerHour >= 5 && vel.velocity24h >= 10;

      // Composite performance score (0-100)
      // Weighted: velocity (40%) + engagement (30%) + watch% (20%) + CTR (10%)
      const watchPct = studio?.averageViewPercent ?? null;
      const ctr      = studio?.impressionsCtr ?? null;
      const perfScore = Math.min(100, Math.round(
        (Math.min(vel.velocityPerHour, 500) / 500) * 40
        + engRate * 100 * 0.3
        + (watchPct !== null ? (watchPct / 100) * 20 : 10)
        + (ctr !== null ? Math.min(ctr * 100, 20) : 5)
      ));

      const momentumScore = Math.min(100, Math.round(
        (vel.velocity24h / Math.max(vel.velocity7d / 7, 1)) * 50
        + (vel.velocityPerHour >= 10 ? 30 : vel.velocityPerHour >= 2 ? 15 : 0)
        + (isGaining ? 20 : 0)
      ));

      // Upsert into shadow_video_analytics
      const upsertData: Partial<ShadowVideoAnalytics> & { measuredAt: Date } = {
        userId,
        youtubeVideoId:        video.youtubeVideoId,
        contentType:           video.contentType,
        gameName:              video.gameName,
        title:                 video.title,
        publishedAt:           video.publishedAt,
        views:                 vel.currentViews,
        likes:                 vel.currentLikes,
        commentCount:          vel.currentComments,
        velocity24h:           vel.velocity24h,
        velocity7d:            vel.velocity7d,
        velocity28d:           vel.velocity28d,
        velocityPerHour:       vel.velocityPerHour,
        engagementRate:        engRate,
        publicDataAt:          now,
        performanceScore:      perfScore,
        momentumScore,
        measuredAt:            now,
      };

      if (studio) {
        upsertData.watchTimeMinutes       = studio.watchTimeMinutes ?? undefined;
        upsertData.averageViewDurationSec = studio.averageViewDurationSec ?? undefined;
        upsertData.averageViewPercent     = studio.averageViewPercent ?? undefined;
        upsertData.impressions            = studio.impressions != null ? Math.round(studio.impressions) : undefined;
        upsertData.impressionsCtr         = studio.impressionsCtr ?? undefined;
        upsertData.subscribersGained      = studio.subscribersGained != null ? Math.round(studio.subscribersGained) : undefined;
        upsertData.shares                 = studio.shares != null ? Math.round(studio.shares) : undefined;
        upsertData.estimatedRevenue       = studio.estimatedRevenue ?? undefined;
        upsertData.trafficSources         = studio.trafficSources ?? undefined;
        upsertData.studioDataAt           = now;
      }

      await db
        .insert(shadowVideoAnalytics)
        .values(upsertData as any)
        .onConflictDoUpdate({
          target: [shadowVideoAnalytics.userId, shadowVideoAnalytics.youtubeVideoId],
          set: upsertData as any,
        });

      // Accumulate channel rollup
      totalViews    += vel.currentViews;
      totalLikes    += vel.currentLikes;
      totalComments += vel.currentComments;
      engagementSum += engRate;
      if (studio?.watchTimeMinutes)  totalWatch       += studio.watchTimeMinutes;
      if (studio?.impressions)       totalImpressions += studio.impressions;
      if (studio?.subscribersGained) totalSubs        += studio.subscribersGained;
      if (studio?.impressionsCtr) { ctrSum += studio.impressionsCtr; ctrCount++; }
      if (isGaining) gainingSteamIds.push(video.youtubeVideoId);
    } catch (err: any) {
      logger.warn(`[ShadowAnalytics] Error processing ${video.youtubeVideoId}: ${err.message}`);
    }
  }

  // Channel-level public stats
  const channelStats = ytChannelId ? await fetchChannelPublicStats(ytChannelId) : { subscriberCount: null, videoCount: null };

  // Upsert channel daily rollup
  const channelRollup = {
    userId,
    date:                   today,
    subscriberCount:        channelStats.subscriberCount,
    totalVideoCount:        videos.length,
    totalViews,
    totalLikes,
    totalComments,
    newVideosPublished:     0,
    avgEngagementRate:      videos.length > 0 ? engagementSum / videos.length : 0,
    totalWatchTimeMinutes:  totalWatch > 0 ? totalWatch : undefined,
    totalImpressions:       totalImpressions > 0 ? totalImpressions : undefined,
    avgCtr:                 ctrCount > 0 ? ctrSum / ctrCount : undefined,
    subscribersGainedToday: totalSubs > 0 ? totalSubs : undefined,
    source:                 doStudio && studioMap.size > 0 ? "studio_api" : "innertube",
    createdAt:              now,
  };

  await db
    .insert(shadowChannelAnalytics)
    .values(channelRollup)
    .onConflictDoUpdate({
      target: [shadowChannelAnalytics.userId, shadowChannelAnalytics.date],
      set: channelRollup,
    });

  // Tier 3: Spot-check top performers if quota available and enough time has passed
  const lastVerify = _lastVerifySweep.get(userId) ?? 0;
  if (!isQuotaBreakerTripped() && gainingSteamIds.length > 0 && Date.now() - lastVerify > VERIFY_INTERVAL_MS) {
    _lastVerifySweep.set(userId, Date.now());
    verifyTopPerformers(userId, userId, gainingSteamIds).catch(e =>
      logger.warn(`[ShadowAnalytics] Verify failed: ${e.message}`)
    );
  }

  logger.info(`[ShadowAnalytics] Sweep complete for user ${userId} in ${Date.now() - start}ms — ${videos.length} videos, ${studioMap.size} with Studio data, ${gainingSteamIds.length} gaining steam`);
}

// ── Query functions ────────────────────────────────────────────────────────────
export async function getShadowAnalyticsLeaderboard(
  userId: string,
  limit  = 50,
): Promise<ShadowVideoAnalytics[]> {
  return db
    .select()
    .from(shadowVideoAnalytics)
    .where(eq(shadowVideoAnalytics.userId, userId))
    .orderBy(desc(shadowVideoAnalytics.performanceScore))
    .limit(limit);
}

export async function getChannelShadowAnalytics(
  userId: string,
  days   = 30,
): Promise<typeof shadowChannelAnalytics.$inferSelect[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select()
    .from(shadowChannelAnalytics)
    .where(and(
      eq(shadowChannelAnalytics.userId, userId),
      sql`${shadowChannelAnalytics.date} >= ${cutoff}`,
    ))
    .orderBy(desc(shadowChannelAnalytics.date))
    .limit(days);
}

export async function getVideoShadowDetail(
  userId:        string,
  youtubeVideoId:string,
): Promise<ShadowVideoAnalytics | null> {
  const rows = await db
    .select()
    .from(shadowVideoAnalytics)
    .where(and(
      eq(shadowVideoAnalytics.userId, userId),
      eq(shadowVideoAnalytics.youtubeVideoId, youtubeVideoId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function getShadowDataSourceReport(userId: string): Promise<{
  totalVideos:         number;
  withInnerTubeData:   number;
  withStudioData:      number;
  withVerifiedData:    number;
  studioCoverage:      number;
  lastSweepAt:         number | null;
  lastStudioAt:        number | null;
  lastVerifyAt:        number | null;
}> {
  const rows = await db
    .select()
    .from(shadowVideoAnalytics)
    .where(eq(shadowVideoAnalytics.userId, userId));

  return {
    totalVideos:       rows.length,
    withInnerTubeData: rows.filter(r => r.publicDataAt).length,
    withStudioData:    rows.filter(r => r.studioDataAt).length,
    withVerifiedData:  rows.filter(r => r.analyticsVerifiedAt).length,
    studioCoverage:    rows.length > 0
      ? Math.round(rows.filter(r => r.studioDataAt).length / rows.length * 100)
      : 0,
    lastSweepAt:   _lastStudioSweep.get(userId) ?? null,
    lastStudioAt:  _lastStudioSweep.get(userId) ?? null,
    lastVerifyAt:  _lastVerifySweep.get(userId) ?? null,
  };
}

// ── Boot init ─────────────────────────────────────────────────────────────────
export function initShadowAnalyticsEngine(): NodeJS.Timeout {
  const runAll = async () => {
    try {
      const channels = await db.execute(sql`
        SELECT DISTINCT user_id FROM channels WHERE platform = 'youtube' AND access_token IS NOT NULL
      `);
      for (const row of (channels as any).rows ?? []) {
        const uid = (row as any).user_id;
        if (uid) {
          await runShadowAnalyticsSweep(uid).catch(e =>
            logger.warn(`[ShadowAnalytics] Sweep failed for ${uid}: ${e.message}`)
          );
        }
      }
    } catch (err: any) {
      logger.error(`[ShadowAnalytics] Init sweep failed: ${err.message}`);
    }
  };

  const timer = setTimeout(async () => {
    await runAll();
    setInterval(runAll, SWEEP_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info(`[ShadowAnalytics] Engine registered — first sweep in ${INITIAL_DELAY_MS / 60_000}min`);
  return timer;
}
