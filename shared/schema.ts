
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export { sessions, users, SUBSCRIPTION_TIERS, USER_ROLES, TIER_PLATFORM_LIMITS, TIER_LABELS, ADMIN_EMAIL } from "./models/auth";
export type { User, UpsertUser, SubscriptionTier, UserRole } from "./models/auth";
export { conversations, messages } from "./models/chat";

export const PLATFORMS = [
  "youtube",
  "twitch",
  "kick",
  "tiktok",
  "x",
  "discord",
] as const;
export type Platform = typeof PLATFORMS[number];

export type ContentCapability = "video" | "short_video" | "text" | "image" | "live_stream";

export const PLATFORM_CAPABILITIES: Record<Platform, {
  supports: ContentCapability[];
  primaryType: "video" | "text";
  maxVideoLength: number | null;
  description: string;
}> = {
  youtube: {
    supports: ["video", "short_video", "live_stream", "text", "image"],
    primaryType: "video",
    maxVideoLength: null,
    description: "Full video uploads, Shorts, live streaming, community posts",
  },
  twitch: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "Live streaming only — no content posting, stream detection and monitoring",
  },
  kick: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "Live streaming only, no content posting API",
  },
  tiktok: {
    supports: ["short_video", "text", "image"],
    primaryType: "video",
    maxVideoLength: 600,
    description: "Short-form video clips (up to 10 min), optimized for vertical 9:16",
  },
  x: {
    supports: ["text", "image"],
    primaryType: "text",
    maxVideoLength: null,
    description: "Text posts, stream announcements, traffic driving, throwback content",
  },
  discord: {
    supports: ["text", "image"],
    primaryType: "text",
    maxVideoLength: null,
    description: "Community announcements, text posts via webhooks",
  },
};

export const VIDEO_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("video") || PLATFORM_CAPABILITIES[p].supports.includes("short_video"));
export const TEXT_ONLY_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].primaryType === "text" && !PLATFORM_CAPABILITIES[p].supports.includes("video") && !PLATFORM_CAPABILITIES[p].supports.includes("short_video"));
export const LIVE_STREAM_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("live_stream"));

export const PLATFORM_INFO: Record<Platform, {
  label: string;
  color: string;
  maxResolution: string;
  maxBitrate: string;
  rtmpUrlTemplate: string;
  category: "streaming" | "social" | "monetization" | "content" | "messaging";
  connectionType: "oauth" | "manual" | "api_key";
  signupUrl: string;
  strategyDescription: string;
  setupSteps: string[];
}> = {
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    maxResolution: "4K (2160p)",
    maxBitrate: "51 Mbps",
    rtmpUrlTemplate: "rtmp://a.rtmp.youtube.com/live2",
    category: "streaming",
    connectionType: "oauth",
    signupUrl: "https://www.youtube.com/create_channel",
    strategyDescription: "The world's largest video platform. Essential for long-form content, SEO-driven discovery, and ad revenue. Your home base for building a sustainable creator business.",
    setupSteps: ["Click 'Connect YouTube' to sign in with your Google account", "Grant CreatorOS permission to manage your videos", "Your channel will sync automatically"],
  },
  twitch: {
    label: "Twitch",
    color: "#9146FF",
    maxResolution: "1080p60",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://live.twitch.tv/app",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://www.twitch.tv/signup",
    strategyDescription: "Live streaming only — the go-to platform for live gaming content. Used exclusively for broadcasting, stream detection, and live audience engagement. No content posting or cross-platform distribution.",
    setupSteps: ["Go to your Twitch Dashboard", "Click Settings then Stream", "Copy your Primary Stream Key", "Paste it below"],
  },
  kick: {
    label: "Kick",
    color: "#53FC18",
    maxResolution: "1080p60",
    maxBitrate: "8 Mbps",
    rtmpUrlTemplate: "rtmp://fa723fc1b171.global-contribute.live-video.net/app",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://kick.com/signup",
    strategyDescription: "Fast-growing streaming platform with creator-friendly 95/5 revenue split. Great for diversifying your live streaming income while reaching new audiences.",
    setupSteps: ["Go to kick.com/dashboard/settings/stream", "Find your Stream Key under Stream Settings", "Copy the Stream Key", "Paste it below"],
  },
  tiktok: {
    label: "TikTok Live",
    color: "#000000",
    maxResolution: "1080p30",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://push.tiktok.com/live",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://www.tiktok.com/signup",
    strategyDescription: "The fastest way to go viral. Short-form content gets massive organic reach. TikTok Live lets you stream directly to Gen Z audiences. Requires 1000+ followers for Live access.",
    setupSteps: ["Open TikTok on your phone and go to your profile", "Tap the + button then Go LIVE", "Select 'Cast to PC/Console' for stream key", "Copy the Server URL and Stream Key", "Paste them below"],
  },
  x: {
    label: "X (Twitter)",
    color: "#000000",
    maxResolution: "N/A",
    maxBitrate: "N/A",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://x.com/i/flow/signup",
    strategyDescription: "Real-time conversation platform. X posts drive traffic to your videos and streams with live announcements, highlight clips, and throwback content that surfaces older videos for new audiences.",
    setupSteps: ["Connect your X account via Settings", "CreatorOS will auto-post stream announcements, clips, and traffic-driving posts", "Older content gets resurfaced automatically to keep your catalog active"],
  },
  discord: {
    label: "Discord",
    color: "#5865F2",
    maxResolution: "1080p60",
    maxBitrate: "8 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://discord.com/register",
    strategyDescription: "The #1 community platform for creators. Build a dedicated server for your fans with channels for announcements, discussions, and exclusive content. Superfans live here.",
    setupSteps: ["Create a Discord server for your community at discord.com", "Go to Server Settings then Widget", "Copy your Server ID", "Paste your server invite link below"],
  },
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
  { id: "tax_strategist", name: "Tax Strategist", role: "Deduction finder, quarterly estimates, entity structure, state compliance", icon: "Calculator" },
] as const;

export type AgentId = typeof AI_AGENTS[number]["id"];

// === EXISTING TABLES ===

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  channelName: text("channel_name").notNull(),
  channelId: text("channel_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  streamKey: text("stream_key"),
  rtmpUrl: text("rtmp_url"),
  platformData: jsonb("platform_data").$type<Record<string, any>>(),
  settings: jsonb("settings").$type<{
    preset: "safe" | "normal" | "aggressive";
    autoUpload: boolean;
    minShortsPerDay: number;
    maxEditsPerDay: number;
    cooldownMinutes: number;
  }>().default({ preset: "normal", autoUpload: false, minShortsPerDay: 1, maxEditsPerDay: 3, cooldownMinutes: 60 }),
  subscriberCount: integer("subscriber_count"),
  videoCount: integer("video_count"),
  viewCount: integer("view_count"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("channels_user_id_idx").on(table.userId),
}));

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
    gameName?: string;
    contentCategory?: string;
    brandKeywords?: string[];
    youtubeId?: string;
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    publishedAt?: string;
    duration?: string;
    privacyStatus?: string;
  }>(),
  scheduledTime: timestamp("scheduled_time"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("videos_channel_id_idx").on(table.channelId),
  videos_status_idx: index("videos_status_idx").on(table.status),
  videos_status_scheduled_idx: index("videos_status_scheduled_idx").on(table.status, table.scheduledTime),
}));

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
}, (table) => ({
  userIdIdx: index("stream_destinations_user_id_idx").on(table.userId),
}));

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
  detectedSource: text("detected_source"),
  isAutoDetected: boolean("is_auto_detected").default(false),
  vodVideoId: integer("vod_video_id"),
  contentMinutesExtracted: real("content_minutes_extracted").default(0),
  contentFullyExhausted: boolean("content_fully_exhausted").default(false),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("streams_user_id_idx").on(table.userId),
}));

export const thumbnails = pgTable("thumbnails", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id, { onDelete: "cascade" }),
  streamId: integer("stream_id").references(() => streams.id, { onDelete: "cascade" }),
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
}, (table) => ({
  userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
  auditLogs_userId_createdAt_idx: index("auditLogs_userId_createdAt_idx").on(table.userId, table.createdAt),
}));

export const contentInsights = pgTable("content_insights", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "cascade" }),
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
}, (table) => ({
  channelIdIdx: index("content_insights_channel_id_idx").on(table.channelId),
}));

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
}, (table) => ({
  channelIdIdx: index("compliance_records_channel_id_idx").on(table.channelId),
}));

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
}, (table) => ({
  channelIdIdx: index("growth_strategies_channel_id_idx").on(table.channelId),
}));

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
}, (table) => ({
  userIdIdx: index("ai_agent_activities_user_id_idx").on(table.userId),
}));

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
}, (table) => ({
  userIdIdx: index("automation_rules_user_id_idx").on(table.userId),
}));

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
}, (table) => ({
  userIdIdx: index("schedule_items_user_id_idx").on(table.userId),
  scheduleItems_userId_scheduledAt_idx: index("scheduleItems_userId_scheduledAt_idx").on(table.userId, table.scheduledAt),
}));

export const revenueRecords = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  source: text("source").notNull(),
  amount: real("amount").notNull().default(0),
  currency: text("currency").default("USD"),
  period: text("period"),
  syncSource: text("sync_source").default("manual"),
  externalId: text("external_id"),
  metadata: jsonb("metadata").$type<{
    videoId?: number;
    streamId?: number;
    sponsorName?: string;
    adType?: string;
    impressions?: number;
    cpm?: number;
    details?: string;
    taxCategory?: string;
    syncedAt?: string;
    estimatedRevenue?: number;
    views?: number;
    subscribers?: number;
  }>(),
  recordedAt: timestamp("recorded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("revenue_records_user_id_idx").on(table.userId),
  revenueRecords_userId_recordedAt_idx: index("revenueRecords_userId_recordedAt_idx").on(table.userId, table.recordedAt),
}));

export const revenueSyncLog = pgTable("revenue_sync_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("pending"),
  recordsSynced: integer("records_synced").default(0),
  totalAmount: real("total_amount").default(0),
  errorMessage: text("error_message"),
  syncedAt: timestamp("synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("revenue_sync_log_user_id_idx").on(table.userId),
}));

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
}, (table) => ({
  userIdIdx: index("community_posts_user_id_idx").on(table.userId),
}));

// === NEW TABLES ===

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("info"),
  read: boolean("read").default(false),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata").$type<{
    source?: string;
    agentId?: string;
    videoId?: number;
    streamId?: number;
    platformAffected?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
  notifications_userId_read_idx: index("notifications_userId_read_idx").on(table.userId, table.read),
}));

export const abTests = pgTable("ab_tests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  status: text("status").notNull().default("active"),
  variantA: jsonb("variant_a").$type<{
    title: string;
    description: string;
    tags: string[];
    thumbnailPrompt?: string;
  }>().notNull(),
  variantB: jsonb("variant_b").$type<{
    title: string;
    description: string;
    tags: string[];
    thumbnailPrompt?: string;
  }>().notNull(),
  activeVariant: text("active_variant").default("a"),
  winner: text("winner"),
  performanceA: jsonb("performance_a").$type<{
    views?: number;
    ctr?: number;
    avgWatchTime?: number;
    likes?: number;
  }>(),
  performanceB: jsonb("performance_b").$type<{
    views?: number;
    ctr?: number;
    avgWatchTime?: number;
    likes?: number;
  }>(),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("ab_tests_user_id_idx").on(table.userId),
}));

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  metrics: jsonb("metrics").$type<{
    totalViews: number;
    totalSubscribers: number;
    totalRevenue: number;
    videosPublished: number;
    avgOptimizationScore: number;
    agentTasksCompleted: number;
    platformBreakdown: Record<string, { views: number; subscribers: number; revenue: number }>;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("analytics_snapshots_user_id_idx").on(table.userId),
}));

export const channelGrowthTracking = pgTable("channel_growth_tracking", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  period: text("period").notNull().default("daily"),
  baselineViews: integer("baseline_views").default(0),
  baselineSubscribers: integer("baseline_subscribers").default(0),
  baselineRevenue: real("baseline_revenue").default(0),
  baselineEngagement: real("baseline_engagement").default(0),
  actualViews: integer("actual_views").default(0),
  actualSubscribers: integer("actual_subscribers").default(0),
  actualRevenue: real("actual_revenue").default(0),
  actualEngagement: real("actual_engagement").default(0),
  aiOptimizationsApplied: integer("ai_optimizations_applied").default(0),
  projectedViews: integer("projected_views").default(0),
  projectedSubscribers: integer("projected_subscribers").default(0),
  projectedRevenue: real("projected_revenue").default(0),
  metadata: jsonb("metadata").$type<{
    topOptimizations?: string[];
    growthRate?: number;
    baselineGrowthRate?: number;
    platformBreakdown?: Record<string, { baseline: number; actual: number }>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("channel_growth_user_date_idx").on(table.userId, table.snapshotDate),
}));

export const channelBaselineSnapshots = pgTable("channel_baseline_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id").notNull(),
  platform: text("platform").notNull(),
  channelName: text("channel_name").notNull(),
  snapshotType: text("snapshot_type").notNull().default("periodic"),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
  views: integer("views").default(0),
  subscribers: integer("subscribers").default(0),
  videoCount: integer("video_count").default(0),
  revenue: real("revenue").default(0),
  engagement: real("engagement").default(0),
  avgViewsPerVideo: real("avg_views_per_video").default(0),
  aiOptimizationsAtSnapshot: integer("ai_optimizations_at_snapshot").default(0),
  metadata: jsonb("metadata").$type<{
    milestones?: string[];
    topContent?: string[];
    growthRate?: number;
  }>(),
}, (table) => ({
  channelIdx: index("cbs_channel_idx").on(table.channelId),
  userDateIdx: index("cbs_user_date_idx").on(table.userId, table.snapshotDate),
  typeIdx: index("cbs_type_idx").on(table.snapshotType),
}));

export const insertChannelBaselineSnapshotSchema = createInsertSchema(channelBaselineSnapshots).omit({ id: true });
export type InsertChannelBaselineSnapshot = z.infer<typeof insertChannelBaselineSnapshotSchema>;
export type ChannelBaselineSnapshot = typeof channelBaselineSnapshots.$inferSelect;

export const learningInsights = pgTable("learning_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  category: text("category").notNull(),
  pattern: text("pattern").notNull(),
  confidence: real("confidence").default(0.5),
  sampleSize: integer("sample_size").default(0),
  data: jsonb("data").$type<{
    finding: string;
    evidence: string[];
    recommendation: string;
    performanceImpact?: number;
    niche?: string;
    platform?: string;
    seasonal?: boolean;
    lastValidated?: string;
  }>().notNull(),
  isGlobal: boolean("is_global").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("learning_insights_user_id_idx").on(table.userId),
}));

export const retentionBeats = pgTable("retention_beats", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  sourceCreator: text("source_creator").notNull(),
  beatType: text("beat_type").notNull(),
  timestampMarker: text("timestamp_marker"),
  technique: text("technique").notNull(),
  description: text("description").notNull(),
  psychologyPrinciple: text("psychology_principle"),
  retentionImpact: real("retention_impact").default(0),
  confidence: real("confidence").default(0.5),
  niche: text("niche"),
  videoStyle: text("video_style"),
  data: jsonb("data").$type<{
    examples: string[];
    counterExamples?: string[];
    timingRules?: string;
    emotionalArc?: string;
    audienceReaction?: string;
    platformOptimal?: string[];
    combinedWith?: string[];
    avoidWith?: string[];
  }>(),
  isGlobal: boolean("is_global").default(true),
  sampleSize: integer("sample_size").default(0),
  lastRefreshed: timestamp("last_refreshed").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("retention_beats_user_id_idx").on(table.userId),
  sourceCreatorIdx: index("retention_beats_source_creator_idx").on(table.sourceCreator),
  beatTypeIdx: index("retention_beats_beat_type_idx").on(table.beatType),
}));

export const contentIdeas = pgTable("content_ideas", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  concept: text("concept"),
  scriptOutline: text("script_outline"),
  predictedPerformance: real("predicted_performance"),
  difficulty: text("difficulty").default("medium"),
  niche: text("niche"),
  status: text("status").notNull().default("idea"),
  priority: integer("priority").default(0),
  metadata: jsonb("metadata").$type<{
    targetPlatforms: string[];
    estimatedLength?: string;
    filmingTips?: string[];
    equipmentNeeded?: string[];
    trendingScore?: number;
    seriesName?: string;
    seriesOrder?: number;
    keywords?: string[];
    thumbnailConcept?: string;
    hook?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_ideas_user_id_idx").on(table.userId),
}));

export const creatorMemory = pgTable("creator_memory", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  memoryType: text("memory_type").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").default(1.0),
  source: text("source").default("observed"),
  metadata: jsonb("metadata").$type<{
    examples?: string[];
    lastUsed?: string;
    frequency?: number;
    platform?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("creator_memory_user_id_idx").on(table.userId),
}));

export const contentClips = pgTable("content_clips", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceVideoId: integer("source_video_id").references(() => videos.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: real("start_time"),
  endTime: real("end_time"),
  targetPlatform: text("target_platform"),
  status: text("status").notNull().default("pending"),
  optimizationScore: real("optimization_score"),
  metadata: jsonb("metadata").$type<{
    tags?: string[];
    thumbnailPrompt?: string;
    format?: string;
    aspectRatio?: string;
  }>(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_clips_user_id_idx").on(table.userId),
  contentClips_userId_status_idx: index("contentClips_userId_status_idx").on(table.userId, table.status),
}));

export const videoVersions = pgTable("video_versions", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id).notNull(),
  userId: text("user_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  changeType: text("change_type").notNull(),
  previousData: jsonb("previous_data").$type<{
    title?: string;
    description?: string;
    tags?: string[];
    thumbnailUrl?: string;
    metadata?: Record<string, any>;
  }>().notNull(),
  changedBy: text("changed_by").default("ai"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("video_versions_user_id_idx").on(table.userId),
}));

export const streamChatMessages = pgTable("stream_chat_messages", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").references(() => streams.id).notNull(),
  platform: text("platform").notNull(),
  username: text("username").notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").default("chat"),
  isAutoReply: boolean("is_auto_reply").default(false),
  metadata: jsonb("metadata").$type<{
    badges?: string[];
    isVip?: boolean;
    isModerator?: boolean;
    sentiment?: string;
    topicCluster?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatTopics = pgTable("chat_topics", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").references(() => streams.id).notNull(),
  topic: text("topic").notNull(),
  mentionCount: integer("mention_count").default(1),
  sentiment: text("sentiment").default("neutral"),
  isActionable: boolean("is_actionable").default(false),
  surfacedToCreator: boolean("surfaced_to_creator").default(false),
  metadata: jsonb("metadata").$type<{
    sampleMessages: string[];
    firstMentioned?: string;
    peakMentions?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sponsorshipDeals = pgTable("sponsorship_deals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  brandName: text("brand_name").notNull(),
  status: text("status").notNull().default("prospect"),
  dealValue: real("deal_value"),
  currency: text("currency").default("USD"),
  deliverables: jsonb("deliverables").$type<{
    items: { type: string; description: string; deadline?: string; completed?: boolean }[];
  }>(),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("sponsorship_deals_user_id_idx").on(table.userId),
  statusIdx: index("sponsorship_deals_status_idx").on(table.userId, table.status),
}));

export const platformHealth = pgTable("platform_health", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id").references(() => channels.id),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("healthy"),
  strikes: integer("strikes").default(0),
  warnings: jsonb("warnings").$type<{
    items: { type: string; description: string; issuedAt: string; expiresAt?: string }[];
  }>(),
  monetizationStatus: text("monetization_status").default("unknown"),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("platform_health_user_id_idx").on(table.userId),
}));

export const collaborationLeads = pgTable("collaboration_leads", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  creatorName: text("creator_name").notNull(),
  platform: text("platform"),
  channelUrl: text("channel_url"),
  status: text("status").notNull().default("suggested"),
  audienceOverlap: real("audience_overlap"),
  notes: text("notes"),
  aiSuggested: boolean("ai_suggested").default(true),
  contactedAt: timestamp("contacted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("collaboration_leads_user_id_idx").on(table.userId),
}));

export const audienceSegments = pgTable("audience_segments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  segmentName: text("segment_name").notNull(),
  segmentType: text("segment_type").notNull(),
  size: integer("size").default(0),
  characteristics: jsonb("characteristics").$type<{
    platforms: string[];
    engagementLevel: string;
    contentPreferences: string[];
    demographics?: Record<string, any>;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("audience_segments_user_id_idx").on(table.userId),
}));

export const complianceRules = pgTable("compliance_rules", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  ruleCategory: text("rule_category").notNull(),
  ruleName: text("rule_name").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("warning"),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  lastUpdated: timestamp("last_updated").defaultNow(),
  sourceUrl: text("source_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  rating: text("rating").notNull(),
  comment: text("comment"),
  metadata: jsonb("metadata").$type<{
    aiFunction?: string;
    previousValue?: string;
    newValue?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_feedback_user_id_idx").on(table.userId),
}));

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tier: text("tier").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  aiUsageCount: integer("ai_usage_count").default(0),
  aiUsageLimit: integer("ai_usage_limit").default(5),
  metadata: jsonb("metadata").$type<{
    cancelReason?: string;
    trialEnd?: string;
    features?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
}));

// === BUSINESS EXPANSION TABLES ===

export const expenseRecords = pgTable("expense_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").default("USD"),
  vendor: text("vendor"),
  receiptUrl: text("receipt_url"),
  taxDeductible: boolean("tax_deductible").default(true),
  irsCategory: text("irs_category"),
  platform: text("platform"),
  recurring: boolean("recurring").default(false),
  recurringFrequency: text("recurring_frequency"),
  metadata: jsonb("metadata").$type<{
    notes?: string;
    projectName?: string;
    ventureId?: number;
    mileage?: number;
    homeOfficePercent?: number;
    depreciationYears?: number;
  }>(),
  expenseDate: timestamp("expense_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("expense_records_user_id_idx").on(table.userId),
}));

export const businessVentures = pgTable("business_ventures", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("planning"),
  description: text("description"),
  revenue: real("revenue").default(0),
  expenses: real("expenses").default(0),
  launchDate: timestamp("launch_date"),
  metadata: jsonb("metadata").$type<{
    platform?: string;
    url?: string;
    pricing?: string;
    targetAudience?: string;
    milestones?: { name: string; date: string; completed: boolean }[];
    kpis?: Record<string, number>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("business_ventures_user_id_idx").on(table.userId),
}));

export const businessDetails = pgTable("business_details", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  hasExistingBusiness: boolean("has_existing_business").notNull().default(false),
  country: text("country").notNull(),
  businessName: text("business_name"),
  entityType: text("entity_type"),
  registrationNumber: text("registration_number"),
  taxId: text("tax_id"),
  address: text("address"),
  city: text("city"),
  stateProvince: text("state_province"),
  postalCode: text("postal_code"),
  registrationStatus: text("registration_status").notNull().default("not_started"),
  registrationSteps: jsonb("registration_steps").$type<{
    stepId: string;
    label: string;
    url: string;
    completed: boolean;
    visitedAt?: string;
    completedAt?: string;
  }[]>(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("business_details_user_id_idx").on(table.userId),
}));

export const insertBusinessDetailsSchema = createInsertSchema(businessDetails).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessDetails = z.infer<typeof insertBusinessDetailsSchema>;
export type BusinessDetails = typeof businessDetails.$inferSelect;

export const businessGoals = pgTable("business_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  targetValue: real("target_value"),
  currentValue: real("current_value").default(0),
  unit: text("unit").default("USD"),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default("active"),
  aiRecommendations: jsonb("ai_recommendations").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("business_goals_user_id_idx").on(table.userId),
}));

export const taxEstimates = pgTable("tax_estimates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  quarter: text("quarter").notNull(),
  year: integer("year").notNull(),
  estimatedIncome: real("estimated_income").default(0),
  estimatedDeductions: real("estimated_deductions").default(0),
  estimatedTax: real("estimated_tax").default(0),
  federalTax: real("federal_tax").default(0),
  stateTax: real("state_tax").default(0),
  selfEmploymentTax: real("self_employment_tax").default(0),
  state: text("state"),
  entityType: text("entity_type").default("sole_proprietor"),
  dueDate: timestamp("due_date"),
  paid: boolean("paid").default(false),
  paidAmount: real("paid_amount"),
  metadata: jsonb("metadata").$type<{
    deductionBreakdown?: Record<string, number>;
    incomeBreakdown?: Record<string, number>;
    recommendations?: string[];
    stateSpecific?: Record<string, any>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("tax_estimates_user_id_idx").on(table.userId),
}));

export const brandAssets = pgTable("brand_assets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  assetType: text("asset_type").notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  metadata: jsonb("metadata").$type<{
    hex?: string;
    fontFamily?: string;
    fontWeight?: string;
    url?: string;
    usage?: string;
    variations?: Record<string, string>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("brand_assets_user_id_idx").on(table.userId),
}));

export const wellnessChecks = pgTable("wellness_checks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  mood: integer("mood").notNull(),
  energy: integer("energy").notNull(),
  stress: integer("stress").notNull(),
  hoursWorked: real("hours_worked"),
  notes: text("notes"),
  aiRecommendation: text("ai_recommendation"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("wellness_checks_user_id_idx").on(table.userId),
}));

export const competitorTracks = pgTable("competitor_tracks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  competitorName: text("competitor_name").notNull(),
  platform: text("platform").notNull(),
  channelUrl: text("channel_url"),
  subscribers: integer("subscribers"),
  avgViews: integer("avg_views"),
  uploadFrequency: text("upload_frequency"),
  strengths: jsonb("strengths").$type<string[]>(),
  opportunities: jsonb("opportunities").$type<string[]>(),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("competitor_tracks_user_id_idx").on(table.userId),
}));

export const knowledgeMilestones = pgTable("knowledge_milestones", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  category: text("category").notNull(),
  progress: integer("progress").default(0),
  completed: boolean("completed").default(false),
  resources: jsonb("resources").$type<{ title: string; url?: string; type: string }[]>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("knowledge_milestones_user_id_idx").on(table.userId),
}));

// === PIPELINE & CLIP TABLES ===

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("queued"),
  totalVideos: integer("total_videos").default(0),
  processedVideos: integer("processed_videos").default(0),
  clipsFound: integer("clips_found").default(0),
  mode: text("mode"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata").$type<{
    errors?: string[];
    avgClipsPerVideo?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("pipeline_runs_user_id_idx").on(table.userId),
  pipelineRuns_userId_status_idx: index("pipeline_runs_userId_status_idx").on(table.userId, table.status),
}));

export const clipViralityScores = pgTable("clip_virality_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  clipId: integer("clip_id").references(() => contentClips.id),
  predictedScore: real("predicted_score"),
  actualScore: real("actual_score"),
  platform: text("platform"),
  factors: jsonb("factors").$type<{
    hookStrength?: number;
    trendAlignment?: number;
    audienceMatch?: number;
    platformFit?: number;
  }>(),
  accuracy: real("accuracy"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("clip_virality_scores_user_id_idx").on(table.userId),
}));

export const optimizationPasses = pgTable("optimization_passes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  engineName: text("engine_name").notNull(),
  passNumber: integer("pass_number").notNull(),
  previousScore: real("previous_score"),
  newScore: real("new_score"),
  changes: jsonb("changes").$type<{
    field: string;
    oldValue: string;
    newValue: string;
  }[]>(),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("optimization_passes_user_id_idx").on(table.userId),
}));

// === TREND & ALGORITHM TABLES ===

export const trendingTopics = pgTable("trending_topics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  platform: text("platform"),
  trendScore: real("trend_score"),
  velocity: text("velocity").default("stable"),
  category: text("category"),
  relatedKeywords: jsonb("related_keywords").$type<string[]>(),
  firstSeenAt: timestamp("first_seen_at"),
  peakAt: timestamp("peak_at"),
  metadata: jsonb("metadata").$type<{
    volume?: number;
    competition?: number;
    relevanceScore?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("trending_topics_user_id_idx").on(table.userId),
}));

export const hashtagHealth = pgTable("hashtag_health", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  hashtag: text("hashtag").notNull(),
  platform: text("platform"),
  currentVolume: integer("current_volume"),
  growthRate: real("growth_rate"),
  status: text("status").default("stable"),
  recommendedUse: text("recommended_use"),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("hashtag_health_user_id_idx").on(table.userId),
}));

export const algorithmAlerts = pgTable("algorithm_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  alertType: text("alert_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  impact: text("impact").default("medium"),
  recommendations: jsonb("recommendations").$type<string[]>(),
  acknowledged: boolean("acknowledged").default(false),
  detectedAt: timestamp("detected_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("algorithm_alerts_user_id_idx").on(table.userId),
}));

// === CONTENT LIFECYCLE TABLES ===

export const contentLifecycle = pgTable("content_lifecycle", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  currentStage: text("current_stage").notNull().default("new"),
  stageEnteredAt: timestamp("stage_entered_at"),
  predictedNextStage: text("predicted_next_stage"),
  daysInStage: integer("days_in_stage").default(0),
  performanceData: jsonb("performance_data").$type<{
    views?: number;
    growth?: number;
    engagement?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_lifecycle_user_id_idx").on(table.userId),
}));

export const evergreenClassifications = pgTable("evergreen_classifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  isEvergreen: boolean("is_evergreen").default(false),
  confidence: real("confidence"),
  reasons: jsonb("reasons").$type<string[]>(),
  monthlyViews: real("monthly_views"),
  refreshRecommendation: text("refresh_recommendation"),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("evergreen_classifications_user_id_idx").on(table.userId),
}));

export const cannibalizationAlerts = pgTable("cannibalization_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId1: integer("video_id_1").references(() => videos.id),
  videoId2: integer("video_id_2").references(() => videos.id),
  overlapScore: real("overlap_score"),
  sharedKeywords: jsonb("shared_keywords").$type<string[]>(),
  recommendation: text("recommendation"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("cannibalization_alerts_user_id_idx").on(table.userId),
}));

// === PREDICTION & ANALYTICS TABLES ===

export const viralScorePredictions = pgTable("viral_score_predictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  contentType: text("content_type"),
  predictedViralScore: real("predicted_viral_score"),
  actualViralScore: real("actual_viral_score"),
  predictionDate: timestamp("prediction_date"),
  evaluationDate: timestamp("evaluation_date"),
  factors: jsonb("factors").$type<Record<string, number>>(),
  accuracy: real("accuracy"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("viral_score_predictions_user_id_idx").on(table.userId),
}));

export const commentSentiments = pgTable("comment_sentiments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  platform: text("platform"),
  totalComments: integer("total_comments").default(0),
  positivePct: real("positive_pct"),
  negativePct: real("negative_pct"),
  neutralPct: real("neutral_pct"),
  topThemes: jsonb("top_themes").$type<string[]>(),
  actionableInsights: jsonb("actionable_insights").$type<string[]>(),
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("comment_sentiments_user_id_idx").on(table.userId),
}));

export const trendPredictions = pgTable("trend_predictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  platform: text("platform"),
  predictedTrend: text("predicted_trend"),
  confidence: real("confidence"),
  timeframe: text("timeframe"),
  recommendation: text("recommendation"),
  outcome: text("outcome"),
  predictedAt: timestamp("predicted_at"),
  evaluatedAt: timestamp("evaluated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("trend_predictions_user_id_idx").on(table.userId),
}));

export const contentDnaProfiles = pgTable("content_dna_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  profileData: jsonb("profile_data").$type<{
    topFormats?: string[];
    avgLength?: number;
    bestHooks?: string[];
    tonalPattern?: string;
    visualStyle?: string;
    audienceResponse?: string;
    bestPostingTimes?: string[];
    uniqueStrengths?: string[];
  }>(),
  confidence: real("confidence"),
  sampleSize: integer("sample_size").default(0),
  lastUpdatedAt: timestamp("last_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_dna_profiles_user_id_idx").on(table.userId),
}));

export const ctrOptimizations = pgTable("ctr_optimizations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  originalCtr: real("original_ctr"),
  optimizedCtr: real("optimized_ctr"),
  changes: jsonb("changes").$type<{
    titleChange?: string;
    thumbnailChange?: string;
    descriptionChange?: string;
  }>(),
  testPeriodDays: integer("test_period_days"),
  improvement: real("improvement"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("ctr_optimizations_user_id_idx").on(table.userId),
}));

// === PLAYLIST & CONTENT REPURPOSE TABLES ===

export const managedPlaylists = pgTable("managed_playlists", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  youtubePlaylistId: text("youtube_playlist_id"),
  title: text("title").notNull(),
  description: text("description"),
  strategy: text("strategy").default("topic"),
  videoCount: integer("video_count").default(0),
  seoScore: real("seo_score"),
  autoManaged: boolean("auto_managed").default(false),
  lastUpdatedAt: timestamp("last_updated_at"),
  metadata: jsonb("metadata").$type<{
    ordering?: string;
    rules?: Record<string, any>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("managed_playlists_user_id_idx").on(table.userId),
}));

export const playlistItems = pgTable("playlist_items", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").references(() => managedPlaylists.id),
  videoId: integer("video_id").references(() => videos.id),
  position: integer("position").default(0),
  addedAt: timestamp("added_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const repurposedContent = pgTable("repurposed_content", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceVideoId: integer("source_video_id").references(() => videos.id),
  format: text("format").notNull(),
  title: text("title"),
  content: text("content"),
  platform: text("platform"),
  status: text("status").default("draft"),
  publishedAt: timestamp("published_at"),
  engagement: jsonb("engagement").$type<{
    views?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("repurposed_content_user_id_idx").on(table.userId),
}));

export const scriptTemplates = pgTable("script_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  template: text("template").notNull(),
  variables: jsonb("variables").$type<string[]>(),
  usageCount: integer("usage_count").default(0),
  avgPerformance: real("avg_performance"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("script_templates_user_id_idx").on(table.userId),
}));

// === AUDIENCE & CONTENT GAP TABLES ===

export const audienceActivityPatterns = pgTable("audience_activity_patterns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform"),
  dayOfWeek: integer("day_of_week"),
  hourOfDay: integer("hour_of_day"),
  activityLevel: real("activity_level"),
  sampleSize: integer("sample_size").default(0),
  lastUpdatedAt: timestamp("last_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("audience_activity_patterns_user_id_idx").on(table.userId),
}));

export const contentGapSuggestions = pgTable("content_gap_suggestions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  competitorsCovering: integer("competitors_covering").default(0),
  estimatedDemand: real("estimated_demand"),
  difficulty: text("difficulty"),
  suggestedTitle: text("suggested_title"),
  suggestedAngle: text("suggested_angle"),
  status: text("status").default("suggested"),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_gap_suggestions_user_id_idx").on(table.userId),
}));

// === REVENUE & MONETIZATION TABLES ===

export const revenueForecasts = pgTable("revenue_forecasts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  forecastDate: timestamp("forecast_date"),
  period: text("period"),
  predictedRevenue: real("predicted_revenue"),
  actualRevenue: real("actual_revenue"),
  confidence: real("confidence"),
  breakdown: jsonb("breakdown").$type<{
    adRevenue?: number;
    sponsors?: number;
    memberships?: number;
    merch?: number;
    tips?: number;
  }>(),
  assumptions: jsonb("assumptions").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("revenue_forecasts_user_id_idx").on(table.userId),
}));

export const fanFunnelEvents = pgTable("fan_funnel_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  platform: text("platform"),
  count: integer("count").default(0),
  conversionRate: real("conversion_rate"),
  period: text("period"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("fan_funnel_events_user_id_idx").on(table.userId),
}));

export const sponsorRates = pgTable("sponsor_rates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  rateType: text("rate_type"),
  calculatedRate: real("calculated_rate"),
  marketAverage: real("market_average"),
  currency: text("currency").default("USD"),
  basedOn: jsonb("based_on").$type<{
    subscribers?: number;
    avgViews?: number;
    engagement?: number;
    niche?: string;
  }>(),
  lastCalculatedAt: timestamp("last_calculated_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("sponsor_rates_user_id_idx").on(table.userId),
}));

export const equipmentRoi = pgTable("equipment_roi", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category"),
  purchasePrice: real("purchase_price"),
  purchaseDate: timestamp("purchase_date"),
  revenueAttributed: real("revenue_attributed").default(0),
  hoursUsed: real("hours_used").default(0),
  roiPercent: real("roi_percent"),
  status: text("status").default("paying-off"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("equipment_roi_user_id_idx").on(table.userId),
}));

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sponsorDealId: integer("sponsor_deal_id").references(() => sponsorshipDeals.id),
  invoiceNumber: text("invoice_number"),
  brandName: text("brand_name"),
  amount: real("amount"),
  currency: text("currency").default("USD"),
  dueDate: timestamp("due_date"),
  status: text("status").default("draft"),
  lineItems: jsonb("line_items").$type<{
    description: string;
    amount: number;
    quantity?: number;
  }[]>(),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("invoices_user_id_idx").on(table.userId),
}));

// === COMMUNITY & FAN TABLES ===

export const superfanProfiles = pgTable("superfan_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fanIdentifier: text("fan_identifier").notNull(),
  platforms: jsonb("platforms").$type<string[]>(),
  engagementScore: real("engagement_score"),
  totalInteractions: integer("total_interactions").default(0),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  notes: text("notes"),
  tier: text("tier").default("casual"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("superfan_profiles_user_id_idx").on(table.userId),
}));

// === LEGAL & CRM TABLES ===

export const legalDocuments = pgTable("legal_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  docType: text("doc_type").notNull(),
  title: text("title").notNull(),
  brandName: text("brand_name"),
  status: text("status").default("draft"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  value: real("value"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("legal_documents_user_id_idx").on(table.userId),
}));

export const creatorCrm = pgTable("creator_crm", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contactName: text("contact_name").notNull(),
  company: text("company"),
  role: text("role"),
  email: text("email"),
  platform: text("platform"),
  relationshipType: text("relationship_type"),
  status: text("status").default("lead"),
  lastContactedAt: timestamp("last_contacted_at"),
  notes: text("notes"),
  dealValue: real("deal_value"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("creator_crm_user_id_idx").on(table.userId),
}));

// === WELLNESS & WORKLOAD TABLES ===

export const workloadLogs = pgTable("workload_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: timestamp("date").notNull(),
  hoursWorked: real("hours_worked"),
  category: text("category"),
  energyLevel: integer("energy_level"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("workload_logs_user_id_idx").on(table.userId),
}));

export const burnoutAlerts = pgTable("burnout_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  riskLevel: text("risk_level").notNull().default("low"),
  factors: jsonb("factors").$type<string[]>(),
  recommendation: text("recommendation"),
  autoThrottleApplied: boolean("auto_throttle_applied").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("burnout_alerts_user_id_idx").on(table.userId),
}));

// === TEAM & OPERATIONS TABLES ===

export const teamTasks = pgTable("team_tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  assignedTo: text("assigned_to"),
  category: text("category"),
  priority: text("priority").default("medium"),
  status: text("status").default("todo"),
  dueDate: timestamp("due_date"),
  description: text("description"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("team_tasks_user_id_idx").on(table.userId),
}));

export const dailyBriefings = pgTable("daily_briefings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  briefingDate: timestamp("briefing_date").notNull(),
  overnightSummary: text("overnight_summary"),
  trendingNow: text("trending_now"),
  todaysPlan: text("todays_plan"),
  actionItems: jsonb("action_items").$type<string[]>(),
  metadata: jsonb("metadata").$type<{
    metrics?: Record<string, number>;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("daily_briefings_user_id_idx").on(table.userId),
}));

export const agentScorecards = pgTable("agent_scorecards", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  period: text("period"),
  tasksCompleted: integer("tasks_completed").default(0),
  accuracy: real("accuracy"),
  userRating: real("user_rating"),
  topActions: jsonb("top_actions").$type<string[]>(),
  improvementAreas: jsonb("improvement_areas").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("agent_scorecards_user_id_idx").on(table.userId),
}));

// === GROWTH & TEMPLATES TABLES ===

export const growthPredictions = pgTable("growth_predictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  metric: text("metric").notNull(),
  currentValue: real("current_value"),
  predicted30d: real("predicted_30d"),
  predicted90d: real("predicted_90d"),
  predicted365d: real("predicted_365d"),
  confidence: real("confidence"),
  factors: jsonb("factors").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("growth_predictions_user_id_idx").on(table.userId),
}));

export const descriptionTemplates = pgTable("description_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  content: text("content").notNull(),
  variables: jsonb("variables").$type<string[]>(),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("description_templates_user_id_idx").on(table.userId),
}));

// === STREAMING & CHANNEL TABLES ===

export const streamPerformanceLogs = pgTable("stream_performance_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id").references(() => streams.id),
  grade: text("grade"),
  peakViewers: integer("peak_viewers"),
  avgViewers: integer("avg_viewers"),
  chatRate: real("chat_rate"),
  followerGain: integer("follower_gain"),
  revenue: real("revenue"),
  highlights: jsonb("highlights").$type<string[]>(),
  improvementTips: jsonb("improvement_tips").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("stream_performance_logs_user_id_idx").on(table.userId),
}));

export const linkedChannels = pgTable("linked_channels", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  username: text("username"),
  profileUrl: text("profile_url"),
  isConnected: boolean("is_connected").default(false),
  connectionType: text("connection_type"),
  credentials: jsonb("credentials").$type<{
    streamKey?: string;
    apiKey?: string;
  }>(),
  lastVerifiedAt: timestamp("last_verified_at"),
  followerCount: integer("follower_count"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("linked_channels_user_id_idx").on(table.userId),
}));

// === INSERT SCHEMAS ===
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
export const insertRevenueSyncLogSchema = createInsertSchema(revenueSyncLog).omit({ id: true, createdAt: true });
export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertAbTestSchema = createInsertSchema(abTests).omit({ id: true, createdAt: true });
export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots).omit({ id: true, createdAt: true });
export const insertLearningInsightSchema = createInsertSchema(learningInsights).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRetentionBeatSchema = createInsertSchema(retentionBeats).omit({ id: true, createdAt: true, updatedAt: true, lastRefreshed: true });
export const insertContentIdeaSchema = createInsertSchema(contentIdeas).omit({ id: true, createdAt: true });
export const insertCreatorMemorySchema = createInsertSchema(creatorMemory).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContentClipSchema = createInsertSchema(contentClips).omit({ id: true, createdAt: true });
export const insertVideoVersionSchema = createInsertSchema(videoVersions).omit({ id: true, createdAt: true });
export const insertStreamChatMessageSchema = createInsertSchema(streamChatMessages).omit({ id: true, createdAt: true });
export const insertChatTopicSchema = createInsertSchema(chatTopics).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSponsorshipDealSchema = createInsertSchema(sponsorshipDeals).omit({ id: true, createdAt: true });
export const insertPlatformHealthSchema = createInsertSchema(platformHealth).omit({ id: true, createdAt: true });
export const insertCollaborationLeadSchema = createInsertSchema(collaborationLeads).omit({ id: true, createdAt: true });
export const insertAudienceSegmentSchema = createInsertSchema(audienceSegments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertComplianceRuleSchema = createInsertSchema(complianceRules).omit({ id: true, createdAt: true });
export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExpenseRecordSchema = createInsertSchema(expenseRecords).omit({ id: true, createdAt: true });
export const insertBusinessVentureSchema = createInsertSchema(businessVentures).omit({ id: true, createdAt: true });
export const insertBusinessGoalSchema = createInsertSchema(businessGoals).omit({ id: true, createdAt: true });
export const insertTaxEstimateSchema = createInsertSchema(taxEstimates).omit({ id: true, createdAt: true });
export const insertBrandAssetSchema = createInsertSchema(brandAssets).omit({ id: true, createdAt: true });
export const insertWellnessCheckSchema = createInsertSchema(wellnessChecks).omit({ id: true, createdAt: true });
export const insertCompetitorTrackSchema = createInsertSchema(competitorTracks).omit({ id: true, createdAt: true });
export const insertKnowledgeMilestoneSchema = createInsertSchema(knowledgeMilestones).omit({ id: true, createdAt: true });
export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).omit({ id: true, createdAt: true });
export const insertClipViralityScoreSchema = createInsertSchema(clipViralityScores).omit({ id: true, createdAt: true });
export const insertOptimizationPassSchema = createInsertSchema(optimizationPasses).omit({ id: true, createdAt: true });
export const insertTrendingTopicSchema = createInsertSchema(trendingTopics).omit({ id: true, createdAt: true });
export const insertHashtagHealthSchema = createInsertSchema(hashtagHealth).omit({ id: true, createdAt: true });
export const insertAlgorithmAlertSchema = createInsertSchema(algorithmAlerts).omit({ id: true, createdAt: true });
export const insertContentLifecycleSchema = createInsertSchema(contentLifecycle).omit({ id: true, createdAt: true });
export const insertEvergreenClassificationSchema = createInsertSchema(evergreenClassifications).omit({ id: true, createdAt: true });
export const insertCannibalizationAlertSchema = createInsertSchema(cannibalizationAlerts).omit({ id: true, createdAt: true });
export const insertViralScorePredictionSchema = createInsertSchema(viralScorePredictions).omit({ id: true, createdAt: true });
export const insertCommentSentimentSchema = createInsertSchema(commentSentiments).omit({ id: true, createdAt: true });
export const insertTrendPredictionSchema = createInsertSchema(trendPredictions).omit({ id: true, createdAt: true });
export const insertContentDnaProfileSchema = createInsertSchema(contentDnaProfiles).omit({ id: true, createdAt: true });
export const insertCtrOptimizationSchema = createInsertSchema(ctrOptimizations).omit({ id: true, createdAt: true });
export const insertManagedPlaylistSchema = createInsertSchema(managedPlaylists).omit({ id: true, createdAt: true });
export const insertPlaylistItemSchema = createInsertSchema(playlistItems).omit({ id: true, createdAt: true });
export const insertRepurposedContentSchema = createInsertSchema(repurposedContent).omit({ id: true, createdAt: true });
export const insertScriptTemplateSchema = createInsertSchema(scriptTemplates).omit({ id: true, createdAt: true });
export const insertAudienceActivityPatternSchema = createInsertSchema(audienceActivityPatterns).omit({ id: true, createdAt: true });
export const insertContentGapSuggestionSchema = createInsertSchema(contentGapSuggestions).omit({ id: true, createdAt: true });
export const insertRevenueForecastSchema = createInsertSchema(revenueForecasts).omit({ id: true, createdAt: true });
export const insertFanFunnelEventSchema = createInsertSchema(fanFunnelEvents).omit({ id: true, createdAt: true });
export const insertSponsorRateSchema = createInsertSchema(sponsorRates).omit({ id: true, createdAt: true });
export const insertEquipmentRoiSchema = createInsertSchema(equipmentRoi).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertSuperfanProfileSchema = createInsertSchema(superfanProfiles).omit({ id: true, createdAt: true });
export const insertLegalDocumentSchema = createInsertSchema(legalDocuments).omit({ id: true, createdAt: true });
export const insertCreatorCrmSchema = createInsertSchema(creatorCrm).omit({ id: true, createdAt: true });
export const insertWorkloadLogSchema = createInsertSchema(workloadLogs).omit({ id: true, createdAt: true });
export const insertBurnoutAlertSchema = createInsertSchema(burnoutAlerts).omit({ id: true, createdAt: true });
export const insertTeamTaskSchema = createInsertSchema(teamTasks).omit({ id: true, createdAt: true });
export const insertDailyBriefingSchema = createInsertSchema(dailyBriefings).omit({ id: true, createdAt: true });
export const insertAgentScorecardSchema = createInsertSchema(agentScorecards).omit({ id: true, createdAt: true });
export const insertGrowthPredictionSchema = createInsertSchema(growthPredictions).omit({ id: true, createdAt: true });
export const insertDescriptionTemplateSchema = createInsertSchema(descriptionTemplates).omit({ id: true, createdAt: true });
export const insertStreamPerformanceLogSchema = createInsertSchema(streamPerformanceLogs).omit({ id: true, createdAt: true });
export const insertLinkedChannelSchema = createInsertSchema(linkedChannels).omit({ id: true, createdAt: true });

// === SELECT TYPES ===
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
export type RevenueSyncLog = typeof revenueSyncLog.$inferSelect;
export type InsertRevenueSyncLog = z.infer<typeof insertRevenueSyncLogSchema>;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AbTest = typeof abTests.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type LearningInsight = typeof learningInsights.$inferSelect;
export type RetentionBeat = typeof retentionBeats.$inferSelect;
export type InsertRetentionBeat = z.infer<typeof insertRetentionBeatSchema>;
export type ContentIdea = typeof contentIdeas.$inferSelect;
export type CreatorMemoryEntry = typeof creatorMemory.$inferSelect;
export type ContentClip = typeof contentClips.$inferSelect;
export type VideoVersion = typeof videoVersions.$inferSelect;
export type StreamChatMessage = typeof streamChatMessages.$inferSelect;
export type ChatTopic = typeof chatTopics.$inferSelect;
export type SponsorshipDeal = typeof sponsorshipDeals.$inferSelect;
export type PlatformHealthRecord = typeof platformHealth.$inferSelect;
export type CollaborationLead = typeof collaborationLeads.$inferSelect;
export type AudienceSegment = typeof audienceSegments.$inferSelect;
export type ComplianceRule = typeof complianceRules.$inferSelect;
export type UserFeedbackEntry = typeof userFeedback.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type ExpenseRecord = typeof expenseRecords.$inferSelect;
export type BusinessVenture = typeof businessVentures.$inferSelect;
export type BusinessGoal = typeof businessGoals.$inferSelect;
export type TaxEstimate = typeof taxEstimates.$inferSelect;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type WellnessCheck = typeof wellnessChecks.$inferSelect;
export type CompetitorTrack = typeof competitorTracks.$inferSelect;
export type KnowledgeMilestone = typeof knowledgeMilestones.$inferSelect;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type ClipViralityScore = typeof clipViralityScores.$inferSelect;
export type OptimizationPass = typeof optimizationPasses.$inferSelect;
export type TrendingTopic = typeof trendingTopics.$inferSelect;
export type HashtagHealthRecord = typeof hashtagHealth.$inferSelect;
export type AlgorithmAlert = typeof algorithmAlerts.$inferSelect;
export type ContentLifecycleRecord = typeof contentLifecycle.$inferSelect;
export type EvergreenClassification = typeof evergreenClassifications.$inferSelect;
export type CannibalizationAlert = typeof cannibalizationAlerts.$inferSelect;
export type ViralScorePrediction = typeof viralScorePredictions.$inferSelect;
export type CommentSentiment = typeof commentSentiments.$inferSelect;
export type TrendPrediction = typeof trendPredictions.$inferSelect;
export type ContentDnaProfile = typeof contentDnaProfiles.$inferSelect;
export type CtrOptimization = typeof ctrOptimizations.$inferSelect;
export type ManagedPlaylist = typeof managedPlaylists.$inferSelect;
export type PlaylistItem = typeof playlistItems.$inferSelect;
export type RepurposedContentRecord = typeof repurposedContent.$inferSelect;
export type ScriptTemplate = typeof scriptTemplates.$inferSelect;
export type AudienceActivityPattern = typeof audienceActivityPatterns.$inferSelect;
export type ContentGapSuggestion = typeof contentGapSuggestions.$inferSelect;
export type RevenueForecast = typeof revenueForecasts.$inferSelect;
export type FanFunnelEvent = typeof fanFunnelEvents.$inferSelect;
export type SponsorRate = typeof sponsorRates.$inferSelect;
export type EquipmentRoiRecord = typeof equipmentRoi.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type SuperfanProfile = typeof superfanProfiles.$inferSelect;
export type LegalDocument = typeof legalDocuments.$inferSelect;
export type CreatorCrmRecord = typeof creatorCrm.$inferSelect;
export type WorkloadLog = typeof workloadLogs.$inferSelect;
export type BurnoutAlert = typeof burnoutAlerts.$inferSelect;
export type TeamTask = typeof teamTasks.$inferSelect;
export type DailyBriefing = typeof dailyBriefings.$inferSelect;
export type AgentScorecard = typeof agentScorecards.$inferSelect;
export type GrowthPrediction = typeof growthPredictions.$inferSelect;
export type DescriptionTemplate = typeof descriptionTemplates.$inferSelect;
export type StreamPerformanceLog = typeof streamPerformanceLogs.$inferSelect;
export type LinkedChannel = typeof linkedChannels.$inferSelect;

// === INSERT TYPES ===
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
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertAbTest = z.infer<typeof insertAbTestSchema>;
export type InsertAnalyticsSnapshot = z.infer<typeof insertAnalyticsSnapshotSchema>;
export type InsertLearningInsight = z.infer<typeof insertLearningInsightSchema>;
export type InsertContentIdea = z.infer<typeof insertContentIdeaSchema>;
export type InsertCreatorMemory = z.infer<typeof insertCreatorMemorySchema>;
export type InsertContentClip = z.infer<typeof insertContentClipSchema>;
export type InsertVideoVersion = z.infer<typeof insertVideoVersionSchema>;
export type InsertStreamChatMessage = z.infer<typeof insertStreamChatMessageSchema>;
export type InsertChatTopic = z.infer<typeof insertChatTopicSchema>;
export type InsertSponsorshipDeal = z.infer<typeof insertSponsorshipDealSchema>;
export type InsertPlatformHealth = z.infer<typeof insertPlatformHealthSchema>;
export type InsertCollaborationLead = z.infer<typeof insertCollaborationLeadSchema>;
export type InsertAudienceSegment = z.infer<typeof insertAudienceSegmentSchema>;
export type InsertComplianceRule = z.infer<typeof insertComplianceRuleSchema>;
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type InsertExpenseRecord = z.infer<typeof insertExpenseRecordSchema>;
export type InsertBusinessVenture = z.infer<typeof insertBusinessVentureSchema>;
export type InsertBusinessGoal = z.infer<typeof insertBusinessGoalSchema>;
export type InsertTaxEstimate = z.infer<typeof insertTaxEstimateSchema>;
export type InsertBrandAsset = z.infer<typeof insertBrandAssetSchema>;
export type InsertWellnessCheck = z.infer<typeof insertWellnessCheckSchema>;
export type InsertCompetitorTrack = z.infer<typeof insertCompetitorTrackSchema>;
export type InsertKnowledgeMilestone = z.infer<typeof insertKnowledgeMilestoneSchema>;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type InsertClipViralityScore = z.infer<typeof insertClipViralityScoreSchema>;
export type InsertOptimizationPass = z.infer<typeof insertOptimizationPassSchema>;
export type InsertTrendingTopic = z.infer<typeof insertTrendingTopicSchema>;
export type InsertHashtagHealth = z.infer<typeof insertHashtagHealthSchema>;
export type InsertAlgorithmAlert = z.infer<typeof insertAlgorithmAlertSchema>;
export type InsertContentLifecycle = z.infer<typeof insertContentLifecycleSchema>;
export type InsertEvergreenClassification = z.infer<typeof insertEvergreenClassificationSchema>;
export type InsertCannibalizationAlert = z.infer<typeof insertCannibalizationAlertSchema>;
export type InsertViralScorePrediction = z.infer<typeof insertViralScorePredictionSchema>;
export type InsertCommentSentiment = z.infer<typeof insertCommentSentimentSchema>;
export type InsertTrendPrediction = z.infer<typeof insertTrendPredictionSchema>;
export type InsertContentDnaProfile = z.infer<typeof insertContentDnaProfileSchema>;
export type InsertCtrOptimization = z.infer<typeof insertCtrOptimizationSchema>;
export type InsertManagedPlaylist = z.infer<typeof insertManagedPlaylistSchema>;
export type InsertPlaylistItem = z.infer<typeof insertPlaylistItemSchema>;
export type InsertRepurposedContent = z.infer<typeof insertRepurposedContentSchema>;
export type InsertScriptTemplate = z.infer<typeof insertScriptTemplateSchema>;
export type InsertAudienceActivityPattern = z.infer<typeof insertAudienceActivityPatternSchema>;
export type InsertContentGapSuggestion = z.infer<typeof insertContentGapSuggestionSchema>;
export type InsertRevenueForecast = z.infer<typeof insertRevenueForecastSchema>;
export type InsertFanFunnelEvent = z.infer<typeof insertFanFunnelEventSchema>;
export type InsertSponsorRate = z.infer<typeof insertSponsorRateSchema>;
export type InsertEquipmentRoi = z.infer<typeof insertEquipmentRoiSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertSuperfanProfile = z.infer<typeof insertSuperfanProfileSchema>;
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;
export type InsertCreatorCrm = z.infer<typeof insertCreatorCrmSchema>;
export type InsertWorkloadLog = z.infer<typeof insertWorkloadLogSchema>;
export type InsertBurnoutAlert = z.infer<typeof insertBurnoutAlertSchema>;
export type InsertTeamTask = z.infer<typeof insertTeamTaskSchema>;
export type InsertDailyBriefing = z.infer<typeof insertDailyBriefingSchema>;
export type InsertAgentScorecard = z.infer<typeof insertAgentScorecardSchema>;
export type InsertGrowthPrediction = z.infer<typeof insertGrowthPredictionSchema>;
export type InsertDescriptionTemplate = z.infer<typeof insertDescriptionTemplateSchema>;
export type InsertStreamPerformanceLog = z.infer<typeof insertStreamPerformanceLogSchema>;
export type InsertLinkedChannel = z.infer<typeof insertLinkedChannelSchema>;

export type UpdateChannelRequest = Partial<InsertChannel> & { lastSyncAt?: Date };
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

// === ACCESS CODES (Affiliate Program) ===
export const accessCodes = pgTable("access_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code").unique().notNull(),
  label: varchar("label"),
  tier: varchar("tier").notNull().default("ultimate"),
  createdBy: varchar("created_by").notNull(),
  redeemedBy: varchar("redeemed_by"),
  redeemedAt: timestamp("redeemed_at"),
  maxUses: integer("max_uses").default(1),
  useCount: integer("use_count").default(0),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAccessCodeSchema = createInsertSchema(accessCodes).omit({ id: true, createdAt: true, useCount: true });
export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = z.infer<typeof insertAccessCodeSchema>;

export const aiResults = pgTable("ai_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  featureKey: text("feature_key").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("ai_results_user_id_idx").on(table.userId),
  featureKeyIdx: index("ai_results_feature_key_idx").on(table.featureKey),
}));

export const cronJobs = pgTable("cron_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  featureKey: text("feature_key").notNull(),
  schedule: text("schedule").notNull().default("0 */6 * * *"),
  enabled: boolean("enabled").notNull().default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  status: text("status").notNull().default("idle"),
}, (table) => ({
  userIdIdx: index("cron_jobs_user_id_idx").on(table.userId),
}));

export const aiChains = pgTable("ai_chains", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  steps: jsonb("steps").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRun: timestamp("last_run"),
  status: text("status").notNull().default("idle"),
  lastResult: jsonb("last_result"),
}, (table) => ({
  userIdIdx: index("ai_chains_user_id_idx").on(table.userId),
}));

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("webhook_events_user_id_idx").on(table.userId),
}));

export const localizationRecommendations = pgTable("localization_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  recommendedLanguages: jsonb("recommended_languages").notNull(),
  trafficData: jsonb("traffic_data").notNull(),
  source: text("source").notNull().default("ai-audience-analyzer"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("localization_recommendations_user_id_idx").on(table.userId),
}));

// === AUTOPILOT SYSTEM TABLES ===

export const autopilotQueue = pgTable("autopilot_queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceVideoId: integer("source_video_id").references(() => videos.id),
  type: text("type").notNull(),
  targetPlatform: text("target_platform").notNull(),
  content: text("content").notNull(),
  caption: text("caption"),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  verificationStatus: text("verification_status").default("unverified"),
  verifiedAt: timestamp("verified_at"),
  metadata: jsonb("metadata").$type<{
    clipStart?: number;
    clipEnd?: number;
    hashtags?: string[];
    style?: string;
    isRecycled?: boolean;
    originalPostDate?: string;
    aiModel?: string;
    humanScore?: number;
    contentType?: string;
    sourceStreamId?: number;
    segmentStartMin?: number;
    segmentEndMin?: number;
    batchNumber?: number;
    crossPlatformGroupId?: string;
    crossLinkedPlatforms?: string[];
    publishResult?: {
      postId?: string;
      postUrl?: string;
      publishedAt?: string;
    };
    verification?: {
      attempts: number;
      lastAttempt: string;
      platformConfirmed: boolean;
      platformStatus?: string;
      platformUrl?: string;
      error?: string;
    };
    deliveryType?: string;
    isVideoDelivery?: boolean;
    retryCount?: number;
  }>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("autopilot_queue_user_id_idx").on(table.userId),
  statusIdx: index("autopilot_queue_status_idx").on(table.status),
}));

export const commentResponses = pgTable("comment_responses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  platform: text("platform").notNull().default("youtube"),
  originalComment: text("original_comment").notNull(),
  originalAuthor: text("original_author").notNull(),
  aiResponse: text("ai_response").notNull(),
  status: text("status").notNull().default("pending"),
  sentiment: text("sentiment"),
  priority: text("priority").default("normal"),
  publishedAt: timestamp("published_at"),
  metadata: jsonb("metadata").$type<{
    commentId?: string;
    likeCount?: number;
    isQuestion?: boolean;
    tone?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("comment_responses_user_id_idx").on(table.userId),
}));

export const autopilotConfig = pgTable("autopilot_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  feature: text("feature").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  settings: jsonb("settings").$type<{
    autoApprove?: boolean;
    maxPostsPerDay?: number;
    minHoursBetweenPosts?: number;
    postingHoursStart?: number;
    postingHoursEnd?: number;
    platforms?: string[];
    recycleAfterDays?: number;
    commentApprovalMode?: "auto" | "queue";
    discordWebhookUrl?: string;
    discordChannelId?: string;
    toneStyle?: string;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("autopilot_config_user_id_idx").on(table.userId),
  featureIdx: index("autopilot_config_feature_idx").on(table.feature),
}));

export const liveChatMessages = pgTable("live_chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  streamId: integer("stream_id").references(() => streams.id),
  platform: text("platform").notNull(),
  author: text("author").notNull(),
  authorId: text("author_id"),
  message: text("message").notNull(),
  isAiResponse: boolean("is_ai_response").default(false),
  aiResponseTo: integer("ai_response_to"),
  sentiment: text("sentiment"),
  priority: text("priority").default("normal"),
  metadata: jsonb("metadata").$type<{
    badges?: string[];
    isSubscriber?: boolean;
    isModerator?: boolean;
    isDonation?: boolean;
    donationAmount?: number;
    responseDelay?: number;
    typingDelay?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("live_chat_user_id_idx").on(table.userId),
  streamIdIdx: index("live_chat_stream_id_idx").on(table.streamId),
}));

export const insertLiveChatMessageSchema = createInsertSchema(liveChatMessages).omit({ id: true, createdAt: true });
export type LiveChatMessage = typeof liveChatMessages.$inferSelect;
export type InsertLiveChatMessage = z.infer<typeof insertLiveChatMessageSchema>;

export const platformGrowthPrograms = pgTable("platform_growth_programs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform").notNull(),
  programName: text("program_name").notNull(),
  programType: text("program_type").notNull(),
  status: text("status").default("not_started"),
  eligibilityMet: boolean("eligibility_met").default(false),
  requirements: jsonb("requirements").$type<{
    metric: string;
    current: number;
    target: number;
    met: boolean;
  }[]>(),
  benefits: text("benefits").array(),
  applicationUrl: text("application_url"),
  aiRecommendations: jsonb("ai_recommendations").$type<{
    strategy: string;
    priority: string;
    estimatedTimeToEligible: string;
    actionItems: string[];
  }>(),
  progress: integer("progress").default(0),
  autoApplyEnabled: boolean("auto_apply_enabled").default(false),
  applicationStatus: text("application_status").default("not_applied"),
  notifiedAt: timestamp("notified_at"),
  applicationGuide: jsonb("application_guide").$type<{
    steps: string[];
    tips: string[];
    estimatedTime: string;
    whatToSay: string;
  }>(),
  monetizationActive: boolean("monetization_active").default(false),
  complianceStatus: text("compliance_status").default("not_applicable"),
  complianceRisks: jsonb("compliance_risks").$type<{
    risk: string;
    severity: string;
    recommendation: string;
  }[]>(),
  lastComplianceCheck: timestamp("last_compliance_check"),
  lastChecked: timestamp("last_checked").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("growth_programs_user_id_idx").on(table.userId),
  platformIdx: index("growth_programs_platform_idx").on(table.platform),
}));

export const insertPlatformGrowthProgramSchema = createInsertSchema(platformGrowthPrograms).omit({ id: true, createdAt: true, lastChecked: true });
export type PlatformGrowthProgram = typeof platformGrowthPrograms.$inferSelect;
export type InsertPlatformGrowthProgram = z.infer<typeof insertPlatformGrowthProgramSchema>;

export const insertAutopilotQueueSchema = createInsertSchema(autopilotQueue).omit({ id: true, createdAt: true, publishedAt: true, errorMessage: true });
export const insertCommentResponseSchema = createInsertSchema(commentResponses).omit({ id: true, createdAt: true, publishedAt: true });
export const insertAutopilotConfigSchema = createInsertSchema(autopilotConfig).omit({ id: true, createdAt: true, updatedAt: true });

export type AutopilotQueueItem = typeof autopilotQueue.$inferSelect;
export type InsertAutopilotQueueItem = z.infer<typeof insertAutopilotQueueSchema>;
export type CommentResponse = typeof commentResponses.$inferSelect;
export type InsertCommentResponse = z.infer<typeof insertCommentResponseSchema>;
export type AutopilotConfigRecord = typeof autopilotConfig.$inferSelect;
export type InsertAutopilotConfig = z.infer<typeof insertAutopilotConfigSchema>;

export const insertAiResultSchema = createInsertSchema(aiResults).omit({ id: true, createdAt: true });
export const insertCronJobSchema = createInsertSchema(cronJobs).omit({ id: true });
export const insertAiChainSchema = createInsertSchema(aiChains).omit({ id: true });
export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({ id: true, createdAt: true });
export const insertLocalizationRecommendationSchema = createInsertSchema(localizationRecommendations).omit({ id: true, updatedAt: true });

export type AiResult = typeof aiResults.$inferSelect;
export type InsertAiResult = z.infer<typeof insertAiResultSchema>;
export type CronJob = typeof cronJobs.$inferSelect;
export type InsertCronJob = z.infer<typeof insertCronJobSchema>;
export type AiChain = typeof aiChains.$inferSelect;
export type InsertAiChain = z.infer<typeof insertAiChainSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type LocalizationRecommendation = typeof localizationRecommendations.$inferSelect;
export type InsertLocalizationRecommendation = z.infer<typeof insertLocalizationRecommendationSchema>;

export const PIPELINE_STEPS = [
  { id: "analyze", label: "Analyze Content", description: "AI scans video for key moments, topics, and highlights" },
  { id: "title", label: "Optimize Title", description: "Generate click-worthy titles with hooks and keywords" },
  { id: "description", label: "Write Description", description: "SEO-optimized description with timestamps and links" },
  { id: "tags", label: "Generate Tags", description: "Research and add high-performing tags and hashtags" },
  { id: "thumbnail", label: "Thumbnail Ideas", description: "AI suggests thumbnail concepts that drive clicks" },
  { id: "clips", label: "Extract Clips", description: "Find best moments for TikTok, Shorts, and Reels" },
  { id: "repurpose", label: "Repurpose Content", description: "Create unique posts for each platform" },
  { id: "schedule", label: "Schedule Posts", description: "Queue posts at peak hours with human-like timing" },
] as const;

export const contentPipeline = pgTable("content_pipeline", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  videoTitle: text("video_title").notNull(),
  source: text("source").notNull().default("vod"),
  mode: text("mode").notNull().default("vod"),
  currentStep: text("current_step").notNull().default("analyze"),
  status: text("status").notNull().default("queued"),
  completedSteps: text("completed_steps").array().notNull().default([]),
  stepResults: jsonb("step_results").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_pipeline_user_id_idx").on(table.userId),
  statusIdx: index("content_pipeline_status_idx").on(table.status),
}));

export const insertContentPipelineSchema = createInsertSchema(contentPipeline).omit({ id: true, createdAt: true });
export type ContentPipeline = typeof contentPipeline.$inferSelect;
export type InsertContentPipeline = z.infer<typeof insertContentPipelineSchema>;

export const contentKanban = pgTable("content_kanban", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  stage: text("stage").notNull().default("idea"),
  priority: text("priority").default("medium"),
  assignedTo: text("assigned_to"),
  platform: text("platform"),
  videoId: integer("video_id").references(() => videos.id),
  dueDate: timestamp("due_date"),
  metadata: jsonb("metadata").$type<{
    thumbnailDone?: boolean;
    scriptDone?: boolean;
    filmingDone?: boolean;
    editingDone?: boolean;
    tags?: string[];
    estimatedLength?: string;
    notes?: string;
  }>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("content_kanban_user_id_idx").on(table.userId),
}));

export const streamHighlights = pgTable("stream_highlights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id").references(() => streams.id),
  title: text("title"),
  timestampStart: real("timestamp_start"),
  timestampEnd: real("timestamp_end"),
  triggerType: text("trigger_type").default("chat_spike"),
  chatRate: real("chat_rate"),
  viewerCount: integer("viewer_count"),
  clipUrl: text("clip_url"),
  status: text("status").default("detected"),
  metadata: jsonb("metadata").$type<{
    topEmotes?: string[];
    sentiment?: string;
    suggestedTitle?: string;
    platforms?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("stream_highlights_user_id_idx").on(table.userId),
}));

export const communityGiveaways = pgTable("community_giveaways", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  prize: text("prize").notNull(),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  entryMethod: text("entry_method").default("comment"),
  status: text("status").default("draft"),
  maxEntries: integer("max_entries"),
  currentEntries: integer("current_entries").default(0),
  winnerId: text("winner_id"),
  winnerName: text("winner_name"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("community_giveaways_user_id_idx").on(table.userId),
}));

export const loyaltyPoints = pgTable("loyalty_points", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  fanIdentifier: text("fan_identifier").notNull(),
  platform: text("platform"),
  points: integer("points").default(0),
  level: text("level").default("bronze"),
  actions: jsonb("actions").$type<{
    action: string;
    points: number;
    date: string;
  }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("loyalty_points_user_id_idx").on(table.userId),
}));

export const communityPolls = pgTable("community_polls", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  question: text("question").notNull(),
  options: jsonb("options").$type<{
    text: string;
    votes: number;
  }[]>().default([]),
  platform: text("platform"),
  status: text("status").default("draft"),
  totalVotes: integer("total_votes").default(0),
  publishedAt: timestamp("published_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("community_polls_user_id_idx").on(table.userId),
}));

export const communityChallenges = pgTable("community_challenges", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").default("content"),
  prize: text("prize"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  status: text("status").default("draft"),
  participantCount: integer("participant_count").default(0),
  submissionCount: integer("submission_count").default(0),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("community_challenges_user_id_idx").on(table.userId),
}));

export const seoScores = pgTable("seo_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  overallScore: integer("overall_score"),
  titleScore: integer("title_score"),
  descriptionScore: integer("description_score"),
  tagScore: integer("tag_score"),
  thumbnailScore: integer("thumbnail_score"),
  suggestions: jsonb("suggestions").$type<{
    category: string;
    issue: string;
    fix: string;
    impact: string;
  }[]>(),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("seo_scores_user_id_idx").on(table.userId),
}));

export const searchRankings = pgTable("search_rankings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  keyword: text("keyword").notNull(),
  platform: text("platform").default("youtube"),
  currentRank: integer("current_rank"),
  previousRank: integer("previous_rank"),
  searchVolume: integer("search_volume"),
  competition: text("competition"),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("search_rankings_user_id_idx").on(table.userId),
}));

export const moderationActions = pgTable("moderation_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  actionType: text("action_type").notNull(),
  targetUser: text("target_user"),
  reason: text("reason"),
  content: text("content"),
  isAutomatic: boolean("is_automatic").default(false),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("moderation_actions_user_id_idx").on(table.userId),
}));

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  highContrastMode: boolean("high_contrast_mode").default(false),
  dyslexiaFont: boolean("dyslexia_font").default(false),
  reducedMotion: boolean("reduced_motion").default(false),
  fontSize: text("font_size").default("normal"),
  keyboardShortcuts: jsonb("keyboard_shortcuts").$type<Record<string, string>>(),
  voiceNavEnabled: boolean("voice_nav_enabled").default(false),
  language: text("language").default("en"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_preferences_user_id_idx").on(table.userId),
}));

export const editingNotes = pgTable("editing_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  timestamp: real("timestamp"),
  note: text("note").notNull(),
  category: text("category").default("general"),
  resolved: boolean("resolved").default(false),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("editing_notes_user_id_idx").on(table.userId),
}));

export const uploadQueue = pgTable("upload_queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  platform: text("platform").notNull(),
  status: text("status").default("queued"),
  scheduledAt: timestamp("scheduled_at"),
  uploadedAt: timestamp("uploaded_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<{
    title?: string;
    description?: string;
    tags?: string[];
    privacy?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("upload_queue_user_id_idx").on(table.userId),
}));

export const insertContentKanbanSchema = createInsertSchema(contentKanban).omit({ id: true, createdAt: true, completedAt: true });
export const insertStreamHighlightSchema = createInsertSchema(streamHighlights).omit({ id: true, createdAt: true });
export const insertCommunityGiveawaySchema = createInsertSchema(communityGiveaways).omit({ id: true, createdAt: true });
export const insertLoyaltyPointSchema = createInsertSchema(loyaltyPoints).omit({ id: true, createdAt: true });
export const insertCommunityPollSchema = createInsertSchema(communityPolls).omit({ id: true, createdAt: true });
export const insertCommunityChallengeSchema = createInsertSchema(communityChallenges).omit({ id: true, createdAt: true });
export const insertSeoScoreSchema = createInsertSchema(seoScores).omit({ id: true, createdAt: true });
export const insertSearchRankingSchema = createInsertSchema(searchRankings).omit({ id: true, createdAt: true });
export const insertModerationActionSchema = createInsertSchema(moderationActions).omit({ id: true, createdAt: true });
export const insertUserPreferenceSchema = createInsertSchema(userPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEditingNoteSchema = createInsertSchema(editingNotes).omit({ id: true, createdAt: true });
export const insertUploadQueueSchema = createInsertSchema(uploadQueue).omit({ id: true, createdAt: true });

export type ContentKanbanItem = typeof contentKanban.$inferSelect;
export type StreamHighlight = typeof streamHighlights.$inferSelect;
export type CommunityGiveaway = typeof communityGiveaways.$inferSelect;
export type LoyaltyPointRecord = typeof loyaltyPoints.$inferSelect;
export type CommunityPoll = typeof communityPolls.$inferSelect;
export type CommunityChallenge = typeof communityChallenges.$inferSelect;
export type SeoScore = typeof seoScores.$inferSelect;
export type SearchRanking = typeof searchRankings.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type UserPreference = typeof userPreferences.$inferSelect;
export type EditingNote = typeof editingNotes.$inferSelect;
export type UploadQueueItem = typeof uploadQueue.$inferSelect;

export type InsertContentKanban = z.infer<typeof insertContentKanbanSchema>;
export type InsertStreamHighlight = z.infer<typeof insertStreamHighlightSchema>;
export type InsertCommunityGiveaway = z.infer<typeof insertCommunityGiveawaySchema>;
export type InsertLoyaltyPoint = z.infer<typeof insertLoyaltyPointSchema>;
export type InsertCommunityPoll = z.infer<typeof insertCommunityPollSchema>;
export type InsertCommunityChallenge = z.infer<typeof insertCommunityChallengeSchema>;
export type InsertSeoScore = z.infer<typeof insertSeoScoreSchema>;
export type InsertSearchRanking = z.infer<typeof insertSearchRankingSchema>;
export type InsertModerationAction = z.infer<typeof insertModerationActionSchema>;
export type InsertUserPreference = z.infer<typeof insertUserPreferenceSchema>;
export type InsertEditingNote = z.infer<typeof insertEditingNoteSchema>;
export type InsertUploadQueue = z.infer<typeof insertUploadQueueSchema>;

export const KANBAN_STAGES = ["idea", "script", "filming", "editing", "review", "scheduled", "published"] as const;
export type KanbanStage = typeof KANBAN_STAGES[number];

export const PIPELINE_PHASES = [
  { id: "intake", label: "INTAKE", color: "blue" },
  { id: "intelligence", label: "INTELLIGENCE", color: "purple" },
  { id: "content_ops", label: "CONTENT OPS", color: "cyan" },
  { id: "seo_growth", label: "SEO & GROWTH", color: "emerald" },
  { id: "distribution", label: "DISTRIBUTION", color: "amber" },
  { id: "audience", label: "AUDIENCE", color: "pink" },
  { id: "community", label: "COMMUNITY", color: "orange" },
  { id: "production", label: "PRODUCTION", color: "sky" },
  { id: "security", label: "SECURITY", color: "red" },
] as const;

export const LIVE_PIPELINE_STEPS = [
  { id: "detect", label: "Detect Stream", description: "Auto-detect live stream start/end", phase: "intake" },
  { id: "live_seo_boost", label: "Live SEO Boost", description: "Optimize title/tags/description on all platforms while live", phase: "intake" },
  { id: "live_thumbnail", label: "Live Thumbnail", description: "Generate & push optimized thumbnails to all live platforms", phase: "intake" },
  { id: "live_announce", label: "Go-Live Announce", description: "Auto-post 'I'm live!' — text alerts to X/Discord/Twitch, stream links to video platforms", phase: "intake" },
  { id: "live_discovery_tags", label: "Discovery Tags", description: "Push trending tags & hashtags to all live platforms in real-time", phase: "intake" },
  { id: "analyze", label: "Analyze Stream", description: "AI deep-scan content, highlights, key moments", phase: "intake" },
  { id: "chat_sentiment", label: "Chat Sentiment", description: "Real-time chat mood & toxicity scan", phase: "intake" },
  { id: "highlights", label: "Extract Highlights", description: "AI marks peak moments, kills, clutches", phase: "intake" },
  { id: "trend_detect", label: "Trend Detect", description: "Match stream to trending topics & games", phase: "intelligence" },
  { id: "niche_analyze", label: "Niche Scan", description: "Competitive niche positioning analysis", phase: "intelligence" },
  { id: "content_dna", label: "Content DNA", description: "Extract unique style fingerprint", phase: "intelligence" },
  { id: "competitor_dive", label: "Competitor Dive", description: "Deep competitor gap & opportunity scan", phase: "intelligence" },
  { id: "viral_predict", label: "Viral Predictor", description: "Score viral potential of stream moments", phase: "intelligence" },
  { id: "audience_psycho", label: "Audience Psych", description: "Psychographic profiling of viewers", phase: "intelligence" },
  { id: "title", label: "Optimize Titles", description: "Generate click-worthy replay/clip titles", phase: "content_ops" },
  { id: "title_ab", label: "Title A/B Test", description: "Split-test title variations for CTR", phase: "content_ops" },
  { id: "hook_gen", label: "Hook Generator", description: "First-3-second hooks for every clip", phase: "content_ops" },
  { id: "description", label: "Write Description", description: "SEO-optimized description with timestamps", phase: "content_ops" },
  { id: "tags", label: "Generate Tags", description: "Platform-specific tags & hashtags", phase: "content_ops" },
  { id: "hashtag_strat", label: "Hashtag Strategy", description: "Cross-platform hashtag optimization", phase: "content_ops" },
  { id: "caption_gen", label: "Caption Generator", description: "Auto-captions & subtitle generation", phase: "content_ops" },
  { id: "thumbnail", label: "Thumbnail Ideas", description: "AI thumbnail concepts for replay/clips", phase: "content_ops" },
  { id: "thumb_ab", label: "Thumbnail A/B", description: "A/B test thumbnail variations", phase: "content_ops" },
  { id: "retention_hooks", label: "Retention Hooks", description: "Insert re-engagement hooks at predicted drop-off points", phase: "content_ops" },
  { id: "retention_beats_scan", label: "Retention Beats", description: "Apply learned retention patterns from MrBeast & Fat Electrician — hooks, payoffs, curiosity loops", phase: "content_ops" },
  { id: "pattern_interrupts", label: "Pattern Interrupts", description: "Plan visual/audio/pacing changes to reset viewer attention", phase: "content_ops" },
  { id: "engagement_inserts", label: "Engage Inserts", description: "On-screen polls, questions, teasers, CTAs at key moments", phase: "content_ops" },
  { id: "pacing_optimizer", label: "Pacing Optimizer", description: "Analyze & restructure pacing for maximum watch-through", phase: "content_ops" },
  { id: "seo_audit", label: "SEO Audit", description: "Full SEO score & keyword analysis", phase: "seo_growth" },
  { id: "seo_keywords", label: "Keyword Track", description: "Track search rankings for target keywords", phase: "seo_growth" },
  { id: "seo_opportunities", label: "SEO Gaps", description: "Find untapped keyword opportunities", phase: "seo_growth" },
  { id: "retention_analyze", label: "Retention Scan", description: "Predict audience retention curve", phase: "seo_growth" },
  { id: "end_screen", label: "End Screen", description: "Optimize end screen elements & CTAs", phase: "seo_growth" },
  { id: "playlist_opt", label: "Playlist Optimize", description: "Assign to optimal playlist position", phase: "seo_growth" },
  { id: "clips", label: "Extract Clips", description: "AI identifies best moments for clips", phase: "distribution" },
  { id: "cut_vods", label: "Cut VODs", description: "Auto-cut into audience-optimized lengths", phase: "distribution" },
  { id: "shorts_strat", label: "Shorts Strategy", description: "Generate Shorts/TikTok cut plan", phase: "distribution" },
  { id: "repurpose", label: "Repurpose", description: "Video clips → YouTube/TikTok, text posts → X/Discord — platform-matched content", phase: "distribution" },
  { id: "community_post", label: "Community Post", description: "Text announcements to Discord/X, video highlights to TikTok/YouTube", phase: "distribution" },
  { id: "collab_pitch", label: "Collab Pitch", description: "Draft collaboration outreach messages", phase: "distribution" },
  { id: "upload_time", label: "Upload Time", description: "Calculate optimal upload time per platform based on audience activity", phase: "distribution" },
  { id: "schedule", label: "Schedule & Post", description: "Queue videos to video platforms, text to text platforms at peak hours", phase: "distribution" },
  { id: "overlay_gen", label: "Overlay Gen", description: "Generate stream overlay alerts & graphics", phase: "distribution" },
  { id: "raid_plan", label: "Raid Plan", description: "Auto-plan raid targets for network growth", phase: "distribution" },
  { id: "audience_heatmap", label: "Audience Heat", description: "Watch-time heatmap analysis", phase: "audience" },
  { id: "audience_segments", label: "Segments", description: "Cluster viewers into behavioral segments", phase: "audience" },
  { id: "audience_sentiment", label: "Sentiment", description: "Overall audience sentiment scoring", phase: "audience" },
  { id: "audience_retention", label: "Retention", description: "Viewer retention & rewatch patterns", phase: "audience" },
  { id: "audience_growth", label: "Growth Forecast", description: "30/60/90-day subscriber projections", phase: "audience" },
  { id: "audience_churn", label: "Churn Risk", description: "Identify at-risk subscriber segments", phase: "audience" },
  { id: "audience_geo", label: "Geo Dist", description: "Geographic viewer distribution map", phase: "audience" },
  { id: "audience_devices", label: "Devices", description: "Device & platform breakdown", phase: "audience" },
  { id: "audience_engage", label: "Engage Score", description: "Per-viewer engagement scoring", phase: "audience" },
  { id: "community_polls", label: "Poll Launch", description: "Auto-generate community polls", phase: "community" },
  { id: "community_challenge", label: "Challenge", description: "Create viewer participation challenges", phase: "community" },
  { id: "community_giveaway", label: "Giveaway", description: "Setup & execute giveaway campaigns", phase: "community" },
  { id: "community_loyalty", label: "Loyalty Points", description: "Award loyalty points to active viewers", phase: "community" },
  { id: "community_mod", label: "Moderation", description: "AI content moderation scan", phase: "community" },
  { id: "community_feedback", label: "Feedback", description: "Collect & analyze viewer feedback", phase: "community" },
  { id: "prod_kanban", label: "Kanban Update", description: "Move content through production pipeline", phase: "production" },
  { id: "prod_upload_queue", label: "Upload Queue", description: "Queue files for multi-platform upload", phase: "production" },
  { id: "prod_editing_notes", label: "Edit Notes", description: "Generate AI editing notes & markers", phase: "production" },
  { id: "content_audit", label: "Content Audit", description: "Full channel content health check", phase: "production" },
  { id: "security_audit", label: "Security Audit", description: "Access log & session security scan", phase: "security" },
  { id: "security_backup", label: "Content Backup", description: "Verify content backup status", phase: "security" },
  { id: "security_alerts", label: "Alert Check", description: "Check for security alerts & anomalies", phase: "security" },
] as const;

export const VOD_PIPELINE_STEPS = [
  { id: "ingest", label: "Ingest Video", description: "Import video & extract metadata", phase: "intake" },
  { id: "analyze", label: "Analyze Content", description: "AI deep-scan for key moments & topics", phase: "intake" },
  { id: "retention_analyze", label: "Retention Scan", description: "Predict audience retention curve", phase: "intake" },
  { id: "trend_detect", label: "Trend Detect", description: "Match content to trending topics", phase: "intelligence" },
  { id: "niche_analyze", label: "Niche Scan", description: "Competitive niche positioning analysis", phase: "intelligence" },
  { id: "content_dna", label: "Content DNA", description: "Extract unique style fingerprint", phase: "intelligence" },
  { id: "competitor_dive", label: "Competitor Dive", description: "Deep competitor gap & opportunity scan", phase: "intelligence" },
  { id: "viral_predict", label: "Viral Predictor", description: "Score viral potential of video", phase: "intelligence" },
  { id: "audience_psycho", label: "Audience Psych", description: "Psychographic viewer profiling", phase: "intelligence" },
  { id: "title", label: "Optimize Title", description: "Generate click-worthy title variations", phase: "content_ops" },
  { id: "title_ab", label: "Title A/B Test", description: "Split-test title variations for CTR", phase: "content_ops" },
  { id: "hook_gen", label: "Hook Generator", description: "First-3-second hook options", phase: "content_ops" },
  { id: "description", label: "Write Description", description: "SEO-optimized description", phase: "content_ops" },
  { id: "tags", label: "Generate Tags", description: "Research & add high-performing tags", phase: "content_ops" },
  { id: "hashtag_strat", label: "Hashtag Strategy", description: "Cross-platform hashtag optimization", phase: "content_ops" },
  { id: "caption_gen", label: "Caption Generator", description: "Auto-captions & subtitle generation", phase: "content_ops" },
  { id: "thumbnail", label: "Thumbnail Ideas", description: "AI thumbnail concepts", phase: "content_ops" },
  { id: "thumb_ab", label: "Thumbnail A/B", description: "A/B test thumbnail variations", phase: "content_ops" },
  { id: "retention_hooks", label: "Retention Hooks", description: "Insert re-engagement hooks at predicted drop-off points", phase: "content_ops" },
  { id: "retention_beats_scan", label: "Retention Beats", description: "Apply learned retention patterns from MrBeast & Fat Electrician — hooks, payoffs, curiosity loops", phase: "content_ops" },
  { id: "pattern_interrupts", label: "Pattern Interrupts", description: "Plan visual/audio/pacing changes to reset viewer attention", phase: "content_ops" },
  { id: "engagement_inserts", label: "Engage Inserts", description: "On-screen polls, questions, teasers, CTAs at key moments", phase: "content_ops" },
  { id: "pacing_optimizer", label: "Pacing Optimizer", description: "Analyze & restructure pacing for maximum watch-through", phase: "content_ops" },
  { id: "seo_audit", label: "SEO Audit", description: "Full SEO score & keyword analysis", phase: "seo_growth" },
  { id: "seo_keywords", label: "Keyword Track", description: "Track search rankings for target keywords", phase: "seo_growth" },
  { id: "seo_opportunities", label: "SEO Gaps", description: "Find untapped keyword opportunities", phase: "seo_growth" },
  { id: "end_screen", label: "End Screen", description: "Optimize end screen elements & CTAs", phase: "seo_growth" },
  { id: "playlist_opt", label: "Playlist Optimize", description: "Assign to optimal playlist position", phase: "seo_growth" },
  { id: "clips", label: "Extract Clips", description: "Find best moments → video clips for YouTube/TikTok", phase: "distribution" },
  { id: "shorts_strat", label: "Shorts Strategy", description: "Generate Shorts/TikTok vertical video cut plan", phase: "distribution" },
  { id: "repurpose", label: "Repurpose", description: "Video clips → YouTube/TikTok, text posts → X/Discord — platform-matched content", phase: "distribution" },
  { id: "community_post", label: "Community Post", description: "Text announcements to Discord/X, video highlights to TikTok/YouTube", phase: "distribution" },
  { id: "collab_pitch", label: "Collab Pitch", description: "Draft collaboration outreach messages", phase: "distribution" },
  { id: "upload_time", label: "Upload Time", description: "Calculate optimal upload time per platform based on audience activity", phase: "distribution" },
  { id: "schedule", label: "Schedule & Post", description: "Queue videos to video platforms, text to text platforms at peak hours", phase: "distribution" },
  { id: "audience_heatmap", label: "Audience Heat", description: "Watch-time heatmap analysis", phase: "audience" },
  { id: "audience_segments", label: "Segments", description: "Cluster viewers into behavioral segments", phase: "audience" },
  { id: "audience_sentiment", label: "Sentiment", description: "Overall audience sentiment scoring", phase: "audience" },
  { id: "audience_retention", label: "Retention", description: "Viewer retention & rewatch patterns", phase: "audience" },
  { id: "audience_growth", label: "Growth Forecast", description: "30/60/90-day subscriber projections", phase: "audience" },
  { id: "audience_churn", label: "Churn Risk", description: "Identify at-risk subscriber segments", phase: "audience" },
  { id: "audience_geo", label: "Geo Dist", description: "Geographic viewer distribution map", phase: "audience" },
  { id: "audience_devices", label: "Devices", description: "Device & platform breakdown", phase: "audience" },
  { id: "audience_engage", label: "Engage Score", description: "Per-viewer engagement scoring", phase: "audience" },
  { id: "community_polls", label: "Poll Launch", description: "Auto-generate community polls", phase: "community" },
  { id: "community_challenge", label: "Challenge", description: "Create viewer participation challenges", phase: "community" },
  { id: "community_giveaway", label: "Giveaway", description: "Setup & execute giveaway campaigns", phase: "community" },
  { id: "community_loyalty", label: "Loyalty Points", description: "Award loyalty points to active viewers", phase: "community" },
  { id: "community_mod", label: "Moderation", description: "AI content moderation scan", phase: "community" },
  { id: "community_feedback", label: "Feedback", description: "Collect & analyze viewer feedback", phase: "community" },
  { id: "prod_kanban", label: "Kanban Update", description: "Move content through production pipeline", phase: "production" },
  { id: "prod_upload_queue", label: "Upload Queue", description: "Queue files for multi-platform upload", phase: "production" },
  { id: "prod_editing_notes", label: "Edit Notes", description: "Generate AI editing notes & markers", phase: "production" },
  { id: "content_audit", label: "Content Audit", description: "Full channel content health check", phase: "production" },
  { id: "security_audit", label: "Security Audit", description: "Access log & session security scan", phase: "security" },
  { id: "security_backup", label: "Content Backup", description: "Verify content backup status", phase: "security" },
  { id: "security_alerts", label: "Alert Check", description: "Check for security alerts & anomalies", phase: "security" },
] as const;

export const vodCuts = pgTable("vod_cuts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceStreamId: integer("source_stream_id").references(() => streams.id),
  sourceVideoId: integer("source_video_id").references(() => videos.id),
  pipelineId: integer("pipeline_id"),
  title: text("title").notNull(),
  targetLength: integer("target_length").notNull(),
  actualLength: integer("actual_length"),
  lengthCategory: text("length_category").notNull().default("medium"),
  startTimestamp: real("start_timestamp"),
  endTimestamp: real("end_timestamp"),
  isExperiment: boolean("is_experiment").default(false),
  experimentGroup: text("experiment_group"),
  status: text("status").notNull().default("pending"),
  platform: text("platform").default("youtube"),
  highlights: jsonb("highlights").$type<{
    type: string;
    timestamp: number;
    duration: number;
    score: number;
    description: string;
  }[]>(),
  performance: jsonb("performance").$type<{
    views?: number;
    likes?: number;
    comments?: number;
    watchTime?: number;
    avgPercentWatched?: number;
    ctr?: number;
    retentionDropoffs?: number[];
  }>(),
  aiSuggestion: jsonb("ai_suggestion").$type<{
    reasoning: string;
    confidenceScore: number;
    suggestedHooks: string[];
    cutPoints: { start: number; end: number; reason: string }[];
  }>(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("vod_cuts_user_id_idx").on(table.userId),
  statusIdx: index("vod_cuts_status_idx").on(table.status),
}));

export const lengthExperiments = pgTable("length_experiments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  experimentName: text("experiment_name").notNull(),
  status: text("status").notNull().default("running"),
  lengthsToTest: jsonb("lengths_to_test").$type<number[]>().notNull().default([]),
  completedLengths: jsonb("completed_lengths").$type<number[]>().default([]),
  results: jsonb("results").$type<{
    length: number;
    vodCutId: number;
    views: number;
    avgPercentWatched: number;
    engagement: number;
    score: number;
  }[]>().default([]),
  winningLength: integer("winning_length"),
  confidence: real("confidence"),
  contentCategory: text("content_category"),
  platform: text("platform").default("youtube"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("length_experiments_user_id_idx").on(table.userId),
}));

export const audienceLengthPreferences = pgTable("audience_length_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull().default("youtube"),
  contentCategory: text("content_category").notNull(),
  preferredMinLength: integer("preferred_min_length"),
  preferredMaxLength: integer("preferred_max_length"),
  optimalLength: integer("optimal_length"),
  sampleSize: integer("sample_size").default(0),
  confidence: real("confidence").default(0),
  dataSource: text("data_source").default("experiment"),
  lengthPerformance: jsonb("length_performance").$type<{
    length: number;
    avgViews: number;
    avgRetention: number;
    avgEngagement: number;
    sampleCount: number;
  }[]>().default([]),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("audience_length_prefs_user_id_idx").on(table.userId),
  categoryIdx: index("audience_length_prefs_category_idx").on(table.contentCategory),
}));

export const streamPipelines = pgTable("stream_pipelines", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id").references(() => streams.id),
  videoId: integer("video_id").references(() => videos.id),
  pipelineType: text("pipeline_type").notNull().default("live"),
  currentStep: text("current_step").notNull().default("detect"),
  status: text("status").notNull().default("queued"),
  completedSteps: text("completed_steps").array().notNull().default([]),
  stepResults: jsonb("step_results").$type<Record<string, any>>().default({}),
  vodCutIds: jsonb("vod_cut_ids").$type<number[]>().default([]),
  sourceTitle: text("source_title").notNull(),
  sourceDuration: integer("source_duration"),
  mode: text("mode").notNull().default("live"),
  autoProcess: boolean("auto_process").default(true),
  sourcePipelineId: integer("source_pipeline_id"),
  publishedContentType: text("published_content_type"),
  scheduledStartAt: timestamp("scheduled_start_at"),
  humanDelayMinutes: integer("human_delay_minutes"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("stream_pipelines_user_id_idx").on(table.userId),
  statusIdx: index("stream_pipelines_status_idx").on(table.status),
  typeIdx: index("stream_pipelines_type_idx").on(table.pipelineType),
}));

export const insertVodCutSchema = createInsertSchema(vodCuts).omit({ id: true, createdAt: true, publishedAt: true });
export const insertLengthExperimentSchema = createInsertSchema(lengthExperiments).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertAudienceLengthPreferenceSchema = createInsertSchema(audienceLengthPreferences).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertStreamPipelineSchema = createInsertSchema(streamPipelines).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });

export type VodCut = typeof vodCuts.$inferSelect;
export type LengthExperiment = typeof lengthExperiments.$inferSelect;
export type AudienceLengthPreference = typeof audienceLengthPreferences.$inferSelect;
export type StreamPipelineRecord = typeof streamPipelines.$inferSelect;

export type InsertVodCut = z.infer<typeof insertVodCutSchema>;
export type InsertLengthExperiment = z.infer<typeof insertLengthExperimentSchema>;
export type InsertAudienceLengthPreference = z.infer<typeof insertAudienceLengthPreferenceSchema>;
export type InsertStreamPipeline = z.infer<typeof insertStreamPipelineSchema>;

export const LENGTH_CATEGORIES = {
  micro: { min: 15, max: 60, label: "Micro (15-60s)", description: "Shorts, TikTok, Reels" },
  short: { min: 60, max: 300, label: "Short (1-5 min)", description: "Quick highlights, compilations" },
  medium: { min: 300, max: 900, label: "Medium (5-15 min)", description: "Edited highlights, best moments" },
  long: { min: 900, max: 1800, label: "Long (15-30 min)", description: "Extended highlights, gameplay sessions" },
  full: { min: 1800, max: 14400, label: "Full (30 min+)", description: "Full stream replay, uncut gameplay" },
} as const;
export type LengthCategory = keyof typeof LENGTH_CATEGORIES;

export const pipelineFailures = pgTable("pipeline_failures", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  pipelineId: integer("pipeline_id").notNull(),
  stepId: text("step_id").notNull(),
  errorMessage: text("error_message").notNull(),
  errorType: text("error_type").notNull().default("unknown"),
  diagnosis: jsonb("diagnosis").$type<Record<string, any>>(),
  retryStrategy: jsonb("retry_strategy").$type<Record<string, any>>(),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  status: text("status").notNull().default("failed"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  pipelineIdx: index("pipeline_failures_pipeline_idx").on(table.pipelineId),
  userIdx: index("pipeline_failures_user_idx").on(table.userId),
  statusIdx: index("pipeline_failures_status_idx").on(table.status),
}));

export const pipelineRoutingRules = pgTable("pipeline_routing_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentType: text("content_type").notNull(),
  platform: text("platform"),
  skipSteps: text("skip_steps").array().default([]),
  prioritySteps: text("priority_steps").array().default([]),
  customOrder: text("custom_order").array(),
  conditions: jsonb("conditions").$type<Record<string, any>>().default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("routing_rules_user_idx").on(table.userId),
}));

export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  pipelineId: integer("pipeline_id"),
  experimentType: text("experiment_type").notNull(),
  variants: jsonb("variants").$type<Record<string, any>[]>().default([]),
  winnerId: text("winner_id"),
  winnerMetrics: jsonb("winner_metrics").$type<Record<string, any>>(),
  status: text("status").notNull().default("running"),
  autoApply: boolean("auto_apply").default(true),
  learnings: jsonb("learnings").$type<Record<string, any>>(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdx: index("experiments_user_idx").on(table.userId),
  statusIdx: index("experiments_status_idx").on(table.status),
}));

export const predictiveTrends = pgTable("predictive_trends", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  platform: text("platform"),
  topic: text("topic").notNull(),
  category: text("category"),
  currentVolume: integer("current_volume"),
  predictedPeakVolume: integer("predicted_peak_volume"),
  predictedPeakAt: timestamp("predicted_peak_at"),
  confidence: real("confidence"),
  velocity: real("velocity"),
  status: text("status").notNull().default("rising"),
  signals: jsonb("signals").$type<Record<string, any>[]>().default([]),
  actionTaken: boolean("action_taken").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("predictive_trends_status_idx").on(table.status),
  topicIdx: index("predictive_trends_topic_idx").on(table.topic),
  userIdIdx: index("predictive_trends_user_id_idx").on(table.userId),
}));

export const creatorDnaProfiles = pgTable("creator_dna_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  styleVector: jsonb("style_vector").$type<Record<string, number>>().default({}),
  voicePatterns: jsonb("voice_patterns").$type<Record<string, any>>().default({}),
  humorProfile: jsonb("humor_profile").$type<Record<string, any>>().default({}),
  energyMap: jsonb("energy_map").$type<Record<string, any>>().default({}),
  editingStyle: jsonb("editing_style").$type<Record<string, any>>().default({}),
  catchphrases: text("catchphrases").array().default([]),
  bannedPhrases: text("banned_phrases").array().default([]),
  contentThemes: jsonb("content_themes").$type<Record<string, any>[]>().default([]),
  sampleCount: integer("sample_count").notNull().default(0),
  maturityScore: real("maturity_score").default(0),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("creator_dna_user_idx").on(table.userId),
}));

export const audiencePsychographics = pgTable("audience_psychographics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform"),
  segmentName: text("segment_name").notNull(),
  segmentSize: real("segment_size"),
  motivations: jsonb("motivations").$type<string[]>().default([]),
  values: jsonb("values_list").$type<string[]>().default([]),
  painPoints: jsonb("pain_points").$type<string[]>().default([]),
  contentPrefs: jsonb("content_prefs").$type<Record<string, any>>().default({}),
  watchPatterns: jsonb("watch_patterns").$type<Record<string, any>>().default({}),
  engagementDrivers: jsonb("engagement_drivers").$type<string[]>().default([]),
  churnRisk: real("churn_risk"),
  lifetime_value: real("lifetime_value"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("audience_psych_user_idx").on(table.userId),
}));

export const liveCopilotSuggestions = pgTable("live_copilot_suggestions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id"),
  suggestionType: text("suggestion_type").notNull(),
  content: text("content").notNull(),
  context: jsonb("context").$type<Record<string, any>>().default({}),
  priority: text("priority").notNull().default("medium"),
  wasUsed: boolean("was_used").default(false),
  impactScore: real("impact_score"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("copilot_user_idx").on(table.userId),
  streamIdx: index("copilot_stream_idx").on(table.streamId),
}));

export const migrationCampaigns = pgTable("migration_campaigns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourcePlatform: text("source_platform").notNull(),
  targetPlatform: text("target_platform").notNull(),
  strategy: jsonb("strategy").$type<Record<string, any>>().default({}),
  funnelSteps: jsonb("funnel_steps").$type<Record<string, any>[]>().default([]),
  migratedCount: integer("migrated_count").default(0),
  conversionRate: real("conversion_rate"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("migration_user_idx").on(table.userId),
}));

export const collabCandidates = pgTable("collab_candidates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  candidateName: text("candidate_name").notNull(),
  platform: text("platform").notNull(),
  subscriberCount: text("subscriber_count"),
  audienceOverlap: real("audience_overlap"),
  compatibilityScore: real("compatibility_score"),
  suggestedFormats: jsonb("suggested_formats").$type<string[]>().default([]),
  outreachDraft: text("outreach_draft"),
  outreachStatus: text("outreach_status").default("pending"),
  responseReceived: boolean("response_received").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("collab_user_idx").on(table.userId),
}));

export const revenueModels = pgTable("revenue_models", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  modelType: text("model_type").notNull(),
  currentRate: real("current_rate"),
  suggestedRate: real("suggested_rate"),
  marketAverage: real("market_average"),
  rationale: text("rationale"),
  metrics: jsonb("metrics").$type<Record<string, any>>().default({}),
  lastOptimized: timestamp("last_optimized"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("revenue_models_user_idx").on(table.userId),
}));

export const compoundingJobs = pgTable("compounding_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id"),
  contentType: text("content_type"),
  refreshType: text("refresh_type").notNull(),
  originalMetrics: jsonb("original_metrics").$type<Record<string, any>>().default({}),
  newMetadata: jsonb("new_metadata").$type<Record<string, any>>(),
  trendMatch: text("trend_match"),
  boostScore: real("boost_score"),
  status: text("status").notNull().default("queued"),
  executedAt: timestamp("executed_at"),
  impactMetrics: jsonb("impact_metrics").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("compounding_user_idx").on(table.userId),
  statusIdx: index("compounding_status_idx").on(table.status),
}));

export const merchIdeas = pgTable("merch_ideas", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceContentId: integer("source_content_id"),
  ideaType: text("idea_type").notNull(),
  concept: text("concept").notNull(),
  catchphrase: text("catchphrase"),
  designBrief: jsonb("design_brief").$type<Record<string, any>>(),
  estimatedDemand: real("estimated_demand"),
  viralMomentTimestamp: integer("viral_moment_timestamp"),
  status: text("status").notNull().default("idea"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("merch_user_idx").on(table.userId),
}));

export const algorithmSignals = pgTable("algorithm_signals", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  signalType: text("signal_type").notNull(),
  description: text("description").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  severity: text("severity").notNull().default("info"),
  affectedMetrics: jsonb("affected_metrics").$type<string[]>().default([]),
  recommendedAction: text("recommended_action"),
  autoAdapted: boolean("auto_adapted").default(false),
  adaptationDetails: jsonb("adaptation_details").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  platformIdx: index("algo_signals_platform_idx").on(table.platform),
}));

export const reachAnomalies = pgTable("reach_anomalies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  expectedReach: real("expected_reach"),
  actualReach: real("actual_reach"),
  deviationPct: real("deviation_pct"),
  isShadowBan: boolean("is_shadow_ban").default(false),
  evidence: jsonb("evidence").$type<Record<string, any>>().default({}),
  recoveryPlan: jsonb("recovery_plan").$type<Record<string, any>>(),
  status: text("status").notNull().default("detected"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("reach_anomalies_user_idx").on(table.userId),
  platformIdx: index("reach_anomalies_platform_idx").on(table.platform),
}));

export const localizationJobs = pgTable("localization_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceContentId: integer("source_content_id"),
  targetLanguage: text("target_language").notNull(),
  targetRegion: text("target_region"),
  originalTitle: text("original_title"),
  localizedTitle: text("localized_title"),
  localizedDescription: text("localized_description"),
  culturalAdaptations: jsonb("cultural_adaptations").$type<Record<string, any>[]>().default([]),
  dubStatus: text("dub_status").default("pending"),
  subtitleStatus: text("subtitle_status").default("pending"),
  qualityScore: real("quality_score"),
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("localization_user_idx").on(table.userId),
}));

export const hiringRecommendations = pgTable("hiring_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  priority: text("priority").notNull().default("medium"),
  rationale: text("rationale").notNull(),
  estimatedCost: real("estimated_cost"),
  roiProjection: real("roi_projection"),
  workloadData: jsonb("workload_data").$type<Record<string, any>>().default({}),
  delegationTasks: jsonb("delegation_tasks").$type<string[]>().default([]),
  triggerMetric: text("trigger_metric"),
  triggerValue: real("trigger_value"),
  status: text("status").notNull().default("suggested"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("hiring_user_idx").on(table.userId),
}));

export type PipelineFailure = typeof pipelineFailures.$inferSelect;
export type PipelineRoutingRule = typeof pipelineRoutingRules.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type PredictiveTrend = typeof predictiveTrends.$inferSelect;
export type CreatorDnaProfile = typeof creatorDnaProfiles.$inferSelect;
export type AudiencePsychographic = typeof audiencePsychographics.$inferSelect;
export type LiveCopilotSuggestion = typeof liveCopilotSuggestions.$inferSelect;
export type MigrationCampaign = typeof migrationCampaigns.$inferSelect;
export type CollabCandidate = typeof collabCandidates.$inferSelect;
export type RevenueModel = typeof revenueModels.$inferSelect;
export type CompoundingJob = typeof compoundingJobs.$inferSelect;
export type MerchIdea = typeof merchIdeas.$inferSelect;
export type AlgorithmSignal = typeof algorithmSignals.$inferSelect;
export type ReachAnomaly = typeof reachAnomalies.$inferSelect;
export type LocalizationJob = typeof localizationJobs.$inferSelect;
export type HiringRecommendation = typeof hiringRecommendations.$inferSelect;

export const securityEvents = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  endpoint: text("endpoint"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  blocked: boolean("blocked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  typeIdx: index("security_events_type_idx").on(table.eventType),
  ipIdx: index("security_events_ip_idx").on(table.ipAddress),
  userIdx: index("security_events_user_idx").on(table.userId),
}));

export const securityRules = pgTable("security_rules", {
  id: serial("id").primaryKey(),
  ruleName: text("rule_name").notNull(),
  ruleType: text("rule_type").notNull(),
  pattern: text("pattern"),
  threshold: integer("threshold"),
  windowSeconds: integer("window_seconds"),
  action: text("action").notNull().default("block"),
  enabled: boolean("enabled").default(true),
  learnedFrom: text("learned_from"),
  confidence: real("confidence").default(1.0),
  triggeredCount: integer("triggered_count").default(0),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type SecurityRule = typeof securityRules.$inferSelect;

export const customerProfiles = pgTable("customer_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  signupMethod: text("signup_method").notNull().default("replit_auth"),
  signupSource: text("signup_source"),
  signupReferrer: text("signup_referrer"),
  signupIp: text("signup_ip"),
  signupUserAgent: text("signup_user_agent"),
  currentTier: text("current_tier").notNull().default("free"),
  tierHistory: jsonb("tier_history").$type<Array<{ tier: string; changedAt: string; reason?: string }>>().default([]),
  platformsConnected: text("platforms_connected").array().default([]),
  totalContentCreated: integer("total_content_created").default(0),
  totalStreams: integer("total_streams").default(0),
  totalAiRequests: integer("total_ai_requests").default(0),
  lastActiveAt: timestamp("last_active_at"),
  engagementScore: real("engagement_score").default(0),
  lifetimeRevenue: real("lifetime_revenue").default(0),
  churnRisk: real("churn_risk").default(0),
  tags: text("tags").array().default([]),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("customer_profiles_user_idx").on(table.userId),
  tierIdx: index("customer_profiles_tier_idx").on(table.currentTier),
}));

export type CustomerProfile = typeof customerProfiles.$inferSelect;

// === EMPIRE BUILDS ===
export const EMPIRE_BUILD_STAGES = [
  "queued",
  "creating_user",
  "building_blueprint",
  "auto_launching_content",
  "seeding_autopilot",
  "completed",
  "failed",
] as const;

export const empireBuilds = pgTable("empire_builds", {
  id: serial("id").primaryKey(),
  buildToken: text("build_token").notNull().unique(),
  email: text("email").notNull(),
  idea: text("idea").notNull(),
  userId: text("user_id"),
  stage: text("stage").notNull().default("queued"),
  progress: integer("progress").default(0),
  stageMessage: text("stage_message"),
  blueprintSummary: jsonb("blueprint_summary").$type<{
    niche?: string;
    brandName?: string;
    platforms?: string[];
    pillarsCount?: number;
    planDays?: number;
  }>(),
  videosLaunched: integer("videos_launched").default(0),
  autopilotSeeded: boolean("autopilot_seeded").default(false),
  failureReason: text("failure_reason"),
  failureSeverity: text("failure_severity"),
  notifiedAt: timestamp("notified_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenIdx: index("empire_builds_token_idx").on(table.buildToken),
  emailIdx: index("empire_builds_email_idx").on(table.email),
  userIdIdx: index("empire_builds_user_id_idx").on(table.userId),
}));

export const insertEmpireBuildSchema = createInsertSchema(empireBuilds).omit({ id: true, createdAt: true, completedAt: true, notifiedAt: true });
export type EmpireBuild = typeof empireBuilds.$inferSelect;
export type InsertEmpireBuild = z.infer<typeof insertEmpireBuildSchema>;

export const creatorSkillProgress = pgTable("creator_skill_progress", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videosCreated: integer("videos_created").default(0),
  skillLevel: integer("skill_level").default(1),
  skillLabel: text("skill_label").default("complete_beginner"),
  qualityMultiplier: real("quality_multiplier").default(0.15),
  strengths: jsonb("strengths").$type<string[]>().default([]),
  weaknesses: jsonb("weaknesses").$type<string[]>().default([]),
  lessonsLearned: jsonb("lessons_learned").$type<string[]>().default([]),
  youtubeResearchSeeded: boolean("youtube_research_seeded").default(false),
  lastVideoAt: timestamp("last_video_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("creator_skill_user_idx").on(table.userId),
}));

export type CreatorSkillProgress = typeof creatorSkillProgress.$inferSelect;

export const feedbackSubmissions = pgTable("feedback_submissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().default("improvement"),
  message: text("message").notNull(),
  category: text("category"),
  aiAnalysis: jsonb("ai_analysis").$type<{
    actionable: boolean;
    category: string;
    priority: string;
    suggestedTier: string;
    implementationPlan: string;
    similarIssueCount: number;
    autoResolvable: boolean;
    resolution?: string;
  }>(),
  status: text("status").notNull().default("pending"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  adminNotified: boolean("admin_notified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("feedback_user_idx").on(table.userId),
  statusIdx: index("feedback_status_idx").on(table.status),
  categoryIdx: index("feedback_category_idx").on(table.category),
}));

export const insertFeedbackSchema = createInsertSchema(feedbackSubmissions).omit({ id: true, createdAt: true, resolvedAt: true, adminNotified: true });
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hashedKey: text("hashed_key").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revoked: boolean("revoked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("api_keys_user_idx").on(table.userId),
  hashIdx: index("api_keys_hash_idx").on(table.hashedKey),
}));

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true, revoked: true });
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export const contentPredictions = pgTable("content_predictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  title: text("title").notNull(),
  platform: text("platform").notNull().default("youtube"),
  predictedViews: integer("predicted_views"),
  predictedLikes: integer("predicted_likes"),
  predictedComments: integer("predicted_comments"),
  engagementRate: real("engagement_rate"),
  confidence: real("confidence").default(0.7),
  factors: jsonb("factors").$type<{ strengths: string[]; weaknesses: string[]; suggestions: string[] }>().default({ strengths: [], weaknesses: [], suggestions: [] }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("content_predictions_user_idx").on(table.userId),
}));

export const insertContentPredictionSchema = createInsertSchema(contentPredictions).omit({ id: true, createdAt: true });
export type ContentPrediction = typeof contentPredictions.$inferSelect;
export type InsertContentPrediction = z.infer<typeof insertContentPredictionSchema>;

// === SECURITY FORTRESS TABLES ===
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(false),
  failureReason: text("failure_reason"),
  geoCountry: text("geo_country"),
  geoCity: text("geo_city"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ipIdx: index("login_attempts_ip_idx").on(table.ipAddress),
  userIdx: index("login_attempts_user_idx").on(table.userId),
  createdIdx: index("login_attempts_created_idx").on(table.createdAt),
}));

export type LoginAttempt = typeof loginAttempts.$inferSelect;

export const accountLockouts = pgTable("account_lockouts", {
  id: serial("id").primaryKey(),
  identifier: text("identifier").notNull(),
  lockType: text("lock_type").notNull().default("ip"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  permanent: boolean("permanent").default(false),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  identifierIdx: index("account_lockouts_identifier_idx").on(table.identifier),
}));

export type AccountLockout = typeof accountLockouts.$inferSelect;

export const ipReputations = pgTable("ip_reputations", {
  id: serial("id").primaryKey(),
  ipAddress: text("ip_address").notNull().unique(),
  reputationScore: real("reputation_score").notNull().default(100),
  totalRequests: integer("total_requests").default(0),
  blockedRequests: integer("blocked_requests").default(0),
  threatCategories: text("threat_categories").array().default([]),
  geoCountry: text("geo_country"),
  geoCity: text("geo_city"),
  isVpn: boolean("is_vpn").default(false),
  isTor: boolean("is_tor").default(false),
  isProxy: boolean("is_proxy").default(false),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
}, (table) => ({
  ipIdx: index("ip_reputations_ip_idx").on(table.ipAddress),
  scoreIdx: index("ip_reputations_score_idx").on(table.reputationScore),
}));

export type IpReputation = typeof ipReputations.$inferSelect;

export const threatPatterns = pgTable("threat_patterns", {
  id: serial("id").primaryKey(),
  patternName: text("pattern_name").notNull(),
  patternType: text("pattern_type").notNull(),
  signature: text("signature").notNull(),
  severity: text("severity").notNull().default("medium"),
  autoGenerated: boolean("auto_generated").default(false),
  hitCount: integer("hit_count").default(0),
  falsePositives: integer("false_positives").default(0),
  confidence: real("confidence").default(0.8),
  enabled: boolean("enabled").default(true),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("threat_patterns_type_idx").on(table.patternType),
}));

export type ThreatPattern = typeof threatPatterns.$inferSelect;

export const securityAlerts = pgTable("security_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("security_alerts_user_idx").on(table.userId),
  typeIdx: index("security_alerts_type_idx").on(table.alertType),
}));

export type SecurityAlert = typeof securityAlerts.$inferSelect;

// === AI COST TRACKING ===
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  model: text("model").notNull(),
  endpoint: text("endpoint").notNull(),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCost: real("estimated_cost").default(0),
  cached: boolean("cached").default(false),
  success: boolean("success").default(true),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("ai_usage_logs_user_idx").on(table.userId),
  createdIdx: index("ai_usage_logs_created_idx").on(table.createdAt),
}));

export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// === DEAD LETTER QUEUE ===
export const deadLetterQueue = pgTable("dead_letter_queue", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  error: text("error"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  status: text("status").notNull().default("pending"),
  userId: text("user_id"),
  priority: integer("priority").default(5),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  statusIdx: index("dlq_status_idx").on(table.status),
  userIdx: index("dlq_user_idx").on(table.userId),
  retryIdx: index("dlq_retry_idx").on(table.nextRetryAt),
}));

export type DeadLetterItem = typeof deadLetterQueue.$inferSelect;

// === NOTIFICATION PREFERENCES ===
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  emailEnabled: boolean("email_enabled").default(true),
  pushEnabled: boolean("push_enabled").default(true),
  smsEnabled: boolean("sms_enabled").default(false),
  discordWebhookUrl: text("discord_webhook_url"),
  quietHoursStart: integer("quiet_hours_start"),
  quietHoursEnd: integer("quiet_hours_end"),
  timezone: text("timezone").default("UTC"),
  digestFrequency: text("digest_frequency").default("none"),
  categories: jsonb("categories").$type<Record<string, boolean>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("notif_prefs_user_idx").on(table.userId),
}));

export type NotificationPreference = typeof notificationPreferences.$inferSelect;

// === FEATURE FLAGS ===
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  flagKey: text("flag_key").notNull().unique(),
  flagName: text("flag_name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(false),
  rolloutPercentage: integer("rollout_percentage").default(100),
  minTier: text("min_tier").default("free"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  keyIdx: index("feature_flags_key_idx").on(table.flagKey),
}));

export type FeatureFlag = typeof featureFlags.$inferSelect;

// === DATA RETENTION POLICIES ===
export const dataRetentionPolicies = pgTable("data_retention_policies", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull().unique(),
  retentionDays: integer("retention_days").notNull().default(365),
  enabled: boolean("enabled").default(true),
  lastPurgedAt: timestamp("last_purged_at"),
  rowsPurged: integer("rows_purged").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DataRetentionPolicy = typeof dataRetentionPolicies.$inferSelect;

// === AI SECURITY SCANS ===
export const securityScans = pgTable("security_scans", {
  id: serial("id").primaryKey(),
  scanType: text("scan_type").notNull(),
  status: text("status").notNull().default("running"),
  findings: jsonb("findings").$type<Array<{
    category: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    title: string;
    description: string;
    autoFixed: boolean;
    fixDescription?: string;
  }>>().default([]),
  summary: jsonb("summary").$type<{
    totalChecks: number;
    passed: number;
    failed: number;
    autoFixed: number;
    score: number;
  }>(),
  triggeredBy: text("triggered_by").notNull().default("automated"),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("security_scans_type_idx").on(table.scanType),
  index("security_scans_created_idx").on(table.createdAt),
])

export type SecurityScan = typeof securityScans.$inferSelect;

// === PILLAR 6: COMMUNITY & AUDIENCE ENGINE ===
// audienceSegments table already defined above (line ~734)

export const churnRiskScores = pgTable("churn_risk_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  segment: text("segment").notNull(),
  score: real("score").notNull().default(0),
  signals: jsonb("signals").$type<Record<string, any>>().default({}),
  lastComputedAt: timestamp("last_computed_at").defaultNow(),
}, (table) => [
  index("churn_risk_user_idx").on(table.userId),
]);

export type ChurnRiskScore = typeof churnRiskScores.$inferSelect;

export const reengagementCampaigns = pgTable("reengagement_campaigns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  segment: text("segment").notNull(),
  status: text("status").notNull().default("draft"),
  content: jsonb("content").$type<Record<string, any>>().default({}),
  scheduledAt: timestamp("scheduled_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("reengagement_user_idx").on(table.userId),
]);

export type ReengagementCampaign = typeof reengagementCampaigns.$inferSelect;

export const fanMilestones = pgTable("fan_milestones", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  milestoneType: text("milestone_type").notNull(),
  threshold: integer("threshold").notNull(),
  achievedAt: timestamp("achieved_at").defaultNow(),
  notified: boolean("notified").default(false),
}, (table) => [
  index("fan_milestones_user_idx").on(table.userId),
]);

export type FanMilestone = typeof fanMilestones.$inferSelect;

export const communityActions = pgTable("community_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("community_actions_user_idx").on(table.userId),
]);

export type CommunityAction = typeof communityActions.$inferSelect;

// === PILLAR 7: CREATOR EDUCATION & SKILL GROWTH ===
export const learningPaths = pgTable("learning_paths", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  targetLevel: integer("target_level").notNull().default(100),
  roadmap: jsonb("roadmap").$type<Array<{ step: number; title: string; description: string; completed: boolean }>>().default([]),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
}, (table) => [
  index("learning_paths_user_idx").on(table.userId),
]);

export type LearningPath = typeof learningPaths.$inferSelect;

export const coachingTips = pgTable("coaching_tips", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tipType: text("tip_type").notNull(),
  content: text("content").notNull(),
  sourceMetrics: jsonb("source_metrics").$type<Record<string, any>>().default({}),
  dismissed: boolean("dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("coaching_tips_user_idx").on(table.userId),
]);

export type CoachingTip = typeof coachingTips.$inferSelect;

export const creatorInsights = pgTable("creator_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  insightType: text("insight_type").notNull(),
  content: text("content").notNull(),
  comparedTo: jsonb("compared_to").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("creator_insights_user_idx").on(table.userId),
]);

export type CreatorInsight = typeof creatorInsights.$inferSelect;

export const skillMilestones = pgTable("skill_milestones", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  milestone: text("milestone").notNull(),
  category: text("category").notNull().default("general"),
  achievedAt: timestamp("achieved_at").defaultNow(),
  notified: boolean("notified").default(false),
}, (table) => [
  index("skill_milestones_user_idx").on(table.userId),
]);

export type SkillMilestone = typeof skillMilestones.$inferSelect;

// === PILLAR 8: BRAND & PARTNERSHIPS ===
export const sponsorshipScores = pgTable("sponsorship_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  score: real("score").notNull().default(0),
  signals: jsonb("signals").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sponsorship_scores_user_idx").on(table.userId),
]);

export type SponsorshipScore = typeof sponsorshipScores.$inferSelect;

export const mediaKits = pgTable("media_kits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  version: integer("version").notNull().default(1),
  content: jsonb("content").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => [
  index("media_kits_user_idx").on(table.userId),
]);

export type MediaKit = typeof mediaKits.$inferSelect;

export const brandDeals = pgTable("brand_deals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  brandName: text("brand_name").notNull(),
  status: text("status").notNull().default("prospect"),
  terms: jsonb("terms").$type<Record<string, any>>().default({}),
  value: real("value"),
  lastTouchedAt: timestamp("last_touched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("brand_deals_user_idx").on(table.userId),
]);

export type BrandDeal = typeof brandDeals.$inferSelect;

export const collabMatches = pgTable("collab_matches", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  matchUserId: text("match_user_id").notNull(),
  score: real("score").notNull().default(0),
  rationale: jsonb("rationale").$type<Record<string, any>>().default({}),
  status: text("status").notNull().default("suggested"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("collab_matches_user_idx").on(table.userId),
]);

export type CollabMatch = typeof collabMatches.$inferSelect;

export const brandSafetyChecks = pgTable("brand_safety_checks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("clean"),
  issues: jsonb("issues").$type<Array<{ type: string; severity: string; description: string }>>().default([]),
  scannedAt: timestamp("scanned_at").defaultNow(),
}, (table) => [
  index("brand_safety_user_idx").on(table.userId),
]);

export type BrandSafetyCheck = typeof brandSafetyChecks.$inferSelect;

// === PILLAR 9: ANALYTICS & INTELLIGENCE ===
export const unifiedMetrics = pgTable("unified_metrics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  metricKey: text("metric_key").notNull(),
  value: real("value").notNull().default(0),
  windowStart: timestamp("window_start"),
  windowEnd: timestamp("window_end"),
}, (table) => [
  index("unified_metrics_user_idx").on(table.userId),
  index("unified_metrics_key_idx").on(table.userId, table.metricKey),
]);

export type UnifiedMetric = typeof unifiedMetrics.$inferSelect;

export const trendForecasts = pgTable("trend_forecasts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  topic: text("topic").notNull(),
  forecast: jsonb("forecast").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => [
  index("trend_forecasts_user_idx").on(table.userId),
]);

export type TrendForecast = typeof trendForecasts.$inferSelect;

export const competitorSnapshots = pgTable("competitor_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  competitorHandle: text("competitor_handle").notNull(),
  platform: text("platform").notNull(),
  metrics: jsonb("metrics").$type<Record<string, any>>().default({}),
  scannedAt: timestamp("scanned_at").defaultNow(),
}, (table) => [
  index("competitor_snapshots_user_idx").on(table.userId),
]);

export type CompetitorSnapshot = typeof competitorSnapshots.$inferSelect;

export const algorithmHealth = pgTable("algorithm_health", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  score: real("score").notNull().default(100),
  signals: jsonb("signals").$type<Record<string, any>>().default({}),
  scannedAt: timestamp("scanned_at").defaultNow(),
}, (table) => [
  index("algorithm_health_user_idx").on(table.userId),
]);

export type AlgorithmHealthRecord = typeof algorithmHealth.$inferSelect;

export const performanceBenchmarks = pgTable("performance_benchmarks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  metricKey: text("metric_key").notNull(),
  value: real("value").notNull().default(0),
  percentile: real("percentile").notNull().default(50),
  cohort: jsonb("cohort").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => [
  index("benchmarks_user_idx").on(table.userId),
]);

export type PerformanceBenchmark = typeof performanceBenchmarks.$inferSelect;

// === PILLAR 10: COMPLIANCE & LEGAL SHIELD ===
export const complianceChecks = pgTable("compliance_checks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull().default("passed"),
  findings: jsonb("findings").$type<Array<{ issue: string; severity: string; recommendation: string }>>().default([]),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("compliance_checks_user_idx").on(table.userId),
]);

export type ComplianceCheck = typeof complianceChecks.$inferSelect;

export const copyrightClaims = pgTable("copyright_claims", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id"),
  status: text("status").notNull().default("detected"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("copyright_claims_user_idx").on(table.userId),
]);

export type CopyrightClaim = typeof copyrightClaims.$inferSelect;

export const licensingAudits = pgTable("licensing_audits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  assetType: text("asset_type").notNull(),
  assetName: text("asset_name").notNull(),
  status: text("status").notNull().default("compliant"),
  evidence: jsonb("evidence").$type<Record<string, any>>().default({}),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("licensing_audits_user_idx").on(table.userId),
]);

export type LicensingAudit = typeof licensingAudits.$inferSelect;

export const disclosureRequirements = pgTable("disclosure_requirements", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  required: boolean("required").default(false),
  disclosureType: text("disclosure_type"),
  guidance: jsonb("guidance").$type<Record<string, any>>().default({}),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("disclosure_req_user_idx").on(table.userId),
]);

export type DisclosureRequirement = typeof disclosureRequirements.$inferSelect;

export const fairUseReviews = pgTable("fair_use_reviews", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  score: real("score").notNull().default(100),
  rationale: jsonb("rationale").$type<Record<string, any>>().default({}),
  reviewedAt: timestamp("reviewed_at").defaultNow(),
}, (table) => [
  index("fair_use_reviews_user_idx").on(table.userId),
]);

export type FairUseReview = typeof fairUseReviews.$inferSelect;

export const youtubeQuotaUsage = pgTable("youtube_quota_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  unitsUsed: integer("units_used").notNull().default(0),
  readOps: integer("read_ops").notNull().default(0),
  writeOps: integer("write_ops").notNull().default(0),
  searchOps: integer("search_ops").notNull().default(0),
  uploadOps: integer("upload_ops").notNull().default(0),
  quotaLimit: integer("quota_limit").notNull().default(10000),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
}, (table) => [
  index("yt_quota_user_date_idx").on(table.userId, table.date),
]);

export type YouTubeQuotaUsage = typeof youtubeQuotaUsage.$inferSelect;

export const youtubePushBacklog = pgTable("youtube_push_backlog", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").notNull(),
  channelId: integer("channel_id").notNull(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  updateType: text("update_type").notNull().default("metadata"),
  pendingUpdates: jsonb("pending_updates").$type<{
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    thumbnailUrl?: string;
  }>().notNull(),
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(5),
  estimatedQuotaCost: integer("estimated_quota_cost").notNull().default(50),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("yt_backlog_user_status_idx").on(table.userId, table.status),
  index("yt_backlog_priority_idx").on(table.priority, table.createdAt),
]);

export const videoUpdateHistory = pgTable("video_update_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id"),
  youtubeVideoId: text("youtube_video_id").notNull(),
  videoTitle: text("video_title").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  source: text("source").notNull().default("system"),
  status: text("status").notNull().default("pushed"),
  youtubeStudioUrl: text("youtube_studio_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("vid_update_hist_user_idx").on(table.userId, table.createdAt),
  index("vid_update_hist_yt_idx").on(table.youtubeVideoId),
]);

export const insertVideoUpdateHistorySchema = createInsertSchema(videoUpdateHistory).omit({ id: true, createdAt: true });
export type VideoUpdateHistory = typeof videoUpdateHistory.$inferSelect;
export type InsertVideoUpdateHistory = z.infer<typeof insertVideoUpdateHistorySchema>;

export const keywordInsights = pgTable("keyword_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  keyword: text("keyword").notNull(),
  source: text("source").notNull().default("youtube"),
  score: real("score").notNull().default(0),
  totalViews: integer("total_views").default(0),
  totalVideos: integer("total_videos").default(0),
  avgCtr: real("avg_ctr"),
  avgWatchTime: real("avg_watch_time"),
  trend: text("trend").default("stable"),
  category: text("category").default("general"),
  metadata: jsonb("metadata").$type<{
    topVideoIds?: number[];
    searchVolume?: string;
    competition?: string;
    lastPerformanceCheck?: string;
    relatedKeywords?: string[];
    platforms?: string[];
  }>(),
  lastAnalyzedAt: timestamp("last_analyzed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("keyword_insights_user_idx").on(table.userId),
  index("keyword_insights_score_idx").on(table.userId, table.score),
]);

export const insertKeywordInsightSchema = createInsertSchema(keywordInsights).omit({ id: true, createdAt: true, lastAnalyzedAt: true });
export type KeywordInsight = typeof keywordInsights.$inferSelect;
export type InsertKeywordInsight = z.infer<typeof insertKeywordInsightSchema>;

export const trafficStrategies = pgTable("traffic_strategies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  strategyType: text("strategy_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  priority: integer("priority").default(5),
  results: jsonb("results").$type<{
    estimatedImpact?: string;
    actualImpact?: string;
    viewsGained?: number;
    subscribersGained?: number;
    implementedAt?: string;
    nextActionAt?: string;
    actions?: { action: string; status: string; result?: string }[];
  }>(),
  metadata: jsonb("metadata").$type<{
    platform?: string;
    targetAudience?: string;
    contentType?: string;
    keywords?: string[];
    collaborators?: string[];
  }>(),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("traffic_strategies_user_idx").on(table.userId),
]);

export const insertTrafficStrategySchema = createInsertSchema(trafficStrategies).omit({ id: true, createdAt: true });
export type TrafficStrategy = typeof trafficStrategies.$inferSelect;
export type InsertTrafficStrategy = z.infer<typeof insertTrafficStrategySchema>;



export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  campaignType: text("campaign_type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  mode: text("mode").notNull().default("organic"),
  budget: real("budget"),
  spent: real("spent").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  targetMetrics: jsonb("target_metrics").$type<{
    targetViews?: number;
    targetSubscribers?: number;
    targetEngagementRate?: number;
    targetCtr?: number;
    targetCpm?: number;
  }>(),
  results: jsonb("results").$type<{
    impressions?: number;
    clicks?: number;
    views?: number;
    conversions?: number;
    subscribersGained?: number;
    ctr?: number;
    cpm?: number;
    roi?: number;
    notes?: string;
  }>(),
  strategies: jsonb("strategies").$type<{
    organic: string[];
    paid: string[];
    platforms: string[];
    audiences: string[];
    keywords: string[];
    adCopy?: string;
    thumbnailConcept?: string;
    schedule?: Record<string, string>;
  }>(),
  metadata: jsonb("metadata").$type<{
    aiModel?: string;
    generatedAt?: string;
    lastOptimizedAt?: string;
    adPlatform?: string;
    adAccountId?: string;
    retentionBeatsApplied?: boolean;
  }>(),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("marketing_campaigns_user_idx").on(table.userId),
  index("marketing_campaigns_status_idx").on(table.userId, table.status),
]);

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({ id: true, createdAt: true });
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

export const marketingConfig = pgTable("marketing_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  paidAdsEnabled: boolean("paid_ads_enabled").default(false),
  monthlyAdBudget: real("monthly_ad_budget").default(0),
  organicStrategies: jsonb("organic_strategies").$type<{
    seoOptimization: boolean;
    communityEngagement: boolean;
    crossPlatformDistribution: boolean;
    collaborationOutreach: boolean;
    contentSeriesBuilding: boolean;
    audienceRetention: boolean;
    searchTrendRiding: boolean;
    playlistOptimization: boolean;
    shortsFunnel: boolean;
    endScreenOptimization: boolean;
    commentEngagement: boolean;
    socialProofBuilding: boolean;
    hashtagStrategy: boolean;
    thumbnailOptimization: boolean;
    communityPosts: boolean;
  }>().default({
    seoOptimization: true,
    communityEngagement: true,
    crossPlatformDistribution: true,
    collaborationOutreach: true,
    contentSeriesBuilding: true,
    audienceRetention: true,
    searchTrendRiding: true,
    playlistOptimization: true,
    shortsFunnel: true,
    endScreenOptimization: true,
    commentEngagement: true,
    socialProofBuilding: true,
    hashtagStrategy: true,
    thumbnailOptimization: true,
    communityPosts: true,
  }),
  adPlatforms: jsonb("ad_platforms").$type<{
    youtubeAds: boolean;
    googleAds: boolean;
    tiktokAds: boolean;
    xAds: boolean;
  }>().default({
    youtubeAds: false,
    googleAds: false,
    tiktokAds: false,
    xAds: false,
  }),
  targetAudience: jsonb("target_audience").$type<{
    ageRange?: string;
    interests?: string[];
    locations?: string[];
    languages?: string[];
    demographics?: string;
  }>(),
  lastCycleAt: timestamp("last_cycle_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("marketing_config_user_idx").on(table.userId),
]);

export const insertMarketingConfigSchema = createInsertSchema(marketingConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type MarketingConfig = typeof marketingConfig.$inferSelect;
export type InsertMarketingConfig = z.infer<typeof insertMarketingConfigSchema>;

export const gettingStartedChecklist = pgTable("getting_started_checklist", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  stepId: text("step_id").notNull(),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("getting_started_user_id_idx").on(table.userId),
  userStepIdx: index("getting_started_user_step_idx").on(table.userId, table.stepId),
}));

export const insertGettingStartedChecklistSchema = createInsertSchema(gettingStartedChecklist).omit({ id: true, createdAt: true });
export type InsertGettingStartedChecklist = z.infer<typeof insertGettingStartedChecklistSchema>;
export type GettingStartedChecklist = typeof gettingStartedChecklist.$inferSelect;
