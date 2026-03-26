import { db } from "../db";
import { revenueRecords, videos, streams } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

export interface AttributionLink {
  revenueRecordId: number;
  contentType: "video" | "stream" | "clip" | "unknown";
  contentId: number | null;
  contentTitle: string | null;
  platform: string;
  amount: number;
  confidence: number;
  method: "direct" | "inferred" | "proportional";
}

export interface AttributionGraph {
  userId: string;
  generatedAt: string;
  totalRevenue: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  attributionRate: number;
  links: AttributionLink[];
  byContent: Record<string, {
    contentType: string;
    contentId: number;
    title: string;
    totalRevenue: number;
    confidence: number;
    sources: string[];
  }>;
  byPlatform: Record<string, {
    totalRevenue: number;
    attributedRevenue: number;
    topContent: string | null;
  }>;
}

export async function buildAttributionGraph(userId: string): Promise<AttributionGraph> {
  const [records, userVideos, userStreams] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(200),
    db.select().from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(100),
  ]);

  const links: AttributionLink[] = [];
  let totalRevenue = 0;
  let attributedRevenue = 0;

  const byContent: AttributionGraph["byContent"] = {};
  const byPlatform: AttributionGraph["byPlatform"] = {};

  for (const record of records) {
    totalRevenue += record.amount || 0;

    if (!byPlatform[record.platform]) {
      byPlatform[record.platform] = { totalRevenue: 0, attributedRevenue: 0, topContent: null };
    }
    byPlatform[record.platform].totalRevenue += record.amount || 0;

    const meta = record.metadata as Record<string, unknown> | null;
    let linked = false;

    if (meta?.videoId && typeof meta.videoId === "number") {
      const video = userVideos.find(v => v.id === meta.videoId);
      if (video) {
        const link: AttributionLink = {
          revenueRecordId: record.id,
          contentType: "video",
          contentId: video.id,
          contentTitle: video.title,
          platform: record.platform,
          amount: record.amount,
          confidence: 0.95,
          method: "direct",
        };
        links.push(link);
        attributedRevenue += record.amount;
        byPlatform[record.platform].attributedRevenue += record.amount;
        linked = true;

        const key = `video-${video.id}`;
        if (!byContent[key]) {
          byContent[key] = {
            contentType: "video",
            contentId: video.id,
            title: video.title,
            totalRevenue: 0,
            confidence: 0.95,
            sources: [],
          };
        }
        byContent[key].totalRevenue += record.amount;
        if (!byContent[key].sources.includes(record.source)) {
          byContent[key].sources.push(record.source);
        }
      }
    }

    if (!linked && meta?.streamId && typeof meta.streamId === "number") {
      const stream = userStreams.find(s => s.id === meta.streamId);
      if (stream) {
        const link: AttributionLink = {
          revenueRecordId: record.id,
          contentType: "stream",
          contentId: stream.id,
          contentTitle: stream.title,
          platform: record.platform,
          amount: record.amount,
          confidence: 0.90,
          method: "direct",
        };
        links.push(link);
        attributedRevenue += record.amount;
        byPlatform[record.platform].attributedRevenue += record.amount;
        linked = true;

        const key = `stream-${stream.id}`;
        if (!byContent[key]) {
          byContent[key] = {
            contentType: "stream",
            contentId: stream.id,
            title: stream.title,
            totalRevenue: 0,
            confidence: 0.90,
            sources: [],
          };
        }
        byContent[key].totalRevenue += record.amount;
        if (!byContent[key].sources.includes(record.source)) {
          byContent[key].sources.push(record.source);
        }
      }
    }

    if (!linked && record.source === "Ad Revenue" && record.platform === "youtube") {
      const periodDate = record.period ? new Date(record.period) : record.recordedAt;
      if (periodDate) {
        const nearbyVideos = userVideos.filter(v => {
          if (!v.publishedAt) return false;
          const diff = Math.abs(periodDate.getTime() - v.publishedAt.getTime());
          return diff < 7 * 24 * 60 * 60 * 1000;
        });

        if (nearbyVideos.length > 0) {
          const share = record.amount / nearbyVideos.length;
          for (const video of nearbyVideos) {
            const link: AttributionLink = {
              revenueRecordId: record.id,
              contentType: "video",
              contentId: video.id,
              contentTitle: video.title,
              platform: record.platform,
              amount: share,
              confidence: 0.5,
              method: "proportional",
            };
            links.push(link);

            const key = `video-${video.id}`;
            if (!byContent[key]) {
              byContent[key] = {
                contentType: "video",
                contentId: video.id,
                title: video.title,
                totalRevenue: 0,
                confidence: 0.5,
                sources: [],
              };
            }
            byContent[key].totalRevenue += share;
            if (!byContent[key].sources.includes(record.source)) {
              byContent[key].sources.push(record.source);
            }
          }
          attributedRevenue += record.amount;
          byPlatform[record.platform].attributedRevenue += record.amount;
          linked = true;
        }
      }
    }

    if (!linked && (record.source.includes("Super Chat") || record.source.includes("Bits") || record.source.includes("Live Gifts"))) {
      const recentStreams = userStreams.filter(s => {
        if (!s.startedAt) return false;
        const recordDate = record.recordedAt || record.createdAt;
        if (!recordDate) return false;
        const diff = Math.abs(recordDate.getTime() - s.startedAt.getTime());
        return diff < 24 * 60 * 60 * 1000;
      });

      if (recentStreams.length > 0) {
        const stream = recentStreams[0];
        const link: AttributionLink = {
          revenueRecordId: record.id,
          contentType: "stream",
          contentId: stream.id,
          contentTitle: stream.title,
          platform: record.platform,
          amount: record.amount,
          confidence: 0.7,
          method: "inferred",
        };
        links.push(link);
        attributedRevenue += record.amount;
        byPlatform[record.platform].attributedRevenue += record.amount;
        linked = true;

        const key = `stream-${stream.id}`;
        if (!byContent[key]) {
          byContent[key] = {
            contentType: "stream",
            contentId: stream.id,
            title: stream.title,
            totalRevenue: 0,
            confidence: 0.7,
            sources: [],
          };
        }
        byContent[key].totalRevenue += record.amount;
        if (!byContent[key].sources.includes(record.source)) {
          byContent[key].sources.push(record.source);
        }
      }
    }

    if (!linked) {
      links.push({
        revenueRecordId: record.id,
        contentType: "unknown",
        contentId: null,
        contentTitle: null,
        platform: record.platform,
        amount: record.amount,
        confidence: 0,
        method: "inferred",
      });
    }
  }

  const linksByPlatform: Record<string, Set<string>> = {};
  for (const link of links) {
    if (!linksByPlatform[link.platform]) linksByPlatform[link.platform] = new Set();
    if (link.contentId !== null) {
      linksByPlatform[link.platform].add(`${link.contentType}-${link.contentId}`);
    }
  }

  for (const platform of Object.keys(byPlatform)) {
    const p = byPlatform[platform];
    const platformKeys = linksByPlatform[platform] || new Set();
    const topEntry = Object.entries(byContent)
      .filter(([key]) => platformKeys.has(key))
      .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)[0];
    p.topContent = topEntry?.[1]?.title || null;
  }

  const graph = {
    userId,
    generatedAt: new Date().toISOString(),
    totalRevenue,
    attributedRevenue,
    unattributedRevenue: totalRevenue - attributedRevenue,
    attributionRate: totalRevenue > 0 ? (attributedRevenue / totalRevenue) * 100 : 0,
    links,
    byContent,
    byPlatform,
  };

  try {
    const { recordFinancialAudit } = await import("../services/financial-audit");
    await recordFinancialAudit(
      userId, "attribution_graph_built", "attribution_graph", null,
      {},
      { totalRevenue: Math.round(totalRevenue), attributedRevenue: Math.round(attributedRevenue), attributionRate: Math.round(graph.attributionRate), linkCount: links.length, platformCount: Object.keys(byPlatform).length },
      "revenue-attribution",
    );
  } catch (err: unknown) {
    console.warn("[revenue-attribution] audit trail write failed:", (err as Error)?.message);
  }

  return graph;
}

export async function getTopRevenueContent(
  userId: string,
  limit: number = 10
): Promise<Array<{
  contentType: string;
  contentId: number;
  title: string;
  totalRevenue: number;
  confidence: number;
  sources: string[];
}>> {
  const graph = await buildAttributionGraph(userId);
  return Object.values(graph.byContent)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

export async function getRevenueByContent(
  userId: string,
  contentType: "video" | "stream",
  contentId: number
): Promise<{
  totalRevenue: number;
  confidence: number;
  sources: string[];
  records: AttributionLink[];
}> {
  const graph = await buildAttributionGraph(userId);
  const key = `${contentType}-${contentId}`;
  const contentEntry = graph.byContent[key];

  if (!contentEntry) {
    return { totalRevenue: 0, confidence: 0, sources: [], records: [] };
  }

  const records = graph.links.filter(
    l => l.contentType === contentType && l.contentId === contentId
  );

  return {
    totalRevenue: contentEntry.totalRevenue,
    confidence: contentEntry.confidence,
    sources: contentEntry.sources,
    records,
  };
}

export async function getPlatformRevenueAttribution(
  userId: string
): Promise<Record<string, {
  totalRevenue: number;
  attributedRevenue: number;
  attributionRate: number;
  topContent: string | null;
}>> {
  const graph = await buildAttributionGraph(userId);
  const result: Record<string, {
    totalRevenue: number;
    attributedRevenue: number;
    attributionRate: number;
    topContent: string | null;
  }> = {};

  for (const [platform, data] of Object.entries(graph.byPlatform)) {
    result[platform] = {
      ...data,
      attributionRate: data.totalRevenue > 0
        ? (data.attributedRevenue / data.totalRevenue) * 100
        : 0,
    };
  }

  return result;
}
