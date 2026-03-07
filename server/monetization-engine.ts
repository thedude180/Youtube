import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  revenueForecasts, fanFunnelEvents, sponsorRates, equipmentRoi,
  invoices, sponsorshipDeals, revenueRecords, channels, videos,
  analyticsSnapshots,
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const openai = getOpenAIClient();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function suggestAdBreaks(userId: string, videoId: number) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { adBreaks: [], error: "Video not found" };

    const duration = video.metadata?.duration || "unknown";

    const prompt = `You are a YouTube monetization expert. Suggest optimal ad break placements for this video.

Video Title: "${video.title}"
Video Type: ${video.type}
Duration: ${duration}
Description: "${video.description || "None"}"

Suggest ad break placements as JSON:
{
  "adBreaks": [
    {
      "timestamp": "MM:SS format",
      "type": "pre-roll | mid-roll | post-roll",
      "reasoning": "Why this is a good placement",
      "riskLevel": "low | medium | high (risk of viewer drop-off)"
    }
  ],
  "maxRecommended": "Maximum number of ads recommended for this video length",
  "estimatedRpm": "Estimated RPM range based on content type",
  "tips": ["3 tips for maximizing ad revenue without hurting retention"],
  "avoidTimestamps": ["Timestamps where placing ads would hurt retention"]
}

Best practices:
- Never place mid-rolls in the first 2 minutes
- Place mid-rolls at natural transition points
- 8-10 minute videos: 1 mid-roll max
- 15-20 minute videos: 2-3 mid-rolls
- Avoid placing ads right before the payoff/climax`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      return JSON.parse(content);
    } catch {
      console.error("[MonetizationEngine] Failed to parse ad breaks response");
      return {};
    }
  } catch (error) {
    console.error("Failed to suggest ad breaks:", error);
    return { adBreaks: [], tips: [] };
  }
}

export async function generateRevenueForecast(userId: string, period: string) {
  try {
    const recentRevenue = await db.select().from(revenueRecords)
      .where(and(eq(revenueRecords.userId, userId), gte(revenueRecords.createdAt, daysAgo(180))))
      .orderBy(desc(revenueRecords.createdAt))
      .limit(200);

    const snapshots = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, userId))
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(30);

    const totalRevenue = recentRevenue.reduce((s, r) => s + (r.amount || 0), 0);
    const revenueBySource: Record<string, number> = {};
    for (const r of recentRevenue) {
      const source = r.source || "other";
      revenueBySource[source] = (revenueBySource[source] || 0) + (r.amount || 0);
    }

    const latestMetrics = snapshots[0]?.metrics;

    const prompt = `You are a creator revenue analyst. Generate a revenue forecast for the "${period}" period.

CURRENT DATA (last 6 months):
- Total revenue: $${totalRevenue.toFixed(2)}
- Revenue by source: ${JSON.stringify(revenueBySource)}
- Monthly average: $${(totalRevenue / 6).toFixed(2)}
- Current subscribers: ${latestMetrics?.totalSubscribers || "unknown"}
- Current monthly views: ${latestMetrics?.totalViews || "unknown"}

Generate forecast as JSON:
{
  "period": "${period}",
  "predictedRevenue": number,
  "confidence": 0.0-1.0,
  "breakdown": {
    "adRevenue": number,
    "sponsors": number,
    "memberships": number,
    "merch": number,
    "tips": number
  },
  "assumptions": {
    "growthRate": "Expected growth rate",
    "marketConditions": "Market outlook",
    "seasonality": "Seasonal factors"
  },
  "whatIfScenarios": [
    {
      "scenario": "Description of scenario",
      "impact": "Revenue impact",
      "predictedRevenue": number
    }
  ],
  "actionItems": ["3-5 actions to increase revenue"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    let forecast;
    try {
      forecast = JSON.parse(content);
    } catch {
      console.error("[MonetizationEngine] Failed to parse revenue forecast response");
      forecast = {};
    }

    await db.insert(revenueForecasts).values({
      userId,
      forecastDate: new Date(),
      period,
      predictedRevenue: forecast.predictedRevenue || 0,
      confidence: forecast.confidence || 0.5,
      breakdown: forecast.breakdown || {},
      assumptions: forecast.assumptions || {},
    });

    return forecast;
  } catch (error) {
    console.error("Failed to generate revenue forecast:", error);
    return {
      period,
      predictedRevenue: 0,
      confidence: 0,
      breakdown: {},
      assumptions: {},
      whatIfScenarios: [],
      actionItems: ["Insufficient data for forecast"],
    };
  }
}

export async function trackFanFunnel(
  userId: string,
  eventType: string,
  platform: string,
  count: number
) {
  try {
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [record] = await db.insert(fanFunnelEvents).values({
      userId,
      eventType,
      platform,
      count,
      period: periodKey,
    }).returning();
    return record;
  } catch (error) {
    console.error("Failed to track fan funnel:", error);
    throw new Error("Could not track fan funnel event");
  }
}

export async function getFanFunnelData(userId: string) {
  try {
    const events = await db.select().from(fanFunnelEvents)
      .where(eq(fanFunnelEvents.userId, userId))
      .orderBy(desc(fanFunnelEvents.createdAt));

    const funnelStages = ["view", "subscribe", "engage", "superfan", "purchase"];
    const summary: Record<string, number> = {};
    for (const stage of funnelStages) {
      summary[stage] = events
        .filter(e => e.eventType === stage)
        .reduce((s, e) => s + (e.count || 0), 0);
    }

    return { events, summary, stages: funnelStages };
  } catch (error) {
    console.error("Failed to get fan funnel data:", error);
    return { events: [], summary: {}, stages: [] };
  }
}

export async function calculateSponsorRates(userId: string) {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const userVideos = await storage.getVideosByUser(userId);

    const totalSubs = userChannels.reduce((s, c) => s, 0);
    const recentVideos = userVideos.slice(0, 30);
    const avgViews = recentVideos.length > 0
      ? recentVideos.reduce((s, v) => s + (v.metadata?.stats?.views || v.metadata?.viewCount || 0), 0) / recentVideos.length
      : 0;
    const avgEngagement = recentVideos.length > 0
      ? recentVideos.reduce((s, v) => s + (v.metadata?.stats?.likes || v.metadata?.likeCount || 0), 0) / recentVideos.length
      : 0;

    const rateTypes = ["cpm", "cpv", "flat"];
    const rates: Array<{ rateType: string; calculatedRate: number; marketAverage: number }> = [];

    const cpmRate = avgViews > 0 ? Math.max(15, Math.min(50, avgViews / 1000 * 0.03)) : 25;
    rates.push({ rateType: "cpm", calculatedRate: cpmRate, marketAverage: 25 });

    const cpvRate = avgViews > 0 ? Math.max(0.02, Math.min(0.10, avgEngagement / Math.max(avgViews, 1))) : 0.05;
    rates.push({ rateType: "cpv", calculatedRate: cpvRate, marketAverage: 0.05 });

    const flatRate = avgViews * (cpmRate / 1000);
    rates.push({ rateType: "flat", calculatedRate: flatRate, marketAverage: avgViews * 0.025 });

    for (const rate of rates) {
      await db.insert(sponsorRates).values({
        userId,
        rateType: rate.rateType,
        calculatedRate: rate.calculatedRate,
        marketAverage: rate.marketAverage,
        currency: "USD",
        basedOn: {
          avgViews: Math.round(avgViews),
          engagement: Math.round(avgEngagement),
          niche: "general",
        },
        lastCalculatedAt: new Date(),
      });
    }

    return { rates, avgViews: Math.round(avgViews), avgEngagement: Math.round(avgEngagement) };
  } catch (error) {
    console.error("Failed to calculate sponsor rates:", error);
    return { rates: [], avgViews: 0, avgEngagement: 0 };
  }
}

export async function getSponsorRates(userId: string) {
  try {
    return await db.select().from(sponsorRates)
      .where(eq(sponsorRates.userId, userId))
      .orderBy(desc(sponsorRates.lastCalculatedAt));
  } catch (error) {
    console.error("Failed to get sponsor rates:", error);
    return [];
  }
}

export async function trackEquipmentRoi(
  userId: string,
  data: {
    itemName: string;
    category?: string;
    purchasePrice?: number;
    purchaseDate?: Date;
    revenueAttributed?: number;
    hoursUsed?: number;
  }
) {
  try {
    const roiPercent = data.purchasePrice && data.revenueAttributed
      ? ((data.revenueAttributed - data.purchasePrice) / data.purchasePrice) * 100
      : 0;

    const status = roiPercent >= 100 ? "paid-off" : roiPercent >= 0 ? "paying-off" : "investing";

    const [record] = await db.insert(equipmentRoi).values({
      userId,
      itemName: data.itemName,
      category: data.category || "general",
      purchasePrice: data.purchasePrice || 0,
      purchaseDate: data.purchaseDate || new Date(),
      revenueAttributed: data.revenueAttributed || 0,
      hoursUsed: data.hoursUsed || 0,
      roiPercent,
      status,
    }).returning();
    return record;
  } catch (error) {
    console.error("Failed to track equipment ROI:", error);
    throw new Error("Could not track equipment ROI");
  }
}

export async function getEquipmentRoi(userId: string) {
  try {
    return await db.select().from(equipmentRoi)
      .where(eq(equipmentRoi.userId, userId))
      .orderBy(desc(equipmentRoi.createdAt));
  } catch (error) {
    console.error("Failed to get equipment ROI:", error);
    return [];
  }
}

export async function generateInvoice(userId: string, sponsorDealId: number) {
  try {
    const deal = await storage.getSponsorshipDeal(sponsorDealId);
    if (!deal) return { error: "Sponsor deal not found" };

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

    const prompt = `You are a professional invoicing assistant for content creators. Generate invoice line items for this sponsorship deal.

Brand: "${deal.brandName || "Unknown Brand"}"
Deal Value: $${deal.dealValue || 0}
Deal Type: ${"sponsorship"}
Deliverables: ${JSON.stringify(deal.deliverables || [])}
Notes: ${deal.notes || "None"}

Generate invoice details as JSON:
{
  "lineItems": [
    {
      "description": "Detailed description of the deliverable",
      "amount": number,
      "quantity": 1
    }
  ],
  "paymentTerms": "Net 30 | Net 15 | Due on receipt",
  "notes": "Any important invoice notes"
}

Split the deal value across the deliverables proportionally. Include any applicable usage rights or licensing fees as separate line items.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    let invoiceData;
    try {
      invoiceData = JSON.parse(content);
    } catch {
      console.error("[MonetizationEngine] Failed to parse invoice generation response");
      invoiceData = {};
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await db.insert(invoices).values({
      userId,
      sponsorDealId,
      invoiceNumber,
      brandName: deal.brandName || "Unknown",
      amount: deal.dealValue || 0,
      currency: "USD",
      dueDate,
      status: "draft",
      lineItems: invoiceData.lineItems || [],
    }).returning();

    return { invoice, ...invoiceData };
  } catch (error) {
    console.error("Failed to generate invoice:", error);
    return { error: "Unable to generate invoice" };
  }
}

export async function getInvoices(userId: string) {
  try {
    return await db.select().from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));
  } catch (error) {
    console.error("Failed to get invoices:", error);
    return [];
  }
}

export async function analyzeDeal(userId: string, dealId: number) {
  try {
    const deal = await storage.getSponsorshipDeal(dealId);
    if (!deal) return { error: "Deal not found" };

    const userRates = await db.select().from(sponsorRates)
      .where(eq(sponsorRates.userId, userId))
      .orderBy(desc(sponsorRates.lastCalculatedAt))
      .limit(3);

    const userChannels = await storage.getChannelsByUser(userId);
    const userVideos = await storage.getVideosByUser(userId);
    const avgViews = userVideos.length > 0
      ? userVideos.slice(0, 20).reduce((s, v) => s + (v.metadata?.stats?.views || v.metadata?.viewCount || 0), 0) / Math.min(userVideos.length, 20)
      : 0;

    const prompt = `You are a creator sponsorship advisor. Analyze if this deal is fair.

DEAL DETAILS:
- Brand: "${deal.brandName || "Unknown"}"
- Offered Value: $${deal.dealValue || 0}
- Deal Type: ${"sponsorship"}
- Deliverables: ${JSON.stringify(deal.deliverables || [])}
- Timeline: ${deal.endDate ? new Date(deal.endDate).toLocaleDateString() : "No deadline"}

CREATOR METRICS:
- Channels: ${userChannels.length}
- Average views: ${Math.round(avgViews)}
- Calculated rates: ${userRates.map(r => `${r.rateType}: $${r.calculatedRate?.toFixed(2)}`).join(", ") || "Not calculated"}

Analyze this deal as JSON:
{
  "fairnessScore": 0-100,
  "verdict": "great | fair | below_market | red_flag",
  "analysis": "Detailed analysis of the deal value vs market rate",
  "estimatedMarketValue": number,
  "negotiationTips": ["3-5 negotiation strategies"],
  "redFlags": ["Any concerns about this deal"],
  "counterOfferSuggestion": {
    "amount": number,
    "justification": "Why this counter-offer is reasonable"
  }
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      return JSON.parse(content);
    } catch {
      console.error("[MonetizationEngine] Failed to parse deal analysis response");
      return {};
    }
  } catch (error) {
    console.error("Failed to analyze deal:", error);
    return { fairnessScore: 50, verdict: "unknown", analysis: "Unable to analyze deal", negotiationTips: [], redFlags: [] };
  }
}
