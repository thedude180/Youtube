import { db } from "../db";
import { liveLearningSignals } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function recordLiveLearning(
  userId: string,
  streamId: string,
  signalType: string,
  signalValue: number,
  context: Record<string, any> = {},
  appliedTo?: string,
): Promise<number> {
  const [row] = await db.insert(liveLearningSignals).values({
    userId,
    streamId,
    signalType,
    signalValue,
    context,
    appliedTo,
  }).returning();
  return row.id;
}

export async function getLiveLearningContext(userId: string, limit = 30) {
  const signals = await db.select().from(liveLearningSignals)
    .where(eq(liveLearningSignals.userId, userId))
    .orderBy(desc(liveLearningSignals.createdAt))
    .limit(limit);

  const byType = new Map<string, { total: number; count: number; latest: number }>();
  for (const s of signals) {
    const existing = byType.get(s.signalType) || { total: 0, count: 0, latest: 0 };
    existing.total += s.signalValue || 0;
    existing.count += 1;
    existing.latest = Math.max(existing.latest, s.signalValue || 0);
    byType.set(s.signalType, existing);
  }

  const summary: Record<string, { avg: number; count: number; latest: number }> = {};
  for (const [type, data] of byType) {
    summary[type] = {
      avg: data.count > 0 ? data.total / data.count : 0,
      count: data.count,
      latest: data.latest,
    };
  }

  return { signals: signals.slice(0, 10), summary, totalSignals: signals.length };
}

export async function getStreamLearning(userId: string, streamId: string) {
  return db.select().from(liveLearningSignals)
    .where(and(eq(liveLearningSignals.userId, userId), eq(liveLearningSignals.streamId, streamId)))
    .orderBy(desc(liveLearningSignals.createdAt));
}
