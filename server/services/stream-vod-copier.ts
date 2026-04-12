import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { studioVideos, streams, videos, channels } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getRecordingPath } from "./stream-recorder";

const logger = createLogger("stream-vod-copier");

const EDIT_COPIES_DIR = path.resolve("data/studio/edit-copies");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function createEditCopyFromStream(
  userId: string,
  streamVideoId: string,
  options?: {
    streamTitle?: string;
    gameTitle?: string;
    streamDbId?: number;
    channelId?: number;
  }
): Promise<{ success: boolean; studioVideoId?: number; filePath?: string; error?: string }> {
  try {
    logger.info("Creating edit copy from stream recording", {
      userId: userId.slice(0, 8),
      videoId: streamVideoId,
    });

    const recordingPath = getRecordingPath(streamVideoId);

    if (!recordingPath || !fs.existsSync(recordingPath)) {
      logger.warn("No recording file found for stream", { videoId: streamVideoId });

      const studioEntry = await createStudioPlaceholder(userId, streamVideoId, options);
      return {
        success: true,
        studioVideoId: studioEntry.id,
        error: "no_local_recording",
      };
    }

    const fileStats = fs.statSync(recordingPath);
    if (fileStats.size < 50_000) {
      logger.warn("Recording file too small, likely corrupted", {
        videoId: streamVideoId,
        size: fileStats.size,
      });
      return { success: false, error: "recording_too_small" };
    }

    ensureDir(EDIT_COPIES_DIR);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTitle = (options?.streamTitle || streamVideoId)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
    const destFilename = `edit_${safeTitle}_${timestamp}.mp4`;
    const destPath = path.join(EDIT_COPIES_DIR, destFilename);

    logger.info("Copying recording to persistent edit location", {
      from: recordingPath,
      to: destPath,
      size: fileStats.size,
    });

    fs.copyFileSync(recordingPath, destPath);

    if (!fs.existsSync(destPath)) {
      return { success: false, error: "copy_failed" };
    }

    const destStats = fs.statSync(destPath);

    let streamTitle = options?.streamTitle || "Livestream Recording";
    let channelId = options?.channelId;

    if (!channelId) {
      const [channel] = await db.select().from(channels)
        .where(eq(channels.userId, userId))
        .limit(1);
      if (channel) channelId = channel.id;
    }

    let linkedVideoId: number | undefined;
    const [existingVideo] = await db.select().from(videos)
      .where(eq(videos.youtubeId, streamVideoId))
      .limit(1);
    if (existingVideo) {
      linkedVideoId = existingVideo.id;
      if (!options?.streamTitle && existingVideo.title) {
        streamTitle = existingVideo.title;
      }
    }

    const durationEstimate = estimateDuration(destStats.size);

    const [studioEntry] = await db.insert(studioVideos).values({
      userId,
      videoId: linkedVideoId || null,
      youtubeId: streamVideoId,
      title: `[EDIT] ${streamTitle}`,
      description: buildEditDescription(options),
      filePath: destPath,
      fileSize: destStats.size,
      duration: durationEstimate,
      status: "ready_to_edit",
      metadata: {
        tags: [options?.gameTitle || "gaming", "livestream", "edit-copy", "ps5"].filter(Boolean) as string[],
        channelId: channelId || undefined,
        sourceUrl: `https://www.youtube.com/watch?v=${streamVideoId}`,
      },
    }).returning();

    if (options?.streamDbId) {
      try {
        await db.update(streams)
          .set({ vodVideoId: linkedVideoId || null })
          .where(eq(streams.id, options.streamDbId));
      } catch {}
    }

    logger.info("Edit copy created successfully", {
      userId: userId.slice(0, 8),
      studioVideoId: studioEntry.id,
      filePath: destPath,
      fileSize: destStats.size,
    });

    return {
      success: true,
      studioVideoId: studioEntry.id,
      filePath: destPath,
    };
  } catch (err: any) {
    logger.error("Failed to create edit copy from stream", {
      userId: userId.slice(0, 8),
      videoId: streamVideoId,
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

async function createStudioPlaceholder(
  userId: string,
  streamVideoId: string,
  options?: { streamTitle?: string; gameTitle?: string; channelId?: number }
): Promise<{ id: number }> {
  let channelId = options?.channelId;
  if (!channelId) {
    const [ch] = await db.select().from(channels)
      .where(eq(channels.userId, userId))
      .limit(1);
    if (ch) channelId = ch.id;
  }

  let linkedVideoId: number | undefined;
  let resolvedTitle = options?.streamTitle || "Livestream Recording";
  const [existingVideo] = await db.select().from(videos)
    .where(eq(videos.youtubeId, streamVideoId))
    .limit(1);
  if (existingVideo) {
    linkedVideoId = existingVideo.id;
    if (!options?.streamTitle && existingVideo.title) {
      resolvedTitle = existingVideo.title;
    }
  }

  const [entry] = await db.insert(studioVideos).values({
    userId,
    videoId: linkedVideoId || null,
    youtubeId: streamVideoId,
    title: `[EDIT] ${resolvedTitle}`,
    description: buildEditDescription(options),
    filePath: null,
    fileSize: null,
    duration: null,
    status: "awaiting_vod",
    metadata: {
      tags: [options?.gameTitle || "gaming", "livestream", "edit-copy", "ps5"].filter(Boolean) as string[],
      channelId: channelId || undefined,
      sourceUrl: `https://www.youtube.com/watch?v=${streamVideoId}`,
    },
  }).returning();

  logger.info("Studio placeholder created (no local recording)", {
    userId: userId.slice(0, 8),
    studioVideoId: entry.id,
    videoId: streamVideoId,
  });

  return entry;
}

function buildEditDescription(options?: { streamTitle?: string; gameTitle?: string }): string {
  const parts = [
    "Auto-created edit copy from livestream recording.",
    options?.gameTitle ? `Game: ${options.gameTitle}` : null,
    `Source: Livestream${options?.streamTitle ? ` — ${options.streamTitle}` : ""}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "Ready for editing — create highlights, shorts, and polished uploads from this raw footage.",
  ];
  return parts.filter(Boolean).join("\n");
}

function estimateDuration(fileSizeBytes: number): string {
  const estimatedBitrateMbps = 6;
  const totalSeconds = Math.round((fileSizeBytes * 8) / (estimatedBitrateMbps * 1_000_000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export async function getEditCopiesForUser(userId: string): Promise<any[]> {
  return db.select().from(studioVideos)
    .where(and(
      eq(studioVideos.userId, userId),
      eq(studioVideos.status, "ready_to_edit"),
    ))
    .orderBy(desc(studioVideos.createdAt))
    .limit(50);
}

export async function cleanupOrphanedEditCopies(maxAgeDays = 30): Promise<number> {
  let cleaned = 0;
  try {
    if (!fs.existsSync(EDIT_COPIES_DIR)) return 0;
    const files = fs.readdirSync(EDIT_COPIES_DIR);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const file of files) {
      const filePath = path.join(EDIT_COPIES_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          cleaned++;
          logger.info("Cleaned old edit copy", { file });
        }
      } catch {}
    }
  } catch {}
  return cleaned;
}
