import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

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

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"),
  tier: varchar("tier").default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  accessCodeUsed: varchar("access_code_used"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
