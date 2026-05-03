import { eq, and } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { channels, type Channel, type InsertChannel, type Platform } from "../../../shared/schema/index.js";

export class ChannelRepository {
  async findByUserId(userId: string): Promise<Channel[]> {
    return withRetry(() =>
      db.select().from(channels).where(eq(channels.userId, userId)),
      "channels.findByUserId",
    );
  }

  async findById(id: number): Promise<Channel | null> {
    return withRetry(async () => {
      const rows = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
      return rows[0] ?? null;
    }, "channels.findById");
  }

  async findByUserAndPlatform(userId: string, platform: Platform): Promise<Channel | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, platform)))
        .limit(1);
      return rows[0] ?? null;
    }, "channels.findByUserAndPlatform");
  }

  async upsert(data: InsertChannel): Promise<Channel> {
    return withRetry(async () => {
      const rows = await db
        .insert(channels)
        .values(data)
        .onConflictDoUpdate({
          target: [channels.userId, channels.platform],
          set: { ...data, updatedAt: new Date() },
        })
        .returning();
      return rows[0];
    }, "channels.upsert");
  }

  async update(id: number, data: Partial<InsertChannel>): Promise<Channel> {
    return withRetry(async () => {
      const rows = await db
        .update(channels)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(channels.id, id))
        .returning();
      return rows[0];
    }, "channels.update");
  }

  async delete(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.delete(channels).where(and(eq(channels.id, id), eq(channels.userId, userId))),
      "channels.delete",
    );
  }

  async updateTokens(
    id: number,
    accessToken: string,
    refreshToken: string | null,
    expiresAt: Date | null,
  ): Promise<void> {
    await withRetry(
      () =>
        db
          .update(channels)
          .set({ accessToken, refreshToken, tokenExpiresAt: expiresAt, updatedAt: new Date() })
          .where(eq(channels.id, id)),
      "channels.updateTokens",
    );
  }
}

export const channelRepo = new ChannelRepository();
