import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const QUEUE_STATUS = ["pending", "processing", "published", "failed", "cancelled"] as const;
export type QueueStatus = (typeof QUEUE_STATUS)[number];

export const autopilotQueue = pgTable("autopilot_queue", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoId: integer("video_id"),
  platform: varchar("platform").notNull(),
  contentType: varchar("content_type").notNull().default("post"), // post | short | story
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: varchar("status").$type<QueueStatus>().notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  platformPostId: varchar("platform_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("aq_user_idx").on(t.userId),
  index("aq_status_idx").on(t.status),
  index("aq_scheduled_idx").on(t.scheduledAt),
]);

export const autopilotConfig = pgTable("autopilot_config", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  enabled: boolean("enabled").default(false),
  platforms: text("platforms").array().default([]),
  postingSchedule: jsonb("posting_schedule").$type<Record<string, string[]>>().default({}),
  contentRules: jsonb("content_rules").$type<Record<string, unknown>>().default({}),
  maxDailyPosts: integer("max_daily_posts").default(3),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const publishBacklog = pgTable("publish_backlog", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoId: integer("video_id").notNull(),
  platform: varchar("platform").notNull(),
  updateType: varchar("update_type").notNull(), // title | description | tags | thumbnail
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("backlog_user_idx").on(t.userId),
]);

export const insertQueueItemSchema = createInsertSchema(autopilotQueue).omit({ id: true, createdAt: true, updatedAt: true });
export type AutopilotQueueItem = typeof autopilotQueue.$inferSelect;
export type AutopilotConfig = typeof autopilotConfig.$inferSelect;
export type InsertQueueItem = z.infer<typeof insertQueueItemSchema>;
