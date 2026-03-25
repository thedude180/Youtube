import { db } from "../db";
import { revenueAttribution } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function attributeRevenue(
  userId: string,
  videoId: number,
  source: string,
  amount: number,
  metadata?: Record<string, any>,
): Promise<number> {
  const [row] = await db.insert(revenueAttribution).values({
    userId,
    videoId,
    source,
    amount: String(amount),
    metadata: metadata || {},
  } as any).returning();
  return row.id;
}

export async function getRevenueGraph(userId: string, limit = 50) {
  return db.select().from(revenueAttribution)
    .where(eq(revenueAttribution.userId, userId))
    .orderBy(desc(revenueAttribution.createdAt))
    .limit(limit);
}
