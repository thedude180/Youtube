import OpenAI from "openai";

let _client: OpenAI | null = null;
let _trackedClient: OpenAI | null = null;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>, endpoint: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.statusCode ?? 0;
      const isRetryable = RETRYABLE_STATUS_CODES.has(status) || err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT";
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      // AUDIT FIX: Handle HTTP-date format in retry-after header, not just integer seconds
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
      await new Promise(r => setTimeout(r, retryAfterMs));
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
