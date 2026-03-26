import { db } from "../db";
import { videos, channels, revenueRecords } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface VelocityMetrics {
  avgDaysToFirstRevenue: number;
  avgDaysToBreakeven: number;
  fastestMonetizedVideo: { title: string; daysToRevenue: number } | null;
  revenuePerContentDay: number;
  contentToRevenueRatio: number;
}

export interface StrategicAssetNarrative {
  headline: string;
  valueProposition: string;
  keyMetrics: Array<{ label: string; value: string; trend: "up" | "stable" | "down" }>;
  investorHighlights: string[];
  riskDisclosures: string[];
}

export interface InfrastructurePosition {
  maturityLevel: "pre_revenue" | "early" | "growing" | "established" | "scaling";
  systemsInPlace: string[];
  gapAnalysis: Array<{ system: string; status: "operational" | "partial" | "missing"; priority: "critical" | "high" | "medium" | "low" }>;
  readinessScore: number;
}

export interface RevenueVelocityReport {
  velocity: VelocityMetrics;
  narrative: StrategicAssetNarrative;
  infrastructure: InfrastructurePosition;
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
}

export async function computeRevenueVelocity(userId: string): Promise<RevenueVelocityReport> {
  const userChannelIds = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.userId, userId));

  const [userChannels, userVideos, records] = await Promise.all([
    db.select().from(channels).where(eq(channels.userId, userId)),
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
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const platformCount = new Set(userChannels.map(c => c.platform)).size;
  const sourceDiversity = new Set(records.map(r => r.source)).size;

  const velocity = computeVelocityMetrics(userVideos, records);
  const narrative = buildStrategicNarrative(totalSubs, totalRevenue, userVideos.length, platformCount, sourceDiversity, confidence);
  const infrastructure = assessInfrastructure(userChannels.length, userVideos.length, records.length, totalRevenue, sourceDiversity);

  return {
    velocity,
    narrative,
    infrastructure,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
  };
}

function computeVelocityMetrics(
  userVideos: Array<{ id: number; title: string; createdAt: Date | null; publishedAt: Date | null }>,
  records: Array<{ amount: number; recordedAt: Date | null; createdAt: Date | null }>,
): VelocityMetrics {
  const earliestVideo = userVideos.length > 0
    ? userVideos.reduce((e, v) => {
        const t = v.createdAt ? new Date(v.createdAt).getTime() : Infinity;
        return t < e ? t : e;
      }, Infinity)
    : null;

  const earliestRevenue = records.length > 0
    ? records.reduce((e, r) => {
        const t = r.recordedAt ? new Date(r.recordedAt).getTime() : r.createdAt ? new Date(r.createdAt).getTime() : Infinity;
        return t < e ? t : e;
      }, Infinity)
    : null;

  const avgDaysToFirstRevenue = earliestVideo !== null && earliestRevenue !== null && earliestVideo !== Infinity && earliestRevenue !== Infinity
    ? Math.max(0, Math.round((earliestRevenue - earliestVideo) / (1000 * 60 * 60 * 24)))
    : -1;

  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const now = Date.now();
  const totalContentDays = earliestVideo !== null && earliestVideo !== Infinity
    ? Math.max(1, Math.round((now - earliestVideo) / (1000 * 60 * 60 * 24)))
    : 1;

  const revenuePerContentDay = Math.round((totalRevenue / totalContentDays) * 100) / 100;
  const contentToRevenueRatio = userVideos.length > 0 ? Math.round((totalRevenue / userVideos.length) * 100) / 100 : 0;

  return {
    avgDaysToFirstRevenue,
    avgDaysToBreakeven: avgDaysToFirstRevenue >= 0 ? avgDaysToFirstRevenue * 2 : -1,
    fastestMonetizedVideo: userVideos.length > 0 ? { title: userVideos[0].title, daysToRevenue: Math.max(1, avgDaysToFirstRevenue) } : null,
    revenuePerContentDay,
    contentToRevenueRatio,
  };
}

function buildStrategicNarrative(
  totalSubs: number,
  totalRevenue: number,
  videoCount: number,
  platformCount: number,
  sourceDiversity: number,
  confidence: ReturnType<typeof computeRevenueConfidence>,
): StrategicAssetNarrative {
  const revenueLabel = totalRevenue >= 10000 ? "five-figure" : totalRevenue >= 1000 ? "four-figure" : "early-stage";

  const headline = totalSubs >= 100000
    ? `Established ${revenueLabel} creator business with ${totalSubs.toLocaleString()} subscribers`
    : totalSubs >= 10000
    ? `Growing ${revenueLabel} creator business approaching scale`
    : `Early-stage creator business with growth potential`;

  const valueProposition = `${videoCount} content assets across ${platformCount} platform(s) generating ${sourceDiversity} revenue stream(s) with ${confidence.confidenceLabel} revenue confidence`;

  const keyMetrics: StrategicAssetNarrative["keyMetrics"] = [
    { label: "Total Subscribers", value: totalSubs.toLocaleString(), trend: "up" },
    { label: "Content Library", value: `${videoCount} videos`, trend: "up" },
    { label: "Revenue", value: `$${Math.round(totalRevenue).toLocaleString()}`, trend: totalRevenue > 0 ? "up" : "stable" },
    { label: "Revenue Confidence", value: `${confidence.verifiedPercent}% verified`, trend: confidence.verifiedPercent >= 80 ? "up" : "stable" },
  ];

  const investorHighlights: string[] = [];
  if (totalSubs >= 10000) investorHighlights.push("Established audience with proven engagement");
  if (videoCount >= 50) investorHighlights.push("Deep content library with long-tail revenue potential");
  if (sourceDiversity >= 3) investorHighlights.push("Diversified revenue reduces concentration risk");
  if (platformCount >= 2) investorHighlights.push("Multi-platform presence reduces platform dependency");
  investorHighlights.push("Creator economy growing at 20%+ annually");

  const riskDisclosures: string[] = [];
  if (confidence.verifiedPercent < 50) riskDisclosures.push(`Only ${confidence.verifiedPercent}% of revenue is verified — estimates may be inaccurate`);
  if (platformCount <= 1) riskDisclosures.push("Single-platform dependency creates concentration risk");
  if (sourceDiversity <= 1) riskDisclosures.push("Revenue from single source — high sensitivity to market changes");
  riskDisclosures.push("Creator businesses depend on founder participation and platform policies");

  return { headline, valueProposition, keyMetrics, investorHighlights, riskDisclosures };
}

function assessInfrastructure(
  channelCount: number,
  videoCount: number,
  recordCount: number,
  totalRevenue: number,
  sourceDiversity: number,
): InfrastructurePosition {
  const maturityLevel: InfrastructurePosition["maturityLevel"] =
    totalRevenue >= 50000 && sourceDiversity >= 3 ? "scaling" :
    totalRevenue >= 10000 ? "established" :
    totalRevenue >= 1000 ? "growing" :
    totalRevenue > 0 ? "early" : "pre_revenue";

  const systemsInPlace: string[] = [];
  if (channelCount > 0) systemsInPlace.push("Channel management");
  if (videoCount > 0) systemsInPlace.push("Content pipeline");
  if (recordCount > 0) systemsInPlace.push("Revenue tracking");
  systemsInPlace.push("Business intelligence dashboard");

  const gapAnalysis: InfrastructurePosition["gapAnalysis"] = [
    { system: "Revenue Tracking", status: recordCount > 0 ? "operational" : "missing", priority: "critical" },
    { system: "Content Pipeline", status: videoCount > 0 ? "operational" : "missing", priority: "critical" },
    { system: "Multi-Platform Distribution", status: channelCount >= 2 ? "operational" : channelCount === 1 ? "partial" : "missing", priority: "high" },
    { system: "Revenue Diversification", status: sourceDiversity >= 3 ? "operational" : sourceDiversity >= 2 ? "partial" : "missing", priority: "high" },
    { system: "Team Operations", status: "partial", priority: "medium" },
    { system: "Legal & Compliance", status: "partial", priority: "medium" },
  ];

  const operational = gapAnalysis.filter(g => g.status === "operational").length;
  const total = gapAnalysis.length;
  const readinessScore = Math.round((operational / total) * 100);

  return { maturityLevel, systemsInPlace, gapAnalysis, readinessScore };
}
