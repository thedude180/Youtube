import { db } from "../db";
import {
  businessProfiles, industryPlaybooks, businessOperations,
  crossBusinessInsights, empireMetrics, users,
  channels, videos, revenueRecords,
} from "@shared/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";

const logger = createLogger("empire-brain");

const EMPIRE_CYCLE_MS = 90 * 60_000;
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

export interface ExpansionReadiness {
  overallScore: number;
  overallVerdict: "not_ready" | "getting_close" | "ready_for_channel" | "ready_for_empire";
  summary: string;
  currentState: {
    channelCount: number;
    totalSubscribers: number;
    totalVideos: number;
    totalViews: number;
    estimatedMonthlyRevenue: number;
    channelAge: string;
    contentConsistency: string;
  };
  pillars: {
    name: string;
    score: number;
    status: "red" | "yellow" | "green";
    detail: string;
  }[];
  expansionPaths: {
    path: string;
    type: "new_channel" | "new_business" | "both";
    readiness: number;
    reason: string;
    prerequisites: string[];
    estimatedTimeline: string;
    revenueImpact: string;
  }[];
  nextSteps: string[];
  aiRecommendation: string;
}

export async function assessExpansionReadiness(userId: string): Promise<ExpansionReadiness> {
  const userChannels = await db.select().from(channels)
    .where(eq(channels.userId, userId));

  const videoCountResult = await db.select({ total: count() }).from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(eq(channels.userId, userId));
  const totalVideos = videoCountResult[0]?.total || 0;

  const recentRevenue = await db.select().from(revenueRecords)
    .where(and(
      eq(revenueRecords.userId, userId),
      gte(revenueRecords.createdAt, new Date(Date.now() - 30 * 86400_000)),
    ));
  const monthlyRevenue = recentRevenue.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const existingBusinesses = await db.select().from(businessProfiles)
    .where(eq(businessProfiles.userId, userId));

  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const totalViews = userChannels.reduce((s, c) => s + (c.viewCount || 0), 0);
  const oldestChannel = userChannels.reduce((oldest, c) => {
    const ct = c.createdAt ? new Date(c.createdAt).getTime() : Date.now();
    return ct < oldest ? ct : oldest;
  }, Date.now());
  const channelAgeDays = Math.floor((Date.now() - oldestChannel) / 86400_000);

  const pillars: ExpansionReadiness["pillars"] = [];

  const subScore = totalSubs >= 10000 ? 100 : totalSubs >= 5000 ? 80 : totalSubs >= 1000 ? 60 : totalSubs >= 500 ? 40 : Math.round(totalSubs / 500 * 40);
  pillars.push({
    name: "Audience Size",
    score: subScore,
    status: subScore >= 70 ? "green" : subScore >= 40 ? "yellow" : "red",
    detail: `${totalSubs.toLocaleString()} subscribers across ${userChannels.length} channel(s). ${totalSubs >= 1000 ? "Solid base to build on." : "Growing — keep building before expanding."}`,
  });

  const revenueScore = monthlyRevenue >= 2000 ? 100 : monthlyRevenue >= 500 ? 70 : monthlyRevenue >= 100 ? 45 : monthlyRevenue > 0 ? 25 : 0;
  pillars.push({
    name: "Revenue Foundation",
    score: revenueScore,
    status: revenueScore >= 70 ? "green" : revenueScore >= 40 ? "yellow" : "red",
    detail: `$${monthlyRevenue.toFixed(0)}/month estimated. ${monthlyRevenue >= 500 ? "Revenue supports reinvestment into new ventures." : "Build revenue consistency before spreading resources."}`,
  });

  const consistencyScore = totalVideos >= 100 ? 100 : totalVideos >= 50 ? 80 : totalVideos >= 20 ? 55 : totalVideos >= 10 ? 35 : Math.round(totalVideos / 10 * 35);
  const consistency = totalVideos >= 50 ? "strong" : totalVideos >= 20 ? "building" : "early";
  pillars.push({
    name: "Content Consistency",
    score: consistencyScore,
    status: consistencyScore >= 70 ? "green" : consistencyScore >= 40 ? "yellow" : "red",
    detail: `${totalVideos} videos published. ${consistency === "strong" ? "Proven track record — ready to replicate." : "Keep the content engine running consistently first."}`,
  });

  const ageScore = channelAgeDays >= 365 ? 100 : channelAgeDays >= 180 ? 75 : channelAgeDays >= 90 ? 50 : channelAgeDays >= 30 ? 30 : 15;
  pillars.push({
    name: "Operational Maturity",
    score: ageScore,
    status: ageScore >= 70 ? "green" : ageScore >= 40 ? "yellow" : "red",
    detail: `${channelAgeDays} days active. ${channelAgeDays >= 180 ? "Systems are battle-tested." : "Let the current setup run longer to find and fix weak spots."}`,
  });

  const automationScore = 85;
  pillars.push({
    name: "AI Automation Level",
    score: automationScore,
    status: "green",
    detail: "35 cron jobs, 30+ engines, 7 event reactions — system is highly autonomous. AI can handle additional businesses.",
  });

  const overallScore = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);

  let overallVerdict: ExpansionReadiness["overallVerdict"];
  if (overallScore >= 75) overallVerdict = "ready_for_empire";
  else if (overallScore >= 60) overallVerdict = "ready_for_channel";
  else if (overallScore >= 40) overallVerdict = "getting_close";
  else overallVerdict = "not_ready";

  const expansionPaths: ExpansionReadiness["expansionPaths"] = [];

  expansionPaths.push({
    path: "Second YouTube Channel (Different Game/Niche)",
    type: "new_channel",
    readiness: Math.min(100, Math.round(overallScore * 1.1)),
    reason: "Lowest risk expansion. Reuses all existing YouTube systems, AI engines, and playbooks. Just a different content niche.",
    prerequisites: totalSubs < 1000
      ? ["Reach 1,000 subscribers on main channel", "Maintain consistent upload schedule for 3+ months"]
      : totalSubs < 5000
        ? ["Reach 5,000 subscribers for stronger foundation", "Ensure monthly revenue covers basic costs"]
        : ["You meet the prerequisites for this expansion path"],
    estimatedTimeline: totalSubs >= 5000 ? "Can start now" : totalSubs >= 1000 ? "2-4 weeks of preparation" : "3-6 months of growth first",
    revenueImpact: "Potential 50-100% revenue increase within 6 months if niche is complementary",
  });

  expansionPaths.push({
    path: "Multi-Platform Content Brand (TikTok/Instagram/X)",
    type: "new_channel",
    readiness: Math.min(100, Math.round(overallScore * 0.95)),
    reason: "Repurpose existing YouTube content to other platforms. The Smart Content Distributor already handles multi-platform scheduling.",
    prerequisites: totalVideos < 20
      ? ["Build a library of 20+ videos to repurpose from", "Establish your content style first"]
      : ["Content library ready for repurposing", "Distribution engine already built"],
    estimatedTimeline: totalVideos >= 20 ? "Can start immediately — distributor handles it" : "Build content library first (1-3 months)",
    revenueImpact: "Indirect — drives audience to YouTube for ad revenue, builds brand for sponsorships",
  });

  expansionPaths.push({
    path: "Gaming Merch / Digital Products Store",
    type: "new_business",
    readiness: Math.min(100, Math.round((subScore * 0.4 + revenueScore * 0.3 + consistencyScore * 0.3))),
    reason: "Monetize your audience directly. Gaming fans buy merch, wallpapers, guides. E-commerce playbook already available in the system.",
    prerequisites: totalSubs < 1000
      ? ["Build audience to 1,000+ subscribers first", "Establish brand identity and loyal viewers"]
      : monthlyRevenue < 100
        ? ["Generate some revenue first to prove audience willingness to engage", "Test with simple digital products before physical merch"]
        : ["Audience and revenue foundation in place"],
    estimatedTimeline: totalSubs >= 1000 ? "4-6 weeks to launch" : "After reaching 1,000 subscribers",
    revenueImpact: "$200-2,000/month depending on audience size and product-market fit",
  });

  expansionPaths.push({
    path: "Gaming Content Network (Multiple Channels + Merch + Community)",
    type: "both",
    readiness: Math.min(100, Math.round(overallScore * 0.7)),
    reason: "Full empire play — multiple YouTube channels feeding into a merch store, Discord community, and cross-promoted brand.",
    prerequisites: [
      ...(totalSubs < 5000 ? ["Grow main channel to 5,000+ subscribers"] : []),
      ...(monthlyRevenue < 500 ? ["Build to $500+/month revenue"] : []),
      ...(totalVideos < 50 ? ["Publish 50+ videos to prove consistency"] : []),
      ...(channelAgeDays < 180 ? ["Operate for 6+ months to build systems knowledge"] : []),
      ...(totalSubs >= 5000 && monthlyRevenue >= 500 && totalVideos >= 50 && channelAgeDays >= 180 ? ["All prerequisites met — you're ready for empire mode"] : []),
    ],
    estimatedTimeline: overallScore >= 75 ? "Ready to begin phased rollout" : overallScore >= 50 ? "3-6 months of growth" : "6-12 months of foundation building",
    revenueImpact: "$2,000-10,000+/month at scale with diversified income streams",
  });

  expansionPaths.push({
    path: "Coaching / Course Creator (Teach Gaming Content Creation)",
    type: "new_business",
    readiness: Math.min(100, Math.round((subScore * 0.3 + consistencyScore * 0.4 + ageScore * 0.3))),
    reason: "Once you've proven the model works, teach others. Education playbook available. High margins, builds authority.",
    prerequisites: [
      ...(totalSubs < 10000 ? ["Build to 10,000+ subscribers for credibility"] : []),
      ...(totalVideos < 100 ? ["Publish 100+ videos to have proven expertise"] : []),
      ...(channelAgeDays < 365 ? ["Operate for 1+ year to have real results to share"] : []),
    ],
    estimatedTimeline: totalSubs >= 10000 && totalVideos >= 100 ? "Ready to start" : "12-18 months from current position",
    revenueImpact: "$1,000-5,000/month from courses and coaching packages",
  });

  const openai = getOpenAIClient();
  let aiRecommendation = "";

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are the AI business advisor for a gaming YouTube channel empire. Based on these metrics, give a personalized 3-4 sentence recommendation on what to do next for expansion.

Current state:
- Channels: ${userChannels.length}
- Subscribers: ${totalSubs.toLocaleString()}
- Videos: ${totalVideos}
- Monthly Revenue: $${monthlyRevenue.toFixed(0)}
- Channel Age: ${channelAgeDays} days
- Existing businesses beyond YouTube: ${existingBusinesses.length}
- Overall readiness score: ${overallScore}/100
- Verdict: ${overallVerdict}

Pillar scores: ${JSON.stringify(pillars.map(p => ({ name: p.name, score: p.score, status: p.status })))}

Be specific, actionable, and encouraging. Mention the single best next move.`,
      }],
      max_completion_tokens: 500,
      temperature: 0.7,
    });
    aiRecommendation = resp.choices[0]?.message?.content || "";
  } catch {
    aiRecommendation = overallScore >= 75
      ? "Your foundation is solid. Consider launching a second channel in a complementary niche to multiply your reach."
      : overallScore >= 50
        ? "You're building momentum. Focus on consistency and revenue growth on your main channel before expanding."
        : "Focus all energy on your main channel right now. Build the audience, prove the content model, then expand.";
  }

  const nextSteps: string[] = [];
  if (subScore < 60) nextSteps.push("Focus on subscriber growth — optimize thumbnails, titles, and upload frequency");
  if (revenueScore < 60) nextSteps.push("Diversify revenue — enable memberships, explore sponsorships, add affiliate links");
  if (consistencyScore < 60) nextSteps.push("Increase content output — aim for at least 3 uploads per week");
  if (ageScore < 60) nextSteps.push("Keep running the current systems — let them mature and collect data");
  if (overallScore >= 70 && existingBusinesses.length === 0) nextSteps.push("You're ready to explore expansion — consider adding a second channel or launching a merch store");
  if (existingBusinesses.length > 0) nextSteps.push(`You have ${existingBusinesses.length} business(es) in the system — the Empire Brain is actively optimizing them`);
  if (nextSteps.length === 0) nextSteps.push("Keep doing what you're doing — the AI is handling everything autonomously");

  const channelAgeStr = channelAgeDays >= 365
    ? `${Math.floor(channelAgeDays / 365)}y ${Math.floor((channelAgeDays % 365) / 30)}m`
    : channelAgeDays >= 30
      ? `${Math.floor(channelAgeDays / 30)} months`
      : `${channelAgeDays} days`;

  const verdictSummary: Record<string, string> = {
    not_ready: "Focus on your main channel. The foundation needs to be stronger before expanding.",
    getting_close: "You're building a solid base. A few more milestones and you'll be ready to expand.",
    ready_for_channel: "Your YouTube operation is strong enough to support a second channel.",
    ready_for_empire: "Your systems are mature. You can confidently expand into multiple channels and new businesses.",
  };

  return {
    overallScore,
    overallVerdict,
    summary: verdictSummary[overallVerdict],
    currentState: {
      channelCount: userChannels.length,
      totalSubscribers: totalSubs,
      totalVideos,
      totalViews,
      estimatedMonthlyRevenue: monthlyRevenue,
      channelAge: channelAgeStr,
      contentConsistency: consistency,
    },
    pillars,
    expansionPaths: expansionPaths.sort((a, b) => b.readiness - a.readiness),
    nextSteps,
    aiRecommendation,
  };
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
