import { createLogger } from './logger';

const logger = createLogger('cache');

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    import("../services/cleanup-coordinator").then(m => m.registerCleanup("simpleCache", () => this.cleanup(), 60_000)).catch(() => {
      setInterval(() => this.cleanup(), 60_000);
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs = 300_000): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of Array.from(this.cache)) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) logger.debug(`Cleaned ${cleaned} expired cache entries`);
  }

  get size(): number { return this.cache.size; }
}

export const apiCache = new SimpleCache();

export function clearApiCache(): void {
  apiCache.invalidate();
}

export function cached<T>(key: string, ttlSeconds: number, fn: () => T | Promise<T>): T | Promise<T> {
  const existing = apiCache.get<T>(key);
  if (existing !== null) return existing;

  const ttlMs = ttlSeconds * 1000;
  const result = fn();
  if (result instanceof Promise) {
    return result.then((data) => {
      apiCache.set(key, data, ttlMs);
      return data;
    });
  }
  apiCache.set(key, result, ttlMs);
  return result;
}
