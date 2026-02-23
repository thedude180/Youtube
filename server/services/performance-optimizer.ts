import { db } from "../db";
import { eq, desc } from "drizzle-orm";

interface DedupeEntry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

export function createRequestDeduplicator<T>(): {
  dedupe: (key: string, fn: () => Promise<T>, ttlMs?: number) => Promise<T>;
  clear: (key?: string) => void;
  stats: () => { activeRequests: number; deduplicatedCalls: number; cacheHits: number };
} {
  const cache = new Map<string, DedupeEntry<T>>();
  let deduplicatedCalls = 0;
  let cacheHits = 0;
  let activeRequests = 0;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        cache.delete(key);
      }
    }
  }, 30000);

  if (cleanup.unref) {
    cleanup.unref();
  }

  function evictOldest() {
    if (cache.size >= 10000) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
  }

  return {
    dedupe: (key: string, fn: () => Promise<T>, ttlMs: number = 5000): Promise<T> => {
      const existing = cache.get(key);
      if (existing) {
        if (existing.expiresAt === 0 || Date.now() <= existing.expiresAt) {
          if (existing.expiresAt > 0) {
            cacheHits++;
          } else {
            deduplicatedCalls++;
          }
          return existing.promise;
        }
        cache.delete(key);
      }

      evictOldest();
      activeRequests++;

      const promise = fn().then(
        (result) => {
          activeRequests--;
          cache.set(key, { promise: Promise.resolve(result), expiresAt: Date.now() + ttlMs });
          return result;
        },
        (error) => {
          activeRequests--;
          cache.delete(key);
          throw error;
        }
      );

      cache.set(key, { promise, expiresAt: 0 });
      return promise;
    },

    clear: (key?: string) => {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
        deduplicatedCalls = 0;
        cacheHits = 0;
        activeRequests = 0;
      }
    },

    stats: () => ({
      activeRequests,
      deduplicatedCalls,
      cacheHits,
    }),
  };
}

export function createLazyComputer<T>(computeFn: () => Promise<T>, staleAfterMs: number): {
  get: () => Promise<T>;
  invalidate: () => void;
  isStale: () => boolean;
} {
  let cachedValue: T | undefined;
  let lastComputed = 0;
  let computing = false;
  let computePromise: Promise<T> | null = null;

  function isStale(): boolean {
    if (lastComputed === 0) return true;
    return Date.now() - lastComputed > staleAfterMs;
  }

  async function compute(): Promise<T> {
    computing = true;
    try {
      const result = await computeFn();
      cachedValue = result;
      lastComputed = Date.now();
      return result;
    } finally {
      computing = false;
      computePromise = null;
    }
  }

  return {
    get: async (): Promise<T> => {
      if (cachedValue !== undefined && !isStale()) {
        return cachedValue;
      }

      if (cachedValue !== undefined && isStale()) {
        if (!computing) {
          computePromise = compute();
        }
        return cachedValue;
      }

      if (computePromise) {
        return computePromise;
      }

      computePromise = compute();
      return computePromise;
    },

    invalidate: () => {
      cachedValue = undefined;
      lastComputed = 0;
      computing = false;
      computePromise = null;
    },

    isStale,
  };
}

interface QueryTiming {
  name: string;
  durationMs: number;
  timestamp: number;
}

interface QueryStats {
  name: string;
  avgMs: number;
  maxMs: number;
  count: number;
  slowCount: number;
}

export class SlowQueryDetector {
  private thresholdMs: number;
  private timings: QueryTiming[] = [];
  private maxTimings = 1000;

  constructor(thresholdMs: number = 500) {
    this.thresholdMs = thresholdMs;
  }

  async wrap<T>(queryName: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.recordTiming(queryName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordTiming(queryName, duration);
      throw error;
    }
  }

  private recordTiming(name: string, durationMs: number) {
    if (this.timings.length >= this.maxTimings) {
      this.timings.shift();
    }
    this.timings.push({ name, durationMs, timestamp: Date.now() });

    if (durationMs > this.thresholdMs) {
      console.warn(`[SlowQuery] ${name} took ${durationMs}ms (threshold: ${this.thresholdMs}ms)`);
    }
  }

  getSlowQueries(): QueryStats[] {
    const grouped = new Map<string, { total: number; max: number; count: number; slowCount: number }>();

    for (const timing of this.timings) {
      const existing = grouped.get(timing.name) || { total: 0, max: 0, count: 0, slowCount: 0 };
      existing.total += timing.durationMs;
      existing.max = Math.max(existing.max, timing.durationMs);
      existing.count++;
      if (timing.durationMs > this.thresholdMs) {
        existing.slowCount++;
      }
      grouped.set(timing.name, existing);
    }

    const results: QueryStats[] = [];
    for (const [name, data] of grouped) {
      results.push({
        name,
        avgMs: Math.round(data.total / data.count),
        maxMs: data.max,
        count: data.count,
        slowCount: data.slowCount,
      });
    }

    return results.sort((a, b) => b.avgMs - a.avgMs);
  }

  reset(): void {
    this.timings = [];
  }
}

export const globalDeduplicator = createRequestDeduplicator();

const globalSlowQueryDetector = new SlowQueryDetector();

export function optimizeQueryPatterns(): {
  userScopedQuery: <T>(table: any, userId: string, options?: { limit?: number; orderBy?: any }) => Promise<T[]>;
} {
  return {
    userScopedQuery: async <T>(
      table: any,
      userId: string,
      options?: { limit?: number; orderBy?: any }
    ): Promise<T[]> => {
      const userIdCol = table.userId;
      if (!userIdCol) {
        throw new Error("Table does not have a userId column");
      }

      let query = db.select().from(table).where(eq(userIdCol, userId));

      if (options?.orderBy) {
        query = query.orderBy(options.orderBy);
      } else if (table.createdAt) {
        query = query.orderBy(desc(table.createdAt));
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      return await query as T[];
    },
  };
}

export function getPerformanceReport(): {
  deduplication: { activeRequests: number; deduplicatedCalls: number; cacheHits: number };
  slowQueries: Array<{ name: string; avgMs: number; maxMs: number; count: number }>;
  memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
} {
  const dedupStats = globalDeduplicator.stats();
  const slowQueries = globalSlowQueryDetector.getSlowQueries().map(({ name, avgMs, maxMs, count }) => ({
    name,
    avgMs,
    maxMs,
    count,
  }));
  const mem = process.memoryUsage();

  return {
    deduplication: dedupStats,
    slowQueries,
    memoryUsage: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
    },
  };
}
