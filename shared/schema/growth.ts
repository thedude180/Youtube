import { pgTable, serial, varchar, text, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  subscriberCount: integer("subscriber_count").default(0),
  totalViews: integer("total_views").default(0),
  watchHoursTotal: real("watch_hours_total").default(0),
  avgViewDuration: real("avg_view_duration"),
  avgCtr: real("avg_ctr"),
  newSubscribers: integer("new_subscribers").default(0),
  impressions: integer("impressions").default(0),
  platform: varchar("platform").notNull().default("youtube"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("analytics_user_idx").on(t.userId),
  index("analytics_date_idx").on(t.snapshotDate),
]);

export const competitorChannels = pgTable("competitor_channels", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  platform: varchar("platform").notNull().default("youtube"),
  channelId: varchar("channel_id").notNull(),
  channelName: varchar("channel_name").notNull(),
  subscriberCount: integer("subscriber_count"),
  viewCount: integer("view_count"),
  videoCount: integer("video_count"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  insights: jsonb("insights").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("competitors_user_idx").on(t.userId),
]);

export const trendSignals = pgTable("trend_signals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  signal: varchar("signal").notNull(),
  category: varchar("category"),
  score: real("score").default(0),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("trends_user_idx").on(t.userId),
  index("trends_score_idx").on(t.score),
]);

export const insertSnapshotSchema = createInsertSchema(analyticsSnapshots).omit({ id: true, createdAt: true });
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type TrendSignal = typeof trendSignals.$inferSelect;
