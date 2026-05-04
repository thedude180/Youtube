import { eq, and, desc, sql } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import {
  videos, contentDrafts, contentIdeas,
  type Video, type InsertVideo, type ContentDraft, type ContentIdea,
} from "../../../shared/schema/index.js";

export class ContentRepository {
  // Videos
  async createVideo(data: InsertVideo): Promise<Video> {
    return withRetry(async () => {
      const rows = await db.insert(videos).values(data).returning();
      return rows[0];
    }, "content.createVideo");
  }

  async updateVideo(id: number, userId: string, data: Partial<InsertVideo>): Promise<Video> {
    return withRetry(async () => {
      const rows = await db
        .update(videos)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(videos.id, id), eq(videos.userId, userId)))
        .returning();
      return rows[0];
    }, "content.updateVideo");
  }

  async findVideo(id: number, userId: string): Promise<Video | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(videos)
        .where(and(eq(videos.id, id), eq(videos.userId, userId)))
        .limit(1);
      return rows[0] ?? null;
    }, "content.findVideo");
  }

  async listVideos(
    userId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: Video[]; total: number }> {
    return withRetry(async () => {
      const where = opts?.status
        ? and(eq(videos.userId, userId), eq(videos.status, opts.status as any))
        : eq(videos.userId, userId);
      const [items, countResult] = await Promise.all([
        db.select().from(videos).where(where)
          .orderBy(desc(videos.createdAt))
          .limit(opts?.limit ?? 20)
          .offset(opts?.offset ?? 0),
        db.select({ count: sql<number>`count(*)` }).from(videos).where(where),
      ]);
      return { items, total: countResult[0]?.count ?? 0 };
    }, "content.listVideos");
  }

  async deleteVideo(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, userId))),
      "content.deleteVideo",
    );
  }

  // Drafts
  async saveDraft(data: { userId: string; videoId?: number; type: string; content: string; model?: string }): Promise<ContentDraft> {
    return withRetry(async () => {
      const rows = await db.insert(contentDrafts).values(data).returning();
      return rows[0];
    }, "content.saveDraft");
  }

  async listDrafts(videoId: number, userId: string): Promise<ContentDraft[]> {
    return withRetry(
      () => db.select().from(contentDrafts).where(and(eq(contentDrafts.videoId, videoId), eq(contentDrafts.userId, userId))).orderBy(desc(contentDrafts.createdAt)),
      "content.listDrafts",
    );
  }

  // Ideas
  async createIdea(data: Omit<ContentIdea, "id" | "createdAt">): Promise<ContentIdea> {
    return withRetry(async () => {
      const rows = await db.insert(contentIdeas).values(data as any).returning();
      return rows[0];
    }, "content.createIdea");
  }

  async listIdeas(userId: string): Promise<ContentIdea[]> {
    return withRetry(
      () => db.select().from(contentIdeas).where(eq(contentIdeas.userId, userId)).orderBy(desc(contentIdeas.priority), desc(contentIdeas.createdAt)),
      "content.listIdeas",
    );
  }
}

export const contentRepo = new ContentRepository();
