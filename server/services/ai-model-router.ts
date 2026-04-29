import { getOpenAIClientBackground } from "../lib/openai";
import { callClaude, CLAUDE_MODELS } from "../lib/claude";
import { db } from "../db";
import { aiModelRoutingLogs } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { executeWithFallbackChain, resolveChainForTask } from "../kernel/model-fallback-chain";

export interface AIRouterConfig {
  taskType: string;
  userId: string;
  userTier?: string;
  maxTokens?: number;
  temperature?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AIRouterResult {
  model: string;
  provider: "openai" | "claude";
  maxTokens: number;
  temperature: number;
  reason: string;
}

interface TaskMapping {
  provider?: "openai" | "claude";
  model: string;
  maxTokens: number;
  temperature: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const TASK_MAPPINGS: Record<string, TaskMapping> = {
  // Fast background tasks — gpt-4o-mini is right for these (high volume, low latency, no quality gap)
  quick_suggestion:       { model: "gpt-4o-mini",              maxTokens: 512,  temperature: 0.7, priority: "low" },
  memory_distillation:    { model: "gpt-4o-mini",              maxTokens: 2048, temperature: 0.3, priority: "low" },
  quality_scoring:        { model: "gpt-4o-mini",              maxTokens: 1024, temperature: 0.2, priority: "medium" },

  // Content & optimization tasks — Claude Sonnet: best-in-class writing and SEO intelligence
  title_optimization:     { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 1024, temperature: 0.8, priority: "medium" },
  content_analysis:       { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 2048, temperature: 0.3, priority: "medium" },
  copilot_chat:           { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 2048, temperature: 0.7, priority: "medium" },
  trend_detection:        { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 2048, temperature: 0.4, priority: "medium" },

  // Deep strategic tasks — Claude Opus: strongest reasoning for decisions that drive real growth
  strategy_planning:      { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 4096, temperature: 0.7, priority: "high" },
  script_writing:         { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 4096, temperature: 0.9, priority: "high" },
  competitor_analysis:    { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 4096, temperature: 0.4, priority: "high" },

  // Already on best models
  creator_dna_analysis:   { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 2000, temperature: 0.3, priority: "high" },
  revenue_strategy:       { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 3000, temperature: 0.5, priority: "high" },
  growth_planning:        { provider: "claude", model: CLAUDE_MODELS.opus,   maxTokens: 3000, temperature: 0.5, priority: "high" },
  content_writing:        { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 1000, temperature: 0.8, priority: "medium" },
  vod_seo:                { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 3000, temperature: 0.4, priority: "medium" },
  chat_moderation:        { provider: "claude", model: CLAUDE_MODELS.haiku,  maxTokens: 500,  temperature: 0.1, priority: "low" },
  shorts_analysis:        { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 2000, temperature: 0.5, priority: "medium" },
  daily_briefing:         { provider: "claude", model: CLAUDE_MODELS.sonnet, maxTokens: 1000, temperature: 0.6, priority: "low" },
};

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  "gpt-4o-mini":        { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4o":             { inputPer1k: 0.0025,  outputPer1k: 0.01 },
  "claude-opus-4-6":    { inputPer1k: 0.015,   outputPer1k: 0.075 },
  "claude-sonnet-4-6":  { inputPer1k: 0.003,   outputPer1k: 0.015 },
  "claude-haiku-4-5":   { inputPer1k: 0.0008,  outputPer1k: 0.004 },
};

const FREE_TIERS = ["free", "youtube"];
const STARTER_TIERS = ["starter"];
const PREMIUM_TIERS = ["pro", "ultimate"];

function getTierGroup(tier: string): "free" | "starter" | "premium" {
  if (PREMIUM_TIERS.includes(tier)) return "premium";
  if (STARTER_TIERS.includes(tier)) return "starter";
  return "free";
}

export function routeAIRequest(config: AIRouterConfig): AIRouterResult {
  const mapping = TASK_MAPPINGS[config.taskType];
  const tier = config.userTier || "free";
  const tierGroup = getTierGroup(tier);
  const priority = config.priority || mapping?.priority || "medium";

  let provider: "openai" | "claude" = mapping?.provider || "openai";
  let model = mapping?.model || "gpt-4o-mini";
  let maxTokens = config.maxTokens || mapping?.maxTokens || 2048;
  let temperature = config.temperature ?? mapping?.temperature ?? 0.7;
  let reason = `Task type '${config.taskType}' mapped to ${provider}/${model}`;

  if (provider === "openai") {
    if (tierGroup === "free") {
      if (model === "gpt-4o") {
        model = "gpt-4o-mini";
        reason = `Downgraded to gpt-4o-mini for ${tier} tier`;
      }
    } else if (tierGroup === "starter") {
      if (model === "gpt-4o" && priority !== "critical") {
        model = "gpt-4o-mini";
        reason = `Downgraded to gpt-4o-mini for starter tier (non-critical task)`;
      } else if (model === "gpt-4o" && priority === "critical") {
        reason = `gpt-4o allowed for starter tier critical task`;
      }
    } else if (tierGroup === "premium") {
      if (priority === "high" || priority === "critical") {
        model = "gpt-4o";
        reason = `Upgraded to gpt-4o for ${tier} tier high-priority task`;
      }
    }
  }

  if (!mapping) {
    provider = "openai";
    model = "gpt-4o-mini";
    reason = `Unknown task type '${config.taskType}', defaulting to openai/gpt-4o-mini`;
  }

  return { provider, model, maxTokens, temperature, reason };
}

export async function executeRoutedAICall(
  config: AIRouterConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; model: string; provider: string; tokensUsed: number; latencyMs: number; costUsd: number }> {
  const routing = routeAIRequest(config);
  const startTime = Date.now();

  let content = "";
  let tokensUsed = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    if (routing.provider === "claude") {
      const result = await callClaude({
        system: systemPrompt,
        prompt: userPrompt,
        model: routing.model as any,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
      });
      content = result.content;
      promptTokens = result.inputTokens;
      completionTokens = result.outputTokens;
      tokensUsed = result.inputTokens + result.outputTokens;
    } else {
      const client = getOpenAIClientBackground();
      const response = await client.chat.completions.create({
        model: routing.model,
        max_completion_tokens: routing.maxTokens,
        temperature: routing.temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      content = response.choices[0]?.message?.content || "";
      tokensUsed = response.usage?.total_tokens || 0;
      promptTokens = response.usage?.prompt_tokens || 0;
      completionTokens = response.usage?.completion_tokens || 0;
    }
  } catch (primaryErr: any) {
    const primaryModel = routing.model;
    const primaryProvider = routing.provider;
    const chainName = resolveChainForTask(config.taskType, primaryProvider);
    try {
      const fallbackResult = await executeWithFallbackChain({
        chainName,
        systemPrompt,
        userPrompt,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
        userId: config.userId,
        taskType: config.taskType,
      });
      content = fallbackResult.content;
      tokensUsed = fallbackResult.tokensUsed;
      routing.model = fallbackResult.model;
      routing.provider = fallbackResult.provider;
      routing.reason = `Failover via ${chainName}: primary ${primaryProvider}/${primaryModel} failed (${primaryErr.message})`;
    } catch (fallbackErr: any) {
      throw new Error(`AI call failed — primary ${primaryProvider}/${primaryModel}: ${primaryErr.message}, fallback chain ${chainName}: ${fallbackErr.message}`);
    }
  }

  const latencyMs = Date.now() - startTime;
  const pricing = MODEL_PRICING[routing.model] || MODEL_PRICING["gpt-4o-mini"];
  const costUsd = (promptTokens / 1000) * pricing.inputPer1k + (completionTokens / 1000) * pricing.outputPer1k;

  try {
    await db.insert(aiModelRoutingLogs).values({
      userId: config.userId,
      taskType: config.taskType,
      modelSelected: routing.model,
      modelRequested: TASK_MAPPINGS[config.taskType]?.model || "unknown",
      reason: routing.reason,
      tokensUsed,
      latencyMs,
      costUsd: Math.round(costUsd * 1000000) / 1000000,
    });
  } catch (_e) {}

  return {
    content,
    model: routing.model,
    provider: routing.provider,
    tokensUsed,
    latencyMs,
    costUsd: Math.round(costUsd * 1000000) / 1000000,
  };
}

export { executeWithFallbackChain, resolveChainForTask, getAvailableChains } from "../kernel/model-fallback-chain";

export function getModelPricing(): Record<string, { inputPer1k: number; outputPer1k: number }> {
  return { ...MODEL_PRICING };
}

export async function getRoutingStats(userId: string): Promise<{
  totalCalls: number;
  totalCost: number;
  modelBreakdown: Record<string, number>;
  avgLatency: number;
}> {
  const logs = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${aiModelRoutingLogs.costUsd}), 0)::float`,
      avgLatency: sql<number>`coalesce(avg(${aiModelRoutingLogs.latencyMs}), 0)::float`,
    })
    .from(aiModelRoutingLogs)
    .where(eq(aiModelRoutingLogs.userId, userId));

  const breakdown = await db
    .select({
      model: aiModelRoutingLogs.modelSelected,
      count: sql<number>`count(*)::int`,
    })
    .from(aiModelRoutingLogs)
    .where(eq(aiModelRoutingLogs.userId, userId))
    .groupBy(aiModelRoutingLogs.modelSelected);

  const modelBreakdown: Record<string, number> = {};
  for (const row of breakdown) {
    modelBreakdown[row.model] = row.count;
  }

  return {
    totalCalls: logs[0]?.totalCalls || 0,
    totalCost: Math.round((logs[0]?.totalCost || 0) * 1000000) / 1000000,
    modelBreakdown,
    avgLatency: Math.round(logs[0]?.avgLatency || 0),
  };
}
