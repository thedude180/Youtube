import { db } from "../db";
import { liveCommerceEvents } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function trackCommerceEvent(
  userId: string,
  streamId: string,
  eventType: string,
  source: string,
  amount = 0,
  currency = "USD",
  viewerCount = 0,
  metadata: Record<string, any> = {},
): Promise<number> {
  const [row] = await db.insert(liveCommerceEvents).values({
    userId,
    streamId,
    eventType,
    source,
    amount,
    currency,
    viewerCount,
    metadata,
  }).returning();
  return row.id;
}

export async function getCommerceInsights(userId: string, limit = 50) {
  const events = await db.select().from(liveCommerceEvents)
    .where(eq(liveCommerceEvents.userId, userId))
    .orderBy(desc(liveCommerceEvents.createdAt))
    .limit(limit);

  const byType: Record<string, { count: number; totalAmount: number }> = {};
  for (const e of events) {
    if (!byType[e.eventType]) byType[e.eventType] = { count: 0, totalAmount: 0 };
    byType[e.eventType].count++;
    byType[e.eventType].totalAmount += e.amount || 0;
  }

  return {
    events: events.slice(0, 10),
    breakdown: byType,
    totalEvents: events.length,
  };
}

export function getCommerceOpportunities(viewerCount: number, streamDurationMinutes: number): string[] {
  const opportunities: string[] = [];

  if (viewerCount >= 50 && streamDurationMinutes >= 30) {
    opportunities.push("Viewer milestone celebration — acknowledge the audience");
  }
  if (viewerCount >= 100) {
    opportunities.push("Membership drive — prompt channel memberships");
  }
  if (streamDurationMinutes >= 60 && viewerCount >= 25) {
    opportunities.push("Super Chat engagement — thank recent supporters");
  }
  if (viewerCount >= 200) {
    opportunities.push("Merch mention — subtle brand merchandise reference");
  }

  return opportunities;
}
