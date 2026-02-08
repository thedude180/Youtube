
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export { sessions, users } from "./models/auth";
export type { User, UpsertUser } from "./models/auth";
export { conversations, messages } from "./models/chat";

export const PLATFORMS = [
  "youtube",
  "twitch",
  "kick",
  "facebook",
  "tiktok",
  "x",
  "rumble",
  "linkedin",
  "instagram",
] as const;
export type Platform = typeof PLATFORMS[number];

export const PLATFORM_INFO: Record<Platform, { label: string; color: string; maxResolution: string; maxBitrate: string; rtmpUrlTemplate: string }> = {
  youtube: { label: "YouTube", color: "#FF0000", maxResolution: "4K (2160p)", maxBitrate: "51 Mbps", rtmpUrlTemplate: "rtmp://a.rtmp.youtube.com/live2" },
  twitch: { label: "Twitch", color: "#9146FF", maxResolution: "1080p60", maxBitrate: "6 Mbps", rtmpUrlTemplate: "rtmp://live.twitch.tv/app" },
  kick: { label: "Kick", color: "#53FC18", maxResolution: "1080p60", maxBitrate: "8 Mbps", rtmpUrlTemplate: "rtmp://fa723fc1b171.global-contribute.live-video.net/app" },
  facebook: { label: "Facebook Gaming", color: "#1877F2", maxResolution: "1080p30", maxBitrate: "4 Mbps", rtmpUrlTemplate: "rtmps://live-api-s.facebook.com:443/rtmp" },
  tiktok: { label: "TikTok Live", color: "#000000", maxResolution: "1080p30", maxBitrate: "6 Mbps", rtmpUrlTemplate: "rtmp://push.tiktok.com/live" },
  x: { label: "X (Twitter)", color: "#000000", maxResolution: "1280x720", maxBitrate: "9 Mbps", rtmpUrlTemplate: "rtmp://va.pscp.tv:80/x" },
  rumble: { label: "Rumble", color: "#85C742", maxResolution: "4K (2160p)", maxBitrate: "12 Mbps", rtmpUrlTemplate: "rtmp://live.rumble.com/live" },
  linkedin: { label: "LinkedIn Live", color: "#0A66C2", maxResolution: "1080p30", maxBitrate: "6 Mbps", rtmpUrlTemplate: "rtmp://live.linkedin.com/live" },
  instagram: { label: "Instagram Live", color: "#E4405F", maxResolution: "1080p30", maxBitrate: "3.5 Mbps", rtmpUrlTemplate: "rtmps://live-upload.instagram.com:443/rtmp" },
};

export const AI_AGENTS = [
  { id: "editor", name: "AI Editor", role: "Cuts highlights, creates shorts, optimizes VODs", icon: "Film" },
  { id: "social_manager", name: "Social Manager", role: "Cross-posts, schedules content, manages community posts", icon: "Share2" },
  { id: "seo_director", name: "SEO Director", role: "Optimizes titles, descriptions, tags for all platforms", icon: "Search" },
  { id: "analytics_director", name: "Analytics Director", role: "Tracks performance, identifies trends, reports insights", icon: "BarChart3" },
  { id: "brand_strategist", name: "Brand Strategist", role: "Maintains voice consistency, brand guidelines, sponsorship fit", icon: "Palette" },
  { id: "ad_buyer", name: "Ad Buyer", role: "Manages ad spend, targets audiences, optimizes ROAS", icon: "DollarSign" },
  { id: "legal_advisor", name: "Legal Advisor", role: "Copyright checks, compliance monitoring, DMCA protection", icon: "Scale" },
  { id: "community_manager", name: "Community Manager", role: "Moderates comments, engages fans, handles DMs", icon: "Users" },
  { id: "business_manager", name: "Business Manager", role: "Revenue tracking, invoicing, sponsorship negotiations", icon: "Briefcase" },
  { id: "growth_strategist", name: "Growth Strategist", role: "A/B testing, collaboration outreach, viral content planning", icon: "TrendingUp" },
] as const;

export type AgentId = typeof AI_AGENTS[number]["id"];

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
    aiOptimized?: boolean;
    aiOptimizedAt?: string;
    chainCompleted?: boolean;
    chainCompletedAt?: string;
    optimizationScore?: number;
    autoScheduled?: boolean;
    autoScheduledAt?: string;
  }>(),
  scheduledTime: timestamp("scheduled_time"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const streamDestinations = pgTable("stream_destinations", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  rtmpUrl: text("rtmp_url").notNull(),
  streamKey: text("stream_key"),
  enabled: boolean("enabled").default(true),
  settings: jsonb("settings").$type<{
    resolution: string;
    bitrate: string;
    fps: number;
    autoStart: boolean;
  }>().default({ resolution: "1080p", bitrate: "6000", fps: 60, autoStart: true }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const streams = pgTable("streams", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  status: text("status").notNull().default("planned"),
  thumbnailUrl: text("thumbnail_url"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  seoData: jsonb("seo_data").$type<{
    tags: string[];
    optimizedTitle?: string;
    optimizedDescription?: string;
    thumbnailPrompt?: string;
    platformSpecific?: Record<string, { title: string; description: string; tags: string[] }>;
  }>(),
  streamStats: jsonb("stream_stats").$type<{
    peakViewers?: number;
    avgViewers?: number;
    totalViews?: number;
    chatMessages?: number;
    newFollowers?: number;
  }>(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const thumbnails = pgTable("thumbnails", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id),
  streamId: integer("stream_id").references(() => streams.id),
  imageUrl: text("image_url"),
  prompt: text("prompt"),
  platform: text("platform"),
  resolution: text("resolution"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

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

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details"),
  riskLevel: text("risk_level").default("low"),
  createdAt: timestamp("created_at").defaultNow(),
});

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

export const aiAgentActivities = pgTable("ai_agent_activities", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  agentId: text("agent_id").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  status: text("status").notNull().default("completed"),
  details: jsonb("details").$type<{
    description: string;
    impact?: string;
    metrics?: Record<string, number>;
    recommendations?: string[];
    humanized?: boolean;
    delayMs?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const automationRules = pgTable("automation_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  agentId: text("agent_id").notNull(),
  actions: jsonb("actions").$type<{
    type: string;
    config: Record<string, any>;
  }[]>().default([]),
  enabled: boolean("enabled").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  triggerCount: integer("trigger_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduleItems = pgTable("schedule_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  type: text("type").notNull(),
  platform: text("platform"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  videoId: integer("video_id").references(() => videos.id),
  streamId: integer("stream_id").references(() => streams.id),
  metadata: jsonb("metadata").$type<{
    description?: string;
    tags?: string[];
    autoPublish?: boolean;
    crossPost?: string[];
    aiOptimized?: boolean;
  }>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const revenueRecords = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  source: text("source").notNull(),
  amount: real("amount").notNull().default(0),
  currency: text("currency").default("USD"),
  period: text("period"),
  metadata: jsonb("metadata").$type<{
    videoId?: number;
    streamId?: number;
    sponsorName?: string;
    adType?: string;
    impressions?: number;
    cpm?: number;
    details?: string;
  }>(),
  recordedAt: timestamp("recorded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityPosts = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  engagement: jsonb("engagement").$type<{
    likes?: number;
    comments?: number;
    shares?: number;
    reach?: number;
  }>(),
  aiGenerated: boolean("ai_generated").default(false),
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
export const insertStreamDestinationSchema = createInsertSchema(streamDestinations).omit({ id: true, createdAt: true });
export const insertStreamSchema = createInsertSchema(streams).omit({ id: true, createdAt: true });
export const insertThumbnailSchema = createInsertSchema(thumbnails).omit({ id: true, createdAt: true });
export const insertAgentActivitySchema = createInsertSchema(aiAgentActivities).omit({ id: true, createdAt: true });
export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({ id: true, createdAt: true, lastTriggeredAt: true, triggerCount: true });
export const insertScheduleItemSchema = createInsertSchema(scheduleItems).omit({ id: true, createdAt: true, completedAt: true });
export const insertRevenueRecordSchema = createInsertSchema(revenueRecords).omit({ id: true, createdAt: true });
export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({ id: true, createdAt: true });

// === TYPES ===
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ContentInsight = typeof contentInsights.$inferSelect;
export type ComplianceRecord = typeof complianceRecords.$inferSelect;
export type GrowthStrategy = typeof growthStrategies.$inferSelect;
export type StreamDestination = typeof streamDestinations.$inferSelect;
export type Stream = typeof streams.$inferSelect;
export type Thumbnail = typeof thumbnails.$inferSelect;
export type AgentActivity = typeof aiAgentActivities.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
export type ScheduleItem = typeof scheduleItems.$inferSelect;
export type RevenueRecord = typeof revenueRecords.$inferSelect;
export type CommunityPost = typeof communityPosts.$inferSelect;

export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertContentInsight = z.infer<typeof insertContentInsightSchema>;
export type InsertComplianceRecord = z.infer<typeof insertComplianceRecordSchema>;
export type InsertGrowthStrategy = z.infer<typeof insertGrowthStrategySchema>;
export type InsertStreamDestination = z.infer<typeof insertStreamDestinationSchema>;
export type InsertStream = z.infer<typeof insertStreamSchema>;
export type InsertThumbnail = z.infer<typeof insertThumbnailSchema>;
export type InsertAgentActivity = z.infer<typeof insertAgentActivitySchema>;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type InsertScheduleItem = z.infer<typeof insertScheduleItemSchema>;
export type InsertRevenueRecord = z.infer<typeof insertRevenueRecordSchema>;
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;

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
  totalRevenue: number;
  activeAgents: number;
  scheduledItems: number;
};
