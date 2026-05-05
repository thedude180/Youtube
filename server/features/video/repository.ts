import { eq, and, desc } from "drizzle-orm";
import { db, withRetry } from "../../core/db.js";
import { videoDownloads, vaultItems, type VideoDownload, type VaultItem, type InsertDownload } from "../../../shared/schema/index.js";

export class VideoRepository {
  async createDownload(data: InsertDownload): Promise<VideoDownload> {
    return withRetry(async () => {
      const rows = await db.insert(videoDownloads).values(data).returning();
      return rows[0];
    }, "video.createDownload");
  }

  async updateDownload(id: number, data: Partial<InsertDownload>): Promise<VideoDownload> {
    return withRetry(async () => {
      const rows = await db.update(videoDownloads).set(data).where(eq(videoDownloads.id, id)).returning();
      return rows[0];
    }, "video.updateDownload");
  }

  async findDownload(id: number): Promise<VideoDownload | null> {
    return withRetry(async () => {
      const rows = await db.select().from(videoDownloads).where(eq(videoDownloads.id, id)).limit(1);
      return rows[0] ?? null;
    }, "video.findDownload");
  }

  async listDownloads(userId: string): Promise<VideoDownload[]> {
    return withRetry(
      () => db.select().from(videoDownloads).where(eq(videoDownloads.userId, userId)).orderBy(desc(videoDownloads.createdAt)).limit(50),
      "video.listDownloads",
    );
  }

  async createVaultItem(data: { userId: string; downloadId?: number; fileName: string; filePath: string; fileSizeBytes?: number; mimeType?: string }): Promise<VaultItem> {
    return withRetry(async () => {
      const rows = await db.insert(vaultItems).values(data as any).returning();
      return rows[0];
    }, "video.createVaultItem");
  }

  async listVault(userId: string): Promise<VaultItem[]> {
    return withRetry(
      () => db.select().from(vaultItems).where(eq(vaultItems.userId, userId)).orderBy(desc(vaultItems.createdAt)),
      "video.listVault",
    );
  }

  async findVaultItem(id: number, userId: string): Promise<VaultItem | null> {
    return withRetry(async () => {
      const rows = await db
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
        .limit(1);
      return rows[0] ?? null;
    }, "video.findVaultItem");
  }

  async deleteVaultItem(id: number, userId: string): Promise<void> {
    await withRetry(
      () => db.delete(vaultItems).where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId))),
      "video.deleteVaultItem",
    );
  }
}

export const videoRepo = new VideoRepository();
