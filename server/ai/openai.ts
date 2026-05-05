import OpenAI from "openai";
import { acquireSlot, acquireSlotBackground, releaseSlot, notifyRateLimit } from "./semaphore.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("openai");
const RETRYABLE = new Set([401, 429, 500, 502, 503, 504]);
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
      const retryable = RETRYABLE.has(status) || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT";
      if (!retryable || attempt === MAX_RETRIES) throw err;
      const rawAfter = err?.headers?.["retry-after"];
      let wait = 2_000 * 2 ** attempt;
      if (rawAfter) {
        const s = parseInt(rawAfter, 10);
        wait = isNaN(s) ? wait : Math.min(s * 1_000, 120_000);
      }
      if (status === 429 && !err?.throttled) notifyRateLimit(wait > 10_000 ? wait : undefined);
      if (!err?.throttled) await new Promise((r) => setTimeout(r, wait + Math.random() * 1_000));
    }
  }
  throw last;
}

let _client: OpenAI | null = null;
let _bgClient: OpenAI | null = null;

function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function patchClient(client: OpenAI, bg: boolean): OpenAI {
  const orig = client.chat.completions.create.bind(client.chat.completions);
  (client.chat.completions as any).create = async (params: any, ...rest: any[]) => {
    const start = Date.now();
    try {
      const result = await withRetry(() => orig(params, ...rest), bg);
      log.info("call ok", { model: params.model, latency: Date.now() - start });
      return result;
    } catch (err: any) {
      log.error("call failed", { model: params.model, error: err.message });
      throw err;
    }
  };
  return client;
}

export function getOpenAI(): OpenAI {
  if (!_client) _client = patchClient(makeClient(), false);
  return _client;
}

export function getOpenAIBackground(): OpenAI {
  if (!_bgClient) _bgClient = patchClient(makeClient(), true);
  return _bgClient;
}
