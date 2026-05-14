/**
 * lru-map.ts — Bounded Map with automatic LRU eviction.
 *
 * Drop-in replacement for `new Map<K, V>()` in background services
 * where entries accumulate over time (per-user counters, latency history, etc.).
 *
 * When the map exceeds `maxSize`, the oldest 25% of entries are evicted.
 */

export class LRUMap<K, V> extends Map<K, V> {
  private readonly maxSize: number;

  constructor(maxSize: number = 10_000) {
    super();
    this.maxSize = maxSize;
  }

  override set(key: K, value: V): this {
    // Move to end (most recently used)
    if (this.has(key)) super.delete(key);
    super.set(key, value);
    this.evictIfNeeded();
    return this;
  }

  override get(key: K): V | undefined {
    const value = super.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      super.delete(key);
      super.set(key, value);
    }
    return value;
  }

  private evictIfNeeded(): void {
    if (this.size <= this.maxSize) return;
    const evictCount = Math.ceil(this.maxSize * 0.25);
    let removed = 0;
    for (const key of this.keys()) {
      if (removed >= evictCount) break;
      this.delete(key);
      removed++;
    }
  }
}
