/**
 * Platform Feature Detector
 *
 * Runs on a scheduled interval (alongside channel-catalog-sync). For every
 * connected channel it:
 *  1. Checks current stats against each platform feature's threshold
 *  2. When newly qualifying → inserts/updates the eligibility record
 *  3. Auto-activates features that need no application (e.g. TikTok LIVE)
 *  4. Fires a notification for features that require the user to apply
 *  5. Records which pipeline effects to enable once a feature is active
 */

import { db } from "../db";
import { channels, notifications, platformFeatureEligibility } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("platform-feature-detector");

// ─── Feature Catalogue ───────────────────────────────────────────────────────

export interface FeatureDefinition {
  id: string;
  platform: string;
  name: string;
  description: string;
  category: "monetization" | "live" | "commerce" | "creator";
  requiresApplication: boolean;
  applicationUrl?: string;
  /** Subscriber/follower count needed to qualify */
  thresholds: { subscriberCount?: number; viewCount?: number };
  /** Human-readable explanation of all thresholds (some can't be auto-checked) */
  thresholdNote: string;
  /** Feature IDs that must be active before this one can be evaluated */
  prerequisiteFeatureId?: string;
  /** Keys that get enabled in content pipeline when feature is active */
  pipelineEffects: string[];
  icon: "dollar" | "star" | "live" | "shopping" | "shield";
}

export const PLATFORM_FEATURES: FeatureDefinition[] = [
  // ── YouTube ──────────────────────────────────────────────────────────────
  {
    id: "youtube_ypp",
    platform: "youtube",
    name: "YouTube Partner Program",
    description: "Monetize with ads, channel memberships, and Super Chat. Earn revenue from every video.",
    category: "monetization",
    requiresApplication: true,
    applicationUrl: "https://studio.youtube.com/channel/monetization",
    thresholds: { subscriberCount: 1000 },
    thresholdNote: "1,000 subscribers + 4,000 watch hours (or 10M Shorts views) in the past 12 months.",
    pipelineEffects: ["monetization_metadata", "end_screens", "cards"],
    icon: "dollar",
  },
  {
    id: "youtube_memberships",
    platform: "youtube",
    name: "Channel Memberships",
    description: "Offer monthly memberships with exclusive perks, badges, and emojis to your community.",
    category: "monetization",
    requiresApplication: false,
    thresholds: { subscriberCount: 30000 },
    prerequisiteFeatureId: "youtube_ypp",
    thresholdNote: "30,000 subscribers + YouTube Partner Program approval required.",
    pipelineEffects: ["membership_cta"],
    icon: "star",
  },
  {
    id: "youtube_shopping",
    platform: "youtube",
    name: "YouTube Shopping",
    description: "Tag products directly in videos and livestreams. Drive merch sales from your content.",
    category: "commerce",
    requiresApplication: true,
    applicationUrl: "https://studio.youtube.com/channel/monetization/merch",
    thresholds: { subscriberCount: 10000 },
    prerequisiteFeatureId: "youtube_ypp",
    thresholdNote: "10,000 subscribers + YouTube Partner Program required.",
    pipelineEffects: ["shopping_tags"],
    icon: "shopping",
  },
  {
    id: "youtube_super_chat",
    platform: "youtube",
    name: "Super Chat & Super Stickers",
    description: "Let viewers pay to highlight their messages during live streams. Major revenue driver.",
    category: "monetization",
    requiresApplication: false,
    thresholds: { subscriberCount: 1000 },
    prerequisiteFeatureId: "youtube_ypp",
    thresholdNote: "Automatically enabled with YouTube Partner Program approval.",
    pipelineEffects: ["super_chat_cta"],
    icon: "dollar",
  },
  // ── TikTok ───────────────────────────────────────────────────────────────
  {
    id: "tiktok_live",
    platform: "tiktok",
    name: "TikTok LIVE Access",
    description: "Go live on TikTok to connect with your audience in real time and earn gifts.",
    category: "live",
    requiresApplication: false,
    thresholds: { subscriberCount: 1000 },
    thresholdNote: "1,000 followers — unlocks automatically when you reach the threshold.",
    pipelineEffects: ["tiktok_live_schedule"],
    icon: "live",
  },
  {
    id: "tiktok_creator_fund",
    platform: "tiktok",
    name: "TikTok Creator Next",
    description: "Earn money from your TikTok views through the Creator Fund, tips, and LIVE gifts.",
    category: "monetization",
    requiresApplication: true,
    applicationUrl: "https://www.tiktok.com/tiktok/creator-next",
    thresholds: { subscriberCount: 10000 },
    thresholdNote: "10,000 followers + 100,000 views in the past 30 days.",
    pipelineEffects: ["tiktok_monetization_cta"],
    icon: "dollar",
  },
  {
    id: "tiktok_shop",
    platform: "tiktok",
    name: "TikTok Shop Creator",
    description: "Tag products in videos and earn commissions. Sell directly without leaving TikTok.",
    category: "commerce",
    requiresApplication: true,
    applicationUrl: "https://affiliate.tiktok.com/connection/creator",
    thresholds: { subscriberCount: 5000 },
    thresholdNote: "5,000 followers required.",
    pipelineEffects: ["tiktok_shop_tags"],
    icon: "shopping",
  },
  // ── Twitch ───────────────────────────────────────────────────────────────
  {
    id: "twitch_affiliate",
    platform: "twitch",
    name: "Twitch Affiliate",
    description: "Earn with subscriptions, Bits, and game sales. Unlock emotes and channel points.",
    category: "monetization",
    requiresApplication: false,
    thresholds: { subscriberCount: 50 },
    thresholdNote: "50 followers + avg 3 viewers + 7 unique broadcast days + 500 min streamed in 30 days. Twitch auto-invites you.",
    pipelineEffects: ["twitch_sub_prompts"],
    icon: "star",
  },
  {
    id: "twitch_partner",
    platform: "twitch",
    name: "Twitch Partner",
    description: "Full Partner status: higher revenue share, priority support, and custom features.",
    category: "monetization",
    requiresApplication: true,
    applicationUrl: "https://dashboard.twitch.tv/partner-application",
    thresholds: { subscriberCount: 500 },
    thresholdNote: "75 average concurrent viewers in 30 days + 25 hours streamed + 12 unique broadcast days.",
    pipelineEffects: ["twitch_partner_badge"],
    icon: "star",
  },
  // ── Kick ─────────────────────────────────────────────────────────────────
  {
    id: "kick_creator_program",
    platform: "kick",
    name: "Kick Creator Program",
    description: "Join Kick's creator monetization program with an industry-leading 95/5 revenue split.",
    category: "monetization",
    requiresApplication: true,
    applicationUrl: "https://kick.com/creator-program",
    thresholds: { subscriberCount: 1000 },
    thresholdNote: "1,000 followers on Kick.",
    pipelineEffects: ["kick_monetization"],
    icon: "dollar",
  },
  // ── Discord ───────────────────────────────────────────────────────────────
  {
    id: "discord_server_subscription",
    platform: "discord",
    name: "Discord Server Subscriptions",
    description: "Charge members for exclusive server access, channels, and perks via Discord monetization.",
    category: "monetization",
    requiresApplication: true,
    applicationUrl: "https://discord.com/monetization",
    thresholds: { subscriberCount: 500 },
    thresholdNote: "Server must be Community-enabled with 500+ members and meet Discord's monetization policy.",
    pipelineEffects: ["discord_membership_cta"],
    icon: "dollar",
  },
];

// ─── Detection Logic ─────────────────────────────────────────────────────────

async function getActiveFeatureIds(userId: string, platform: string): Promise<Set<string>> {
  const rows = await db.select({ featureId: platformFeatureEligibility.featureId })
    .from(platformFeatureEligibility)
    .where(
      and(
        eq(platformFeatureEligibility.userId, userId),
        eq(platformFeatureEligibility.platform, platform),
        eq(platformFeatureEligibility.status, "active"),
      )
    );
  return new Set(rows.map(r => r.featureId));
}

async function checkFeatureForChannel(
  channel: { id: number; userId: string; platform: string; subscriberCount: number | null; viewCount: number | null; channelName: string },
  feature: FeatureDefinition,
  activeFeatureIds: Set<string>,
): Promise<void> {
  const { userId, platform, subscriberCount, viewCount } = channel;

  // Check prerequisite
  if (feature.prerequisiteFeatureId && !activeFeatureIds.has(feature.prerequisiteFeatureId)) return;

  // Check thresholds
  const subOk = feature.thresholds.subscriberCount == null || (subscriberCount != null && subscriberCount >= feature.thresholds.subscriberCount);
  const viewOk = feature.thresholds.viewCount == null || (viewCount != null && viewCount >= feature.thresholds.viewCount);
  if (!subOk || !viewOk) return;

  // See if there's an existing record
  const [existing] = await db.select()
    .from(platformFeatureEligibility)
    .where(
      and(
        eq(platformFeatureEligibility.userId, userId),
        eq(platformFeatureEligibility.platform, platform),
        eq(platformFeatureEligibility.featureId, feature.id),
      )
    )
    .limit(1);

  const thresholdsMet: Record<string, number> = {};
  if (subscriberCount != null) thresholdsMet.subscriberCount = subscriberCount;
  if (viewCount != null) thresholdsMet.viewCount = viewCount;

  if (!existing) {
    // New eligibility — insert record
    const newStatus = feature.requiresApplication ? "eligible" : "active";
    await db.insert(platformFeatureEligibility).values({
      userId,
      platform,
      featureId: feature.id,
      featureName: feature.name,
      status: newStatus,
      requiresApplication: feature.requiresApplication,
      applicationUrl: feature.applicationUrl ?? null,
      qualifiedAt: new Date(),
      thresholdsMet,
      pipelineEffects: feature.pipelineEffects,
      lastCheckedAt: new Date(),
      ...(newStatus === "active" ? { activatedAt: new Date() } : {}),
    });

    logger.info("New platform feature eligibility", { userId, platform, featureId: feature.id, status: newStatus });
    await sendEligibilityNotification(userId, channel.channelName, feature, newStatus);
    return;
  }

  // Already known — update last checked, auto-activate if still pending and no application needed
  if (existing.status === "checking" || existing.status === "eligible") {
    const updates: Partial<typeof platformFeatureEligibility.$inferInsert> = {
      lastCheckedAt: new Date(),
      thresholdsMet,
    };

    if (!feature.requiresApplication && existing.status !== "active") {
      updates.status = "active";
      updates.activatedAt = new Date();
      if (!existing.notifiedAt) {
        await sendEligibilityNotification(userId, channel.channelName, feature, "active");
      }
    } else if (existing.status === "checking") {
      updates.status = "eligible";
      updates.qualifiedAt = new Date();
      if (!existing.notifiedAt) {
        await sendEligibilityNotification(userId, channel.channelName, feature, "eligible");
      }
    }

    await db.update(platformFeatureEligibility)
      .set(updates)
      .where(eq(platformFeatureEligibility.id, existing.id));
  } else {
    // Just refresh the last-checked timestamp
    await db.update(platformFeatureEligibility)
      .set({ lastCheckedAt: new Date() })
      .where(eq(platformFeatureEligibility.id, existing.id));
  }
}

async function sendEligibilityNotification(
  userId: string,
  channelName: string,
  feature: FeatureDefinition,
  status: string,
): Promise<void> {
  const isAutoActive = status === "active" && !feature.requiresApplication;

  const title = isAutoActive
    ? `🎉 ${feature.name} — Now Active!`
    : `✅ You qualify for ${feature.name}`;

  const message = isAutoActive
    ? `${feature.description} This feature has been automatically enabled for ${channelName} and integrated into your content pipeline.`
    : `${channelName} has hit the threshold for ${feature.name}. ${feature.thresholdNote} ${feature.applicationUrl ? `Apply now to unlock it.` : ``}`;

  // Insert into notifications table directly (avoids rate-limit cooldowns for
  // feature eligibility — these are rare, high-value alerts)
  await db.insert(notifications).values({
    userId,
    type: "platform_feature",
    title,
    message,
    severity: "info",
    actionUrl: feature.applicationUrl || "/settings/platforms",
    metadata: {
      source: "platform-feature-detector",
      platformAffected: feature.platform,
    } as any,
  });

  // Mark notified timestamp
  await db.update(platformFeatureEligibility)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(platformFeatureEligibility.userId, userId),
        eq(platformFeatureEligibility.platform, feature.platform),
        eq(platformFeatureEligibility.featureId, feature.id),
      )
    );
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

export async function runPlatformFeatureDetection(): Promise<void> {
  try {
    const allChannels = await db.select({
      id: channels.id,
      userId: channels.userId,
      platform: channels.platform,
      channelName: channels.channelName,
      subscriberCount: channels.subscriberCount,
      viewCount: channels.viewCount,
    }).from(channels);

    if (allChannels.length === 0) return;

    for (const channel of allChannels) {
      const platformFeatures = PLATFORM_FEATURES.filter(f => f.platform === channel.platform);
      if (platformFeatures.length === 0) continue;

      const activeIds = await getActiveFeatureIds(channel.userId, channel.platform);

      for (const feature of platformFeatures) {
        try {
          await checkFeatureForChannel(channel, feature, activeIds);
        } catch (err: any) {
          logger.warn("Feature check failed", { featureId: feature.id, channelId: channel.id, error: err.message });
        }
      }
    }

    logger.info("Platform feature detection cycle complete", { channels: allChannels.length });
  } catch (err: any) {
    logger.error("Platform feature detection error", { error: err.message });
  }
}

export function startPlatformFeatureDetector(): void {
  // Run once on startup after a short delay, then every 6 hours
  setTimeout(() => runPlatformFeatureDetection().catch(() => {}), 30_000);
  setInterval(() => runPlatformFeatureDetection().catch(() => {}), 6 * 60 * 60_000);
  logger.info("Platform feature detector started (6h interval)");
}
