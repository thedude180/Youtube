/**
 * server/lib/performance-memory.ts
 *
 * Phase 13 — Channel Performance Memory
 *
 * Persists per-channel learned performance patterns that improve future
 * automated decisions. Growth experiment results write here.
 *
 * Confidence thresholds:
 *   >= 0.85: auto-apply safe changes
 *   0.65–0.84: stage for review
 *   < 0.65: learn only
 */

import { createLogger } from "./logger";

const log = createLogger("performance-memory");

export interface PerformanceMemoryData {
  bestTitleFormulas: Array<{ formula: string; avgCtr: number; samples: number }>;
  worstTitleFormulas: Array<{ formula: string; avgCtr: number; samples: number }>;
  bestThumbnailPatterns: Array<{ pattern: string; avgCtr: number; samples: number }>;
  bestGames: Array<{ game: string; avgViews: number; avgRetention: number; samples: number }>;
  bestUploadWindows: Array<{ dayOfWeek: number; hourUtc: number; avgViews: number; samples: number }>;
  noCommentaryPerformance: { avgViewsMultiplier: number; samples: number };
  ps5BrandingPerformance: { avgViewsMultiplier: number; samples: number };
  recurringFailures: Array<{ code: string; count: number; lastAt: number }>;
  successfulRepairs: Array<{ action: string; count: number; avgImpact: number }>;
  lastUpdatedAt: number;
}

const DEFAULT_MEMORY: PerformanceMemoryData = {
  bestTitleFormulas: [],
  worstTitleFormulas: [],
  bestThumbnailPatterns: [],
  bestGames: [],
  bestUploadWindows: [],
  noCommentaryPerformance: { avgViewsMultiplier: 1.0, samples: 0 },
  ps5BrandingPerformance: { avgViewsMultiplier: 1.0, samples: 0 },
  recurringFailures: [],
  successfulRepairs: [],
  lastUpdatedAt: 0,
};

// ── In-memory cache ───────────────────────────────────────────────────────────
const _cache = new Map<string, PerformanceMemoryData>();
const CACHE_TTL_MS = 5 * 60_000;
const _cacheTime = new Map<string, number>();

// ── DB access (lazy) ──────────────────────────────────────────────────────────

async function loadFromDb(userId: string): Promise<PerformanceMemoryData | null> {
  try {
    const { db } = await import("../db");
    const { channelPerformanceMemory } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select()
      .from(channelPerformanceMemory)
      .where(eq(channelPerformanceMemory.userId, userId))
      .limit(1);

    if (!row) return null;
    return row.data as unknown as PerformanceMemoryData;
  } catch {
    return null;
  }
}

async function saveToDb(userId: string, data: PerformanceMemoryData): Promise<void> {
  try {
    const { db } = await import("../db");
    const { channelPerformanceMemory } = await import("@shared/schema");

    await db
      .insert(channelPerformanceMemory)
      .values({ userId, data: data as any, updatedAt: new Date() } as any)
      .onConflictDoUpdate({
        target: channelPerformanceMemory.userId,
        set: { data: data as any, updatedAt: new Date() },
      });
  } catch (err: any) {
    log.warn(`[PerformanceMemory] Failed to save for userId=${userId}: ${err?.message}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const PerformanceMemory = {
  /**
   * Load the performance memory for a user (cache-first, 5-minute TTL).
   */
  async getMemory(userId: string): Promise<PerformanceMemoryData> {
    const now = Date.now();
    const cached = _cache.get(userId);
    const cacheTime = _cacheTime.get(userId) ?? 0;

    if (cached && now - cacheTime < CACHE_TTL_MS) return cached;

    const fromDb = await loadFromDb(userId);
    const data = fromDb ?? { ...DEFAULT_MEMORY };
    _cache.set(userId, data);
    _cacheTime.set(userId, now);
    return data;
  },

  /**
   * Merge a patch into the memory and persist it.
   */
  async updateMemory(userId: string, patch: Partial<PerformanceMemoryData>): Promise<void> {
    const current = await this.getMemory(userId);
    const updated: PerformanceMemoryData = {
      ...current,
      ...patch,
      lastUpdatedAt: Date.now(),
    };
    _cache.set(userId, updated);
    _cacheTime.set(userId, Date.now());
    await saveToDb(userId, updated);
  },

  /**
   * Get confidence for a specific key (e.g. "bestGames").
   * Returns 0 if no data exists.
   */
  async getConfidence(userId: string, key: keyof PerformanceMemoryData): Promise<number> {
    const mem = await this.getMemory(userId);
    const val = mem[key];
    if (!val) return 0;

    if (Array.isArray(val)) {
      const total = val.reduce((s: number, v: any) => s + (v.samples ?? 1), 0);
      return Math.min(1, total / 20); // 20 samples = full confidence
    }
    if (typeof val === "object" && "samples" in val) {
      return Math.min(1, (val as any).samples / 10);
    }
    return 0;
  },

  /**
   * Should this insight be auto-applied (vs staged for review)?
   */
  async shouldAutoApply(userId: string, key: keyof PerformanceMemoryData): Promise<boolean> {
    const confidence = await this.getConfidence(userId, key);
    return confidence >= 0.85;
  },

  /**
   * Record a recurring failure pattern.
   */
  async recordFailure(userId: string, code: string): Promise<void> {
    const mem = await this.getMemory(userId);
    const existing = mem.recurringFailures.find(f => f.code === code);
    if (existing) {
      existing.count++;
      existing.lastAt = Date.now();
    } else {
      mem.recurringFailures.push({ code, count: 1, lastAt: Date.now() });
    }
    // Keep only top-20 most frequent
    mem.recurringFailures.sort((a, b) => b.count - a.count);
    if (mem.recurringFailures.length > 20) mem.recurringFailures.length = 20;
    await this.updateMemory(userId, { recurringFailures: mem.recurringFailures });
  },

  /**
   * Record a successful repair action.
   */
  async recordRepair(userId: string, action: string, impact: number): Promise<void> {
    const mem = await this.getMemory(userId);
    const existing = mem.successfulRepairs.find(r => r.action === action);
    if (existing) {
      existing.avgImpact = (existing.avgImpact * existing.count + impact) / (existing.count + 1);
      existing.count++;
    } else {
      mem.successfulRepairs.push({ action, count: 1, avgImpact: impact });
    }
    await this.updateMemory(userId, { successfulRepairs: mem.successfulRepairs });
  },
};

export default PerformanceMemory;
