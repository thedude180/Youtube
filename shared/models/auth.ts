import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const SUBSCRIPTION_TIERS = ["free", "youtube", "starter", "pro", "ultimate"] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

export const USER_ROLES = ["user", "premium", "admin"] as const;
export type UserRole = typeof USER_ROLES[number];

export const TIER_PLATFORM_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  youtube: 1,
  starter: 3,
  pro: 10,
  ultimate: 25,
};

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  youtube: "YouTube Only",
  starter: "Starter",
  pro: "Pro",
  ultimate: "Ultimate",
};

export const ADMIN_EMAIL = "thedude180@gmail.com";

export const CHANNEL_LAUNCH_STATES = [
  "pre_channel",
  "channel_created_not_connected",
  "channel_connected_no_uploads",
  "launch_active",
  "pre_monetization",
  "monetization_eligible",
  "monetization_active",
] as const;
export type ChannelLaunchState = (typeof CHANNEL_LAUNCH_STATES)[number];
export const SUPPORT_EMAIL = "support@etgaming247.com";

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"),
  tier: varchar("tier").default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  accessCodeUsed: varchar("access_code_used"),
  contentNiche: varchar("content_niche"),
  notifyEmail: boolean("notify_email").default(true),
  notifyPhone: boolean("notify_phone").default(false),
  autopilotActive: boolean("autopilot_active").default(true),
  onboardingCompleted: timestamp("onboarding_completed"),
  channelLaunchState: varchar("channel_launch_state"),
  userPreferences: jsonb("user_preferences").$type<{
    wellness?: {
      mood?: number;
      energy?: number;
      stress?: number;
      lastCheckIn?: string;
    };
    accessibility?: {
      highContrast?: boolean;
      dyslexiaFont?: boolean;
      fontSize?: string;
      reducedMotion?: boolean;
      voiceNavigation?: boolean;
      keyboardShortcuts?: Record<string, string>;
      language?: string;
    };
    pushSubscriptions?: any[];
  }>().default({}),
  googleAccessToken: varchar("google_access_token"),
  googleRefreshToken: varchar("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
