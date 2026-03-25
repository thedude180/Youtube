import { db } from "../db";
import { provenanceTags } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export async function tagProvenance(
  entityType: string,
  entityId: number,
  tagType: string,
  origin: string,
  options: {
    agentName?: string;
    confidence?: number;
    chain?: Record<string, any>[];
    metadata?: Record<string, any>;
  } = {},
): Promise<number> {
  const [row] = await db.insert(provenanceTags).values({
    entityType,
    entityId,
    tagType,
    origin,
    agentName: options.agentName || null,
    confidence: options.confidence || null,
    chain: options.chain || [],
    metadata: options.metadata || {},
  }).returning();

  return row.id;
}

export async function getProvenance(entityType: string, entityId: number) {
  return db.select().from(provenanceTags)
    .where(and(eq(provenanceTags.entityType, entityType), eq(provenanceTags.entityId, entityId)))
    .orderBy(desc(provenanceTags.createdAt));
}

export async function getProvenanceChain(entityType: string, entityId: number): Promise<Record<string, any>[]> {
  const tags = await getProvenance(entityType, entityId);
  return tags.flatMap(t => [
    { tagType: t.tagType, origin: t.origin, agentName: t.agentName, confidence: t.confidence, createdAt: t.createdAt },
    ...((t.chain as Record<string, any>[]) || []),
  ]);
}
