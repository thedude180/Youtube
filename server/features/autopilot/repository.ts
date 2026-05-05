import { eq, and, desc, lte, sql } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { autopilotQueue, autopilotConfig, type AutopilotQueueItem, type InsertQueueItem, type AutopilotConfig } from "../../../shared/schema/index.js";

export class AutopilotRepository {
  async enqueue(data: InsertQueueItem): Promise<AutopilotQueueItem> {
    return withRetry(async () => {
      const rows = await db.insert(autopilotQueue).values(data).returning();
      return rows[0];
    }, "autopilot.enqueue");
  }

  async updateStatus(id: number, status: string, extra?: { platformPostId?: string; lastError?: string; publishedAt?: Date }): Promise<void> {
    await withRetry(
      () => db.update(autopilotQueue).set({ status: status as any, ...extra, updatedAt: new Date() }).where(eq(autopilotQueue.id, id)),
      "autopilot.updateStatus",
    );
  }

  async incrementAttempts(id: number): Promise<void> {
    await withRetry(
      () => db.update(autopilotQueue)
        .set({ attempts: sql`${autopilotQueue.attempts} + 1`, updatedAt: new Date() })
        .where(eq(autopilotQueue.id, id)),
      "autopilot.incrementAttempts",
    );
  }

  async listQueue(userId: string): Promise<AutopilotQueueItem[]> {
    return withRetry(
      () => db.select().from(autopilotQueue).where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "pending"))).orderBy(autopilotQueue.scheduledAt),
      "autopilot.listQueue",
    );
  }

  async listHistory(userId: string, limit = 50): Promise<AutopilotQueueItem[]> {
    return withRetry(
      () => db.select().from(autopilotQueue).where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published"))).orderBy(desc(autopilotQueue.publishedAt)).limit(limit),
      "autopilot.listHistory",
    );
  }

  async findById(id: number): Promise<AutopilotQueueItem | null> {
    return withRetry(async () => {
      const rows = await db.select().from(autopilotQueue).where(eq(autopilotQueue.id, id)).limit(1);
      return rows[0] ?? null;
    }, "autopilot.findById");
  }

  async cancelItem(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.update(autopilotQueue).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(autopilotQueue.id, id), eq(autopilotQueue.userId, userId))),
      "autopilot.cancel",
    );
  }

  async getConfig(userId: string): Promise<AutopilotConfig | null> {
    return withRetry(async () => {
      const rows = await db.select().from(autopilotConfig).where(eq(autopilotConfig.userId, userId)).limit(1);
      return rows[0] ?? null;
    }, "autopilot.getConfig");
  }

  async upsertConfig(userId: string, data: Partial<AutopilotConfig>): Promise<AutopilotConfig> {
    return withRetry(async () => {
      const rows = await db
        .insert(autopilotConfig)
        .values({ userId, ...data } as any)
        .onConflictDoUpdate({ target: autopilotConfig.userId, set: { ...data, updatedAt: new Date() } })
        .returning();
      return rows[0];
    }, "autopilot.upsertConfig");
  }
}

export const autopilotRepo = new AutopilotRepository();
