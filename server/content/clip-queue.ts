import { db } from "../db";
import { clipQueueItems } from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { emitDomainEvent } from "../kernel/index";

export async function enqueueClip(
  userId: string,
  clipType: string,
  options: {
    sourceAtomId?: number;
    sourceVideoId?: number;
    startTime?: number;
    endTime?: number;
    priority?: number;
    metadata?: Record<string, any>;
  } = {},
): Promise<number> {
  const [row] = await db.insert(clipQueueItems).values({
    userId,
    clipType,
    sourceAtomId: options.sourceAtomId || null,
    sourceVideoId: options.sourceVideoId || null,
    startTime: options.startTime || null,
    endTime: options.endTime || null,
    priority: options.priority || 0,
    metadata: options.metadata || {},
  }).returning();

  await emitDomainEvent(userId, "clip.queued", {
    clipId: row.id,
    clipType,
    priority: options.priority || 0,
  });

  return row.id;
}

export async function dequeueClip(userId: string): Promise<typeof clipQueueItems.$inferSelect | null> {
  const rows = await db.select().from(clipQueueItems)
    .where(and(eq(clipQueueItems.userId, userId), eq(clipQueueItems.status, "queued")))
    .orderBy(desc(clipQueueItems.priority), asc(clipQueueItems.createdAt))
    .limit(1);

  if (rows.length === 0) return null;

  const clip = rows[0];
  await db.update(clipQueueItems)
    .set({ status: "processing" })
    .where(eq(clipQueueItems.id, clip.id));

  return clip;
}

export async function completeClip(clipId: number): Promise<void> {
  await db.update(clipQueueItems)
    .set({ status: "completed", processedAt: new Date() })
    .where(eq(clipQueueItems.id, clipId));
}

export async function getClipQueue(userId: string, status?: string) {
  if (status) {
    return db.select().from(clipQueueItems)
      .where(and(eq(clipQueueItems.userId, userId), eq(clipQueueItems.status, status)))
      .orderBy(desc(clipQueueItems.priority), asc(clipQueueItems.createdAt))
      .limit(50);
  }
  return db.select().from(clipQueueItems)
    .where(eq(clipQueueItems.userId, userId))
    .orderBy(desc(clipQueueItems.priority), asc(clipQueueItems.createdAt))
    .limit(50);
}
