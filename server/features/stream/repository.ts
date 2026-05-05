import { eq, and, desc } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { streams, streamDestinations, streamChatMessages, chatTopics, type Stream, type InsertStream, type StreamChatMessage } from "../../../shared/schema/index.js";

export class StreamRepository {
  async createStream(data: InsertStream): Promise<Stream> {
    return withRetry(async () => {
      const rows = await db.insert(streams).values(data).returning();
      return rows[0];
    }, "stream.create");
  }

  async updateStream(id: number, data: Partial<InsertStream>): Promise<Stream> {
    return withRetry(async () => {
      const rows = await db.update(streams).set(data).where(eq(streams.id, id)).returning();
      return rows[0];
    }, "stream.update");
  }

  async findActiveStream(userId: string): Promise<Stream | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(streams)
        .where(and(eq(streams.userId, userId), eq(streams.status, "live")))
        .limit(1);
      return rows[0] ?? null;
    }, "stream.findActive");
  }

  async listStreams(userId: string, lim = 20): Promise<Stream[]> {
    return withRetry(
      () => db.select().from(streams).where(eq(streams.userId, userId)).orderBy(desc(streams.createdAt)).limit(lim),
      "stream.list",
    );
  }

  async addChatMessage(data: Omit<StreamChatMessage, "id">): Promise<StreamChatMessage> {
    return withRetry(async () => {
      const rows = await db.insert(streamChatMessages).values(data as any).returning();
      return rows[0];
    }, "stream.addChat");
  }

  async listChatMessages(streamId: number, lim = 100): Promise<StreamChatMessage[]> {
    return withRetry(
      () => db.select().from(streamChatMessages).where(eq(streamChatMessages.streamId, streamId)).orderBy(desc(streamChatMessages.timestamp)).limit(lim),
      "stream.listChat",
    );
  }

  async listDestinations(userId: string): Promise<typeof streamDestinations.$inferSelect[]> {
    return withRetry(
      () => db.select().from(streamDestinations).where(eq(streamDestinations.userId, userId)),
      "stream.listDestinations",
    );
  }
}

export const streamRepo = new StreamRepository();
