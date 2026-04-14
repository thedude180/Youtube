import { db } from "../db";
import { usageMetrics } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("usage-metering");
const TIER_LIMITS: Record<string, Record<string, number>> = {
  free: { ai_calls: 50, videos_processed: 5, platforms: 2, posts_per_day: 5 },
  starter: { ai_calls: 500, videos_processed: 50, platforms: 4, posts_per_day: 25 },
  pro: { ai_calls: 2000, videos_processed: 200, platforms: 6, posts_per_day: 100 },
  ultimate: { ai_calls: 999999, videos_processed: 999999, platforms: 999, posts_per_day: 999999 },
};

export async function trackUsage(userId: string, metricType: string, increment: number = 1): Promise<{ allowed: boolean; current: number; limit: number }> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  
  try {
    const existing = await db.select().from(usageMetrics)
      .where(and(
        eq(usageMetrics.userId, userId),
        eq(usageMetrics.metricType, metricType),
        gte(usageMetrics.periodStart, periodStart)
      ))
      .limit(1);

    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    const tier = (user as any)?.tier || (user as any)?.subscriptionTier || 'free';
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const limit = limits[metricType] || 999999;

    if (existing.length > 0) {
      const current = (existing[0].count || 0) + increment;
      if (current > limit) return { allowed: false, current: existing[0].count || 0, limit };
      await db.update(usageMetrics).set({ count: current }).where(eq(usageMetrics.id, existing[0].id));
      return { allowed: true, current, limit };
    } else {
      if (increment > limit) return { allowed: false, current: 0, limit };
      await db.insert(usageMetrics).values({ userId, metricType, count: increment, periodStart });
      return { allowed: true, current: increment, limit };
    }
  } catch (e) {
    logger.error("[UsageMetering] Error:", e);
    return { allowed: false, current: 0, limit: 0 };
  }
}

export async function getUsageSummary(userId: string): Promise<Record<string, { current: number; limit: number; percentage: number }>> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  
  try {
    const metrics = await db.select().from(usageMetrics)
      .where(and(eq(usageMetrics.userId, userId), gte(usageMetrics.periodStart, periodStart)));
    
    const { storage } = await import("../storage");
    const user = await storage.getUser(userId);
    const tier = (user as any)?.tier || (user as any)?.subscriptionTier || 'free';
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    
    const summary: Record<string, { current: number; limit: number; percentage: number }> = {};
    for (const [key, limit] of Object.entries(limits)) {
      const metric = metrics.find(m => m.metricType === key);
      const current = metric?.count || 0;
      summary[key] = { current, limit, percentage: Math.round((current / limit) * 100) };
    }
    return summary;
  } catch (e) {
    logger.error("[UsageMetering] Summary error:", e);
    return {};
  }
}
