import { getOpenAIClient } from "../lib/openai";
import { db } from "../db";
import { aiModelRoutingLogs } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

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
  maxTokens: number;
  temperature: number;
  reason: string;
}

interface TaskMapping {
  model: string;
  maxTokens: number;
  temperature: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const TASK_MAPPINGS: Record<string, TaskMapping> = {
  quick_suggestion: { model: "gpt-4o-mini", maxTokens: 512, temperature: 0.7, priority: "low" },
  title_optimization: { model: "gpt-4o-mini", maxTokens: 1024, temperature: 0.8, priority: "medium" },
  content_analysis: { model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.3, priority: "medium" },
  strategy_planning: { model: "gpt-4o", maxTokens: 4096, temperature: 0.7, priority: "high" },
  script_writing: { model: "gpt-4o", maxTokens: 4096, temperature: 0.9, priority: "high" },
  competitor_analysis: { model: "gpt-4o", maxTokens: 4096, temperature: 0.4, priority: "high" },
  copilot_chat: { model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.7, priority: "medium" },
  memory_distillation: { model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.3, priority: "low" },
  quality_scoring: { model: "gpt-4o-mini", maxTokens: 1024, temperature: 0.2, priority: "medium" },
  trend_detection: { model: "gpt-4o-mini", maxTokens: 2048, temperature: 0.4, priority: "medium" },
};

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  "gpt-4o": { inputPer1k: 0.0025, outputPer1k: 0.01 },
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

  let model = mapping?.model || "gpt-4o-mini";
  let maxTokens = config.maxTokens || mapping?.maxTokens || 2048;
  let temperature = config.temperature ?? mapping?.temperature ?? 0.7;
  let reason = `Task type '${config.taskType}' mapped to ${model}`;

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

  if (!mapping) {
    model = tierGroup === "premium" ? "gpt-4o-mini" : "gpt-4o-mini";
    reason = `Unknown task type '${config.taskType}', defaulting to gpt-4o-mini`;
  }

  return { model, maxTokens, temperature, reason };
}

export async function executeRoutedAICall(
  config: AIRouterConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; model: string; tokensUsed: number; latencyMs: number; costUsd: number }> {
  const routing = routeAIRequest(config);
  const client = getOpenAIClient();
  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model: routing.model,
    max_tokens: routing.maxTokens,
    temperature: routing.temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const latencyMs = Date.now() - startTime;
  const tokensUsed = response.usage?.total_tokens || 0;
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  const content = response.choices[0]?.message?.content || "";

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
    tokensUsed,
    latencyMs,
    costUsd: Math.round(costUsd * 1000000) / 1000000,
  };
}

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
