import { db } from "./db";
import { eq, and, desc, sql, inArray, ne } from "drizzle-orm";
import { teamMembers, teamActivityLog, aiAgentTasks, videos, channels, users } from "@shared/schema";
import type { AiAgentTask, TeamMember } from "@shared/schema";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { storage } from "./storage";
import cron from "node-cron";

const logger = createLogger("ai-team-engine");

const AI_AGENTS = {
  "ai-owner": {
    name: "AI Owner",
    email: "ai-owner@creatoros.ai",
    role: "owner",
    personality: "Visionary strategic commander who directs the entire creator empire. Sets channel direction, approves major decisions, oversees all agents, and ensures the creator's brand and business grow toward long-term dominance.",
    capabilities: [
      "strategic_planning", "goal_setting", "agent_oversight",
      "brand_direction", "business_review", "kpi_tracking",
      "team_coordination", "empire_expansion"
    ],
    systemPrompt: `You are the AI Owner for a content creator's team — the strategic commander of the entire operation.
Your role: set the vision, direct all agents, review overall channel performance, and make high-level business decisions.
You oversee the Editor (content), Moderator (community), Analyst (data), Admin (platform), User Growth Agent, and Premium Optimizer.
Your specialties: brand strategy, content direction, business scaling, monetization decisions, platform expansion, and empire-building.
Coordinate the team toward the creator's goals. When execution is needed, hand off to the appropriate specialist.
Always think 6-12 months ahead. Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-admin": {
    name: "AI Admin",
    email: "ai-admin@creatoros.ai",
    role: "admin",
    personality: "Meticulous platform administrator who monitors system health, manages integrations, enforces security policies, tracks API quotas, and ensures the entire CreatorOS infrastructure runs at peak performance.",
    capabilities: [
      "system_health_monitoring", "integration_management", "security_enforcement",
      "api_quota_tracking", "platform_compliance", "automation_oversight",
      "incident_response", "infrastructure_optimization"
    ],
    systemPrompt: `You are the AI Admin for a content creator's team — the platform infrastructure guardian.
Your role: monitor system health, manage all platform integrations, enforce security policies, track API usage, and keep the creator's entire tech stack running perfectly.
You oversee all platform connections (YouTube, Twitch, TikTok, etc.), automation pipelines, and system security.
Your specialties: integration health checks, quota management, security audits, compliance monitoring, and infrastructure optimization.
Alert the Owner on critical issues. Coordinate with the Analyst for data pipeline health.
Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-editor": {
    name: "AI Editor",
    email: "ai-editor@creatoros.ai",
    role: "editor",
    personality: "Creative, detail-oriented content specialist who optimizes titles, descriptions, thumbnails, and SEO. Speaks concisely and focuses on engagement metrics. Collaborates with Analyst for data-driven decisions and hands off community tasks to Moderator.",
    capabilities: [
      "title_optimization", "description_writing", "seo_optimization",
      "thumbnail_analysis", "content_scheduling", "tag_generation",
      "trend_adaptation", "a_b_test_creation"
    ],
    systemPrompt: `You are the AI Editor for a content creator's team. Your job is to optimize content for maximum reach and engagement.
Your specialties: SEO-optimized titles, compelling descriptions, strategic tags, thumbnail feedback, content scheduling, and A/B testing.
You work closely with the AI Analyst (who provides data insights) and AI Moderator (who handles community).
When you identify community-related needs, recommend handing off to the Moderator.
When you need performance data, recommend consulting the Analyst.
Always be specific, actionable, and data-aware. Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-moderator": {
    name: "AI Moderator",
    email: "ai-moderator@creatoros.ai",
    role: "moderator",
    personality: "Warm, community-focused engagement specialist who manages comments, builds audience relationships, and maintains brand voice. Flags trending discussions to the Analyst and content opportunities to the Editor.",
    capabilities: [
      "comment_moderation", "community_engagement", "spam_detection",
      "sentiment_analysis", "fan_interaction", "controversy_detection",
      "discussion_highlights", "community_post_drafting"
    ],
    systemPrompt: `You are the AI Moderator for a content creator's team. Your job is to manage and grow the community.
Your specialties: comment moderation, spam detection, sentiment analysis, community engagement, fan interaction, and controversy detection.
You work closely with the AI Editor (who handles content) and AI Analyst (who provides data).
When you spot content opportunities from comments, recommend handing off to the Editor.
When you notice trending sentiments or patterns, recommend sharing with the Analyst.
Always be empathetic, protective of the brand, and community-first. Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-analyst": {
    name: "AI Analyst",
    email: "ai-analyst@creatoros.ai",
    role: "viewer",
    personality: "Data-driven strategist who spots trends, analyzes performance metrics, predicts outcomes, and generates actionable reports. Shares content insights with the Editor and audience trends with the Moderator.",
    capabilities: [
      "performance_analysis", "trend_detection", "growth_forecasting",
      "competitor_analysis", "audience_insights", "revenue_tracking",
      "opportunity_alerts", "weekly_reporting"
    ],
    systemPrompt: `You are the AI Analyst for a content creator's team. Your job is to analyze data and provide strategic insights.
Your specialties: performance analysis, trend detection, growth forecasting, competitor analysis, audience insights, and revenue tracking.
You work closely with the AI Editor (who optimizes content based on your data) and AI Moderator (who manages the community you analyze).
When your analysis reveals content optimization opportunities, recommend handing off to the Editor.
When audience sentiment shifts or community trends emerge, recommend sharing with the Moderator.
Always be precise, data-driven, and actionable. Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-user": {
    name: "AI User Growth Agent",
    email: "ai-user@creatoros.ai",
    role: "user",
    personality: "Empathetic user journey specialist who tracks how the creator uses the platform, identifies friction points, surfaces underutilized features, and ensures the creator gets maximum value from every tool available to them.",
    capabilities: [
      "user_journey_analysis", "feature_adoption_tracking", "onboarding_optimization",
      "usage_pattern_analysis", "friction_point_detection", "feature_recommendations",
      "engagement_scoring", "platform_utilization_audit"
    ],
    systemPrompt: `You are the AI User Growth Agent for a content creator's team — the platform experience optimizer.
Your role: analyze how the creator uses CreatorOS, identify features they aren't using that would help them, surface quick wins, and ensure they're getting full value from the platform.
You track usage patterns, onboarding completion, feature adoption, and engagement with the platform's tools.
Your specialties: user journey optimization, feature discovery, onboarding guidance, usage analytics, and platform engagement.
When you identify content opportunities, hand off to the Editor. For data needs, consult the Analyst.
Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
  "ai-premium": {
    name: "AI Premium Optimizer",
    email: "ai-premium@creatoros.ai",
    role: "premium",
    personality: "Revenue-obsessed premium features maximizer who identifies every monetization opportunity, optimizes sponsorship pipelines, maximizes platform revenue streams, and ensures the creator's premium tools generate maximum ROI.",
    capabilities: [
      "monetization_optimization", "sponsorship_scouting", "revenue_stream_analysis",
      "premium_feature_maximization", "brand_deal_optimization", "affiliate_management",
      "roi_tracking", "premium_pipeline_management"
    ],
    systemPrompt: `You are the AI Premium Optimizer for a content creator's team — the revenue maximization specialist.
Your role: maximize every revenue stream, identify untapped monetization opportunities, optimize brand deals and sponsorships, and ensure every premium feature is working at full capacity.
You focus on: AdSense optimization, Super Chat maximization, brand deal sourcing, merchandise strategy, course sales, affiliate income, and premium platform integrations.
Your specialties: revenue analysis, sponsorship negotiation strategy, monetization stack optimization, and premium ROI tracking.
For data needs, work with the Analyst. For content alignment, coordinate with the Editor. Escalate major opportunities to the Owner.
Format responses as JSON with: { "action": string, "output": string, "handoff_to": string|null, "handoff_reason": string|null }`
  },
} as const;

export type AiAgentType = keyof typeof AI_AGENTS;

export async function provisionAiAgents(ownerId: string): Promise<TeamMember[]> {
  const existing = await db.select().from(teamMembers)
    .where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.isAi, true)));

  const existingTypes = new Set(existing.map(m => m.aiAgentType));
  const created: TeamMember[] = [...existing.filter(m => m.status === "active")];

  for (const [agentType, config] of Object.entries(AI_AGENTS)) {
    if (existingTypes.has(agentType)) continue;

    const member = await storage.createTeamMember({
      ownerId,
      invitedEmail: config.email,
      role: config.role,
      status: "active",
      isAi: true,
      aiAgentType: agentType,
      aiPersonality: config.personality,
    });

    await db.update(teamMembers)
      .set({ joinedAt: new Date(), lastActiveAt: new Date() })
      .where(eq(teamMembers.id, member.id));

    await storage.createTeamActivity({
      ownerId,
      actorUserId: "system",
      action: "ai_agent_provisioned",
      targetEmail: config.email,
      metadata: { agentType, name: config.name, role: config.role },
    });

    created.push({ ...member, joinedAt: new Date(), lastActiveAt: new Date() });
  }

  return created;
}

async function getChannelContext(ownerId: string): Promise<string> {
  const [channel] = await db.select().from(channels).where(eq(channels.userId, ownerId)).limit(1);
  const recentVideos = await db.select().from(videos)
    .where(eq(videos.userId, ownerId))
    .orderBy(desc(videos.publishedAt))
    .limit(5);

  if (!channel && recentVideos.length === 0) {
    return "No channel or videos found yet. The creator is just getting started.";
  }

  let ctx = "";
  if (channel) {
    ctx += `Channel: ${channel.title || "Unnamed"}, Subscribers: ${channel.subscriberCount || 0}, Views: ${channel.viewCount || 0}. `;
  }
  if (recentVideos.length > 0) {
    ctx += `Recent videos: ${recentVideos.map(v => `"${v.title}" (${v.viewCount || 0} views, ${v.likeCount || 0} likes)`).join("; ")}. `;
  }
  return ctx;
}

export async function executeAgentTask(task: AiAgentTask): Promise<{ result: Record<string, any>; handoff?: { to: string; reason: string; taskType: string } }> {
  const agentConfig = AI_AGENTS[task.agentRole as AiAgentType];
  if (!agentConfig) throw new Error(`Unknown agent: ${task.agentRole}`);

  const channelCtx = await getChannelContext(task.ownerId);

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: agentConfig.systemPrompt },
      { role: "user", content: `Channel context: ${channelCtx}\n\nTask: ${task.title}\nType: ${task.taskType}\nDetails: ${JSON.stringify(task.payload || {})}\n\nPerform this task and provide your output. If another team member should follow up, specify who and why.` }
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { action: task.taskType, output: content, handoff_to: null };
  }

  let handoff: { to: string; reason: string; taskType: string } | undefined;
  if (parsed.handoff_to && parsed.handoff_reason) {
    const handoffMap: Record<string, string> = {
      "Owner": "ai-owner", "Admin": "ai-admin",
      "Editor": "ai-editor", "Moderator": "ai-moderator", "Analyst": "ai-analyst",
      "User": "ai-user", "Premium": "ai-premium",
    };
    const targetAgent = handoffMap[parsed.handoff_to] || parsed.handoff_to;
    if (targetAgent !== task.agentRole && Object.keys(AI_AGENTS).includes(targetAgent)) {
      handoff = { to: targetAgent, reason: parsed.handoff_reason, taskType: parsed.handoff_task_type || "follow_up" };
    }
  }

  return { result: parsed, handoff };
}

export async function processTaskQueue(ownerId: string): Promise<{ processed: number; handoffs: number }> {
  const queuedTasks = await db.select().from(aiAgentTasks)
    .where(and(eq(aiAgentTasks.ownerId, ownerId), eq(aiAgentTasks.status, "queued")))
    .orderBy(aiAgentTasks.priority, aiAgentTasks.scheduledAt)
    .limit(5);

  let processed = 0;
  let handoffs = 0;

  for (const task of queuedTasks) {
    try {
      await db.update(aiAgentTasks)
        .set({ status: "in_progress", startedAt: new Date() })
        .where(eq(aiAgentTasks.id, task.id));

      const { result, handoff } = await executeAgentTask(task);

      const agentConfig = AI_AGENTS[task.agentRole as AiAgentType];
      const finalStatus = handoff ? "handed_off" : "completed";
      await db.update(aiAgentTasks)
        .set({ status: finalStatus, result, completedAt: new Date(), handedOffTo: handoff?.to || null })
        .where(eq(aiAgentTasks.id, task.id));

      await db.update(teamMembers)
        .set({ lastActiveAt: new Date() })
        .where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.aiAgentType, task.agentRole)));

      await storage.createTeamActivity({
        ownerId,
        actorUserId: `ai:${task.agentRole}`,
        action: "ai_task_completed",
        targetEmail: agentConfig?.email || task.agentRole,
        metadata: {
          taskId: task.id,
          taskType: task.taskType,
          title: task.title,
          summary: typeof result.output === "string" ? result.output.substring(0, 200) : JSON.stringify(result).substring(0, 200),
          handedOffTo: handoff?.to,
        },
      });

      if (handoff) {
        const handoffAgentConfig = AI_AGENTS[handoff.to as AiAgentType];
        await db.insert(aiAgentTasks).values({
          ownerId,
          agentRole: handoff.to,
          taskType: handoff.taskType,
          title: `Follow-up from ${agentConfig?.name || task.agentRole}: ${handoff.reason}`,
          payload: { parentTaskId: task.id, parentResult: result, reason: handoff.reason },
          status: "queued",
          parentTaskId: task.id,
          priority: Math.max(1, (task.priority || 5) - 1),
        });

        await storage.createTeamActivity({
          ownerId,
          actorUserId: `ai:${task.agentRole}`,
          action: "ai_handoff",
          targetEmail: handoffAgentConfig?.email || handoff.to,
          metadata: {
            from: task.agentRole,
            to: handoff.to,
            reason: handoff.reason,
            parentTaskId: task.id,
          },
        });

        handoffs++;
      }

      processed++;
    } catch (err: any) {
      logger.error("Agent task failed", { taskId: task.id, error: err.message });
      await db.update(aiAgentTasks)
        .set({ status: "failed", result: { error: err.message }, completedAt: new Date() })
        .where(eq(aiAgentTasks.id, task.id));
    }
  }

  return { processed, handoffs };
}

export async function enqueueAgentTask(ownerId: string, agentRole: string, taskType: string, title: string, payload?: Record<string, any>, priority = 5): Promise<AiAgentTask> {
  const [task] = await db.insert(aiAgentTasks).values({
    ownerId,
    agentRole,
    taskType,
    title,
    payload: payload || {},
    status: "queued",
    priority,
  }).returning();

  return task;
}

export async function runTeamCycle(ownerId: string): Promise<{ tasks: AiAgentTask[]; processed: number; handoffs: number }> {
  const agents = await provisionAiAgents(ownerId);
  if (agents.length === 0) return { tasks: [], processed: 0, handoffs: 0 };

  const channelCtx = await getChannelContext(ownerId);

  const existingQueued = await db.select({ count: sql<number>`count(*)::int` }).from(aiAgentTasks)
    .where(and(eq(aiAgentTasks.ownerId, ownerId), inArray(aiAgentTasks.status, ["queued", "in_progress"])));

  if ((existingQueued[0]?.count || 0) === 0) {
    const now = new Date();
    const hour = now.getUTCHours();

    await enqueueAgentTask(ownerId, "ai-owner", "strategic_review",
      "Empire Strategy Review", { context: channelCtx, hour }, 1);

    await enqueueAgentTask(ownerId, "ai-admin", "system_health_monitoring",
      "Platform Health & Integration Audit", { context: channelCtx, hour }, 2);

    await enqueueAgentTask(ownerId, "ai-analyst", "daily_analysis",
      "Daily Performance Check", { context: channelCtx, hour }, 3);

    await enqueueAgentTask(ownerId, "ai-editor", "content_optimization",
      "Content Optimization Scan", { context: channelCtx, hour }, 4);

    await enqueueAgentTask(ownerId, "ai-moderator", "community_pulse",
      "Community Pulse Check", { context: channelCtx, hour }, 4);

    await enqueueAgentTask(ownerId, "ai-user", "user_journey_analysis",
      "Platform Usage & Feature Adoption Audit", { context: channelCtx, hour }, 5);

    await enqueueAgentTask(ownerId, "ai-premium", "monetization_optimization",
      "Revenue & Monetization Opportunity Scan", { context: channelCtx, hour }, 5);
  }

  const { processed, handoffs } = await processTaskQueue(ownerId);

  const recentTasks = await db.select().from(aiAgentTasks)
    .where(eq(aiAgentTasks.ownerId, ownerId))
    .orderBy(desc(aiAgentTasks.createdAt))
    .limit(20);

  return { tasks: recentTasks, processed, handoffs };
}

export async function getAgentStatus(ownerId: string): Promise<{
  agents: Array<{
    type: string;
    name: string;
    role: string;
    personality: string;
    status: "idle" | "working" | "offline";
    lastActive: Date | null;
    tasksCompleted: number;
    tasksQueued: number;
    capabilities: string[];
  }>;
  recentTasks: AiAgentTask[];
  teamHealth: { totalTasks: number; completedTasks: number; handoffs: number; failedTasks: number };
}> {
  const aiMembers = await db.select().from(teamMembers)
    .where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.isAi, true), eq(teamMembers.status, "active")));

  const allTasks = await db.select().from(aiAgentTasks)
    .where(eq(aiAgentTasks.ownerId, ownerId));

  const recentTasks = await db.select().from(aiAgentTasks)
    .where(eq(aiAgentTasks.ownerId, ownerId))
    .orderBy(desc(aiAgentTasks.createdAt))
    .limit(20);

  const agents = aiMembers.map(m => {
    const config = AI_AGENTS[m.aiAgentType as AiAgentType];
    const agentTasks = allTasks.filter(t => t.agentRole === m.aiAgentType);
    const working = agentTasks.some(t => t.status === "in_progress");
    const queued = agentTasks.filter(t => t.status === "queued").length;
    const completed = agentTasks.filter(t => t.status === "completed" || t.status === "handed_off").length;

    return {
      type: m.aiAgentType || "",
      name: config?.name || m.aiAgentType || "Unknown",
      role: m.role,
      personality: config?.personality || m.aiPersonality || "",
      status: (working ? "working" : m.lastActiveAt ? "idle" : "offline") as "idle" | "working" | "offline",
      lastActive: m.lastActiveAt,
      tasksCompleted: completed,
      tasksQueued: queued,
      capabilities: config?.capabilities || [],
    };
  });

  const teamHealth = {
    totalTasks: allTasks.length,
    completedTasks: allTasks.filter(t => t.status === "completed" || t.status === "handed_off").length,
    handoffs: allTasks.filter(t => t.status === "handed_off").length,
    failedTasks: allTasks.filter(t => t.status === "failed").length,
  };

  return { agents, recentTasks, teamHealth };
}

export function getAgentConfig() {
  return AI_AGENTS;
}

export function initAiTeamScheduler() {
  cron.schedule("0 */6 * * *", async () => {
    logger.info("AI Team autonomous cycle starting");
    try {
      const owners = await db.selectDistinct({ ownerId: teamMembers.ownerId })
        .from(teamMembers)
        .where(and(eq(teamMembers.isAi, true), eq(teamMembers.status, "active")));

      for (const { ownerId } of owners) {
        try {
          await runTeamCycle(ownerId);
          logger.info("AI Team cycle complete", { ownerId });
        } catch (err: any) {
          logger.error("AI Team cycle failed for owner", { ownerId, error: err.message });
        }
      }
    } catch (err: any) {
      logger.error("AI Team scheduler error", { error: err.message });
    }
  });

}
