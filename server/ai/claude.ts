import Anthropic from "@anthropic-ai/sdk";
import { acquireSlot, acquireSlotBackground, releaseSlot, notifyRateLimit } from "./semaphore.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("claude");

export const MODELS = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;
export type Model = (typeof MODELS)[keyof typeof MODELS];

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>, bg = false): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await (bg ? acquireSlotBackground() : acquireSlot());
    try {
      const result = await fn();
      releaseSlot();
      return result;
    } catch (err: any) {
      releaseSlot();
      last = err;
      const status = err?.status ?? err?.statusCode ?? 0;
      const retryable = RETRYABLE.has(status) || err?.code === "ECONNRESET";
      if (!retryable || attempt === MAX_RETRIES) throw err;
      const rawAfter = err?.headers?.["retry-after"];
      let wait = 2_000 * 2 ** attempt;
      if (rawAfter) {
        const s = parseInt(rawAfter, 10);
        wait = isNaN(s) ? wait : Math.min(s * 1_000, 60_000);
      }
      if (status === 429 && !err?.throttled) notifyRateLimit(wait > 10_000 ? wait : undefined);
      if (!err?.throttled) await new Promise((r) => setTimeout(r, wait + Math.random() * 1_000));
    }
  }
  throw last;
}

function makeClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

export interface ClaudeParams {
  system?: string;
  prompt: string;
  model?: Model;
  maxTokens?: number;
  temperature?: number;
  background?: boolean;
}

export interface ClaudeResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function callClaude(params: ClaudeParams): Promise<ClaudeResult> {
  const {
    system,
    prompt,
    model = MODELS.sonnet,
    maxTokens = 2_000,
    temperature = 0.7,
    background = false,
  } = params;

  const client = makeClient();
  const start = Date.now();

  const response = await withRetry(
    () =>
      client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    background,
  );

  const latencyMs = Date.now() - start;
  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock?.type === "text" ? textBlock.text : "";
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  log.info("call ok", { model, inputTokens, outputTokens, latencyMs });
  return { content, model, inputTokens, outputTokens, latencyMs };
}
