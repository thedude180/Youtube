import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const NOTIFICATION_CHANNELS = ["email", "sms", "push", "in_app"] as const;
export const NOTIFICATION_STATUS = ["pending", "sent", "failed", "deduplicated"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(),
  title: varchar("title").notNull(),
  body: text("body"),
  channel: varchar("channel").$type<NotificationChannel>().notNull().default("in_app"),
  status: varchar("status").notNull().default("pending"),
  readAt: timestamp("read_at"),
  sentAt: timestamp("sent_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("notif_user_idx").on(t.userId),
  index("notif_status_idx").on(t.status),
]);

export const notificationDedupeLog = pgTable("notification_dedupe_log", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  dedupeKey: varchar("dedupe_key").notNull(),
  lastSentAt: timestamp("last_sent_at").notNull(),
  sendCount: integer("send_count").default(1),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [
  uniqueIndex("dedupe_user_key_idx").on(t.userId, t.dedupeKey),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  emailEnabled: boolean("email_enabled").default(true),
  smsEnabled: boolean("sms_enabled").default(false),
  pushEnabled: boolean("push_enabled").default(false),
  inAppEnabled: boolean("in_app_enabled").default(true),
  digestFrequency: varchar("digest_frequency").default("daily"),
  quietHoursStart: varchar("quiet_hours_start"),
  quietHoursEnd: varchar("quiet_hours_end"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
