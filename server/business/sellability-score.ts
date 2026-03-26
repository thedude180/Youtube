import { db } from "../db";
import { revenueRecords, channels, videos, streams } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface SellabilityScore {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: {
    revenueStability: number;
    revenueDiversification: number;
    platformIndependence: number;
    contentLibraryValue: number;
    audienceLoyalty: number;
    operationalMaturity: number;
    revenueVerification: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  revenueConfidence: {
    verifiedPercent: number;
    estimatedPercent: number;
    label: "high" | "medium" | "low" | "unverified";
  };
}

function scoreToGrade(score: number): SellabilityScore["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

export async function computeSellabilityScore(userId: string): Promise<SellabilityScore> {
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
  const totalRevenue = confidence.totalRevenue;
  const verifiedPercent = confidence.verifiedPercent;
  const estimatedPercent = 100 - verifiedPercent;

  const revenueByPeriod = new Map<string, number>();
  for (const r of records) {
    const period = r.period || "unknown";
    revenueByPeriod.set(period, (revenueByPeriod.get(period) || 0) + r.amount);
  }
  const periodValues = Array.from(revenueByPeriod.values());
  const avgPeriodRevenue = periodValues.length > 0 ? periodValues.reduce((a, b) => a + b, 0) / periodValues.length : 0;
  const varianceCoeff = avgPeriodRevenue > 0
    ? Math.sqrt(periodValues.reduce((s, v) => s + Math.pow(v - avgPeriodRevenue, 2), 0) / Math.max(periodValues.length, 1)) / avgPeriodRevenue
    : 1;
  const revenueStability = Math.max(0, Math.min(100, (1 - Math.min(varianceCoeff, 1)) * 100));

  const revenueSources = new Set(records.map(r => r.source));
  const revenuePlatforms = new Set(records.map(r => r.platform));
  const sourceCount = revenueSources.size;
  const herfindahlBySource = computeHerfindahl(records.map(r => r.source), records.map(r => r.amount));
  const revenueDiversification = Math.max(0, Math.min(100, (1 - herfindahlBySource) * 100 * Math.min(sourceCount / 4, 1)));

  const activePlatforms = new Set(userChannels.map(c => c.platform));
  const platformCount = activePlatforms.size;
  const platformIndependence = Math.min(100, platformCount * 20 + (platformCount >= 3 ? 20 : 0));

  const videoCount = userVideos.length;
  const streamCount = userStreams.length;
  const contentLibraryValue = Math.min(100, Math.log2(Math.max(videoCount + streamCount, 1)) * 15);

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const viewsPerSub = totalSubs > 0 ? totalViews / totalSubs : 0;
  const audienceLoyalty = Math.min(100, Math.min(viewsPerSub / 100, 1) * 50 + Math.min(totalSubs / 10000, 1) * 50);

  const hasMultipleChannels = userChannels.length >= 2;
  const hasRegularContent = videoCount >= 20;
  const hasStreamHistory = streamCount >= 5;
  const operationalMaturity = (hasMultipleChannels ? 30 : 0) + (hasRegularContent ? 40 : 0) + (hasStreamHistory ? 30 : 0);

  const confidenceLabel = confidence.confidenceLabel;
  let revenueVerification: number;
  if (confidenceLabel === "high") revenueVerification = 100;
  else if (confidenceLabel === "medium") revenueVerification = 70;
  else if (confidenceLabel === "low") revenueVerification = 40;
  else revenueVerification = 10;

  const overallScore = Math.round(
    revenueStability * 0.20 +
    revenueDiversification * 0.20 +
    platformIndependence * 0.10 +
    contentLibraryValue * 0.10 +
    audienceLoyalty * 0.10 +
    operationalMaturity * 0.15 +
    revenueVerification * 0.15
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (revenueStability >= 70) strengths.push("Stable, predictable revenue stream");
  else weaknesses.push("Revenue volatility reduces buyer confidence");

  if (revenueDiversification >= 60) strengths.push("Well-diversified revenue sources");
  else {
    weaknesses.push("Revenue concentration risk — too few income sources");
    recommendations.push("Add at least 2 additional revenue streams to reduce concentration risk");
  }

  if (platformIndependence >= 60) strengths.push("Multi-platform presence reduces dependency risk");
  else {
    weaknesses.push("Heavy reliance on a single platform");
    recommendations.push("Expand to additional platforms to improve business portability");
  }

  if (contentLibraryValue >= 50) strengths.push("Substantial content library creates lasting asset value");
  else recommendations.push("Build a deeper content library to increase business asset value");

  if (revenueVerification < 70) {
    weaknesses.push(`Only ${verifiedPercent.toFixed(0)}% of revenue is verified — buyers require auditable financials`);
    recommendations.push("Verify revenue records against payout statements to increase buyer confidence");
  }

  if (operationalMaturity < 50) {
    weaknesses.push("Business operations depend heavily on the founder");
    recommendations.push("Document SOPs and systematize operations for transferability");
  }

  return {
    overallScore,
    grade: scoreToGrade(overallScore),
    components: {
      revenueStability: Math.round(revenueStability),
      revenueDiversification: Math.round(revenueDiversification),
      platformIndependence: Math.round(platformIndependence),
      contentLibraryValue: Math.round(contentLibraryValue),
      audienceLoyalty: Math.round(audienceLoyalty),
      operationalMaturity: Math.round(operationalMaturity),
      revenueVerification: Math.round(revenueVerification),
    },
    strengths,
    weaknesses,
    recommendations,
    revenueConfidence: {
      verifiedPercent: Math.round(verifiedPercent),
      estimatedPercent: Math.round(estimatedPercent),
      label: confidenceLabel,
    },
  };
}

function computeHerfindahl(categories: string[], amounts: number[]): number {
  const totals = new Map<string, number>();
  let grandTotal = 0;
  for (let i = 0; i < categories.length; i++) {
    totals.set(categories[i], (totals.get(categories[i]) || 0) + amounts[i]);
    grandTotal += amounts[i];
  }
  if (grandTotal === 0) return 1;
  let hhi = 0;
  for (const [, total] of totals) {
    const share = total / grandTotal;
    hhi += share * share;
  }
  return hhi;
}
