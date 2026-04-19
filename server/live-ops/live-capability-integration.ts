import { db } from "../db";
import { liveCapabilitySnapshots, channels } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface LiveCapabilityCheck {
  platform: string;
  channelId: string | null;
  eligible: boolean;
  reason: string;
  streamKeyConfigured: boolean;
  liveStreamingEnabled: boolean;
  partnerRestrictions: string[];
  geoRestrictions: string[];
  featureSupport: Record<string, boolean>;
}

export interface DestinationEligibility {
  platform: string;
  channelId: string | null;
  eligible: boolean;
  checks: LiveCapabilityCheck;
  blockers: string[];
  warnings: string[];
}

const PLATFORM_LIVE_REQUIREMENTS: Record<string, { requiresStreamKey: boolean; requiresVerification: boolean; minFollowers?: number; features: string[] }> = {
  youtube: { requiresStreamKey: true, requiresVerification: true, features: ["live_streaming", "custom_thumbnails", "super_chat"] },
  twitch: { requiresStreamKey: true, requiresVerification: false, features: ["live_streaming", "chat", "clips"] },
  kick: { requiresStreamKey: true, requiresVerification: false, features: ["live_streaming", "chat"] },
  tiktok: { requiresStreamKey: true, requiresVerification: true, minFollowers: 1000, features: ["live_streaming", "gifts"] },
};

export async function checkDestinationEligibility(
  platform: string,
  userId: string,
  channelId?: string
): Promise<DestinationEligibility> {
  const requirements = PLATFORM_LIVE_REQUIREMENTS[platform];
  if (!requirements) {
    return {
      platform, channelId: channelId || null, eligible: false,
      checks: {
        platform, channelId: channelId || null, eligible: false,
        reason: `Platform ${platform} not supported for live streaming`,
        streamKeyConfigured: false, liveStreamingEnabled: false,
        partnerRestrictions: [], geoRestrictions: [], featureSupport: {},
      },
      blockers: [`${platform} is not a supported live streaming platform`],
      warnings: [],
    };
  }

  const userChannels = await db.select()
    .from(channels)
    .where(and(
      eq(channels.userId, userId),
      eq(channels.platform, platform)
    ))
    .limit(1);

  const channel = userChannels[0];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!channel) {
    blockers.push(`No ${platform} channel connected`);
  } else if (!channel.accessToken) {
    blockers.push(`${platform} access token missing — reconnect required`);
  }

  const streamKeyConfigured = !!channel?.platformData && typeof channel.platformData === "object" && "streamKey" in (channel.platformData as any);
  if (requirements.requiresStreamKey && !streamKeyConfigured) {
    warnings.push(`Stream key not configured for ${platform} — will need to be provided at launch time`);
  }

  const liveStreamingEnabled = !!channel?.accessToken;

  const featureSupport: Record<string, boolean> = {};
  for (const feature of requirements.features) {
    featureSupport[feature] = liveStreamingEnabled;
  }

  const eligible = blockers.length === 0;

  const capCheck: LiveCapabilityCheck = {
    platform,
    channelId: (channel as any)?.platformChannelId || channelId || null,
    eligible,
    reason: eligible ? "All capability checks passed" : blockers.join("; "),
    streamKeyConfigured,
    liveStreamingEnabled,
    partnerRestrictions: [],
    geoRestrictions: [],
    featureSupport,
  };

  await db.insert(liveCapabilitySnapshots).values({
    platform,
    channelId: (channel as any)?.platformChannelId || channelId,
    capability: "live_streaming",
    supported: eligible,
    status: eligible ? "verified" : "unavailable",
    streamKeyConfigured,
    partnerRestrictions: [],
    geoRestrictions: [],
    featureSupport,
  });

  return { platform, channelId: (channel as any)?.platformChannelId || channelId || null, eligible, checks: capCheck, blockers, warnings };
}

export async function checkAllDestinations(userId: string): Promise<DestinationEligibility[]> {
  const platforms = ["youtube", "twitch", "kick", "tiktok"];
  const results: DestinationEligibility[] = [];

  for (const platform of platforms) {
    const eligibility = await checkDestinationEligibility(platform, userId);
    results.push(eligibility);
  }

  appendEvent("multistream.eligibility_checked", "live", "multistream", {
    userId,
    eligibleCount: results.filter(r => r.eligible).length,
    totalPlatforms: results.length,
  }, "live-capability-integration");

  return results;
}

export async function getMultistreamReadinessScore(userId: string): Promise<{
  score: number;
  eligiblePlatforms: string[];
  blockedPlatforms: { platform: string; reason: string }[];
  recommendations: string[];
}> {
  const eligibility = await checkAllDestinations(userId);
  const eligible = eligibility.filter(e => e.eligible);
  const blocked = eligibility.filter(e => !e.eligible);

  const score = eligibility.length > 0 ? eligible.length / eligibility.length : 0;

  const recommendations: string[] = [];
  if (eligible.length === 0) recommendations.push("Connect at least one platform with live streaming capability");
  if (eligible.length === 1) recommendations.push("Connect additional platforms to unlock multistreaming");
  if (eligible.length >= 2) recommendations.push("Multistreaming ready — you can go live on multiple platforms simultaneously");

  for (const b of blocked) {
    recommendations.push(`${b.platform}: ${b.blockers.join(", ")}`);
  }

  return {
    score,
    eligiblePlatforms: eligible.map(e => e.platform),
    blockedPlatforms: blocked.map(b => ({ platform: b.platform, reason: b.blockers.join("; ") })),
    recommendations,
  };
}
