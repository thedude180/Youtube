import { db } from "../db";
import { deadLetterQueue } from "@shared/schema";
import { eq, desc, and, lte, count, asc } from "drizzle-orm";
import { registerMap } from "./resilience-core";

const PRIORITY_LEVELS = {
  CRITICAL: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  BACKGROUND: 9,
} as const;

const BACKOFF_MINUTES = [1, 5, 30];

// ==================== DEAD LETTER QUEUE ====================

export async function addToDeadLetter(
  jobType: string,
  payload: Record<string, any>,
  error: string,
  userId?: string,
  priority: number = PRIORITY_LEVELS.NORMAL,
  maxRetries: number = 3,
) {
  const [item] = await db.insert(deadLetterQueue).values({
    jobType,
    payload,
    error,
    userId: userId || null,
    priority,
    maxRetries,
    retryCount: 0,
    status: "pending",
    nextRetryAt: new Date(Date.now() + BACKOFF_MINUTES[0] * 60_000),
  }).returning();

  try {
    const { feedDlqToExceptionDesk } = await import("./exception-desk");
    await feedDlqToExceptionDesk({
      id: item.id,
      jobType,
      error,
      userId,
      priority,
      payload,
    });
  } catch {}

  return item;
}

export async function getDeadLetterItems(status?: string, limit: number = 50) {
  const conditions = status ? [eq(deadLetterQueue.status, status)] : [];
  const query = conditions.length > 0
    ? db.select().from(deadLetterQueue).where(and(...conditions)).orderBy(asc(deadLetterQueue.priority), desc(deadLetterQueue.createdAt)).limit(limit)
    : db.select().from(deadLetterQueue).orderBy(asc(deadLetterQueue.priority), desc(deadLetterQueue.createdAt)).limit(limit);
  return query;
}

export async function retryDeadLetterItem(id: number) {
  const [item] = await db.select().from(deadLetterQueue).where(eq(deadLetterQueue.id, id));
  if (!item) throw new Error(`DLQ item ${id} not found`);
  if (item.status === "resolved") throw new Error(`DLQ item ${id} already resolved`);

  const newRetryCount = (item.retryCount || 0) + 1;
  if (newRetryCount > (item.maxRetries || 3)) {
    await db.update(deadLetterQueue).set({ status: "exhausted" }).where(eq(deadLetterQueue.id, id));
    return { status: "exhausted", retryCount: newRetryCount };
  }

  const backoffIdx = Math.min(newRetryCount - 1, BACKOFF_MINUTES.length - 1);
  const nextRetryAt = new Date(Date.now() + BACKOFF_MINUTES[backoffIdx] * 60_000);

  await db.update(deadLetterQueue).set({
    retryCount: newRetryCount,
    nextRetryAt,
    status: "pending",
  }).where(eq(deadLetterQueue.id, id));

  return { status: "pending", retryCount: newRetryCount, nextRetryAt };
}

export async function processDeadLetterQueue() {
  const now = new Date();
  const items = await db.select().from(deadLetterQueue)
    .where(and(
      eq(deadLetterQueue.status, "pending"),
      lte(deadLetterQueue.nextRetryAt, now),
    ))
    .orderBy(asc(deadLetterQueue.priority), asc(deadLetterQueue.nextRetryAt))
    .limit(10);

  let processed = 0;
  for (const item of items) {
    try {
      await db.update(deadLetterQueue).set({ status: "retrying" }).where(eq(deadLetterQueue.id, item.id));
      await retryDeadLetterItem(item.id);
      processed++;
    } catch (err: any) {
      console.error(`[DLQ] Failed processing item ${item.id}:`, err.message);
    }
  }

  return { processed, total: items.length };
}

export async function resolveDeadLetterItem(id: number) {
  await db.update(deadLetterQueue).set({
    status: "resolved",
    resolvedAt: new Date(),
  }).where(eq(deadLetterQueue.id, id));
}

export async function getDeadLetterStats() {
  const rows = await db.select({
    status: deadLetterQueue.status,
    count: count(),
  }).from(deadLetterQueue).groupBy(deadLetterQueue.status);

  const stats: Record<string, number> = {};
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

// ==================== JOB PRIORITY SYSTEM ====================

export { PRIORITY_LEVELS };

export async function getNextJob(maxPriority: number = PRIORITY_LEVELS.BACKGROUND) {
  const [job] = await db.select().from(deadLetterQueue)
    .where(and(
      eq(deadLetterQueue.status, "pending"),
      lte(deadLetterQueue.priority, maxPriority),
    ))
    .orderBy(asc(deadLetterQueue.priority), asc(deadLetterQueue.createdAt))
    .limit(1);
  return job || null;
}

export async function reprioritize(id: number, newPriority: number) {
  await db.update(deadLetterQueue).set({ priority: newPriority }).where(eq(deadLetterQueue.id, id));
}

export async function getJobsByPriority() {
  const rows = await db.select({
    priority: deadLetterQueue.priority,
    count: count(),
  }).from(deadLetterQueue)
    .where(eq(deadLetterQueue.status, "pending"))
    .groupBy(deadLetterQueue.priority);

  const labels: Record<number, string> = {
    1: "CRITICAL", 3: "HIGH", 5: "NORMAL", 7: "LOW", 9: "BACKGROUND",
  };
  return rows.map(r => ({
    priority: r.priority,
    label: labels[r.priority ?? 5] || `PRIORITY_${r.priority}`,
    count: r.count,
  }));
}

// ==================== STEP RETRY WITH EXPONENTIAL BACKOFF ====================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBase?: number;
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    exponentialBase = 2,
  } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;

      const delay = Math.min(baseDelayMs * Math.pow(exponentialBase, attempt), maxDelayMs);
      const jitter = Math.floor(Math.random() * 500);
      const totalDelay = delay + jitter;

      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
  throw lastError;
}

export async function retryPipelineStep<T>(
  pipelineId: number,
  stepName: string,
  fn: () => Promise<T>,
): Promise<T> {
  return executeWithRetry(fn, {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    exponentialBase: 2,
  });
}

// ==================== BACKPRESSURE HANDLER ====================

const inflightCounters = new Map<string, number>();
registerMap("inflightCounters", inflightCounters, 200);
const MAX_INFLIGHT = 100;

export function registerInflight(jobType: string) {
  const current = inflightCounters.get(jobType) || 0;
  inflightCounters.set(jobType, current + 1);
}

export function completeInflight(jobType: string) {
  const current = inflightCounters.get(jobType) || 0;
  inflightCounters.set(jobType, Math.max(0, current - 1));
}

export function getInflightStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [k, v] of inflightCounters) stats[k] = v;
  return stats;
}

function getTotalInflight(): number {
  let total = 0;
  for (const v of inflightCounters.values()) total += v;
  return total;
}

export function checkBackpressure(): { overloaded: boolean; queueSize: number; recommendation: string } {
  const queueSize = getTotalInflight();
  const overloaded = queueSize > MAX_INFLIGHT;
  let recommendation = "System healthy";
  if (queueSize > MAX_INFLIGHT * 1.5) {
    recommendation = "Critical: reject non-essential jobs immediately";
  } else if (overloaded) {
    recommendation = "Throttle: delay LOW and BACKGROUND priority jobs";
  } else if (queueSize > MAX_INFLIGHT * 0.75) {
    recommendation = "Warning: approaching capacity, monitor closely";
  }
  return { overloaded, queueSize, recommendation };
}

export function shouldAcceptJob(jobType: string, priority: number): boolean {
  if (priority <= PRIORITY_LEVELS.CRITICAL) return true;
  const { overloaded, queueSize } = checkBackpressure();
  if (!overloaded) return true;
  if (queueSize > MAX_INFLIGHT * 1.5 && priority > PRIORITY_LEVELS.HIGH) return false;
  if (overloaded && priority >= PRIORITY_LEVELS.LOW) return false;
  return true;
}

// ==================== RATE-AWARE SCHEDULING ====================

interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

const PLATFORM_RATE_LIMITS: Record<string, RateLimitConfig> = {
  youtube: { maxCalls: 10000, windowMs: 86_400_000 },
  twitch: { maxCalls: 800, windowMs: 60_000 },
  discord: { maxCalls: 50, windowMs: 1_000 },
  tiktok: { maxCalls: 100, windowMs: 60_000 },
  kick: { maxCalls: 200, windowMs: 60_000 },
  x: { maxCalls: 300, windowMs: 900_000 },
};

const apiCallLog = new Map<string, number[]>();
registerMap("apiCallLog", apiCallLog, 100);

function pruneOldCalls(platform: string) {
  const config = PLATFORM_RATE_LIMITS[platform];
  if (!config) return;
  const calls = apiCallLog.get(platform) || [];
  const cutoff = Date.now() - config.windowMs;
  const pruned = calls.filter(ts => ts > cutoff);
  apiCallLog.set(platform, pruned);
}

export function recordApiCall(platform: string) {
  const calls = apiCallLog.get(platform) || [];
  calls.push(Date.now());
  apiCallLog.set(platform, calls);
}

export function canMakeApiCall(platform: string): boolean {
  const config = PLATFORM_RATE_LIMITS[platform];
  if (!config) return true;
  pruneOldCalls(platform);
  const calls = apiCallLog.get(platform) || [];
  return calls.length < config.maxCalls;
}

export function getRateLimitStatus(platform: string) {
  const config = PLATFORM_RATE_LIMITS[platform];
  if (!config) return { platform, configured: false, callsUsed: 0, maxCalls: 0, windowMs: 0, remaining: 0 };
  pruneOldCalls(platform);
  const calls = apiCallLog.get(platform) || [];
  return {
    platform,
    configured: true,
    callsUsed: calls.length,
    maxCalls: config.maxCalls,
    windowMs: config.windowMs,
    remaining: Math.max(0, config.maxCalls - calls.length),
  };
}

export function getNextAvailableSlot(platform: string): Date {
  const config = PLATFORM_RATE_LIMITS[platform];
  if (!config) return new Date();
  pruneOldCalls(platform);
  const calls = apiCallLog.get(platform) || [];
  if (calls.length < config.maxCalls) return new Date();
  const oldest = Math.min(...calls);
  return new Date(oldest + config.windowMs);
}

// ==================== PIPELINE ANALYTICS ====================

interface StepMetric {
  pipelineId: number;
  step: string;
  durationMs: number;
  success: boolean;
  recordedAt: number;
}

const metricsStore: StepMetric[] = [];
const MAX_METRICS = 10000;

export function recordPipelineMetrics(pipelineId: number, step: string, durationMs: number, success: boolean) {
  metricsStore.push({ pipelineId, step, durationMs, success, recordedAt: Date.now() });
  if (metricsStore.length > MAX_METRICS) metricsStore.splice(0, metricsStore.length - MAX_METRICS);
}

export function getPipelineAnalytics(days: number = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  const recent = metricsStore.filter(m => m.recordedAt >= cutoff);

  const stepStats = new Map<string, { totalMs: number; count: number; failures: number }>();
  for (const m of recent) {
    const s = stepStats.get(m.step) || { totalMs: 0, count: 0, failures: 0 };
    s.totalMs += m.durationMs;
    s.count++;
    if (!m.success) s.failures++;
    stepStats.set(m.step, s);
  }

  const steps = Array.from(stepStats.entries()).map(([step, s]) => ({
    step,
    avgDurationMs: Math.round(s.totalMs / s.count),
    totalRuns: s.count,
    failureRate: Number((s.failures / s.count).toFixed(3)),
    failures: s.failures,
  }));

  const totalDuration = steps.reduce((a, s) => a + s.avgDurationMs, 0);
  const overallFailures = recent.filter(m => !m.success).length;

  return {
    period: `${days} days`,
    totalMetrics: recent.length,
    avgPipelineDurationMs: totalDuration,
    overallFailureRate: recent.length > 0 ? Number((overallFailures / recent.length).toFixed(3)) : 0,
    steps,
    bottleneck: steps.length > 0
      ? steps.reduce((a, b) => a.avgDurationMs > b.avgDurationMs ? a : b).step
      : null,
  };
}

export function getBottlenecks(limit: number = 5) {
  const analytics = getPipelineAnalytics(30);
  return analytics.steps
    .sort((a, b) => {
      const scoreA = a.failureRate * 1000 + a.avgDurationMs;
      const scoreB = b.failureRate * 1000 + b.avgDurationMs;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
