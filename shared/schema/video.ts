import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const DOWNLOAD_STATUS = ["pending", "downloading", "complete", "failed"] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUS)[number];

export const videoDownloads = pgTable("video_downloads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  youtubeId: varchar("youtube_id"),
  title: varchar("title"),
  filePath: text("file_path"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  durationSeconds: integer("duration_seconds"),
  quality: varchar("quality").default("best"),
  status: varchar("status").$type<DownloadStatus>().notNull().default("pending"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("downloads_user_idx").on(t.userId),
  index("downloads_status_idx").on(t.status),
]);

export const vaultItems = pgTable("vault_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  downloadId: integer("download_id"),
  fileName: varchar("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  mimeType: varchar("mime_type"),
  tags: text("tags").array().default([]),
  notes: text("notes"),
  transferredAt: timestamp("transferred_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("vault_user_idx").on(t.userId),
]);

export const insertDownloadSchema = createInsertSchema(videoDownloads).omit({ id: true, createdAt: true });
export const insertVaultItemSchema = createInsertSchema(vaultItems).omit({ id: true, createdAt: true });

export type VideoDownload = typeof videoDownloads.$inferSelect;
export type VaultItem = typeof vaultItems.$inferSelect;
export type InsertDownload = z.infer<typeof insertDownloadSchema>;
