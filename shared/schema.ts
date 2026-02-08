
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export { sessions, users } from "./models/auth";
export type { User, UpsertUser } from "./models/auth";
export { conversations, messages } from "./models/chat";

// === CHANNELS (YouTube / Social Accounts) ===
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  channelName: text("channel_name").notNull(),
  channelId: text("channel_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  settings: jsonb("settings").$type<{
    preset: "safe" | "normal" | "aggressive";
    autoUpload: boolean;
    minShortsPerDay: number;
    maxEditsPerDay: number;
    cooldownMinutes: number;
  }>().default({ preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 }),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === VIDEOS (VODs & Shorts) ===
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  title: text("title").notNull(),
  originalFilename: text("original_filename"),
  filePath: text("file_path"),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  type: text("type").notNull(),
  status: text("status").notNull().default("ingested"),
  platform: text("platform").default("youtube"),
  metadata: jsonb("metadata").$type<{
    tags: string[];
    seoScore?: number;
    aiSuggestions?: {
      titleHooks: string[];
      descriptionTemplate: string;
      thumbnailCritique: string;
      seoRecommendations: string[];
      complianceNotes: string[];
    };
    stats?: {
      views: number;
      likes: number;
      comments: number;
      ctr: number;
      avgWatchTime: number;
    };
    crossPostIds?: Record<string, string>;
  }>(),
  scheduledTime: timestamp("scheduled_time"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === JOBS (Background Tasks) ===
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").default(0),
  payload: jsonb("payload").notNull(),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// === AUDIT LOG ===
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details"),
  riskLevel: text("risk_level").default("low"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CONTENT INSIGHTS (AI-learned patterns) ===
export const contentInsights = pgTable("content_insights", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  insightType: text("insight_type").notNull(),
  category: text("category"),
  data: jsonb("data").$type<{
    finding: string;
    confidence: number;
    recommendation: string;
    evidence: string[];
    metrics?: Record<string, number>;
  }>().notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === COMPLIANCE RECORDS ===
export const complianceRecords = pgTable("compliance_records", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  platform: text("platform").notNull(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull().default("pass"),
  details: jsonb("details").$type<{
    rule: string;
    description: string;
    severity: "info" | "warning" | "critical";
    recommendation: string;
  }>().notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === GROWTH STRATEGIES ===
export const growthStrategies = pgTable("growth_strategies", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").default("medium"),
  category: text("category").notNull(),
  actionItems: jsonb("action_items").$type<string[]>().default([]),
  estimatedImpact: text("estimated_impact"),
  status: text("status").default("pending"),
  aiGenerated: boolean("ai_generated").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true, createdAt: true, lastSyncAt: true });
export const insertVideoSchema = createInsertSchema(videos).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true, result: true, errorMessage: true, progress: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertContentInsightSchema = createInsertSchema(contentInsights).omit({ id: true, createdAt: true });
export const insertComplianceRecordSchema = createInsertSchema(complianceRecords).omit({ id: true, createdAt: true });
export const insertGrowthStrategySchema = createInsertSchema(growthStrategies).omit({ id: true, createdAt: true });

// === TYPES ===
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ContentInsight = typeof contentInsights.$inferSelect;
export type ComplianceRecord = typeof complianceRecords.$inferSelect;
export type GrowthStrategy = typeof growthStrategies.$inferSelect;

export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertContentInsight = z.infer<typeof insertContentInsightSchema>;
export type InsertComplianceRecord = z.infer<typeof insertComplianceRecordSchema>;
export type InsertGrowthStrategy = z.infer<typeof insertGrowthStrategySchema>;

export type UpdateChannelRequest = Partial<InsertChannel>;
export type UpdateVideoRequest = Partial<InsertVideo>;

export type StatsResponse = {
  totalVideos: number;
  activeJobs: number;
  uploadedToday: number;
  nextScheduled: string | null;
  riskScore: number;
  complianceScore: number;
  activeStrategies: number;
};
