import { db } from "../db";
import { replayFactoryJobs } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { emitDomainEvent } from "../kernel/index";

export async function createReplay(
  userId: string,
  replayType: string,
  sourceAtomId?: number,
  config?: Record<string, any>,
): Promise<number> {
  const [row] = await db.insert(replayFactoryJobs).values({
    userId,
    sourceAtomId: sourceAtomId || null,
    replayType,
    config: config || {},
  }).returning();

  await emitDomainEvent(userId, "replay.created", {
    replayId: row.id,
    replayType,
    sourceAtomId,
  });

  return row.id;
}

export async function listReplays(userId: string, options?: { status?: string; limit?: number }) {
  if (options?.status) {
    return db.select().from(replayFactoryJobs)
      .where(and(eq(replayFactoryJobs.userId, userId), eq(replayFactoryJobs.status, options.status)))
      .orderBy(desc(replayFactoryJobs.createdAt))
      .limit(options?.limit || 20);
  }
  return db.select().from(replayFactoryJobs)
    .where(eq(replayFactoryJobs.userId, userId))
    .orderBy(desc(replayFactoryJobs.createdAt))
    .limit(options?.limit || 20);
}

export async function completeReplay(replayId: number, result: Record<string, any>): Promise<boolean> {
  const [updated] = await db.update(replayFactoryJobs)
    .set({ status: "completed", result, completedAt: new Date() })
    .where(eq(replayFactoryJobs.id, replayId))
    .returning();
  return !!updated;
}

export async function failReplay(replayId: number, error: string): Promise<boolean> {
  const [updated] = await db.update(replayFactoryJobs)
    .set({ status: "failed", result: { error } })
    .where(eq(replayFactoryJobs.id, replayId))
    .returning();
  return !!updated;
}
