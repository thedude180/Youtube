import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { revenueModels, revenueRecords, channels } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const MODEL_TYPES = ["sponsorship", "membership", "super_chat", "merch", "affiliate", "ads"] as const;

const MARKET_AVERAGES: Record<string, { rate: number; unit: string }> = {
  sponsorship: { rate: 25, unit: "per 1k views" },
  membership: { rate: 4.99, unit: "per month" },
  super_chat: { rate: 150, unit: "per stream hour" },
  merch: { rate: 8, unit: "profit per unit" },
  affiliate: { rate: 0.08, unit: "commission rate" },
  ads: { rate: 3.5, unit: "CPM" },
};

export async function analyzeRevenueStreams(userId: string) {
  sendSSEEvent(userId, "revenue_analysis_started", { status: "analyzing" });

  const [existingModels, records, userChannels] = await Promise.all([
    db.select().from(revenueModels).where(eq(revenueModels.userId, userId)),
    db.select().from(revenueRecords).where(eq(revenueRecords.userId, userId)).orderBy(desc(revenueRecords.recordedAt)).limit(100),
    db.select().from(channels).where(eq(channels.userId, userId)),
  ]);

  const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((sum, c) => sum + (c.viewCount || 0), 0);

  const revenueBySource: Record<string, number> = {};
  const verifiedBySource: Record<string, number> = {};
  let totalVerified = 0;
  let totalAmount = 0;
  for (const r of records) {
    revenueBySource[r.source] = (revenueBySource[r.source] || 0) + r.amount;
    totalAmount += r.amount;
    if (r.reconciliationStatus === "verified") {
      verifiedBySource[r.source] = (verifiedBySource[r.source] || 0) + r.amount;
      totalVerified += r.amount;
    }
  }
  const verificationRate = totalAmount > 0 ? (totalVerified / totalAmount) * 100 : 0;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a creator revenue optimization expert. Analyze this creator's revenue data and suggest optimizations for each revenue stream.

Creator stats:
- Total subscribers: ${totalSubs}
- Total views: ${totalViews}
- Platforms: ${userChannels.map(c => c.platform).join(", ")}

Revenue by source (last 100 records):
${JSON.stringify(revenueBySource, null, 2)}

Revenue verification status:
- Total revenue: $${totalAmount.toFixed(2)}
- Verified revenue: $${totalVerified.toFixed(2)} (${verificationRate.toFixed(0)}% verified)
- Estimated/unverified: $${(totalAmount - totalVerified).toFixed(2)}
NOTE: Factor verification status into confidence of your recommendations. Unverified revenue should not be treated as certain.

Existing revenue models:
${JSON.stringify(existingModels.map(m => ({ type: m.modelType, currentRate: m.currentRate, suggestedRate: m.suggestedRate })), null, 2)}

Market averages:
${JSON.stringify(MARKET_AVERAGES, null, 2)}

For each of these model types: ${MODEL_TYPES.join(", ")}

Provide your analysis as JSON:
{
  "models": [
    {
      "modelType": "sponsorship",
      "currentRate": null,
      "suggestedRate": 30,
      "marketAverage": 25,
      "rationale": "explanation of why this rate is suggested",
      "metrics": {
        "potentialMonthlyRevenue": 5000,
        "growthPotential": "high",
        "difficulty": "medium",
        "timeToImplement": "1-2 weeks"
      }
    }
  ],
  "topOpportunity": "which revenue stream has the most untapped potential",
  "overallAssessment": "brief overall revenue health assessment"
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for revenue analysis");
  const analysis = JSON.parse(content);

  const results = [];
  for (const model of analysis.models) {
    const existing = existingModels.find(m => m.modelType === model.modelType);
    if (existing) {
      const [updated] = await db.update(revenueModels)
        .set({
          suggestedRate: model.suggestedRate,
          marketAverage: model.marketAverage,
          rationale: model.rationale,
          metrics: model.metrics,
          lastOptimized: new Date(),
        })
        .where(eq(revenueModels.id, existing.id))
        .returning();
      results.push(updated);
    } else {
      const [created] = await db.insert(revenueModels).values({
        userId,
        modelType: model.modelType,
        currentRate: model.currentRate,
        suggestedRate: model.suggestedRate,
        marketAverage: model.marketAverage,
        rationale: model.rationale,
        metrics: model.metrics,
        lastOptimized: new Date(),
      }).returning();
      results.push(created);
    }
  }

  sendSSEEvent(userId, "revenue_analysis_complete", {
    models: results.length,
    topOpportunity: analysis.topOpportunity,
    overallAssessment: analysis.overallAssessment,
  });

  return {
    models: results,
    topOpportunity: analysis.topOpportunity,
    overallAssessment: analysis.overallAssessment,
  };
}

export async function getRevenueModels(userId: string) {
  return db.select()
    .from(revenueModels)
    .where(eq(revenueModels.userId, userId))
    .orderBy(desc(revenueModels.lastOptimized));
}

export async function optimizeSponsorshipRate(userId: string, modelType: string) {
  sendSSEEvent(userId, "rate_optimization_started", { modelType });

  const [userChannels, records] = await Promise.all([
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(revenueRecords)
      .where(and(eq(revenueRecords.userId, userId), eq(revenueRecords.source, modelType)))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(50),
  ]);

  const totalSubs = userChannels.reduce((sum, c) => sum + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((sum, c) => sum + (c.viewCount || 0), 0);
  const avgRevenue = records.length > 0
    ? records.reduce((sum, r) => sum + r.amount, 0) / records.length
    : 0;

  const marketAvg = MARKET_AVERAGES[modelType] || { rate: 0, unit: "unknown" };

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a creator monetization expert. Calculate the optimal rate for this revenue stream.

Revenue type: ${modelType}
Creator stats:
- Subscribers: ${totalSubs}
- Total views: ${totalViews}
- Platforms: ${userChannels.map(c => `${c.platform} (${c.subscriberCount || 0} subs)`).join(", ")}
- Average revenue per ${modelType} record: $${avgRevenue.toFixed(2)}
- Number of historical records: ${records.length}

Market average for ${modelType}: $${marketAvg.rate} ${marketAvg.unit}

Calculate the optimal rate considering audience size, engagement, niche value, and market conditions.

Respond as JSON:
{
  "suggestedRate": 35.00,
  "marketAverage": ${marketAvg.rate},
  "rationale": "detailed explanation of rate calculation",
  "negotiationTips": ["tip 1", "tip 2"],
  "metrics": {
    "estimatedMonthlyRevenue": 5000,
    "rateVsMarket": "14% above market",
    "confidenceLevel": "high",
    "factorsConsidered": ["audience size", "engagement rate", "niche CPM"]
  }
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for rate optimization");
  const optimization = JSON.parse(content);

  const existing = await db.select().from(revenueModels)
    .where(and(eq(revenueModels.userId, userId), eq(revenueModels.modelType, modelType)))
    .limit(1);

  let result;
  if (existing.length > 0) {
    [result] = await db.update(revenueModels)
      .set({
        suggestedRate: optimization.suggestedRate,
        marketAverage: optimization.marketAverage,
        rationale: optimization.rationale,
        metrics: optimization.metrics,
        lastOptimized: new Date(),
      })
      .where(eq(revenueModels.id, existing[0].id))
      .returning();
  } else {
    [result] = await db.insert(revenueModels).values({
      userId,
      modelType,
      suggestedRate: optimization.suggestedRate,
      marketAverage: optimization.marketAverage,
      rationale: optimization.rationale,
      metrics: optimization.metrics,
      lastOptimized: new Date(),
    }).returning();
  }

  sendSSEEvent(userId, "rate_optimization_complete", {
    modelType,
    suggestedRate: optimization.suggestedRate,
    marketAverage: optimization.marketAverage,
  });

  return {
    model: result,
    negotiationTips: optimization.negotiationTips,
  };
}

export async function generateRevenueReport(userId: string) {
  sendSSEEvent(userId, "revenue_report_started", { status: "generating" });

  const [models, records, userChannels] = await Promise.all([
    db.select().from(revenueModels).where(eq(revenueModels.userId, userId)),
    db.select().from(revenueRecords).where(eq(revenueRecords.userId, userId)).orderBy(desc(revenueRecords.recordedAt)).limit(200),
    db.select().from(channels).where(eq(channels.userId, userId)),
  ]);

  const totalRevenue = records.reduce((sum, r) => sum + r.amount, 0);
  const verifiedRev = records.filter(r => r.reconciliationStatus === "verified").reduce((sum, r) => sum + r.amount, 0);
  const estimatedRev = totalRevenue - verifiedRev;
  const verifyRate = totalRevenue > 0 ? (verifiedRev / totalRevenue) * 100 : 0;
  const revenueBySource: Record<string, number> = {};
  const revenueByPlatform: Record<string, number> = {};
  for (const r of records) {
    revenueBySource[r.source] = (revenueBySource[r.source] || 0) + r.amount;
    revenueByPlatform[r.platform] = (revenueByPlatform[r.platform] || 0) + r.amount;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{
      role: "user",
      content: `You are a creator business analyst. Generate a comprehensive revenue report for this creator.

Total revenue (recent records): $${totalRevenue.toFixed(2)}
- Verified revenue: $${verifiedRev.toFixed(2)} (${verifyRate.toFixed(0)}% verified)
- Estimated/unverified: $${estimatedRev.toFixed(2)}
IMPORTANT: Clearly distinguish verified vs estimated revenue in your analysis. Do not present estimates as settled facts.
Revenue by source: ${JSON.stringify(revenueBySource, null, 2)}
Revenue by platform: ${JSON.stringify(revenueByPlatform, null, 2)}

Channel stats:
${userChannels.map(c => `- ${c.platform}: ${c.subscriberCount || 0} subs, ${c.viewCount || 0} views`).join("\n")}

Current revenue models:
${JSON.stringify(models.map(m => ({
  type: m.modelType,
  currentRate: m.currentRate,
  suggestedRate: m.suggestedRate,
  marketAvg: m.marketAverage,
})), null, 2)}

Provide a comprehensive report as JSON:
{
  "summary": "2-3 sentence executive summary",
  "totalRevenue": ${totalRevenue},
  "revenueHealth": "healthy|growing|declining|underperforming",
  "topRevenueSource": "which source generates the most",
  "biggestOpportunity": "which untapped or underperforming stream has the most potential",
  "recommendations": [
    {
      "priority": "high",
      "action": "specific action to take",
      "expectedImpact": "$X/month increase",
      "timeframe": "how long to implement"
    }
  ],
  "projections": {
    "currentMonthlyRun": 0,
    "optimizedMonthlyProjection": 0,
    "potentialUplift": "percentage increase possible"
  },
  "risks": ["revenue risk 1", "revenue risk 2"],
  "diversificationScore": "0-100 how diversified the revenue streams are"
}`
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response for revenue report");
  const report = JSON.parse(content);

  sendSSEEvent(userId, "revenue_report_complete", {
    summary: report.summary,
    revenueHealth: report.revenueHealth,
    biggestOpportunity: report.biggestOpportunity,
  });

  return report;
}
