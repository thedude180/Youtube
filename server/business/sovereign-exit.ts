import { db } from "../db";
import { revenueRecords, channels, videos, streams } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface PortabilityAssessment {
  platform: string;
  dataExportReady: boolean;
  contentPortable: boolean;
  audiencePortable: boolean;
  revenuePortable: boolean;
  readinessScore: number;
  risks: string[];
}

export interface ContinuityPacket {
  version: string;
  generatedAt: string;
  sections: {
    businessOverview: {
      platforms: string[];
      totalRevenue: number;
      verifiedRevenue: number;
      revenueConfidenceNote: string;
      activeSince: string;
      contentCount: number;
    };
    revenueOperations: {
      streams: Array<{ source: string; platform: string; amount: number; verified: boolean }>;
      monthlyRecurringRevenue: number;
      topSources: Array<{ source: string; amount: number }>;
    };
    contentLibrary: {
      videoCount: number;
      streamCount: number;
      platforms: string[];
      contentTypes: string[];
    };
    platformAccess: Array<{
      platform: string;
      channelName: string;
      subscriberCount: number;
      transferNotes: string;
    }>;
    operationalPlaybook: string[];
    riskFactors: string[];
  };
}

export interface SovereignExitAssessment {
  overallReadiness: number;
  portabilityScores: PortabilityAssessment[];
  vendorDependencies: Array<{
    vendor: string;
    dependencyLevel: "low" | "medium" | "high" | "critical";
    alternatives: string[];
  }>;
  dataExportReadiness: number;
  exitTimeline: string;
  recommendations: string[];
}

export async function assessSovereignExit(userId: string): Promise<SovereignExitAssessment> {
  const [records, userChannels] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(channels).where(eq(channels.userId, userId)),
  ]);

  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const revenueByPlatform = new Map<string, number>();
  for (const r of records) {
    revenueByPlatform.set(r.platform, (revenueByPlatform.get(r.platform) || 0) + r.amount);
  }

  const platformPortability: Record<string, { dataExportReady: boolean; contentPortable: boolean; audiencePortable: boolean; revenuePortable: boolean }> = {
    youtube: { dataExportReady: true, contentPortable: true, audiencePortable: false, revenuePortable: false },
    twitch: { dataExportReady: false, contentPortable: false, audiencePortable: false, revenuePortable: false },
    kick: { dataExportReady: false, contentPortable: false, audiencePortable: false, revenuePortable: false },
    tiktok: { dataExportReady: true, contentPortable: true, audiencePortable: false, revenuePortable: false },
    discord: { dataExportReady: true, contentPortable: true, audiencePortable: true, revenuePortable: true },
    rumble: { dataExportReady: true, contentPortable: true, audiencePortable: false, revenuePortable: false },
    x: { dataExportReady: true, contentPortable: true, audiencePortable: false, revenuePortable: false },
  };

  const portabilityScores: PortabilityAssessment[] = [];
  for (const channel of userChannels) {
    const port = platformPortability[channel.platform] || { dataExportReady: false, contentPortable: false, audiencePortable: false, revenuePortable: false };
    const revenueShare = totalRevenue > 0 ? (revenueByPlatform.get(channel.platform) || 0) / totalRevenue : 0;
    const risks: string[] = [];

    if (!port.audiencePortable) risks.push(`${channel.platform} audience cannot be directly transferred`);
    if (!port.revenuePortable && revenueShare > 0.3) risks.push(`${(revenueShare * 100).toFixed(0)}% of revenue locked to ${channel.platform}`);
    if (!port.contentPortable) risks.push(`Content on ${channel.platform} may not be exportable`);

    const readinessScore = (port.dataExportReady ? 25 : 0) +
      (port.contentPortable ? 25 : 0) +
      (port.audiencePortable ? 25 : 0) +
      (port.revenuePortable ? 25 : 0);

    portabilityScores.push({
      platform: channel.platform,
      dataExportReady: port.dataExportReady,
      contentPortable: port.contentPortable,
      audiencePortable: port.audiencePortable,
      revenuePortable: port.revenuePortable,
      readinessScore,
      risks,
    });
  }

  const vendorDependencies = [
    { vendor: "YouTube/Google", dependencyLevel: getDependencyLevel(revenueByPlatform.get("youtube") || 0, totalRevenue), alternatives: ["Rumble", "Dailymotion", "Self-hosted video"] },
    { vendor: "Twitch/Amazon", dependencyLevel: getDependencyLevel(revenueByPlatform.get("twitch") || 0, totalRevenue), alternatives: ["Kick", "YouTube Live", "Self-hosted streaming"] },
    { vendor: "TikTok/ByteDance", dependencyLevel: getDependencyLevel(revenueByPlatform.get("tiktok") || 0, totalRevenue), alternatives: ["YouTube Shorts", "Instagram Reels"] },
  ].filter(v => v.dependencyLevel !== "low") as SovereignExitAssessment["vendorDependencies"];

  const avgPortability = portabilityScores.length > 0
    ? portabilityScores.reduce((s, p) => s + p.readinessScore, 0) / portabilityScores.length : 0;
  const dataExportReadiness = Math.round(avgPortability);
  const overallReadiness = Math.round(avgPortability * 0.6 + (vendorDependencies.length < 2 ? 40 : vendorDependencies.length < 3 ? 20 : 0));

  const recommendations: string[] = [];
  if (overallReadiness < 50) recommendations.push("Build platform-independent audience touchpoints (email list, own website)");
  if (portabilityScores.some(p => p.readinessScore < 50)) recommendations.push("Improve data export capabilities for low-portability platforms");
  if (vendorDependencies.some(v => v.dependencyLevel === "critical")) recommendations.push("URGENT: Reduce critical vendor dependency — diversify revenue across platforms");
  recommendations.push("Maintain regular content backups across all platforms");

  const exitTimeline = overallReadiness >= 70 ? "Ready for transition within 30 days" :
    overallReadiness >= 40 ? "3-6 months of preparation needed" : "6-12 months of platform diversification required";

  return {
    overallReadiness,
    portabilityScores,
    vendorDependencies,
    dataExportReadiness,
    exitTimeline,
    recommendations,
  };
}

function getDependencyLevel(platformRevenue: number, totalRevenue: number): "low" | "medium" | "high" | "critical" {
  if (totalRevenue === 0) return "low";
  const share = platformRevenue / totalRevenue;
  if (share > 0.7) return "critical";
  if (share > 0.4) return "high";
  if (share > 0.15) return "medium";
  return "low";
}

export async function generateContinuityPacket(userId: string): Promise<ContinuityPacket> {
  const [records, userChannels, userVideos, userStreams] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(500),
    db.select().from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(200),
  ]);

  const confidence = computeRevenueConfidence(records);
  const { totalRevenue, verifiedRevenue, verifiedPercent, confidenceNote } = confidence;

  const revenueBySource = new Map<string, { source: string; platform: string; amount: number; verified: boolean }[]>();
  for (const r of records) {
    const key = `${r.source}::${r.platform}`;
    if (!revenueBySource.has(key)) revenueBySource.set(key, []);
    revenueBySource.get(key)!.push({
      source: r.source,
      platform: r.platform,
      amount: r.amount,
      verified: r.reconciliationStatus === "verified",
    });
  }

  const aggregatedStreams: Array<{ source: string; platform: string; amount: number; verified: boolean }> = [];
  for (const [, items] of revenueBySource) {
    const totalAmt = items.reduce((s, i) => s + i.amount, 0);
    const verifiedCount = items.filter(i => i.verified).length;
    aggregatedStreams.push({
      source: items[0].source,
      platform: items[0].platform,
      amount: Math.round(totalAmt * 100) / 100,
      verified: verifiedCount > items.length / 2,
    });
  }
  aggregatedStreams.sort((a, b) => b.amount - a.amount);

  const topSources = aggregatedStreams.slice(0, 5).map(s => ({ source: s.source, amount: s.amount }));

  const recentPeriods = new Set(records.slice(0, 50).map(r => r.period).filter(Boolean));
  const monthlyRevenue = recentPeriods.size > 0 ? totalRevenue / Math.max(recentPeriods.size, 1) : 0;

  const contentTypes = new Set<string>();
  for (const v of userVideos) contentTypes.add(v.type);
  if (userStreams.length > 0) contentTypes.add("live_stream");

  const earliestChannel = userChannels.reduce((earliest, c) => {
    if (!earliest || (c.createdAt && c.createdAt < earliest)) return c.createdAt;
    return earliest;
  }, null as Date | null);

  const riskFactors: string[] = [];
  if (verifiedPercent < 50) riskFactors.push(`Only ${verifiedPercent.toFixed(0)}% of revenue is verified — financial due diligence required`);
  if (userChannels.length === 1) riskFactors.push("Single-platform business — high concentration risk");
  if (userVideos.length < 20) riskFactors.push("Limited content library reduces asset value");
  if (aggregatedStreams.length > 0 && aggregatedStreams[0].amount > totalRevenue * 0.6) {
    riskFactors.push(`Top revenue source (${aggregatedStreams[0].source}) accounts for ${((aggregatedStreams[0].amount / totalRevenue) * 100).toFixed(0)}% of total revenue`);
  }

  const operationalPlaybook = [
    "Content production: Record, edit, and publish gaming content on a regular schedule",
    "Revenue management: Track and reconcile revenue across all platforms monthly",
    "Platform management: Maintain active presence on all connected platforms",
    "Community: Engage with audience through comments, streams, and social media",
    "Analytics: Review performance metrics weekly and adjust strategy accordingly",
  ];

  return {
    version: "9.0",
    generatedAt: new Date().toISOString(),
    sections: {
      businessOverview: {
        platforms: userChannels.map(c => c.platform),
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        verifiedRevenue: Math.round(verifiedRevenue * 100) / 100,
        revenueConfidenceNote: confidenceNote,
        activeSince: earliestChannel?.toISOString() || "unknown",
        contentCount: userVideos.length + userStreams.length,
      },
      revenueOperations: {
        streams: aggregatedStreams,
        monthlyRecurringRevenue: Math.round(monthlyRevenue * 100) / 100,
        topSources,
      },
      contentLibrary: {
        videoCount: userVideos.length,
        streamCount: userStreams.length,
        platforms: [...new Set(userVideos.map(v => v.platform).filter(Boolean) as string[])],
        contentTypes: [...contentTypes],
      },
      platformAccess: userChannels.map(c => ({
        platform: c.platform,
        channelName: c.channelName,
        subscriberCount: c.subscriberCount || 0,
        transferNotes: `Access via ${c.platform} account. Stream key and API credentials required for transfer.`,
      })),
      operationalPlaybook,
      riskFactors,
    },
  };
}

export async function generateLivingProspectus(userId: string): Promise<{
  title: string;
  generatedAt: string;
  executiveSummary: string;
  keyMetrics: Record<string, number | string>;
  revenueConfidenceWarning: string | null;
  growthNarrative: string;
  assetInventory: string[];
  investmentHighlights: string[];
  risks: string[];
}> {
  const [records, userChannels, userVideos] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .limit(500),
  ]);

  const prospectusConfidence = computeRevenueConfidence(records);
  const totalRevenue = prospectusConfidence.totalRevenue;
  const verifiedRevenue = prospectusConfidence.verifiedRevenue;
  const verifiedPercent = prospectusConfidence.verifiedPercent;
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const platforms = userChannels.map(c => c.platform);
  const uniqueSources = new Set(records.map(r => r.source));

  const revenueConfidenceWarning = prospectusConfidence.confidenceLabel !== "high"
    ? `Note: Only ${verifiedPercent}% of reported revenue has been independently verified. Unverified figures should be treated as estimates pending audit.`
    : null;

  return {
    title: "Business Prospectus — Gaming Content Creator",
    generatedAt: new Date().toISOString(),
    executiveSummary: `Multi-platform gaming content business generating $${totalRevenue.toFixed(2)} in total tracked revenue across ${platforms.length} platform(s) with ${totalSubs.toLocaleString()} subscribers and ${totalViews.toLocaleString()} total views. Content library includes ${userVideos.length} videos.`,
    keyMetrics: {
      totalRevenue: Math.round(totalRevenue),
      verifiedRevenue: Math.round(verifiedRevenue),
      verificationRate: `${verifiedPercent.toFixed(0)}%`,
      subscribers: totalSubs,
      totalViews: totalViews,
      contentCount: userVideos.length,
      platformCount: platforms.length,
      revenueStreams: uniqueSources.size,
    },
    revenueConfidenceWarning,
    growthNarrative: totalSubs > 10000
      ? "Established creator with significant audience base and proven content-market fit"
      : totalSubs > 1000
        ? "Growing creator with early traction and expanding audience"
        : "Early-stage creator building audience and content library",
    assetInventory: [
      `${userVideos.length} video assets across ${platforms.join(", ")}`,
      `${totalSubs.toLocaleString()} subscribers (owned audience)`,
      `Brand and content IP rights`,
      `${uniqueSources.size} active revenue stream(s)`,
    ],
    investmentHighlights: [
      platforms.length > 1 ? "Multi-platform presence reduces single-platform risk" : "Focused single-platform strategy",
      uniqueSources.size >= 3 ? "Diversified revenue base" : "Revenue diversification opportunity",
      userVideos.length >= 50 ? "Deep content library with long-tail value" : "Growing content library",
    ],
    risks: [
      ...(verifiedPercent < 50 ? ["Significant portion of revenue is unverified"] : []),
      ...(platforms.length < 2 ? ["Single platform dependency risk"] : []),
      ...(uniqueSources.size < 3 ? ["Revenue concentration in few sources"] : []),
      "Creator-dependent business — key person risk",
      "Platform algorithm and policy changes can impact reach and revenue",
    ],
  };
}
