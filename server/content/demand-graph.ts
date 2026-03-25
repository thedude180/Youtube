import { db } from "../db";
import { contentDemandGraphNodes } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function seedDemandGraph(userId: string): Promise<number> {
  const gamingTopics = [
    { topic: "Elden Ring", demand: 0.9, supply: 0.7 },
    { topic: "God of War Ragnarok", demand: 0.85, supply: 0.6 },
    { topic: "Final Fantasy XVI", demand: 0.75, supply: 0.4 },
    { topic: "Spider-Man 2", demand: 0.8, supply: 0.65 },
    { topic: "Stellar Blade", demand: 0.7, supply: 0.3 },
    { topic: "Demon's Souls", demand: 0.6, supply: 0.5 },
    { topic: "Horizon Forbidden West", demand: 0.65, supply: 0.55 },
    { topic: "Bloodborne", demand: 0.75, supply: 0.8 },
    { topic: "Dark Souls III", demand: 0.7, supply: 0.75 },
    { topic: "Sekiro", demand: 0.65, supply: 0.45 },
  ];

  let seeded = 0;
  for (const t of gamingTopics) {
    const gap = Math.max(0, t.demand - t.supply);
    await db.insert(contentDemandGraphNodes).values({
      userId,
      topic: t.topic,
      demandScore: t.demand,
      supplyScore: t.supply,
      gapScore: gap,
      trendDirection: gap > 0.2 ? "rising" : gap < -0.1 ? "declining" : "stable",
      sources: ["youtube-search", "trending", "audience-signals"],
    }).onConflictDoNothing();
    seeded++;
  }

  return seeded;
}

export async function queryDemand(userId: string, options?: { minGap?: number; limit?: number }) {
  const nodes = await db.select().from(contentDemandGraphNodes)
    .where(eq(contentDemandGraphNodes.userId, userId))
    .orderBy(desc(contentDemandGraphNodes.gapScore))
    .limit(options?.limit || 20);

  if (options?.minGap) {
    return nodes.filter(n => (n.gapScore || 0) >= options.minGap!);
  }
  return nodes;
}

export async function updateDemandNode(nodeId: number, updates: {
  demandScore?: number;
  supplyScore?: number;
  trendDirection?: string;
}): Promise<boolean> {
  const current = await db.select().from(contentDemandGraphNodes)
    .where(eq(contentDemandGraphNodes.id, nodeId)).limit(1);
  if (current.length === 0) return false;

  const node = current[0];
  const newDemand = updates.demandScore ?? node.demandScore ?? 0;
  const newSupply = updates.supplyScore ?? node.supplyScore ?? 0;

  const [updated] = await db.update(contentDemandGraphNodes)
    .set({
      ...updates,
      gapScore: Math.max(0, newDemand - newSupply),
      updatedAt: new Date(),
    })
    .where(eq(contentDemandGraphNodes.id, nodeId))
    .returning();

  return !!updated;
}
