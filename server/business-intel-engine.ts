import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { taxEstimates, hiringRecommendations, revenueRecords } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

export async function generateTaxEstimate(userId: string, quarter: string, year: number) {
  const revenue = await db
    .select()
    .from(revenueRecords)
    .where(eq(revenueRecords.userId, userId))
    .orderBy(desc(revenueRecords.createdAt));

  const totalRevenue = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
  const platformBreakdown: Record<string, number> = {};
  for (const r of revenue) {
    platformBreakdown[r.platform] = (platformBreakdown[r.platform] || 0) + (r.amount || 0);
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `You are a tax estimation specialist for content creators. Estimate quarterly taxes based on this revenue data.

Quarter: ${quarter}
Year: ${year}
Total Revenue: $${totalRevenue.toFixed(2)}
Platform Breakdown: ${JSON.stringify(platformBreakdown)}
Revenue Records Count: ${revenue.length}

Estimate taxes for a US-based self-employed content creator. Consider:
1. Self-employment tax (15.3% on 92.35% of net earnings)
2. Federal income tax brackets
3. Common creator deductions (equipment, software, home office, internet, etc.)
4. State tax estimate (use a moderate state rate)

Return JSON:
{
  "estimate": {
    "estimatedIncome": 0,
    "estimatedDeductions": 0,
    "estimatedTax": 0,
    "federalTax": 0,
    "stateTax": 0,
    "selfEmploymentTax": 0,
    "state": "CA",
    "entityType": "sole_proprietor",
    "deductionBreakdown": {
      "equipment": 0,
      "software": 0,
      "homeOffice": 0,
      "internet": 0,
      "education": 0,
      "travel": 0,
      "other": 0
    },
    "incomeBreakdown": {
      "adRevenue": 0,
      "sponsorships": 0,
      "subscriptions": 0,
      "merchandise": 0,
      "other": 0
    },
    "recommendations": ["tax saving tips"],
    "dueDate": "${getDueDate(quarter, year)}"
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for tax estimate");

  const parsed = JSON.parse(content);
  const est = parsed.estimate;

  const [result] = await db
    .insert(taxEstimates)
    .values({
      userId,
      quarter,
      year,
      estimatedIncome: est.estimatedIncome,
      estimatedDeductions: est.estimatedDeductions,
      estimatedTax: est.estimatedTax,
      federalTax: est.federalTax,
      stateTax: est.stateTax,
      selfEmploymentTax: est.selfEmploymentTax,
      state: est.state,
      entityType: est.entityType,
      dueDate: new Date(est.dueDate),
      metadata: {
        deductionBreakdown: est.deductionBreakdown,
        incomeBreakdown: est.incomeBreakdown,
        recommendations: est.recommendations,
      },
    })
    .returning();

  sendSSEEvent(userId, "tax_estimate_generated", {
    quarter,
    year,
    estimatedTax: est.estimatedTax,
  });

  return result;
}

function getDueDate(quarter: string, year: number): string {
  const dueDates: Record<string, string> = {
    Q1: `${year}-04-15`,
    Q2: `${year}-06-15`,
    Q3: `${year}-09-15`,
    Q4: `${year + 1}-01-15`,
  };
  return dueDates[quarter] || `${year}-04-15`;
}

export async function getTaxEstimates(userId: string, year?: number) {
  if (year) {
    return db
      .select()
      .from(taxEstimates)
      .where(
        and(
          eq(taxEstimates.userId, userId),
          eq(taxEstimates.year, year)
        )
      )
      .orderBy(desc(taxEstimates.createdAt));
  }
  return db
    .select()
    .from(taxEstimates)
    .where(eq(taxEstimates.userId, userId))
    .orderBy(desc(taxEstimates.createdAt));
}

export async function analyzeTeamNeeds(userId: string) {
  const revenue = await db
    .select()
    .from(revenueRecords)
    .where(eq(revenueRecords.userId, userId))
    .orderBy(desc(revenueRecords.createdAt));

  const totalRevenue = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `You are a team scaling advisor for content creators. Analyze whether this creator needs to hire team members.

Creator Data:
- Total Revenue: $${totalRevenue.toFixed(2)}
- Revenue Sources: ${revenue.length} records
- Platforms Active: ${Array.from(new Set(revenue.map((r) => r.platform))).join(", ") || "multiple"}

Analyze workload indicators and recommend roles to hire. Consider:
1. Video editing capacity
2. Social media management needs
3. Community management
4. Business operations
5. Content strategy
6. Revenue level vs typical team scaling benchmarks

Return JSON:
{
  "recommendations": [
    {
      "role": "role title",
      "priority": "critical|high|medium|low",
      "rationale": "why this hire is needed",
      "estimatedCost": 0,
      "roiProjection": 0,
      "delegationTasks": ["tasks this person would handle"],
      "triggerMetric": "what metric triggered this recommendation",
      "triggerValue": 0
    }
  ],
  "summary": "overall team needs assessment",
  "currentCapacity": "assessment of current solo capacity"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for team analysis");

  const parsed = JSON.parse(content);
  const inserted = [];

  for (const rec of parsed.recommendations || []) {
    const [result] = await db
      .insert(hiringRecommendations)
      .values({
        userId,
        role: rec.role,
        priority: rec.priority,
        rationale: rec.rationale,
        estimatedCost: rec.estimatedCost,
        roiProjection: rec.roiProjection,
        workloadData: { summary: parsed.summary, currentCapacity: parsed.currentCapacity },
        delegationTasks: rec.delegationTasks || [],
        triggerMetric: rec.triggerMetric,
        triggerValue: rec.triggerValue,
        status: "suggested",
      })
      .returning();
    inserted.push(result);
  }

  sendSSEEvent(userId, "team_analysis_completed", {
    recommendationCount: inserted.length,
    summary: parsed.summary,
  });

  return { recommendations: inserted, summary: parsed.summary };
}

export async function getHiringRecommendations(userId: string) {
  return db
    .select()
    .from(hiringRecommendations)
    .where(eq(hiringRecommendations.userId, userId))
    .orderBy(desc(hiringRecommendations.createdAt));
}

export async function generateHiringRoadmap(userId: string) {
  const existing = await getHiringRecommendations(userId);

  const revenue = await db
    .select()
    .from(revenueRecords)
    .where(eq(revenueRecords.userId, userId))
    .orderBy(desc(revenueRecords.createdAt));

  const totalRevenue = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "user",
        content: `You are a team building strategist for content creators. Create a comprehensive hiring roadmap.

Current Revenue: $${totalRevenue.toFixed(2)}
Existing Recommendations: ${JSON.stringify(existing.map((r) => ({ role: r.role, priority: r.priority, estimatedCost: r.estimatedCost })))}

Create a phased hiring roadmap. Return JSON:
{
  "roadmap": {
    "currentPhase": "solo|micro_team|small_team|full_team",
    "phases": [
      {
        "phase": 1,
        "name": "phase name",
        "revenueThreshold": 0,
        "hires": [
          {
            "role": "role title",
            "type": "full_time|part_time|contractor|freelance",
            "estimatedMonthlyCost": 0,
            "keyResponsibilities": ["list of responsibilities"],
            "hiringTips": "how to find this person"
          }
        ],
        "expectedOutcome": "what this enables"
      }
    ],
    "totalMonthlyBudget": 0,
    "roiTimeline": "when to expect ROI from team",
    "costSavingTips": ["ways to reduce hiring costs"]
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI for hiring roadmap");

  const parsed = JSON.parse(content);

  sendSSEEvent(userId, "hiring_roadmap_generated", {
    currentPhase: parsed.roadmap.currentPhase,
    phaseCount: parsed.roadmap.phases?.length || 0,
  });

  return parsed.roadmap;
}
