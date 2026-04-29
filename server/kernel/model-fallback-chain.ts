import { getOpenAIClientBackground } from "../lib/openai";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { db } from "../db";
import { aiModelRoutingLogs } from "@shared/schema";

interface FallbackChainEntry {
  provider: "openai" | "claude";
  model: string;
}

const FALLBACK_CHAINS: Record<string, FallbackChainEntry[]> = {
  openai_primary: [
    { provider: "openai", model: "gpt-4o" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "claude", model: CLAUDE_MODELS.sonnet },
    { provider: "claude", model: CLAUDE_MODELS.haiku },
  ],
  openai_mini: [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "claude", model: CLAUDE_MODELS.haiku },
    { provider: "claude", model: CLAUDE_MODELS.sonnet },
  ],
  claude_primary: [
    { provider: "claude", model: CLAUDE_MODELS.opus },
    { provider: "claude", model: CLAUDE_MODELS.sonnet },
    { provider: "openai", model: "gpt-4o" },
    { provider: "openai", model: "gpt-4o-mini" },
  ],
  claude_light: [
    { provider: "claude", model: CLAUDE_MODELS.sonnet },
    { provider: "claude", model: CLAUDE_MODELS.haiku },
    { provider: "openai", model: "gpt-4o-mini" },
  ],
  ultra_resilient: [
    { provider: "openai", model: "gpt-4o" },
    { provider: "claude", model: CLAUDE_MODELS.opus },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "claude", model: CLAUDE_MODELS.sonnet },
    { provider: "claude", model: CLAUDE_MODELS.haiku },
  ],
};

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 2;
const BASE_DELAY_MS = 500;

interface FallbackCallOptions {
  chainName?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  taskType?: string;
}

interface FallbackCallResult {
  content: string;
  model: string;
  provider: "openai" | "claude";
  tokensUsed: number;
  latencyMs: number;
  fallbackDepth: number;
  attemptLog: { model: string; provider: string; error?: string }[];
}

async function callModel(
  entry: FallbackChainEntry,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; tokensUsed: number }> {
  if (entry.provider === "claude") {
    const result = await callClaudeBackground({
      system: systemPrompt,
      prompt: userPrompt,
      model: entry.model as any,
      maxTokens,
      temperature,
    });
    return { content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  const client = getOpenAIClientBackground();
  const response = await client.chat.completions.create({
    model: entry.model,
    max_completion_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return {
    content: response.choices[0]?.message?.content || "",
    tokensUsed: response.usage?.total_tokens || 0,
  };
}

function isRetryableError(err: any): boolean {
  if (err?.status && RETRYABLE_STATUS_CODES.has(err.status)) return true;
  if (err?.response?.status && RETRYABLE_STATUS_CODES.has(err.response.status)) return true;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("rate limit");
}

export async function executeWithFallbackChain(options: FallbackCallOptions): Promise<FallbackCallResult> {
  const chainName = options.chainName || "openai_mini";
  const chain = FALLBACK_CHAINS[chainName] || FALLBACK_CHAINS.openai_mini;
  const maxTokens = options.maxTokens || 2048;
  const temperature = options.temperature ?? 0.7;
  const startTime = Date.now();
  const attemptLog: FallbackCallResult["attemptLog"] = [];

  for (let depth = 0; depth < chain.length; depth++) {
    const entry = chain[depth];

    for (let retry = 0; retry < MAX_RETRIES_PER_MODEL; retry++) {
      try {
        const { content, tokensUsed } = await callModel(
          entry, options.systemPrompt, options.userPrompt, maxTokens, temperature
        );

        attemptLog.push({ model: entry.model, provider: entry.provider });

        if (options.userId) {
          try {
            await db.insert(aiModelRoutingLogs).values({
              userId: options.userId,
              taskType: options.taskType || "fallback_chain",
              modelSelected: entry.model,
              modelRequested: chain[0].model,
              reason: depth === 0
                ? `Primary model succeeded (chain: ${chainName})`
                : `Fallback to ${entry.model} after ${depth} failures (chain: ${chainName})`,
              tokensUsed,
              latencyMs: Date.now() - startTime,
              costUsd: 0,
            });
          } catch (_) {}
        }

        return {
          content,
          model: entry.model,
          provider: entry.provider,
          tokensUsed,
          latencyMs: Date.now() - startTime,
          fallbackDepth: depth,
          attemptLog,
        };
      } catch (err: any) {
        attemptLog.push({
          model: entry.model,
          provider: entry.provider,
          error: err?.message || String(err),
        });

        if (!isRetryableError(err) || retry === MAX_RETRIES_PER_MODEL - 1) break;
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, retry)));
      }
    }
  }

  throw new Error(
    `All models in fallback chain '${chainName}' exhausted. Attempts: ${JSON.stringify(attemptLog)}`
  );
}

export function getAvailableChains(): string[] {
  return Object.keys(FALLBACK_CHAINS);
}

export function getChainModels(chainName: string): FallbackChainEntry[] {
  return [...(FALLBACK_CHAINS[chainName] || [])];
}

export function resolveChainForTask(taskType: string, provider?: "openai" | "claude"): string {
  if (provider === "claude") {
    const heavyTasks = ["creator_dna_analysis", "revenue_strategy", "growth_planning"];
    return heavyTasks.includes(taskType) ? "claude_primary" : "claude_light";
  }
  const heavyTasks = ["strategy_planning", "script_writing", "competitor_analysis"];
  return heavyTasks.includes(taskType) ? "openai_primary" : "openai_mini";
}
