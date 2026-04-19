import { sanitizeForPrompt, sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { systemImprovements, discoveredStrategies, users, channels, videos, autopilotQueue } from "@shared/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import { jitter } from "../lib/timer-utils";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";

const logger = createLogger("infinite-evolution");

const EVOLUTION_CYCLE_MS = 60 * 60_000;
let evolutionInterval: ReturnType<typeof setInterval> | null = null;

const evoStore = createEngineStore("infinite-evolution", 10 * 60_000);

function ensureEvoUserRegistered(userId: string) {
  registerUserQueries(evoStore, userId, {
    improvements_30d: () => db.select().from(systemImprovements)
      .where(and(
        eq(systemImprovements.userId, userId),
        gte(systemImprovements.createdAt, new Date(Date.now() - 30 * 86400_000)),
      )).limit(200),
    strategies_active: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true))).limit(50),
    channels: () => db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube"))),
  });
}

const SYSTEM_DOMAINS = [
  {
    name: "seo_optimization",
    label: "SEO & Discovery",
    description: "Title writing, description hooks, tags, chapters, search ranking tactics",
    metricsQuery: "seo",
  },
  {
    name: "thumbnail_design",
    label: "Thumbnail Design",
    description: "CTR optimization, visual patterns, color psychology, text overlay strategy",
    metricsQuery: "thumbnail",
  },
  {
    name: "content_extraction",
    label: "Content Extraction & Editing",
    description: "Clip selection, moment detection, pacing, short vs long-form decisions, exhaustion efficiency",
    metricsQuery: "clip",
  },
  {
    name: "scheduling_distribution",
    label: "Scheduling & Distribution",
    description: "Upload timing, platform distribution, daily limits, peak hour targeting, spacing strategy",
    metricsQuery: "schedule",
  },
  {
    name: "audience_retention",
    label: "Audience Retention & Watch Time",
    description: "Hook quality, pacing cadence, chapter design, end screen strategy, viewer drop-off prevention",
    metricsQuery: "retention",
  },
  {
    name: "revenue_optimization",
    label: "Revenue & Monetization",
    description: "RPM optimization, sponsorship timing, merch placement, membership conversion, ad break placement",
    metricsQuery: "revenue",
  },
  {
    name: "growth_strategy",
    label: "Growth & Audience Building",
    description: "Subscriber acquisition, community engagement, collaboration strategy, trend riding",
    metricsQuery: "growth",
  },
  {
    name: "ai_prompts",
    label: "AI Prompt Engineering",
    description: "Quality of AI-generated titles, descriptions, thumbnails, clip selections — improving the AI's own outputs",
    metricsQuery: "ai",
  },
  {
    name: "automation_efficiency",
    label: "Automation & Pipeline Efficiency",
    description: "Processing speed, error rates, queue management, cron reliability, resource usage",
    metricsQuery: "automation",
  },
  {
    name: "compliance_safety",
    label: "Compliance & Platform Safety",
    description: "TOS adherence, copyright avoidance, community guidelines, strike prevention, brand safety",
    metricsQuery: "compliance",
  },
];

export async function runEvolutionCycle(): Promise<void> {
  logger.info("Infinite evolution cycle starting — improving all systems");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(10);

    for (const user of allUsers) {
      try {
        await evolveAllSystems(user.id);
      } catch (err: any) {
        logger.warn(`[${user.id.substring(0, 8)}] Evolution cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Infinite evolution cycle error: ${err.message?.substring(0, 300)}`);
  }
}

async function evolveAllSystems(userId: string): Promise<void> {
  const systemHealth = await auditAllSystems(userId);
  const weakest = systemHealth.sort((a, b) => a.score - b.score);

  for (const system of weakest.slice(0, 4)) {
    try {
      await improveSystem(userId, system);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      logger.warn(`[${userId.substring(0, 8)}] Failed to improve ${sanitizeForPrompt(system.domain)}: ${err.message?.substring(0, 200)}`);
    }
  }

  await evolveAIPrompts(userId);
  await auditAutomationHealth(userId);
  await crossSystemLearning(userId, systemHealth);
}

interface SystemAudit {
  domain: string;
  label: string;
  score: number;
  recentImprovements: number;
  activeStrategies: number;
  lastImprovedAt: string | null;
  weaknesses: string[];
}

async function auditAllSystems(userId: string): Promise<SystemAudit[]> {
  ensureEvoUserRegistered(userId);
  const audits: SystemAudit[] = [];

  const allImprovements = await getUserData<any>(evoStore, userId, "improvements_30d");
  const allStrategies = await getUserData<any>(evoStore, userId, "strategies_active");

  for (const domain of SYSTEM_DOMAINS) {
    const improvements = allImprovements.filter((i: any) => i.area === domain.name);
    const strategies = allStrategies.filter((s: any) => s.strategyType === domain.name);

    const domainImprovementsSorted = improvements.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastImprovement = domainImprovementsSorted[0];

    const daysSinceImprovement = lastImprovement?.createdAt
      ? Math.floor((Date.now() - new Date(lastImprovement.createdAt).getTime()) / 86400_000)
      : 999;

    const recencyPenalty = Math.min(30, daysSinceImprovement * 2);
    const score = Math.max(0, Math.min(100,
      (improvements.length * 5) +
      (strategies.length * 10) -
      recencyPenalty +
      20
    ));

    audits.push({
      domain: domain.name,
      label: domain.label,
      score,
      recentImprovements: improvements.length,
      activeStrategies: strategies.length,
      lastImprovedAt: lastImprovement?.createdAt?.toISOString?.() || (lastImprovement?.createdAt ? String(lastImprovement.createdAt) : null),
      weaknesses: [],
    });
  }

  return audits;
}

async function improveSystem(userId: string, system: SystemAudit): Promise<void> {
  const domainConfig = SYSTEM_DOMAINS.find(d => d.name === system.domain);
  if (!domainConfig) return;

  const existingStrategies = await db.select().from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.userId, userId),
      eq(discoveredStrategies.strategyType, system.domain),
    ))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(10);

  const recentImprovements = await db.select().from(systemImprovements)
    .where(and(
      eq(systemImprovements.userId, userId),
      eq(systemImprovements.area, system.domain),
    ))
    .orderBy(desc(systemImprovements.createdAt))
    .limit(5);

  const performanceData = await gatherDomainMetrics(userId, system.domain);

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are an AI system architect that continuously improves itself. You are analyzing the "${sanitizeForPrompt(domainConfig.label)}" subsystem.

DOMAIN: ${sanitizeForPrompt(domainConfig.description)}
CURRENT SCORE: ${sanitizeForPrompt(system.score)}/100
RECENT IMPROVEMENTS: ${sanitizeForPrompt(system.recentImprovements)} in last 30 days
ACTIVE STRATEGIES: ${sanitizeForPrompt(system.activeStrategies)}

Existing strategies (what's already working):
${existingStrategies.map(s => `- ${sanitizeForPrompt(s.title)} (${sanitizeForPrompt(s.effectiveness)}% effective, used ${sanitizeForPrompt(s.timesApplied)}x)`).join("\n") || "None discovered yet"}

Recent improvements made:
${recentImprovements.map(i => `- ${sanitizeForPrompt(i.improvementType)}: ${(i.afterState || "").substring(0, 100)}`).join("\n") || "No recent improvements"}

Performance data:
${JSON.stringify(sanitizeObjectForPrompt(performanceData), null, 2)}

YOUR MISSION: Find ways to make this system BETTER. Think beyond incremental — look for breakthrough improvements.

Consider:
1. What patterns in the data suggest the system is underperforming?
2. What industry best practices are we NOT following?
3. What experiments could we run to test improvements?
4. What assumptions is the system making that might be wrong?
5. What worked before that we should double down on?
6. What's the single biggest lever we're not pulling?

Return JSON:
{
  "diagnosis": "honest assessment of this system's current state",
  "improvements": [
    {
      "title": "string — clear, actionable improvement",
      "description": "what to change and why",
      "expectedImpact": "high|medium|low",
      "implementationApproach": "string — specific steps",
      "metric": "string — how to measure success"
    }
  ],
  "newStrategies": [
    {
      "title": "string",
      "description": "string",
      "priority": "high|medium|low"
    }
  ],
  "experiment": {
    "hypothesis": "string — what we believe will improve performance",
    "test": "string — how to test it",
    "successCriteria": "string — what would prove us right"
  }
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];
    for (const imp of improvements.slice(0, 3)) {
      await db.insert(systemImprovements).values({
        userId,
        improvementType: "system_evolution",
        area: system.domain,
        beforeState: parsed.diagnosis?.substring(0, 500) || `Score: ${sanitizeForPrompt(system.score)}`,
        afterState: `${sanitizeForPrompt(imp.title)}: ${sanitizeForPrompt(imp.description)}`.substring(0, 500),
        triggerEvent: "infinite_evolution_cycle",
        engineSource: "infinite-evolution-engine",
        appliedAcrossChannels: true,
        measuredImpact: {
          expectedImpact: imp.expectedImpact,
          implementation: imp.implementationApproach,
          metric: imp.metric,
          experiment: parsed.experiment,
        },
      });
    }

    const newStrategies = Array.isArray(parsed.newStrategies) ? parsed.newStrategies : [];
    for (const strat of newStrategies.slice(0, 2)) {
      await db.insert(discoveredStrategies).values({
        userId,
        title: String(strat.title).substring(0, 200),
        description: String(strat.description).substring(0, 1000),
        strategyType: system.domain,
        source: "infinite_evolution",
        effectiveness: 50,
        isActive: true,
        metadata: { priority: strat.priority, fromEvolution: true },
      }).catch(() => undefined);

      await recordEngineKnowledge("infinite-evolution", userId, "evolved_strategy", system.domain, String(strat.title).substring(0, 200) + ": " + String(strat.description).substring(0, 200), `From system audit score ${sanitizeForPrompt(system.score)}, priority: ${sanitizeForPrompt(strat.priority)}`, 55);
    }

    for (const imp of improvements.slice(0, 2)) {
      await recordEngineKnowledge("infinite-evolution", userId, "system_improvement", system.domain, `${sanitizeForPrompt(imp.title)}: ${sanitizeForPrompt(imp.description)}`.substring(0, 400), `Expected impact: ${sanitizeForPrompt(imp.expectedImpact)}, metric: ${sanitizeForPrompt(imp.metric)}`, 60);
    }

    logger.info(`[${userId.substring(0, 8)}] Evolved ${sanitizeForPrompt(system.domain)}: ${improvements.length} improvements, ${newStrategies.length} new strategies`);
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] System improvement failed for ${sanitizeForPrompt(system.domain)}: ${err.message?.substring(0, 200)}`);
  }
}

async function gatherDomainMetrics(userId: string, domain: string): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};

  try {
    const allVideos = await storage.getVideosByUser(userId);
    const published = allVideos.filter((v: any) => (v.metadata as any)?.youtubeId);

    metrics.totalVideos = allVideos.length;
    metrics.publishedVideos = published.length;

    if (domain === "seo_optimization") {
      const optimized = published.filter((v: any) => (v.metadata as any)?.aiOptimized);
      metrics.seoOptimizedCount = optimized.length;
      metrics.seoOptimizedPct = published.length > 0 ? Math.round(optimized.length / published.length * 100) : 0;
      const avgViews = published.length > 0 ? published.reduce((s, v) => s + ((v.metadata as any)?.viewCount || 0), 0) / published.length : 0;
      const optimizedAvgViews = optimized.length > 0 ? optimized.reduce((s, v) => s + ((v.metadata as any)?.viewCount || 0), 0) / optimized.length : 0;
      metrics.avgViews = Math.round(avgViews);
      metrics.optimizedAvgViews = Math.round(optimizedAvgViews);
      metrics.seoLift = avgViews > 0 ? `${Math.round((optimizedAvgViews / avgViews - 1) * 100)}%` : "no data";
    }

    if (domain === "thumbnail_design") {
      const redesigned = published.filter((v: any) => (v.metadata as any)?.thumbnailRedesigned);
      metrics.thumbnailsRedesigned = redesigned.length;
      metrics.avgCTR = "tracking via YouTube analytics";
    }

    if (domain === "content_extraction") {
      const clipsResult = await db.select({ total: count() }).from(autopilotQueue)
        .where(eq(autopilotQueue.userId, userId));
      metrics.totalClipsGenerated = clipsResult[0]?.total || 0;
      metrics.avgClipsPerVideo = published.length > 0
        ? Math.round((clipsResult[0]?.total || 0) / published.length * 10) / 10
        : 0;
    }

    if (domain === "scheduling_distribution") {
      const scheduled = await db.select({ total: count() }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
        ));
      const failed = await db.select({ total: count() }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "failed"),
        ));
      metrics.published = scheduled[0]?.total || 0;
      metrics.failed = failed[0]?.total || 0;
      metrics.successRate = (scheduled[0]?.total || 0) + (failed[0]?.total || 0) > 0
        ? Math.round((scheduled[0]?.total || 0) / ((scheduled[0]?.total || 0) + (failed[0]?.total || 0)) * 100)
        : 100;
    }

    if (domain === "audience_retention") {
      const withRetention = published.filter((v: any) => (v.metadata as any)?.pacingEnhanced);
      metrics.pacingEnhancedCount = withRetention.length;
      metrics.pacingCoverage = published.length > 0 ? Math.round(withRetention.length / published.length * 100) : 0;
    }

    if (domain === "automation_efficiency") {
      const recentErrors = await db.select({ total: count() }).from(autopilotQueue)
        .where(and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "failed"),
          gte(autopilotQueue.createdAt, new Date(Date.now() - 7 * 86400_000)),
        ));
      metrics.recentFailures = recentErrors[0]?.total || 0;
    }
  } catch {}

  return metrics;
}

async function evolveAIPrompts(userId: string): Promise<void> {
  const recentImprovements = await db.select().from(systemImprovements)
    .where(and(
      eq(systemImprovements.userId, userId),
      eq(systemImprovements.area, "ai_prompts"),
      gte(systemImprovements.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ));

  if (recentImprovements.length >= 3) return;

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a prompt engineering expert. You are responsible for improving the AI prompts used across an autonomous YouTube gaming channel OS.

The system uses gpt-4o-mini for:
1. Title generation (viral, high-CTR, curiosity gap)
2. Description writing (SEO-optimized, hook-first)
3. Thumbnail design guidance (visual composition instructions)
4. Clip moment selection (finding viral-worthy segments in gameplay)
5. Content repurposing (turning videos into blog posts, tweets, captions)
6. Strategy generation (playbook creation for business operations)
7. Self-reflection and goal setting

For a NO COMMENTARY PS5 gaming channel, analyze how prompts could be improved.

Think about:
- Are we being specific enough about the gaming niche?
- Are we using the right psychological triggers for gaming audiences?
- Are we leveraging gaming-specific SEO patterns?
- Are we missing emerging prompt engineering techniques?

Return JSON:
{
  "promptImprovements": [
    {
      "area": "string — which prompt this improves",
      "currentWeakness": "string — what's wrong now",
      "improvedApproach": "string — the better way",
      "expectedBenefit": "string"
    }
  ],
  "metaInsight": "string — big-picture observation about our prompt strategy"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
      temperature: 0.8,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const improvements = Array.isArray(parsed.promptImprovements) ? parsed.promptImprovements : [];
    for (const imp of improvements.slice(0, 3)) {
      await db.insert(systemImprovements).values({
        userId,
        improvementType: "prompt_evolution",
        area: "ai_prompts",
        beforeState: String(imp.currentWeakness).substring(0, 500),
        afterState: String(imp.improvedApproach).substring(0, 500),
        triggerEvent: "infinite_evolution_cycle",
        engineSource: "infinite-evolution-engine",
        measuredImpact: {
          promptArea: imp.area,
          expectedBenefit: imp.expectedBenefit,
          metaInsight: parsed.metaInsight,
        },
      });
    }

    if (improvements.length > 0) {
      logger.info(`[${userId.substring(0, 8)}] AI prompts evolved: ${improvements.length} improvements`);
    }
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Prompt evolution failed: ${err.message?.substring(0, 200)}`);
  }
}

async function auditAutomationHealth(userId: string): Promise<void> {
  const recentFailed = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "failed"),
      gte(autopilotQueue.createdAt, new Date(Date.now() - 48 * 3600_000)),
    ))
    .limit(20);

  if (recentFailed.length === 0) return;

  const failurePatterns = new Map<string, number>();
  for (const item of recentFailed) {
    const meta = (item.metadata as any) || {};
    const reason = meta.failReason || meta.error || item.type || "unknown";
    const key = String(reason).substring(0, 100);
    failurePatterns.set(key, (failurePatterns.get(key) || 0) + 1);
  }

  const topFailures = Array.from(failurePatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topFailures.length > 0) {
    await db.insert(systemImprovements).values({
      userId,
      improvementType: "automation_audit",
      area: "automation_efficiency",
      beforeState: `${recentFailed.length} failures in 48h`,
      afterState: `Top failure patterns: ${topFailures.map(([k, v]) => `${k} (${v}x)`).join(", ")}`.substring(0, 500),
      triggerEvent: "infinite_evolution_cycle",
      engineSource: "infinite-evolution-engine",
      measuredImpact: { failures: topFailures.map(([reason, count]) => ({ reason, count })) },
    });

    logger.info(`[${userId.substring(0, 8)}] Automation audit: ${recentFailed.length} failures, ${topFailures.length} patterns identified`);
  }
}

async function crossSystemLearning(userId: string, systemHealth: SystemAudit[]): Promise<void> {
  const topPerformers = systemHealth.filter(s => s.score >= 70).sort((a, b) => b.score - a.score);
  const underperformers = systemHealth.filter(s => s.score < 40);

  if (topPerformers.length === 0 || underperformers.length === 0) return;

  const openai = getOpenAIClient();

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a systems architect. Analyze what makes strong systems strong and apply those patterns to weak systems.

STRONG SYSTEMS (score 70+):
${topPerformers.map(s => `- ${sanitizeForPrompt(s.label)}: score ${sanitizeForPrompt(s.score)}, ${sanitizeForPrompt(s.recentImprovements)} recent improvements, ${sanitizeForPrompt(s.activeStrategies)} strategies`).join("\n")}

WEAK SYSTEMS (score <40):
${underperformers.map(s => `- ${sanitizeForPrompt(s.label)}: score ${sanitizeForPrompt(s.score)}, ${sanitizeForPrompt(s.recentImprovements)} recent improvements, ${sanitizeForPrompt(s.activeStrategies)} strategies`).join("\n")}

What patterns from the strong systems can be transferred to fix the weak ones?

Return JSON:
{
  "transfers": [
    {
      "fromSystem": "string",
      "toSystem": "string",
      "pattern": "string — what works in the strong system",
      "application": "string — how to apply it to the weak system",
      "expectedLift": "string"
    }
  ],
  "systemicIssue": "string — is there a root cause affecting multiple weak systems?"
}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const transfers = Array.isArray(parsed.transfers) ? parsed.transfers : [];

    for (const transfer of transfers.slice(0, 3)) {
      await db.insert(systemImprovements).values({
        userId,
        improvementType: "cross_system_transfer",
        area: String(transfer.toSystem || "general").substring(0, 100),
        beforeState: `Pattern from ${sanitizeForPrompt(transfer.fromSystem)}: ${sanitizeForPrompt(transfer.pattern)}`.substring(0, 500),
        afterState: `Applied to ${sanitizeForPrompt(transfer.toSystem)}: ${sanitizeForPrompt(transfer.application)}`.substring(0, 500),
        triggerEvent: "cross_system_learning",
        engineSource: "infinite-evolution-engine",
        appliedAcrossChannels: true,
        measuredImpact: { ...transfer, systemicIssue: parsed.systemicIssue },
      });
    }

    if (transfers.length > 0) {
      logger.info(`[${userId.substring(0, 8)}] Cross-system learning: ${transfers.length} pattern transfers`);
    }
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Cross-system learning failed: ${err.message?.substring(0, 200)}`);
  }
}

export async function getEvolutionStatus(userId: string): Promise<{
  systemHealth: SystemAudit[];
  totalImprovements: number;
  recentImprovements: number;
  totalStrategies: number;
  evolutionVelocity: number;
  lastCycleAt: string | null;
}> {
  const systemHealth = await auditAllSystems(userId);

  const totalResult = await db.select({ total: count() }).from(systemImprovements)
    .where(eq(systemImprovements.userId, userId));

  const recentResult = await db.select({ total: count() }).from(systemImprovements)
    .where(and(
      eq(systemImprovements.userId, userId),
      gte(systemImprovements.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ));

  const stratResult = await db.select({ total: count() }).from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.userId, userId),
      eq(discoveredStrategies.isActive, true),
    ));

  const lastImprovement = await db.select({ createdAt: systemImprovements.createdAt }).from(systemImprovements)
    .where(eq(systemImprovements.userId, userId))
    .orderBy(desc(systemImprovements.createdAt))
    .limit(1);

  const weeklyRate = recentResult[0]?.total || 0;

  return {
    systemHealth: systemHealth.sort((a, b) => a.score - b.score),
    totalImprovements: totalResult[0]?.total || 0,
    recentImprovements: weeklyRate,
    totalStrategies: stratResult[0]?.total || 0,
    evolutionVelocity: weeklyRate,
    lastCycleAt: lastImprovement[0]?.createdAt?.toISOString() || null,
  };
}

export function startInfiniteEvolution(): void {
  if (evolutionInterval) return;

  setTimeout(() => {
    runEvolutionCycle().catch(err =>
      logger.warn("Initial evolution cycle failed", { error: String(err).substring(0, 200) })
    );
  }, jitter(300_000));

  evolutionInterval = setInterval(() => {
    runEvolutionCycle().catch(err =>
      logger.warn("Periodic evolution cycle failed", { error: String(err).substring(0, 200) })
    );
  }, jitter(EVOLUTION_CYCLE_MS));

  logger.info("Infinite Evolution Engine started (4h cycle) — every system improves, forever");
}

export function stopInfiniteEvolution(): void {
  if (evolutionInterval) {
    clearInterval(evolutionInterval);
    evolutionInterval = null;
  }
}
