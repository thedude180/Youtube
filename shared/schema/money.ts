import { pgTable, serial, varchar, text, boolean, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const revenueSnapshots = pgTable("v2_revenue_snapshots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  adRevenueCents: integer("ad_revenue_cents").default(0),
  membershipRevenueCents: integer("membership_revenue_cents").default(0),
  superChatRevenueCents: integer("super_chat_revenue_cents").default(0),
  sponsorshipRevenueCents: integer("sponsorship_revenue_cents").default(0),
  totalCents: integer("total_cents").default(0),
  currency: varchar("currency").default("USD"),
  source: varchar("source").notNull().default("manual"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_revenue_user_idx").on(t.userId),
  index("v2_revenue_period_idx").on(t.periodStart, t.periodEnd),
]);

export const stripeEvents = pgTable("v2_stripe_events", {
  id: serial("id").primaryKey(),
  stripeEventId: varchar("stripe_event_id").unique().notNull(),
  type: varchar("type").notNull(),
  userId: varchar("user_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sponsorships = pgTable("v2_sponsorships", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  sponsorName: varchar("sponsor_name").notNull(),
  dealValueCents: integer("deal_value_cents"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status").notNull().default("prospecting"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("v2_sponsors_user_idx").on(t.userId),
]);

export const insertRevenueSnapshotSchema = createInsertSchema(revenueSnapshots).omit({ id: true, createdAt: true });
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type InsertRevenueSnapshot = z.infer<typeof insertRevenueSnapshotSchema>;
