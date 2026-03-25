import { db } from "../db";
import { learningDecayRecords } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export async function applyDecay(
  userId: string,
  signalType: string,
  decayRate = 0.05,
): Promise<{ currentWeight: number; contradictions: number }> {
  const existing = await db.select().from(learningDecayRecords)
    .where(and(eq(learningDecayRecords.userId, userId), eq(learningDecayRecords.signalType, signalType)))
    .orderBy(desc(learningDecayRecords.createdAt))
    .limit(1);

  if (existing.length > 0) {
    const record = existing[0];
    const newWeight = Math.max(0.01, (record.currentWeight || 1) * (1 - decayRate));

    const [updated] = await db.update(learningDecayRecords)
      .set({
        currentWeight: newWeight,
        lastDecayAt: new Date(),
      })
      .where(eq(learningDecayRecords.id, record.id))
      .returning();

    return {
      currentWeight: updated.currentWeight,
      contradictions: updated.contradictions || 0,
    };
  }

  const [row] = await db.insert(learningDecayRecords).values({
    userId,
    signalType,
    originalWeight: 1.0,
    currentWeight: 1.0 - decayRate,
    decayRate,
  }).returning();

  return {
    currentWeight: row.currentWeight,
    contradictions: 0,
  };
}

export async function recordContradiction(
  userId: string,
  signalType: string,
): Promise<{ contradictions: number; currentWeight: number }> {
  const existing = await db.select().from(learningDecayRecords)
    .where(and(eq(learningDecayRecords.userId, userId), eq(learningDecayRecords.signalType, signalType)))
    .orderBy(desc(learningDecayRecords.createdAt))
    .limit(1);

  if (existing.length > 0) {
    const record = existing[0];
    const newContradictions = (record.contradictions || 0) + 1;
    const penaltyFactor = Math.max(0.5, 1 - newContradictions * 0.1);
    const newWeight = Math.max(0.01, (record.currentWeight || 1) * penaltyFactor);

    const [updated] = await db.update(learningDecayRecords)
      .set({
        currentWeight: newWeight,
        contradictions: newContradictions,
        lastDecayAt: new Date(),
      })
      .where(eq(learningDecayRecords.id, record.id))
      .returning();

    return {
      contradictions: updated.contradictions || 0,
      currentWeight: updated.currentWeight,
    };
  }

  const [row] = await db.insert(learningDecayRecords).values({
    userId,
    signalType,
    originalWeight: 1.0,
    currentWeight: 0.9,
    decayRate: 0.05,
    contradictions: 1,
  }).returning();

  return {
    contradictions: 1,
    currentWeight: row.currentWeight,
  };
}

export async function getDecayStatus(userId: string) {
  return db.select().from(learningDecayRecords)
    .where(eq(learningDecayRecords.userId, userId))
    .orderBy(desc(learningDecayRecords.lastDecayAt))
    .limit(50);
}
