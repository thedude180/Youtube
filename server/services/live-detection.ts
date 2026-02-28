import { db } from "../db";
import { channels } from "@shared/schema";
import { storage } from "../storage";
import { sendSSEEvent } from "../routes/events";
import { getQuotaStatus, trackQuotaUsage } from "./youtube-quota-tracker";

async function checkYoutubeLiveViaRSS(youtubeChannelId: string): Promise<{ isLive: boolean; title: string | null; videoId: string | null }> {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CreatorOS/1.0)" },
    });
    if (!res.ok) return { isLive: false, title: null, videoId: null };
    const xml = await res.text();
    const isLive = xml.includes("<yt:liveBroadcastContent>live</yt:liveBroadcastContent>");
    let title: string | null = null;
    let videoId: string | null = null;
    if (isLive) {
      const titleMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
      title = titleMatch?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1").trim() ?? null;
      const vidMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      videoId = vidMatch?.[1]?.trim() ?? null;
    }
    return { isLive, title, videoId };
  } catch {
    return { isLive: false, title: null, videoId: null };
  }
}

interface DetectedBroadcast {
  platform: string;
  broadcastId: string;
  title: string;
  description: string;
  startedAt?: string;
  viewerCount?: number;
}

const trackedBroadcasts = new Map<string, { streamId: number; platform: string; broadcastId: string; missCount: number }>();

import { registerMap } from "./resilience-core";
registerMap("trackedBroadcasts", trackedBroadcasts, 500);

let running = false;

function trackingKey(userId: string, platform: string, channelId: number) {
  return `${userId}:${platform}:${channelId}`;
}

async function checkTwitchLive(channelRow: any): Promise<DetectedBroadcast[]> {
  const token = channelRow.accessToken;
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];

  try {
    let twitchUserId = channelRow.channelId;

    if (!twitchUserId) {
      const userInfoRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      });
      if (!userInfoRes.ok) return [];
      const userInfo = await userInfoRes.json();
      twitchUserId = userInfo.data?.[0]?.id;
      if (!twitchUserId) return [];
    }

    const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${twitchUserId}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
    });
    if (!streamsRes.ok) return [];
    const streamsData = await streamsRes.json();

    return (streamsData.data || [])
      .filter((s: any) => s.type === "live")
      .map((s: any) => ({
        platform: "twitch",
        broadcastId: s.id,
        title: s.title || "Twitch Stream",
        description: `${s.game_name || "Streaming"} on Twitch`,
        startedAt: s.started_at,
        viewerCount: s.viewer_count,
      }));
  } catch (err) {
    console.error(`[LiveDetection] Twitch check failed for channel ${channelRow.id}:`, err);
    return [];
  }
}

async function checkYouTubeLive(channelRow: any): Promise<DetectedBroadcast[]> {
  const userId = channelRow.userId;

  // Try YouTube API if quota is available
  const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
  if (quota.remaining > 5) {
    try {
      const { checkYouTubeLiveBroadcasts } = await import("../youtube");
      const broadcasts = await checkYouTubeLiveBroadcasts(channelRow.id);
      await trackQuotaUsage(userId, "list", 1).catch(() => {});
      const active = broadcasts.filter((b: any) => b.status === "active" || b.status === "live");
      if (active.length > 0) {
        return active.map((b: any) => ({
          platform: "youtube",
          broadcastId: b.broadcastId,
          title: b.title || "YouTube Stream",
          description: b.description || "Live on YouTube",
          startedAt: b.startedAt || b.scheduledStartTime,
          viewerCount: undefined,
        }));
      }
      // API succeeded but no live stream — still check RSS to be sure
    } catch (err) {
      console.error(`[LiveDetection] YouTube API check failed for channel ${channelRow.id}:`, err);
    }
  } else {
    console.warn(`[LiveDetection] YouTube quota low (${quota.remaining}) for ${userId} — using RSS fallback`);
  }

  // RSS fallback: zero-quota check via YouTube Atom feed
  if (channelRow.channelId) {
    try {
      const rss = await checkYoutubeLiveViaRSS(channelRow.channelId);
      if (rss.isLive) {
        console.log(`[LiveDetection] RSS detected live stream for channel ${channelRow.channelId}: ${rss.title}`);
        return [{
          platform: "youtube",
          broadcastId: rss.videoId || `rss_live_${Date.now()}`,
          title: rss.title || "YouTube Live Stream",
          description: "Detected via RSS feed",
          startedAt: new Date().toISOString(),
          viewerCount: undefined,
        }];
      }
    } catch (rssErr) {
      console.error(`[LiveDetection] RSS fallback failed for channel ${channelRow.channelId}:`, rssErr);
    }
  }

  return [];
}

async function checkTikTokLive(channelRow: any): Promise<DetectedBroadcast[]> {
  const token = channelRow.accessToken;
  if (!token) return [];

  try {
    const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,is_verified,bio_description", {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const user = data?.data?.user;

    if (!user) return [];

    const liveCheckField = user.is_live ?? user.live_status;
    if (!liveCheckField) return [];

    return [{
      platform: "tiktok",
      broadcastId: `tiktok_live_${channelRow.channelId || Date.now()}`,
      title: `${user.display_name || channelRow.channelName || "Creator"} is LIVE on TikTok`,
      description: `Live on TikTok — ${user.display_name || channelRow.channelName || ""}`,
      startedAt: new Date().toISOString(),
      viewerCount: undefined,
    }];
  } catch (err) {
    console.error(`[LiveDetection] TikTok check failed for channel ${channelRow.id}:`, err);
    return [];
  }
}

async function checkKickLive(channelRow: any): Promise<DetectedBroadcast[]> {
  const token = channelRow.accessToken;
  if (!token) return [];

  const slug = channelRow.channelName || channelRow.channelId;
  if (!slug) return [];

  try {
    const res = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const kickCt = res.headers.get("content-type") || "";
    if (!kickCt.includes("application/json")) return [];
    const data = await res.json();

    const channelList = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];

    return channelList
      .filter((ch: any) => ch.is_live || ch.livestream)
      .map((ch: any) => {
        const ls = ch.livestream || {};
        return {
          platform: "kick",
          broadcastId: String(ls.id || ch.id || Date.now()),
          title: ls.session_title || ls.title || ch.slug || "Kick Stream",
          description: `${ls.categories?.[0]?.name || "Streaming"} on Kick`,
          startedAt: ls.created_at || ls.start_time,
          viewerCount: ls.viewer_count || ch.viewer_count,
        };
      });
  } catch (err) {
    console.error(`[LiveDetection] Kick check failed for channel ${channelRow.id}:`, err);
    return [];
  }
}

async function checkRumbleLive(channelRow: any): Promise<DetectedBroadcast[]> {
  const apiKey = process.env.RUMBLE_API_KEY;
  if (!apiKey) return [];

  const channelName = channelRow.channelName || channelRow.channelId;
  if (!channelName) return [];

  try {
    const res = await fetch(`https://rumble.com/api/v0/channel/${encodeURIComponent(channelName)}/livestreams`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return [];
    const data = await res.json();

    const livestreams = Array.isArray(data.livestreams) ? data.livestreams : Array.isArray(data.data) ? data.data : data.items ? data.items : [];

    return livestreams
      .filter((ls: any) => ls.is_live || ls.status === "live" || ls.state === "live")
      .map((ls: any) => ({
        platform: "rumble",
        broadcastId: String(ls.id || ls.video_id || Date.now()),
        title: ls.title || "Rumble Stream",
        description: ls.description || "Live on Rumble",
        startedAt: ls.started_at || ls.created_at,
        viewerCount: ls.viewer_count || ls.watching_now || 0,
      }));
  } catch (err) {
    console.error(`[LiveDetection] Rumble check failed for channel ${channelRow.id}:`, err);
    return [];
  }
}

async function handleDetectedBroadcast(userId: string, channelId: number, broadcast: DetectedBroadcast) {
  const key = trackingKey(userId, broadcast.platform, channelId);
  const tracked = trackedBroadcasts.get(key);

  if (tracked) {
    tracked.missCount = 0;
    if (tracked.broadcastId !== broadcast.broadcastId) {
      tracked.broadcastId = broadcast.broadcastId;
    }
    return;
  }

  const streamList = await storage.getStreams(userId);
  const existingLiveOnPlatform = streamList.find(s =>
    s.status === "live" && Array.isArray(s.platforms) && (s.platforms as string[]).includes(broadcast.platform)
  );

  if (existingLiveOnPlatform) {
    trackedBroadcasts.set(key, { streamId: existingLiveOnPlatform.id, platform: broadcast.platform, broadcastId: broadcast.broadcastId, missCount: 0 });
    return;
  }

  const allPlatforms = ["youtube", "twitch", "kick", "tiktok", "x", "discord", "rumble"];

  const stream = await storage.createStream({
    userId,
    title: broadcast.title,
    description: broadcast.description,
    category: "Gaming",
    platforms: allPlatforms,
    status: "planned",
  });

  await storage.updateStream(stream.id, {
    status: "live",
    startedAt: broadcast.startedAt ? new Date(broadcast.startedAt) : new Date(),
  });

  trackedBroadcasts.set(key, { streamId: stream.id, platform: broadcast.platform, broadcastId: broadcast.broadcastId, missCount: 0 });

  try {
    const { pauseForLive } = await import("../backlog-manager");
    const { pivotToStream } = await import("../backlog-engine");
    const { processGoLiveAnnouncements } = await import("../autopilot-engine");
    const { createPipelineForStream } = await import("../routes/pipeline");

    const { setLivestreamPriority } = await import("../priority-orchestrator");
    const { onLivestreamDetected } = await import("../content-loop");
    const { onStreamDetected } = await import("../trend-rider-engine");
    setLivestreamPriority(userId, stream.id, broadcast.title);
    onLivestreamDetected(userId, stream.id);
    pauseForLive(userId, stream.id);
    pivotToStream(userId, stream.id).catch(e => console.warn("[LiveDetection] pivotToStream failed", e?.message));
    processGoLiveAnnouncements(userId, stream.id, broadcast.title, broadcast.description, allPlatforms).catch(e => console.warn("[LiveDetection] Go-live announcements failed", e?.message));
    createPipelineForStream(userId, broadcast.title, "live").catch(e => console.warn("[LiveDetection] Pipeline creation failed", e?.message));
    onStreamDetected(userId, stream).catch(e => console.warn("[LiveDetection] Trend detection failed", e?.message));
  } catch (err) {
    console.error(`[LiveDetection] Pipeline trigger error for ${broadcast.platform}:`, err);
  }

  await storage.createNotification({
    userId,
    type: "stream_live",
    title: `${broadcast.platform.charAt(0).toUpperCase() + broadcast.platform.slice(1)} LIVE Detected`,
    message: `"${broadcast.title}" — all platform automations triggered automatically`,
    severity: "info",
  });

  sendSSEEvent(userId, "stream_update", { type: "live_detected", streamId: stream.id, title: broadcast.title, platform: broadcast.platform });
  sendSSEEvent(userId, "notification", { type: "new" });
  sendSSEEvent(userId, "backlog_update", { state: "paused_for_live", streamId: stream.id });

  await storage.createAuditLog({
    userId,
    action: `${broadcast.platform}_live_auto_detected`,
    target: broadcast.title,
    details: { broadcastId: broadcast.broadcastId, platforms: allPlatforms, viewerCount: broadcast.viewerCount },
    riskLevel: "low",
  });

}

async function handleBroadcastEnded(userId: string, platform: string, channelId: number) {
  const key = trackingKey(userId, platform, channelId);
  const tracked = trackedBroadcasts.get(key);
  if (!tracked) return;

  tracked.missCount++;

  if (tracked.missCount < 2) return;

  const streamList = await storage.getStreams(userId);
  const liveStream = streamList.find(s => s.id === tracked.streamId && s.status === "live");

  trackedBroadcasts.delete(key);

  if (!liveStream) return;

  const endedAt = new Date();
  await storage.updateStream(liveStream.id, { status: "ended", endedAt });

  try {
    const { resumeFromStream } = await import("../backlog-engine");
    const { processPostStreamHighlights } = await import("../autopilot-engine");
    const { createPipelineForStream } = await import("../routes/pipeline");
    const { resumeAfterStream } = await import("../backlog-manager");

    const { setPostStreamHarvest } = await import("../priority-orchestrator");
    const { onStreamEnded } = await import("../content-loop");
    setPostStreamHarvest(userId, liveStream.id, liveStream.title);
    onStreamEnded(userId, liveStream.id);
    resumeFromStream(userId, liveStream.id).catch(e => console.warn("[LiveDetection] resumeFromStream failed", e?.message));
    processPostStreamHighlights(userId, liveStream.id, liveStream.title, liveStream.description || "", (liveStream.platforms as string[]) || ["youtube"]).catch(e => console.warn("[LiveDetection] Post-stream highlights failed", e?.message));
    createPipelineForStream(userId, liveStream.title, "replay").catch(e => console.warn("[LiveDetection] Replay pipeline failed", e?.message));
    resumeAfterStream(userId).catch(e => console.warn("[LiveDetection] resumeAfterStream failed", e?.message));
  } catch (err) {
    console.error(`[LiveDetection] Post-stream pipeline error for ${platform}:`, err);
  }

  await storage.createNotification({
    userId,
    type: "stream_ended",
    title: "Stream Ended",
    message: `"${liveStream.title}" — REPLAY pipeline started, backlog will resume automatically`,
    severity: "info",
  });

  sendSSEEvent(userId, "stream_update", { type: "stream_ended", streamId: liveStream.id, title: liveStream.title });
  sendSSEEvent(userId, "notification", { type: "new" });
  sendSSEEvent(userId, "backlog_update", { state: "waiting_for_replay" });

  await storage.createAuditLog({
    userId,
    action: `${platform}_live_auto_ended`,
    target: liveStream.title,
    details: { backlogResumed: true },
    riskLevel: "low",
  });

}

export async function runMultiPlatformLiveDetection() {
  if (running) return;
  running = true;

  try {
    const allChannelRows = await db.select().from(channels);
    const platformCheckers: Record<string, (ch: any) => Promise<DetectedBroadcast[]>> = {
      youtube: checkYouTubeLive,
      twitch: checkTwitchLive,
      kick: checkKickLive,
      tiktok: checkTikTokLive,
      rumble: checkRumbleLive,
    };

    for (const ch of allChannelRows) {
      if (!ch.userId || !ch.accessToken) continue;
      const checker = platformCheckers[ch.platform];
      if (!checker) continue;

      try {
        const broadcasts = await checker(ch);

        if (broadcasts.length > 0) {
          await handleDetectedBroadcast(ch.userId, ch.id, broadcasts[0]);
        } else {
          await handleBroadcastEnded(ch.userId, ch.platform, ch.id);
        }
      } catch (err) {
        console.error(`[LiveDetection] ${ch.platform} check failed for channel ${ch.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[LiveDetection] Multi-platform detection error:", err);
  } finally {
    running = false;
  }
}
