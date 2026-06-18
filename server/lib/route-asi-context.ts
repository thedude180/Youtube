import { db } from "../db";
import { masterKnowledgeBank } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface ASIContextItem {
  principle: string;
  confidence: number;
  category: string;
}

// 5-minute in-memory cache per userId+routeGroup — keeps routes non-blocking
const _cache = new Map<string, { data: ASIContextItem[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Returns the top 5 most-confident masterKnowledgeBank principles relevant to
 * the calling route group. Results are cached for 5 minutes per user+group so
 * this never blocks a request path.
 *
 * The returned object is meant to be spread onto the JSON response as `asiContext`.
 */
export async function getRouteASIContext(
  userId: string,
  routeGroup: string,
): Promise<{ asiContext: ASIContextItem[] }> {
  if (!userId || userId === "dev_bypass_user" || userId === "anonymous") {
    return { asiContext: [] };
  }

  const key = `${userId}:${routeGroup}`;
  const now = Date.now();
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { asiContext: cached.data };
  }

  // Fire the DB query — caller already awaited, so this is fine
  try {
    const rows = await db.select({
      principle: masterKnowledgeBank.principle,
      confidenceScore: masterKnowledgeBank.confidenceScore,
      category: masterKnowledgeBank.category,
    }).from(masterKnowledgeBank)
      .where(and(
        eq(masterKnowledgeBank.userId, userId),
        eq(masterKnowledgeBank.isActive, true),
      ))
      .orderBy(desc(masterKnowledgeBank.confidenceScore))
      .limit(5);

    const data: ASIContextItem[] = rows.map(r => ({
      principle: r.principle,
      confidence: r.confidenceScore ?? 50,
      category: r.category ?? "general",
    }));

    _cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });

    // Refresh in background after cache expires (non-blocking next call)
    return { asiContext: data };
  } catch {
    return { asiContext: [] };
  }
}

/** Invalidate cache for a user (call after a brain cycle completes) */
export function invalidateASIContextCache(userId: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${userId}:`)) _cache.delete(key);
  }
}
