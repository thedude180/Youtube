import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { revenueSnapshots, stripeEvents, sponsorships, type RevenueSnapshot, type InsertRevenueSnapshot } from "../../../shared/schema/index.js";

export class MoneyRepository {
  async createSnapshot(data: InsertRevenueSnapshot): Promise<RevenueSnapshot> {
    return withRetry(async () => {
      const rows = await db.insert(revenueSnapshots).values(data).returning();
      return rows[0];
    }, "money.createSnapshot");
  }

  async listSnapshots(userId: string, fromDate?: Date, toDate?: Date): Promise<RevenueSnapshot[]> {
    return withRetry(() => {
      const conditions = [eq(revenueSnapshots.userId, userId)];
      if (fromDate) conditions.push(gte(revenueSnapshots.periodStart, fromDate));
      if (toDate) conditions.push(lte(revenueSnapshots.periodEnd, toDate));
      return db.select().from(revenueSnapshots).where(and(...conditions)).orderBy(desc(revenueSnapshots.periodStart)).limit(100);
    }, "money.listSnapshots");
  }

  async getRevenueSummary(userId: string): Promise<{ totalCents: number; adCents: number; sponsorCents: number }> {
    return withRetry(async () => {
      const rows = await db.select({
        totalCents: sql<number>`sum(total_cents)`,
        adCents: sql<number>`sum(ad_revenue_cents)`,
        sponsorCents: sql<number>`sum(sponsorship_revenue_cents)`,
      }).from(revenueSnapshots).where(eq(revenueSnapshots.userId, userId));
      return rows[0] ?? { totalCents: 0, adCents: 0, sponsorCents: 0 };
    }, "money.getSummary");
  }

  async saveStripeEvent(eventId: string, type: string, userId: string | null, payload: Record<string, unknown>): Promise<void> {
    await withRetry(
      () => db.insert(stripeEvents).values({ stripeEventId: eventId, type, userId, payload, processedAt: new Date() }).onConflictDoNothing(),
      "money.saveStripeEvent",
    );
  }

  async createSponsorship(data: { userId: string; sponsorName: string; dealValueCents?: number; status?: string; notes?: string }): Promise<typeof sponsorships.$inferSelect> {
    return withRetry(async () => {
      const rows = await db.insert(sponsorships).values(data as any).returning();
      return rows[0];
    }, "money.createSponsorship");
  }

  async listSponsorships(userId: string): Promise<typeof sponsorships.$inferSelect[]> {
    return withRetry(
      () => db.select().from(sponsorships).where(eq(sponsorships.userId, userId)).orderBy(desc(sponsorships.createdAt)),
      "money.listSponsorships",
    );
  }
}

export const moneyRepo = new MoneyRepository();
