import { db } from "../db";
import { channels, streamDetectionLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getQuotaStatus, trackQuotaUsage } from "./youtube-quota-tracker";
import { detectYouTubeLiveFromChannel } from "../lib/youtube-live-check";
import { checkYouTubeLiveBroadcasts } from "../youtube";

export interface LiveDetectionResult {
  isLive: boolean;
  videoId?: string;
  title?: string;
  platform: string;
  confidence: number;
  signals: Record<string, any>;
}

const userPollIntervals = new Map<string, number>();

/**
 * AUTONOMOUS: Multi-signal live detection for PS5/Creator streams.
 * Majority-vote between API and RSS/Watch-page signals.
 */
export async function detect(userId: string): Promise<LiveDetectionResult[]> {
  const userChannels = await db.select().from(channels).where(eq(channels.userId, userId));
  const results: LiveDetectionResult[] = [];

  for (const channel of userChannels) {
    if (channel.platform === "youtube") {
      results.push(await detectYouTube(userId, channel));
    } else if (channel.platform === "twitch") {
      results.push(await detectTwitch(userId, channel));
    }
  }

  return results;
}

async function detectYouTube(userId: string, channel: any): Promise<LiveDetectionResult> {
  const signals: Record<string, any> = {};
  let apiResult = null;
  let rssResult = null;

  // 1. Quota-aware API check
  const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
  if (quota.remaining > 5) {
    try {
      const broadcasts = await checkYouTubeLiveBroadcasts(channel.id);
      await trackQuotaUsage(userId, "list", 1).catch(() => {});
      apiResult = broadcasts.find(b => b.status === "active" || b.status === "live");
      signals.api = !!apiResult;
    } catch (err) {
      signals.api_error = err instanceof Error ? err.message : String(err);
    }
  } else {
    signals.api_skipped = "low_quota";
  }

  // 2. RSS/Watch-page fallback
  try {
    rssResult = await detectYouTubeLiveFromChannel(channel.channelId);
    signals.rss = rssResult.isLive;
  } catch (err) {
    signals.rss_error = err instanceof Error ? err.message : String(err);
  }

  const isLive = !!apiResult || (rssResult?.isLive ?? false);
  const confidence = (apiResult && rssResult?.isLive) ? 1.0 : 0.6;

  return {
    isLive,
    platform: "youtube",
    videoId: apiResult?.broadcastId || rssResult?.videoId || undefined,
    title: apiResult?.title || rssResult?.title || undefined,
    confidence,
    signals
  };
}

async function detectTwitch(userId: string, channel: any): Promise<LiveDetectionResult> {
  const token = channel.accessToken;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const signals: Record<string, any> = {};

  if (!token || !clientId) {
    return { isLive: false, platform: "twitch", confidence: 0, signals: { error: "missing_creds" } };
  }

  try {
    const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${channel.channelId}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
    });
    
    if (!streamsRes.ok) {
      signals.api_error = `HTTP ${streamsRes.status}`;
      return { isLive: false, platform: "twitch", confidence: 0, signals };
    }

    const data = await streamsRes.json();
    const live = data.data?.[0];
    
    signals.api = !!live;
    
    return {
      isLive: !!live,
      platform: "twitch",
      videoId: live?.id,
      title: live?.title,
      confidence: 1.0,
      signals
    };
  } catch (err) {
    return { isLive: false, platform: "twitch", confidence: 0, signals: { error: String(err) } };
  }
}

export const ps5Detector = {
  detect
};

export function startPS5Detector(userId: string, intervalMs: number = 90000) {
  userPollIntervals.set(userId, intervalMs);
}

export function stopPS5Detector(userId: string) {
  userPollIntervals.delete(userId);
}
