import { db } from "../db";
import { channels, streamDetectionLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { canAffordOperation, trackQuotaUsage } from "./youtube-quota-tracker";
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
    } else if (channel.platform === "kick") {
      results.push(await detectKick(userId, channel));
    } else if (channel.platform === "tiktok") {
      results.push(await detectTikTok(userId, channel));
    }
  }

  return results;
}

async function detectKick(userId: string, channel: any): Promise<LiveDetectionResult> {
  // Kick stores the human-readable slug as channelName; channelId may be a
  // numeric identifier.  The public v2 API endpoint requires the slug.
  const channelName = channel.channelName || channel.channelId;
  const signals: Record<string, any> = {};

  if (!channelName) {
    return { isLive: false, platform: "kick", confidence: 0, signals: { error: "missing_channel_id" } };
  }

  try {
    // Kick public API v2 — no auth required
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channelName)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
    });
    
    if (!res.ok) {
      signals.api_error = `HTTP ${res.status}`;
      return { isLive: false, platform: "kick", confidence: 0, signals };
    }

    const data = await res.json();
    const isLive = data.is_live === true;
    
    signals.api = isLive;
    
    return {
      isLive,
      platform: "kick",
      videoId: data.livestream?.id?.toString(),
      title: data.livestream?.session_title,
      confidence: 1.0,
      signals
    };
  } catch (err) {
    return { isLive: false, platform: "kick", confidence: 0, signals: { error: String(err) } };
  }
}

async function detectYouTube(userId: string, channel: any): Promise<LiveDetectionResult> {
  const signals: Record<string, any> = {};
  let apiResult = null;
  let rssResult = null;

  // 1. Quota-aware API check (liveBroadcasts.list costs 50 units).
  // Must pass canAffordOperation("broadcast") — which enforces the 20/day op cap AND
  // requires UPLOAD_RESERVE headroom — to avoid draining quota needed for video uploads.
  if (await canAffordOperation(userId, "broadcast").catch(() => false)) {
    try {
      const broadcasts = await checkYouTubeLiveBroadcasts(channel.id);
      await trackQuotaUsage(userId, "broadcast").catch(() => {});
      apiResult = broadcasts.find(b => b.status === "active" || b.status === "live");
      signals.api = !!apiResult;
    } catch (err) {
      signals.api_error = err instanceof Error ? err.message : String(err);
    }
  } else {
    signals.api_skipped = "broadcast_cap_or_upload_reserve";
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
  const clientId = process.env.TWITCH_DEV_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
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

async function detectTikTok(userId: string, channel: any): Promise<LiveDetectionResult> {
  const username = channel.channelId;
  const signals: Record<string, any> = {};

  if (!username) {
    return { isLive: false, platform: "tiktok", confidence: 0, signals: { error: "missing_channel_id" } };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://www.tiktok.com/@${username}/live`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const isLive =
      html.includes('"is_live":true') ||
      html.includes('"isLive":true') ||
      html.includes('"status":4') ||
      (html.includes('/live') && html.includes('"liveRoom"'));

    signals.statusCode = res.status;
    signals.isLive = isLive;

    return {
      isLive,
      platform: "tiktok",
      confidence: isLive ? 0.8 : 0.7,
      signals,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { isLive: false, platform: "tiktok", confidence: 0, signals: { error: "tiktok_timeout" } };
    }
    return { isLive: false, platform: "tiktok", confidence: 0, signals: { error: String(err) } };
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
