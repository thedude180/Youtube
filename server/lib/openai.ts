import OpenAI from "openai";

let _client: OpenAI | null = null;
let _trackedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_trackedClient) {
    const baseClient = getRawOpenAIClient();
    const originalCreate = baseClient.chat.completions.create.bind(baseClient.chat.completions);

    (baseClient.chat.completions as any).create = async function(params: any, ...args: any[]) {
      const start = Date.now();
      const endpoint = params?.model || "unknown";
      const isStreaming = params?.stream === true;
      try {
        const result = await originalCreate(params, ...args);
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
