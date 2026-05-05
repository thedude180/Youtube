/**
 * Stream Service — YouTube live detection + lifecycle management.
 *
 * The stream watcher calls detectAndSync() every 2 minutes.
 * On stream start → triggers LivestreamPipeline.onStreamLive (announce everywhere)
 * On stream end  → triggers LivestreamPipeline.onStreamEnded (post-stream processing)
 */
import { streamRepo } from "./repository.js";
import { channelRepo } from "../channels/repository.js";
import { sseEmit } from "../../core/sse.js";
import { enqueue } from "../../core/job-queue.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("stream-service");

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeLiveStream {
  id: string;
  title: string;
  game: string | null;
  viewerCount: number;
  startedAt: Date;
}

export class StreamService {
  /**
   * Check YouTube for live status and sync to DB.
   * Called by stream-watcher service every 2 minutes for each user.
   */
  async detectAndSync(userId: string): Promise<void> {
    const channels = await channelRepo.findByUserId(userId);
    const ytChannel = channels.find((c) => c.platform === "youtube" && c.isActive && c.accessToken);
    if (!ytChannel) return;

    try {
      const live = await this.checkYouTubeLive(ytChannel.accessToken!, ytChannel.platformUserId ?? undefined);
      const activeStream = await streamRepo.findActiveStream(userId);

      if (live && !activeStream) {
        // Stream just went live
        const stream = await streamRepo.createStream({
          userId,
          title: live.title,
          platform: "youtube",
          status: "live",
          startedAt: live.startedAt,
          metadata: { youtubeStreamId: live.id, game: live.game ?? "unknown" },
        });

        log.info("Live stream detected", { userId, streamId: stream.id, title: live.title });
        sseEmit(userId, "stream:live", { streamId: stream.id, title: live.title });

        // Trigger livestream pipeline: announce on all platforms
        await enqueue("pipeline.livestream.going-live", {
          streamId: stream.id,
          userId,
          title: live.title,
          game: live.game ?? "PS5",
        });

      } else if (!live && activeStream) {
        // Stream just ended
        const durationSeconds = activeStream.startedAt
          ? Math.floor((Date.now() - new Date(activeStream.startedAt).getTime()) / 1000)
          : 0;

        await streamRepo.updateStream(activeStream.id, {
          status: "ended",
          endedAt: new Date(),
          durationSeconds,
          metadata: { ...((activeStream.metadata as any) ?? {}), endedByWatcher: true },
        });

        log.info("Stream ended, triggering post-stream pipeline", { userId, streamId: activeStream.id });
        sseEmit(userId, "stream:ended", { streamId: activeStream.id });

        // Trigger post-stream pipeline via queue
        await enqueue("pipeline.livestream.post-stream-init", {
          streamId: activeStream.id,
          userId,
          title: activeStream.title ?? "Gaming Stream",
          game: (activeStream.metadata as any)?.game ?? "PS5",
          durationSeconds,
        });
      }

    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        log.warn("YouTube token expired", { userId });
      } else {
        log.error("YouTube live check failed", { userId, error: err.message });
      }
    }
  }

  private async checkYouTubeLive(accessToken: string, channelId?: string): Promise<YouTubeLiveStream | null> {
    const params = new URLSearchParams({
      part: "snippet,liveStreamingDetails",
      broadcastStatus: "active",
      type: "broadcast",
      ...(channelId ? { channelId } : {}),
    });

    const resp = await fetch(`${YT_API_BASE}/liveBroadcasts?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const err: any = new Error(`YouTube API ${resp.status}`);
      err.status = resp.status;
      throw err;
    }

    const data: any = await resp.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      id: item.id,
      title: item.snippet?.title ?? "Live Stream",
      game: item.snippet?.categoryId ?? null,
      viewerCount: Number(item.liveStreamingDetails?.concurrentViewers ?? 0),
      startedAt: new Date(item.liveStreamingDetails?.actualStartTime ?? Date.now()),
    };
  }
}

export const streamService = new StreamService();
