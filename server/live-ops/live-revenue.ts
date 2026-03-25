import { db } from "../db";
import { liveCommerceEvents } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function attributeLiveRevenue(
  userId: string,
  streamId: string,
  source: string,
  amount: number,
  currency = "USD",
  viewerCount = 0,
  metadata: Record<string, any> = {},
): Promise<number> {
  const [row] = await db.insert(liveCommerceEvents).values({
    userId,
    streamId,
    eventType: "revenue",
    amount,
    currency,
    source,
    viewerCount,
    metadata,
  }).returning();
  return row.id;
}

export async function getLiveRevenueBreakdown(userId: string, streamId?: string) {
  let events;
  if (streamId) {
    events = await db.select().from(liveCommerceEvents)
      .where(and(eq(liveCommerceEvents.userId, userId), eq(liveCommerceEvents.streamId, streamId)))
      .orderBy(desc(liveCommerceEvents.createdAt));
  } else {
    events = await db.select().from(liveCommerceEvents)
      .where(eq(liveCommerceEvents.userId, userId))
      .orderBy(desc(liveCommerceEvents.createdAt))
      .limit(100);
  }

  const bySource: Record<string, number> = {};
  let totalRevenue = 0;
  for (const e of events) {
    const amt = e.amount || 0;
    bySource[e.source] = (bySource[e.source] || 0) + amt;
    totalRevenue += amt;
  }

  return {
    totalRevenue,
    bySource,
    eventCount: events.length,
    avgRevenuePerEvent: events.length > 0 ? totalRevenue / events.length : 0,
  };
}
