import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { storage } from "./storage";
import { db } from "./db";
import { videos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "./lib/logger";

const logger = createLogger("clip-video-processor");

const execFileAsync = promisify(execFile);

const CLIP_DIR = path.join(os.tmpdir(), "creatoros-clips");

if (!fs.existsSync(CLIP_DIR)) {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
}

const activeDownloads = new Map<string, Promise<string>>();

function getYouTubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

export async function downloadSourceVideo(youtubeId: string): Promise<string> {
  const outputPath = path.join(CLIP_DIR, `source_${youtubeId}.mp4`);

  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (ageHours < 24 && stats.size > 1000) {
      logger.info("Using cached source video", { youtubeId, path: outputPath });
      return outputPath;
    }
  }

  const existing = activeDownloads.get(youtubeId);
  if (existing) return existing;

  const downloadPromise = (async () => {
    try {
      const url = getYouTubeUrl(youtubeId);
      logger.info("Downloading source video", { youtubeId, url });

      await execFileAsync("yt-dlp", [
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outputPath,
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout", "30",
        "--retries", "3",
        url,
      ], { timeout: 300_000 });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        throw new Error("Download produced empty or missing file");
      }

      logger.info("Source video downloaded", { youtubeId, size: fs.statSync(outputPath).size });
      return outputPath;
    } finally {
      activeDownloads.delete(youtubeId);
    }
  })();

  activeDownloads.set(youtubeId, downloadPromise);
  return downloadPromise;
}

export async function cutClipFromVideo(
  sourcePath: string,
  startTime: number,
  endTime: number,
  clipId: number,
): Promise<string> {
  const outputPath = path.join(CLIP_DIR, `clip_${clipId}_${Date.now()}.mp4`);
  const duration = endTime - startTime;

  logger.info("Cutting clip", { clipId, startTime, endTime, duration });

  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(startTime),
    "-i", sourcePath,
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-vf", "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
    "-r", "30",
    outputPath,
  ], { timeout: 120_000 });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error(`Clip cutting failed - output file missing or empty for clip ${clipId}`);
  }

  const stats = fs.statSync(outputPath);
  logger.info("Clip cut successfully", { clipId, size: stats.size, outputPath });
  return outputPath;
}

export async function processClipForTikTok(
  clipId: number,
  userId: string,
): Promise<{ filePath: string; fileSize: number } | null> {
  const clips = await storage.getContentClips(userId);
  const clip = clips.find(c => c.id === clipId);

  if (!clip) {
    logger.error("Clip not found", { clipId, userId });
    return null;
  }

  if (!clip.sourceVideoId) {
    logger.error("Clip has no source video", { clipId });
    return null;
  }

  const [video] = await db.select().from(videos).where(eq(videos.id, clip.sourceVideoId));
  if (!video) {
    logger.error("Source video not found", { sourceVideoId: clip.sourceVideoId });
    return null;
  }

  const youtubeId = (video.metadata as any)?.youtubeId;
  if (!youtubeId) {
    logger.error("Source video has no YouTube ID", { videoId: video.id });
    return null;
  }

  const startTime = clip.startTime ?? 0;
  let endTime = clip.endTime ?? 30;

  if (endTime - startTime < 3) {
    logger.warn("Clip too short for TikTok", { clipId, duration: endTime - startTime });
    return null;
  }

  const MAX_TIKTOK_DURATION = 600;
  if (endTime - startTime > MAX_TIKTOK_DURATION) {
    logger.warn("Clip too long for TikTok, capping at 10 minutes", { clipId, original: endTime - startTime });
    endTime = startTime + MAX_TIKTOK_DURATION;
  }

  try {
    const sourcePath = await downloadSourceVideo(youtubeId);
    const clipPath = await cutClipFromVideo(sourcePath, startTime, endTime, clipId);
    const stats = fs.statSync(clipPath);

    return { filePath: clipPath, fileSize: stats.size };
  } catch (err: any) {
    logger.error("Failed to process clip for TikTok", { clipId, error: err.message });
    return null;
  }
}

export async function processClipForYouTubeShorts(
  clipId: number,
  userId: string,
): Promise<{ youtubeId: string; title: string } | null> {
  const clips = await storage.getContentClips(userId);
  const clip = clips.find(c => c.id === clipId);

  if (!clip) {
    logger.error("Clip not found for Shorts upload", { clipId, userId });
    return null;
  }

  if (!clip.sourceVideoId) {
    logger.error("Clip has no source video for Shorts upload", { clipId });
    return null;
  }

  const [video] = await db.select().from(videos).where(eq(videos.id, clip.sourceVideoId));
  if (!video) {
    logger.error("Source video not found for Shorts upload", { sourceVideoId: clip.sourceVideoId });
    return null;
  }

  const youtubeId = (video.metadata as any)?.youtubeId;
  if (!youtubeId) {
    logger.error("Source video has no YouTube ID for Shorts upload", { videoId: video.id });
    return null;
  }

  const startTime = clip.startTime ?? 0;
  let endTime = clip.endTime ?? 60;

  if (endTime - startTime < 3) {
    logger.warn("Clip too short for Shorts", { clipId, duration: endTime - startTime });
    return null;
  }

  const MAX_SHORTS_DURATION = 60;
  if (endTime - startTime > MAX_SHORTS_DURATION) {
    endTime = startTime + MAX_SHORTS_DURATION;
  }

  try {
    const sourcePath = await downloadSourceVideo(youtubeId);
    const clipPath = await cutClipFromVideo(sourcePath, startTime, endTime, clipId);

    const { channels } = await import("@shared/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const ytChannels = await db.select().from(channels)
      .where(andOp(eqOp(channels.userId, userId), eqOp(channels.platform, "youtube")));
    const ytChannel = ytChannels.find(c => c.accessToken);

    if (!ytChannel) {
      logger.error("No YouTube channel found for Shorts upload", { userId });
      cleanupClipFile(clipPath);
      return null;
    }

    const { uploadVideoToYouTube } = await import("./youtube");
    const { isMonetizationUnlocked } = await import("./services/monetization-check");
    const shortsTitle = `${(clip.title || video.title || "Clip").substring(0, 90)} #Shorts`;
    const monetizationEnabled = await isMonetizationUnlocked(userId, "youtube");
    const result = await uploadVideoToYouTube(ytChannel.id, {
      title: shortsTitle,
      description: clip.description || `${video.title} highlight clip`,
      tags: ["shorts", "highlights", "clips", "viral"],
      categoryId: "20",
      privacyStatus: "public",
      videoFilePath: clipPath,
      enableMonetization: monetizationEnabled,
    });

    cleanupClipFile(clipPath);

    if (result) {
      logger.info("YouTube Short uploaded", { clipId, youtubeId: result.youtubeId, title: result.title });
      return { youtubeId: result.youtubeId, title: result.title };
    }
    return null;
  } catch (err: any) {
    logger.error("Failed to upload clip as YouTube Short", { clipId, error: err.message });
    return null;
  }
}

export function cleanupClipFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info("Cleaned up clip file", { filePath });
    }
  } catch {
  }
}

export function cleanupOldFiles() {
  try {
    if (!fs.existsSync(CLIP_DIR)) return;
    const files = fs.readdirSync(CLIP_DIR);
    const maxAgeMs = 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(CLIP_DIR, file);
      const stats = fs.statSync(filePath);
      if (Date.now() - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info("Cleaned up old clip files", { cleaned });
    }
  } catch (err: any) {
    logger.error("Cleanup error", { error: err.message });
  }
}

setInterval(cleanupOldFiles, 6 * 60 * 60 * 1000);
