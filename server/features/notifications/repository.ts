import { eq, and, gt, desc } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { notifications, notificationDedupeLog, notificationPreferences, type Notification, type InsertNotification } from "../../../shared/schema/index.js";

export class NotificationsRepository {
  async create(data: InsertNotification): Promise<Notification> {
    return withRetry(async () => {
      const rows = await db.insert(notifications).values(data).returning();
      return rows[0];
    }, "notif.create");
  }

  async list(userId: string, limit = 50): Promise<Notification[]> {
    return withRetry(
      () => db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit),
      "notif.list",
    );
  }

  async markRead(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId))),
      "notif.markRead",
    );
  }

  async delete(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId))),
      "notif.delete",
    );
  }

  async checkDedupe(userId: string, dedupeKey: string): Promise<boolean> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(notificationDedupeLog)
        .where(and(
          eq(notificationDedupeLog.userId, userId),
          eq(notificationDedupeLog.dedupeKey, dedupeKey),
          gt(notificationDedupeLog.expiresAt, new Date()),
        ))
        .limit(1);
      return rows.length > 0;
    }, "notif.checkDedupe");
  }

  async recordSend(userId: string, dedupeKey: string, ttlHours = 4): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1_000);
    await withRetry(
      () => db
        .insert(notificationDedupeLog)
        .values({ userId, dedupeKey, lastSentAt: new Date(), expiresAt })
        .onConflictDoUpdate({ target: [notificationDedupeLog.userId, notificationDedupeLog.dedupeKey], set: { lastSentAt: new Date(), expiresAt, sendCount: db.$count(notificationDedupeLog) as any } }),
      "notif.recordSend",
    );
  }

  async getPreferences(userId: string): Promise<typeof notificationPreferences.$inferSelect | null> {
    return withRetry(async () => {
      const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
      return rows[0] ?? null;
    }, "notif.getPrefs");
  }

  async upsertPreferences(userId: string, data: Partial<typeof notificationPreferences.$inferSelect>): Promise<void> {
    await withRetry(
      () => db.insert(notificationPreferences).values({ userId, ...data } as any).onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...data, updatedAt: new Date() } }),
      "notif.upsertPrefs",
    );
  }
}

export const notifRepo = new NotificationsRepository();
