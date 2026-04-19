import Anthropic from "@anthropic-ai/sdk";
import { acquireAISlot, releaseAISlot, notifyRateLimit } from "./ai-semaphore";

import { createLogger } from "./logger";

const logger = createLogger("claude");
export const CLAUDE_MODELS = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_PRECALL_WAIT_MS = 120_000;

// Shared concurrent-call semaphore (same pool as OpenAI — combined limit of 4
// in-flight requests across ALL AI providers).
async function awaitSystemSlot(): Promise<void> {
  await acquireAISlot();
  try {
    let { checkSystemRateLimit } = await import("../services/internal-rate-limiter");
    const start = Date.now();
    while (Date.now() - start < MAX_PRECALL_WAIT_MS) {
      const rl = checkSystemRateLimit("ai_calls");
      if (rl.allowed) return;
      const wait = Math.min(rl.retryAfterMs ?? 2000, 8000);
      await new Promise(r => setTimeout(r, Math.max(wait, 500)));
    }
    releaseAISlot();
    throw Object.assign(new Error(`Claude throttled: system ai_calls budget exhausted (>${MAX_PRECALL_WAIT_MS}ms wait)`), { status: 429, throttled: true });
  } catch (err: any) {
    if (!err.throttled) releaseAISlot();
    throw err;
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await awaitSystemSlot();
    try {
      const result = await fn();
      releaseAISlot();
      return result;
    } catch (err: any) {
      releaseAISlot();
      lastErr = err;
      const status = err?.status ?? err?.statusCode ?? 0;
      const isRetryable =
        RETRYABLE_STATUS_CODES.has(status) ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      const rawRetryAfter = err?.headers?.["retry-after"];
      let retryAfterMs = BASE_DELAY_MS * Math.pow(2, attempt);
      if (rawRetryAfter) {
        const secs = parseInt(rawRetryAfter, 10);
        if (!isNaN(secs)) {
          retryAfterMs = Math.min(secs * 1000, 60_000);
        } else {
          const parsed = new Date(rawRetryAfter);
          if (!isNaN(parsed.getTime())) {
            retryAfterMs = Math.min(Math.max(parsed.getTime() - Date.now(), 0), 60_000);
          }
        }
      }
      if (status === 429) {
        notifyRateLimit(rawRetryAfter && retryAfterMs > 10_000 ? retryAfterMs : undefined);
      }
      await new Promise((r) => setTimeout(r, retryAfterMs + Math.random() * 1_000));
    }
  }
  throw lastErr;
}

export function getClaudeClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

export interface ClaudeCallParams {
  system?: string;
  prompt: string;
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function callClaude(params: ClaudeCallParams): Promise<ClaudeCallResult> {
  const {
    system,
    prompt,
    model = CLAUDE_MODELS.sonnet,
    maxTokens = 2000,
    temperature = 0.7,
  } = params;

  const client = getClaudeClient();
  const startTime = Date.now();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const response = await withRetry(() =>
    client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages,
    })
  );

  const latencyMs = Date.now() - startTime;
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock?.type === "text" ? textBlock.text : "";

  logger.info(
    `[Claude] model=${model} in=${inputTokens} out=${outputTokens} latency=${latencyMs}ms`
  );

  return { content, model, inputTokens, outputTokens, latencyMs };
}
