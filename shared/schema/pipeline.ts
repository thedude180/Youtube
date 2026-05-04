import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PIPELINE_STATUS = ["queued", "downloading", "analyzing", "clipping", "publishing", "done", "failed"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUS)[number];

export const CLIP_STATUS = ["pending", "ready", "published", "skipped"] as const;
export type ClipStatus = (typeof CLIP_STATUS)[number];

/** One full stream → content pipeline run. Created when a stream ends. */
export const pipelineRuns = pgTable("v2_pipeline_runs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  streamId: integer("stream_id"),
  vodDownloadId: integer("vod_download_id"),
  status: varchar("status").$type<PipelineStatus>().notNull().default("queued"),
  platform: varchar("platform").notNull().default("youtube"),
  vodUrl: text("vod_url"),
  streamTitle: varchar("stream_title"),
  streamGame: varchar("stream_game"),
  durationSeconds: integer("duration_seconds"),
  clipCount: integer("clip_count").default(0),
  publishedCount: integer("published_count").default(0),
  errorMessage: text("error_message"),
  aiInsights: jsonb("ai_insights").$type<Record<string, unknown>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_pipeline_user_idx").on(t.userId),
  index("v2_pipeline_status_idx").on(t.status),
  index("v2_pipeline_stream_idx").on(t.streamId),
]);

/** An AI-identified highlight clip from a stream. */
export const pipelineClips = pgTable("v2_pipeline_clips", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  userId: varchar("user_id").notNull(),
  startSeconds: integer("start_seconds").notNull(),
  endSeconds: integer("end_seconds").notNull(),
  title: varchar("title"),
  description: text("description"),
  tags: text("tags").array().default([]),
  thumbnailConcept: text("thumbnail_concept"),
  platform: varchar("platform").notNull().default("youtube"),
  status: varchar("status").$type<ClipStatus>().notNull().default("pending"),
  aiScore: real("ai_score"),
  publishedUrl: text("published_url"),
  publishedAt: timestamp("published_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_clips_run_idx").on(t.runId),
  index("v2_clips_user_idx").on(t.userId),
  index("v2_clips_status_idx").on(t.status),
]);

/** Cross-platform promotion posts generated from clips. */
export const pipelinePromotions = pgTable("v2_pipeline_promotions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  clipId: integer("clip_id"),
  userId: varchar("user_id").notNull(),
  platform: varchar("platform").notNull(),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  autopilotQueueId: integer("autopilot_queue_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_promos_run_idx").on(t.runId),
  index("v2_promos_user_idx").on(t.userId),
]);

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns)
  .omit({ id: true, createdAt: true })
  .extend({ status: z.enum(PIPELINE_STATUS).optional() });

export const insertPipelineClipSchema = createInsertSchema(pipelineClips)
  .omit({ id: true, createdAt: true })
  .extend({ status: z.enum(CLIP_STATUS).optional() });

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type PipelineClip = typeof pipelineClips.$inferSelect;
export type PipelinePromotion = typeof pipelinePromotions.$inferSelect;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type InsertPipelineClip = z.infer<typeof insertPipelineClipSchema>;
