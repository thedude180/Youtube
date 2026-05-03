import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const PLATFORMS = ["youtube", "tiktok", "discord", "twitch", "kick"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  platform: varchar("platform").$type<Platform>().notNull(),
  platformUserId: varchar("platform_user_id"),
  username: varchar("username"),
  displayName: varchar("display_name"),
  profileUrl: varchar("profile_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scopes: text("scopes").array().default([]),
  platformData: jsonb("platform_data").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("channels_user_idx").on(t.userId),
  uniqueIndex("channels_user_platform_idx").on(t.userId, t.platform),
]);

export const oauthStates = pgTable("oauth_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  platform: varchar("platform").notNull(),
  state: varchar("state").notNull().unique(),
  codeVerifier: varchar("code_verifier"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChannelSchema = createInsertSchema(channels).omit({ id: true, createdAt: true, updatedAt: true });
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
