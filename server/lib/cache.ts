interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) this.store.delete(key);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  get size(): number {
    return this.store.size;
  }
}

export const apiCache = new MemoryCache(500);

export function cached<T>(key: string, ttlSeconds: number, fn: () => T | Promise<T>): T | Promise<T> {
  const existing = apiCache.get<T>(key);
  if (existing !== null) return existing;

  const result = fn();
  if (result instanceof Promise) {
    return result.then((data) => {
      apiCache.set(key, data, ttlSeconds);
      return data;
    });
  }
  apiCache.set(key, result, ttlSeconds);
  return result;
}
