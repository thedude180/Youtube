import { db } from "../db";
import { overrideLearningRecords } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { emitDomainEvent } from "./index";

export async function recordOverride(
  overrideId: number,
  patternDetected: string,
  suggestedRuleChange: Record<string, any>,
  confidenceScore: number,
): Promise<number> {
  const [row] = await db.insert(overrideLearningRecords).values({
    overrideId,
    patternDetected,
    suggestedRuleChange,
    confidenceScore,
  }).returning();

  return row.id;
}

export async function getOverridePatterns(limit = 20) {
  return db.select().from(overrideLearningRecords)
    .orderBy(desc(overrideLearningRecords.createdAt))
    .limit(limit);
}

export async function applyOverrideLearning(recordId: number): Promise<boolean> {
  const [updated] = await db.update(overrideLearningRecords)
    .set({ applied: true, appliedAt: new Date() })
    .where(eq(overrideLearningRecords.id, recordId))
    .returning();
  return !!updated;
}
