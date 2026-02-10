
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
  "discord",
  "snapchat",
  "pinterest",
  "reddit",
  "threads",
  "bluesky",
  "mastodon",
  "patreon",
  "kofi",
  "substack",
  "spotify",
  "applepodcasts",
  "dlive",
  "trovo",
  "youtubeshorts",
  "whatsapp",
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
  facebook: {
    label: "Facebook Gaming",
    color: "#1877F2",
    maxResolution: "1080p30",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "rtmps://live-api-s.facebook.com:443/rtmp",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://www.facebook.com/gaming/pages/create",
    strategyDescription: "Massive built-in audience of 3B+ users. Facebook Gaming reaches casual viewers who would never visit Twitch. Untapped market for gaming creators.",
    setupSteps: ["Go to your Facebook Gaming Creator page", "Click Live Producer", "Copy the Stream Key from the setup panel", "Paste it below"],
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
  rumble: {
    label: "Rumble",
    color: "#85C742",
    maxResolution: "4K (2160p)",
    maxBitrate: "12 Mbps",
    rtmpUrlTemplate: "rtmp://live.rumble.com/live",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://rumble.com/register",
    strategyDescription: "Rapidly growing video platform with strong creator monetization. Less competition means easier discovery. Supports both live streaming and video uploads.",
    setupSteps: ["Go to rumble.com/account/go-live", "Copy your Stream Key", "Paste it below"],
  },
  linkedin: {
    label: "LinkedIn Live",
    color: "#0A66C2",
    maxResolution: "1080p30",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://live.linkedin.com/live",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://www.linkedin.com/signup",
    strategyDescription: "Professional network with 900M+ members. LinkedIn Live reaches business audiences. Perfect for educational, tech, and career-focused content. High-value sponsorship opportunities.",
    setupSteps: ["Go to linkedin.com and click 'Start a post'", "Select 'Go Live' and choose 'Custom Stream'", "Copy the Stream URL and Stream Key", "Paste them below"],
  },
  instagram: {
    label: "Instagram Live",
    color: "#E4405F",
    maxResolution: "1080p30",
    maxBitrate: "3.5 Mbps",
    rtmpUrlTemplate: "rtmps://live-upload.instagram.com:443/rtmp",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://www.instagram.com/accounts/emailsignup/",
    strategyDescription: "Visual-first platform with Reels, Stories, and Live. Cross-promotes with Facebook. Instagram Reels compete directly with TikTok for short-form discovery.",
    setupSteps: ["Open Instagram on your phone", "Tap the + button and select 'Live'", "Tap the broadcast icon to get your stream key", "Paste it below"],
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
  snapchat: {
    label: "Snapchat",
    color: "#FFFC00",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://accounts.snapchat.com/accounts/signup",
    strategyDescription: "Spotlight lets you reach millions with short-form content. Snapchat pays creators directly for viral Spotlight submissions. Great for reaching younger audiences.",
    setupSteps: ["Download Snapchat and create an account", "Set up your public profile", "Enable Spotlight submissions in settings", "Paste your Snapchat username below"],
  },
  pinterest: {
    label: "Pinterest",
    color: "#E60023",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "content",
    connectionType: "manual",
    signupUrl: "https://www.pinterest.com/business/create/",
    strategyDescription: "Visual search engine that drives evergreen traffic. Pins can rank for months or years, sending viewers to your YouTube videos long after posting. Perfect for thumbnails and tutorials.",
    setupSteps: ["Create a Pinterest Business account", "Set up your profile with your brand info", "Paste your Pinterest profile URL below"],
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
  threads: {
    label: "Threads",
    color: "#000000",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://www.threads.net",
    strategyDescription: "Meta's text-based social platform. Cross-promotes with Instagram automatically. Growing fast as a Twitter/X alternative. Early movers get organic reach advantages.",
    setupSteps: ["Download the Threads app or visit threads.net", "Sign in with your Instagram account", "Paste your Threads username below"],
  },
  bluesky: {
    label: "Bluesky",
    color: "#0085FF",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://bsky.app",
    strategyDescription: "Decentralized social platform growing rapidly. Early adopter advantage means your content reaches more people with less competition. Great for tech-savvy audiences.",
    setupSteps: ["Create an account at bsky.app", "Set up your profile", "Paste your Bluesky handle below"],
  },
  mastodon: {
    label: "Mastodon",
    color: "#6364FF",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "social",
    connectionType: "manual",
    signupUrl: "https://joinmastodon.org",
    strategyDescription: "Open-source, decentralized social network. No algorithm means chronological feeds and genuine engagement. Popular with tech, open-source, and privacy-conscious audiences.",
    setupSteps: ["Choose a Mastodon server at joinmastodon.org", "Create your account", "Paste your full Mastodon handle below (e.g., @user@server.social)"],
  },
  patreon: {
    label: "Patreon",
    color: "#FF424D",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "monetization",
    connectionType: "manual",
    signupUrl: "https://www.patreon.com/create",
    strategyDescription: "The gold standard for creator memberships. Offer exclusive content, early access, and behind-the-scenes to paying subscribers. Predictable monthly income independent of algorithms.",
    setupSteps: ["Create a Patreon page at patreon.com/create", "Set up your membership tiers", "Paste your Patreon page URL below"],
  },
  kofi: {
    label: "Ko-fi",
    color: "#13C3FF",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "monetization",
    connectionType: "manual",
    signupUrl: "https://ko-fi.com",
    strategyDescription: "Simple tip jar and membership platform with zero fees on donations. Easier to set up than Patreon. Great for creators just starting to monetize their audience.",
    setupSteps: ["Create an account at ko-fi.com", "Set up your page with a description", "Paste your Ko-fi page URL below"],
  },
  substack: {
    label: "Substack",
    color: "#FF6719",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "content",
    connectionType: "manual",
    signupUrl: "https://substack.com",
    strategyDescription: "Newsletter platform for long-form content. Build an email list you actually own -- no algorithm can take it away. Paid subscriptions for premium content. Your insurance policy against platform changes.",
    setupSteps: ["Create a publication at substack.com", "Set up your newsletter theme and description", "Paste your Substack URL below"],
  },
  spotify: {
    label: "Spotify",
    color: "#1DB954",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "content",
    connectionType: "manual",
    signupUrl: "https://podcasters.spotify.com",
    strategyDescription: "World's largest audio platform now supports video podcasts. Repurpose your long-form content as podcast episodes to reach audio-first audiences during commutes and workouts.",
    setupSteps: ["Create an account at podcasters.spotify.com", "Set up your podcast with artwork and description", "Paste your Spotify podcast URL below"],
  },
  applepodcasts: {
    label: "Apple Podcasts",
    color: "#872EC4",
    maxResolution: "1080p",
    maxBitrate: "4 Mbps",
    rtmpUrlTemplate: "",
    category: "content",
    connectionType: "manual",
    signupUrl: "https://podcasters.apple.com",
    strategyDescription: "Premium podcast distribution to all Apple devices. Apple Podcasts listeners are highly engaged and more likely to support creators financially. Essential for audio content strategy.",
    setupSteps: ["Register at podcasters.apple.com", "Submit your podcast RSS feed", "Paste your Apple Podcasts URL below"],
  },
  dlive: {
    label: "DLive",
    color: "#FFD700",
    maxResolution: "1080p60",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://stream.dlive.tv/live",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://dlive.tv",
    strategyDescription: "Blockchain-based streaming platform with cryptocurrency rewards. Smaller audience but unique monetization through Lemon (donation currency). Great for crypto-native communities.",
    setupSteps: ["Create an account at dlive.tv", "Go to your Dashboard then Stream Settings", "Copy your Stream Key", "Paste it below"],
  },
  trovo: {
    label: "Trovo",
    color: "#19E68C",
    maxResolution: "1080p60",
    maxBitrate: "6 Mbps",
    rtmpUrlTemplate: "rtmp://livepush.trovo.live/live",
    category: "streaming",
    connectionType: "manual",
    signupUrl: "https://trovo.live",
    strategyDescription: "Tencent-backed gaming platform with less competition than Twitch. Partner program offers guaranteed income for qualifying streamers. Good for discoverability.",
    setupSteps: ["Create an account at trovo.live", "Go to Creator Dashboard then Stream Settings", "Copy your Stream Key", "Paste it below"],
  },
  youtubeshorts: {
    label: "YouTube Shorts",
    color: "#FF0000",
    maxResolution: "1080x1920",
    maxBitrate: "20 Mbps",
    rtmpUrlTemplate: "",
    category: "content",
    connectionType: "oauth",
    signupUrl: "https://www.youtube.com",
    strategyDescription: "YouTube's short-form format competing with TikTok and Reels. Uses the same channel as your main YouTube but gets separate algorithmic push. Massive discovery tool for growing subscribers.",
    setupSteps: ["Uses your connected YouTube account", "Shorts are uploaded through the same channel", "No additional setup needed"],
  },
  whatsapp: {
    label: "WhatsApp Channels",
    color: "#25D366",
    maxResolution: "720p",
    maxBitrate: "2 Mbps",
    rtmpUrlTemplate: "",
    category: "messaging",
    connectionType: "manual",
    signupUrl: "https://www.whatsapp.com/channel/create",
    strategyDescription: "Broadcast to followers on the world's most-used messaging app (2B+ users). WhatsApp Channels let you push updates, content announcements, and behind-the-scenes directly to fans' phones.",
    setupSteps: ["Open WhatsApp and go to Updates tab", "Tap 'Create Channel'", "Set up your channel name and description", "Paste your channel invite link below"],
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
  detectedSource: text("detected_source"),
  isAutoDetected: boolean("is_auto_detected").default(false),
  vodVideoId: integer("vod_video_id"),
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
    taxCategory?: string;
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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
});

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
