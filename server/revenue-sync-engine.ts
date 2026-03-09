import { storage } from "./storage";
import type { Channel } from "@shared/schema";
import { withRetry } from "./lib/retry";

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
      const monthlyUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channel.channelId}&key=`;
      const statsRes = await withRetry(() => fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id=${channel.channelId}`, {
        headers: { Authorization: `Bearer ${channel.accessToken}` },
      }), { label: "YouTube channel stats API" });
      if (statsRes.ok) {
        const statsData = await statsRes.json() as any;
        const stats = statsData.items?.[0]?.statistics;
        if (stats) {
          const viewCount = parseInt(stats.viewCount || "0", 10);
          const estimatedCPM = 3.5;
          const estimatedMonthlyRevenue = (viewCount / 1000) * estimatedCPM / 12;

          if (estimatedMonthlyRevenue > 0) {
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const externalId = `yt-est-${channel.channelId}-${monthKey}`;
            const existing = await storage.getRevenueByExternalId(userId, externalId);
            if (!existing) {
              await storage.createRevenueRecord({
                userId,
                platform: "youtube",
                source: "Estimated Ad Revenue",
                amount: Math.round(estimatedMonthlyRevenue * 100) / 100,
                currency: "USD",
                period: monthKey,
                syncSource: "auto-estimated",
                externalId,
                metadata: { syncedAt: new Date().toISOString(), views: viewCount, estimatedRevenue: estimatedMonthlyRevenue },
                recordedAt: new Date(),
              });
              result.recordsSynced++;
              result.totalAmount += estimatedMonthlyRevenue;
            }
          }
        }
      }
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
    console.error("[RevenueSyncEngine:youtube] Error:", e.message);
  }
  return result;
}

async function syncTwitchRevenue(channel: Channel, userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "twitch", recordsSynced: 0, totalAmount: 0 };
  if (!channel.accessToken) { result.error = "No access token"; return result; }
  const clientId = process.env.TWITCH_CLIENT_ID || "";
  const headers = { Authorization: `Bearer ${channel.accessToken}`, "Client-Id": clientId };
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    const subUrl = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${channel.channelId}`;
    const subRes = await withRetry(() => fetch(subUrl, { headers }), { label: "Twitch subscriptions API" });
    if (subRes.ok) {
      const subData = await subRes.json() as any;
      const totalSubs = subData.total || 0;
      const subPoints = subData.points || totalSubs;
      const subRevenue = subPoints * 2.50;

      if (subRevenue > 0) {
        const externalId = `twitch-subs-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "twitch",
            source: "Subscriptions",
            amount: Math.round(subRevenue * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), subscribers: totalSubs, details: `${totalSubs} active subs` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += subRevenue;
        }
      }
    }

    const bitsUrl = `https://api.twitch.tv/helix/bits/leaderboard?period=month&count=100`;
    const bitsRes = await withRetry(() => fetch(bitsUrl, { headers }), { label: "Twitch bits API" });
    if (bitsRes.ok) {
      const bitsData = await bitsRes.json() as any;
      const totalBits = (bitsData.data || []).reduce((sum: number, entry: any) => sum + (entry.score || 0), 0);
      const bitsRevenue = totalBits * 0.01;

      if (bitsRevenue > 0) {
        const externalId = `twitch-bits-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "twitch",
            source: "Bits",
            amount: Math.round(bitsRevenue * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), details: `${totalBits} bits received` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += bitsRevenue;
        }
      }
    }

    const pd = channel.platformData as any;
    if (pd?.followerCount && pd.followerCount > 50) {
      const estimatedAdRevenue = pd.followerCount * 0.002 * 30;
      if (estimatedAdRevenue > 1) {
        const externalId = `twitch-ads-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "twitch",
            source: "Ad Revenue",
            amount: Math.round(estimatedAdRevenue * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto-estimated",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), details: `Estimated from ${pd.followerCount} followers` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += estimatedAdRevenue;
        }
      }
    }
  } catch (e: any) {
    result.error = e.message;
    console.error("[RevenueSyncEngine:twitch] Error:", e.message);
  }
  return result;
}

async function syncTikTokRevenue(channel: Channel, userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "tiktok", recordsSynced: 0, totalAmount: 0 };
  if (!channel.accessToken) { result.error = "No access token"; return result; }
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    const pd = channel.platformData as any;
    const videoCount = pd?.videoCount || 0;
    const likesCount = pd?.likesCount || 0;
    const followerCount = channel.subscriberCount || pd?.followerCount || 0;

    if (followerCount >= 10000 && videoCount > 0) {
      const avgViews = likesCount > 0 ? likesCount * 5 : followerCount * 0.1;
      const rpmEstimate = 0.03;
      const estimatedRevenue = (avgViews / 1000) * rpmEstimate * Math.min(videoCount, 30);

      if (estimatedRevenue > 0) {
        const externalId = `tiktok-creator-fund-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "tiktok",
            source: "Creator Fund",
            amount: Math.round(estimatedRevenue * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto-estimated",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), views: avgViews, details: `Est. from ${followerCount} followers, ${videoCount} videos` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += estimatedRevenue;
        }
      }
    }

    if (followerCount >= 1000) {
      const liveGiftEstimate = followerCount * 0.0005 * 30;
      if (liveGiftEstimate > 0.5) {
        const externalId = `tiktok-gifts-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "tiktok",
            source: "Live Gifts",
            amount: Math.round(liveGiftEstimate * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto-estimated",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), details: `Est. from ${followerCount} followers` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += liveGiftEstimate;
        }
      }
    }
  } catch (e: any) {
    result.error = e.message;
    console.error("[RevenueSyncEngine:tiktok] Error:", e.message);
  }
  return result;
}

async function syncKickRevenue(channel: Channel, userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "kick", recordsSynced: 0, totalAmount: 0 };
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pd = channel.platformData as any;

  try {
    const followerCount = channel.subscriberCount || pd?.followerCount || 0;
    if (followerCount > 0) {
      const estimatedSubRevenue = followerCount * 0.02 * 4.99 * 0.95;
      if (estimatedSubRevenue > 0.5) {
        const externalId = `kick-subs-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "kick",
            source: "Subscriptions (95/5 split)",
            amount: Math.round(estimatedSubRevenue * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto-estimated",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), details: `Est. from ${followerCount} followers, 95/5 revenue split` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += estimatedSubRevenue;
        }
      }
    }
  } catch (e: any) {
    result.error = e.message;
    console.error("[RevenueSyncEngine:kick] Error:", e.message);
  }
  return result;
}

async function syncDiscordRevenue(channel: Channel, userId: string): Promise<RevenueSyncResult> {
  const result: RevenueSyncResult = { platform: "discord", recordsSynced: 0, totalAmount: 0 };
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pd = channel.platformData as any;

  try {
    const memberCount = pd?.memberCount || pd?.approximate_member_count || 0;
    if (memberCount >= 100) {
      const premiumEstimate = memberCount * 0.01 * 4.99 * 0.9;
      if (premiumEstimate > 0.5) {
        const externalId = `discord-premium-${channel.channelId}-${monthKey}`;
        const existing = await storage.getRevenueByExternalId(userId, externalId);
        if (!existing) {
          await storage.createRevenueRecord({
            userId,
            platform: "discord",
            source: "Server Subscriptions",
            amount: Math.round(premiumEstimate * 100) / 100,
            currency: "USD",
            period: monthKey,
            syncSource: "auto-estimated",
            externalId,
            metadata: { syncedAt: new Date().toISOString(), details: `Est. from ${memberCount} members` },
            recordedAt: new Date(),
          });
          result.recordsSynced++;
          result.totalAmount += premiumEstimate;
        }
      }
    }
  } catch (e: any) {
    result.error = e.message;
    console.error("[RevenueSyncEngine:discord] Error:", e.message);
  }
  return result;
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
    console.error("[RevenueSyncEngine:stripe] Error:", e.message);
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
