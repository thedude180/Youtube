
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CHANNELS (YouTube Accounts) ===
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // 'youtube', 'tiktok', 'instagram'
  channelName: text("channel_name").notNull(),
  channelId: text("channel_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  settings: jsonb("settings").$type<{
    preset: "safe" | "normal" | "aggressive";
    autoUpload: boolean;
    minShortsPerDay: number;
  }>().default({ preset: "normal", autoUpload: false, minShortsPerDay: 1 }),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === VIDEOS (VODs & Shorts) ===
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  title: text("title").notNull(),
  originalFilename: text("original_filename"),
  filePath: text("file_path"), // Local path or storage URL
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  type: text("type").notNull(), // 'vod', 'short', 'live_replay'
  status: text("status").notNull().default("ingested"), // ingested, processing, ready, scheduled, uploaded, failed
  metadata: jsonb("metadata").$type<{
    tags: string[];
    aiSuggestions?: {
      titleHooks: string[];
      thumbnailCritique: string;
    };
    stats?: {
      views: number;
      likes: number;
    }
  }>(),
  scheduledTime: timestamp("scheduled_time"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === JOBS (Background Tasks) ===
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'ingest', 'transcribe', 'clip', 'upload', 'metadata_opt'
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  priority: integer("priority").default(0),
  payload: jsonb("payload").notNull(), // Arguments for the job
  result: jsonb("result"), // Output of the job
  errorMessage: text("error_message"),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true, createdAt: true, lastSyncAt: true });
export const insertVideoSchema = createInsertSchema(videos).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true, result: true, errorMessage: true, progress: true });

// === TYPES ===
export type User = typeof users.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Job = typeof jobs.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertJob = z.infer<typeof insertJobSchema>;

// Request/Response Types
export type CreateChannelRequest = InsertChannel;
export type UpdateChannelRequest = Partial<InsertChannel>;
export type CreateVideoRequest = InsertVideo;
export type UpdateVideoRequest = Partial<InsertVideo>;
export type CreateJobRequest = InsertJob;

export type StatsResponse = {
  totalVideos: number;
  activeJobs: number;
  uploadedToday: number;
  nextScheduled: string | null;
  riskScore: number; // 0-100
};
