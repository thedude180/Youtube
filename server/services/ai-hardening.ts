import { db } from "../db";
import { aiUsageLogs } from "@shared/schema";
import { eq, desc, sql, and, gte, count, sum } from "drizzle-orm";
import crypto from "crypto";
import { getBreaker } from "./circuit-breaker";

interface CacheEntry {
  response: any;
  timestamp: number;
  userId: string;
  model: string;
}

const CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

function makeCacheKey(userId: string, model: string, prompt: string): string {
  return crypto.createHash("sha256").update(userId + model + prompt).digest("hex");
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) cache.delete(key);
  }
}

function evictLRU(): void {
  if (cache.size <= CACHE_MAX_SIZE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

export function getCachedResponse(userId: string, prompt: string, model: string): any | null {
  evictExpired();
  const key = makeCacheKey(userId, model, prompt);
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    cacheHits++;
    entry.timestamp = Date.now();
    return entry.response;
  }
  cacheMisses++;
  if (entry) cache.delete(key);
  return null;
}

export function setCachedResponse(userId: string, prompt: string, model: string, response: any): void {
  evictExpired();
  const key = makeCacheKey(userId, model, prompt);
  cache.set(key, { response, timestamp: Date.now(), userId, model });
  evictLRU();
}

export function clearUserCache(userId: string): number {
  let cleared = 0;
  for (const [key, entry] of cache) {
    if (entry.userId === userId) {
      cache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

export function getCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
  evictExpired();
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    size: cache.size,
    hitRate: total > 0 ? Math.round((cacheHits / total) * 10000) / 100 : 0,
  };
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.001, output: 0.003 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-5-mini"];
  return (promptTokens / 1000) * pricing.input + (completionTokens / 1000) * pricing.output;
}

const TIER_DAILY_LIMITS: Record<string, number> = {
  free: 50,
  starter: 200,
  pro: 1000,
  enterprise: 10000,
};

export async function trackAiUsage(
  userId: string,
  model: string,
  endpoint: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  cached: boolean,
  success: boolean
): Promise<void> {
  const estimatedCost = calculateCost(model, promptTokens, completionTokens);
  try {
    await db.insert(aiUsageLogs).values({
      userId,
      model,
      endpoint,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost,
      cached,
      success,
      latencyMs,
    });
  } catch (err) {
    console.error("[AI Hardening] Failed to track usage:", err);
  }
}

export async function getUserAiCosts(userId: string, days: number = 30): Promise<{
  totalCost: number;
  totalTokens: number;
  requestCount: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
      requestCount: sql<number>`COUNT(*)`,
    })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, since)));
  return {
    totalCost: Number(result[0]?.totalCost || 0),
    totalTokens: Number(result[0]?.totalTokens || 0),
    requestCount: Number(result[0]?.requestCount || 0),
  };
}

export async function getSystemAiCosts(days: number = 30): Promise<{
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  uniqueUsers: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
      requestCount: sql<number>`COUNT(*)`,
      uniqueUsers: sql<number>`COUNT(DISTINCT ${aiUsageLogs.userId})`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, since));
  return {
    totalCost: Number(result[0]?.totalCost || 0),
    totalTokens: Number(result[0]?.totalTokens || 0),
    requestCount: Number(result[0]?.requestCount || 0),
    uniqueUsers: Number(result[0]?.uniqueUsers || 0),
  };
}

export async function getUserDailyUsage(userId: string): Promise<{
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  cachedRequests: number;
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const result = await db
    .select({
      requestCount: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
      cachedRequests: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageLogs.cached} THEN 1 ELSE 0 END), 0)`,
    })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, todayStart)));
  return {
    requestCount: Number(result[0]?.requestCount || 0),
    totalTokens: Number(result[0]?.totalTokens || 0),
    totalCost: Number(result[0]?.totalCost || 0),
    cachedRequests: Number(result[0]?.cachedRequests || 0),
  };
}

export async function isUserOverAiLimit(userId: string, tier: string): Promise<boolean> {
  const limit = TIER_DAILY_LIMITS[tier] || TIER_DAILY_LIMITS.free;
  const usage = await getUserDailyUsage(userId);
  return usage.requestCount >= limit;
}

const modelFailures = new Map<string, number>();

export async function executeWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  userId: string,
  endpoint: string
): Promise<{ result: T; usedFallback: boolean; latencyMs: number }> {
  const start = Date.now();
  const breaker = getBreaker("OpenAI API");

  try {
    const result = await breaker.execute(primaryFn);
    const latencyMs = Date.now() - start;
    modelFailures.set("primary", 0);
    trackAiUsage(userId, "gpt-5-mini", endpoint, 0, 0, latencyMs, false, true).catch(() => {});
    return { result, usedFallback: false, latencyMs };
  } catch (primaryError) {
    console.warn(`[AI Hardening] Primary model failed for ${endpoint}, falling back:`, (primaryError as Error).message);
    modelFailures.set("primary", (modelFailures.get("primary") || 0) + 1);

    try {
      const result = await fallbackFn();
      const latencyMs = Date.now() - start;
      trackAiUsage(userId, "fallback", endpoint, 0, 0, latencyMs, false, true).catch(() => {});
      return { result, usedFallback: true, latencyMs };
    } catch (fallbackError) {
      const latencyMs = Date.now() - start;
      modelFailures.set("fallback", (modelFailures.get("fallback") || 0) + 1);
      trackAiUsage(userId, "gpt-5-mini", endpoint, 0, 0, latencyMs, false, false).catch(() => {});
      throw fallbackError;
    }
  }
}

export function getModelHealth(): Record<string, { status: string; consecutiveFailures: number }> {
  const breaker = getBreaker("OpenAI API");
  const breakerStatus = breaker.getStatus();
  return {
    "gpt-5-mini": {
      status: breakerStatus,
      consecutiveFailures: modelFailures.get("primary") || 0,
    },
    fallback: {
      status: (modelFailures.get("fallback") || 0) >= 3 ? "degraded" : "healthy",
      consecutiveFailures: modelFailures.get("fallback") || 0,
    },
  };
}

const QUALITY_KEYWORDS: Record<string, string[]> = {
  seo: ["title", "description", "tags", "keywords", "thumbnail", "optimization"],
  strategy: ["growth", "engagement", "audience", "content", "platform", "recommendation"],
  compliance: ["check", "status", "rule", "policy", "guideline", "recommendation"],
  general: ["analysis", "insight", "recommendation", "data", "result"],
};

export function scoreAiOutput(output: any, type: string = "general"): number {
  let score = 0;
  const outputStr = typeof output === "string" ? output : JSON.stringify(output);

  const len = outputStr.length;
  if (len > 50) score += 15;
  if (len > 200) score += 10;
  if (len > 500) score += 10;
  if (len > 1000) score += 5;

  if (typeof output === "object" && output !== null) {
    score += 20;
    const keys = Object.keys(output);
    if (keys.length >= 3) score += 10;
    if (keys.length >= 5) score += 5;
  } else {
    try {
      JSON.parse(outputStr);
      score += 15;
    } catch {
      score += 0;
    }
  }

  const keywords = QUALITY_KEYWORDS[type] || QUALITY_KEYWORDS.general;
  const lowerStr = outputStr.toLowerCase();
  const matched = keywords.filter(k => lowerStr.includes(k));
  score += Math.min(matched.length * 5, 25);

  return Math.min(score, 100);
}

export async function getAverageQuality(userId: string, days: number = 7): Promise<{
  averageScore: number;
  totalEvaluated: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const logs = await db
    .select({
      requestCount: sql<number>`COUNT(*)`,
      avgLatency: sql<number>`COALESCE(AVG(${aiUsageLogs.latencyMs}), 0)`,
      successRate: sql<number>`COALESCE(AVG(CASE WHEN ${aiUsageLogs.success} THEN 1.0 ELSE 0.0 END) * 100, 0)`,
    })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, since)));
  const successRate = Number(logs[0]?.successRate || 0);
  const count = Number(logs[0]?.requestCount || 0);
  return {
    averageScore: Math.round(successRate * 100) / 100,
    totalEvaluated: count,
  };
}

interface BatchTask {
  id: string;
  fn: () => Promise<any>;
  status: "pending" | "running" | "completed" | "failed";
  result?: any;
  error?: string;
}

interface Batch {
  id: string;
  userId: string;
  tasks: BatchTask[];
  createdAt: number;
  completedAt?: number;
}

const batches = new Map<string, Batch>();

export function queueAiBatch(userId: string, tasks: Array<{ id: string; fn: () => Promise<any> }>): string {
  const batchId = crypto.randomUUID();
  const batch: Batch = {
    id: batchId,
    userId,
    tasks: tasks.map(t => ({ id: t.id, fn: t.fn, status: "pending" as const })),
    createdAt: Date.now(),
  };
  batches.set(batchId, batch);
  return batchId;
}

export async function processBatch(batchId: string): Promise<{
  completed: number;
  failed: number;
  results: Record<string, any>;
}> {
  const batch = batches.get(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  let completed = 0;
  let failed = 0;
  const results: Record<string, any> = {};

  for (const task of batch.tasks) {
    task.status = "running";
    try {
      task.result = await task.fn();
      task.status = "completed";
      results[task.id] = task.result;
      completed++;
    } catch (err) {
      task.status = "failed";
      task.error = (err as Error).message;
      results[task.id] = { error: task.error };
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  batch.completedAt = Date.now();
  return { completed, failed, results };
}

export function getBatchStatus(batchId: string): {
  id: string;
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  progress: number;
} | null {
  const batch = batches.get(batchId);
  if (!batch) return null;
  const total = batch.tasks.length;
  const pending = batch.tasks.filter(t => t.status === "pending").length;
  const running = batch.tasks.filter(t => t.status === "running").length;
  const completed = batch.tasks.filter(t => t.status === "completed").length;
  const failed = batch.tasks.filter(t => t.status === "failed").length;
  return {
    id: batchId,
    total,
    pending,
    running,
    completed,
    failed,
    progress: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
  };
}
