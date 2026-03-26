import { db } from "../db";
import { revenueRecords, channels, videos, streams } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface ValuationMethodology {
  method: string;
  value: number;
  multiple: number;
  basis: string;
  confidenceLevel: "high" | "medium" | "low";
  revenueConfidenceNote: string;
}

export interface DynamicValuation {
  estimatedValue: number;
  valueRange: { low: number; high: number };
  methodologies: ValuationMethodology[];
  revenueConfidence: {
    verifiedRevenue: number;
    estimatedRevenue: number;
    verifiedPercent: number;
    confidenceLabel: "high" | "medium" | "low" | "unverified";
    uncertaintyDiscount: number;
  };
  contentAssetValue: number;
  audienceValue: number;
  monthlyRecurringRevenue: number;
  annualizedRevenue: number;
  growthRate: number;
  valuationDate: string;
}

const CREATOR_REVENUE_MULTIPLES = {
  verified: { low: 2.5, mid: 3.5, high: 5.0 },
  estimated: { low: 1.5, mid: 2.0, high: 3.0 },
};

const CONTENT_VALUE_PER_VIDEO = 50;
const AUDIENCE_VALUE_PER_SUB = 2.5;
const AUDIENCE_VALUE_PER_1K_VIEWS = 0.5;

export async function computeDynamicValuation(userId: string): Promise<DynamicValuation> {
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
  const { totalRevenue, verifiedRevenue, estimatedRevenue, verifiedPercent, confidenceLabel, uncertaintyDiscount } = confidence;

  const byPeriod = new Map<string, number>();
  for (const r of records) {
    const period = r.period || "unknown";
    byPeriod.set(period, (byPeriod.get(period) || 0) + r.amount);
  }
  const periods = Array.from(byPeriod.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const recentPeriods = periods.slice(-6);
  const monthlyRecurringRevenue = recentPeriods.length > 0
    ? recentPeriods.reduce((s, [, v]) => s + v, 0) / recentPeriods.length : 0;
  const annualizedRevenue = monthlyRecurringRevenue * 12;

  let growthRate = 0;
  if (recentPeriods.length >= 2) {
    const firstHalf = recentPeriods.slice(0, Math.floor(recentPeriods.length / 2));
    const secondHalf = recentPeriods.slice(Math.floor(recentPeriods.length / 2));
    const firstAvg = firstHalf.reduce((s, [, v]) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, [, v]) => s + v, 0) / secondHalf.length;
    growthRate = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
  }

  const multiples = verifiedPercent >= 50 ? CREATOR_REVENUE_MULTIPLES.verified : CREATOR_REVENUE_MULTIPLES.estimated;

  const methodologies: ValuationMethodology[] = [];

  const revenueMultipleValue = annualizedRevenue * multiples.mid * (1 - uncertaintyDiscount);
  methodologies.push({
    method: "Revenue Multiple",
    value: Math.round(revenueMultipleValue),
    multiple: multiples.mid,
    basis: `${annualizedRevenue.toFixed(2)} annualized revenue × ${multiples.mid}x`,
    confidenceLevel: confidenceLabel === "high" ? "high" : confidenceLabel === "medium" ? "medium" : "low",
    revenueConfidenceNote: verifiedPercent >= 80
      ? "Based on verified revenue data"
      : `${(100 - verifiedPercent).toFixed(0)}% of revenue is unverified — valuation discounted by ${(uncertaintyDiscount * 100).toFixed(0)}%`,
  });

  const videoCount = userVideos.length;
  const streamCount = userStreams.length;
  const contentAssetValue = (videoCount * CONTENT_VALUE_PER_VIDEO) + (streamCount * CONTENT_VALUE_PER_VIDEO * 0.3);
  methodologies.push({
    method: "Content Asset Valuation",
    value: Math.round(contentAssetValue),
    multiple: 1,
    basis: `${videoCount} videos + ${streamCount} streams as intellectual property`,
    confidenceLevel: "medium",
    revenueConfidenceNote: "Content asset value is independent of revenue verification",
  });

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const audienceValue = (totalSubs * AUDIENCE_VALUE_PER_SUB) + ((totalViews / 1000) * AUDIENCE_VALUE_PER_1K_VIEWS);
  methodologies.push({
    method: "Audience Valuation",
    value: Math.round(audienceValue),
    multiple: 1,
    basis: `${totalSubs.toLocaleString()} subscribers + ${totalViews.toLocaleString()} views`,
    confidenceLevel: "medium",
    revenueConfidenceNote: "Audience value based on platform metrics, not revenue verification",
  });

  if (annualizedRevenue > 0) {
    const dcfDiscount = 0.15 + uncertaintyDiscount * 0.10;
    const projectionYears = 5;
    let dcfValue = 0;
    for (let y = 1; y <= projectionYears; y++) {
      const projectedRevenue = annualizedRevenue * Math.pow(1 + (growthRate / 100) * 0.5, y);
      dcfValue += projectedRevenue / Math.pow(1 + dcfDiscount, y);
    }
    const terminalValue = (annualizedRevenue * Math.pow(1 + (growthRate / 100) * 0.3, projectionYears) * 3) / Math.pow(1 + dcfDiscount, projectionYears);
    dcfValue += terminalValue;

    methodologies.push({
      method: "Discounted Cash Flow",
      value: Math.round(dcfValue),
      multiple: annualizedRevenue > 0 ? Math.round(dcfValue / annualizedRevenue * 10) / 10 : 0,
      basis: `${projectionYears}-year DCF with ${(dcfDiscount * 100).toFixed(0)}% discount rate`,
      confidenceLevel: confidenceLabel === "high" ? "high" : "low",
      revenueConfidenceNote: verifiedPercent >= 80
        ? "DCF based on verified cash flows"
        : `DCF reliability reduced — ${(100 - verifiedPercent).toFixed(0)}% of revenue is unverified`,
    });
  }

  const values = methodologies.map(m => m.value).filter(v => v > 0);
  const estimatedValue = values.length > 0
    ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    : 0;

  const valueLow = Math.round(estimatedValue * (1 - 0.25 - uncertaintyDiscount * 0.15));
  const valueHigh = Math.round(estimatedValue * (1 + 0.25));

  return {
    estimatedValue,
    valueRange: { low: Math.max(0, valueLow), high: valueHigh },
    methodologies,
    revenueConfidence: {
      verifiedRevenue: Math.round(verifiedRevenue),
      estimatedRevenue: Math.round(estimatedRevenue),
      verifiedPercent: Math.round(verifiedPercent),
      confidenceLabel,
      uncertaintyDiscount,
    },
    contentAssetValue: Math.round(contentAssetValue),
    audienceValue: Math.round(audienceValue),
    monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue),
    annualizedRevenue: Math.round(annualizedRevenue),
    growthRate: Math.round(growthRate * 10) / 10,
    valuationDate: new Date().toISOString(),
  };
}
