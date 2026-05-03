import { eq, desc, gte, and } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { analyticsSnapshots, competitorChannels, trendSignals, type AnalyticsSnapshot, type InsertSnapshot } from "../../../shared/schema/index.js";

export class GrowthRepository {
  async saveSnapshot(data: InsertSnapshot): Promise<AnalyticsSnapshot> {
    return withRetry(async () => {
      const rows = await db.insert(analyticsSnapshots).values(data).returning();
      return rows[0];
    }, "growth.saveSnapshot");
  }

  async listSnapshots(userId: string, days = 90): Promise<AnalyticsSnapshot[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    return withRetry(
      () => db.select().from(analyticsSnapshots).where(and(eq(analyticsSnapshots.userId, userId), gte(analyticsSnapshots.snapshotDate, since))).orderBy(analyticsSnapshots.snapshotDate),
      "growth.listSnapshots",
    );
  }

  async latestSnapshot(userId: string): Promise<AnalyticsSnapshot | null> {
    return withRetry(async () => {
      const rows = await db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.userId, userId)).orderBy(desc(analyticsSnapshots.snapshotDate)).limit(1);
      return rows[0] ?? null;
    }, "growth.latestSnapshot");
  }

  async createCompetitor(data: { userId: string; channelId: string; channelName: string; platform?: string }): Promise<typeof competitorChannels.$inferSelect> {
    return withRetry(async () => {
      const rows = await db.insert(competitorChannels).values(data as any).returning();
      return rows[0];
    }, "growth.createCompetitor");
  }

  async listCompetitors(userId: string): Promise<typeof competitorChannels.$inferSelect[]> {
    return withRetry(
      () => db.select().from(competitorChannels).where(eq(competitorChannels.userId, userId)).orderBy(desc(competitorChannels.subscriberCount)),
      "growth.listCompetitors",
    );
  }

  async updateCompetitor(id: number, data: { subscriberCount?: number; viewCount?: number; insights?: Record<string, unknown> }): Promise<void> {
    await withRetry(
      () => db.update(competitorChannels).set({ ...data, lastAnalyzedAt: new Date() }).where(eq(competitorChannels.id, id)),
      "growth.updateCompetitor",
    );
  }

  async saveTrend(data: { userId: string; signal: string; category?: string; score?: number }): Promise<void> {
    await withRetry(
      () => db.insert(trendSignals).values({ ...data, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000) } as any),
      "growth.saveTrend",
    );
  }

  async listTrends(userId: string): Promise<typeof trendSignals.$inferSelect[]> {
    return withRetry(
      () => db.select().from(trendSignals).where(and(eq(trendSignals.userId, userId), gte(trendSignals.expiresAt, new Date()))).orderBy(desc(trendSignals.score)).limit(20),
      "growth.listTrends",
    );
  }
}

export const growthRepo = new GrowthRepository();
