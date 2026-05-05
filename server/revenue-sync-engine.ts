import { storage } from "./storage";
import type { Channel } from "@shared/schema";
import { withRetry } from "./lib/retry";

import { createLogger } from "./lib/logger";

const logger = createLogger("revenue-sync-engine");
interface RevenueSyncResult {
  platform: string;
  recordsSynced: number;
  totalAmount: number;
  error?: string;
}

async function syncYouTubeRevenue(channel: Channel, userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "youtube", recordsSynced: 0, totalAmount: 0 };
  if (!channel.accessToken) { result.error = "No access token"; return result; }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = now.toISOString().split("T")[0];

    const analyticsUrl = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channel.channelId}&startDate=${startStr}&endDate=${endStr}&metrics=estimatedRevenue,views,estimatedAdRevenue&dimensions=day&sort=-day`;
    const analyticsRes = await withRetry(() => fetch(analyticsUrl, {
      headers: { Authorization: `Bearer ${channel.accessToken}` },
    }), { label: "YouTube Analytics API" });

    if (analyticsRes.ok) {
      const data = await analyticsRes.json() as any;
      const rows = data.rows || [];
      for (const row of rows) {
        const [date, estimatedRevenue, views, adRevenue] = row;
        const amount = estimatedRevenue || adRevenue || 0;
        if (amount <= 0) continue;

        const externalId = `yt-revenue-${channel.channelId}-${date}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (existing) continue;

        await storage.createRevenueRecord({
          userId,
          platform: "youtube",
          source: "Ad Revenue",
          amount,
          currency: "USD",
          period: date,
          syncSource: "auto",
          externalId,
          metadata: { syncedAt: new Date().toISOString(), estimatedRevenue: amount, views },
          recordedAt: new Date(date),
        });
        result.recordsSynced++;
        result.totalAmount += amount;
      }
    } else {
      const analyticsStatus = analyticsRes.status;
      if (analyticsStatus === 403 || analyticsStatus === 401) {
        result.error = "YouTube monetization analytics not accessible — channel may not be in YouTube Partner Program or monetary scope is missing";
      } else {
        result.error = `YouTube Analytics API returned status ${analyticsStatus} — skipping revenue sync`;
      }
      logger.warn("YouTube Analytics API unavailable for revenue sync", { channelId: channel.channelId, status: analyticsStatus });
    }

    const memberUrl = `https://www.googleapis.com/youtube/v3/membershipsLevels?part=snippet`;
    const memberRes = await withRetry(() => fetch(memberUrl, {
      headers: { Authorization: `Bearer ${channel.accessToken}` },
    }), { label: "YouTube memberships API" });
    if (memberRes.ok) {
      const memberData = await memberRes.json() as any;
      const levels = memberData.items || [];
      if (levels.length > 0) {
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const externalId = `yt-memberships-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          const pd = channel.platformData as any;
          const subscriberCount = channel.subscriberCount || pd?.subscriberCount || 0;
          const memberEstimate = Math.max(0, Math.round(subscriberCount * 0.005) * 4.99 * 0.7);
          if (memberEstimate > 0) {
            await storage.createRevenueRecord({
              userId,
              platform: "youtube",
              source: "Channel Memberships",
              amount: Math.round(memberEstimate * 100) / 100,
              currency: "USD",
              period: monthKey,
              syncSource: "auto-estimated",
              externalId,
              metadata: { syncedAt: new Date().toISOString(), subscribers: subscriberCount },
              recordedAt: new Date(),
            });
            result.recordsSynced++;
            result.totalAmount += memberEstimate;
          }
        }
      }
    }

    const scUrl = `https://www.googleapis.com/youtube/v3/superChatEvents?part=snippet&maxResults=50`;
    const scRes = await withRetry(() => fetch(scUrl, { headers: { Authorization: `Bearer ${channel.accessToken}` } }), { label: "YouTube Super Chat API" });
    if (scRes.ok) {
      const scData = await scRes.json() as any;
      for (const item of (scData.items || [])) {
        const snip = item.snippet;
        if (!snip) continue;
        const amountMicros = parseInt(snip.amountMicros || "0", 10);
        const amount = (amountMicros / 1000000) * 0.7;
        if (amount <= 0) continue;

        const externalId = `yt-sc-${item.id}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (existing) continue;

        await storage.createRevenueRecord({
          userId,
          platform: "youtube",
          source: "Super Chat",
          amount: Math.round(amount * 100) / 100,
          currency: snip.currency || "USD",
          period: snip.createdAt?.split("T")?.[0],
          syncSource: "auto",
          externalId,
          metadata: { syncedAt: new Date().toISOString(), details: `From ${snip.supporterDetails?.displayName || "viewer"}` },
          recordedAt: snip.createdAt ? new Date(snip.createdAt) : new Date(),
        });
        result.recordsSynced++;
        result.totalAmount += amount;
      }
    }
  } catch (e: any) {
    result.error = e.message;
    logger.error("[RevenueSyncEngine:youtube] Error:", e.message);
  }
  return result;
}

// DISABLED: Twitch revenue sync — YouTube-only mode. Returns empty result immediately.
async function syncTwitchRevenue(_channel: Channel, _userId: string): Promise<RevenueSyncResult> {
  return { platform: "twitch", recordsSynced: 0, totalAmount: 0, error: "YouTube-only mode — Twitch sync disabled" };
}

// DISABLED: TikTok revenue sync — YouTube-only mode.
async function syncTikTokRevenue(_channel: Channel, _userId: string): Promise<RevenueSyncResult> {
  return { platform: "tiktok", recordsSynced: 0, totalAmount: 0, error: "YouTube-only mode — TikTok sync disabled" };
}

// DISABLED: Kick revenue sync — YouTube-only mode.
async function syncKickRevenue(_channel: Channel, _userId: string): Promise<RevenueSyncResult> {
  return { platform: "kick", recordsSynced: 0, totalAmount: 0, error: "YouTube-only mode — Kick sync disabled" };
}

// DISABLED: Discord revenue sync — YouTube-only mode.
async function syncDiscordRevenue(_channel: Channel, _userId: string): Promise<RevenueSyncResult> {
  return { platform: "discord", recordsSynced: 0, totalAmount: 0, error: "YouTube-only mode — Discord sync disabled" };
}

async function syncStripeRevenue(userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "stripe", recordsSynced: 0, totalAmount: 0 };

  try {
    const { getUncachableStripeClient } = await import("./stripeClient");
    const stripe = await getUncachableStripeClient();
    if (!stripe) { result.error = "Stripe not configured"; return result; }

    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) return result;

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const charges = await stripe.charges.list({
      customer: user.stripeCustomerId,
      created: { gte: Math.floor(thirtyDaysAgo.getTime() / 1000) },
      limit: 100,
    });

    for (const charge of charges.data) {
      if (charge.status !== "succeeded") continue;
      const amount = charge.amount / 100;
      const externalId = `stripe-${charge.id}`;
      const existing = await storage.getRevenueByExternalId(userId, externalId);
      if (existing) continue;

      await storage.createRevenueRecord({
        userId,
        platform: "stripe",
        source: charge.description || "Stripe Payment",
        amount,
        currency: (charge.currency || "usd").toUpperCase(),
        period: new Date(charge.created * 1000).toISOString().split("T")[0],
        syncSource: "auto",
        externalId,
        metadata: { syncedAt: new Date().toISOString(), details: charge.description || "Payment received" },
        recordedAt: new Date(charge.created * 1000),
      });
      result.recordsSynced++;
      result.totalAmount += amount;
    }
  } catch (e: any) {
    result.error = e.message;
    logger.error("[RevenueSyncEngine:stripe] Error:", e.message);
  }
  return result;
}

const PLATFORM_REVENUE_SYNCERS: Record<string, (channel: Channel, userId: string) => Promise<RevenueSyncResult>> = {
  youtube: syncYouTubeRevenue,
  twitch: syncTwitchRevenue,
  tiktok: syncTikTokRevenue,
  kick: syncKickRevenue,
  discord: syncDiscordRevenue,
};

export async function syncAllRevenue(userId: string): Promise<{ results: RevenueSyncResult[]; totalSynced: number; totalAmount: number }> {
  const results: RevenueSyncResult[] = [];
  let totalSynced = 0;
  let totalAmount = 0;

  const userChannels = await storage.getChannelsByUser(userId);

  for (const channel of userChannels) {
    const syncer = PLATFORM_REVENUE_SYNCERS[channel.platform];
    if (syncer) {
      const r = await syncer(channel, userId);
      results.push(r);
      totalSynced += r.recordsSynced;
      totalAmount += r.totalAmount;

      await storage.createRevenueSyncLog({
        userId,
        platform: channel.platform,
        status: r.error ? "error" : "success",
        recordsSynced: r.recordsSynced,
        totalAmount: r.totalAmount,
        errorMessage: r.error || null,
      });
    }
  }

  const stripeResult = await syncStripeRevenue(userId);
  results.push(stripeResult);
  totalSynced += stripeResult.recordsSynced;
  totalAmount += stripeResult.totalAmount;
  await storage.createRevenueSyncLog({
    userId,
    platform: "stripe",
    status: stripeResult.error ? "error" : "success",
    recordsSynced: stripeResult.recordsSynced,
    totalAmount: stripeResult.totalAmount,
    errorMessage: stripeResult.error || null,
  });

  return { results, totalSynced, totalAmount };
}

export async function syncPlatformRevenue(userId: string, platform: string): Promise<RevenueSyncResult> {
  if (platform === "stripe") {
    return syncStripeRevenue(userId);
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const channel = userChannels.find(c => c.platform === platform);
  if (!channel) {
    return { platform, recordsSynced: 0, totalAmount: 0, error: "Platform not connected" };
  }

  const syncer = PLATFORM_REVENUE_SYNCERS[platform];
  if (!syncer) {
    return { platform, recordsSynced: 0, totalAmount: 0, error: "No revenue sync available for this platform" };
  }

  const r = await syncer(channel, userId);
  await storage.createRevenueSyncLog({
    userId,
    platform,
    status: r.error ? "error" : "success",
    recordsSynced: r.recordsSynced,
    totalAmount: r.totalAmount,
    errorMessage: r.error || null,
  });

  return r;
}
