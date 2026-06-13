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

/**
 * Returns true when the studio video title belongs to a game that is
 * explicitly NOT the channel focus (Battlefield 6).
 *
 * This is a title-based heuristic guard — the packager may receive old stream
 * recordings from any game the user has ever played.  Only Battlefield content
 * (and generic / unidentified gaming content) should auto-publish.
 *
 * Patterns matched: AC Valhalla, any Assassin's Creed, Black Flag, Far Cry,
 * Halo, Sonic, GTA, Minecraft, Fortnite, Apex Legends, Overwatch, Valorant.
 * Add more as needed; false-positives (blocking BF6 content) are impossible
 * because none of the pattern strings appear in Battlefield titles.
 */
function isNonBF6StudioTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return /valhalla|assassin[''s]*\s*creed|black flag|far cry|halo\b|sonic\b|grand theft|minecraft|fortnite|apex legends|overwatch|valorant|dying light|cyberpunk|god of war|spider.?man|hogwarts|elden ring|demon.s souls/i.test(title);
}

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
  // Prefer the channel that has a valid token — avoids picking a ghost/disconnected
  // row (lower DB id) over the live authenticated channel when both exist for the user.
  const youtubeChannel =
    channels.find(c => c.platform === "youtube" && (c.accessToken || c.refreshToken)) ||
    channels.find(c => c.platform === "youtube");

  if (!youtubeChannel) {
    logger.warn(`[AutoPublisher] No YouTube channel found for user ${userId} — clips will not be auto-scheduled`);
  }

  for (const clip of clips) {
    try {
      // Preserve the original clip platform — do NOT silently convert "shorts"
      // to "youtube".  That stripped every Short signal and caused Shorts to land
      // on the regular video shelf.  The target_platform column stores the intent;
      // studio-publisher reads metadata.isShort to add #shorts before upload.
      const platform = clip.platform;
      const isShort = clip.platform === "shorts";
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

      // BF6 focus-gate: never auto-queue non-BF6 studio content.
      // The packager may produce clips from any game the user has ever streamed;
      // only Battlefield content (or unidentified gaming content) should be published.
      if (isNonBF6StudioTitle(studioVideo.title)) {
        logger.warn(`[AutoPublisher] Skipping clip sv${clip.studioVideoId} — non-BF6 content ("${studioVideo.title}"). Channel focus is Battlefield 6.`);
        continue;
      }

      const currentMeta = (studioVideo.metadata ?? {}) as Record<string, unknown>;

      // Dedup: if this studio video was already queued for auto-publish, skip.
      // Prevents double-uploads when a stream_edit_job has both "youtube" and "shorts"
      // in its platform list — both create separate studio videos that would otherwise
      // each get their own autopilot queue entry and both upload as full YouTube videos.
      if (isYoutubePlatform && currentMeta.autopilotQueueId) {
        logger.info(`[AutoPublisher] Clip sv${clip.studioVideoId} already scheduled (queue item ${currentMeta.autopilotQueueId}) — skipping duplicate`);
        scheduled.set(clip.studioVideoId, scheduledAt.toISOString());
        continue;
      }

      if (isYoutubePlatform && youtubeChannel) {
        const [queueEntry] = await db.insert(autopilotQueue).values({
          userId,
          type: "studio_auto_publish",
          // Use "youtubeshorts" for Shorts so downstream systems can inspect it.
          // studio-publisher.ts reads metadata.isShort to add #shorts before upload.
          targetPlatform: isShort ? "youtubeshorts" : "youtube",
          content: studioVideo.title,
          status: "scheduled",
          scheduledAt,
          metadata: {
            studioVideoId: clip.studioVideoId,
            channelId: youtubeChannel.id,
            title: studioVideo.title,
            autoQueued: true,
            publishImmediately: true,
            // isShort flag lets studio-publisher.ts add #shorts to description
            // even when the title was generated without it (common for packager clips).
            ...(isShort ? { isShort: true } : {}),
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
        inArray(autopilotQueue.status, ["scheduled", "failed", "permanent_fail", "pending"]),
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
    // .catch(() => true) — quota-tracker DB errors are non-fatal; default to "can afford"
    const affordable = await canAffordOperation(item.userId, "upload").catch(() => true);
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

      // BF6 focus-gate (last-resort publisher guard).
      // scheduleClipsForAutoPublish already blocks non-BF6 at queue time, but
      // items queued before this guard was deployed may still be in the DB.
      // Permanent-fail them here so they are never uploaded.
      if (isNonBF6StudioTitle(studioVideo.title)) {
        logger.warn(`[AutoPublisher] Permanent-failing sv${studioVideoId} — non-BF6 content ("${studioVideo.title}")`);
        await db.update(autopilotQueue)
          .set({
            status: "permanent_fail",
            errorMessage: "Non-BF6 studio content blocked — channel focus is Battlefield 6",
          })
          .where(eq(autopilotQueue.id, item.id));
        continue;
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
