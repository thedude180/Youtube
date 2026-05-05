import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const CONTENT_STATUS = ["draft", "ready", "scheduled", "published", "failed", "archived"] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const videos = pgTable("v2_videos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  youtubeId: varchar("youtube_id"),
  title: varchar("title").notNull(),
  description: text("description"),
  tags: text("tags").array().default([]),
  thumbnailUrl: varchar("thumbnail_url"),
  status: varchar("status").$type<ContentStatus>().notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  scheduledAt: timestamp("scheduled_at"),
  durationSeconds: integer("duration_seconds"),
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  commentCount: integer("comment_count").default(0),
  retentionRate: real("retention_rate"),
  ctr: real("ctr"),
  game: varchar("game"),
  aiMetadata: jsonb("ai_metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("v2_videos_user_idx").on(t.userId),
  index("v2_videos_status_idx").on(t.status),
  index("v2_videos_youtube_id_idx").on(t.youtubeId),
]);

export const contentDrafts = pgTable("v2_content_drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoId: integer("video_id"),
  type: varchar("type").notNull(),
  content: text("content").notNull(),
  model: varchar("model"),
  promptHash: varchar("prompt_hash"),
  approved: boolean("approved").default(false),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_drafts_user_idx").on(t.userId),
  index("v2_drafts_video_idx").on(t.videoId),
]);

export const contentIdeas = pgTable("v2_content_ideas", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title").notNull(),
  concept: text("concept"),
  game: varchar("game"),
  estimatedViews: integer("estimated_views"),
  priority: integer("priority").default(0),
  status: varchar("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_ideas_user_idx").on(t.userId),
]);

export const insertVideoSchema = createInsertSchema(videos)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ status: z.enum(CONTENT_STATUS).optional() });
export const insertDraftSchema = createInsertSchema(contentDrafts).omit({ id: true, createdAt: true });
export const insertIdeaSchema = createInsertSchema(contentIdeas).omit({ id: true, createdAt: true });

export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type ContentIdea = typeof contentIdeas.$inferSelect;
