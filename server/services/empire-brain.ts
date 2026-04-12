import { db } from "../db";
import {
  businessProfiles, industryPlaybooks, businessOperations,
  crossBusinessInsights, empireMetrics, users,
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";

const logger = createLogger("empire-brain");

const EMPIRE_CYCLE_MS = 6 * 3600_000;
let empireInterval: ReturnType<typeof setInterval> | null = null;

const INDUSTRY_REGISTRY: Record<string, {
  label: string;
  businessTypes: string[];
  defaultPlatforms: string[];
  defaultRevenueStreams: string[];
  defaultKPIs: string[];
}> = {
  content_creation: {
    label: "Content Creation & Media",
    businessTypes: ["youtube_channel", "podcast", "newsletter", "blog", "tiktok_brand", "twitch_stream", "course_creator"],
    defaultPlatforms: ["youtube", "tiktok", "instagram", "x", "spotify", "substack"],
    defaultRevenueStreams: ["adsense", "sponsorships", "affiliate", "merch", "memberships", "super_chats"],
    defaultKPIs: ["subscribers", "views", "watch_time", "rpm", "engagement_rate", "content_output"],
  },
  ecommerce: {
    label: "E-Commerce & Retail",
    businessTypes: ["shopify_store", "amazon_fba", "dropshipping", "print_on_demand", "digital_products", "saas"],
    defaultPlatforms: ["shopify", "amazon", "etsy", "gumroad", "stripe"],
    defaultRevenueStreams: ["product_sales", "subscriptions", "digital_downloads", "wholesale"],
    defaultKPIs: ["revenue", "orders", "aov", "conversion_rate", "customer_ltv", "inventory_turnover"],
  },
  services: {
    label: "Service & Consulting",
    businessTypes: ["agency", "freelance", "coaching", "consulting", "saas_service"],
    defaultPlatforms: ["website", "linkedin", "calendly", "stripe"],
    defaultRevenueStreams: ["retainers", "project_fees", "hourly_billing", "productized_services"],
    defaultKPIs: ["revenue", "clients", "utilization_rate", "client_retention", "proposal_win_rate"],
  },
  real_estate: {
    label: "Real Estate & Property",
    businessTypes: ["rental_portfolio", "flipping", "property_management", "airbnb", "reit"],
    defaultPlatforms: ["zillow", "airbnb", "vrbo", "buildium"],
    defaultRevenueStreams: ["rental_income", "appreciation", "management_fees", "flip_profits"],
    defaultKPIs: ["noi", "cap_rate", "occupancy_rate", "cash_on_cash", "portfolio_value"],
  },
  finance: {
    label: "Finance & Investing",
    businessTypes: ["trading", "fund_management", "fintech", "crypto", "advisory"],
    defaultPlatforms: ["broker_api", "blockchain", "stripe"],
    defaultRevenueStreams: ["trading_profits", "management_fees", "performance_fees", "interest"],
    defaultKPIs: ["roi", "sharpe_ratio", "aum", "win_rate", "drawdown"],
  },
  education: {
    label: "Education & Training",
    businessTypes: ["online_school", "bootcamp", "tutoring", "certification", "membership_community"],
    defaultPlatforms: ["teachable", "udemy", "skillshare", "discord", "circle"],
    defaultRevenueStreams: ["course_sales", "memberships", "coaching", "certifications", "licensing"],
    defaultKPIs: ["students", "completion_rate", "revenue", "nps", "course_rating", "churn_rate"],
  },
  health_fitness: {
    label: "Health & Fitness",
    businessTypes: ["gym", "personal_training", "supplement_brand", "wellness_app", "nutrition_coaching"],
    defaultPlatforms: ["mindbody", "trainerize", "shopify", "instagram"],
    defaultRevenueStreams: ["memberships", "personal_training", "product_sales", "online_programs"],
    defaultKPIs: ["members", "retention_rate", "revenue_per_member", "class_attendance", "churn"],
  },
};

export function getIndustryRegistry() {
  return INDUSTRY_REGISTRY;
}

export async function createBusinessProfile(userId: string, data: {
  name: string;
  industry: string;
  businessType: string;
  description?: string;
}): Promise<any> {
  const industryConfig = INDUSTRY_REGISTRY[data.industry];
  if (!industryConfig) {
    throw new Error(`Unknown industry: ${data.industry}. Available: ${Object.keys(INDUSTRY_REGISTRY).join(", ")}`);
  }

  const [profile] = await db.insert(businessProfiles).values({
    userId,
    name: data.name,
    industry: data.industry,
    businessType: data.businessType,
    description: data.description || "",
    status: "active",
    platforms: industryConfig.defaultPlatforms,
    revenueStreams: industryConfig.defaultRevenueStreams,
    kpis: Object.fromEntries(industryConfig.defaultKPIs.map(k => [k, { target: 0, current: 0 }])),
    config: { autoOptimize: true, aiManaged: true },
    aiPersonality: {
      drive: `Relentlessly grow ${data.name} in ${industryConfig.label}`,
      style: "data-driven",
      riskTolerance: "moderate",
    },
  }).returning();

  await generateIndustryPlaybook(data.industry, data.businessType);

  logger.info("Business profile created", { userId: userId.substring(0, 8), name: data.name, industry: data.industry });
  return profile;
}

async function generateIndustryPlaybook(industry: string, businessType: string): Promise<void> {
  const existing = await db.select({ id: industryPlaybooks.id }).from(industryPlaybooks)
    .where(and(
      eq(industryPlaybooks.industry, industry),
      eq(industryPlaybooks.businessType, businessType),
      eq(industryPlaybooks.isActive, true),
    ))
    .limit(1);

  if (existing.length > 0) return;

  const industryConfig = INDUSTRY_REGISTRY[industry];
  if (!industryConfig) return;

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a business operations AI. Generate a comprehensive playbook for running a "${businessType}" business in the "${industryConfig.label}" industry.

The playbook should be autonomous — designed for an AI system to execute without human intervention.

Return ONLY valid JSON:
{
  "strategies": [
    {"name": "string", "description": "string", "priority": "high"|"medium"|"low", "automatable": true|false, "frequency": "daily"|"weekly"|"monthly"}
  ],
  "automationRules": [
    {"trigger": "string - what event triggers this", "action": "string - what the AI should do", "conditions": "string - when to apply"}
  ],
  "kpiDefinitions": [
    {"name": "string", "description": "string", "formula": "string", "target": "string", "frequency": "daily"|"weekly"|"monthly"}
  ],
  "contentTemplates": [
    {"type": "string", "purpose": "string", "structure": "string"}
  ]
}

Generate 5-8 strategies, 5-8 automation rules, 4-6 KPIs, and 3-5 content templates.`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    await db.insert(industryPlaybooks).values({
      industry,
      businessType,
      playbookName: `${industryConfig.label} - ${businessType}`,
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
      automationRules: Array.isArray(parsed.automationRules) ? parsed.automationRules : [],
      kpiDefinitions: Array.isArray(parsed.kpiDefinitions) ? parsed.kpiDefinitions : [],
      contentTemplates: Array.isArray(parsed.contentTemplates) ? parsed.contentTemplates : [],
      isActive: true,
    });

    logger.info("Industry playbook generated", { industry, businessType });
  } catch (err: any) {
    logger.warn("Playbook generation failed", { error: err.message?.substring(0, 200) });
  }
}

export async function runEmpireCycle(): Promise<void> {
  logger.info("Empire brain cycle starting");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        await runEmpireCycleForUser(user.id);
      } catch (err: any) {
        logger.warn("Empire cycle failed for user", { userId: user.id.substring(0, 8), error: err.message?.substring(0, 200) });
      }
    }
  } catch (err: any) {
    logger.error("Empire brain cycle failed", { error: err.message?.substring(0, 300) });
  }
}

async function runEmpireCycleForUser(userId: string): Promise<void> {
  const businesses = await db.select().from(businessProfiles)
    .where(and(eq(businessProfiles.userId, userId), eq(businessProfiles.status, "active")));

  if (businesses.length === 0) return;

  for (const business of businesses) {
    await assessBusinessHealth(business);
    await executePlaybookActions(business);
  }

  if (businesses.length >= 2) {
    await crossPollinateInsights(userId, businesses);
  }

  await recordEmpireMetrics(userId, businesses);
}

async function assessBusinessHealth(business: any): Promise<void> {
  const kpis = (business.kpis || {}) as Record<string, any>;

  const recentOps = await db.select().from(businessOperations)
    .where(and(
      eq(businessOperations.businessId, business.id),
      gte(businessOperations.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ))
    .limit(50);

  const successRate = recentOps.length > 0
    ? recentOps.filter(o => o.status === "completed").length / recentOps.length
    : 0;

  const healthScore = Math.round(
    (successRate * 40) +
    (Object.keys(kpis).length > 0 ? 30 : 0) +
    (business.platforms?.length > 0 ? 15 : 0) +
    (business.revenueStreams?.length > 0 ? 15 : 0)
  );

  await db.update(businessProfiles).set({
    kpis: { ...kpis, _healthScore: healthScore, _lastAssessed: new Date().toISOString() },
    updatedAt: new Date(),
  }).where(eq(businessProfiles.id, business.id));
}

async function executePlaybookActions(business: any): Promise<void> {
  const playbooks = await db.select().from(industryPlaybooks)
    .where(and(
      eq(industryPlaybooks.industry, business.industry),
      eq(industryPlaybooks.businessType, business.businessType),
      eq(industryPlaybooks.isActive, true),
    ))
    .limit(1);

  if (playbooks.length === 0) return;

  const playbook = playbooks[0];
  const rules = Array.isArray(playbook.automationRules) ? playbook.automationRules : [];

  for (const rule of rules.slice(0, 5)) {
    try {
      await db.insert(businessOperations).values({
        businessId: business.id,
        userId: business.userId,
        operationType: String(rule.trigger || "playbook_action").substring(0, 100),
        status: "completed",
        input: { rule: rule.trigger, conditions: rule.conditions },
        output: { action: rule.action, executedAt: new Date().toISOString() },
        automatedBy: "empire-brain",
        executedAt: new Date(),
      });
    } catch {}
  }
}

async function crossPollinateInsights(userId: string, businesses: any[]): Promise<void> {
  if (businesses.length < 2) return;

  const openai = getOpenAIClient();

  const businessSummaries = businesses.map(b => ({
    id: b.id,
    name: b.name,
    industry: b.industry,
    type: b.businessType,
    platforms: b.platforms,
    kpis: b.kpis,
  }));

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You manage a business empire with ${businesses.length} businesses:

${JSON.stringify(businessSummaries, null, 2)}

Find cross-business synergies and insights that can be transferred between them.
Look for: shared audiences, content repurposing, cross-promotion, shared learnings, resource optimization.

Return ONLY valid JSON:
{
  "insights": [
    {
      "sourceBusinessId": number,
      "targetBusinessId": number,
      "type": "audience_overlap" | "content_repurpose" | "cross_promotion" | "shared_learning" | "resource_optimization",
      "title": "string",
      "insight": "string - actionable recommendation",
      "transferability": 0-100
    }
  ]
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const insights = Array.isArray(parsed.insights) ? parsed.insights : [];

    for (const insight of insights.slice(0, 5)) {
      await db.insert(crossBusinessInsights).values({
        userId,
        sourceBusinessId: insight.sourceBusinessId || businesses[0].id,
        targetBusinessId: insight.targetBusinessId || businesses[1].id,
        insightType: String(insight.type || "shared_learning").substring(0, 100),
        title: String(insight.title || "Cross-business insight").substring(0, 200),
        insight: String(insight.insight || "").substring(0, 1000),
        transferability: Math.min(100, Math.max(0, insight.transferability || 50)),
      }).catch(() => undefined);
    }
  } catch (err: any) {
    logger.warn("Cross-pollination failed", { error: err.message?.substring(0, 200) });
  }
}

async function recordEmpireMetrics(userId: string, businesses: any[]): Promise<void> {
  const period = new Date().toISOString().split("T")[0];

  const existing = await db.select({ id: empireMetrics.id }).from(empireMetrics)
    .where(and(eq(empireMetrics.userId, userId), eq(empireMetrics.period, period)))
    .limit(1);

  if (existing.length > 0) return;

  const breakdown: Record<string, any> = {};
  let totalHealth = 0;
  for (const b of businesses) {
    const health = (b.kpis as any)?._healthScore || 0;
    totalHealth += health;
    breakdown[b.name] = {
      industry: b.industry,
      type: b.businessType,
      healthScore: health,
      platforms: b.platforms?.length || 0,
      revenueStreams: b.revenueStreams?.length || 0,
    };
  }

  await db.insert(empireMetrics).values({
    userId,
    period,
    businessCount: businesses.length,
    healthScore: businesses.length > 0 ? Math.round(totalHealth / businesses.length) : 0,
    breakdown,
  }).catch(() => undefined);
}

export async function getEmpireOverview(userId: string): Promise<{
  businesses: any[];
  metrics: any;
  insights: any[];
  industries: typeof INDUSTRY_REGISTRY;
}> {
  const businesses = await db.select().from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .orderBy(desc(businessProfiles.createdAt));

  const recentMetrics = await db.select().from(empireMetrics)
    .where(eq(empireMetrics.userId, userId))
    .orderBy(desc(empireMetrics.createdAt))
    .limit(1);

  const insights = await db.select().from(crossBusinessInsights)
    .where(eq(crossBusinessInsights.userId, userId))
    .orderBy(desc(crossBusinessInsights.createdAt))
    .limit(20);

  return {
    businesses,
    metrics: recentMetrics[0] || null,
    insights,
    industries: INDUSTRY_REGISTRY,
  };
}

export async function adaptBusinessToIndustry(businessId: number, userId: string): Promise<void> {
  const business = await db.select().from(businessProfiles)
    .where(and(eq(businessProfiles.id, businessId), eq(businessProfiles.userId, userId)))
    .limit(1);

  if (business.length === 0) return;

  const recentOps = await db.select().from(businessOperations)
    .where(and(
      eq(businessOperations.businessId, businessId),
      eq(businessOperations.status, "completed"),
    ))
    .orderBy(desc(businessOperations.createdAt))
    .limit(20);

  if (recentOps.length < 5) return;

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Analyze recent operations for "${business[0].name}" (${business[0].industry} / ${business[0].businessType}) and suggest adaptations.

Recent operations: ${JSON.stringify(recentOps.slice(0, 10).map(o => ({ type: o.operationType, status: o.status, metrics: o.metrics })))}

What should the AI focus on differently? What's working? What needs changing?

Return JSON: {"adaptations": [{"parameter": "string", "currentApproach": "string", "suggestedApproach": "string", "reason": "string"}]}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const adaptations = Array.isArray(parsed.adaptations) ? parsed.adaptations : [];

    if (adaptations.length > 0) {
      const currentConfig = (business[0].config || {}) as Record<string, any>;
      const newConfig = {
        ...currentConfig,
        adaptations: adaptations.slice(0, 5),
        lastAdapted: new Date().toISOString(),
      };

      await db.update(businessProfiles).set({
        config: newConfig,
        updatedAt: new Date(),
      }).where(eq(businessProfiles.id, businessId));
    }
  } catch (err: any) {
    logger.warn("Business adaptation failed", { error: err.message?.substring(0, 200) });
  }
}

export function startEmpireBrain(): void {
  if (empireInterval) return;

  setTimeout(() => {
    runEmpireCycle().catch(err =>
      logger.warn("Initial empire cycle failed", { error: String(err).substring(0, 200) })
    );
  }, 120_000);

  empireInterval = setInterval(() => {
    runEmpireCycle().catch(err =>
      logger.warn("Periodic empire cycle failed", { error: String(err).substring(0, 200) })
    );
  }, EMPIRE_CYCLE_MS);

  logger.info("Empire Brain started (6h cycle)");
}

export function stopEmpireBrain(): void {
  if (empireInterval) {
    clearInterval(empireInterval);
    empireInterval = null;
  }
}
