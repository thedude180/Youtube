import { createLogger } from "./logger";
import { registerCleanup } from "../services/cleanup-coordinator";

const logger = createLogger("engine-store");

interface StoreEntry<T> {
  data: T[];
  hydratedAt: number;
  lastAccessedAt: number;
  dirty: boolean;
}

type QueryFn<T> = () => Promise<T[]>;

export class EngineLocalStore {
  private name: string;
  private collections = new Map<string, StoreEntry<any>>();
  private refreshMs: number;
  private queryRegistry = new Map<string, QueryFn<any>>();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private maxCollections: number;

  constructor(name: string, refreshMs = 3 * 60_000, maxCollections = 300) {
    this.name = name;
    this.refreshMs = refreshMs;
    this.maxCollections = maxCollections;
  }

  private evictIfNeeded(): void {
    if (this.collections.size <= this.maxCollections) return;

    const entries = Array.from(this.collections.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    const toRemove = Math.max(1, Math.floor(this.maxCollections * 0.1));
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const key = entries[i][0];
      this.collections.delete(key);
      this.queryRegistry.delete(key);
    }

    logger.debug(`[${this.name}] Evicted ${toRemove} LRU entries (was ${entries.length})`);
  }

  registerQuery<T>(key: string, queryFn: QueryFn<T>): void {
    this.queryRegistry.set(key, queryFn);
  }

  async get<T>(key: string, forceRefresh = false): Promise<T[]> {
    const entry = this.collections.get(key);
    const now = Date.now();

    if (!forceRefresh && entry && now - entry.hydratedAt < this.refreshMs) {
      entry.lastAccessedAt = now;
      return entry.data as T[];
    }

    const queryFn = this.queryRegistry.get(key);
    if (!queryFn) return [];

    try {
      const data = await queryFn();
      this.collections.set(key, { data, hydratedAt: now, lastAccessedAt: now, dirty: false });
      this.evictIfNeeded();
      return data as T[];
    } catch (err: any) {
      if (entry) {
        entry.lastAccessedAt = now;
        return entry.data as T[];
      }
      logger.warn(`[${this.name}] Query "${key}" failed: ${err.message?.substring(0, 100)}`);
      return [];
    }
  }

  async getOne<T>(key: string, forceRefresh = false): Promise<T | null> {
    const results = await this.get<T>(key, forceRefresh);
    return results[0] || null;
  }

  put<T>(key: string, data: T[]): void {
    const now = Date.now();
    this.collections.set(key, { data, hydratedAt: now, lastAccessedAt: now, dirty: false });
    this.evictIfNeeded();
  }

  append<T>(key: string, item: T): void {
    const now = Date.now();
    const entry = this.collections.get(key);
    if (entry) {
      entry.data.push(item);
      entry.lastAccessedAt = now;
      entry.dirty = true;
    } else {
      this.collections.set(key, { data: [item], hydratedAt: now, lastAccessedAt: now, dirty: true });
      this.evictIfNeeded();
    }
  }

  invalidate(key?: string): void {
    if (key) {
      this.collections.delete(key);
    } else {
      this.collections.clear();
    }
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.collections.keys()) {
      if (key.startsWith(prefix)) {
        this.collections.delete(key);
      }
    }
  }

  purgeStaleEntries(): void {
    const cutoff = Date.now() - 2 * this.refreshMs;
    let purged = 0;
    for (const [key, entry] of this.collections.entries()) {
      if (entry.lastAccessedAt < cutoff) {
        this.collections.delete(key);
        this.queryRegistry.delete(key);
        purged++;
      }
    }
    if (purged > 0) {
      logger.debug(`[${this.name}] Purged ${purged} stale entries (TTL expired)`);
    }
  }

  async hydrateAll(): Promise<void> {
    if (this.hydratePromise) return this.hydratePromise;

    this.hydratePromise = (async () => {
      const keys = Array.from(this.queryRegistry.keys());
      const batchSize = 5;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(key => this.get(key)));
      }

      this.hydrated = true;
      logger.info(`[${this.name}] Hydrated ${keys.length} collections from DB`);
    })();

    try {
      await this.hydratePromise;
    } finally {
      this.hydratePromise = null;
    }
  }

  get isHydrated(): boolean { return this.hydrated; }
  get size(): number { return this.collections.size; }
  get stats(): { name: string; collections: number; totalRecords: number; hydrated: boolean } {
    let totalRecords = 0;
    for (const entry of this.collections.values()) {
      totalRecords += entry.data.length;
    }
    return { name: this.name, collections: this.collections.size, totalRecords, hydrated: this.hydrated };
  }
}

const engineStores = new Map<string, EngineLocalStore>();

export function createEngineStore(name: string, refreshMs?: number): EngineLocalStore {
  const existing = engineStores.get(name);
  if (existing) return existing;

  const store = new EngineLocalStore(name, refreshMs);
  engineStores.set(name, store);
  return store;
}

export function getEngineStore(name: string): EngineLocalStore | undefined {
  return engineStores.get(name);
}

export function getAllStoreStats(): Array<{ name: string; collections: number; totalRecords: number; hydrated: boolean }> {
  return Array.from(engineStores.values()).map(s => s.stats);
}

export function invalidateAllStores(): void {
  for (const store of engineStores.values()) {
    store.invalidate();
  }
}

export function purgeAllStaleEntries(): void {
  for (const store of engineStores.values()) {
    store.purgeStaleEntries();
  }
}

export function buildUserKey(userId: string, suffix: string): string {
  return `${(userId || "").substring(0, 12)}:${suffix}`;
}

export function registerUserQueries(
  store: EngineLocalStore,
  userId: string,
  queryMap: Record<string, QueryFn<any>>
): void {
  for (const [suffix, fn] of Object.entries(queryMap)) {
    store.registerQuery(buildUserKey(userId, suffix), fn);
  }
}

export async function getUserData<T>(store: EngineLocalStore, userId: string, suffix: string, forceRefresh = false): Promise<T[]> {
  return store.get<T>(buildUserKey(userId, suffix), forceRefresh);
}

export async function getUserDataOne<T>(store: EngineLocalStore, userId: string, suffix: string, forceRefresh = false): Promise<T | null> {
  return store.getOne<T>(buildUserKey(userId, suffix), forceRefresh);
}

export function invalidateUserData(store: EngineLocalStore, userId: string, suffix?: string): void {
  if (suffix) {
    store.invalidate(buildUserKey(userId, suffix));
  } else {
    store.invalidatePrefix((userId || "").substring(0, 12));
  }
}

registerCleanup("engineStoreStalePurge", purgeAllStaleEntries, 30 * 60_000);
