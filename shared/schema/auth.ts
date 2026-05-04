import { pgTable, text, serial, boolean, timestamp, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("v2_users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  username: varchar("username"),
  displayName: varchar("display_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"),
  role: varchar("role").notNull().default("user"),
  subscriptionTier: varchar("subscription_tier").notNull().default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at"),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("v2_users_email_idx").on(t.email),
]);

export const sessions = pgTable("v2_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (t) => [
  index("v2_sessions_expire_idx").on(t.expire),
]);

export const passwordResetTokens = pgTable("v2_password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const SUBSCRIPTION_TIERS = ["free", "starter", "pro", "empire"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];
