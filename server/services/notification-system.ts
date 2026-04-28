import { db } from "../db";
import { notificationPreferences, notifications } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, desc, sql, and, gte, count, lte } from "drizzle-orm";

import { createLogger } from "../lib/logger";

const logger = createLogger("notification-system");
const DEFAULT_CATEGORIES: Record<string, boolean> = {
  security: true,
  content: true,
  stream: true,
  money: true,
  system: true,
  marketing: false,
};

const SEVERITY_COLORS: Record<string, number> = {
  info: 0x3b82f6,
  warning: 0xf59e0b,
  critical: 0xdc2626,
};

// === Notification Preferences Manager ===

export async function getNotificationPreferences(userId: string) {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing) {
    if (!existing.discordWebhookUrl && process.env.DISCORD_WEBHOOK_URL) {
      existing.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    }
    return existing;
  }

  const envWebhook = process.env.DISCORD_WEBHOOK_URL || null;

  const [created] = await db
    .insert(notificationPreferences)
    .values({
      userId,
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: false,
      discordWebhookUrl: envWebhook,
      digestFrequency: "none",
      timezone: "UTC",
      categories: { ...DEFAULT_CATEGORIES },
    })
    .returning();

  return created;
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: Partial<{
    emailEnabled: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
    discordWebhookUrl: string | null;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    timezone: string;
    digestFrequency: string;
    categories: Record<string, boolean>;
  }>,
) {
  const existing = await getNotificationPreferences(userId);
  const mergedCategories = prefs.categories
    ? { ...DEFAULT_CATEGORIES, ...(existing.categories as Record<string, boolean>), ...prefs.categories }
    : undefined;

  const updateData: Record<string, any> = { ...prefs, updatedAt: new Date() };
  if (mergedCategories) updateData.categories = mergedCategories;

  const [updated] = await db
    .update(notificationPreferences)
    .set(updateData)
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  return updated;
}

export async function isNotificationEnabled(
  userId: string,
  category: string,
  channel: "email" | "push" | "sms",
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  const cats = (prefs.categories as Record<string, boolean>) || DEFAULT_CATEGORIES;
  if (cats[category] === false) return false;

  switch (channel) {
    case "email": return prefs.emailEnabled ?? true;
    case "push": return prefs.pushEnabled ?? true;
    case "sms": return prefs.smsEnabled ?? false;
    default: return false;
  }
}

// === Quiet Hours System ===

function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
    return parseInt(formatter.format(now), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

export async function isInQuietHours(userId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (prefs.quietHoursStart == null || prefs.quietHoursEnd == null) return false;

  const currentHour = getCurrentHourInTimezone(prefs.timezone || "UTC");
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;

  if (start < end) return currentHour >= start && currentHour < end;
  return currentHour >= start || currentHour < end;
}

export async function shouldDelayNotification(
  userId: string,
  severity: string,
): Promise<boolean> {
  if (severity === "critical") return false;
  return isInQuietHours(userId);
}

export async function getNextActiveWindow(userId: string): Promise<Date> {
  const prefs = await getNotificationPreferences(userId);
  const endHour = prefs.quietHoursEnd ?? 8;
  const tz = prefs.timezone || "UTC";
  const currentHour = getCurrentHourInTimezone(tz);

  const now = new Date();
  const hoursUntilEnd = endHour > currentHour
    ? endHour - currentHour
    : 24 - currentHour + endHour;

  return new Date(now.getTime() + hoursUntilEnd * 60 * 60 * 1000);
}

// === Discord Webhook Notifications ===

export async function sendDiscordWebhook(
  webhookUrl: string,
  title: string,
  message: string,
  severity: string,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
): Promise<boolean> {
  try {
    const embed: Record<string, any> = {
      title,
      description: message,
      color: SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info,
      timestamp: new Date().toISOString(),
      footer: { text: "CreatorOS Notification" },
    };
    if (fields?.length) embed.fields = fields;

    const notifCtrl = new AbortController();
    const notifTimer = setTimeout(() => notifCtrl.abort(), 10000);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: notifCtrl.signal,
    });
    clearTimeout(notifTimer);

    if (!response.ok) {
      logger.error(`[NotificationSystem] Discord webhook failed (${response.status})`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("[NotificationSystem] Discord webhook error:", err);
    return false;
  }
}

export async function notifyViaDiscord(
  userId: string,
  title: string,
  message: string,
  severity: string,
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs.discordWebhookUrl) return false;
  return sendDiscordWebhook(prefs.discordWebhookUrl, title, message, severity);
}

// === Notification Digest System ===

export async function getDigestContent(userId: string, since: Date) {
  const items = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.read, false),
        gte(notifications.createdAt, since),
      ),
    )
    .orderBy(desc(notifications.createdAt));

  const byCategory: Record<string, typeof items> = {};
  const bySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0 };

  for (const item of items) {
    const cat = item.type || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  }

  return { items, byCategory, bySeverity, total: items.length };
}

export async function generateDigest(userId: string, frequency: string) {
  const now = new Date();
  const since = new Date(now);
  if (frequency === "weekly") since.setDate(since.getDate() - 7);
  else since.setDate(since.getDate() - 1);

  const content = await getDigestContent(userId, since);
  if (content.total === 0) return null;

  const lines: string[] = [`Notification Digest (${frequency})\n`];
  for (const [category, items] of Object.entries(content.byCategory)) {
    lines.push(`--- ${category.toUpperCase()} (${items.length}) ---`);
    for (const item of items.slice(0, 5)) {
      lines.push(`  [${item.severity}] ${item.title}: ${item.message}`);
    }
    if (items.length > 5) lines.push(`  ...and ${items.length - 5} more`);
  }

  return {
    userId,
    frequency,
    summary: lines.join("\n"),
    ...content,
  };
}

export async function shouldSendDigest(userId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs.digestFrequency || prefs.digestFrequency === "none") return false;

  const tz = prefs.timezone || "UTC";
  const currentHour = getCurrentHourInTimezone(tz);

  if (currentHour !== 8) return false;

  if (prefs.digestFrequency === "weekly") {
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz });
    if (dayFormatter.format(now) !== "Monday") return false;
  }

  return true;
}

export async function processAllDigests() {
  const allPrefs = await db
    .select()
    .from(notificationPreferences)
    .where(sql`${notificationPreferences.digestFrequency} IS NOT NULL AND ${notificationPreferences.digestFrequency} != 'none'`);

  const results: Array<{ userId: string; sent: boolean }> = [];

  for (const pref of allPrefs) {
    const ready = await shouldSendDigest(pref.userId);
    if (!ready) {
      results.push({ userId: pref.userId, sent: false });
      continue;
    }
    const digest = await generateDigest(pref.userId, pref.digestFrequency || "daily");
    // Notification digest email disabled — daily-upload-digest.ts is the only scheduled email report.
    results.push({ userId: pref.userId, sent: !!digest });
  }

  return results;
}

// === Bulk Actions ===

export async function markAllRead(userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return (result as any).rowCount ?? 0;
}

export async function markCategoryRead(userId: string, category: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, category),
        eq(notifications.read, false),
      ),
    );
  return (result as any).rowCount ?? 0;
}

export async function deleteOldNotifications(userId: string, olderThanDays: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        lte(notifications.createdAt, cutoff),
      ),
    );
  return (result as any).rowCount ?? 0;
}

export async function purgeStaleReadNotifications(): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.read, true),
        sql`(${notifications.readAt} IS NOT NULL AND ${notifications.readAt} <= ${twentyFourHoursAgo}) OR (${notifications.readAt} IS NULL AND ${notifications.createdAt} <= ${twentyFourHoursAgo})`,
      ),
    );
  const deleted = (result as any).rowCount ?? 0;
  return deleted;
}

export async function getUnreadCounts(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      type: notifications.type,
      count: count(),
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .groupBy(notifications.type);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.type] = row.count;
  }
  return counts;
}

// === Smart Notification Router ===

interface RoutableNotification {
  title: string;
  message: string;
  severity: string;
  category: string;
}

export async function routeNotification(
  userId: string,
  notification: RoutableNotification,
): Promise<{ channels: string[]; delayed: boolean }> {
  const result: { channels: string[]; delayed: boolean } = { channels: [], delayed: false };
  const isCritical = notification.severity === "critical";

  const shouldDelay = await shouldDelayNotification(userId, notification.severity);
  if (shouldDelay && !isCritical) {
    const nextWindow = await getNextActiveWindow(userId);
    result.delayed = true;
    return result;
  }

  const prefs = await getNotificationPreferences(userId);
  const cats = (prefs.categories as Record<string, boolean>) || DEFAULT_CATEGORIES;
  const categoryEnabled = cats[notification.category] !== false;

  if (!categoryEnabled && !isCritical) {
    return result;
  }

  const isConnectionLoss = notification.category === "connection_severed" || notification.category === "platform_disconnected" || notification.category === "platform_connections";
  if (isConnectionLoss) {
    return result;
  }

  if (isCritical || (prefs.pushEnabled && categoryEnabled)) {
    result.channels.push("push");
  }

  if (isCritical && prefs.smsEnabled) {
    result.channels.push("sms");
  }

  if (prefs.discordWebhookUrl) {
    result.channels.push("discord");
    await notifyViaDiscord(userId, notification.title, notification.message, notification.severity);
  }

  return result;
}
