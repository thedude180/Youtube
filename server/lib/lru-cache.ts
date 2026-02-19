export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number }>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 100, defaultTTLMs: number = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiry: Date.now() + (ttlMs ?? this.defaultTTL) });
  }

  clear(): void { this.cache.clear(); }
  get size(): number { return this.cache.size; }
}
