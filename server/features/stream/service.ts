/**
 * Stream Service — manages stream lifecycle including YouTube live detection.
 *
 * The stream watcher calls detectAndSync() on a periodic interval.
 * When a stream ends, it automatically triggers the post-stream pipeline.
 */
import { streamRepo } from "./repository.js";
import { channelRepo } from "../channels/repository.js";
import { pipelineService } from "../pipeline/service.js";
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
   * Detect live status from YouTube for a user and sync to DB.
   * Called by the stream-watcher service every 2 minutes.
   */
  async detectAndSync(userId: string): Promise<void> {
    const channels = await channelRepo.findByUserId(userId);
    const ytChannel = channels.find((c) => c.platform === "youtube" && c.isActive && c.accessToken);

    if (!ytChannel) return;

    try {
      const live = await this.checkYouTubeLive(ytChannel.accessToken!, ytChannel.platformUserId ?? undefined);
      const activeStream = await streamRepo.findActiveStream(userId);

      if (live && !activeStream) {
        // Stream just went live — create record and announce
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

        // Queue cross-platform "going live" announcements
        await enqueue("stream.announce-live", {
          userId,
          streamId: stream.id,
          title: live.title,
          game: live.game ?? "PS5",
        });

      } else if (!live && activeStream) {
        // Stream just ended — update record and trigger pipeline
        const durationSeconds = activeStream.startedAt
          ? Math.floor((Date.now() - new Date(activeStream.startedAt).getTime()) / 1000)
          : 0;

        await streamRepo.updateStream(activeStream.id, {
          status: "ended",
          endedAt: new Date(),
          durationSeconds,
          metadata: { ...((activeStream.metadata as any) ?? {}), endedByWatcher: true },
        });

        log.info("Stream ended, triggering pipeline", { userId, streamId: activeStream.id });
        sseEmit(userId, "stream:ended", { streamId: activeStream.id });

        // Trigger post-stream pipeline
        const run = await pipelineService.startPipeline(activeStream.id, userId);
        await enqueue("pipeline.execute", { runId: run.id });
      }

    } catch (err: any) {
      // YouTube API errors are non-fatal — watcher continues for other users
      if (err.status === 401 || err.status === 403) {
        log.warn("YouTube token expired for user", { userId });
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
      const err: any = new Error(`YouTube API error: ${resp.status}`);
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
      viewerCount: item.liveStreamingDetails?.concurrentViewers ?? 0,
      startedAt: new Date(item.liveStreamingDetails?.actualStartTime ?? Date.now()),
    };
  }

  /**
   * Generate a cross-platform "going live" announcement.
   * Called by the stream.announce-live worker.
   */
  async announceLive(streamId: number, userId: string, title: string, game: string): Promise<void> {
    const channels = await channelRepo.findByUserId(userId);
    const discord = channels.find((c) => c.platform === "discord" && c.isActive);

    if (discord) {
      const announcement = `🔴 **${title}** is now LIVE!\n\nWatching some ${game} gameplay right now. Come hang!\n\nYouTube → https://youtube.com/@etgaming247`;

      await enqueue("autopilot.execute-post", {
        userId,
        queueItemId: -1, // will be replaced after enqueue
      });

      // Directly enqueue via autopilot
      const { autopilotRepo } = await import("../autopilot/repository.js");
      const item = await autopilotRepo.enqueue({
        userId,
        platform: "discord",
        contentType: "post",
        payload: { text: announcement },
        status: "pending",
      });

      await enqueue("autopilot.execute-post", { queueItemId: item.id, userId });
      log.info("Live announcement queued", { userId, streamId, platform: "discord" });
    }
  }
}

export const streamService = new StreamService();
