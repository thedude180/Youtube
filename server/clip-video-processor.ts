import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pipeline } from "stream/promises";
import { storage } from "./storage";
import { db } from "./db";
import { videos, channels } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "./lib/logger";

const logger = createLogger("clip-video-processor");

const execFileAsync = promisify(execFile);

const CLIP_DIR = path.join(os.tmpdir(), "creatoros-clips");

if (!fs.existsSync(CLIP_DIR)) {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
}

const activeDownloads = new Map<string, Promise<string>>();

const permanentlyFailedIds = new Map<string, { reason: string; failedAt: number }>();
const PERMANENT_FAIL_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function markPermanentlyFailed(youtubeId: string, reason: string): void {
  permanentlyFailedIds.set(youtubeId, { reason, failedAt: Date.now() });
  if (permanentlyFailedIds.size > 500) {
    const cutoff = Date.now() - PERMANENT_FAIL_EXPIRY_MS;
    for (const [k, v] of permanentlyFailedIds) {
      if (v.failedAt < cutoff) permanentlyFailedIds.delete(k);
    }
  }
}

export function isPermanentlyFailed(youtubeId: string): string | null {
  const entry = permanentlyFailedIds.get(youtubeId);
  if (!entry) return null;
  if (Date.now() - entry.failedAt > PERMANENT_FAIL_EXPIRY_MS) {
    permanentlyFailedIds.delete(youtubeId);
    return null;
  }
  return entry.reason;
}

function getYouTubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

const YTDL_STREAM_TIMEOUT_MS = 5 * 60 * 1000;

function pipelineWithTimeout(stream: NodeJS.ReadableStream, dest: NodeJS.WritableStream, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      (stream as any).destroy?.();
      reject(new Error(`Download stream timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pipeline(stream as any, dest as any)
      .then(() => { clearTimeout(timer); resolve(); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

async function downloadWithYtdlCore(youtubeId: string, outputPath: string): Promise<boolean> {
  try {
    const ytdl = (await import("@distube/ytdl-core")).default;
    const url = getYouTubeUrl(youtubeId);

    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: (f: any) => f.container === "mp4" && f.hasVideo && f.hasAudio,
    });

    if (!format) {
      const videoOnly = ytdl.chooseFormat(info.formats, {
        quality: "highestvideo",
        filter: "videoonly",
      });
      if (videoOnly) {
        logger.info("Using video-only format, will need ffmpeg merge", { youtubeId, itag: videoOnly.itag });
        const videoPath = outputPath + ".video.mp4";
        const audioPath = outputPath + ".audio.m4a";

        const audioFormat = ytdl.chooseFormat(info.formats, {
          quality: "highestaudio",
          filter: "audioonly",
        });

        if (!audioFormat) {
          logger.warn("No audio format found, downloading video-only", { youtubeId });
          const stream = ytdl.downloadFromInfo(info, { format: videoOnly });
          await pipelineWithTimeout(stream, fs.createWriteStream(outputPath), YTDL_STREAM_TIMEOUT_MS);
          return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000;
        }

        const videoStream = ytdl.downloadFromInfo(info, { format: videoOnly });
        await pipelineWithTimeout(videoStream, fs.createWriteStream(videoPath), YTDL_STREAM_TIMEOUT_MS);

        const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
        await pipelineWithTimeout(audioStream, fs.createWriteStream(audioPath), YTDL_STREAM_TIMEOUT_MS);

        await execFileAsync("ffmpeg", [
          "-y", "-i", videoPath, "-i", audioPath,
          "-c:v", "copy", "-c:a", "aac",
          "-movflags", "+faststart",
          outputPath,
        ], { timeout: 300_000 });

        try { fs.unlinkSync(videoPath); } catch {}
        try { fs.unlinkSync(audioPath); } catch {}

        return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000;
      }
      logger.warn("No suitable format found via ytdl-core", { youtubeId });
      return false;
    }

    logger.info("Downloading with ytdl-core", { youtubeId, itag: format.itag, quality: format.qualityLabel });
    const stream = ytdl.downloadFromInfo(info, { format });
    await pipelineWithTimeout(stream, fs.createWriteStream(outputPath), YTDL_STREAM_TIMEOUT_MS);

    return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000;
  } catch (err: any) {
    logger.warn("ytdl-core download failed", { youtubeId, error: (err.message || String(err)).substring(0, 300) });
    return false;
  }
}

// Prefer the fresh binary downloaded at deploy-time; fall back to the system binary.
const YT_DLP_BIN = (() => {
  const LOCAL = path.join(process.cwd(), ".local/bin/yt-dlp-latest");
  if (fs.existsSync(LOCAL)) return LOCAL;
  return "yt-dlp";
})();

const YT_DLP_FORMAT_STRATEGIES = [
  "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
  "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
  "best[ext=mp4]/best",
  "best",
];

/**
 * Looks up the YouTube OAuth access token for the given userId.
 * Returns null if no connected YouTube channel is found.
 */
async function getYouTubeAccessToken(userId: string): Promise<string | null> {
  try {
    const ytChannels = await db
      .select({ accessToken: channels.accessToken, tokenExpiresAt: channels.tokenExpiresAt })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1);

    const ch = ytChannels[0];
    if (!ch?.accessToken) return null;

    // Only use if not expired (or no expiry set)
    if (ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < new Date()) return null;

    return ch.accessToken;
  } catch {
    return null;
  }
}

async function downloadWithYtDlp(youtubeId: string, outputPath: string, accessToken?: string | null): Promise<boolean> {
  const url = getYouTubeUrl(youtubeId);

  // iOS player client bypasses YouTube's server-IP bot detection — it uses
  // the same API endpoints as the official iOS app, which YouTube doesn't block.
  // The OAuth bearer header is kept as an additional auth layer for private/restricted videos.
  const authArgs: string[] = accessToken
    ? ["--add-headers", `Authorization:Bearer ${accessToken}`]
    : [];

  // Client strategies ordered by effectiveness (2026):
  // tv_embedded: most reliable bypass for server-IP bot detection
  // ios / android: official app APIs, YouTube avoids blocking
  // web: plain fallback
  const clientStrategies = [
    ["--extractor-args", "youtube:player_client=tv_embedded"],
    ["--extractor-args", "youtube:player_client=ios"],
    ["--extractor-args", "youtube:player_client=android"],
    [], // plain fallback
  ];

  for (const clientArgs of clientStrategies) {
    for (const format of YT_DLP_FORMAT_STRATEGIES) {
      try {
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch {}
        }

        await execFileAsync(YT_DLP_BIN, [
          "-f", format,
          "--merge-output-format", "mp4",
          "-o", outputPath,
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificates",
          "--socket-timeout", "60",
          "--retries", "3",
          "--fragment-retries", "3",
          "--extractor-retries", "2",
          "--age-limit", "99",
          ...clientArgs,
          ...authArgs,
          url,
        ], { timeout: 300_000 });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          const client = (clientArgs[1] || "web").replace("youtube:player_client=", "");
          logger.info("yt-dlp download succeeded", { youtubeId, format, client, authenticated: !!accessToken });
          return true;
        }
      } catch (err: any) {
        const client = (clientArgs[1] || "web").replace("youtube:player_client=", "");
        logger.warn("yt-dlp format failed", { youtubeId, format, client, error: (err.message || String(err)).substring(0, 150) });
      }
    }
  }
  return false;
}

async function checkVideoAvailability(youtubeId: string, accessToken?: string | null): Promise<{ available: boolean; reason?: string }> {
  try {
    const url = getYouTubeUrl(youtubeId);
    const authArgs: string[] = accessToken
      ? ["--add-headers", `Authorization:Bearer ${accessToken}`]
      : [];
    const { stdout } = await execFileAsync(YT_DLP_BIN, [
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--no-check-certificates",
      "--socket-timeout", "20",
      "--extractor-args", "youtube:player_client=tv_embedded",
      "--age-limit", "99",
      ...authArgs,
      url,
    ], { timeout: 30_000 });

    const info = JSON.parse(stdout);
    if (!info || !info.id) {
      return { available: false, reason: "Video unavailable or removed" };
    }

    if (info.is_live === false && info.was_live === false && !info.duration) {
      return { available: false, reason: "Video unavailable" };
    }

    return { available: true };
  } catch (err: any) {
    const msg = (err.message || String(err)).toLowerCase();

    if (
      msg.includes("private video") || msg.includes("video is private") ||
      msg.includes("this video is private") || msg.includes("video unavailable") ||
      msg.includes("video has been removed") || msg.includes("no longer available") ||
      msg.includes("http error 410") || msg.includes("error 410") ||
      msg.includes("account has been terminated") || msg.includes("age-restricted") ||
      msg.includes("age restricted") || msg.includes("confirm your age") ||
      msg.includes("sign in to confirm your age") || msg.includes("uploader has not made")
    ) {
      const reason = msg.includes("private") ? "Video is private"
        : msg.includes("removed") || msg.includes("410") ? "Video has been removed"
        : msg.includes("age") ? "Video is age-restricted"
        : "Video unavailable";
      return { available: false, reason };
    }

    return { available: true };
  }
}

export async function downloadSourceVideo(youtubeId: string, userId?: string): Promise<string> {
  const outputPath = path.join(CLIP_DIR, `source_${youtubeId}.mp4`);

  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (ageHours < 24 && stats.size > 1000) {
      logger.info("Using cached source video", { youtubeId, path: outputPath });
      return outputPath;
    }
  }

  try {
    const { getRecordingPath } = await import("./services/stream-recorder");
    const recordingPath = getRecordingPath(youtubeId);
    if (recordingPath) {
      logger.info("Using local stream recording as source", { youtubeId, path: recordingPath });
      return recordingPath;
    }
  } catch {}


  const failReason = isPermanentlyFailed(youtubeId);
  if (failReason) {
    throw new Error(`Video permanently failed (cached): ${failReason} (${youtubeId})`);
  }

  const existing = activeDownloads.get(youtubeId);
  if (existing) return existing;

  const downloadPromise = (async () => {
    try {
      logger.info("Downloading source video", { youtubeId, authenticated: !!userId });

      // Fetch the YouTube access token once — used for both availability check and download.
      // Authenticated requests bypass YouTube's server-IP bot detection.
      const accessToken = userId ? await getYouTubeAccessToken(userId) : null;

      const availability = await checkVideoAvailability(youtubeId, accessToken);
      if (!availability.available) {
        const reason = `Video unavailable: ${availability.reason || "Video is private, deleted, or age-restricted"} (${youtubeId})`;
        const isIrreversible = availability.reason?.includes("removed") || availability.reason?.includes("deleted") || availability.reason?.includes("terminated");
        if (accessToken || isIrreversible) {
          markPermanentlyFailed(youtubeId, reason);
        }
        throw new Error(reason);
      }

      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }

      // Try ytdl-core first (faster, no subprocess overhead)
      const ytdlSuccess = await downloadWithYtdlCore(youtubeId, outputPath);
      if (ytdlSuccess) {
        logger.info("Source video downloaded via ytdl-core", { youtubeId, size: fs.statSync(outputPath).size });
        return outputPath;
      }

      // Fall back to yt-dlp with OAuth auth header to avoid bot detection
      logger.info("Falling back to yt-dlp", { youtubeId, authenticated: !!accessToken });
      const ytDlpSuccess = await downloadWithYtDlp(youtubeId, outputPath, accessToken);
      if (ytDlpSuccess) {
        logger.info("Source video downloaded via yt-dlp fallback", { youtubeId, size: fs.statSync(outputPath).size });
        return outputPath;
      }

      // Differentiate: if we had an OAuth token and still failed → permanent.
      // If no token → retryable (might work once the creator's channel is connected).
      if (accessToken) {
        const reason = `Video permanently inaccessible even with authentication (${youtubeId}). The video may be geo-blocked, live-only, or have DRM.`;
        markPermanentlyFailed(youtubeId, reason);
        throw new Error(reason);
      }
      throw new Error(`All download methods failed for ${youtubeId}. Both ytdl-core and yt-dlp could not download this video. Will retry when credentials are available.`);
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
    const sourcePath = await downloadSourceVideo(youtubeId, userId);
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
    const sourcePath = await downloadSourceVideo(youtubeId, userId);
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

    const videoMeta = (video.metadata as any) || {};
    const sourceTags: string[] = videoMeta.tags || [];
    const clipMeta = (clip.metadata as any) || {};
    const clipTags: string[] = clipMeta.tags || [];
    const allClipTags = ([] as string[]).concat(clipTags, sourceTags, ["shorts", "highlights", "clips"]);
    const inheritedTags = allClipTags.filter((t, i) => allClipTags.indexOf(t) === i).slice(0, 25);

    let shortsDescription = clip.description || "";
    if (!shortsDescription || shortsDescription.length < 30) {
      shortsDescription = `${shortsDescription ? shortsDescription + "\n\n" : ""}From: ${video.title}\n${(video.description || "").substring(0, 200)}`;
    }

    const monetizationEnabled = await isMonetizationUnlocked(userId, "youtube");
    const result = await uploadVideoToYouTube(ytChannel.id, {
      title: shortsTitle,
      description: shortsDescription,
      tags: inheritedTags,
      categoryId: videoMeta.categoryId || "20",
      privacyStatus: "public",
      videoFilePath: clipPath,
      enableMonetization: monetizationEnabled,
    });

    cleanupClipFile(clipPath);

    if (result) {
      logger.info("YouTube Short uploaded", { clipId, youtubeId: result.youtubeId, title: result.title });

      import("./publish-verifier").then(({ verifyVideoUpload }) => {
        verifyVideoUpload(clip.sourceVideoId!, userId, result.youtubeId, "clip_shorts_upload").catch(err => {
          logger.warn("Shorts upload verification deferred", { clipId, error: err.message });
        });
      });

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

import { registerCleanup } from "./services/cleanup-coordinator";
registerCleanup("clipFileCleanup", cleanupOldFiles, 6 * 60 * 60 * 1000);
