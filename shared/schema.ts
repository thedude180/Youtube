
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
  "reddit",
] as const;
export type Platform = typeof PLATFORMS[number];

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
    signupUrl: "https://www.youtube.com",
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
    strategyDescription: "The go-to platform for live gaming content. Strong community features, subscription model, and real-time engagement. Critical for building a loyal live audience.",
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
    maxResolution: "1280x720",
    maxBitrate: "9 Mbps",
    rtmpUrlTemplate: "rtmp://va.pscp.tv:80/x",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://x.com/i/flow/signup",
    strategyDescription: "Real-time conversation platform. X posts drive traffic to your videos and streams. Live streaming reaches your followers directly. Great for building thought leadership.",
    setupSteps: ["Go to x.com and click 'Go Live'", "Select 'Create an external source broadcast'", "Copy the Server URL and Stream Key", "Paste them below"],
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
  reddit: {
    label: "Reddit",
    color: "#FF4500",
    maxResolution: "720p",
    maxBitrate: "3 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://www.reddit.com/register/",
    strategyDescription: "Niche communities (subreddits) are goldmines for targeted content promotion. Building authority in relevant subreddits drives highly engaged viewers to your channel.",
    setupSteps: ["Create a Reddit account", "Join subreddits related to your content niche", "Paste your Reddit username below"],
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
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("streams_user_id_idx").on(table.userId),
}));

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
}));

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
    taxCategory?: string;
  }>(),
  recordedAt: timestamp("recorded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("revenue_records_user_id_idx").on(table.userId),
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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

export const burnoutAlerts = pgTable("burnout_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  riskLevel: text("risk_level").notNull().default("low"),
  factors: jsonb("factors").$type<string[]>(),
  recommendation: text("recommendation"),
  autoThrottleApplied: boolean("auto_throttle_applied").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

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
});

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
});

export const descriptionTemplates = pgTable("description_templates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  content: text("content").notNull(),
  variables: jsonb("variables").$type<string[]>(),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertAbTestSchema = createInsertSchema(abTests).omit({ id: true, createdAt: true });
export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots).omit({ id: true, createdAt: true });
export const insertLearningInsightSchema = createInsertSchema(learningInsights).omit({ id: true, createdAt: true, updatedAt: true });
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
export type CommunityPost = typeof communityPosts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AbTest = typeof abTests.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type LearningInsight = typeof learningInsights.$inferSelect;
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
});

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const localizationRecommendations = pgTable("localization_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  recommendedLanguages: jsonb("recommended_languages").notNull(),
  trafficData: jsonb("traffic_data").notNull(),
  source: text("source").notNull().default("ai-audience-analyzer"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
