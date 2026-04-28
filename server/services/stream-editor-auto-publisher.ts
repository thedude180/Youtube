/**
 * stream-editor-auto-publisher.ts
 *
 * After the stream editor packager creates Studio video records, this service
 * schedules each clip for zero-touch publishing:
 *
 *  • YouTube / Shorts  — inserts an `autopilotQueue` row with type
 *    "studio_auto_publish". The auto-publish poller (server/index.ts) picks
 *    this up and calls publishStudioVideo() with a `publishAt` date so YouTube
 *    holds the video private and releases it at the scheduled time.
 *
 *  • Rumble / TikTok   — no direct upload API exists; inserts a row with
 *    status "manual_required" so the UI can surface "ready on [date]".
 *
 * Scheduling uses getNextOptimalPublishTime() from upload-scheduler.ts, which
 * blends audience-activity data with peak-hour heuristics and enforces a
 * minimum 3-hour gap between uploads on the same platform.
 */

import { db } from "../db";
import { autopilotQueue, studioVideos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { getNextOptimalPublishTime } from "./upload-scheduler";
import { createLogger } from "../lib/logger";

const logger = createLogger("stream-editor-auto-publisher");

const YOUTUBE_PLATFORMS = new Set(["youtube", "shorts"]);

export interface ClipToSchedule {
  studioVideoId: number;
  platform: string;
  label: string;
}

/**
 * Schedule a list of clips for automatic publishing.
 * Returns a map of studioVideoId → ISO scheduledPublishAt string.
 */
export async function scheduleClipsForAutoPublish(
  userId: string,
  clips: ClipToSchedule[],
): Promise<Map<number, string>> {
  const scheduled = new Map<number, string>();
  const channels = await storage.getChannelsByUser(userId);
  const youtubeChannel = channels.find(c => c.platform === "youtube");

  if (!youtubeChannel) {
    logger.warn(`[AutoPublisher] No YouTube channel found for user ${userId} — clips will not be auto-scheduled`);
  }

  for (const clip of clips) {
    try {
      const platform = clip.platform === "shorts" ? "youtube" : clip.platform;
      const isYoutubePlatform = YOUTUBE_PLATFORMS.has(clip.platform);

      const scheduledAt = await getNextOptimalPublishTime(userId, platform);

      const studioVideo = await storage.getStudioVideo(clip.studioVideoId);
      if (!studioVideo) {
        logger.warn(`[AutoPublisher] Studio video ${clip.studioVideoId} not found — skipping`);
        continue;
      }

      const currentMeta = (studioVideo.metadata ?? {}) as Record<string, unknown>;

      if (isYoutubePlatform && youtubeChannel) {
        const [queueEntry] = await db.insert(autopilotQueue).values({
          userId,
          type: "studio_auto_publish",
          targetPlatform: platform,
          content: studioVideo.title,
          status: "scheduled",
          scheduledAt,
          metadata: {
            studioVideoId: clip.studioVideoId,
            scheduledPublishAt: scheduledAt.toISOString(),
            channelId: youtubeChannel.id,
            title: studioVideo.title,
            autoQueued: true,
          },
        }).returning();

        await storage.updateStudioVideo(clip.studioVideoId, {
          metadata: {
            ...currentMeta,
            channelId: youtubeChannel.id,
            scheduledPublishAt: scheduledAt.toISOString(),
            autoScheduled: true,
            autopilotQueueId: queueEntry.id,
            privacyStatus: "private",
          } as any,
        });

        scheduled.set(clip.studioVideoId, scheduledAt.toISOString());
        logger.info(`[AutoPublisher] Scheduled clip ${clip.studioVideoId} → YouTube at ${scheduledAt.toISOString()}`);
      } else {
        await db.insert(autopilotQueue).values({
          userId,
          type: "studio_auto_publish",
          targetPlatform: platform,
          content: studioVideo.title,
          status: "manual_required",
          scheduledAt,
          metadata: {
            studioVideoId: clip.studioVideoId,
            scheduledPublishAt: scheduledAt.toISOString(),
            autoQueued: true,
          },
        });

        await storage.updateStudioVideo(clip.studioVideoId, {
          metadata: {
            ...currentMeta,
            scheduledPublishAt: scheduledAt.toISOString(),
            autoScheduled: true,
            privacyStatus: "private",
          } as any,
        });

        scheduled.set(clip.studioVideoId, scheduledAt.toISOString());
        logger.info(`[AutoPublisher] Queued ${platform} clip ${clip.studioVideoId} as manual_required at ${scheduledAt.toISOString()}`);
      }
    } catch (err: unknown) {
      logger.warn(`[AutoPublisher] Failed to schedule clip ${clip.studioVideoId}:`, (err as Error)?.message);
    }
  }

  return scheduled;
}

/**
 * Poller: called every 5 minutes by the server.
 * Finds YouTube autopilot_queue entries that are due (scheduledAt ≤ now + 8h)
 * and triggers the actual YouTube upload + scheduled publish.
 * Also retries entries that failed with a transient error (up to 3 attempts).
 */
export async function processAutoPublishQueue(): Promise<void> {
  // Quota gate: if the global circuit breaker is tripped (quota exhausted today),
  // skip the entire poller tick — no point querying or attempting uploads.
  const { isQuotaBreakerTripped, canAffordOperation } = await import("./youtube-quota-tracker");
  if (isQuotaBreakerTripped()) {
    logger.info("[AutoPublisher] Quota circuit breaker tripped — skipping poller tick");
    return;
  }

  const { isLiveActive } = await import("../lib/live-gate");
  if (isLiveActive()) {
    logger.info("[AutoPublisher] Live stream active — deferring auto-publish queue until stream ends");
    return;
  }

  const horizon = new Date(Date.now() + 8 * 3600_000);

  const dueItems = await db.select().from(autopilotQueue)
    .where(eq(autopilotQueue.status, "scheduled"))
    .then(rows => rows.filter(r =>
      r.type === "studio_auto_publish" &&
      r.scheduledAt != null &&
      new Date(r.scheduledAt) <= horizon,
    ));

  if (dueItems.length === 0) return;

  logger.info(`[AutoPublisher] Processing ${dueItems.length} due auto-publish jobs`);

  for (const item of dueItems) {
    const meta = (item.metadata ?? {}) as Record<string, unknown>;
    const studioVideoId = meta.studioVideoId as number | undefined;
    if (!studioVideoId) continue;

    // Per-upload quota check: ensure we have enough budget for this specific upload
    const affordable = await canAffordOperation(item.userId, "upload");
    if (!affordable) {
      logger.warn(`[AutoPublisher] Insufficient quota for upload of sv${studioVideoId} — deferring remaining items`);
      break; // Stop processing further items this tick; poller will retry later
    }

    await db.update(autopilotQueue)
      .set({ status: "publishing" })
      .where(eq(autopilotQueue.id, item.id));

    try {
      const studioVideo = await storage.getStudioVideo(studioVideoId);
      if (!studioVideo) {
        throw new Error(`Studio video ${studioVideoId} not found`);
      }

      const { publishStudioVideo } = await import("./studio-publisher");
      const publishAt = item.scheduledAt ? new Date(item.scheduledAt) : undefined;
      const { youtubeId } = await publishStudioVideo(studioVideoId, item.userId, publishAt);

      await db.update(autopilotQueue)
        .set({
          status: "published",
          publishedAt: new Date(),
          metadata: { ...meta, publishResult: { postId: youtubeId ?? undefined, publishedAt: new Date().toISOString() } } as any,
        })
        .where(eq(autopilotQueue.id, item.id));

      logger.info(`[AutoPublisher] Successfully published sv${studioVideoId} → YouTube ${youtubeId}`);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? String(err);
      logger.error(`[AutoPublisher] Failed to publish sv${studioVideoId}:`, msg);

      const retryCount = ((meta.retryCount as number) ?? 0) + 1;
      if (retryCount < 3) {
        // Back off and retry: reschedule 30 minutes from now
        const retryAt = new Date(Date.now() + 30 * 60_000);
        await db.update(autopilotQueue)
          .set({
            status: "scheduled",
            scheduledAt: retryAt,
            errorMessage: msg.slice(0, 500),
            metadata: { ...meta, retryCount } as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        logger.warn(`[AutoPublisher] sv${studioVideoId} failed (attempt ${retryCount}/3) — retry in 30min: ${msg}`);
      } else {
        await db.update(autopilotQueue)
          .set({
            status: "failed",
            errorMessage: msg.slice(0, 500),
            metadata: { ...meta, retryCount } as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        logger.error(`[AutoPublisher] sv${studioVideoId} permanently failed after 3 attempts: ${msg}`);
      }
    }
  }
}
