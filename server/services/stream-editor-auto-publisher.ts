/**
 * stream-editor-auto-publisher.ts
 *
 * After the stream editor packager creates Studio video records, this service
 * queues each clip for IMMEDIATE publishing — stream editor clips are treated
 * as the user's top-priority content and go live as soon as the next poller
 * tick runs (≤ 5 minutes), not at some future "optimal" window.
 *
 *  • YouTube / Shorts  — inserts an `autopilotQueue` row with type
 *    "studio_auto_publish" and scheduledAt = now. The poller publishes the
 *    clip as PUBLIC immediately (no YouTube scheduled-publish delay).
 *
 *  • Rumble / TikTok   — no direct upload API; inserts a "manual_required"
 *    row so the UI surfaces "ready to post".
 */

import { db } from "../db";
import { autopilotQueue } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { storage } from "../storage";
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

      // Stream editor clips are user-initiated top-priority uploads — publish NOW,
      // not at some optimal future window.  scheduledAt = new Date() means the
      // poller picks this up on its very next tick (≤ 5 min).
      const scheduledAt = new Date();

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
            channelId: youtubeChannel.id,
            title: studioVideo.title,
            autoQueued: true,
            publishImmediately: true,
          },
        }).returning();

        await storage.updateStudioVideo(clip.studioVideoId, {
          metadata: {
            ...currentMeta,
            channelId: youtubeChannel.id,
            autoScheduled: true,
            autopilotQueueId: queueEntry.id,
            privacyStatus: "public",
          } as any,
        });

        scheduled.set(clip.studioVideoId, scheduledAt.toISOString());
        logger.info(`[AutoPublisher] Queued clip ${clip.studioVideoId} for IMMEDIATE YouTube publish`);
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
            autoQueued: true,
          },
        });

        await storage.updateStudioVideo(clip.studioVideoId, {
          metadata: {
            ...currentMeta,
            autoScheduled: true,
          } as any,
        });

        scheduled.set(clip.studioVideoId, scheduledAt.toISOString());
        logger.info(`[AutoPublisher] Queued ${platform} clip ${clip.studioVideoId} as manual_required`);
      }
    } catch (err: unknown) {
      logger.warn(`[AutoPublisher] Failed to schedule clip ${clip.studioVideoId}:`, (err as Error)?.message);
    }
  }

  return scheduled;
}

/**
 * Poller: called every 5 minutes by the server.
 * Picks up ALL queued studio_auto_publish items regardless of scheduledAt
 * (stream editor clips are top-priority and should go live immediately).
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

  // No horizon limit: stream editor clips are always top-priority and should
  // be published immediately regardless of when they were originally scheduled.
  // Also recover "failed" items — they may have been failed by the general
  // autopilot engine (which no longer claims studio_auto_publish items after
  // the engine fix), not by a real upload error.
  const dueItems = await db.select().from(autopilotQueue)
    .where(
      and(
        inArray(autopilotQueue.status, ["scheduled", "failed", "permanent_fail"]),
        eq(autopilotQueue.type, "studio_auto_publish"),
      )
    );

  if (dueItems.length === 0) return;

  logger.info(`[AutoPublisher] Processing ${dueItems.length} auto-publish jobs`);

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
      // Always publish as public immediately — do NOT pass a future publishAt
      // so YouTube does not hold the video as "private/scheduled".
      const { youtubeId } = await publishStudioVideo(studioVideoId, item.userId, undefined);

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

      // Auth errors are not retryable failures — they mean the YouTube channel
      // needs to be reconnected by the user.  Don't burn the retry budget;
      // reschedule 1 hour from now and stop processing further items this tick
      // (other uploads will also fail with the same auth error).
      const isAuthError = msg.includes("Channel not connected")
        || msg.includes("missing access token")
        || msg.includes("not connected or");

      if (isAuthError) {
        const retryAt = new Date(Date.now() + 60 * 60_000);
        await db.update(autopilotQueue)
          .set({
            status: "scheduled",
            scheduledAt: retryAt,
            errorMessage: `YouTube auth error — reconnect channel in the app: ${msg.slice(0, 420)}`,
            metadata: meta as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        logger.warn(`[AutoPublisher] sv${studioVideoId} — auth error, retry in 60min (retryCount unchanged): ${msg}`);
        break;
      }

      const retryCount = ((meta.retryCount as number) ?? 0) + 1;
      if (retryCount < 6) {
        // Back off and retry: reschedule 30 minutes from now (up to 6 attempts = ~3 hours)
        const retryAt = new Date(Date.now() + 30 * 60_000);
        await db.update(autopilotQueue)
          .set({
            status: "scheduled",
            scheduledAt: retryAt,
            errorMessage: msg.slice(0, 500),
            metadata: { ...meta, retryCount } as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        logger.warn(`[AutoPublisher] sv${studioVideoId} failed (attempt ${retryCount}/6) — retry in 30min: ${msg}`);
      } else {
        await db.update(autopilotQueue)
          .set({
            status: "failed",
            errorMessage: msg.slice(0, 500),
            metadata: { ...meta, retryCount } as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        logger.error(`[AutoPublisher] sv${studioVideoId} permanently failed after 6 attempts: ${msg}`);
      }
    }
  }
}
