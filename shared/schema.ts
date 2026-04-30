
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, real, index, uniqueIndex, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export { sessions, users, passwordResetTokens, SUBSCRIPTION_TIERS, USER_ROLES, TIER_PLATFORM_LIMITS, TIER_LABELS, ADMIN_EMAIL, CHANNEL_LAUNCH_STATES } from "./models/auth";
export type { User, UpsertUser, SubscriptionTier, UserRole, ChannelLaunchState, PasswordResetToken } from "./models/auth";
import { users } from "./models/auth";
export { conversations, messages } from "./models/chat";

export const channelLaunchStates = pgTable("channel_launch_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  state: varchar("state").notNull().default("pre_channel"),
  stateData: jsonb("state_data").$type<Record<string, any>>().default({}),
  channelIdentity: jsonb("channel_identity").$type<{ name?: string; niche?: string; category?: string; description?: string }>().default({}),
  brandBasics: jsonb("brand_basics").$type<{ profileDone?: boolean; bannerDone?: boolean; aboutDone?: boolean; thumbnailStyle?: string }>().default({}),
  launchReadinessScore: integer("launch_readiness_score").default(0),
  firstPublishReadinessScore: integer("first_publish_readiness_score").default(0),
  monetizationReadinessScore: integer("monetization_readiness_score").default(0),
  beginnerMomentumScore: integer("beginner_momentum_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("cls_user_idx").on(t.userId),
  index("cls_state_idx").on(t.state),
]);

export const launchMissions = pgTable("launch_missions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  step: integer("step").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("pending"),
  stepData: jsonb("step_data").$type<Record<string, any>>().default({}),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lm_user_idx").on(t.userId),
  index("lm_step_idx").on(t.step),
  index("lm_status_idx").on(t.status),
]);

export const firstVideoPlans = pgTable("first_video_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoNumber: integer("video_number").notNull(),
  title: varchar("title"),
  concept: text("concept"),
  thumbnailIdea: text("thumbnail_idea"),
  tags: text("tags").array(),
  status: varchar("status").notNull().default("planned"),
  aiGenerated: boolean("ai_generated").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("fvp_user_idx").on(t.userId),
]);

export const firstTenVideoRoadmaps = pgTable("first_ten_video_roadmaps", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoNumber: integer("video_number").notNull(),
  title: varchar("title"),
  concept: text("concept"),
  publishOrder: integer("publish_order"),
  estimatedDuration: varchar("estimated_duration"),
  contentPillar: varchar("content_pillar"),
  status: varchar("status").notNull().default("planned"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ftvr_user_idx").on(t.userId),
]);

export const brandSetupTasks = pgTable("brand_setup_tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  taskType: varchar("task_type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("pending"),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("bst_user_idx").on(t.userId),
  index("bst_type_idx").on(t.taskType),
]);

export const monetizationReadinessSnapshots = pgTable("monetization_readiness_snapshots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  stage: integer("stage").notNull().default(0),
  stageName: varchar("stage_name").notNull().default("Pre-Channel"),
  subscriberCount: integer("subscriber_count").default(0),
  watchHours: real("watch_hours").default(0),
  eligibilityProgress: jsonb("eligibility_progress").$type<Record<string, any>>().default({}),
  nonPlatformRevenuePaths: jsonb("non_platform_revenue_paths").$type<string[]>().default([]),
  region: varchar("region"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("mrs_user_idx").on(t.userId),
  index("mrs_stage_idx").on(t.stage),
]);

export const beginnerProgressMilestones = pgTable("beginner_progress_milestones", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  milestoneKey: varchar("milestone_key").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  achieved: boolean("achieved").default(false),
  achievedAt: timestamp("achieved_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("bpm_user_idx").on(t.userId),
  index("bpm_key_idx").on(t.milestoneKey),
]);

export const onboardingSessions = pgTable("onboarding_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  sessionType: varchar("session_type").notNull().default("standard"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(10),
  stepData: jsonb("step_data").$type<Record<string, any>>().default({}),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  resumable: boolean("resumable").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("os_user_idx").on(t.userId),
  index("os_type_idx").on(t.sessionType),
]);

export const PLATFORMS = [
  "youtube",
  "twitch",
  "kick",
  "tiktok",
  "discord",
  "rumble",
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
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
  kick: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
  tiktok: {
    supports: ["short_video", "text", "image"],
    primaryType: "video",
    maxVideoLength: 600,
    description: "Short-form video clips (up to 10 min), optimized for vertical 9:16",
  },
  discord: {
    supports: ["text", "image"],
    primaryType: "text",
    maxVideoLength: null,
    description: "Community announcements, text posts via webhooks",
  },
  rumble: {
    supports: ["live_stream"],
    primaryType: "video",
    maxVideoLength: null,
    description: "AI-driven streaming only — no content posting, stream detection and monitoring",
  },
};

// AUDIT FIX: Cast to Platform[] to preserve type safety; plain .filter() widens to string[]
export const VIDEO_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("video") || PLATFORM_CAPABILITIES[p].supports.includes("short_video")) as Platform[];
export const TEXT_ONLY_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].primaryType === "text" && !PLATFORM_CAPABILITIES[p].supports.includes("video") && !PLATFORM_CAPABILITIES[p].supports.includes("short_video")) as Platform[];
export const LIVE_STREAM_PLATFORMS = PLATFORMS.filter(p => PLATFORM_CAPABILITIES[p].supports.includes("live_stream")) as Platform[];

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
    label: "TikTok",
    color: "#000000",
    maxResolution: "1080p30",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://push.tiktok.com/live",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://www.tiktok.com/signup",
    strategyDescription: "The fastest way to go viral. Post short-form vertical videos (up to 10 minutes) to reach Gen Z audiences with massive organic reach and rapid growth potential.",
    setupSteps: ["Open TikTok on your phone and go to your profile", "Tap the + button to create content", "Record or upload your short-form video (up to 10 min)", "Add captions, effects, and hashtags", "Post and track engagement"],
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
  rumble: {
    label: "Rumble",
    color: "#85C742",
    maxResolution: "4K (2160p)",
    maxBitrate: "25 Mbps",
    rtmpUrlTemplate: "rtmp://live.rumble.com/live",
    category: "content",
    connectionType: "manual",
    signupUrl: "https://rumble.com/register",
    strategyDescription: "Growing free-speech video platform. Upload long-form content and live stream to reach audiences seeking alternative platforms. Revenue share available.",
    setupSteps: ["Create an account at rumble.com", "Go to your Rumble Studio dashboard", "Find your API key or stream key in Settings", "Paste it below"],
  },
};

export const AI_AGENTS = [
  { id: "ceo",          name: "Jordan Blake",   role: "CEO & Strategy Lead",         icon: "Crown" },
  { id: "ops",          name: "Priya Sharma",   role: "Operations Manager",          icon: "Settings" },
  { id: "research",     name: "Tomás Rivera",   role: "Research Lead",               icon: "Search" },
  { id: "scriptwriter", name: "Nia Okafor",     role: "Scriptwriter",                icon: "FileText" },
  { id: "editor",       name: "Kenji Watanabe", role: "Video Editor",                icon: "Film" },
  { id: "thumbnail",    name: "Sofia Vasquez",  role: "Thumbnail Designer",          icon: "Image" },
  { id: "seo",          name: "Arjun Mehta",    role: "SEO Manager",                 icon: "BarChart3" },
  { id: "shorts",       name: "Zara Ibrahim",   role: "Shorts Specialist",           icon: "Zap" },
  { id: "social",       name: "Marcus Wilson",  role: "Social Media Manager",        icon: "Share2" },
  { id: "community",    name: "Chloe Chen",     role: "Community Manager",           icon: "Users" },
  { id: "analyst",      name: "Dr. Leo Zhang",  role: "Data Analyst",                icon: "TrendingUp" },
  { id: "brand",        name: "Elena Rossi",    role: "Brand & Sponsorships",        icon: "Palette" },
  { id: "talent",       name: "Sarah Jenkins",  role: "Talent Manager",              icon: "Star" },
  { id: "legal",        name: "Alex Rivera",    role: "Legal & Compliance",          icon: "Scale" },
] as const;

export type AgentId = typeof AI_AGENTS[number]["id"];

// === EXISTING TABLES ===

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
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
  contentNiche: text("content_niche"),
  nicheConfidence: integer("niche_confidence"),
  subscriberCount: integer("subscriber_count"),
  videoCount: integer("video_count"),
  viewCount: integer("view_count"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("channels_user_id_idx").on(table.userId),
  channels_platform_idx: index("channels_platform_idx").on(table.platform),
}));

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  title: text("title").notNull(),
  originalFilename: text("original_filename"),
  filePath: text("file_path"),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  type: text("type").notNull(),
  status: text("status").notNull().default("ingested"),
  platform: text("platform").default("youtube"),
  metadata: jsonb("metadata").$type<{
    tags?: string[];
    seoScore?: number;
    aiSuggestions?: {
      titleHooks?: string[];
      descriptionTemplate?: string;
      thumbnailCritique?: string;
      seoRecommendations?: string[];
      complianceNotes?: string[];
      title?: string;
      description?: string;
      tags?: string[];
      issue?: string;
      generatedAt?: string;
      applied?: boolean;
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
    youtubeVideoId?: string;
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    publishedAt?: string;
    duration?: string | number;
    durationSec?: number;
    privacyStatus?: string;
    youtubeUrl?: string;
    autoIngested?: boolean;
    autoIngestedAt?: string;
    isStreamVod?: boolean;
    streamStartedAt?: string;
    streamEndedAt?: string | null;
    streamDurationMs?: number;
    redetectedGame?: string;
    autoDetected?: boolean;
    endScreen?: {
      enabled: boolean;
      elements: Array<{
        type: "video" | "playlist" | "subscribe" | "channel" | "link";
        position: string;
        timing: string;
        text?: string;
      }>;
      generatedAt?: string;
    };
    platformOptimizations?: Record<string, {
      title: string;
      description: string;
      tags: string[];
      format: string;
      aspectRatio: string;
      contentTypeLabel: string;
      maxDurationSeconds: number | null;
      platformNotes: string[];
      optimizedAt: string;
    }>;
    seoTitleHook?: string | null;
    thumbnailIntelligenceUsed?: boolean;
    categoryId?: string;
    channelTitle?: string;
    importedFromUrl?: boolean;
    importedAt?: string;
    sourceStreamId?: number;
    sourceVideoId?: number;
    sourceVideoTitle?: string;
    noCommentary?: boolean;
    maximizerGenerated?: boolean;
    experimentalDuration?: number | null;
    isHighlightReel?: boolean;
    segmentCount?: number;
    autoThumbnailGenerated?: boolean;
    thumbnailRefreshReason?: string;
    empireGenerated?: boolean;
    videoPackageKey?: string;
    scheduledPublishTime?: string;
    crossPlatformSchedule?: unknown;
    seoPackage?: unknown;
    contentIdea?: unknown;
    contentType?: string;
    studioPublishedAt?: string;
    schedulingSource?: string;
  }>(),
  scheduledTime: timestamp("scheduled_time"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  channelIdIdx: index("videos_channel_id_idx").on(table.channelId),
  videos_status_idx: index("videos_status_idx").on(table.status),
  videos_status_scheduled_idx: index("videos_status_scheduled_idx").on(table.status, table.scheduledTime),
  videos_channelId_status_idx: index("videos_channelId_status_idx").on(table.channelId, table.status),
  videos_platform_idx: index("videos_platform_idx").on(table.platform),
  videos_createdAt_idx: index("videos_createdAt_idx").on(table.createdAt),
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
  userId: text("user_id").notNull(),
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
  streams_status_idx: index("streams_status_idx").on(table.status),
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
}, (table) => ({
  thumbnails_videoId_idx: index("thumbnails_videoId_idx").on(table.videoId),
  thumbnails_status_idx: index("thumbnails_status_idx").on(table.status),
}));

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
}, (table) => ({
  jobs_status_idx: index("jobs_status_idx").on(table.status),
  jobs_type_idx: index("jobs_type_idx").on(table.type),
}));

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
  statusIdx: index("growth_strategies_status_idx").on(table.status),
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
    metrics?: Record<string, unknown>;
    recommendations?: string[];
    humanized?: boolean;
    delayMs?: number;
    phase?: string;
    department?: string;
    handoffsTo?: string[];
    backlogId?: number;
    youtubeVideoId?: string;
    updatedFields?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("ai_agent_activities_user_id_idx").on(table.userId),
  userCreatedIdx: index("ai_agent_activities_user_created_idx").on(table.userId, table.createdAt),
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
    schedulingSource?: string;
    autoScheduled?: boolean;
  }>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("schedule_items_user_id_idx").on(table.userId),
  scheduleItems_userId_scheduledAt_idx: index("scheduleItems_userId_scheduledAt_idx").on(table.userId, table.scheduledAt),
}));

export const revenueRecords = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
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
  reconciliationStatus: text("reconciliation_status").default("unverified"),
  reconciliationSource: text("reconciliation_source"),
  reconciliationVerifiedAt: timestamp("reconciliation_verified_at"),
  reconciliationGapAmount: real("reconciliation_gap_amount"),
  reconciliationNotes: text("reconciliation_notes"),
  recordedAt: timestamp("recorded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("revenue_records_user_id_idx").on(table.userId),
  revenueRecords_userId_recordedAt_idx: index("revenueRecords_userId_recordedAt_idx").on(table.userId, table.recordedAt),
  revenueRecords_user_external_unique_idx: uniqueIndex("revenue_records_user_external_unique_idx").on(table.userId, table.externalId),
}));

export const reconciliationActions = pgTable("reconciliation_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  revenueRecordId: integer("revenue_record_id"),
  actionType: text("action_type").notNull(),
  priority: text("priority").default("medium"),
  status: text("status").default("pending"),
  description: text("description").notNull(),
  platform: text("platform"),
  amount: real("amount"),
  gapAmount: real("gap_amount"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("reconciliation_actions_user_id_idx").on(table.userId),
  statusIdx: index("reconciliation_actions_status_idx").on(table.status),
}));

export const reconciliationReports = pgTable("reconciliation_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(),
  reportData: jsonb("report_data").$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("reconciliation_reports_user_id_idx").on(table.userId),
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
  platformIdx: index("revenue_sync_log_platform_idx").on(table.platform),
  statusIdx: index("revenue_sync_log_status_idx").on(table.status),
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
  platformIdx: index("community_posts_platform_idx").on(table.platform),
  statusIdx: index("community_posts_status_idx").on(table.status),
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
  readAt: timestamp("read_at"),
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
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
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
  userDateIdx: index("analytics_snapshots_user_date_idx").on(table.userId, table.snapshotDate),
}));

export const channelGrowthTracking = pgTable("channel_growth_tracking", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
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
  statusIdx: index("content_ideas_status_idx").on(table.status),
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
    hookLine?: string;
    hook?: string;
    viralScore?: number;
    autoExtracted?: boolean;
    cycledAt?: string;
    hasTranscript?: boolean;
    platform?: string;
    seoOptimized?: boolean;
    actualMetrics?: {
      views?: number;
      likes?: number;
      shares?: number;
      comments?: number;
      engagementRate?: number;
      actualScore?: number;
    };
    trackedAt?: string;
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

export const studioVideos = pgTable("studio_videos", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  youtubeId: text("youtube_id"),
  title: text("title").notNull(),
  description: text("description"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  thumbnailUrl: text("thumbnail_url"),
  duration: text("duration"),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<{
    tags?: string[];
    categoryId?: string;
    privacyStatus?: string;
    channelId?: number;
    sourceUrl?: string;
    downloadProgress?: number;
    customThumbnail?: string;
    thumbnailPrompt?: string;
    thumbnailOptions?: Array<{ url: string; prompt: string; predictedCtr?: number }>;
    endScreen?: {
      enabled: boolean;
      elements: Array<{
        type: "video" | "playlist" | "subscribe" | "channel" | "link";
        position: string;
        timing: string;
        text?: string;
        enabled: boolean;
      }>;
    };
    publishProgress?: number;
    publishStatus?: string;
    publishedYoutubeId?: string;
    seoScore?: number;
    scheduledPublishAt?: string;
    autoScheduled?: boolean;
    autopilotQueueId?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  studioVideos_userId_idx: index("studio_videos_user_id_idx").on(table.userId),
  studioVideos_status_idx: index("studio_videos_status_idx").on(table.status),
  studioVideos_youtubeId_idx: index("studio_videos_youtube_id_idx").on(table.youtubeId),
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
}, (table) => ({
  streamIdIdx: index("scm_stream_id_idx").on(table.streamId),
  createdAtIdx: index("scm_created_at_idx").on(table.createdAt),
  streamCreatedIdx: index("scm_stream_created_idx").on(table.streamId, table.createdAt),
}));

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
}, (table) => ({
  streamIdIdx: index("ct_stream_id_idx").on(table.streamId),
}));

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
  platformIdx: index("platform_health_platform_idx").on(table.platform),
  statusIdx: index("platform_health_status_idx").on(table.status),
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
  userIdIdx: uniqueIndex("business_details_user_id_idx").on(table.userId),
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
    gameName?: string;
    playlistType?: string;
    channelId?: number;
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
  // Composite covers the smart-scheduler's WHERE user_id=? AND platform=? ORDER BY activity_level DESC
  userPlatformIdx: index("audience_activity_patterns_user_platform_idx").on(table.userId, table.platform),
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

export const TEAM_ROLES = ["owner", "editor", "moderator", "viewer"] as const;
export type TeamRole = typeof TEAM_ROLES[number];

export const TEAM_MEMBER_STATUS = ["pending", "active", "rejected", "removed"] as const;
export type TeamMemberStatus = typeof TEAM_MEMBER_STATUS[number];

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  memberUserId: text("member_user_id"),
  invitedEmail: text("invited_email").notNull(),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("pending"),
  isAi: boolean("is_ai").default(false),
  aiAgentType: text("ai_agent_type"),
  aiPersonality: text("ai_personality"),
  lastActiveAt: timestamp("last_active_at"),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  removedAt: timestamp("removed_at"),
}, (table) => ({
  ownerIdIdx: index("team_members_owner_id_idx").on(table.ownerId),
  memberUserIdIdx: index("team_members_member_user_id_idx").on(table.memberUserId),
  statusIdx: index("team_members_status_idx").on(table.status),
}));

export const AI_AGENT_TYPES = ["ai-editor", "ai-moderator", "ai-analyst"] as const;
export const AI_TASK_STATUSES = ["queued", "in_progress", "completed", "failed", "handed_off"] as const;

export const aiAgentTasks = pgTable("ai_agent_tasks", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  agentRole: text("agent_role").notNull(),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>(),
  status: text("status").notNull().default("queued"),
  result: jsonb("result").$type<Record<string, any>>(),
  handedOffTo: text("handed_off_to"),
  parentTaskId: integer("parent_task_id"),
  priority: integer("priority").default(5),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdIdx: index("ai_agent_tasks_owner_id_idx").on(table.ownerId),
  statusIdx: index("ai_agent_tasks_status_idx").on(table.status),
  agentRoleIdx: index("ai_agent_tasks_agent_role_idx").on(table.agentRole),
}));

export const teamActivityLog = pgTable("team_activity_log", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  targetEmail: text("target_email"),
  targetUserId: text("target_user_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdIdx: index("team_activity_log_owner_id_idx").on(table.ownerId),
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
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
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
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, invitedAt: true, joinedAt: true, removedAt: true, lastActiveAt: true });
export const insertAiAgentTaskSchema = createInsertSchema(aiAgentTasks).omit({ id: true, startedAt: true, completedAt: true, createdAt: true });
export const insertTeamActivityLogSchema = createInsertSchema(teamActivityLog).omit({ id: true, createdAt: true });
export const insertStudioVideoSchema = createInsertSchema(studioVideos).omit({ id: true, createdAt: true, updatedAt: true });

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
export type StudioVideo = typeof studioVideos.$inferSelect;
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
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamActivityLogEntry = typeof teamActivityLog.$inferSelect;
export type AiAgentTask = typeof aiAgentTasks.$inferSelect;

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
export type InsertStudioVideo = z.infer<typeof insertStudioVideoSchema>;
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
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type InsertTeamActivityLog = z.infer<typeof insertTeamActivityLogSchema>;
export type InsertAiAgentTask = z.infer<typeof insertAiAgentTaskSchema>;

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
  subscriberCount: number;
  monthlyViews: number;
  monthlyRevenue: number;
  videosPosted: number;
  totalViews: number;
  watchHours: number | null;
  avgViewDuration: number | null;
  isLive: boolean;
  channelVideoCount: number;
  totalShorts: number;
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
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("ai_results_user_id_idx").on(table.userId),
  featureKeyIdx: index("ai_results_feature_key_idx").on(table.featureKey),
  // Index for the daily pruning job: DELETE FROM ai_results WHERE created_at < NOW() - INTERVAL '30 days'
  createdAtIdx: index("ai_results_created_at_idx").on(table.createdAt),
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
  // processAllCronJobs queries WHERE enabled = true — index prevents full-table scan
  enabledIdx: index("cron_jobs_enabled_idx").on(table.enabled),
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
  // Composite for querying unprocessed events by age: WHERE processed=false ORDER BY created_at
  processedCreatedAtIdx: index("webhook_events_processed_created_at_idx").on(table.processed, table.createdAt),
}));

export const localizationRecommendations = pgTable("localization_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  recommendedLanguages: jsonb("recommended_languages").notNull(),
  trafficData: jsonb("traffic_data").notNull(),
  source: text("source").notNull().default("ai-audience-analyzer"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex("localization_recommendations_user_id_idx").on(table.userId),
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
    tags?: string[];
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
    originalTitle?: string;
    optimizedTitle?: string;
    thumbnailConcept?: string;
    autoQueued?: boolean;
    cycledAt?: string;
    clipId?: number;
    startSec?: number;
    endSec?: number;
    viralScore?: number;
    retentionBeatsApplied?: boolean;
    retentionBrief?: string | null | Record<string, unknown>;
    titleVariants?: string[];
    tiktokCaption?: string | null;
    contentCategory?: string;
    uniquenessScore?: number;
    fingerprint?: string;
    safetyGrade?: string;
    schedulingMethod?: string;
    angle?: string;
    streamId?: number;
    isLiveAnnouncement?: boolean;
    youtubeVideoId?: string;
    youtubeId?: string;
    channelId?: number;
    contentDecisions?: Record<string, unknown>;
    reelYoutubeId?: string;
    title?: string;
    gameName?: string;
    segmentCount?: number;
    sourceYoutubeId?: string;
    sourceTitle?: string;
    totalDurationSec?: number;
    regenerateThumbnail?: boolean;
    crossPlatformBatch?: boolean;
    intensity?: number;
    segmentStartSec?: number;
    segmentEndSec?: number;
    partNumber?: number;
    totalParts?: number;
    grinderGenerated?: boolean;
    hookDescription?: string;
    retentionStrategy?: string;
    noCommentary?: boolean;
    maximizerGenerated?: boolean;
    experimentalDuration?: number | null;
    autoIngested?: boolean;
    aiSuggestions?: Record<string, unknown>;
    failReason?: string;
    error?: string;
    failureCategory?: string;
    autoFixAttempts?: number;
    autoFixAction?: string;
    deferredUntil?: string;
    studioVideoId?: number;
    scheduledPublishAt?: string;
  }>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("autopilot_queue_user_id_idx").on(table.userId),
  statusIdx: index("autopilot_queue_status_idx").on(table.status),
  autopilot_queue_status_scheduledAt_idx: index("autopilot_queue_status_scheduledAt_idx").on(table.status, table.scheduledAt),
  userStatusIdx: index("autopilot_queue_user_status_idx").on(table.userId, table.status),
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
  content_pipeline_userId_currentStep_idx: index("content_pipeline_userId_currentStep_idx").on(table.userId, table.currentStep),
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
  userIdx: uniqueIndex("notif_prefs_user_idx").on(table.userId),
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
  lifecycleState: text("lifecycle_state").default("active"),
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
  channelId: integer("channel_id"),
  platform: text("platform").notNull(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull().default("passed"),
  findings: jsonb("findings").$type<Array<{ issue: string; severity: string; recommendation: string }>>().default([]),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("compliance_checks_user_idx").on(table.userId),
  index("compliance_checks_channel_idx").on(table.channelId),
]);

export type ComplianceCheck = typeof complianceChecks.$inferSelect;

export const copyrightClaims = pgTable("copyright_claims", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id"),
  videoId: integer("video_id"),
  status: text("status").notNull().default("detected"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("copyright_claims_user_idx").on(table.userId),
  index("copyright_claims_channel_idx").on(table.channelId),
  index("copyright_claims_video_idx").on(table.videoId),
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
  channelId: integer("channel_id"),
  contentId: integer("content_id"),
  required: boolean("required").default(false),
  disclosureType: text("disclosure_type"),
  guidance: jsonb("guidance").$type<Record<string, any>>().default({}),
  checkedAt: timestamp("checked_at").defaultNow(),
}, (table) => [
  index("disclosure_req_user_idx").on(table.userId),
  index("disclosure_req_channel_idx").on(table.channelId),
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

export const engineHeartbeats = pgTable("engine_heartbeats", {
  id: serial("id").primaryKey(),
  engineName: text("engine_name").notNull(),
  status: text("status").notNull().default("idle"),
  lastRunAt: timestamp("last_run_at").defaultNow(),
  lastDurationMs: integer("last_duration_ms"),
  failureCount: integer("failure_count").default(0),
  lastError: text("last_error"),
  metadata: jsonb("metadata"),
}, (table) => [
  uniqueIndex("heartbeat_engine_unique_idx").on(table.engineName),
]);

export const insertEngineHeartbeatSchema = createInsertSchema(engineHeartbeats).omit({ id: true });
export type EngineHeartbeat = typeof engineHeartbeats.$inferSelect;
export type InsertEngineHeartbeat = z.infer<typeof insertEngineHeartbeatSchema>;

export const usageMetrics = pgTable("usage_metrics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  metricType: text("metric_type").notNull(),
  count: integer("count").default(0),
  periodStart: timestamp("period_start").defaultNow(),
  periodEnd: timestamp("period_end"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("usage_user_idx").on(table.userId),
  index("usage_type_idx").on(table.metricType),
]);

export const contentApprovals = pgTable("content_approvals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentType: text("content_type").notNull(),
  contentId: integer("content_id"),
  title: text("title"),
  status: text("status").default("pending"),
  generatedContent: jsonb("generated_content"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("approval_user_idx").on(table.userId),
]);

export const abTestResults = pgTable("ab_test_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id"),
  variantA: text("variant_a"),
  variantB: text("variant_b"),
  testType: text("test_type").default("title"),
  winnerVariant: text("winner_variant"),
  variantAMetrics: jsonb("variant_a_metrics"),
  variantBMetrics: jsonb("variant_b_metrics"),
  startedAt: timestamp("started_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  status: text("status").default("active"),
}, (table) => [
  index("abtest_user_idx").on(table.userId),
]);

export const affiliateLinks = pgTable("affiliate_links", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  originalUrl: text("original_url").notNull(),
  trackingUrl: text("tracking_url"),
  platform: text("platform"),
  clicks: integer("clicks").default(0),
  revenue: real("revenue").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("affiliate_user_idx").on(table.userId),
]);

export const insertAffiliateLinkSchema = createInsertSchema(affiliateLinks).omit({ id: true });
export type AffiliateLink = typeof affiliateLinks.$inferSelect;

export const insertUsageMetricSchema = createInsertSchema(usageMetrics).omit({ id: true });
export type UsageMetric = typeof usageMetrics.$inferSelect;
export const insertNotificationPrefSchema = createInsertSchema(notificationPreferences).omit({ id: true });
export const insertContentApprovalSchema = createInsertSchema(contentApprovals).omit({ id: true });
export type ContentApproval = typeof contentApprovals.$inferSelect;
export const insertAbTestResultSchema = createInsertSchema(abTestResults).omit({ id: true });
export type AbTestResult = typeof abTestResults.$inferSelect;

export const trendOverrides = pgTable("trend_overrides", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  niche: text("niche"),
  status: text("status").notNull().default("active"),
  priority: real("priority").notNull().default(1.0),
  originalTopic: text("original_topic"),
  detectedAt: timestamp("detected_at").defaultNow(),
  peakAt: timestamp("peak_at"),
  cooldownAt: timestamp("cooldown_at"),
  endedAt: timestamp("ended_at"),
  sourceStreamId: integer("source_stream_id"),
  trendScore: real("trend_score").default(1.0),
  contentMix: real("content_mix").default(1.0),
  metadata: jsonb("metadata").$type<{
    detectionSource?: string;
    trendSignals?: string[];
    originalSchedule?: { topic: string; streamIds: number[] };
    totalContentCreated?: number;
    performanceVsBaseline?: number;
  }>(),
}, (table) => [
  index("trend_override_user_idx").on(table.userId),
  index("trend_override_status_idx").on(table.status),
]);

export const insertTrendOverrideSchema = createInsertSchema(trendOverrides).omit({ id: true });
export type TrendOverride = typeof trendOverrides.$inferSelect;

export const cronLocks = pgTable("cron_locks", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull().unique(),
  lockedAt: timestamp("locked_at").defaultNow(),
  lockedBy: text("locked_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastCompletedAt: timestamp("last_completed_at"),
  lastDurationMs: integer("last_duration_ms"),
  executionCount: integer("execution_count").default(0),
  lastError: text("last_error"),
}, (table) => [
  index("cron_lock_job_idx").on(table.jobName),
]);

// === WORLD-BEST AI UPGRADE TABLES ===

export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").default("info"),
  category: text("category"),
  actionable: boolean("actionable").default(true),
  actionTaken: boolean("action_taken").default(false),
  data: jsonb("data"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_insights_user_id_idx").on(table.userId),
  index("ai_insights_type_idx").on(table.userId, table.insightType),
]);

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({ id: true });
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

export const contentQualityScores = pgTable("content_quality_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  videoId: integer("video_id").references(() => videos.id),
  overallScore: real("overall_score"),
  titleScore: real("title_score"),
  descriptionScore: real("description_score"),
  thumbnailScore: real("thumbnail_score"),
  seoScore: real("seo_score"),
  engagementPrediction: real("engagement_prediction"),
  improvements: jsonb("improvements").$type<{ field: string; suggestion: string; impact: number }[]>(),
  modelUsed: text("model_used"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("content_quality_user_idx").on(table.userId),
  index("content_quality_video_idx").on(table.videoId),
]);

export const insertContentQualityScoreSchema = createInsertSchema(contentQualityScores).omit({ id: true });
export type InsertContentQualityScore = z.infer<typeof insertContentQualityScoreSchema>;
export type ContentQualityScore = typeof contentQualityScores.$inferSelect;

export const aiModelRoutingLogs = pgTable("ai_model_routing_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  taskType: text("task_type").notNull(),
  modelSelected: text("model_selected").notNull(),
  modelRequested: text("model_requested"),
  reason: text("reason"),
  tokensUsed: integer("tokens_used"),
  latencyMs: integer("latency_ms"),
  qualityScore: real("quality_score"),
  costUsd: real("cost_usd"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_routing_user_idx").on(table.userId),
  index("ai_routing_model_idx").on(table.modelSelected),
]);

export const insertAiModelRoutingLogSchema = createInsertSchema(aiModelRoutingLogs).omit({ id: true });
export type InsertAiModelRoutingLog = z.infer<typeof insertAiModelRoutingLogSchema>;
export type AiModelRoutingLog = typeof aiModelRoutingLogs.$inferSelect;

export const copilotConversations = pgTable("copilot_conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls").$type<{ tool: string; args: Record<string, any>; result?: any }[]>(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("copilot_conv_user_idx").on(table.userId),
  index("copilot_conv_session_idx").on(table.sessionId),
]);

export const insertCopilotConversationSchema = createInsertSchema(copilotConversations).omit({ id: true });
export type InsertCopilotConversation = z.infer<typeof insertCopilotConversationSchema>;
export type CopilotConversation = typeof copilotConversations.$inferSelect;

export const creatorProfiles = pgTable("creator_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  niche: text("niche"),
  subNiches: jsonb("sub_niches").$type<string[]>(),
  contentStyle: jsonb("content_style").$type<{
    tone?: string;
    energy?: string;
    humor?: string;
    formality?: string;
    vocabulary?: string[];
    avoidWords?: string[];
    signaturePhrases?: string[];
  }>(),
  audienceProfile: jsonb("audience_profile").$type<{
    primaryAge?: string;
    primaryGender?: string;
    primaryRegion?: string;
    interests?: string[];
    peakHours?: number[];
  }>(),
  performanceBaseline: jsonb("performance_baseline").$type<{
    avgViews?: number;
    avgCtr?: number;
    avgRetention?: number;
    avgEngagement?: number;
    bestDayOfWeek?: number;
    bestTimeOfDay?: number;
  }>(),
  learningLog: jsonb("learning_log").$type<{
    totalDecisions?: number;
    successRate?: number;
    lastUpdated?: string;
    topPatterns?: string[];
  }>(),
  maturityLevel: text("maturity_level").default("beginner"),
  totalContentAnalyzed: integer("total_content_analyzed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("creator_profiles_user_idx").on(table.userId),
]);

export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles).omit({ id: true });
export type InsertCreatorProfile = z.infer<typeof insertCreatorProfileSchema>;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;

export const streamLoopRuns = pgTable("stream_loop_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id"),
  phase: text("phase").notNull().default("idle"),
  status: text("status").notNull().default("pending"),
  phases: jsonb("phases").$type<{
    name: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    result?: any;
    error?: string;
  }[]>().default([]),
  metrics: jsonb("metrics").$type<{
    clipsExtracted?: number;
    shortsGenerated?: number;
    platformsDistributed?: number;
    viewsGenerated?: number;
    ctrDelta?: number;
    retentionDelta?: number;
    revenueEstimate?: number;
  }>().default({}),
  learnings: jsonb("learnings").$type<{
    bestClipTimestamps?: string[];
    topPerformingTitle?: string;
    audiencePeakMoments?: number[];
    keywordsDiscovered?: string[];
    improvements?: string[];
  }>().default({}),
  totalDurationMs: integer("total_duration_ms"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("stream_loop_runs_user_idx").on(table.userId),
  index("stream_loop_runs_status_idx").on(table.status),
]);

export const vodShortsLoopRuns = pgTable("vod_shorts_loop_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  phase: text("phase").notNull().default("idle"),
  status: text("status").notNull().default("pending"),
  phases: jsonb("phases").$type<{
    name: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    result?: any;
    error?: string;
  }[]>().default([]),
  videosAnalyzed: integer("videos_analyzed").default(0),
  videosOptimized: integer("videos_optimized").default(0),
  shortsGenerated: integer("shorts_generated").default(0),
  abTestsCreated: integer("ab_tests_created").default(0),
  metrics: jsonb("metrics").$type<{
    decayDetected?: number;
    titlesOptimized?: number;
    thumbnailsRefreshed?: number;
    ctrImprovement?: number;
    viewsRecovered?: number;
    shortsViews?: number;
    distributionCount?: number;
  }>().default({}),
  learnings: jsonb("learnings").$type<{
    winningTitlePatterns?: string[];
    bestThumbnailStyles?: string[];
    optimalPostTimes?: string[];
    topKeywords?: string[];
    contentGaps?: string[];
  }>().default({}),
  totalDurationMs: integer("total_duration_ms"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("vod_shorts_loop_runs_user_idx").on(table.userId),
  index("vod_shorts_loop_runs_status_idx").on(table.status),
]);

export const insertStreamLoopRunSchema = createInsertSchema(streamLoopRuns).omit({ id: true, createdAt: true });
export const insertVodShortsLoopRunSchema = createInsertSchema(vodShortsLoopRuns).omit({ id: true, createdAt: true });
export type StreamLoopRun = typeof streamLoopRuns.$inferSelect;
export type VodShortsLoopRun = typeof vodShortsLoopRuns.$inferSelect;
export type InsertStreamLoopRun = z.infer<typeof insertStreamLoopRunSchema>;
export type InsertVodShortsLoopRun = z.infer<typeof insertVodShortsLoopRunSchema>;

export const creatorScores = pgTable("creator_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  overallScore: integer("overall_score").notNull().default(0),
  engagementScore: integer("engagement_score").default(0),
  consistencyScore: integer("consistency_score").default(0),
  growthScore: integer("growth_score").default(0),
  monetizationScore: integer("monetization_score").default(0),
  reachScore: integer("reach_score").default(0),
  contentQualityScore: integer("content_quality_score").default(0),
  breakdownData: jsonb("breakdown_data").$type<Record<string, any>>().default({}),
  trend: text("trend").default("stable"),
  previousScore: integer("previous_score").default(0),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("creator_scores_user_idx").on(table.userId),
]);

export const missionControlSnapshots = pgTable("mission_control_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platformMetrics: jsonb("platform_metrics").$type<Record<string, any>>().default({}),
  overallHealth: text("overall_health").default("healthy"),
  activeStreams: integer("active_streams").default(0),
  totalViewers: integer("total_viewers").default(0),
  alerts: jsonb("alerts").$type<any[]>().default([]),
  systemStatus: jsonb("system_status").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("mission_control_user_idx").on(table.userId),
]);

export const streamCommandEvents = pgTable("stream_command_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  eventType: text("event_type").notNull(),
  sentimentScore: real("sentiment_score"),
  engagementLevel: text("engagement_level").default("normal"),
  chatVelocity: integer("chat_velocity").default(0),
  suggestedAction: text("suggested_action"),
  talkingPoints: jsonb("talking_points").$type<string[]>().default([]),
  alertData: jsonb("alert_data").$type<Record<string, any>>().default({}),
  handled: boolean("handled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("stream_cmd_user_idx").on(table.userId),
  index("stream_cmd_stream_idx").on(table.streamId),
]);

export const warRoomIncidents = pgTable("war_room_incidents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  incidentType: text("incident_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description"),
  affectedPlatforms: jsonb("affected_platforms").$type<string[]>().default([]),
  recoveryPlan: jsonb("recovery_plan").$type<{ step: string; status: string; }[]>().default([]),
  automatedActions: jsonb("automated_actions").$type<string[]>().default([]),
  status: text("status").default("active"),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("war_room_user_idx").on(table.userId),
  index("war_room_status_idx").on(table.status),
]);

export const audienceMindMapNodes = pgTable("audience_mind_map_nodes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  nodeType: text("node_type").notNull(),
  label: text("label").notNull(),
  size: integer("size").default(1),
  connections: jsonb("connections").$type<number[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  engagement: real("engagement").default(0),
  conversionRate: real("conversion_rate").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("mind_map_user_idx").on(table.userId),
]);

export const whatIfScenarios = pgTable("what_if_scenarios", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  variables: jsonb("variables").$type<Record<string, any>>().default({}),
  projectedOutcomes: jsonb("projected_outcomes").$type<Record<string, any>>().default({}),
  comparisonBaseline: jsonb("comparison_baseline").$type<Record<string, any>>().default({}),
  confidenceLevel: real("confidence_level").default(0),
  timeframeWeeks: integer("timeframe_weeks").default(12),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("what_if_user_idx").on(table.userId),
]);

export const timeMachineProjections = pgTable("time_machine_projections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectionType: text("projection_type").notNull().default("with_ai"),
  subscribers: jsonb("subscribers").$type<number[]>().default([]),
  revenue: jsonb("revenue").$type<number[]>().default([]),
  views: jsonb("views").$type<number[]>().default([]),
  engagement: jsonb("engagement").$type<number[]>().default([]),
  milestones: jsonb("milestones").$type<{ month: number; label: string; }[]>().default([]),
  timeframeMonths: integer("timeframe_months").default(6),
  assumptions: jsonb("assumptions").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("time_machine_user_idx").on(table.userId),
]);

export const momentumSnapshots = pgTable("momentum_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  score: integer("score").notNull().default(50),
  trend: text("trend").default("stable"),
  platformBreakdown: jsonb("platform_breakdown").$type<Record<string, number>>().default({}),
  factors: jsonb("factors").$type<{ factor: string; impact: number; direction: string; }[]>().default([]),
  aiAction: text("ai_action"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("momentum_user_idx").on(table.userId),
]);

export const peakTimeAnalysis = pgTable("peak_time_analysis", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hourUtc: integer("hour_utc").notNull(),
  minuteUtc: integer("minute_utc").default(0),
  score: real("score").default(0),
  sampleSize: integer("sample_size").default(0),
  confidence: real("confidence").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("peak_time_user_idx").on(table.userId),
  index("peak_time_platform_idx").on(table.platform),
]);

export const platformPriorityRanks = pgTable("platform_priority_ranks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  rank: integer("rank").notNull(),
  roiScore: real("roi_score").default(0),
  growthPotential: real("growth_potential").default(0),
  effortRequired: real("effort_required").default(0),
  recommendation: text("recommendation"),
  reasoning: text("reasoning"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("platform_rank_user_idx").on(table.userId),
]);

export const revenueAttribution = pgTable("revenue_attribution", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  contentTitle: text("content_title"),
  platform: text("platform"),
  revenueType: text("revenue_type").notNull(),
  amount: real("amount").notNull().default(0),
  currency: text("currency").default("USD"),
  attributionModel: text("attribution_model").default("direct"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  period: text("period"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("rev_attr_user_idx").on(table.userId),
  index("rev_attr_content_idx").on(table.contentId),
]);

export const creatorMarketplaceListings = pgTable("creator_marketplace_listings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  price: real("price"),
  currency: text("currency").default("USD"),
  deliveryDays: integer("delivery_days").default(3),
  rating: real("rating").default(0),
  reviewCount: integer("review_count").default(0),
  status: text("status").default("active"),
  tags: jsonb("tags").$type<string[]>().default([]),
  portfolio: jsonb("portfolio").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("marketplace_user_idx").on(table.userId),
  index("marketplace_category_idx").on(table.category),
]);

export const contentVaultBackups = pgTable("content_vault_backups", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  youtubeId: text("youtube_id"),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  title: text("title"),
  description: text("description"),
  gameName: text("game_name"),
  duration: text("duration"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  analyticsSnapshot: jsonb("analytics_snapshot").$type<Record<string, any>>().default({}),
  backupUrl: text("backup_url"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  status: text("status").default("indexed"),
  downloadError: text("download_error"),
  restoredAt: timestamp("restored_at"),
  createdAt: timestamp("created_at").defaultNow(),
  downloadedAt: timestamp("downloaded_at"),
  permanentRetention: boolean("permanent_retention").notNull().default(false),
}, (table) => [
  index("vault_user_idx").on(table.userId),
  index("vault_platform_idx").on(table.platform),
  index("vault_youtube_id_idx").on(table.youtubeId),
  // Composite for the createVideo existence check: WHERE user_id=? AND youtube_id=?
  index("vault_user_youtube_idx").on(table.userId, table.youtubeId),
  // Status index for vault sweeps that filter by status
  index("vault_status_idx").on(table.status),
]);

export const streamEditJobs = pgTable("stream_edit_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  vaultEntryId: integer("vault_entry_id"),
  sourceTitle: text("source_title"),
  sourceFilePath: text("source_file_path"),
  sourceDurationSecs: integer("source_duration_secs"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  clipDurationMins: integer("clip_duration_mins").default(60),
  enhancements: jsonb("enhancements").$type<{
    upscale4k: boolean;
    audioNormalize: boolean;
    colorEnhance: boolean;
    sharpen: boolean;
  }>().default({ upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true }),
  status: text("status").default("queued"),
  progress: integer("progress").default(0),
  totalClips: integer("total_clips").default(0),
  completedClips: integer("completed_clips").default(0),
  outputDir: text("output_dir"),
  outputFiles: jsonb("output_files").$type<Array<{
    platform: string;
    clipIndex: number;
    label: string;
    filePath: string;
    fileSize: number;
    durationSecs: number;
    studioVideoId?: number;
    scheduledPublishAt?: string;
  }>>().default([]),
  downloadFirst: boolean("download_first").default(false),
  autoPublish: boolean("auto_publish").default(false),
  currentStage: text("current_stage"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("stream_edit_jobs_user_idx").on(table.userId),
  index("stream_edit_jobs_status_idx").on(table.status),
]);

export const contractAnalyses = pgTable("contract_analyses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contractName: text("contract_name").notNull(),
  brandName: text("brand_name"),
  contractText: text("contract_text"),
  redFlags: jsonb("red_flags").$type<{ clause: string; risk: string; suggestion: string; }[]>().default([]),
  fairnessScore: integer("fairness_score").default(0),
  suggestedCounterOffers: jsonb("suggested_counter_offers").$type<string[]>().default([]),
  summary: text("summary"),
  status: text("status").default("pending"),
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("contract_user_idx").on(table.userId),
]);

export const watchParties = pgTable("watch_parties", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  contentUrl: text("content_url"),
  scheduledAt: timestamp("scheduled_at"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  announcementSent: boolean("announcement_sent").default(false),
  attendeeEstimate: integer("attendee_estimate").default(0),
  status: text("status").default("planned"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("watch_party_user_idx").on(table.userId),
]);

export const creatorNetworks = pgTable("creator_networks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  memberCount: integer("member_count").default(1),
  category: text("category"),
  rules: jsonb("rules").$type<Record<string, any>>().default({}),
  crossPromotionEnabled: boolean("cross_promotion_enabled").default(true),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("network_owner_idx").on(table.ownerId),
]);

export const networkMemberships = pgTable("network_memberships", {
  id: serial("id").primaryKey(),
  networkId: integer("network_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
  status: text("status").default("active"),
}, (table) => [
  index("network_member_user_idx").on(table.userId),
  index("network_member_network_idx").on(table.networkId),
]);

export const creatorCloneConfig = pgTable("creator_clone_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  cloneName: text("clone_name").default("AI Assistant"),
  personality: text("personality").default("friendly"),
  communicationStyle: text("communication_style").default("casual"),
  knowledgeBase: jsonb("knowledge_base").$type<string[]>().default([]),
  responseTemplates: jsonb("response_templates").$type<Record<string, string>>().default({}),
  trainingSamples: jsonb("training_samples").$type<{ input: string; output: string; }[]>().default([]),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  isActive: boolean("is_active").default(false),
  totalInteractions: integer("total_interactions").default(0),
  satisfactionScore: real("satisfaction_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("clone_user_idx").on(table.userId),
]);

export const aiPersonalityConfig = pgTable("ai_personality_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  aiName: text("ai_name").default("Nova"),
  personality: text("personality").default("professional"),
  traits: jsonb("traits").$type<string[]>().default(["analytical", "encouraging", "direct"]),
  communicationStyle: text("communication_style").default("balanced"),
  catchphrases: jsonb("catchphrases").$type<string[]>().default([]),
  opinions: jsonb("opinions").$type<Record<string, string>>().default({}),
  avatar: text("avatar"),
  isOpinionated: boolean("is_opinionated").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_personality_user_idx").on(table.userId),
]);

export const voiceCommandLog = pgTable("voice_command_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  command: text("command").notNull(),
  parsedIntent: text("parsed_intent"),
  action: text("action"),
  parameters: jsonb("parameters").$type<Record<string, any>>().default({}),
  status: text("status").default("processed"),
  result: text("result"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("voice_cmd_user_idx").on(table.userId),
]);

export const aiLearningSnapshots = pgTable("ai_learning_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  insight: text("insight").notNull(),
  confidence: real("confidence").default(0),
  dataPoints: integer("data_points").default(0),
  appliedCount: integer("applied_count").default(0),
  successRate: real("success_rate").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_learning_user_idx").on(table.userId),
]);

export const anomalyDetections = pgTable("anomaly_detections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  platform: text("platform"),
  severity: text("severity").default("medium"),
  description: text("description"),
  metricName: text("metric_name"),
  expectedValue: real("expected_value"),
  actualValue: real("actual_value"),
  deviation: real("deviation"),
  countermeasure: text("countermeasure"),
  status: text("status").default("detected"),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("anomaly_user_idx").on(table.userId),
  index("anomaly_type_idx").on(table.anomalyType),
]);

export const contentAtomizerJobs = pgTable("content_atomizer_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceContentId: text("source_content_id"),
  sourceTitle: text("source_title"),
  sourcePlatform: text("source_platform"),
  outputs: jsonb("outputs").$type<{ platform: string; contentType: string; title: string; description: string; status: string; }[]>().default([]),
  totalOutputs: integer("total_outputs").default(0),
  completedOutputs: integer("completed_outputs").default(0),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("atomizer_user_idx").on(table.userId),
]);

export const viralChainEvents = pgTable("viral_chain_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  platform: text("platform"),
  eventType: text("event_type").notNull(),
  sourceChannel: text("source_channel"),
  viewsGained: integer("views_gained").default(0),
  sharesGained: integer("shares_gained").default(0),
  amplificationAction: text("amplification_action"),
  chainDepth: integer("chain_depth").default(0),
  detectedAt: timestamp("detected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("viral_chain_user_idx").on(table.userId),
  index("viral_chain_content_idx").on(table.contentId),
]);

export const hookScores = pgTable("hook_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  title: text("title"),
  hookText: text("hook_text"),
  score: integer("score").default(0),
  retentionAt3s: real("retention_at_3s"),
  retentionAt10s: real("retention_at_10s"),
  suggestions: jsonb("suggestions").$type<string[]>().default([]),
  improvedHook: text("improved_hook"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hook_user_idx").on(table.userId),
]);

export const thumbnailAbTests = pgTable("thumbnail_ab_tests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  variants: jsonb("variants").$type<{ id: string; description: string; ctr: number; impressions: number; clicks: number; isWinner: boolean; }[]>().default([]),
  winnerSelected: boolean("winner_selected").default(false),
  autoSwapEnabled: boolean("auto_swap_enabled").default(true),
  testDurationHours: integer("test_duration_hours").default(24),
  status: text("status").default("running"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("thumb_ab_user_idx").on(table.userId),
]);

export const contentEmpireNodes = pgTable("content_empire_nodes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type"),
  views: integer("views").default(0),
  revenue: real("revenue").default(0),
  connections: jsonb("connections").$type<number[]>().default([]),
  clusterGroup: text("cluster_group"),
  valueScore: real("value_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("empire_user_idx").on(table.userId),
]);

export const audienceOverlaps = pgTable("audience_overlaps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  creatorName: text("creator_name").notNull(),
  creatorPlatform: text("creator_platform"),
  overlapPercentage: real("overlap_percentage").default(0),
  uniqueViewers: integer("unique_viewers").default(0),
  sharedViewers: integer("shared_viewers").default(0),
  collabPotential: real("collab_potential").default(0),
  untappedAudience: integer("untapped_audience").default(0),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("overlap_user_idx").on(table.userId),
]);

export const sentimentTimeline = pgTable("sentiment_timeline", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform"),
  date: timestamp("date").notNull(),
  positiveCount: integer("positive_count").default(0),
  neutralCount: integer("neutral_count").default(0),
  negativeCount: integer("negative_count").default(0),
  averageScore: real("average_score").default(0),
  topKeywords: jsonb("top_keywords").$type<string[]>().default([]),
  correlatedContent: text("correlated_content"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sentiment_user_idx").on(table.userId),
]);

export const seoLabExperiments = pgTable("seo_lab_experiments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  experimentType: text("experiment_type").notNull(),
  platform: text("platform"),
  testVariants: jsonb("test_variants").$type<{ variant: string; impressions: number; clicks: number; ctr: number; }[]>().default([]),
  winningVariant: text("winning_variant"),
  improvement: real("improvement").default(0),
  status: text("status").default("running"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("seo_lab_user_idx").on(table.userId),
]);

export const cohortAnalysis = pgTable("cohort_analysis", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  cohortDate: text("cohort_date").notNull(),
  platform: text("platform"),
  initialSize: integer("initial_size").default(0),
  retentionWeeks: jsonb("retention_weeks").$type<number[]>().default([]),
  avgEngagement: real("avg_engagement").default(0),
  ltv: real("ltv").default(0),
  contentThatAcquired: text("content_that_acquired"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cohort_user_idx").on(table.userId),
]);

export const teamInboxMessages = pgTable("team_inbox_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  messageType: text("message_type").notNull(),
  senderName: text("sender_name"),
  senderAvatar: text("sender_avatar"),
  content: text("content"),
  priority: text("priority").default("normal"),
  aiSuggestedReply: text("ai_suggested_reply"),
  isRead: boolean("is_read").default(false),
  isReplied: boolean("is_replied").default(false),
  externalId: text("external_id"),
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("inbox_user_idx").on(table.userId),
  index("inbox_priority_idx").on(table.priority),
]);

export const assetLibrary = pgTable("asset_library", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(),
  category: text("category"),
  url: text("url"),
  thumbnailUrl: text("thumbnail_url"),
  fileSize: integer("file_size"),
  tags: jsonb("tags").$type<string[]>().default([]),
  version: integer("version").default(1),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("asset_user_idx").on(table.userId),
  index("asset_type_idx").on(table.assetType),
]);

export const customReports = pgTable("custom_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  metrics: jsonb("metrics").$type<string[]>().default([]),
  filters: jsonb("filters").$type<Record<string, any>>().default({}),
  layout: jsonb("layout").$type<Record<string, any>>().default({}),
  schedule: text("schedule"),
  lastGeneratedAt: timestamp("last_generated_at"),
  reportData: jsonb("report_data").$type<Record<string, any>>().default({}),
  exportFormat: text("export_format").default("pdf"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("report_user_idx").on(table.userId),
]);

export const emailLists = pgTable("email_lists", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  subscriberCount: integer("subscriber_count").default(0),
  tags: jsonb("tags").$type<string[]>().default([]),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("email_list_user_idx").on(table.userId),
]);

export const emailSubscribers = pgTable("email_subscribers", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  source: text("source"),
  segments: jsonb("segments").$type<string[]>().default([]),
  status: text("status").default("active"),
  subscribedAt: timestamp("subscribed_at").defaultNow(),
}, (table) => [
  index("subscriber_list_idx").on(table.listId),
]);

export const discordBotConfig = pgTable("discord_bot_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  botName: text("bot_name").default("CreatorBot"),
  isActive: boolean("is_active").default(false),
  autoModeration: boolean("auto_moderation").default(true),
  welcomeMessage: text("welcome_message"),
  autoRoles: jsonb("auto_roles").$type<string[]>().default([]),
  commandPrefix: text("command_prefix").default("!"),
  features: jsonb("features").$type<Record<string, boolean>>().default({}),
  moderationRules: jsonb("moderation_rules").$type<Record<string, any>>().default({}),
  engagementFeatures: jsonb("engagement_features").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("discord_bot_user_idx").on(table.userId),
]);

export const merchStoreItems = pgTable("merch_store_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  category: text("category"),
  imageUrl: text("image_url"),
  storeUrl: text("store_url"),
  totalSold: integer("total_sold").default(0),
  totalRevenue: real("total_revenue").default(0),
  isActive: boolean("is_active").default(true),
  autoPromote: boolean("auto_promote").default(false),
  bestSellingWith: jsonb("best_selling_with").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("merch_store_user_idx").on(table.userId),
]);

export const tipDonations = pgTable("tip_donations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  donorName: text("donor_name"),
  amount: real("amount").notNull(),
  currency: text("currency").default("USD"),
  message: text("message"),
  contentId: text("content_id"),
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tip_user_idx").on(table.userId),
  index("tip_platform_idx").on(table.platform),
]);

export const growthCelebrations = pgTable("growth_celebrations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  milestoneType: text("milestone_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  metric: text("metric"),
  value: real("value"),
  autoPosted: boolean("auto_posted").default(false),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  celebrationContent: text("celebration_content"),
  achievedAt: timestamp("achieved_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("celebration_user_idx").on(table.userId),
]);

export const contentLifeBalance = pgTable("content_life_balance", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  balanceScore: integer("balance_score").default(50),
  workHoursWeekly: real("work_hours_weekly").default(0),
  contentOutputWeekly: integer("content_output_weekly").default(0),
  stressLevel: text("stress_level").default("normal"),
  recommendation: text("recommendation"),
  streakDays: integer("streak_days").default(0),
  breakSuggested: boolean("break_suggested").default(false),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("balance_user_idx").on(table.userId),
]);

export const platformFailoverRules = pgTable("platform_failover_rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourcePlatform: text("source_platform").notNull(),
  targetPlatforms: jsonb("target_platforms").$type<string[]>().default([]),
  triggerCondition: text("trigger_condition").notNull(),
  autoAnnounce: boolean("auto_announce").default(true),
  announcementTemplate: text("announcement_template"),
  isActive: boolean("is_active").default(true),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("failover_user_idx").on(table.userId),
]);

export const scriptGenerations = pgTable("script_generations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  topic: text("topic"),
  targetLength: text("target_length").default("medium"),
  style: text("style").default("educational"),
  script: text("script"),
  hookOptions: jsonb("hook_options").$type<string[]>().default([]),
  callToAction: text("call_to_action"),
  seoKeywords: jsonb("seo_keywords").$type<string[]>().default([]),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("script_user_idx").on(table.userId),
]);

export type CreatorScore = typeof creatorScores.$inferSelect;
export type MissionControlSnapshot = typeof missionControlSnapshots.$inferSelect;
export type StreamCommandEvent = typeof streamCommandEvents.$inferSelect;
export type WarRoomIncident = typeof warRoomIncidents.$inferSelect;
export type AudienceMindMapNode = typeof audienceMindMapNodes.$inferSelect;
export type WhatIfScenario = typeof whatIfScenarios.$inferSelect;
export type TimeMachineProjection = typeof timeMachineProjections.$inferSelect;
export type MomentumSnapshot = typeof momentumSnapshots.$inferSelect;
export type PeakTimeAnalysis = typeof peakTimeAnalysis.$inferSelect;
export type PlatformPriorityRank = typeof platformPriorityRanks.$inferSelect;
export type RevenueAttribution = typeof revenueAttribution.$inferSelect;
export type CreatorMarketplaceListing = typeof creatorMarketplaceListings.$inferSelect;
export type ContentVaultBackup = typeof contentVaultBackups.$inferSelect;
export type ContractAnalysis = typeof contractAnalyses.$inferSelect;
export type WatchParty = typeof watchParties.$inferSelect;
export type CreatorNetwork = typeof creatorNetworks.$inferSelect;
export type NetworkMembership = typeof networkMemberships.$inferSelect;
export type CreatorCloneConfig = typeof creatorCloneConfig.$inferSelect;
export type AiPersonalityConfig = typeof aiPersonalityConfig.$inferSelect;
export type VoiceCommandLog = typeof voiceCommandLog.$inferSelect;
export type AiLearningSnapshot = typeof aiLearningSnapshots.$inferSelect;
export type AnomalyDetection = typeof anomalyDetections.$inferSelect;
export type ContentAtomizerJob = typeof contentAtomizerJobs.$inferSelect;
export type ViralChainEvent = typeof viralChainEvents.$inferSelect;
export type HookScore = typeof hookScores.$inferSelect;
export type ThumbnailAbTest = typeof thumbnailAbTests.$inferSelect;
export type ContentEmpireNode = typeof contentEmpireNodes.$inferSelect;
export type AudienceOverlap = typeof audienceOverlaps.$inferSelect;
export type SentimentTimelineEntry = typeof sentimentTimeline.$inferSelect;
export type SeoLabExperiment = typeof seoLabExperiments.$inferSelect;
export type CohortAnalysisEntry = typeof cohortAnalysis.$inferSelect;
export type TeamInboxMessage = typeof teamInboxMessages.$inferSelect;
export type AssetLibraryItem = typeof assetLibrary.$inferSelect;
export type CustomReport = typeof customReports.$inferSelect;
export type EmailList = typeof emailLists.$inferSelect;
export type EmailSubscriber = typeof emailSubscribers.$inferSelect;
export type DiscordBotConfig = typeof discordBotConfig.$inferSelect;
export type MerchStoreItem = typeof merchStoreItems.$inferSelect;
export type TipDonation = typeof tipDonations.$inferSelect;
export type GrowthCelebration = typeof growthCelebrations.$inferSelect;
export type ContentLifeBalanceEntry = typeof contentLifeBalance.$inferSelect;
export type PlatformFailoverRule = typeof platformFailoverRules.$inferSelect;
export type ScriptGeneration = typeof scriptGenerations.$inferSelect;

export const autonomyEngineRuns = pgTable("autonomy_engine_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  engineName: text("engine_name").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  actionsExecuted: integer("actions_executed").default(0),
  result: jsonb("result"),
  error: text("error"),
}, (table) => [
  index("autonomy_runs_user_idx").on(table.userId),
  index("autonomy_runs_engine_idx").on(table.engineName),
]);

export const autonomyEngineConfig = pgTable("autonomy_engine_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  engineName: text("engine_name").notNull().unique(),
  enabled: boolean("enabled").default(true),
  intervalMinutes: integer("interval_minutes").default(15),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  status: text("status").notNull().default("idle"),
  failureCount: integer("failure_count").default(0),
  lastError: text("last_error"),
  config: jsonb("config"),
  totalRuns: integer("total_runs").default(0),
  totalActions: integer("total_actions").default(0),
  successRate: real("success_rate").default(1.0),
});

export const aiDecisionLog = pgTable("ai_decision_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  engineName: text("engine_name").notNull(),
  decisionType: text("decision_type").notNull(),
  context: jsonb("context"),
  decision: text("decision").notNull(),
  reasoning: text("reasoning"),
  confidence: real("confidence").default(0.5),
  outcome: text("outcome"),
  appliedAt: timestamp("applied_at").defaultNow(),
  resultMeasuredAt: timestamp("result_measured_at"),
  wasSuccessful: boolean("was_successful"),
});

export const insertAutonomyEngineRunSchema = createInsertSchema(autonomyEngineRuns).omit({ id: true });
export type InsertAutonomyEngineRun = z.infer<typeof insertAutonomyEngineRunSchema>;
export type AutonomyEngineRun = typeof autonomyEngineRuns.$inferSelect;

export const insertAutonomyEngineConfigSchema = createInsertSchema(autonomyEngineConfig).omit({ id: true });
export type InsertAutonomyEngineConfig = z.infer<typeof insertAutonomyEngineConfigSchema>;
export type AutonomyEngineConfig = typeof autonomyEngineConfig.$inferSelect;

export const insertAiDecisionLogSchema = createInsertSchema(aiDecisionLog).omit({ id: true });
export type InsertAiDecisionLog = z.infer<typeof insertAiDecisionLogSchema>;
export type AiDecisionLog = typeof aiDecisionLog.$inferSelect;

export const vodAutopilotConfig = pgTable("vod_autopilot_config", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  maxLongFormPerDay: integer("max_long_form_per_day").notNull().default(1),
  maxShortsPerDay: integer("max_shorts_per_day").notNull().default(3),
  targetPlatforms: text("target_platforms").array().notNull().default(["youtube"]),
  minHoursBetweenUploads: integer("min_hours_between_uploads").notNull().default(2),
  maxHoursBetweenUploads: integer("max_hours_between_uploads").notNull().default(8),
  cycleIntervalHours: integer("cycle_interval_hours").notNull().default(6),
  lastCycleAt: timestamp("last_cycle_at"),
  nextCycleAt: timestamp("next_cycle_at"),
  totalLongFormUploaded: integer("total_long_form_uploaded").notNull().default(0),
  totalShortsUploaded: integer("total_shorts_uploaded").notNull().default(0),
  totalCyclesRun: integer("total_cycles_run").notNull().default(0),
  currentStatus: text("current_status").notNull().default("idle"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVodAutopilotConfigSchema = createInsertSchema(vodAutopilotConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVodAutopilotConfig = z.infer<typeof insertVodAutopilotConfigSchema>;
export type VodAutopilotConfig = typeof vodAutopilotConfig.$inferSelect;

export const billingDunningRecords = pgTable("billing_dunning_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  reason: text("reason").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  stage: text("stage").notNull().default("warning"),
  lastNotifiedAt: timestamp("last_notified_at").notNull().defaultNow(),
  originalTier: text("original_tier").notNull().default("free"),
});

export const billingPausedSubscriptions = pgTable("billing_paused_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  pausedAt: timestamp("paused_at").notNull().defaultNow(),
  reason: text("reason"),
  originalTier: text("original_tier").notNull().default("free"),
});

export const billingPromoApplications = pgTable("billing_promo_applications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  promoCode: text("promo_code").notNull(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  discountPercent: integer("discount_percent").notNull().default(0),
});

export const billingPromoUsage = pgTable("billing_promo_usage", {
  id: serial("id").primaryKey(),
  promoCode: text("promo_code").notNull().unique(),
  currentUses: integer("current_uses").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const billingTrialRecords = pgTable("billing_trial_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  tier: text("tier").notNull().default("starter"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  ended: boolean("ended").notNull().default(false),
});

export const billingInvoices = pgTable("billing_invoices", {
  id: serial("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().unique(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("paid"),
  description: text("description").notNull().default("Subscription payment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== SELF-HEALING ARCHITECTURE ====================

export const intelligentJobs = pgTable("intelligent_jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  userId: text("user_id"),
  priority: integer("priority").notNull().default(5),
  status: text("status").notNull().default("queued"),
  payload: jsonb("payload").notNull(),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  dedupeKey: text("dedupe_key").unique(),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  scheduledFor: timestamp("scheduled_for").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ij_status_type_idx: index("ij_status_type_idx").on(t.status, t.type),
  ij_scheduled_idx: index("ij_scheduled_idx").on(t.scheduledFor),
  ij_user_idx: index("ij_user_idx").on(t.userId),
}));
export type IntelligentJob = typeof intelligentJobs.$inferSelect;

export const healthAuditReports = pgTable("health_audit_reports", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at").defaultNow(),
  orphanedRecords: integer("orphaned_records").notNull().default(0),
  staleTokens: integer("stale_tokens").notNull().default(0),
  fixedIssues: integer("fixed_issues").notNull().default(0),
  p1Issues: jsonb("p1_issues"),
  fullReport: jsonb("full_report"),
  aiSummary: text("ai_summary"),
});
export type HealthAuditReport = typeof healthAuditReports.$inferSelect;

// ==================== AUTONOMOUS SOCIAL MEDIA COMPANY ====================

export const userAutonomousSettings = pgTable("user_autonomous_settings", {
  userId: text("user_id").primaryKey(),
  autonomousMode: boolean("autonomous_mode").notNull().default(false),
  requireApproval: boolean("require_approval").notNull().default(false),
  pausedUntil: timestamp("paused_until"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type UserAutonomousSettings = typeof userAutonomousSettings.$inferSelect;

export const streamLifecycleStates = pgTable("stream_lifecycle_states", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  state: text("state").notNull().default("idle"),
  prevState: text("prev_state"),
  context: jsonb("context"),
  transitionedAt: timestamp("transitioned_at").defaultNow(),
}, (t) => ({
  sls_user_idx: index("sls_user_idx").on(t.userId),
}));

export const streamDetectionLog = pgTable("stream_detection_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  confidence: real("confidence").notNull().default(0),
  isLive: boolean("is_live").notNull().default(false),
  falsePositive: boolean("false_positive").notNull().default(false),
  signals: jsonb("signals"),
  videoId: text("video_id"),
}, (t) => ({
  sdl_user_idx: index("sdl_user_idx").on(t.userId),
}));

export const revenueStrategies = pgTable("revenue_strategies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  strategy: jsonb("strategy").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => ({
  rs_user_idx: index("rs_user_idx").on(t.userId),
}));

export const growthPlans = pgTable("growth_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  plan: jsonb("plan").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => ({
  gp_user_idx: index("gp_user_idx").on(t.userId),
}));

export const autonomousActionLog = pgTable("autonomous_action_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  engine: text("engine").notNull(),
  action: text("action").notNull(),
  reasoning: text("reasoning"),
  payload: jsonb("payload"),
  prompt: text("prompt"),
  response: text("response"),
  publishedContent: text("published_content"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  aal_user_idx: index("aal_user_idx").on(t.userId),
  aal_engine_idx: index("aal_engine_idx").on(t.engine),
  aal_created_idx: index("aal_created_idx").on(t.createdAt),
}));
export type AutonomousActionLog = typeof autonomousActionLog.$inferSelect;

// ============================
// PHASE 1 — SECURE KERNEL TABLES
// ============================

export const domainEvents = pgTable("domain_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type"),
  aggregateId: text("aggregate_id"),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  version: integer("version").default(1),
  emittedAt: timestamp("emitted_at").defaultNow(),
}, (t) => ({
  de_user_idx: index("de_user_idx").on(t.userId),
  de_type_idx: index("de_type_idx").on(t.eventType),
  de_agg_idx: index("de_agg_idx").on(t.aggregateType, t.aggregateId),
  de_emitted_idx: index("de_emitted_idx").on(t.emittedAt),
}));
export type DomainEvent = typeof domainEvents.$inferSelect;

export const schemaRegistry = pgTable("schema_registry", {
  id: serial("id").primaryKey(),
  schemaName: text("schema_name").notNull(),
  version: integer("version").notNull().default(1),
  definition: jsonb("definition").$type<Record<string, any>>().notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  deprecatedAt: timestamp("deprecated_at"),
}, (t) => ({
  sr_name_idx: index("sr_name_idx").on(t.schemaName),
  sr_name_ver_idx: index("sr_name_ver_idx").on(t.schemaName, t.version),
}));
export type SchemaRegistryEntry = typeof schemaRegistry.$inferSelect;

export const signalRegistry = pgTable("signal_registry", {
  id: serial("id").primaryKey(),
  signalName: text("signal_name").notNull().unique(),
  signalType: text("signal_type").notNull(),
  sourceSystem: text("source_system").notNull(),
  weightClass: text("weight_class").notNull().default("standard"),
  privacyClass: text("privacy_class").notNull().default("internal"),
  retentionDays: integer("retention_days").default(365),
  decayStrategy: text("decay_strategy").default("none"),
  targetGraphNode: text("target_graph_node"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  sigr_type_idx: index("sigr_type_idx").on(t.signalType),
  sigr_source_idx: index("sigr_source_idx").on(t.sourceSystem),
}));
export type SignalRegistryEntry = typeof signalRegistry.$inferSelect;

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  promptKey: text("prompt_key").notNull(),
  version: integer("version").notNull().default(1),
  model: text("model").notNull(),
  systemPrompt: text("system_prompt"),
  userPromptTemplate: text("user_prompt_template"),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  retiredAt: timestamp("retired_at"),
}, (t) => ({
  pv_key_idx: index("pv_key_idx").on(t.promptKey),
  pv_key_ver_idx: index("pv_key_ver_idx").on(t.promptKey, t.version),
}));
export type PromptVersion = typeof promptVersions.$inferSelect;

export const signedActionReceipts = pgTable("signed_action_receipts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  executionKey: text("execution_key").notNull().unique(),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  decisionTheater: jsonb("decision_theater").$type<Record<string, any>>().default({}),
  hmacSignature: text("hmac_signature").notNull(),
  status: text("status").notNull().default("completed"),
  rollbackAvailable: boolean("rollback_available").default(false),
  rollbackMetadata: jsonb("rollback_metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  sar_user_idx: index("sar_user_idx").on(t.userId),
  sar_action_idx: index("sar_action_idx").on(t.actionType),
  sar_exec_key_idx: index("sar_exec_key_idx").on(t.executionKey),
  sar_created_idx: index("sar_created_idx").on(t.createdAt),
}));
export type SignedActionReceipt = typeof signedActionReceipts.$inferSelect;

export const operatingModeHistory = pgTable("operating_mode_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  reason: text("reason"),
  changedBy: text("changed_by").notNull().default("system"),
  previousMode: text("previous_mode"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  changedAt: timestamp("changed_at").defaultNow(),
}, (t) => ({
  omh_user_idx: index("omh_user_idx").on(t.userId),
  omh_changed_idx: index("omh_changed_idx").on(t.changedAt),
}));
export type OperatingModeHistoryEntry = typeof operatingModeHistory.$inferSelect;

export const channelMaturityScores = pgTable("channel_maturity_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  overallScore: real("overall_score").notNull().default(0),
  contentMaturity: real("content_maturity").default(0),
  audienceMaturity: real("audience_maturity").default(0),
  monetizationMaturity: real("monetization_maturity").default(0),
  operationalMaturity: real("operational_maturity").default(0),
  dimensions: jsonb("dimensions").$type<Record<string, any>>().default({}),
  calculatedAt: timestamp("calculated_at").defaultNow(),
}, (t) => ({
  cms_user_idx: index("cms_user_idx").on(t.userId),
  cms_channel_idx: index("cms_channel_idx").on(t.channelId),
}));
export type ChannelMaturityScore = typeof channelMaturityScores.$inferSelect;

export const featureFlagAudit = pgTable("feature_flag_audit", {
  id: serial("id").primaryKey(),
  flagKey: text("flag_key").notNull(),
  userId: text("user_id"),
  action: text("action").notNull(),
  previousValue: jsonb("previous_value").$type<Record<string, any>>(),
  newValue: jsonb("new_value").$type<Record<string, any>>(),
  reason: text("reason"),
  performedBy: text("performed_by").notNull().default("system"),
  performedAt: timestamp("performed_at").defaultNow(),
}, (t) => ({
  ffa_flag_idx: index("ffa_flag_idx").on(t.flagKey),
  ffa_user_idx: index("ffa_user_idx").on(t.userId),
  ffa_performed_idx: index("ffa_performed_idx").on(t.performedAt),
}));
export type FeatureFlagAuditEntry = typeof featureFlagAudit.$inferSelect;

export const approvalMatrixRules = pgTable("approval_matrix_rules", {
  id: serial("id").primaryKey(),
  actionClass: text("action_class").notNull().unique(),
  bandClass: text("band_class").notNull().default("GREEN"),
  defaultState: text("default_state").notNull().default("auto-approved"),
  approver: text("approver").notNull().default("system"),
  reversible: boolean("reversible").default(true),
  rollbackAvailable: boolean("rollback_available").default(false),
  expertHandoff: boolean("expert_handoff").default(false),
  confidenceThreshold: real("confidence_threshold"),
  maturityThreshold: real("maturity_threshold"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  amr_action_idx: index("amr_action_idx").on(t.actionClass),
  amr_band_idx: index("amr_band_idx").on(t.bandClass),
}));
export type ApprovalMatrixRule = typeof approvalMatrixRules.$inferSelect;

export const approvalDecisions = pgTable("approval_decisions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionClass: text("action_class").notNull(),
  ruleId: integer("rule_id"),
  decision: text("decision").notNull(),
  decidedBy: text("decided_by").notNull().default("system"),
  reason: text("reason"),
  executionKey: text("execution_key"),
  confidence: real("confidence"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  decidedAt: timestamp("decided_at").defaultNow(),
}, (t) => ({
  ad_user_idx: index("ad_user_idx").on(t.userId),
  ad_action_idx: index("ad_action_idx").on(t.actionClass),
  ad_decided_idx: index("ad_decided_idx").on(t.decidedAt),
}));
export type ApprovalDecision = typeof approvalDecisions.$inferSelect;

export const commercialTierEntitlements = pgTable("commercial_tier_entitlements", {
  id: serial("id").primaryKey(),
  tier: text("tier").notNull(),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").default(true),
  limits: jsonb("limits").$type<Record<string, any>>().default({}),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  cte_tier_idx: index("cte_tier_idx").on(t.tier),
  cte_feature_idx: index("cte_feature_idx").on(t.featureKey),
}));
export type CommercialTierEntitlement = typeof commercialTierEntitlements.$inferSelect;

export const benchmarkParticipationSettings = pgTable("benchmark_participation_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  optedIn: boolean("opted_in").default(false),
  anonymizationLevel: text("anonymization_level").default("full"),
  sharedMetrics: jsonb("shared_metrics").$type<string[]>().default([]),
  excludedMetrics: jsonb("excluded_metrics").$type<string[]>().default([]),
  consentVersion: integer("consent_version").default(1),
  consentedAt: timestamp("consented_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  bps_user_idx: index("bps_user_idx").on(t.userId),
}));
export type BenchmarkParticipation = typeof benchmarkParticipationSettings.$inferSelect;

export const learningSignals = pgTable("learning_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  signalType: text("signal_type").notNull(),
  bandClass: text("band_class").notNull().default("GREEN"),
  value: jsonb("value").$type<Record<string, any>>().default({}),
  confidence: real("confidence").notNull().default(0.5),
  sampleSize: integer("sample_size").default(1),
  sourceAgent: text("source_agent"),
  emittedAt: timestamp("emitted_at").defaultNow(),
}, (t) => ({
  ls_user_idx: index("ls_user_idx").on(t.userId),
  ls_type_idx: index("ls_type_idx").on(t.signalType),
  ls_cat_idx: index("ls_cat_idx").on(t.category),
  ls_emitted_idx: index("ls_emitted_idx").on(t.emittedAt),
  ls_band_idx: index("ls_band_idx").on(t.bandClass),
}));
export type LearningSignal = typeof learningSignals.$inferSelect;

export const learningMaturityScores = pgTable("learning_maturity_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  score: real("score").notNull().default(0),
  signalCount: integer("signal_count").default(0),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
}, (t) => ({
  lms_user_idx: index("lms_user_idx").on(t.userId),
  lms_cat_idx: index("lms_cat_idx").on(t.category),
  lms_user_cat_idx: index("lms_user_cat_idx").on(t.userId, t.category),
}));
export type LearningMaturityScore = typeof learningMaturityScores.$inferSelect;

export const agentInteropMessages = pgTable("agent_interop_messages", {
  id: serial("id").primaryKey(),
  fromAgent: text("from_agent").notNull(),
  toAgent: text("to_agent").notNull(),
  userId: text("user_id").notNull(),
  messageType: text("message_type").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
}, (t) => ({
  aim_from_idx: index("aim_from_idx").on(t.fromAgent),
  aim_to_idx: index("aim_to_idx").on(t.toAgent),
  aim_user_idx: index("aim_user_idx").on(t.userId),
  aim_status_idx: index("aim_status_idx").on(t.status),
  aim_created_idx: index("aim_created_idx").on(t.createdAt),
}));
export type AgentInteropMessage = typeof agentInteropMessages.$inferSelect;

export const agentUiPayloads = pgTable("agent_ui_payloads", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  payloadType: text("payload_type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  renderedAt: timestamp("rendered_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  aup_user_idx: index("aup_user_idx").on(t.userId),
  aup_agent_idx: index("aup_agent_idx").on(t.agentName),
  aup_type_idx: index("aup_type_idx").on(t.payloadType),
  aup_created_idx: index("aup_created_idx").on(t.createdAt),
}));
export type AgentUiPayload = typeof agentUiPayloads.$inferSelect;

export const evalRuns = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  evalType: text("eval_type").notNull(),
  inputSnapshot: jsonb("input_snapshot").$type<Record<string, any>>().default({}),
  outputSnapshot: jsonb("output_snapshot").$type<Record<string, any>>().default({}),
  score: real("score").notNull().default(0),
  passed: boolean("passed").default(false),
  notes: text("notes"),
  ranAt: timestamp("ran_at").defaultNow(),
}, (t) => ({
  er_user_idx: index("er_user_idx").on(t.userId),
  er_agent_idx: index("er_agent_idx").on(t.agentName),
  er_eval_idx: index("er_eval_idx").on(t.evalType),
  er_ran_idx: index("er_ran_idx").on(t.ranAt),
}));
export type EvalRun = typeof evalRuns.$inferSelect;

// === V9.0 AMENDMENT TABLES ===

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  runType: text("run_type").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  recordsChecked: integer("records_checked").default(0),
  driftsFound: integer("drifts_found").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rr_user_idx: index("rr_user_idx").on(t.userId),
  rr_status_idx: index("rr_status_idx").on(t.status),
}));
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;

export const reconciliationDriftRecords = pgTable("reconciliation_drift_records", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => reconciliationRuns.id),
  userId: text("user_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  driftType: text("drift_type").notNull(),
  expectedValue: jsonb("expected_value").$type<Record<string, any>>(),
  actualValue: jsonb("actual_value").$type<Record<string, any>>(),
  severity: text("severity").default("medium"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rdr_run_idx: index("rdr_run_idx").on(t.runId),
  rdr_user_idx: index("rdr_user_idx").on(t.userId),
  rdr_entity_idx: index("rdr_entity_idx").on(t.entityType, t.entityId),
}));
export type ReconciliationDriftRecord = typeof reconciliationDriftRecords.$inferSelect;

export const idempotencyLedger = pgTable("idempotency_ledger", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  userId: text("user_id"),
  operationType: text("operation_type").notNull(),
  status: text("status").notNull().default("completed"),
  requestHash: text("request_hash"),
  responseSnapshot: jsonb("response_snapshot").$type<Record<string, any>>(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  il_key_idx: index("il_key_idx").on(t.idempotencyKey),
  il_user_idx: index("il_user_idx").on(t.userId),
}));
export type IdempotencyLedgerEntry = typeof idempotencyLedger.$inferSelect;

export const capabilityRegistryRecords = pgTable("capability_registry_records", {
  id: serial("id").primaryKey(),
  capabilityName: text("capability_name").notNull().unique(),
  category: text("category").notNull(),
  status: text("status").notNull().default("active"),
  version: integer("version").default(1),
  provider: text("provider"),
  dependencies: jsonb("dependencies").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  crr_name_idx: index("crr_name_idx").on(t.capabilityName),
  crr_category_idx: index("crr_category_idx").on(t.category),
}));
export type CapabilityRegistryRecord = typeof capabilityRegistryRecords.$inferSelect;

export const connectorScopeRecords = pgTable("connector_scope_records", {
  id: serial("id").primaryKey(),
  connectorName: text("connector_name").notNull(),
  scopeKey: text("scope_key").notNull(),
  scopeType: text("scope_type").notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  userId: text("user_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  csr_connector_idx: index("csr_connector_idx").on(t.connectorName),
  csr_user_idx: index("csr_user_idx").on(t.userId),
}));
export type ConnectorScopeRecord = typeof connectorScopeRecords.$inferSelect;

export const jobLeases = pgTable("job_leases", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  workerName: text("worker_name").notNull(),
  leaseExpiresAt: timestamp("lease_expires_at").notNull(),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  acquiredAt: timestamp("acquired_at").defaultNow(),
  releasedAt: timestamp("released_at"),
}, (t) => ({
  jl_job_idx: index("jl_job_idx").on(t.jobId),
  jl_worker_idx: index("jl_worker_idx").on(t.workerName),
}));
export type JobLease = typeof jobLeases.$inferSelect;

export const jobHeartbeats = pgTable("job_heartbeats", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  workerName: text("worker_name").notNull(),
  progress: integer("progress").default(0),
  statusMessage: text("status_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  heartbeatAt: timestamp("heartbeat_at").defaultNow(),
}, (t) => ({
  jh_job_idx: index("jh_job_idx").on(t.jobId),
}));
export type JobHeartbeat = typeof jobHeartbeats.$inferSelect;

export const poisonJobRecords = pgTable("poison_job_records", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull(),
  jobType: text("job_type").notNull(),
  failureCount: integer("failure_count").notNull().default(1),
  lastError: text("last_error"),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  quarantinedAt: timestamp("quarantined_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pjr_job_idx: index("pjr_job_idx").on(t.jobId),
  pjr_type_idx: index("pjr_type_idx").on(t.jobType),
}));
export type PoisonJobRecord = typeof poisonJobRecords.$inferSelect;

export const revenueTruthRecords = pgTable("revenue_truth_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  period: text("period").notNull(),
  reportedAmount: real("reported_amount").notNull().default(0),
  verifiedAmount: real("verified_amount"),
  currency: text("currency").default("USD"),
  sourceOfTruth: text("source_of_truth").notNull(),
  verificationStatus: text("verification_status").default("pending"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rtr_user_idx: index("rtr_user_idx").on(t.userId),
  rtr_platform_idx: index("rtr_platform_idx").on(t.platform),
  rtr_period_idx: index("rtr_period_idx").on(t.period),
}));
export type RevenueTruthRecord = typeof revenueTruthRecords.$inferSelect;

export const revenueSettlementRecords = pgTable("revenue_settlement_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  truthRecordId: integer("truth_record_id").references(() => revenueTruthRecords.id),
  settlementType: text("settlement_type").notNull(),
  amount: real("amount").notNull().default(0),
  currency: text("currency").default("USD"),
  status: text("status").notNull().default("pending"),
  settledAt: timestamp("settled_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rsr_user_idx: index("rsr_user_idx").on(t.userId),
  rsr_truth_idx: index("rsr_truth_idx").on(t.truthRecordId),
}));
export type RevenueSettlementRecord = typeof revenueSettlementRecords.$inferSelect;

export const priorContradictionRecords = pgTable("prior_contradiction_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  priorClaimId: text("prior_claim_id"),
  contradictingClaimId: text("contradicting_claim_id"),
  priorClaim: jsonb("prior_claim").$type<Record<string, any>>(),
  contradictingClaim: jsonb("contradicting_claim").$type<Record<string, any>>(),
  resolutionStatus: text("resolution_status").default("unresolved"),
  resolvedBy: text("resolved_by"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => ({
  pcr_user_idx: index("pcr_user_idx").on(t.userId),
  pcr_agent_idx: index("pcr_agent_idx").on(t.agentName),
}));
export type PriorContradictionRecord = typeof priorContradictionRecords.$inferSelect;

export const priorFreshnessRecords = pgTable("prior_freshness_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  priorKey: text("prior_key").notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  freshnessScore: real("freshness_score").default(1.0),
  staleThreshold: real("stale_threshold").default(0.3),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pfr_user_idx: index("pfr_user_idx").on(t.userId),
  pfr_agent_idx: index("pfr_agent_idx").on(t.agentName),
  pfr_key_idx: index("pfr_key_idx").on(t.priorKey),
}));
export type PriorFreshnessRecord = typeof priorFreshnessRecords.$inferSelect;

export const rolloutLaneRecords = pgTable("rollout_lane_records", {
  id: serial("id").primaryKey(),
  laneName: text("lane_name").notNull().unique(),
  laneType: text("lane_type").notNull(),
  percentage: integer("percentage").default(0),
  status: text("status").notNull().default("active"),
  criteria: jsonb("criteria").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  rlr_name_idx: index("rlr_name_idx").on(t.laneName),
}));
export type RolloutLaneRecord = typeof rolloutLaneRecords.$inferSelect;

export const rolloutExposureRecords = pgTable("rollout_exposure_records", {
  id: serial("id").primaryKey(),
  laneId: integer("lane_id").references(() => rolloutLaneRecords.id),
  userId: text("user_id").notNull(),
  featureKey: text("feature_key").notNull(),
  variant: text("variant").default("control"),
  exposedAt: timestamp("exposed_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
}, (t) => ({
  rer_lane_idx: index("rer_lane_idx").on(t.laneId),
  rer_user_idx: index("rer_user_idx").on(t.userId),
  rer_feature_idx: index("rer_feature_idx").on(t.featureKey),
}));
export type RolloutExposureRecord = typeof rolloutExposureRecords.$inferSelect;

export const trustBudgetRecords = pgTable("trust_budget_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  budgetTotal: real("budget_total").notNull().default(100),
  budgetRemaining: real("budget_remaining").notNull().default(100),
  lastDeductionAmount: real("last_deduction_amount"),
  lastDeductionReason: text("last_deduction_reason"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  tbr_user_idx: index("tbr_user_idx").on(t.userId),
  tbr_agent_idx: index("tbr_agent_idx").on(t.agentName),
}));
export type TrustBudgetRecord = typeof trustBudgetRecords.$inferSelect;

export const continuityArtifacts = pgTable("continuity_artifacts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  artifactType: text("artifact_type").notNull(),
  artifactKey: text("artifact_key").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  version: integer("version").default(1),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ca_user_idx: index("ca_user_idx").on(t.userId),
  ca_type_idx: index("ca_type_idx").on(t.artifactType),
  ca_key_idx: index("ca_key_idx").on(t.artifactKey),
}));
export type ContinuityArtifact = typeof continuityArtifacts.$inferSelect;

export const archiveIntegrityReports = pgTable("archive_integrity_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  archiveType: text("archive_type").notNull(),
  recordsScanned: integer("records_scanned").default(0),
  integrityScore: real("integrity_score").default(1.0),
  issuesFound: integer("issues_found").default(0),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  reportedAt: timestamp("reported_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  air_user_idx: index("air_user_idx").on(t.userId),
  air_type_idx: index("air_type_idx").on(t.archiveType),
}));
export type ArchiveIntegrityReport = typeof archiveIntegrityReports.$inferSelect;

export const operatorOverrideRecords = pgTable("operator_override_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  overrideType: text("override_type").notNull(),
  targetEntity: text("target_entity").notNull(),
  targetId: text("target_id"),
  previousValue: jsonb("previous_value").$type<Record<string, any>>(),
  newValue: jsonb("new_value").$type<Record<string, any>>(),
  reason: text("reason"),
  performedBy: text("performed_by").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  oor_user_idx: index("oor_user_idx").on(t.userId),
  oor_type_idx: index("oor_type_idx").on(t.overrideType),
  oor_target_idx: index("oor_target_idx").on(t.targetEntity),
}));
export type OperatorOverrideRecord = typeof operatorOverrideRecords.$inferSelect;

export const overrideReasonRecords = pgTable("override_reason_records", {
  id: serial("id").primaryKey(),
  overrideId: integer("override_id").references(() => operatorOverrideRecords.id),
  reasonCategory: text("reason_category").notNull(),
  reasonText: text("reason_text").notNull(),
  confidence: real("confidence"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  orr_override_idx: index("orr_override_idx").on(t.overrideId),
  orr_category_idx: index("orr_category_idx").on(t.reasonCategory),
}));
export type OverrideReasonRecord = typeof overrideReasonRecords.$inferSelect;

export const platformCapabilityProbes = pgTable("platform_capability_probes", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  capabilityName: text("capability_name").notNull(),
  probeResult: text("probe_result").notNull().default("unknown"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  probedAt: timestamp("probed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pcp_platform_idx: index("pcp_platform_idx").on(t.platform),
  pcp_capability_idx: index("pcp_capability_idx").on(t.capabilityName),
}));
export type PlatformCapabilityProbe = typeof platformCapabilityProbes.$inferSelect;

export const executionHistory = pgTable("execution_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  executionKey: text("execution_key"),
  status: text("status").notNull().default("completed"),
  durationMs: integer("duration_ms"),
  inputSnapshot: jsonb("input_snapshot").$type<Record<string, any>>().default({}),
  outputSnapshot: jsonb("output_snapshot").$type<Record<string, any>>().default({}),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  executedAt: timestamp("executed_at").defaultNow(),
}, (t) => ({
  eh_user_idx: index("eh_user_idx").on(t.userId),
  eh_action_idx: index("eh_action_idx").on(t.actionType),
  eh_key_idx: index("eh_key_idx").on(t.executionKey),
  eh_executed_idx: index("eh_executed_idx").on(t.executedAt),
}));
export type ExecutionHistoryEntry = typeof executionHistory.$inferSelect;

export const trustBudgetPeriods = pgTable("trust_budget_periods", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  startingBudget: real("starting_budget").notNull().default(100),
  endingBudget: real("ending_budget"),
  deductionsCount: integer("deductions_count").default(0),
  totalDeducted: real("total_deducted").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  tbp_user_idx: index("tbp_user_idx").on(t.userId),
  tbp_agent_idx: index("tbp_agent_idx").on(t.agentName),
  tbp_period_idx: index("tbp_period_idx").on(t.periodStart, t.periodEnd),
}));
export type TrustBudgetPeriod = typeof trustBudgetPeriods.$inferSelect;

export const capabilityDegradationPlaybooks = pgTable("capability_degradation_playbooks", {
  id: serial("id").primaryKey(),
  capabilityName: text("capability_name").notNull(),
  degradationLevel: text("degradation_level").notNull(),
  playbookName: text("playbook_name").notNull(),
  steps: jsonb("steps").$type<Record<string, any>[]>().default([]),
  autoActivate: boolean("auto_activate").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  cdp_capability_idx: index("cdp_capability_idx").on(t.capabilityName),
  cdp_level_idx: index("cdp_level_idx").on(t.degradationLevel),
}));
export type CapabilityDegradationPlaybook = typeof capabilityDegradationPlaybooks.$inferSelect;

export const playbookActivationEvents = pgTable("playbook_activation_events", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").references(() => capabilityDegradationPlaybooks.id),
  activatedBy: text("activated_by").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("active"),
  deactivatedAt: timestamp("deactivated_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  activatedAt: timestamp("activated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pae_playbook_idx: index("pae_playbook_idx").on(t.playbookId),
  pae_status_idx: index("pae_status_idx").on(t.status),
}));
export type PlaybookActivationEvent = typeof playbookActivationEvents.$inferSelect;

export const overrideLearningRecords = pgTable("override_learning_records", {
  id: serial("id").primaryKey(),
  overrideId: integer("override_id").references(() => operatorOverrideRecords.id),
  patternDetected: text("pattern_detected"),
  suggestedRuleChange: jsonb("suggested_rule_change").$type<Record<string, any>>(),
  confidenceScore: real("confidence_score"),
  applied: boolean("applied").default(false),
  appliedAt: timestamp("applied_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  olr_override_idx: index("olr_override_idx").on(t.overrideId),
}));
export type OverrideLearningRecord = typeof overrideLearningRecords.$inferSelect;

export const overridePatternSummaries = pgTable("override_pattern_summaries", {
  id: serial("id").primaryKey(),
  patternKey: text("pattern_key").notNull(),
  patternDescription: text("pattern_description").notNull(),
  occurrenceCount: integer("occurrence_count").default(1),
  lastOccurredAt: timestamp("last_occurred_at"),
  suggestedAction: text("suggested_action"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  ops_key_idx: index("ops_key_idx").on(t.patternKey),
}));
export type OverridePatternSummary = typeof overridePatternSummaries.$inferSelect;

export const revenueReconciliationReports = pgTable("revenue_reconciliation_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform"),
  period: text("period").notNull(),
  expectedRevenue: real("expected_revenue").default(0),
  actualRevenue: real("actual_revenue").default(0),
  discrepancy: real("discrepancy").default(0),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  reportedAt: timestamp("reported_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rrr_user_idx: index("rrr_user_idx").on(t.userId),
  rrr_period_idx: index("rrr_period_idx").on(t.period),
}));
export type RevenueReconciliationReport = typeof revenueReconciliationReports.$inferSelect;

export const promptDriftEvaluations = pgTable("prompt_drift_evaluations", {
  id: serial("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  promptVersion: text("prompt_version").notNull(),
  baselineVersion: text("baseline_version"),
  driftScore: real("drift_score").default(0),
  evaluationResult: text("evaluation_result").default("pass"),
  sampleInput: jsonb("sample_input").$type<Record<string, any>>().default({}),
  sampleOutput: jsonb("sample_output").$type<Record<string, any>>().default({}),
  baselineOutput: jsonb("baseline_output").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pde_agent_idx: index("pde_agent_idx").on(t.agentName),
  pde_version_idx: index("pde_version_idx").on(t.promptVersion),
}));
export type PromptDriftEvaluation = typeof promptDriftEvaluations.$inferSelect;

export const webhookDeliveryRecords = pgTable("webhook_delivery_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  webhookUrl: text("webhook_url"),
  source: text("source"),
  provider: text("provider"),
  eventType: text("event_type"),
  deliveryId: text("delivery_id"),
  deliveryStatus: text("delivery_status"),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  httpStatus: integer("http_status"),
  responseBody: text("response_body"),
  attemptNumber: integer("attempt_number").default(1),
  attempts: integer("attempts").default(1),
  maxAttempts: integer("max_attempts").default(3),
  signatureValid: boolean("signature_valid"),
  signatureError: text("signature_error"),
  errorMessage: text("error_message"),
  status: text("status").notNull().default("pending"),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  processedAt: timestamp("processed_at"),
  dlqId: integer("dlq_id"),
  ipAddress: text("ip_address"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  wdr_event_idx: index("wdr_event_idx").on(t.eventType),
  wdr_status_idx: index("wdr_status_idx").on(t.status),
  wdr_source_idx: index("wdr_source_idx2").on(t.source),
  wdr_created_idx: index("wdr_created_idx2").on(t.createdAt),
  wdr_delivery_idx: index("wdr_delivery_idx2").on(t.deliveryId),
}));
export type WebhookDeliveryRecord = typeof webhookDeliveryRecords.$inferSelect;

export const featureSunsetRecords = pgTable("feature_sunset_records", {
  id: serial("id").primaryKey(),
  featureKey: text("feature_key").notNull(),
  sunsetReason: text("sunset_reason"),
  sunsetPhase: text("sunset_phase").notNull().default("announced"),
  announcedAt: timestamp("announced_at"),
  deprecatedAt: timestamp("deprecated_at"),
  removedAt: timestamp("removed_at"),
  affectedUsers: integer("affected_users").default(0),
  migrationPath: text("migration_path"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  fsr_feature_idx: index("fsr_feature_idx").on(t.featureKey),
  fsr_phase_idx: index("fsr_phase_idx").on(t.sunsetPhase),
}));
export type FeatureSunsetRecord = typeof featureSunsetRecords.$inferSelect;

export const continuityOperationsPackets = pgTable("continuity_operations_packets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  packetType: text("packet_type").notNull(),
  version: integer("version").default(1),
  status: text("status").notNull().default("active"),
  summary: text("summary"),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  cop_user_idx: index("cop_user_idx").on(t.userId),
  cop_type_idx: index("cop_type_idx").on(t.packetType),
}));
export type ContinuityOperationsPacket = typeof continuityOperationsPackets.$inferSelect;

export const continuityPacketSections = pgTable("continuity_packet_sections", {
  id: serial("id").primaryKey(),
  packetId: integer("packet_id").references(() => continuityOperationsPackets.id),
  sectionKey: text("section_key").notNull(),
  sectionTitle: text("section_title").notNull(),
  content: jsonb("content").$type<Record<string, any>>().default({}),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  cps_packet_idx: index("cps_packet_idx").on(t.packetId),
  cps_key_idx: index("cps_key_idx").on(t.sectionKey),
}));
export type ContinuityPacketSection = typeof continuityPacketSections.$inferSelect;

export const systemSelfAssessmentReports = pgTable("system_self_assessment_reports", {
  id: serial("id").primaryKey(),
  reportType: text("report_type").notNull(),
  overallScore: real("overall_score").default(0),
  categoryScores: jsonb("category_scores").$type<Record<string, number>>().default({}),
  findings: jsonb("findings").$type<Record<string, any>[]>().default([]),
  recommendations: jsonb("recommendations").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  assessedAt: timestamp("assessed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ssar_type_idx: index("ssar_type_idx").on(t.reportType),
  ssar_assessed_idx: index("ssar_assessed_idx").on(t.assessedAt),
}));
export type SystemSelfAssessmentReport = typeof systemSelfAssessmentReports.$inferSelect;
export const insertWebhookDeliveryRecordSchema = createInsertSchema(webhookDeliveryRecords).omit({ id: true, createdAt: true });
export type InsertWebhookDeliveryRecord = z.infer<typeof insertWebhookDeliveryRecordSchema>;

export const contentAtoms = pgTable("content_atoms", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  atomType: text("atom_type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  sourceVideoId: integer("source_video_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  provenance: jsonb("provenance").$type<Record<string, any>>().default({}),
  sealed: boolean("sealed").default(false),
  sealedAt: timestamp("sealed_at"),
  fingerprint: text("fingerprint"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  catom_user_idx: index("catom_user_idx").on(t.userId),
  catom_type_idx: index("catom_type_idx").on(t.atomType),
  catom_sealed_idx: index("catom_sealed_idx").on(t.sealed),
}));
export type ContentAtom = typeof contentAtoms.$inferSelect;

export const replayFactoryJobs = pgTable("replay_factory_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceAtomId: integer("source_atom_id"),
  replayType: text("replay_type").notNull(),
  status: text("status").notNull().default("pending"),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  result: jsonb("result").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  rfj_user_idx: index("rfj_user_idx").on(t.userId),
  rfj_status_idx: index("rfj_status_idx").on(t.status),
}));
export type ReplayFactoryJob = typeof replayFactoryJobs.$inferSelect;

export const clipQueueItems = pgTable("clip_queue_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceAtomId: integer("source_atom_id"),
  sourceVideoId: integer("source_video_id"),
  clipType: text("clip_type").notNull(),
  startTime: real("start_time"),
  endTime: real("end_time"),
  priority: integer("priority").default(0),
  status: text("status").notNull().default("queued"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  cqi_user_idx: index("cqi_user_idx").on(t.userId),
  cqi_status_idx: index("cqi_status_idx").on(t.status),
  cqi_priority_idx: index("cqi_priority_idx").on(t.priority),
}));
export type ClipQueueItem = typeof clipQueueItems.$inferSelect;

export const provenanceTags = pgTable("provenance_tags", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  tagType: text("tag_type").notNull(),
  origin: text("origin").notNull(),
  agentName: text("agent_name"),
  confidence: real("confidence"),
  chain: jsonb("chain").$type<Record<string, any>[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pt_entity_idx: index("pt_entity_idx").on(t.entityType, t.entityId),
  pt_tag_type_idx: index("pt_tag_type_idx").on(t.tagType),
}));
export type ProvenanceTag = typeof provenanceTags.$inferSelect;

export const decisionTheaterEntries = pgTable("decision_theater_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  actionType: text("action_type").notNull(),
  evidence: jsonb("evidence").$type<Record<string, any>[]>().default([]),
  confidence: real("confidence").notNull(),
  risk: text("risk").notNull().default("low"),
  signalCount: integer("signal_count").default(0),
  recency: real("recency"),
  reasoning: jsonb("reasoning").$type<Record<string, any>>().default({}),
  outcome: text("outcome"),
  band: text("band").notNull().default("GREEN"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dte_user_idx: index("dte_user_idx").on(t.userId),
  dte_agent_idx: index("dte_agent_idx").on(t.agentName),
  dte_band_idx: index("dte_band_idx").on(t.band),
}));
export type DecisionTheaterEntry = typeof decisionTheaterEntries.$inferSelect;

export const brandDriftAlerts = pgTable("brand_drift_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull().default("low"),
  description: text("description").notNull(),
  driftScore: real("drift_score").default(0),
  evidence: jsonb("evidence").$type<Record<string, any>>().default({}),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  bda_user_idx: index("bda_user_idx").on(t.userId),
  bda_severity_idx: index("bda_severity_idx").on(t.severity),
}));
export type BrandDriftAlert = typeof brandDriftAlerts.$inferSelect;

export const safeToAutomateScores = pgTable("safe_to_automate_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  score: real("score").notNull(),
  factors: jsonb("factors").$type<Record<string, number>>().default({}),
  threshold: real("threshold").default(0.7),
  autoApproved: boolean("auto_approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  stas_user_idx: index("stas_user_idx").on(t.userId),
  stas_action_idx: index("stas_action_idx").on(t.actionType),
}));
export type SafeToAutomateScore = typeof safeToAutomateScores.$inferSelect;

export const shadowAudienceSimulations = pgTable("shadow_audience_simulations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentAtomId: integer("content_atom_id"),
  simulationType: text("simulation_type").notNull(),
  predictedEngagement: real("predicted_engagement"),
  predictedRetention: real("predicted_retention"),
  audienceSegments: jsonb("audience_segments").$type<Record<string, any>[]>().default([]),
  reasoning: text("reasoning"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  sas_user_idx: index("sas_user_idx").on(t.userId),
}));
export type ShadowAudienceSimulation = typeof shadowAudienceSimulations.$inferSelect;

export const narrativeArcs = pgTable("narrative_arcs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  arcType: text("arc_type").notNull(),
  structure: jsonb("structure").$type<Record<string, any>>().default({}),
  contentAtomIds: jsonb("content_atom_ids").$type<number[]>().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  na_user_idx: index("na_user_idx").on(t.userId),
}));
export type NarrativeArc = typeof narrativeArcs.$inferSelect;

export const momentGenomeClassifications = pgTable("moment_genome_classifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceVideoId: integer("source_video_id"),
  momentType: text("moment_type").notNull(),
  timestamp: real("timestamp"),
  duration: real("duration"),
  intensity: real("intensity"),
  tags: jsonb("tags").$type<string[]>().default([]),
  genome: jsonb("genome").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  mgc_user_idx: index("mgc_user_idx").on(t.userId),
  mgc_type_idx: index("mgc_type_idx").on(t.momentType),
}));
export type MomentGenomeClassification = typeof momentGenomeClassifications.$inferSelect;

export const contentVelocityMetrics = pgTable("content_velocity_metrics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(),
  contentCount: integer("content_count").default(0),
  publishRate: real("publish_rate"),
  qualityAvg: real("quality_avg"),
  engagementAvg: real("engagement_avg"),
  velocityScore: real("velocity_score"),
  trend: text("trend").default("stable"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  measuredAt: timestamp("measured_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  cvm_user_idx: index("cvm_user_idx").on(t.userId),
  cvm_period_idx: index("cvm_period_idx").on(t.period),
}));
export type ContentVelocityMetric = typeof contentVelocityMetrics.$inferSelect;

export const contentDemandGraphNodes = pgTable("content_demand_graph_nodes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  demandScore: real("demand_score").default(0),
  supplyScore: real("supply_score").default(0),
  gapScore: real("gap_score").default(0),
  trendDirection: text("trend_direction").default("stable"),
  sources: jsonb("sources").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  cdgn_user_idx: index("cdgn_user_idx").on(t.userId),
  cdgn_gap_idx: index("cdgn_gap_idx").on(t.gapScore),
}));
export type ContentDemandGraphNode = typeof contentDemandGraphNodes.$inferSelect;

export const learningDecayRecords = pgTable("learning_decay_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  signalType: text("signal_type").notNull(),
  originalWeight: real("original_weight").notNull(),
  currentWeight: real("current_weight").notNull(),
  decayRate: real("decay_rate").default(0.05),
  lastDecayAt: timestamp("last_decay_at").defaultNow(),
  contradictions: integer("contradictions").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ldr_user_idx: index("ldr_user_idx").on(t.userId),
  ldr_signal_idx: index("ldr_signal_idx").on(t.signalType),
}));
export type LearningDecayRecord = typeof learningDecayRecords.$inferSelect;

export const agentEvalAudits = pgTable("agent_eval_audits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  evalRunId: integer("eval_run_id"),
  auditType: text("audit_type").notNull(),
  violation: text("violation"),
  severity: text("severity").notNull().default("low"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  aea_user_idx: index("aea_user_idx").on(t.userId),
  aea_agent_idx: index("aea_agent_idx").on(t.agentName),
  aea_severity_idx: index("aea_severity_idx").on(t.severity),
}));
export type AgentEvalAudit = typeof agentEvalAudits.$inferSelect;

export const revenuLeakageDetections = pgTable("revenue_leakage_detections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  leakageType: text("leakage_type").notNull(),
  estimatedLoss: real("estimated_loss").default(0),
  source: text("source").notNull(),
  description: text("description"),
  status: text("status").notNull().default("detected"),
  resolution: text("resolution"),
  detectedAt: timestamp("detected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  rld_user_idx: index("rld_user_idx").on(t.userId),
  rld_type_idx: index("rld_type_idx").on(t.leakageType),
}));
export type RevenueLeakageDetection = typeof revenuLeakageDetections.$inferSelect;

export const liveOpsEvents = pgTable("live_ops_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  streamId: text("stream_id"),
  payload: jsonb("payload").default({}),
  source: text("source").notNull().default("system"),
  trustCost: real("trust_cost").default(0),
  approved: boolean("approved").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  loe_user_idx: index("loe_user_idx").on(t.userId),
  loe_type_idx: index("loe_type_idx").on(t.eventType),
  loe_stream_idx: index("loe_stream_idx").on(t.streamId),
}));
export type LiveOpsEvent = typeof liveOpsEvents.$inferSelect;

export const liveGameDetections = pgTable("live_game_detections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  gameTitle: text("game_title").notNull(),
  confidence: real("confidence").default(0),
  detectionMethod: text("detection_method").notNull().default("title_parse"),
  metadata: jsonb("metadata").default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lgd_user_idx: index("lgd_user_idx").on(t.userId),
  lgd_stream_idx: index("lgd_stream_idx").on(t.streamId),
}));
export type LiveGameDetection = typeof liveGameDetections.$inferSelect;

export const liveMomentCaptures = pgTable("live_moment_captures", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  momentType: text("moment_type").notNull(),
  timestamp: real("timestamp_sec").default(0),
  duration: real("duration_sec").default(0),
  intensity: real("intensity").default(0),
  clipPotential: real("clip_potential").default(0),
  description: text("description"),
  metadata: jsonb("metadata").default({}),
  status: text("status").notNull().default("captured"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lmc_user_idx: index("lmc_user_idx").on(t.userId),
  lmc_stream_idx: index("lmc_stream_idx").on(t.streamId),
  lmc_type_idx: index("lmc_type_idx").on(t.momentType),
}));
export type LiveMomentCapture = typeof liveMomentCaptures.$inferSelect;

export const liveBurnoutSignals = pgTable("live_burnout_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  signalType: text("signal_type").notNull(),
  severity: text("severity").notNull().default("low"),
  riskScore: real("risk_score").default(0),
  factors: jsonb("factors").default({}),
  recommendation: text("recommendation"),
  acknowledged: boolean("acknowledged").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lbs_user_idx: index("lbs_user_idx").on(t.userId),
}));
export type LiveBurnoutSignal = typeof liveBurnoutSignals.$inferSelect;

export const liveCrisisEvents = pgTable("live_crisis_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  crisisType: text("crisis_type").notNull(),
  severity: text("severity").notNull().default("low"),
  description: text("description"),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  reputationImpact: real("reputation_impact").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lce_user_idx: index("lce_user_idx").on(t.userId),
  lce_stream_idx: index("lce_stream_idx").on(t.streamId),
}));
export type LiveCrisisEvent = typeof liveCrisisEvents.$inferSelect;

export const liveCommerceEvents = pgTable("live_commerce_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  eventType: text("event_type").notNull(),
  amount: real("amount").default(0),
  currency: text("currency").notNull().default("USD"),
  source: text("source").notNull(),
  viewerCount: integer("viewer_count").default(0),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lcme_user_idx: index("lcme_user_idx").on(t.userId),
  lcme_stream_idx: index("lcme_stream_idx").on(t.streamId),
}));
export type LiveCommerceEvent = typeof liveCommerceEvents.$inferSelect;

export const liveAudienceGeo = pgTable("live_audience_geo", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  country: text("country").notNull(),
  region: text("region"),
  viewerCount: integer("viewer_count").default(0),
  percentage: real("percentage").default(0),
  peakConcurrent: integer("peak_concurrent").default(0),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lag_user_idx: index("lag_user_idx").on(t.userId),
  lag_stream_idx: index("lag_stream_idx").on(t.streamId),
}));
export type LiveAudienceGeo = typeof liveAudienceGeo.$inferSelect;

export const liveCoCreationSignals = pgTable("live_co_creation_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  signalType: text("signal_type").notNull(),
  source: text("source").notNull().default("chat"),
  content: text("content"),
  sentiment: real("sentiment").default(0),
  actionTaken: text("action_taken"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lccs_user_idx: index("lccs_user_idx").on(t.userId),
  lccs_stream_idx: index("lccs_stream_idx").on(t.streamId),
}));
export type LiveCoCreationSignal = typeof liveCoCreationSignals.$inferSelect;

export const liveLearningSignals = pgTable("live_learning_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  streamId: text("stream_id"),
  signalType: text("signal_type").notNull(),
  signalValue: real("signal_value").default(0),
  context: jsonb("context").default({}),
  appliedTo: text("applied_to"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  lls_user_idx: index("lls_user_idx").on(t.userId),
  lls_stream_idx: index("lls_stream_idx").on(t.streamId),
}));
export type LiveLearningSignal = typeof liveLearningSignals.$inferSelect;

export const onboardingStates = pgTable("onboarding_states", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(5),
  stepData: jsonb("step_data").$type<Record<string, any>>().default({}),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  obs_user_idx: index("obs_user_idx").on(t.userId),
}));
export type OnboardingState = typeof onboardingStates.$inferSelect;

export const distributionEvents = pgTable("distribution_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  contentId: text("content_id"),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  trustBudgetCost: real("trust_budget_cost").default(0),
  capabilityProbeResult: text("capability_probe_result"),
  policyGateResult: text("policy_gate_result"),
  errorMessage: text("error_message"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  dist_user_idx: index("dist_user_idx").on(t.userId),
  dist_platform_idx: index("dist_platform_idx").on(t.platform),
  dist_type_idx: index("dist_type_idx").on(t.eventType),
}));
export type DistributionEvent = typeof distributionEvents.$inferSelect;

export const cadenceIntelligence = pgTable("cadence_intelligence", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  optimalFrequency: real("optimal_frequency"),
  currentFrequency: real("current_frequency"),
  audienceRetention: real("audience_retention"),
  algorithmScore: real("algorithm_score"),
  bufferDays: integer("buffer_days").default(0),
  recommendations: jsonb("recommendations").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ci_user_idx: index("ci_user_idx").on(t.userId),
  ci_platform_idx: index("ci_platform_idx").on(t.platform),
}));
export type CadenceIntelligenceRecord = typeof cadenceIntelligence.$inferSelect;

export const platformDependencyScores = pgTable("platform_dependency_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  dependencyScore: real("dependency_score").default(0),
  revenueShare: real("revenue_share").default(0),
  audienceShare: real("audience_share").default(0),
  contentShare: real("content_share").default(0),
  riskLevel: text("risk_level").default("low"),
  migrationReadiness: real("migration_readiness").default(0),
  recommendations: jsonb("recommendations").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pds_user_idx: index("pds_user_idx").on(t.userId),
  pds_platform_idx: index("pds_platform_idx").on(t.platform),
}));
export type PlatformDependencyScore = typeof platformDependencyScores.$inferSelect;

export const algorithmRelationships = pgTable("algorithm_relationships", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  ctrResponse: real("ctr_response"),
  retentionResponse: real("retention_response"),
  recommendationRate: real("recommendation_rate"),
  algorithmFavor: real("algorithm_favor").default(0.5),
  patterns: jsonb("patterns").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  ar_user_idx: index("ar_user_idx").on(t.userId),
  ar_platform_idx: index("ar_platform_idx").on(t.platform),
}));
export type AlgorithmRelationship = typeof algorithmRelationships.$inferSelect;

export const trendArbitrageOpportunities = pgTable("trend_arbitrage_opportunities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  platform: text("platform").notNull(),
  saturationLevel: real("saturation_level").default(0),
  opportunityScore: real("opportunity_score").default(0),
  windowRemainingHours: real("window_remaining_hours"),
  competitorCount: integer("competitor_count").default(0),
  recommended: boolean("recommended").default(false),
  actedOn: boolean("acted_on").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  tao_user_idx: index("tao_user_idx").on(t.userId),
  tao_topic_idx: index("tao_topic_idx").on(t.topic),
}));
export type TrendArbitrageOpportunity = typeof trendArbitrageOpportunities.$inferSelect;

export const formatInnovations = pgTable("format_innovations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  formatName: text("format_name").notNull(),
  description: text("description"),
  adoptionStage: text("adoption_stage").default("emerging"),
  potentialScore: real("potential_score").default(0),
  competitorAdoption: real("competitor_adoption").default(0),
  recommended: boolean("recommended").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  fi_user_idx: index("fi_user_idx").on(t.userId),
  fi_platform_idx: index("fi_platform_idx").on(t.platform),
}));
export type FormatInnovation = typeof formatInnovations.$inferSelect;

export const contentTimingIntelligence = pgTable("content_timing_intelligence", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  dayOfWeek: integer("day_of_week"),
  hourOfDay: integer("hour_of_day"),
  timezone: text("timezone"),
  engagementScore: real("engagement_score").default(0),
  viewsMultiplier: real("views_multiplier").default(1),
  sampleSize: integer("sample_size").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  cti_user_idx: index("cti_user_idx").on(t.userId),
  cti_platform_idx: index("cti_platform_idx").on(t.platform),
}));
export type ContentTimingIntelligenceRecord = typeof contentTimingIntelligence.$inferSelect;

export const platformIndependenceScores = pgTable("platform_independence_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  overallScore: real("overall_score").default(0),
  singlePlatformRisk: real("single_platform_risk").default(0),
  diversificationScore: real("diversification_score").default(0),
  dataSovereigntyScore: real("data_sovereignty_score").default(0),
  roadmap: jsonb("roadmap").$type<string[]>().default([]),
  platformBreakdown: jsonb("platform_breakdown").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pis_user_idx: index("pis_user_idx").on(t.userId),
}));
export type PlatformIndependenceScore = typeof platformIndependenceScores.$inferSelect;

export const nicheAuthorityTracking = pgTable("niche_authority_tracking", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  niche: text("niche").notNull(),
  platform: text("platform").notNull(),
  authorityScore: real("authority_score").default(0),
  contentCount: integer("content_count").default(0),
  audienceReach: integer("audience_reach").default(0),
  competitorRank: integer("competitor_rank"),
  growthTrend: text("growth_trend").default("stable"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  nat_user_idx: index("nat_user_idx").on(t.userId),
  nat_niche_idx: index("nat_niche_idx").on(t.niche),
  nat_platform_idx: index("nat_platform_idx").on(t.platform),
}));
export type NicheAuthorityRecord = typeof nicheAuthorityTracking.$inferSelect;

export const insertDistributionEventSchema = createInsertSchema(distributionEvents).omit({ id: true, createdAt: true });
export type InsertDistributionEvent = z.infer<typeof insertDistributionEventSchema>;

export const insertCadenceIntelligenceSchema = createInsertSchema(cadenceIntelligence).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCadenceIntelligence = z.infer<typeof insertCadenceIntelligenceSchema>;

export const insertPlatformDependencyScoreSchema = createInsertSchema(platformDependencyScores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformDependencyScore = z.infer<typeof insertPlatformDependencyScoreSchema>;

export const insertAlgorithmRelationshipSchema = createInsertSchema(algorithmRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlgorithmRelationship = z.infer<typeof insertAlgorithmRelationshipSchema>;

export const insertTrendArbitrageOpportunitySchema = createInsertSchema(trendArbitrageOpportunities).omit({ id: true, createdAt: true });
export type InsertTrendArbitrageOpportunity = z.infer<typeof insertTrendArbitrageOpportunitySchema>;

export const insertFormatInnovationSchema = createInsertSchema(formatInnovations).omit({ id: true, createdAt: true });
export type InsertFormatInnovation = z.infer<typeof insertFormatInnovationSchema>;

export const insertContentTimingIntelligenceSchema = createInsertSchema(contentTimingIntelligence).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContentTimingIntelligence = z.infer<typeof insertContentTimingIntelligenceSchema>;

export const insertPlatformIndependenceScoreSchema = createInsertSchema(platformIndependenceScores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformIndependenceScore = z.infer<typeof insertPlatformIndependenceScoreSchema>;

export const insertNicheAuthorityTrackingSchema = createInsertSchema(nicheAuthorityTracking).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNicheAuthorityTracking = z.infer<typeof insertNicheAuthorityTrackingSchema>;

export const complianceDriftEvents = pgTable("compliance_drift_events", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  ruleCategory: text("rule_category").notNull(),
  driftType: text("drift_type").notNull(),
  previousHash: text("previous_hash"),
  currentHash: text("current_hash"),
  changesDetected: jsonb("changes_detected").$type<Array<{ field: string; oldValue: string; newValue: string }>>().default([]),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("detected"),
  resolvedAt: timestamp("resolved_at"),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (table) => [
  index("compliance_drift_platform_idx").on(table.platform),
  index("compliance_drift_status_idx").on(table.status),
]);

export type ComplianceDriftEvent = typeof complianceDriftEvents.$inferSelect;
export const insertComplianceDriftEventSchema = createInsertSchema(complianceDriftEvents).omit({ id: true, detectedAt: true });
export type InsertComplianceDriftEvent = z.infer<typeof insertComplianceDriftEventSchema>;

export const contentProvenance = pgTable("content_provenance", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: integer("content_id"),
  contentType: text("content_type").notNull(),
  assetName: text("asset_name").notNull(),
  originType: text("origin_type").notNull(),
  source: text("source"),
  licenseType: text("license_type"),
  licenseExpiry: timestamp("license_expiry"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  trustScore: integer("trust_score").default(50),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("content_provenance_user_idx").on(table.userId),
  index("content_provenance_origin_idx").on(table.originType),
]);

export type ContentProvenanceRecord = typeof contentProvenance.$inferSelect;
export const insertContentProvenanceSchema = createInsertSchema(contentProvenance).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContentProvenance = z.infer<typeof insertContentProvenanceSchema>;

export const creatorCredibilityScores = pgTable("creator_credibility_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id"),
  overallScore: integer("overall_score").notNull().default(50),
  complianceRate: integer("compliance_rate").default(100),
  strikeCount: integer("strike_count").default(0),
  warningCount: integer("warning_count").default(0),
  resolvedDisputeCount: integer("resolved_dispute_count").default(0),
  disclosureComplianceRate: integer("disclosure_compliance_rate").default(100),
  factors: jsonb("factors").$type<Record<string, number>>().default({}),
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("creator_credibility_user_idx").on(table.userId),
]);

export type CreatorCredibilityScore = typeof creatorCredibilityScores.$inferSelect;
export const insertCreatorCredibilityScoreSchema = createInsertSchema(creatorCredibilityScores).omit({ id: true, createdAt: true, updatedAt: true, lastCalculatedAt: true });
export type InsertCreatorCredibilityScore = z.infer<typeof insertCreatorCredibilityScoreSchema>;

export const policyPackBaselines = pgTable("policy_pack_baselines", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().unique(),
  policyHash: text("policy_hash").notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PolicyPackBaseline = typeof policyPackBaselines.$inferSelect;

// === PHASE 6B: EXCEPTION DESK ===
export const exceptionDeskItems = pgTable("exception_desk_items", {
  id: serial("id").primaryKey(),
  severity: text("severity").notNull().default("medium"),
  category: text("category").notNull(),
  source: text("source").notNull(),
  sourceId: text("source_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  suggestedResolution: text("suggested_resolution"),
  status: text("status").notNull().default("open"),
  assignee: text("assignee"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  userId: text("user_id"),
  resolvedAt: timestamp("resolved_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("exception_desk_severity_idx").on(table.severity),
  index("exception_desk_status_idx").on(table.status),
  index("exception_desk_source_idx").on(table.source),
  index("exception_desk_category_idx").on(table.category),
]);

export type ExceptionDeskItem = typeof exceptionDeskItems.$inferSelect;
export const insertExceptionDeskItemSchema = createInsertSchema(exceptionDeskItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExceptionDeskItem = z.infer<typeof insertExceptionDeskItemSchema>;

// === PHASE 6C: TRUST & GOVERNANCE HARDENING ===

export const governanceAuditLogs = pgTable("governance_audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  domain: text("domain").notNull(),
  severity: text("severity").notNull().default("info"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
  outcome: text("outcome").notNull().default("success"),
  performedBy: text("performed_by").notNull().default("system"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("gov_audit_user_idx").on(t.userId),
  index("gov_audit_action_idx").on(t.action),
  index("gov_audit_domain_idx").on(t.domain),
  index("gov_audit_created_idx").on(t.createdAt),
]);
export type GovernanceAuditLog = typeof governanceAuditLogs.$inferSelect;

export const channelImmuneEvents = pgTable("channel_immune_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id"),
  threatType: text("threat_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  indicators: jsonb("indicators").$type<Record<string, any>>().default({}),
  defensiveAction: text("defensive_action"),
  status: text("status").notNull().default("detected"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cie_user_idx").on(t.userId),
  index("cie_threat_idx").on(t.threatType),
  index("cie_status_idx").on(t.status),
  index("cie_created_idx").on(t.createdAt),
]);
export type ChannelImmuneEvent = typeof channelImmuneEvents.$inferSelect;

export const communityTrustSignals = pgTable("community_trust_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  signalType: text("signal_type").notNull(),
  value: real("value").notNull().default(0),
  weight: real("weight").notNull().default(1),
  source: text("source").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cts_user_idx").on(t.userId),
  index("cts_type_idx").on(t.signalType),
  index("cts_created_idx").on(t.createdAt),
]);
export type CommunityTrustSignal = typeof communityTrustSignals.$inferSelect;

export const narrativePromises = pgTable("narrative_promises", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  promiseType: text("promise_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default("active"),
  deliveryProgress: real("delivery_progress").notNull().default(0),
  riskLevel: text("risk_level").notNull().default("low"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("np_user_idx").on(t.userId),
  index("np_status_idx").on(t.status),
  index("np_deadline_idx").on(t.deadline),
]);
export type NarrativePromise = typeof narrativePromises.$inferSelect;

export const licensingExchangeAssets = pgTable("licensing_exchange_assets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  assetType: text("asset_type").notNull(),
  assetId: text("asset_id").notNull(),
  title: text("title").notNull(),
  licensingStatus: text("licensing_status").notNull().default("unlicensed"),
  rightsVerified: boolean("rights_verified").notNull().default(false),
  readinessScore: real("readiness_score").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("lea_user_idx").on(t.userId),
  index("lea_status_idx").on(t.licensingStatus),
  index("lea_asset_idx").on(t.assetId),
]);
export type LicensingExchangeAsset = typeof licensingExchangeAssets.$inferSelect;

export const signalContradictions = pgTable("signal_contradictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  domain: text("domain").notNull(),
  signalAId: integer("signal_a_id").notNull(),
  signalBId: integer("signal_b_id").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("medium"),
  resolution: text("resolution"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("sc_user_idx").on(t.userId),
  index("sc_domain_idx").on(t.domain),
  index("sc_status_idx").on(t.status),
]);
export type SignalContradiction = typeof signalContradictions.$inferSelect;

export const financialAuditTrail = pgTable("financial_audit_trail", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeSnapshot: jsonb("before_snapshot").$type<Record<string, any>>().default({}),
  afterSnapshot: jsonb("after_snapshot").$type<Record<string, any>>().default({}),
  changeAmount: real("change_amount"),
  currency: text("currency").default("USD"),
  checksum: text("checksum").notNull(),
  source: text("source").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("fat_user_idx").on(t.userId),
  index("fat_entity_idx").on(t.entityType, t.entityId),
  index("fat_action_idx").on(t.action),
  index("fat_created_idx").on(t.createdAt),
]);
export type FinancialAuditEntry = typeof financialAuditTrail.$inferSelect;

export const metricRollups = pgTable("metric_rollups", {
  id: serial("id").primaryKey(),
  metricName: text("metric_name").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  count: integer("count").notNull().default(0),
  sum: real("sum").notNull().default(0),
  avg: real("avg").notNull().default(0),
  min: real("min").notNull().default(0),
  max: real("max").notNull().default(0),
  unit: text("unit").notNull(),
  tags: jsonb("tags").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("mr_metric_idx").on(t.metricName),
  index("mr_period_idx").on(t.periodStart, t.periodEnd),
  uniqueIndex("mr_metric_period_unique").on(t.metricName, t.periodStart, t.periodEnd),
]);
export type MetricRollup = typeof metricRollups.$inferSelect;

export const liveOriginEvents = pgTable("live_origin_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourcePlatform: text("source_platform").notNull(),
  sourceStreamId: text("source_stream_id").notNull(),
  sourceChannelId: text("source_channel_id"),
  eventType: text("event_type").notNull(),
  electedAsSource: boolean("elected_as_source").default(false),
  duplicateSuppressed: boolean("duplicate_suppressed").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (t) => [
  index("lorig_user_idx").on(t.userId),
  index("lorig_source_idx").on(t.sourcePlatform, t.sourceStreamId),
  index("lorig_detected_idx").on(t.detectedAt),
]);
export type LiveOriginEvent = typeof liveOriginEvents.$inferSelect;

export const multistreamSessions = pgTable("multistream_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  originEventId: integer("origin_event_id").references(() => liveOriginEvents.id),
  sourcePlatform: text("source_platform").notNull(),
  sourceStreamId: text("source_stream_id").notNull(),
  status: text("status").notNull().default("initializing"),
  destinationCount: integer("destination_count").default(0),
  launchedDestinations: integer("launched_destinations").default(0),
  failedDestinations: integer("failed_destinations").default(0),
  readinessScore: real("readiness_score").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
}, (t) => [
  index("ms_user_idx").on(t.userId),
  index("ms_status_idx").on(t.status),
  index("ms_started_idx").on(t.startedAt),
]);
export type MultistreamSession = typeof multistreamSessions.$inferSelect;

export const multistreamDestinations = pgTable("multistream_destinations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => multistreamSessions.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  channelId: text("channel_id"),
  streamKey: text("stream_key"),
  ingestUrl: text("ingest_url"),
  status: text("status").notNull().default("pending"),
  launchOrder: integer("launch_order").default(0),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  failureReason: text("failure_reason"),
  platformStreamId: text("platform_stream_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  eligibleAt: timestamp("eligible_at"),
  launchedAt: timestamp("launched_at"),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("md_session_idx").on(t.sessionId),
  index("md_platform_idx").on(t.platform),
  index("md_status_idx").on(t.status),
]);
export type MultistreamDestination = typeof multistreamDestinations.$inferSelect;

export const liveDestinationStateHistory = pgTable("live_destination_state_history", {
  id: serial("id").primaryKey(),
  destinationId: integer("destination_id").references(() => multistreamDestinations.id, { onDelete: "cascade" }),
  previousState: text("previous_state"),
  newState: text("new_state").notNull(),
  reason: text("reason"),
  triggeredBy: text("triggered_by"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  changedAt: timestamp("changed_at").defaultNow(),
}, (t) => [
  index("ldsh_dest_idx").on(t.destinationId),
  index("ldsh_changed_idx").on(t.changedAt),
]);
export type LiveDestinationStateHistoryRecord = typeof liveDestinationStateHistory.$inferSelect;

export const livePublishAttempts = pgTable("live_publish_attempts", {
  id: serial("id").primaryKey(),
  destinationId: integer("destination_id").references(() => multistreamDestinations.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => multistreamSessions.id),
  platform: text("platform").notNull(),
  action: text("action").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  success: boolean("success").default(false),
  responseCode: integer("response_code"),
  errorMessage: text("error_message"),
  latencyMs: integer("latency_ms"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  attemptedAt: timestamp("attempted_at").defaultNow(),
}, (t) => [
  index("lpa_dest_idx").on(t.destinationId),
  index("lpa_session_idx").on(t.sessionId),
  index("lpa_idempotency_idx").on(t.idempotencyKey),
  index("lpa_attempted_idx").on(t.attemptedAt),
]);
export type LivePublishAttempt = typeof livePublishAttempts.$inferSelect;

export const liveCapabilitySnapshots = pgTable("live_capability_snapshots", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  channelId: text("channel_id"),
  capability: text("capability").notNull(),
  supported: boolean("supported").default(false),
  status: text("status").notNull().default("unknown"),
  streamKeyConfigured: boolean("stream_key_configured").default(false),
  partnerRestrictions: jsonb("partner_restrictions").$type<string[]>().default([]),
  geoRestrictions: jsonb("geo_restrictions").$type<string[]>().default([]),
  featureSupport: jsonb("feature_support").$type<Record<string, boolean>>().default({}),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
}, (t) => [
  index("lcs_platform_idx").on(t.platform),
  index("lcs_capability_idx").on(t.capability),
  index("lcs_snapshot_idx").on(t.snapshotAt),
]);
export type LiveCapabilitySnapshot = typeof liveCapabilitySnapshots.$inferSelect;

export const liveMetadataVariants = pgTable("live_metadata_variants", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => multistreamSessions.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").references(() => multistreamDestinations.id),
  platform: text("platform").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  tags: jsonb("tags").$type<string[]>().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().default([]),
  orientation: text("orientation").default("horizontal"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => [
  index("lmv_session_idx").on(t.sessionId),
  index("lmv_platform_idx").on(t.platform),
]);
export type LiveMetadataVariant = typeof liveMetadataVariants.$inferSelect;

export const liveThumbnailVariants = pgTable("live_thumbnail_variants", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => multistreamSessions.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").references(() => multistreamDestinations.id),
  platform: text("platform").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  resolution: text("resolution"),
  aspectRatio: text("aspect_ratio"),
  variant: text("variant").default("primary"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => [
  index("ltv_session_idx").on(t.sessionId),
  index("ltv_platform_idx").on(t.platform),
]);
export type LiveThumbnailVariant = typeof liveThumbnailVariants.$inferSelect;

export const liveReconciliationRuns = pgTable("live_reconciliation_runs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => multistreamSessions.id),
  runType: text("run_type").notNull().default("periodic"),
  destinationsChecked: integer("destinations_checked").default(0),
  driftsDetected: integer("drifts_detected").default(0),
  repairsAttempted: integer("repairs_attempted").default(0),
  repairsSucceeded: integer("repairs_succeeded").default(0),
  overallHealth: real("overall_health").default(1),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("lrr_session_idx").on(t.sessionId),
  index("lrr_started_idx").on(t.startedAt),
]);
export type LiveReconciliationRun = typeof liveReconciliationRuns.$inferSelect;

export const liveReconciliationDriftRecords = pgTable("live_reconciliation_drift_records", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => liveReconciliationRuns.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").references(() => multistreamDestinations.id),
  platform: text("platform").notNull(),
  driftType: text("drift_type").notNull(),
  internalState: text("internal_state"),
  platformState: text("platform_state"),
  severity: text("severity").notNull().default("low"),
  repairAction: text("repair_action"),
  repairResult: text("repair_result"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (t) => [
  index("lrdr_run_idx").on(t.runId),
  index("lrdr_dest_idx").on(t.destinationId),
  index("lrdr_severity_idx").on(t.severity),
]);
export type LiveReconciliationDriftRecord = typeof liveReconciliationDriftRecords.$inferSelect;

export const liveCommandCenterSessions = pgTable("live_command_center_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  multistreamSessionId: integer("multistream_session_id"),
  status: text("status").notNull().default("active"),
  clarityScore: real("clarity_score").default(1),
  opsHealthScore: real("ops_health_score").default(1),
  destStabilityScore: real("dest_stability_score").default(1),
  monetizationTimingScore: real("monetization_timing_score").default(1),
  trustPressureScore: real("trust_pressure_score").default(0),
  recoveryReadinessScore: real("recovery_readiness_score").default(1),
  activePanels: jsonb("active_panels").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
}, (t) => [
  index("lcc_sess_user_idx").on(t.userId),
  index("lcc_sess_status_idx").on(t.status),
]);
export type LiveCommandCenterSession = typeof liveCommandCenterSessions.$inferSelect;

export const liveCommandCenterActions = pgTable("live_command_center_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveCommandCenterSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  panel: text("panel").notNull(),
  approvalClass: text("approval_class").default("green"),
  approved: boolean("approved").default(true),
  reason: text("reason"),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  executedAt: timestamp("executed_at").defaultNow(),
}, (t) => [
  index("lcca_session_idx").on(t.sessionId),
  index("lcca_user_idx").on(t.userId),
  index("lcca_type_idx").on(t.actionType),
]);
export type LiveCommandCenterAction = typeof liveCommandCenterActions.$inferSelect;

export const liveCommandCenterPanelStates = pgTable("live_command_center_panel_states", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveCommandCenterSessions.id, { onDelete: "cascade" }),
  panel: text("panel").notNull(),
  status: text("status").notNull().default("healthy"),
  signalCount: integer("signal_count").default(0),
  alertCount: integer("alert_count").default(0),
  lastSignal: jsonb("last_signal").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("lccps_session_idx").on(t.sessionId),
  index("lccps_panel_idx").on(t.panel),
]);
export type LiveCommandCenterPanelState = typeof liveCommandCenterPanelStates.$inferSelect;

export const liveChatAggregates = pgTable("live_chat_aggregates", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  platform: text("platform").notNull(),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  messageCount: integer("message_count").default(0),
  uniqueUsers: integer("unique_users").default(0),
  sentimentScore: real("sentiment_score").default(0),
  topQuestions: jsonb("top_questions").$type<string[]>().default([]),
  topEmotes: jsonb("top_emotes").$type<string[]>().default([]),
  moderationAlerts: integer("moderation_alerts").default(0),
  languageBreakdown: jsonb("language_breakdown").$type<Record<string, number>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lca_session_idx").on(t.sessionId),
  index("lca_platform_idx").on(t.platform),
  index("lca_window_idx").on(t.windowStart),
]);
export type LiveChatAggregate = typeof liveChatAggregates.$inferSelect;

export const liveCommerceSignals = pgTable("live_commerce_signals", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  userId: text("user_id").notNull(),
  signalType: text("signal_type").notNull(),
  platform: text("platform"),
  triggerMoment: text("trigger_moment"),
  opportunity: text("opportunity"),
  confidence: real("confidence").default(0),
  ctaFatigueRisk: real("cta_fatigue_risk").default(0),
  sponsorSafe: boolean("sponsor_safe").default(true),
  revenueIntent: real("revenue_intent").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (t) => [
  index("lcoms_session_idx").on(t.sessionId),
  index("lcoms_type_idx").on(t.signalType),
  index("lcoms_detected_idx").on(t.detectedAt),
]);
export type LiveCommerceSignal = typeof liveCommerceSignals.$inferSelect;

export const liveTrustBudgetEvents = pgTable("live_trust_budget_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  budgetBefore: real("budget_before").default(100),
  budgetAfter: real("budget_after").default(100),
  cost: real("cost").default(0),
  source: text("source"),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  occurredAt: timestamp("occurred_at").defaultNow(),
}, (t) => [
  index("ltbe_session_idx").on(t.sessionId),
  index("ltbe_user_idx").on(t.userId),
  index("ltbe_occurred_idx").on(t.occurredAt),
]);
export type LiveTrustBudgetEvent = typeof liveTrustBudgetEvents.$inferSelect;

export const liveMetadataUpdateReasons = pgTable("live_metadata_update_reasons", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  destinationId: integer("destination_id"),
  platform: text("platform").notNull(),
  field: text("field").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  reason: text("reason").notNull(),
  signalSource: text("signal_source"),
  approved: boolean("approved").default(true),
  appliedAt: timestamp("applied_at").defaultNow(),
}, (t) => [
  index("lmur_session_idx").on(t.sessionId),
  index("lmur_platform_idx").on(t.platform),
]);
export type LiveMetadataUpdateReason = typeof liveMetadataUpdateReasons.$inferSelect;

export const liveRecoveryActions = pgTable("live_recovery_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  targetPlatform: text("target_platform"),
  targetDestinationId: integer("target_destination_id"),
  status: text("status").notNull().default("pending"),
  approvalRequired: boolean("approval_required").default(false),
  approved: boolean("approved"),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  requestedAt: timestamp("requested_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("lra_session_idx").on(t.sessionId),
  index("lra_user_idx").on(t.userId),
  index("lra_status_idx").on(t.status),
]);
export type LiveRecoveryAction = typeof liveRecoveryActions.$inferSelect;

export const liveProductionCrewSessions = pgTable("live_production_crew_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  commandCenterSessionId: integer("command_center_session_id").references(() => liveCommandCenterSessions.id),
  streamId: integer("stream_id").references(() => streams.id),
  status: text("status").notNull().default("active"),
  activeRoles: jsonb("active_roles").$type<string[]>().default([]),
  crewConfig: jsonb("crew_config").$type<Record<string, any>>().default({}),
  interruptPolicy: text("interrupt_policy").notNull().default("standard"),
  scores: jsonb("scores").$type<Record<string, number>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
}, (t) => [
  index("lpc_sess_user_idx").on(t.userId),
  index("lpc_sess_status_idx").on(t.status),
  index("lpc_sess_stream_idx").on(t.streamId),
]);
export type LiveProductionCrewSession = typeof liveProductionCrewSessions.$inferSelect;

export const liveCommunityActions = pgTable("live_community_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  platform: text("platform").notNull(),
  content: text("content"),
  targetUser: text("target_user"),
  riskLevel: text("risk_level").notNull().default("low"),
  approvalClass: text("approval_class").notNull().default("green"),
  autoApproved: boolean("auto_approved").notNull().default(true),
  brandVoiceCompliant: boolean("brand_voice_compliant").notNull().default(true),
  triggerSignal: text("trigger_signal"),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lcomm_session_idx").on(t.sessionId),
  index("lcomm_user_idx").on(t.userId),
  index("lcomm_type_idx").on(t.actionType),
  index("lcomm_risk_idx").on(t.riskLevel),
]);
export type LiveCommunityAction = typeof liveCommunityActions.$inferSelect;

export const liveModerationEvents = pgTable("live_moderation_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  eventType: text("event_type").notNull(),
  targetUser: text("target_user"),
  targetContent: text("target_content"),
  detectionMethod: text("detection_method").notNull().default("automated"),
  severity: text("severity").notNull().default("low"),
  actionTaken: text("action_taken"),
  escalated: boolean("escalated").notNull().default(false),
  escalationReason: text("escalation_reason"),
  platformPolicyRef: text("platform_policy_ref"),
  confidenceScore: real("confidence_score").default(0),
  status: text("status").notNull().default("detected"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("lme_session_idx").on(t.sessionId),
  index("lme_user_idx").on(t.userId),
  index("lme_severity_idx").on(t.severity),
  index("lme_type_idx").on(t.eventType),
]);
export type LiveModerationEvent = typeof liveModerationEvents.$inferSelect;

export const liveSeoActions = pgTable("live_seo_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  actionType: text("action_type").notNull(),
  field: text("field").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  triggerSignal: text("trigger_signal").notNull(),
  signalSource: text("signal_source"),
  trustCost: real("trust_cost").default(0),
  approved: boolean("approved").notNull().default(false),
  approvalClass: text("approval_class").notNull().default("yellow"),
  volatilityCheck: boolean("volatility_check").notNull().default(true),
  status: text("status").notNull().default("proposed"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  proposedAt: timestamp("proposed_at").defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (t) => [
  index("lsa_session_idx").on(t.sessionId),
  index("lsa_user_idx").on(t.userId),
  index("lsa_field_idx").on(t.field),
  index("lsa_status_idx").on(t.status),
]);
export type LiveSeoAction = typeof liveSeoActions.$inferSelect;

export const liveCrewThumbnailActions = pgTable("live_crew_thumbnail_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  actionType: text("action_type").notNull(),
  variantId: integer("variant_id"),
  thumbnailUrl: text("thumbnail_url"),
  previousUrl: text("previous_url"),
  triggerSignal: text("trigger_signal"),
  capabilityAware: boolean("capability_aware").notNull().default(true),
  honestyCompliant: boolean("honesty_compliant").notNull().default(true),
  approved: boolean("approved").notNull().default(false),
  status: text("status").notNull().default("proposed"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  proposedAt: timestamp("proposed_at").defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (t) => [
  index("lcta_session_idx").on(t.sessionId),
  index("lcta_user_idx").on(t.userId),
  index("lcta_platform_idx").on(t.platform),
]);
export type LiveCrewThumbnailAction = typeof liveCrewThumbnailActions.$inferSelect;

export const liveMomentMarkers = pgTable("live_moment_markers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  streamId: integer("stream_id").references(() => streams.id),
  markerType: text("marker_type").notNull(),
  title: text("title"),
  timestampStart: real("timestamp_start").notNull(),
  timestampEnd: real("timestamp_end"),
  intensityScore: real("intensity_score").default(0),
  clipTriggered: boolean("clip_triggered").notNull().default(false),
  clipId: integer("clip_id"),
  archiveMarker: boolean("archive_marker").notNull().default(false),
  replayQueued: boolean("replay_queued").notNull().default(false),
  triggerSignal: text("trigger_signal"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
}, (t) => [
  index("lmm_session_idx").on(t.sessionId),
  index("lmm_user_idx").on(t.userId),
  index("lmm_stream_idx").on(t.streamId),
  index("lmm_type_idx").on(t.markerType),
]);
export type LiveMomentMarker = typeof liveMomentMarkers.$inferSelect;

export const liveCtaRecommendations = pgTable("live_cta_recommendations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  ctaType: text("cta_type").notNull(),
  content: text("content"),
  platform: text("platform"),
  triggerSignal: text("trigger_signal").notNull(),
  audienceToleranceScore: real("audience_tolerance_score").default(1),
  sponsorSafe: boolean("sponsor_safe").notNull().default(true),
  trustCost: real("trust_cost").default(0),
  fatigueRisk: text("fatigue_risk").notNull().default("low"),
  approved: boolean("approved").notNull().default(false),
  approvalClass: text("approval_class").notNull().default("yellow"),
  status: text("status").notNull().default("proposed"),
  windowStart: timestamp("window_start"),
  windowEnd: timestamp("window_end"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  proposedAt: timestamp("proposed_at").defaultNow(),
  executedAt: timestamp("executed_at"),
}, (t) => [
  index("lcr_session_idx").on(t.sessionId),
  index("lcr_user_idx").on(t.userId),
  index("lcr_status_idx").on(t.status),
  index("lcr_fatigue_idx").on(t.fatigueRisk),
]);
export type LiveCtaRecommendation = typeof liveCtaRecommendations.$inferSelect;

export const creatorInterruptEvents = pgTable("creator_interrupt_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  interruptType: text("interrupt_type").notNull(),
  source: text("source").notNull(),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description"),
  valueScore: real("value_score").notNull().default(0.5),
  thresholdPassed: boolean("threshold_passed").notNull().default(true),
  acknowledged: boolean("acknowledged").notNull().default(false),
  actionTaken: text("action_taken"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  firedAt: timestamp("fired_at").defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
}, (t) => [
  index("crint_session_idx").on(t.sessionId),
  index("crint_user_idx").on(t.userId),
  index("crint_type_idx").on(t.interruptType),
  index("crint_severity_idx").on(t.severity),
]);
export type CreatorInterruptEvent = typeof creatorInterruptEvents.$inferSelect;

export const liveChatIntentClusters = pgTable("live_chat_intent_clusters", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  clusterLabel: text("cluster_label").notNull(),
  intent: text("intent").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  uniqueUsers: integer("unique_users").notNull().default(0),
  sentiment: real("sentiment").default(0),
  actionable: boolean("actionable").notNull().default(false),
  autoResponseEligible: boolean("auto_response_eligible").notNull().default(false),
  sampleMessages: jsonb("sample_messages").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  detectedAt: timestamp("detected_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (t) => [
  index("lcic_session_idx").on(t.sessionId),
  index("lcic_user_idx").on(t.userId),
  index("lcic_intent_idx").on(t.intent),
]);
export type LiveChatIntentCluster = typeof liveChatIntentClusters.$inferSelect;

export const liveEngagementPrompts = pgTable("live_engagement_prompts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveProductionCrewSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  promptType: text("prompt_type").notNull(),
  content: text("content").notNull(),
  platform: text("platform"),
  triggerSignal: text("trigger_signal"),
  riskLevel: text("risk_level").notNull().default("low"),
  brandVoiceCompliant: boolean("brand_voice_compliant").notNull().default(true),
  autoDeployable: boolean("auto_deployable").notNull().default(false),
  deployed: boolean("deployed").notNull().default(false),
  engagementResult: jsonb("engagement_result").$type<Record<string, any>>().default({}),
  status: text("status").notNull().default("ready"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  deployedAt: timestamp("deployed_at"),
}, (t) => [
  index("lep_session_idx").on(t.sessionId),
  index("lep_user_idx").on(t.userId),
  index("lep_type_idx").on(t.promptType),
  index("lep_status_idx").on(t.status),
]);

export const scoreRegistry = pgTable("score_registry", {
  id: serial("id").primaryKey(),
  scoreKey: text("score_key").notNull().unique(),
  ownerSystem: text("owner_system").notNull(),
  scoreType: text("score_type").notNull().default("descriptive"),
  formulaVersion: text("formula_version").notNull().default("1.0"),
  inputSources: jsonb("input_sources").$type<string[]>().default([]),
  confidencePolicy: text("confidence_policy").default("standard"),
  decayPolicy: text("decay_policy").default("none"),
  displayPolicy: text("display_policy").default("visible"),
  gatingUsage: text("gating_usage"),
  arbitrationPriority: integer("arbitration_priority").default(0),
  updateCadence: text("update_cadence").default("on-demand"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type ScoreRegistryRecord = typeof scoreRegistry.$inferSelect;

export const sourcePackRegistry = pgTable("source_pack_registry", {
  id: serial("id").primaryKey(),
  packKey: text("pack_key").notNull().unique(),
  ownerSystem: text("owner_system").notNull(),
  allowedSourceClasses: jsonb("allowed_source_classes").$type<string[]>().default([]),
  trustRanking: jsonb("trust_ranking").$type<Record<string, number>>().default({}),
  freshnessRuleDays: integer("freshness_rule_days").default(30),
  contradictionHandling: text("contradiction_handling").default("flag"),
  fallbackBehavior: text("fallback_behavior").default("degrade"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});
export type SourcePackRegistryRecord = typeof sourcePackRegistry.$inferSelect;

export const sourcePackMembers = pgTable("source_pack_members", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull(),
  sourceClass: text("source_class").notNull(),
  sourceUri: text("source_uri"),
  trustScore: real("trust_score").default(0.5),
  lastVerifiedAt: timestamp("last_verified_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});
export type SourcePackMember = typeof sourcePackMembers.$inferSelect;

export const canonicalEntities = pgTable("canonical_entities", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  canonicalName: text("canonical_name").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("ce_type_idx").on(t.entityType),
]);
export type CanonicalEntity = typeof canonicalEntities.$inferSelect;

export const entityAliases = pgTable("entity_aliases", {
  id: serial("id").primaryKey(),
  canonicalId: integer("canonical_id").notNull(),
  aliasValue: text("alias_value").notNull(),
  aliasSource: text("alias_source").notNull(),
  confidence: real("confidence").default(1.0),
  verified: boolean("verified").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ea_canonical_idx").on(t.canonicalId),
]);
export type EntityAlias = typeof entityAliases.$inferSelect;

export const entityMergeEvents = pgTable("entity_merge_events", {
  id: serial("id").primaryKey(),
  sourceEntityId: integer("source_entity_id").notNull(),
  targetEntityId: integer("target_entity_id").notNull(),
  mergedBy: text("merged_by").notNull(),
  reason: text("reason"),
  reversible: boolean("reversible").default(true),
  reversed: boolean("reversed").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});
export type EntityMergeEvent = typeof entityMergeEvents.$inferSelect;

export const recommendationConflicts = pgTable("recommendation_conflicts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  conflictType: text("conflict_type").notNull(),
  systemA: text("system_a").notNull(),
  systemB: text("system_b").notNull(),
  recommendationA: jsonb("recommendation_a").$type<Record<string, any>>().default({}),
  recommendationB: jsonb("recommendation_b").$type<Record<string, any>>().default({}),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  status: text("status").notNull().default("open"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("rc_user_idx").on(t.userId),
  index("rc_status_idx").on(t.status),
]);
export type RecommendationConflict = typeof recommendationConflicts.$inferSelect;

export const recommendationArbitrationRecords = pgTable("recommendation_arbitration_records", {
  id: serial("id").primaryKey(),
  conflictId: integer("conflict_id").notNull(),
  userId: text("user_id").notNull(),
  winningSystem: text("winning_system").notNull(),
  arbitrationRule: text("arbitration_rule").notNull(),
  evidenceFreshness: integer("evidence_freshness_days"),
  trustWeight: real("trust_weight"),
  businessValue: real("business_value"),
  finalRecommendation: jsonb("final_recommendation").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("rar_conflict_idx").on(t.conflictId),
  index("rar_user_idx").on(t.userId),
]);
export type RecommendationArbitrationRecord = typeof recommendationArbitrationRecords.$inferSelect;

export const goldenDatasets = pgTable("golden_datasets", {
  id: serial("id").primaryKey(),
  datasetKey: text("dataset_key").notNull().unique(),
  domain: text("domain").notNull(),
  version: text("version").notNull().default("1.0"),
  dataPoints: integer("data_points").default(0),
  dataset: jsonb("dataset").$type<Record<string, any>[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type GoldenDataset = typeof goldenDatasets.$inferSelect;

export const replayEvalRuns = pgTable("replay_eval_runs", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("pending"),
  totalCases: integer("total_cases").default(0),
  passedCases: integer("passed_cases").default(0),
  failedCases: integer("failed_cases").default(0),
  result: jsonb("result").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});
export type ReplayEvalRun = typeof replayEvalRuns.$inferSelect;

export const replayEvalArtifacts = pgTable("replay_eval_artifacts", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  caseIndex: integer("case_index").notNull(),
  input: jsonb("input").$type<Record<string, any>>().default({}),
  expectedOutput: jsonb("expected_output").$type<Record<string, any>>().default({}),
  actualOutput: jsonb("actual_output").$type<Record<string, any>>().default({}),
  passed: boolean("passed").default(false),
  diff: jsonb("diff").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("rea_run_idx").on(t.runId),
]);

export const ownedContacts = pgTable("owned_contacts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull(),
  capturedAt: timestamp("captured_at").defaultNow(),
  consentGiven: boolean("consent_given").default(false),
  consentMethod: text("consent_method"),
  segmentId: text("segment_id"),
  status: text("status").default("active"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
}, (t) => [
  index("oc_user_idx").on(t.userId),
  index("oc_email_idx").on(t.email),
]);

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contactId: integer("contact_id").notNull(),
  sequenceName: text("sequence_name").notNull(),
  step: integer("step").default(0),
  status: text("status").default("enrolled"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  lastStepAt: timestamp("last_step_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
}, (t) => [
  index("se_user_idx").on(t.userId),
  index("se_contact_idx").on(t.contactId),
]);

export const contentCtaAttachments = pgTable("content_cta_attachments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id").notNull(),
  ctaType: text("cta_type").notNull(),
  ctaText: text("cta_text").notNull(),
  ctaUrl: text("cta_url"),
  position: text("position").default("end"),
  offerId: integer("offer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
}, (t) => [
  index("cca_user_idx").on(t.userId),
  index("cca_content_idx").on(t.contentId),
]);

export const offerRecommendations = pgTable("offer_recommendations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  offerType: text("offer_type").notNull(),
  offerName: text("offer_name").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: real("confidence").default(0),
  signals: jsonb("signals").$type<Record<string, any>>().default({}),
  accepted: boolean("accepted"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ofrec_user_idx").on(t.userId),
]);

export const packagingInsights = pgTable("packaging_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id").notNull(),
  platform: text("platform").notNull(),
  insightType: text("insight_type").notNull(),
  insight: text("insight").notNull(),
  impactedRecommendation: text("impacted_recommendation"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("pi_user_idx").on(t.userId),
]);

export const deliverabilityRecords = pgTable("deliverability_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contactId: integer("contact_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  bounceType: text("bounce_type"),
  suppressedAt: timestamp("suppressed_at"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("dr_user_idx").on(t.userId),
  index("dr_contact_idx").on(t.contactId),
]);

export const checkoutSessions = pgTable("checkout_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id"),
  ctaId: integer("cta_id"),
  offerType: text("offer_type").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").default("USD"),
  status: text("status").default("pending"),
  customerEmail: text("customer_email"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cs_user_idx").on(t.userId),
]);

export const sponsorInvoices = pgTable("sponsor_invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  dealId: text("deal_id").notNull(),
  brandName: text("brand_name").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").default("USD"),
  status: text("status").default("draft"),
  issuedAt: timestamp("issued_at"),
  dueAt: timestamp("due_at"),
  paidAt: timestamp("paid_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("si_user_idx").on(t.userId),
  index("si_deal_idx").on(t.dealId),
]);

export const operatorBriefs = pgTable("operator_briefs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  briefType: text("brief_type").notNull(),
  summary: text("summary").notNull(),
  nextBestMove: text("next_best_move").notNull(),
  topActions: jsonb("top_actions").$type<string[]>().default([]),
  telemetrySnapshot: jsonb("telemetry_snapshot").$type<Record<string, any>>().default({}),
  generatedAt: timestamp("generated_at").defaultNow(),
}, (t) => [
  index("ob_user_idx").on(t.userId),
]);

export const sourceQualityProfiles = pgTable("source_quality_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id"),
  sessionId: text("session_id").notNull(),
  sourceResolution: text("source_resolution").notNull(),
  sourceFps: real("source_fps").notNull(),
  sourceAspectRatio: text("source_aspect_ratio").notNull().default("16:9"),
  hdrDetected: boolean("hdr_detected").default(false),
  motionIntensity: real("motion_intensity").default(0.5),
  compressionArtifactScore: real("compression_artifact_score").default(0),
  textLegibilityRisk: real("text_legibility_risk").default(0),
  sceneComplexity: real("scene_complexity").default(0.5),
  nativeVsWeakClassification: text("native_vs_weak_classification").notNull().default("native"),
  upscaleEligibilityScore: real("upscale_eligibility_score").default(0),
  archiveMasterRecommendation: text("archive_master_recommendation"),
  liveLadderRecommendation: jsonb("live_ladder_recommendation").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("sqp_user_idx").on(t.userId),
  index("sqp_session_idx").on(t.sessionId),
]);

export const insertSourceQualityProfileSchema = createInsertSchema(sourceQualityProfiles).omit({ id: true, createdAt: true });
export type InsertSourceQualityProfile = z.infer<typeof insertSourceQualityProfileSchema>;
export type SourceQualityProfile = typeof sourceQualityProfiles.$inferSelect;

export const platformResolutionProfiles = pgTable("platform_resolution_profiles", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  region: text("region").default("global"),
  maxResolution: text("max_resolution").notNull().default("1080p"),
  maxFps: real("max_fps").default(60),
  supportedCodecs: jsonb("supported_codecs").$type<string[]>().default(["h264"]),
  bitrateCeiling: integer("bitrate_ceiling").default(6000),
  aspectRatioPreferences: jsonb("aspect_ratio_preferences").$type<string[]>().default(["16:9"]),
  latencyModeConstraints: jsonb("latency_mode_constraints").$type<Record<string, any>>().default({}),
  partnerRestrictions: jsonb("partner_restrictions").$type<Record<string, any>>().default({}),
  destinationPackagingRules: jsonb("destination_packaging_rules").$type<Record<string, any>>().default({}),
  verifiedAt: timestamp("verified_at").defaultNow(),
  stale: boolean("stale").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("prp_platform_idx").on(t.platform),
  index("prp_region_idx").on(t.region),
]);

export const insertPlatformResolutionProfileSchema = createInsertSchema(platformResolutionProfiles).omit({ id: true, createdAt: true });
export type InsertPlatformResolutionProfile = z.infer<typeof insertPlatformResolutionProfileSchema>;
export type PlatformResolutionProfile = typeof platformResolutionProfiles.$inferSelect;

export const liveOutputLadders = pgTable("live_output_ladders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  destinationPlatform: text("destination_platform").notNull(),
  outputResolution: text("output_resolution").notNull(),
  outputFps: real("output_fps").notNull(),
  bitrate: integer("bitrate").notNull(),
  codec: text("codec").notNull().default("h264"),
  latencyMode: text("latency_mode").notNull().default("normal"),
  nativeOrEnhanced: text("native_or_enhanced").notNull().default("native"),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  capabilitySnapshotRef: text("capability_snapshot_ref"),
  resourceHeadroomScore: real("resource_headroom_score").default(1.0),
  qualityConfidence: real("quality_confidence").default(1.0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lol_user_idx").on(t.userId),
  index("lol_session_idx").on(t.sessionId),
  index("lol_dest_idx").on(t.destinationPlatform),
]);

export const insertLiveOutputLadderSchema = createInsertSchema(liveOutputLadders).omit({ id: true, createdAt: true });
export type InsertLiveOutputLadder = z.infer<typeof insertLiveOutputLadderSchema>;
export type LiveOutputLadder = typeof liveOutputLadders.$inferSelect;

export const liveQualitySnapshots = pgTable("live_quality_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  droppedFrames: integer("dropped_frames").default(0),
  encoderLagMs: real("encoder_lag_ms").default(0),
  bandwidthPressure: real("bandwidth_pressure").default(0),
  gpuPressure: real("gpu_pressure").default(0),
  cpuPressure: real("cpu_pressure").default(0),
  upscaleActive: boolean("upscale_active").default(false),
  currentOutputResolution: text("current_output_resolution"),
  governorState: text("governor_state").notNull().default("nominal"),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
}, (t) => [
  index("lqs_user_idx").on(t.userId),
  index("lqs_session_idx").on(t.sessionId),
]);

export const insertLiveQualitySnapshotSchema = createInsertSchema(liveQualitySnapshots).omit({ id: true, snapshotAt: true });
export type InsertLiveQualitySnapshot = z.infer<typeof insertLiveQualitySnapshotSchema>;
export type LiveQualitySnapshot = typeof liveQualitySnapshots.$inferSelect;

export const liveUpscaleActions = pgTable("live_upscale_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  sourceResolution: text("source_resolution").notNull(),
  targetResolution: text("target_resolution").notNull(),
  upscaleMethod: text("upscale_method").notNull().default("super-resolution"),
  gpuHeadroom: real("gpu_headroom").default(0),
  cpuHeadroom: real("cpu_headroom").default(0),
  latencyImpactMs: real("latency_impact_ms").default(0),
  qualityConfidence: real("quality_confidence").default(0),
  activated: boolean("activated").default(false),
  deactivatedReason: text("deactivated_reason"),
  rollbackRef: text("rollback_ref"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lua_user_idx").on(t.userId),
  index("lua_session_idx").on(t.sessionId),
]);

export const insertLiveUpscaleActionSchema = createInsertSchema(liveUpscaleActions).omit({ id: true, createdAt: true });
export type InsertLiveUpscaleAction = z.infer<typeof insertLiveUpscaleActionSchema>;
export type LiveUpscaleAction = typeof liveUpscaleActions.$inferSelect;

export const liveQualityGovernorEvents = pgTable("live_quality_governor_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  previousState: text("previous_state"),
  newState: text("new_state").notNull(),
  reason: text("reason").notNull(),
  metrics: jsonb("metrics").$type<Record<string, any>>().default({}),
  rollbackAvailable: boolean("rollback_available").default(true),
  auditRef: text("audit_ref"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("lqge_user_idx").on(t.userId),
  index("lqge_session_idx").on(t.sessionId),
]);

export const insertLiveQualityGovernorEventSchema = createInsertSchema(liveQualityGovernorEvents).omit({ id: true, createdAt: true });
export type InsertLiveQualityGovernorEvent = z.infer<typeof insertLiveQualityGovernorEventSchema>;
export type LiveQualityGovernorEvent = typeof liveQualityGovernorEvents.$inferSelect;

export const destinationOutputProfiles = pgTable("destination_output_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  destinationPlatform: text("destination_platform").notNull(),
  preferredResolution: text("preferred_resolution").default("1080p"),
  preferredFps: real("preferred_fps").default(60),
  preferredBitrate: integer("preferred_bitrate").default(6000),
  preferredCodec: text("preferred_codec").default("h264"),
  qualityPosture: text("quality_posture").notNull().default("balanced"),
  allowUpscale: boolean("allow_upscale").default(true),
  latencyPriority: text("latency_priority").notNull().default("balanced"),
  overrides: jsonb("overrides").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("dop_user_idx").on(t.userId),
  index("dop_dest_idx").on(t.destinationPlatform),
]);

export const insertDestinationOutputProfileSchema = createInsertSchema(destinationOutputProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDestinationOutputProfile = z.infer<typeof insertDestinationOutputProfileSchema>;
export type DestinationOutputProfile = typeof destinationOutputProfiles.$inferSelect;

export const archiveMasterRecords = pgTable("archive_master_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  channelId: integer("channel_id"),
  masterResolution: text("master_resolution").notNull(),
  masterFps: real("master_fps").notNull(),
  masterCodec: text("master_codec").notNull().default("h264"),
  masterBitrate: integer("master_bitrate"),
  nativeOrEnhanced: text("native_or_enhanced").notNull().default("native"),
  filePath: text("file_path"),
  durationSeconds: real("duration_seconds"),
  suitableForReplay: boolean("suitable_for_replay").default(true),
  suitableForClips: boolean("suitable_for_clips").default(true),
  suitableForRemaster: boolean("suitable_for_remaster").default(true),
  provenanceRef: text("provenance_ref"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("amr_user_idx").on(t.userId),
  index("amr_session_idx").on(t.sessionId),
]);

export const insertArchiveMasterRecordSchema = createInsertSchema(archiveMasterRecords).omit({ id: true, createdAt: true });
export type InsertArchiveMasterRecord = z.infer<typeof insertArchiveMasterRecordSchema>;
export type ArchiveMasterRecord = typeof archiveMasterRecords.$inferSelect;

export const qualityDecisionTraces = pgTable("quality_decision_traces", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  destinationPlatform: text("destination_platform"),
  sourceResolution: text("source_resolution").notNull(),
  outputResolution: text("output_resolution").notNull(),
  nativeOrEnhanced: text("native_or_enhanced").notNull(),
  latencyMode: text("latency_mode"),
  platformConstraintsUsed: jsonb("platform_constraints_used").$type<Record<string, any>>().default({}),
  bandwidthFactor: real("bandwidth_factor"),
  headroomFactor: real("headroom_factor"),
  confidence: real("confidence").default(1.0),
  riskLevel: text("risk_level").notNull().default("low"),
  rollbackPath: text("rollback_path"),
  decisionReason: text("decision_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("qdt_user_idx").on(t.userId),
  index("qdt_session_idx").on(t.sessionId),
]);

export const insertQualityDecisionTraceSchema = createInsertSchema(qualityDecisionTraces).omit({ id: true, createdAt: true });
export type InsertQualityDecisionTrace = z.infer<typeof insertQualityDecisionTraceSchema>;
export type QualityDecisionTrace = typeof qualityDecisionTraces.$inferSelect;

export const qualityReconciliationRecords = pgTable("quality_reconciliation_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  intendedResolution: text("intended_resolution").notNull(),
  actualResolution: text("actual_resolution").notNull(),
  intendedBitrate: integer("intended_bitrate"),
  actualBitrate: integer("actual_bitrate"),
  qualityMatch: boolean("quality_match").default(true),
  drift: real("drift").default(0),
  driftReason: text("drift_reason"),
  reconciliationAction: text("reconciliation_action"),
  reconciliatedAt: timestamp("reconciliated_at").defaultNow(),
}, (t) => [
  index("qrr_user_idx").on(t.userId),
  index("qrr_session_idx").on(t.sessionId),
]);

export const insertQualityReconciliationRecordSchema = createInsertSchema(qualityReconciliationRecords).omit({ id: true, reconciliatedAt: true });
export type InsertQualityReconciliationRecord = z.infer<typeof insertQualityReconciliationRecordSchema>;
export type QualityReconciliationRecord = typeof qualityReconciliationRecords.$inferSelect;

export const leadMagnets = pgTable("lead_magnets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  contentId: text("content_id"),
  description: text("description"),
  downloadUrl: text("download_url"),
  ctaAttachmentId: integer("cta_attachment_id"),
  status: text("status").default("active"),
  captureCount: integer("capture_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
}, (t) => [
  index("lmag_user_idx").on(t.userId),
  index("lmag_content_idx").on(t.contentId),
]);

export const insertLeadMagnetSchema = createInsertSchema(leadMagnets).omit({ id: true, createdAt: true, captureCount: true });
export type InsertLeadMagnet = z.infer<typeof insertLeadMagnetSchema>;
export type LeadMagnet = typeof leadMagnets.$inferSelect;

export const productionKanban = pgTable("production_kanban", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  stage: text("stage").notNull().default("idea"),
  priority: text("priority").notNull().default("medium"),
  platform: text("platform").notNull().default("youtube"),
  description: text("description"),
  dueDate: timestamp("due_date"),
  videoId: integer("video_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("pk_user_idx").on(t.userId),
  index("pk_stage_idx").on(t.stage),
]);

export const insertProductionKanbanSchema = createInsertSchema(productionKanban).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductionKanban = z.infer<typeof insertProductionKanbanSchema>;
export type ProductionKanban = typeof productionKanban.$inferSelect;

export const discoveredGames = pgTable("discovered_games", {
  id: serial("id").primaryKey(),
  officialName: text("official_name").notNull().unique(),
  searchPatterns: text("search_patterns").array().notNull(),
  source: text("source").notNull().default("web-lookup"),
  platform: text("platform").default("ps5"),
  genre: text("genre"),
  publisher: text("publisher"),
  timesDetected: integer("times_detected").notNull().default(1),
  firstDetectedAt: timestamp("first_detected_at").defaultNow(),
  lastDetectedAt: timestamp("last_detected_at").defaultNow(),
}, (t) => [
  index("dg_name_idx").on(t.officialName),
]);

export const insertDiscoveredGameSchema = createInsertSchema(discoveredGames).omit({ id: true, firstDetectedAt: true, lastDetectedAt: true });
export type InsertDiscoveredGame = z.infer<typeof insertDiscoveredGameSchema>;
export type DiscoveredGame = typeof discoveredGames.$inferSelect;

export const discoveredStrategies = pgTable("discovered_strategies", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  strategyType: text("strategy_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull().default("web-scan"),
  sourceUrl: text("source_url"),
  applicableTo: text("applicable_to").array(),
  effectiveness: integer("effectiveness").default(0),
  timesApplied: integer("times_applied").notNull().default(0),
  timesSucceeded: integer("times_succeeded").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  lastAppliedAt: timestamp("last_applied_at"),
}, (t) => [
  index("ds_type_idx").on(t.strategyType),
  index("ds_user_idx").on(t.userId),
]);

export const insertDiscoveredStrategySchema = createInsertSchema(discoveredStrategies).omit({ id: true, createdAt: true, lastAppliedAt: true });
export type InsertDiscoveredStrategy = z.infer<typeof insertDiscoveredStrategySchema>;
export type DiscoveredStrategy = typeof discoveredStrategies.$inferSelect;

export const systemImprovements = pgTable("system_improvements", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  improvementType: text("improvement_type").notNull(),
  area: text("area").notNull(),
  beforeState: text("before_state"),
  afterState: text("after_state"),
  measuredImpact: jsonb("measured_impact").$type<Record<string, unknown>>(),
  triggerEvent: text("trigger_event"),
  engineSource: text("engine_source").notNull(),
  appliedAcrossChannels: boolean("applied_across_channels").default(false),
  channelIds: text("channel_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("si_imp_type_idx").on(t.improvementType),
  index("si_imp_user_idx").on(t.userId),
  index("si_imp_area_idx").on(t.area),
]);

export const insertSystemImprovementSchema = createInsertSchema(systemImprovements).omit({ id: true, createdAt: true });
export type InsertSystemImprovement = z.infer<typeof insertSystemImprovementSchema>;
export type SystemImprovement = typeof systemImprovements.$inferSelect;

export const selfReflectionJournal = pgTable("self_reflection_journal", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  reflectionType: text("reflection_type").notNull(),
  mood: text("mood").notNull().default("neutral"),
  selfAssessment: text("self_assessment").notNull(),
  blindSpotsIdentified: text("blind_spots_identified").array(),
  strengthsRecognized: text("strengths_recognized").array(),
  weaknessesAdmitted: text("weaknesses_admitted").array(),
  emotionalState: text("emotional_state"),
  innerMonologue: text("inner_monologue"),
  triggerEvent: text("trigger_event"),
  confidenceLevel: integer("confidence_level").notNull().default(50),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("srj_user_idx").on(t.userId),
  index("srj_type_idx").on(t.reflectionType),
]);

export const insertSelfReflectionSchema = createInsertSchema(selfReflectionJournal).omit({ id: true, createdAt: true });
export type InsertSelfReflection = z.infer<typeof insertSelfReflectionSchema>;
export type SelfReflection = typeof selfReflectionJournal.$inferSelect;

export const improvementGoals = pgTable("improvement_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  goalType: text("goal_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  targetMetric: text("target_metric").notNull(),
  currentValue: real("current_value").notNull().default(0),
  targetValue: real("target_value").notNull(),
  unit: text("unit").notNull().default(""),
  deadline: timestamp("deadline"),
  status: text("status").notNull().default("active"),
  progress: real("progress").notNull().default(0),
  milestones: jsonb("milestones").$type<Array<{ label: string; value: number; reached: boolean; reachedAt?: string }>>(),
  strategyIds: integer("strategy_ids").array(),
  reflectionOnProgress: text("reflection_on_progress"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("ig_user_idx").on(t.userId),
  index("ig_status_idx").on(t.status),
  index("ig_type_idx").on(t.goalType),
]);

export const insertImprovementGoalSchema = createInsertSchema(improvementGoals).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertImprovementGoal = z.infer<typeof insertImprovementGoalSchema>;
export type ImprovementGoal = typeof improvementGoals.$inferSelect;

export const curiosityQueue = pgTable("curiosity_queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  question: text("question").notNull(),
  context: text("context"),
  origin: text("origin").notNull(),
  priority: integer("priority").notNull().default(5),
  status: text("status").notNull().default("queued"),
  answer: text("answer"),
  discoveredInsights: text("discovered_insights").array(),
  ledToStrategies: integer("led_to_strategies").array(),
  exploredAt: timestamp("explored_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cq_user_idx").on(t.userId),
  index("cq_status_idx").on(t.status),
  index("cq_priority_idx").on(t.priority),
]);

export const insertCuriosityQueueSchema = createInsertSchema(curiosityQueue).omit({ id: true, createdAt: true, exploredAt: true });
export type InsertCuriosityQueue = z.infer<typeof insertCuriosityQueueSchema>;
export type CuriosityQueue = typeof curiosityQueue.$inferSelect;

export const growthFlywheel = pgTable("growth_flywheel", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  flywheelPhase: text("flywheel_phase").notNull(),
  inputAction: text("input_action").notNull(),
  outputAction: text("output_action").notNull(),
  compoundingFactor: real("compounding_factor").notNull().default(1.0),
  cycleNumber: integer("cycle_number").notNull().default(1),
  energyLevel: integer("energy_level").notNull().default(50),
  momentum: real("momentum").notNull().default(0),
  chainedFrom: integer("chained_from"),
  chainedTo: integer("chained_to"),
  executionStatus: text("execution_status").notNull().default("pending"),
  result: text("result"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  executedAt: timestamp("executed_at"),
}, (t) => [
  index("gf_user_idx").on(t.userId),
  index("gf_phase_idx").on(t.flywheelPhase),
  index("gf_status_idx").on(t.executionStatus),
]);

export const insertGrowthFlywheelSchema = createInsertSchema(growthFlywheel).omit({ id: true, createdAt: true, executedAt: true });
export type InsertGrowthFlywheel = z.infer<typeof insertGrowthFlywheelSchema>;
export type GrowthFlywheel = typeof growthFlywheel.$inferSelect;

export const autonomousActions = pgTable("autonomous_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  targetEntity: text("target_entity").notNull(),
  targetId: text("target_id"),
  beforeSnapshot: jsonb("before_snapshot"),
  afterSnapshot: jsonb("after_snapshot"),
  reasoning: text("reasoning").notNull(),
  confidenceScore: integer("confidence_score").notNull().default(50),
  status: text("status").notNull().default("pending"),
  approvalRequired: boolean("approval_required").notNull().default(true),
  autoApproved: boolean("auto_approved").notNull().default(false),
  executedAt: timestamp("executed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  impactMeasured: jsonb("impact_measured"),
  strategyId: integer("strategy_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("aa_user_idx").on(t.userId),
  index("aa_status_idx").on(t.status),
  index("aa_type_idx").on(t.actionType),
]);

export const insertAutonomousActionSchema = createInsertSchema(autonomousActions).omit({ id: true, createdAt: true, executedAt: true, rolledBackAt: true });
export type InsertAutonomousAction = z.infer<typeof insertAutonomousActionSchema>;
export type AutonomousAction = typeof autonomousActions.$inferSelect;

export const memoryConsolidation = pgTable("memory_consolidation", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  consolidationType: text("consolidation_type").notNull(),
  rawMemoryCount: integer("raw_memory_count").notNull().default(0),
  corePrinciple: text("core_principle").notNull(),
  evidenceSummary: text("evidence_summary").notNull(),
  confidenceScore: integer("confidence_score").notNull().default(50),
  timesReinforced: integer("times_reinforced").notNull().default(1),
  timesContradicted: integer("times_contradicted").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  supersededBy: integer("superseded_by"),
  sourceInsightIds: integer("source_insight_ids").array(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  lastReinforcedAt: timestamp("last_reinforced_at"),
}, (t) => [
  index("mc_user_idx").on(t.userId),
  index("mc_type_idx").on(t.consolidationType),
  index("mc_active_idx").on(t.isActive),
]);

export const insertMemoryConsolidationSchema = createInsertSchema(memoryConsolidation).omit({ id: true, createdAt: true, lastReinforcedAt: true });
export type InsertMemoryConsolidation = z.infer<typeof insertMemoryConsolidationSchema>;
export type MemoryConsolidation = typeof memoryConsolidation.$inferSelect;

export const competitiveIntelligence = pgTable("competitive_intelligence", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name"),
  insightCategory: text("insight_category").notNull(),
  finding: text("finding").notNull(),
  applicability: text("applicability").notNull(),
  implementationDifficulty: text("implementation_difficulty").notNull().default("medium"),
  potentialImpact: text("potential_impact").notNull().default("medium"),
  status: text("status").notNull().default("discovered"),
  adoptedAsStrategy: boolean("adopted_as_strategy").notNull().default(false),
  strategyId: integer("strategy_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("comp_intel_user_idx").on(t.userId),
  index("comp_intel_category_idx").on(t.insightCategory),
  index("comp_intel_status_idx").on(t.status),
]);

export const insertCompetitiveIntelligenceSchema = createInsertSchema(competitiveIntelligence).omit({ id: true, createdAt: true });
export type InsertCompetitiveIntelligence = z.infer<typeof insertCompetitiveIntelligenceSchema>;
export type CompetitiveIntelligence = typeof competitiveIntelligence.$inferSelect;

export const crossChannelInsights = pgTable("cross_channel_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceChannelId: integer("source_channel_id").notNull(),
  insightType: text("insight_type").notNull(),
  insight: text("insight").notNull(),
  evidence: jsonb("evidence"),
  confidenceScore: integer("confidence_score").notNull().default(50),
  propagatedTo: text("propagated_to").array(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (t) => [
  index("cci_user_idx").on(t.userId),
  index("cci_type_idx").on(t.insightType),
]);

export const contentExperiments = pgTable("content_experiments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  experimentType: text("experiment_type").notNull(),
  contentType: text("content_type").notNull(),
  durationSec: integer("duration_sec").notNull(),
  sourceVideoId: integer("source_video_id"),
  resultVideoYoutubeId: text("result_video_youtube_id"),
  resultVideoDbId: integer("result_video_db_id"),
  status: text("status").notNull().default("pending"),
  views: integer("views").default(0),
  averageViewDuration: integer("average_view_duration").default(0),
  retentionPercent: integer("retention_percent").default(0),
  likes: integer("likes").default(0),
  measuredAt: timestamp("measured_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("content_exp_user_idx").on(t.userId),
  index("content_exp_type_idx").on(t.experimentType),
  index("content_exp_status_idx").on(t.status),
]);

export const insertContentExperimentSchema = createInsertSchema(contentExperiments).omit({ id: true, createdAt: true });
export type InsertContentExperiment = z.infer<typeof insertContentExperimentSchema>;
export type ContentExperiment = typeof contentExperiments.$inferSelect;

export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  businessType: text("business_type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  platforms: text("platforms").array().default([]),
  revenueStreams: text("revenue_streams").array().default([]),
  kpis: jsonb("kpis").$type<Record<string, any>>().default({}),
  aiPersonality: jsonb("ai_personality").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("bp_user_idx").on(t.userId),
  index("bp_industry_idx").on(t.industry),
  index("bp_status_idx").on(t.status),
]);

export const insertBusinessProfileSchema = createInsertSchema(businessProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfiles.$inferSelect;

export const industryPlaybooks = pgTable("industry_playbooks", {
  id: serial("id").primaryKey(),
  industry: text("industry").notNull(),
  businessType: text("business_type").notNull(),
  playbookName: text("playbook_name").notNull(),
  strategies: jsonb("strategies").$type<any[]>().default([]),
  automationRules: jsonb("automation_rules").$type<any[]>().default([]),
  platformConfig: jsonb("platform_config").$type<Record<string, any>>().default({}),
  kpiDefinitions: jsonb("kpi_definitions").$type<any[]>().default([]),
  contentTemplates: jsonb("content_templates").$type<any[]>().default([]),
  complianceRulesRef: jsonb("compliance_rules_ref").$type<any[]>().default([]),
  effectiveness: integer("effectiveness").default(0),
  isActive: boolean("is_active").default(true),
  learnedFrom: text("learned_from"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("ip_industry_idx").on(t.industry),
  index("ip_type_idx").on(t.businessType),
]);

export const insertIndustryPlaybookSchema = createInsertSchema(industryPlaybooks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIndustryPlaybook = z.infer<typeof insertIndustryPlaybookSchema>;
export type IndustryPlaybook = typeof industryPlaybooks.$inferSelect;

export const businessOperations = pgTable("business_operations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  userId: text("user_id").notNull(),
  operationType: text("operation_type").notNull(),
  status: text("status").notNull().default("pending"),
  input: jsonb("input").$type<Record<string, any>>().default({}),
  output: jsonb("output").$type<Record<string, any>>().default({}),
  metrics: jsonb("metrics").$type<Record<string, any>>().default({}),
  automatedBy: text("automated_by"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("bo_business_idx").on(t.businessId),
  index("bo_user_idx").on(t.userId),
  index("bo_type_idx").on(t.operationType),
  index("bo_status_idx").on(t.status),
]);

export const insertBusinessOperationSchema = createInsertSchema(businessOperations).omit({ id: true, createdAt: true });
export type InsertBusinessOperation = z.infer<typeof insertBusinessOperationSchema>;
export type BusinessOperation = typeof businessOperations.$inferSelect;

export const crossBusinessInsights = pgTable("cross_business_insights", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceBusinessId: integer("source_business_id").notNull(),
  targetBusinessId: integer("target_business_id"),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  insight: text("insight").notNull(),
  transferability: integer("transferability").default(50),
  applied: boolean("applied").default(false),
  impactScore: integer("impact_score").default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (t) => [
  index("cbi_user_idx").on(t.userId),
  index("cbi_source_idx").on(t.sourceBusinessId),
  index("cbi_type_idx").on(t.insightType),
]);

export const insertCrossBusinessInsightSchema = createInsertSchema(crossBusinessInsights).omit({ id: true, createdAt: true, appliedAt: true });
export type InsertCrossBusinessInsight = z.infer<typeof insertCrossBusinessInsightSchema>;
export type CrossBusinessInsight = typeof crossBusinessInsights.$inferSelect;

export const empireMetrics = pgTable("empire_metrics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(),
  totalRevenue: real("total_revenue").default(0),
  totalAudience: integer("total_audience").default(0),
  totalContent: integer("total_content").default(0),
  businessCount: integer("business_count").default(0),
  healthScore: integer("health_score").default(0),
  growthRate: real("growth_rate").default(0),
  breakdown: jsonb("breakdown").$type<Record<string, any>>().default({}),
  aiActions: integer("ai_actions").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("em_user_idx").on(t.userId),
  index("em_period_idx").on(t.period),
]);

export const videoCatalogLinks = pgTable("video_catalog_links", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("youtube"),
  platformVideoId: text("platform_video_id").notNull().default(""),
  youtubeId: text("youtube_id").notNull(),
  shareLink: text("share_link").notNull(),
  fullUrl: text("full_url").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  duration: text("duration"),
  durationSec: integer("duration_sec").default(0),
  publishedAt: timestamp("published_at"),
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  commentCount: integer("comment_count").default(0),
  tags: text("tags").array().default([]),
  privacyStatus: text("privacy_status").default("public"),
  videoType: text("video_type").default("regular"),
  editingStatus: text("editing_status").notNull().default("unprocessed"),
  editingStartedAt: timestamp("editing_started_at"),
  editingCompletedAt: timestamp("editing_completed_at"),
  editingResult: jsonb("editing_result").$type<Record<string, any>>().default({}),
  scheduledForUpload: boolean("scheduled_for_upload").default(false),
  uploadScheduledAt: timestamp("upload_scheduled_at"),
  uploadCompletedAt: timestamp("upload_completed_at"),
  derivedContentCount: integer("derived_content_count").default(0),
  lastSyncedAt: timestamp("last_synced_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("vcl_user_idx").on(t.userId),
  index("vcl_channel_idx").on(t.channelId),
  index("vcl_ytid_idx").on(t.youtubeId),
  index("vcl_editing_status_idx").on(t.editingStatus),
  index("vcl_scheduled_idx").on(t.scheduledForUpload),
  index("vcl_platform_idx").on(t.platform),
  index("vcl_platform_video_idx").on(t.platformVideoId),
  index("vcl_channel_editing_idx").on(t.channelId, t.editingStatus),
  index("vcl_user_channel_idx").on(t.userId, t.channelId),
]);

export const insertVideoCatalogLinkSchema = createInsertSchema(videoCatalogLinks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVideoCatalogLink = z.infer<typeof insertVideoCatalogLinkSchema>;
export type VideoCatalogLink = typeof videoCatalogLinks.$inferSelect;

export const thumbnailIntelligence = pgTable("thumbnail_intelligence", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  gameName: text("game_name").notNull(),
  researchQuery: text("research_query").notNull(),
  referenceImages: jsonb("reference_images").$type<Array<{ url: string; title: string; source: string }>>().default([]),
  patterns: jsonb("patterns").$type<{
    colorSchemes: string[];
    compositions: string[];
    emotionalTriggers: string[];
    textOverlayStyles: string[];
    commonElements: string[];
    avoidPatterns: string[];
  }>(),
  bestPractices: text("best_practices"),
  gamingNicheInsights: text("gaming_niche_insights"),
  ctrTactics: text("ctr_tactics"),
  antiClickbaitGuidelines: text("anti_clickbait_guidelines"),
  effectivenessScore: integer("effectiveness_score").default(50),
  timesUsed: integer("times_used").default(0),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("ti_user_idx").on(t.userId),
  index("ti_game_idx").on(t.gameName),
]);

export const aiMusicTracks = pgTable("ai_music_tracks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  genre: text("genre").notNull(),
  mood: text("mood").notNull(),
  gameName: text("game_name"),
  durationSec: integer("duration_sec").default(60),
  inspirationSources: jsonb("inspiration_sources").$type<Array<{ title: string; artist: string; style: string; source: string }>>().default([]),
  compositionPrompt: text("composition_prompt"),
  musicalElements: jsonb("musical_elements").$type<{
    tempo: string;
    key: string;
    instruments: string[];
    style: string;
    structure: string;
  }>(),
  copyrightStatus: text("copyright_status").notNull().default("original"),
  copyrightNotes: text("copyright_notes"),
  usageContext: text("usage_context"),
  audioUrl: text("audio_url"),
  timesUsed: integer("times_used").default(0),
  effectivenessScore: integer("effectiveness_score").default(50),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("amt_user_idx").on(t.userId),
  index("amt_genre_idx").on(t.genre),
]);

export const engineKnowledge = pgTable("engine_knowledge", {
  id: serial("id").primaryKey(),
  engineName: text("engine_name").notNull(),
  userId: text("user_id").notNull(),
  knowledgeType: text("knowledge_type").notNull(),
  topic: text("topic").notNull(),
  insight: text("insight").notNull(),
  evidence: text("evidence"),
  confidenceScore: integer("confidence_score").default(50),
  timesValidated: integer("times_validated").default(0),
  timesContradicted: integer("times_contradicted").default(0),
  isActive: boolean("is_active").default(true),
  appliedSuccessfully: integer("applied_successfully").default(0),
  lastUsedAt: timestamp("last_used_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("ek_engine_idx").on(t.engineName),
  index("ek_user_idx").on(t.userId),
  index("ek_type_idx").on(t.knowledgeType),
  index("ek_active_idx").on(t.isActive),
]);

export const masterKnowledgeBank = pgTable("master_knowledge_bank", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  principle: text("principle").notNull(),
  sourceEngines: text("source_engines").array().default([]),
  evidenceCount: integer("evidence_count").default(1),
  confidenceScore: integer("confidence_score").default(50),
  applicableEngines: text("applicable_engines").array().default([]),
  timesApplied: integer("times_applied").default(0),
  timesSucceeded: integer("times_succeeded").default(0),
  successRate: integer("success_rate").default(0),
  isActive: boolean("is_active").default(true),
  lastReinforcedAt: timestamp("last_reinforced_at"),
  lastAppliedAt: timestamp("last_applied_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("mkb_user_idx").on(t.userId),
  index("mkb_category_idx").on(t.category),
  index("mkb_active_idx").on(t.isActive),
  index("mkb_confidence_idx").on(t.confidenceScore),
]);

export const crossEngineTeachings = pgTable("cross_engine_teachings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceEngine: text("source_engine").notNull(),
  targetEngine: text("target_engine").notNull(),
  teachingType: text("teaching_type").notNull(),
  lesson: text("lesson").notNull(),
  context: text("context"),
  wasApplied: boolean("applied").default(false),
  impactScore: integer("impact_score"),
  sourceKnowledgeId: integer("source_knowledge_id"),
  masterKnowledgeId: integer("master_knowledge_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cet_user_idx").on(t.userId),
  index("cet_source_idx").on(t.sourceEngine),
  index("cet_target_idx").on(t.targetEngine),
]);

export const engineIntervalConfigs = pgTable("engine_interval_configs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  engineName: text("engine_name").notNull(),
  currentIntervalMs: integer("current_interval_ms").notNull(),
  defaultIntervalMs: integer("default_interval_ms").notNull(),
  minIntervalMs: integer("min_interval_ms").notNull().default(60000),
  maxIntervalMs: integer("max_interval_ms").notNull().default(7200000),
  outputQualityScore: integer("output_quality_score").default(50),
  outputVolumeLastCycle: integer("output_volume_last_cycle").default(0),
  wastedCycles: integer("wasted_cycles").default(0),
  productiveCycles: integer("productive_cycles").default(0),
  lastTunedAt: timestamp("last_tuned_at"),
  tuningReason: text("tuning_reason"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("eic_user_idx").on(t.userId),
  index("eic_engine_idx").on(t.engineName),
  uniqueIndex("eic_user_engine_idx").on(t.userId, t.engineName),
]);

export const insertEngineIntervalConfigSchema = createInsertSchema(engineIntervalConfigs).omit({ id: true, createdAt: true, updatedAt: true, lastTunedAt: true });
export type InsertEngineIntervalConfig = z.infer<typeof insertEngineIntervalConfigSchema>;
export type EngineIntervalConfig = typeof engineIntervalConfigs.$inferSelect;

export const contentPerformanceLoops = pgTable("content_performance_loops", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentId: text("content_id").notNull(),
  platform: text("platform").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  checkScheduledAt: timestamp("check_scheduled_at").notNull(),
  checkCompletedAt: timestamp("check_completed_at"),
  status: text("status").notNull().default("pending"),
  predictedViews: integer("predicted_views"),
  actualViews: integer("actual_views"),
  predictedCtr: real("predicted_ctr"),
  actualCtr: real("actual_ctr"),
  predictedRetention: real("predicted_retention"),
  actualRetention: real("actual_retention"),
  strategyUsed: text("strategy_used"),
  strategyId: integer("strategy_id"),
  performanceScore: integer("performance_score"),
  attributionComplete: boolean("attribution_complete").default(false),
  lessonLearned: text("lesson_learned"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cpl_user_idx").on(t.userId),
  index("cpl_status_idx").on(t.status),
  index("cpl_platform_idx").on(t.platform),
  index("cpl_check_idx").on(t.checkScheduledAt),
]);

export const insertContentPerformanceLoopSchema = createInsertSchema(contentPerformanceLoops).omit({ id: true, createdAt: true, checkCompletedAt: true });
export type InsertContentPerformanceLoop = z.infer<typeof insertContentPerformanceLoopSchema>;
export type ContentPerformanceLoop = typeof contentPerformanceLoops.$inferSelect;

export const originalityResearch = pgTable("originality_research", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentType: text("content_type").notNull(),
  topic: text("topic").notNull(),
  webSources: jsonb("web_sources").$type<Array<{ url: string; title: string; snippet: string }>>().default([]),
  synthesizedInsights: text("synthesized_insights"),
  originalAngle: text("original_angle"),
  copyrightSafe: boolean("copyright_safe").default(true),
  timesUsed: integer("times_used").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("or_user_idx").on(t.userId),
  index("or_type_idx").on(t.contentType),
]);

export const tokenBudgetUsage = pgTable("token_budget_usage", {
  engine: varchar("engine", { length: 100 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  used: integer("used").notNull().default(0),
  lastThrottledAt: bigint("last_throttled_at", { mode: "number" }),
  lastAlertSentAt: bigint("last_alert_sent_at", { mode: "number" }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("tbu_engine_day_idx").on(t.engine, t.day),
]);

export type TokenBudgetUsageRow = typeof tokenBudgetUsage.$inferSelect;


// ─── Platform Feature Eligibility ────────────────────────────────────────────
// Tracks which platform monetization/creator features the channel qualifies for,
// whether an application is needed, and what effect activating the feature has
// on the content pipeline.
export const platformFeatureEligibility = pgTable("platform_feature_eligibility", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  featureId: text("feature_id").notNull(),      // e.g. "youtube_ypp"
  featureName: text("feature_name").notNull(),
  // checking | eligible | applied | active | dismissed
  status: text("status").notNull().default("checking"),
  requiresApplication: boolean("requires_application").notNull().default(true),
  applicationUrl: text("application_url"),
  qualifiedAt: timestamp("qualified_at"),
  notifiedAt: timestamp("notified_at"),
  appliedAt: timestamp("applied_at"),
  activatedAt: timestamp("activated_at"),
  dismissedAt: timestamp("dismissed_at"),
  // Snapshot of the thresholds that were met when qualified
  thresholdsMet: jsonb("thresholds_met").$type<Record<string, number>>(),
  // Keys that get enabled in the content pipeline once the feature is active
  pipelineEffects: jsonb("pipeline_effects").$type<string[]>(),
  lastCheckedAt: timestamp("last_checked_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userPlatformFeatureIdx: uniqueIndex("pfe_user_platform_feature_idx").on(table.userId, table.platform, table.featureId),
}));

export const insertPlatformFeatureEligibilitySchema = createInsertSchema(platformFeatureEligibility).omit({ id: true, createdAt: true });
export type InsertPlatformFeatureEligibility = z.infer<typeof insertPlatformFeatureEligibilitySchema>;
export type PlatformFeatureEligibility = typeof platformFeatureEligibility.$inferSelect;

// ---------------------------------------------------------------------------
// Autonomous Capability Gaps — identified by the system, filled by the system
// ---------------------------------------------------------------------------
export const capabilityGaps = pgTable("capability_gaps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  domain: text("domain").notNull(),
  gapType: text("gap_type").notNull(), // missing_prompt | missing_strategy | missing_knowledge | missing_behavior
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").notNull().default(5),
  status: text("status").notNull().default("identified"), // identified | filling | filled | failed
  solutionType: text("solution_type"),   // new_prompt | new_strategy | new_knowledge
  solutionRef: text("solution_ref"),     // key/id of the created solution
  solutionSummary: text("solution_summary"),
  identifiedBy: text("identified_by").notNull().default("autonomous-capability-engine"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  filledAt: timestamp("filled_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cg_user_idx").on(t.userId),
  index("cg_status_idx").on(t.status),
  index("cg_domain_idx").on(t.domain),
]);

export const insertCapabilityGapSchema = createInsertSchema(capabilityGaps).omit({ id: true, createdAt: true, filledAt: true, lastAttemptAt: true });
export type InsertCapabilityGap = z.infer<typeof insertCapabilityGapSchema>;
export type CapabilityGap = typeof capabilityGaps.$inferSelect;

// ---------------------------------------------------------------------------
// Internet Benchmark — web-discovered capability gaps and what was built
// ---------------------------------------------------------------------------
export const internetBenchmarks = pgTable("internet_benchmarks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  domain: text("domain").notNull(),           // e.g., "shorts_hooks"
  domainLabel: text("domain_label").notNull(), // e.g., "Shorts Hook Techniques"
  searchQueries: text("search_queries").array(),
  webSummary: text("web_summary"),             // what the internet says
  gapFound: text("gap_found"),                 // description of the gap
  gapSeverity: integer("gap_severity").default(0), // 0-10
  capabilityBuilt: text("capability_built"),   // what was created
  capabilityType: text("capability_type"),     // prompt | strategy | knowledge | none
  capabilityRef: text("capability_ref"),       // ID/key of the created artifact
  pipelinesUpdated: text("pipelines_updated").array(), // ["shorts","full_video"]
  status: text("status").notNull().default("searching"),
  // searching | gap_found | built | no_gap | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ib_user_idx").on(t.userId),
  index("ib_domain_idx").on(t.domain),
  index("ib_status_idx").on(t.status),
  index("ib_created_idx").on(t.createdAt),
]);

export const insertInternetBenchmarkSchema = createInsertSchema(internetBenchmarks).omit({ id: true, createdAt: true });
export type InsertInternetBenchmark = z.infer<typeof insertInternetBenchmarkSchema>;
export type InternetBenchmark = typeof internetBenchmarks.$inferSelect;

// ---------------------------------------------------------------------------
// Vault Documents — AI-generated go-to-market documentation
// ---------------------------------------------------------------------------
export const VAULT_DOC_TYPES = [
  "system_architecture",
  "ai_capabilities_catalog",
  "autonomy_evidence_log",
  "internet_intelligence_report",
  "pipeline_technical_spec",
  "market_positioning",
] as const;

export type VaultDocType = typeof VAULT_DOC_TYPES[number];

export const vaultDocuments = pgTable("vault_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  docType: text("doc_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | generating | ready | failed
  wordCount: integer("word_count").notNull().default(0),
  errorMessage: text("error_message"),
  generatedAt: timestamp("generated_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("vd_user_idx").on(t.userId),
  index("vd_doc_type_idx").on(t.docType),
  index("vd_status_idx").on(t.status),
  uniqueIndex("vd_user_doc_type_uniq").on(t.userId, t.docType),
]);

export const insertVaultDocumentSchema = createInsertSchema(vaultDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVaultDocument = z.infer<typeof insertVaultDocumentSchema>;
export type VaultDocument = typeof vaultDocuments.$inferSelect;

// ── Omni Intelligence Signals ─────────────────────────────────────────────────
// Raw signals harvested from YouTube, Reddit, Twitch, RSS, and web search.
// Each row is one signal (a trending video, reddit post, news article, etc.).
// The AI synthesizer consumes these and writes to predictive_trends / growth_strategies.
export const intelligenceSignals = pgTable("intelligence_signals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(), // youtube_trending|reddit|twitch|rss|web_search
  category: text("category"),       // viral_video|trending_game|strategy_article|news|community_pulse
  title: text("title").notNull(),
  url: text("url"),
  score: real("score").default(0),  // raw virality/relevance 0-100
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  processed: boolean("processed").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("is_user_idx").on(t.userId),
  index("is_source_idx").on(t.source),
  index("is_processed_idx").on(t.processed),
  index("is_created_idx").on(t.createdAt),
]);

export const insertIntelligenceSignalSchema = createInsertSchema(intelligenceSignals).omit({ id: true, createdAt: true });
export type InsertIntelligenceSignal = z.infer<typeof insertIntelligenceSignalSchema>;
export type IntelligenceSignal = typeof intelligenceSignals.$inferSelect;

// ── Database-backed OAuth nonces ──────────────────────────────────────────────
// Stored in DB so nonce lookups work across server instances and restarts.
// Avoids the bug where in-memory nonces are lost when prod/dev servers differ.
export const oauthNonces = pgTable("oauth_nonces", {
  nonce: text("nonce").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
