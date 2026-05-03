import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const STREAM_STATUS = ["idle", "live", "ended"] as const;
export type StreamStatus = (typeof STREAM_STATUS)[number];

export const streams = pgTable("streams", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title"),
  platform: varchar("platform").notNull(),
  status: varchar("status").$type<StreamStatus>().notNull().default("idle"),
  viewerPeak: integer("viewer_peak").default(0),
  chatCount: integer("chat_count").default(0),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("streams_user_idx").on(t.userId),
  index("streams_status_idx").on(t.status),
]);

export const streamDestinations = pgTable("stream_destinations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  channelId: integer("channel_id"),
  platform: varchar("platform").notNull(),
  rtmpUrl: text("rtmp_url"),
  streamKey: text("stream_key"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("stream_dest_user_idx").on(t.userId),
]);

export const streamChatMessages = pgTable("stream_chat_messages", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").notNull(),
  username: varchar("username").notNull(),
  message: text("message").notNull(),
  platform: varchar("platform").notNull(),
  sentiment: varchar("sentiment"),
  isHighlighted: boolean("is_highlighted").default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  timestamp: timestamp("timestamp").defaultNow(),
}, (t) => [
  index("chat_stream_idx").on(t.streamId),
  index("chat_ts_idx").on(t.timestamp),
]);

export const chatTopics = pgTable("chat_topics", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").notNull(),
  topic: varchar("topic").notNull(),
  frequency: integer("frequency").default(1),
  sentiment: varchar("sentiment"),
  startedAt: timestamp("started_at").defaultNow(),
});

export const insertStreamSchema = createInsertSchema(streams).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(streamChatMessages).omit({ id: true });
export type Stream = typeof streams.$inferSelect;
export type StreamChatMessage = typeof streamChatMessages.$inferSelect;
export type InsertStream = z.infer<typeof insertStreamSchema>;
