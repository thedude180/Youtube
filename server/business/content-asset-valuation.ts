import { db } from "../db";
import { videos, channels, revenueRecords } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface ContentAssetScore {
  videoId: number;
  title: string;
  assetScore: number;
  evergreenScore: number;
  licensingPotential: "high" | "medium" | "low" | "none";
  estimatedLifetimeValue: number;
  ipOwnership: "full" | "shared" | "licensed" | "unclear";
  factors: {
    viewVelocity: number;
    engagementRate: number;
    ageInDays: number;
    viewsPerDay: number;
  };
}

export interface ContentLibraryValuation {
  totalAssets: number;
  totalEstimatedValue: number;
  topAssets: ContentAssetScore[];
  evergreenContent: ContentAssetScore[];
  licensingCandidates: ContentAssetScore[];
  ipSummary: {
    fullOwnership: number;
    shared: number;
    unclear: number;
  };
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
  libraryHealth: "strong" | "growing" | "thin" | "at_risk";
}

export async function computeContentAssetValuation(userId: string): Promise<ContentLibraryValuation> {
  const userChannelIds = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.userId, userId));

  const [userVideos, records] = await Promise.all([
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (${userChannelIds})`)
      .orderBy(desc(videos.createdAt))
      .limit(500),
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
  ]);

  const confidence = computeRevenueConfidence(records);
  const now = Date.now();

  const scoredAssets: ContentAssetScore[] = userVideos.map(v => {
    const views = v.metadata?.viewCount ?? v.metadata?.stats?.views ?? 0;
    const likes = v.metadata?.likeCount ?? v.metadata?.stats?.likes ?? 0;
    const comments = v.metadata?.commentCount ?? v.metadata?.stats?.comments ?? 0;
    const createdMs = v.createdAt ? new Date(v.createdAt).getTime() : now;
    const ageInDays = Math.max(1, Math.floor((now - createdMs) / (1000 * 60 * 60 * 24)));
    const viewsPerDay = views / ageInDays;
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

    const viewVelocity = Math.min(100, viewsPerDay * 10);
    const evergreenScore = computeEvergreenScore(viewsPerDay, ageInDays, engagementRate);
    const assetScore = Math.round(
      viewVelocity * 0.3 +
      evergreenScore * 0.3 +
      Math.min(100, engagementRate * 10) * 0.2 +
      Math.min(100, views / 100) * 0.2
    );

    const estimatedLifetimeValue = Math.round(views * 0.003 + viewsPerDay * 365 * 0.003);

    const licensingPotential: ContentAssetScore["licensingPotential"] =
      views >= 100000 && engagementRate >= 3 ? "high" :
      views >= 10000 && engagementRate >= 2 ? "medium" :
      views >= 1000 ? "low" : "none";

    const gameName = v.metadata?.gameName;
    const ipOwnership: ContentAssetScore["ipOwnership"] =
      gameName ? "shared" : "full";

    return {
      videoId: v.id,
      title: v.title,
      assetScore,
      evergreenScore,
      licensingPotential,
      estimatedLifetimeValue,
      ipOwnership,
      factors: {
        viewVelocity: Math.round(viewVelocity),
        engagementRate: Math.round(engagementRate * 100) / 100,
        ageInDays,
        viewsPerDay: Math.round(viewsPerDay * 100) / 100,
      },
    };
  });

  scoredAssets.sort((a, b) => b.assetScore - a.assetScore);

  const topAssets = scoredAssets.slice(0, 10);
  const evergreenContent = scoredAssets.filter(a => a.evergreenScore >= 60).slice(0, 10);
  const licensingCandidates = scoredAssets.filter(a => a.licensingPotential === "high" || a.licensingPotential === "medium").slice(0, 10);

  const ipSummary = {
    fullOwnership: scoredAssets.filter(a => a.ipOwnership === "full").length,
    shared: scoredAssets.filter(a => a.ipOwnership === "shared").length,
    unclear: scoredAssets.filter(a => a.ipOwnership === "unclear").length,
  };

  const totalEstimatedValue = scoredAssets.reduce((s, a) => s + a.estimatedLifetimeValue, 0);

  const libraryHealth: ContentLibraryValuation["libraryHealth"] =
    scoredAssets.length >= 50 && evergreenContent.length >= 5 ? "strong" :
    scoredAssets.length >= 20 ? "growing" :
    scoredAssets.length >= 5 ? "thin" : "at_risk";

  return {
    totalAssets: scoredAssets.length,
    totalEstimatedValue,
    topAssets,
    evergreenContent,
    licensingCandidates,
    ipSummary,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    libraryHealth,
  };
}

function computeEvergreenScore(viewsPerDay: number, ageInDays: number, engagementRate: number): number {
  const ageBonus = ageInDays >= 365 ? 30 : ageInDays >= 180 ? 20 : ageInDays >= 90 ? 10 : 0;
  const velocityScore = Math.min(40, viewsPerDay * 5);
  const engagementBonus = Math.min(30, engagementRate * 5);
  return Math.round(Math.min(100, ageBonus + velocityScore + engagementBonus));
}
