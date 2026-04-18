import OpenAI from "openai";
import { acquireAISlot, releaseAISlot, notifyRateLimit } from "./ai-semaphore";

let _client: OpenAI | null = null;
let _trackedClient: OpenAI | null = null;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_PRECALL_WAIT_MS = 120_000; // 2 minutes — engines wait in queue

// Global pre-call throttle: acquires a shared concurrent slot (shared with
// Claude so OpenAI + Claude combined never exceed MAX_CONCURRENT_AI = 4)
// then also verifies the sliding-window rate limit budget.
async function awaitSystemSlot(endpoint: string): Promise<void> {
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
    throw Object.assign(new Error(`AI throttled: system ai_calls budget exhausted (>${MAX_PRECALL_WAIT_MS}ms wait)`), { status: 429, throttled: true, endpoint });
  } catch (err: any) {
    if (!err.throttled) releaseAISlot();
    throw err;
  }
}

async function withRetry<T>(fn: () => Promise<T>, endpoint: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Acquire a slot before each attempt — slots are released in the finally below
    await awaitSystemSlot(endpoint);
    try {
      const result = await fn();
      releaseAISlot(); // success — free the slot immediately
      return result;
    } catch (err: any) {
      releaseAISlot(); // always release on error too
      lastErr = err;
      const status = err?.status ?? err?.statusCode ?? 0;
      const isRetryable = RETRYABLE_STATUS_CODES.has(status) || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT";
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      const rawRetryAfter = err?.headers?.["retry-after"];
      let retryAfterMs = BASE_DELAY_MS * Math.pow(2, attempt);
      if (rawRetryAfter) {
        const secs = parseInt(rawRetryAfter, 10);
        if (!isNaN(secs)) {
          retryAfterMs = Math.min(secs * 1000, 120_000);
        } else {
          const parsed = new Date(rawRetryAfter);
          if (!isNaN(parsed.getTime())) {
            retryAfterMs = Math.min(Math.max(parsed.getTime() - Date.now(), 0), 120_000);
          }
        }
      }
      // Notify circuit-breaker so ALL callers back off when the proxy is rate-limiting.
      // Only pass the proxy's retry-after hint when it's substantial (> 10s); otherwise
      // notifyRateLimit() with no argument uses the 65s default — much safer than 2-3s.
      if (status === 429) {
        notifyRateLimit(rawRetryAfter && retryAfterMs > 10_000 ? retryAfterMs : undefined);
      }
      await new Promise(r => setTimeout(r, retryAfterMs + Math.random() * 1_000));
    }
  }
  throw lastErr;
}

export function getOpenAIClient(): OpenAI {
  if (!_trackedClient) {
    const baseClient = getRawOpenAIClient();
    const originalCreate = baseClient.chat.completions.create.bind(baseClient.chat.completions);

    (baseClient.chat.completions as any).create = async function(params: any, ...args: any[]) {
      const start = Date.now();
      const endpoint = params?.model || "unknown";
      const isStreaming = params?.stream === true;
      try {
        const result = await withRetry(() => originalCreate(params, ...args), endpoint);
        const latency = Date.now() - start;
        if (isStreaming) {
          trackAICall(endpoint, 0, 0, latency);
        } else {
          const tokensIn = (result as any)?.usage?.prompt_tokens || 0;
          const tokensOut = (result as any)?.usage?.completion_tokens || 0;
          trackAICall(endpoint, tokensIn, tokensOut, latency);
        }
        return result;
      } catch (err: any) {
        const latency = Date.now() - start;
        trackAICall(endpoint, 0, 0, latency, err?.message);
        throw err;
      }
    };
    _trackedClient = baseClient;
  }
  return _trackedClient;
}

function getRawOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _client;
}

interface AICallMetrics {
  totalCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalLatencyMs: number;
  failures: number;
  callsByEndpoint: Map<string, { calls: number; tokensIn: number; tokensOut: number; failures: number; avgLatencyMs: number }>;
  recentErrors: Array<{ timestamp: string; endpoint: string; error: string }>;
  startedAt: string;
}

const metrics: AICallMetrics = {
  totalCalls: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalLatencyMs: 0,
  failures: 0,
  callsByEndpoint: new Map(),
  recentErrors: [],
  startedAt: new Date().toISOString(),
};

export function trackAICall(endpoint: string, tokensIn: number, tokensOut: number, latencyMs: number, error?: string) {
  metrics.totalCalls++;
  metrics.totalTokensIn += tokensIn;
  metrics.totalTokensOut += tokensOut;
  metrics.totalLatencyMs += latencyMs;

  const existing = metrics.callsByEndpoint.get(endpoint) || { calls: 0, tokensIn: 0, tokensOut: 0, failures: 0, avgLatencyMs: 0 };
  existing.calls++;
  existing.tokensIn += tokensIn;
  existing.tokensOut += tokensOut;
  existing.avgLatencyMs = Math.round((existing.avgLatencyMs * (existing.calls - 1) + latencyMs) / existing.calls);

  if (error) {
    metrics.failures++;
    existing.failures++;
    metrics.recentErrors.push({
      timestamp: new Date().toISOString(),
      endpoint,
      error: error.substring(0, 200),
    });
    if (metrics.recentErrors.length > 50) {
      metrics.recentErrors = metrics.recentErrors.slice(-50);
    }
  }

  metrics.callsByEndpoint.set(endpoint, existing);
}

export function getAITelemetry() {
  const endpointStats: Record<string, any> = {};
  for (const [key, val] of metrics.callsByEndpoint) {
    endpointStats[key] = val;
  }

  return {
    totalCalls: metrics.totalCalls,
    totalTokensIn: metrics.totalTokensIn,
    totalTokensOut: metrics.totalTokensOut,
    totalTokens: metrics.totalTokensIn + metrics.totalTokensOut,
    avgLatencyMs: metrics.totalCalls > 0 ? Math.round(metrics.totalLatencyMs / metrics.totalCalls) : 0,
    failures: metrics.failures,
    failureRate: metrics.totalCalls > 0 ? Math.round((metrics.failures / metrics.totalCalls) * 10000) / 100 : 0,
    endpointStats,
    recentErrors: metrics.recentErrors.slice(-10),
    startedAt: metrics.startedAt,
    uptimeMinutes: Math.round((Date.now() - new Date(metrics.startedAt).getTime()) / 60000),
  };
}
