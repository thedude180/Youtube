import { db } from "../db";
import { channels, videos, revenueRecords } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface SuccessionReadiness {
  readinessScore: number;
  level: "prepared" | "partial" | "unprepared" | "at_risk";
  checklist: Array<{ item: string; status: "complete" | "partial" | "missing"; priority: "critical" | "high" | "medium" | "low" }>;
  estimatedAssetValue: number;
  transferabilityScore: number;
  recommendations: string[];
}

export interface EstatePlanningReport {
  succession: SuccessionReadiness;
  digitalAssets: {
    channels: number;
    contentPieces: number;
    revenueStreams: number;
    estimatedAnnualRevenue: number;
  };
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
  keyRisks: string[];
}

export async function computeEstatePlan(userId: string): Promise<EstatePlanningReport> {
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
  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const sourceDiversity = new Set(records.map(r => r.source)).size;
  const platformCount = new Set(userChannels.map(c => c.platform)).size;

  const estimatedAnnualRevenue = totalRevenue > 0 ? Math.round(totalRevenue * (12 / Math.max(1, getMonthSpan(records)))) : 0;
  const estimatedAssetValue = Math.round(estimatedAnnualRevenue * 3);

  const checklist: SuccessionReadiness["checklist"] = [
    {
      item: "Digital asset inventory documented",
      status: userChannels.length > 0 && userVideos.length > 0 ? "complete" : "missing",
      priority: "critical",
    },
    {
      item: "Revenue streams catalogued",
      status: sourceDiversity >= 2 ? "complete" : sourceDiversity === 1 ? "partial" : "missing",
      priority: "critical",
    },
    {
      item: "Platform access credentials secured",
      status: "partial",
      priority: "critical",
    },
    {
      item: "Content IP ownership documented",
      status: userVideos.length >= 10 ? "partial" : "missing",
      priority: "high",
    },
    {
      item: "Business entity structure established",
      status: "missing",
      priority: "high",
    },
    {
      item: "Successor/delegate identified",
      status: "missing",
      priority: "medium",
    },
    {
      item: "Brand guidelines and voice documented",
      status: "missing",
      priority: "medium",
    },
    {
      item: "Insurance coverage for digital assets",
      status: "missing",
      priority: "low",
    },
  ];

  const completeCount = checklist.filter(c => c.status === "complete").length;
  const partialCount = checklist.filter(c => c.status === "partial").length;
  const readinessScore = Math.round(((completeCount + partialCount * 0.5) / checklist.length) * 100);

  const level: SuccessionReadiness["level"] =
    readinessScore >= 75 ? "prepared" : readinessScore >= 50 ? "partial" : readinessScore >= 25 ? "unprepared" : "at_risk";

  const founderDependencyRisk = platformCount <= 1 && sourceDiversity <= 1;
  const transferabilityScore = Math.min(100, Math.round(
    (platformCount >= 2 ? 25 : 10) +
    (sourceDiversity >= 3 ? 25 : sourceDiversity * 10) +
    (userVideos.length >= 50 ? 25 : userVideos.length / 2) +
    (estimatedAnnualRevenue >= 10000 ? 25 : estimatedAnnualRevenue / 400)
  ));

  const recommendations: string[] = [];
  if (level === "at_risk" || level === "unprepared") {
    recommendations.push("Start by creating a digital asset inventory listing all channels, accounts, and revenue sources");
  }
  recommendations.push("Establish an LLC or other business entity to separate personal and business assets");
  recommendations.push("Create a password manager vault with all platform credentials and share access with a trusted person");
  if (founderDependencyRisk) {
    recommendations.push("Reduce founder dependency by building systems that can operate without daily involvement");
  }
  recommendations.push("Consult with an estate attorney about digital asset provisions in your will");

  const keyRisks: string[] = [];
  if (founderDependencyRisk) keyRisks.push("High founder dependency — business cannot operate without creator");
  if (platformCount <= 1) keyRisks.push("Single platform — account suspension could eliminate all revenue");
  keyRisks.push("Platform ToS may restrict account transfers after death");
  if (estimatedAnnualRevenue > 10000) keyRisks.push("Significant revenue at risk without succession plan");

  return {
    succession: {
      readinessScore,
      level,
      checklist,
      estimatedAssetValue,
      transferabilityScore,
      recommendations,
    },
    digitalAssets: {
      channels: userChannels.length,
      contentPieces: userVideos.length,
      revenueStreams: sourceDiversity,
      estimatedAnnualRevenue,
    },
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    keyRisks,
  };
}

function getMonthSpan(records: Array<{ recordedAt: Date | null; createdAt: Date | null }>): number {
  if (records.length === 0) return 1;
  const dates = records
    .map(r => r.recordedAt ? new Date(r.recordedAt).getTime() : r.createdAt ? new Date(r.createdAt).getTime() : 0)
    .filter(d => d > 0);
  if (dates.length === 0) return 1;
  const earliest = Math.min(...dates);
  const latest = Math.max(...dates);
  return Math.max(1, Math.round((latest - earliest) / (1000 * 60 * 60 * 24 * 30)));
}
