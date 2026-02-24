const CLEANUP_INTERVAL = 10 * 60 * 1000;
const DEFAULT_TTL = 30 * 60 * 1000;

interface TimedEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLMap<K, V> {
  private map = new Map<K, TimedEntry<V>>();
  private ttl: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(ttlMs: number = DEFAULT_TTL) {
    this.ttl = ttlMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  set(key: K, value: V, customTtl?: number): void {
    this.map.set(key, { value, expiresAt: Date.now() + (customTtl || this.ttl) });
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
        cleaned++;
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.map.clear();
  }
}
