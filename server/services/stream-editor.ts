import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { db } from "../db";
import { streamEditJobs, contentVaultBackups } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { downloadVaultEntry } from "./video-vault";
import { packageClips } from "./stream-editor-packager";

const logger = createLogger("stream-editor");

const FFMPEG_BIN = "ffmpeg";
const FFPROBE_BIN = "ffprobe";
const EDITOR_OUTPUT_DIR = path.resolve(process.cwd(), "data", "stream-editor");

if (!fs.existsSync(EDITOR_OUTPUT_DIR)) {
  fs.mkdirSync(EDITOR_OUTPUT_DIR, { recursive: true });
}

export type StreamEditPlatform = "youtube" | "rumble" | "tiktok" | "shorts";

interface PlatformProfile {
  label: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  codec: string;
  codecArgs: string[];
  crf: number;
  preset: string;
  maxClipSecs: number | null;
  audioBitrate: string;
  audioSampleRate: number;
  targetLoudness: string;
}

/**
 * Platform profiles with AI-upscale to the highest resolution that makes sense
 * per platform. Landscape content targets 4K (3840×2160); vertical content
 * targets 1080p portrait (1080×1920) which is the platform maximum for Shorts/TikTok.
 *
 * CODEC CHOICE — libx264 ultrafast vs libx265:
 *  libx265 "fast"     → 0.01x speed → 100+ h per clip → NEVER use on CPU host
 *  libx264 "ultrafast"→ 0.3–0.8x speed → 30–90 min per 4K clip → achievable
 *
 * Filter chain (applied in buildVideoFilter):
 *  1. hqdn3d  — temporal + spatial denoise at SOURCE resolution
 *  2. eq      — colour grading: brightness, contrast, saturation
 *  3. unsharp — sharpening before upscale for crisper edges
 *  4. scale   — Lanczos upscale to target 4K / 1080p portrait
 *  5. pad/crop — landscape: letterbox pad; portrait: centre 9:16 crop
 *  6. setsar + fps — normalise pixel aspect, cap at 60fps
 */
const PLATFORM_PROFILES: Record<StreamEditPlatform, PlatformProfile> = {
  youtube: {
    label: "YouTube 4K",
    width: 3840,
    height: 2160,
    orientation: "landscape",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "5.1",           // H.264 level 5.1 = 4K @ 30fps
      "-x264-params", "keyint=120:min-keyint=48:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
      "-movflags", "+faststart",    // web-optimised: playback starts before full download
    ],
    crf: 20,                        // slightly higher quality for 4K delivery
    preset: "ultrafast",            // ~0.3–0.8x real-time — far faster than libx265 "fast"
    maxClipSecs: null,
    audioBitrate: "192k",
    audioSampleRate: 48000,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
  rumble: {
    label: "Rumble 4K",
    width: 3840,
    height: 2160,
    orientation: "landscape",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "5.1",
      "-x264-params", "keyint=120:min-keyint=48:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
      "-movflags", "+faststart",
    ],
    crf: 20,
    preset: "ultrafast",
    maxClipSecs: null,
    audioBitrate: "192k",
    audioSampleRate: 48000,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
  tiktok: {
    label: "TikTok 1080p Vertical",
    width: 1080,
    height: 1920,
    orientation: "portrait",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "4.1",
      "-x264-params", "keyint=60:min-keyint=24:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
      "-movflags", "+faststart",
    ],
    crf: 21,
    preset: "ultrafast",
    maxClipSecs: 600,
    audioBitrate: "128k",
    audioSampleRate: 44100,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
  shorts: {
    label: "YouTube Shorts 1080p",
    width: 1080,
    height: 1920,
    orientation: "portrait",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "4.1",
      "-x264-params", "keyint=60:min-keyint=24:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
      "-movflags", "+faststart",
    ],
    crf: 21,
    preset: "ultrafast",
    maxClipSecs: 60,
    audioBitrate: "128k",
    audioSampleRate: 44100,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
};

function runProcess(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
      else reject(new Error(Buffer.concat(errChunks).toString("utf8").slice(-500)));
    });
    proc.on("error", reject);
  });
}

// 4K libx264 ultrafast on a 60-min source clip can take up to ~3 hours on a CPU host.
// Hard-kill at 4 hours; the watchdog uses 5 hours to give encoding room to breathe.
const FFMPEG_HARD_TIMEOUT_MS = 4 * 60 * 60 * 1000;  // 4 hours

function runFFmpeg(args: string[], onProgress?: (pct: number, fps: number, stage: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let totalDuration = 0;

    const hardTimeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFmpeg hard timeout — encoding exceeded 90 minutes, killed"));
    }, FFMPEG_HARD_TIMEOUT_MS);

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch && !totalDuration) {
        totalDuration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
      }
      if (onProgress && totalDuration > 0) {
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        const fpsMatch = text.match(/fps=\s*(\d+\.?\d*)/);
        const speedMatch = text.match(/speed=\s*(\d+\.?\d*)x/);
        if (timeMatch) {
          const elapsed = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
          const stg = speed > 0 ? `${fps.toFixed(0)} fps · ${speed.toFixed(2)}x` : `${fps.toFixed(0)} fps`;
          onProgress(Math.min(99, Math.round((elapsed / totalDuration) * 100)), fps, stg);
        }
      }
    });

    proc.on("close", (code) => {
      clearTimeout(hardTimeout);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    proc.on("error", (err) => {
      clearTimeout(hardTimeout);
      reject(err);
    });
  });
}

async function probeVideo(filePath: string): Promise<{
  durationSecs: number; width: number; height: number; fps: number;
}> {
  const raw = await runProcess(FFPROBE_BIN, [
    "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath,
  ]);
  const info = JSON.parse(raw);
  const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
  const durationSecs = parseFloat(info.format?.duration ?? videoStream?.duration ?? "0");

  let fps = 30;
  if (videoStream?.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
    if (den > 0) fps = Math.round(num / den);
  }

  return {
    durationSecs,
    width: videoStream?.width ?? 1920,
    height: videoStream?.height ?? 1080,
    fps,
  };
}

function buildVideoFilter(
  enhancements: { upscale4k: boolean; colorEnhance: boolean; sharpen: boolean },
  profile: PlatformProfile,
  sourceFps: number,
): string {
  const parts: string[] = [];

  if (enhancements.upscale4k) {
    parts.push("hqdn3d=luma_spatial=2:chroma_spatial=1.5:luma_tmp=3:chroma_tmp=2.5");
  }
  if (enhancements.colorEnhance) {
    parts.push("eq=brightness=0.02:contrast=1.06:saturation=1.12:gamma=0.98");
  }
  if (enhancements.sharpen) {
    parts.push("unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.9:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3");
  }

  if (profile.orientation === "portrait") {
    parts.push(
      `crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-min(iw\\,ih*9/16))/2:(ih-min(ih\\,iw*16/9))/2`,
      `scale=${profile.width}:${profile.height}:flags=lanczos+accurate_rnd`,
    );
  } else {
    if (enhancements.upscale4k) {
      parts.push(
        `scale=${profile.width}:${profile.height}:flags=lanczos+accurate_rnd:force_original_aspect_ratio=decrease`,
        `pad=${profile.width}:${profile.height}:-1:-1:color=black`,
      );
    } else {
      parts.push(`scale=-2:${profile.height}:flags=lanczos+accurate_rnd`);
    }
  }

  parts.push("setsar=1");
  if (sourceFps > 0) parts.push(`fps=fps=${Math.min(sourceFps, 60)}`);

  return parts.join(",");
}

async function processClip(
  sourcePath: string,
  startSecs: number,
  durationSecs: number,
  outputPath: string,
  platform: StreamEditPlatform,
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean },
  sourceFps: number,
  onProgress?: (pct: number, fps: number, stage: string) => void,
): Promise<void> {
  const profile = PLATFORM_PROFILES[platform];
  const actualDuration = profile.maxClipSecs ? Math.min(durationSecs, profile.maxClipSecs) : durationSecs;
  const vf = buildVideoFilter(enhancements, profile, sourceFps);
  const af = enhancements.audioNormalize ? profile.targetLoudness : "anull";

  const args: string[] = [
    "-ss", String(startSecs),
    "-i", sourcePath,
    "-t", String(actualDuration),
    "-vf", vf,
    "-af", af,
    "-c:v", profile.codec,
    "-crf", String(profile.crf),
    "-preset", profile.preset,
    ...profile.codecArgs,
    "-c:a", "aac",
    "-b:a", profile.audioBitrate,
    "-ar", String(profile.audioSampleRate),
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
    "-movflags", "+faststart",
    "-threads", "0",
    outputPath,
  ];

  await runFFmpeg(args, onProgress);
}

let activeJobId: number | null = null;

export async function queueStreamEditJob(
  userId: string,
  vaultEntryId: number,
  platforms: StreamEditPlatform[],
  clipDurationMins: number,
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean },
  autoPublish: boolean = false,
): Promise<{ jobId: number; downloadFirst: boolean }> {
  const [entry] = await db.select()
    .from(contentVaultBackups)
    .where(and(eq(contentVaultBackups.id, vaultEntryId), eq(contentVaultBackups.userId, userId)))
    .limit(1);

  if (!entry) throw new Error("Vault entry not found");

  const downloadFirst = !entry.filePath || !fs.existsSync(entry.filePath);

  const [job] = await db.insert(streamEditJobs).values({
    userId,
    vaultEntryId,
    sourceTitle: entry.title ?? "Untitled",
    sourceFilePath: entry.filePath ?? null,
    platforms,
    clipDurationMins,
    enhancements,
    downloadFirst,
    autoPublish,
    status: "queued",
    progress: 0,
    currentStage: downloadFirst ? "Waiting to download" : "Waiting to encode",
  }).returning();

  logger.info(`[StreamEditor] Queued job ${job.id} for "${entry.title}" → ${platforms.join(", ")}${downloadFirst ? " (will download first)" : ""}${autoPublish ? " (auto-publish ON)" : ""}`);

  if (activeJobId === null) {
    setImmediate(() => runJobInBackground(job.id).catch(err =>
      logger.error(`[StreamEditor] Background job ${job.id} crashed:`, err?.message)
    ));
  }

  return { jobId: job.id, downloadFirst };
}

async function pickUpNextQueuedJob(): Promise<void> {
  const waiting = await db.select({ id: streamEditJobs.id })
    .from(streamEditJobs)
    .where(eq(streamEditJobs.status, "queued"))
    .orderBy(streamEditJobs.createdAt)
    .limit(1);

  if (waiting.length > 0) {
    const nextId = waiting[0].id;
    logger.info(`[StreamEditor] Picking up next queued job ${nextId}`);
    setImmediate(() => runJobInBackground(nextId).catch(err =>
      logger.error(`[StreamEditor] Background job ${nextId} crashed:`, err?.message)
    ));
  }
}

async function runJobInBackground(jobId: number): Promise<void> {
  if (activeJobId !== null) {
    logger.info(`[StreamEditor] Job ${jobId} deferred — job ${activeJobId} is active`);
    return;
  }

  activeJobId = jobId;

  try {
    const [job] = await db.select().from(streamEditJobs).where(eq(streamEditJobs.id, jobId)).limit(1);
    if (!job || job.status !== "queued") return;

    await db.update(streamEditJobs).set({
      status: "processing",
      startedAt: new Date(),
      currentStage: "Starting",
    }).where(eq(streamEditJobs.id, jobId));

    let sourceFile = job.sourceFilePath ?? null;

    // Skip download if the file is already on disk — avoids yt-dlp bot-detection
    // when vault entries were already downloaded in a previous run.
    const fileAlreadyOnDisk = sourceFile && fs.existsSync(sourceFile);

    if (job.downloadFirst && !fileAlreadyOnDisk) {
      await db.update(streamEditJobs).set({
        currentStage: "Downloading from YouTube",
      }).where(eq(streamEditJobs.id, jobId));

      logger.info(`[StreamEditor] Job ${jobId}: downloading vault entry ${job.vaultEntryId}`);
      sourceFile = await downloadVaultEntry(job.userId, job.vaultEntryId!);

      await db.update(streamEditJobs).set({
        sourceFilePath: sourceFile,
        currentStage: "Download complete — probing video",
      }).where(eq(streamEditJobs.id, jobId));
    } else if (job.downloadFirst && fileAlreadyOnDisk) {
      logger.info(`[StreamEditor] Job ${jobId}: vault file already on disk at ${sourceFile}, skipping download`);
    }

    // If we still don't have a file, check the vault entry directly
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      if (job.vaultEntryId) {
        const [vaultEntry] = await db
          .select({ filePath: contentVaultBackups.filePath })
          .from(contentVaultBackups)
          .where(eq(contentVaultBackups.id, job.vaultEntryId))
          .limit(1);
        if (vaultEntry?.filePath && fs.existsSync(vaultEntry.filePath)) {
          sourceFile = vaultEntry.filePath;
          await db.update(streamEditJobs).set({ sourceFilePath: sourceFile })
            .where(eq(streamEditJobs.id, jobId));
          logger.info(`[StreamEditor] Job ${jobId}: found vault file via DB lookup: ${sourceFile}`);
        }
      }
    }

    if (!sourceFile || !fs.existsSync(sourceFile)) {
      throw new Error("Source video file not found — download may have failed");
    }

    await db.update(streamEditJobs).set({
      currentStage: "Probing source video",
    }).where(eq(streamEditJobs.id, jobId));

    const probe = await probeVideo(sourceFile);
    logger.info(`[StreamEditor] Job ${jobId}: ${probe.width}×${probe.height} @ ${probe.fps}fps, ${Math.round(probe.durationSecs)}s`);

    const jobOutputDir = path.join(EDITOR_OUTPUT_DIR, `job_${jobId}`);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const clipSecs = (job.clipDurationMins ?? 60) * 60;
    const platforms = (job.platforms ?? []) as StreamEditPlatform[];
    const enhancements = (job.enhancements ?? {
      upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true,
    }) as { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean };

    const numClips = Math.ceil(probe.durationSecs / clipSecs);
    const totalTasks = numClips * platforms.length;
    let completedTasks = 0;
    const outputFiles: Array<{
      platform: string; clipIndex: number; label: string;
      filePath: string; fileSize: number; durationSecs: number;
      studioVideoId?: number; scheduledPublishAt?: string;
    }> = [];

    await db.update(streamEditJobs).set({
      sourceDurationSecs: Math.round(probe.durationSecs),
      totalClips: totalTasks,
      outputDir: jobOutputDir,
      currentStage: "Encoding",
    }).where(eq(streamEditJobs.id, jobId));

    for (const platform of platforms) {
      const profile = PLATFORM_PROFILES[platform];
      const platformDir = path.join(jobOutputDir, platform);
      fs.mkdirSync(platformDir, { recursive: true });

      for (let i = 0; i < numClips; i++) {
        const startSecs = i * clipSecs;
        const actualDuration = Math.min(clipSecs, probe.durationSecs - startSecs);
        const clipLabel = `Part ${i + 1} of ${numClips} — ${profile.label}`;
        const outputPath = path.join(platformDir, `clip_${String(i + 1).padStart(3, "0")}.mp4`);

        const stage = `${profile.label} · Clip ${i + 1}/${numClips}`;
        logger.info(`[StreamEditor] Job ${jobId}: ${stage}`);

        await processClip(
          sourceFile,
          startSecs,
          actualDuration,
          outputPath,
          platform,
          enhancements,
          probe.fps,
          (pct, fps, speedLabel) => {
            const overallPct = Math.round(((completedTasks + pct / 100) / totalTasks) * 100);
            db.update(streamEditJobs).set({
              progress: overallPct,
              currentStage: `${stage} · ${speedLabel}`,
            }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
          },
        );

        if (fs.existsSync(outputPath)) {
          const stat = fs.statSync(outputPath);
          outputFiles.push({
            platform,
            clipIndex: i,
            label: clipLabel,
            filePath: outputPath,
            fileSize: stat.size,
            durationSecs: Math.round(actualDuration),
          });
        }

        completedTasks++;
        await db.update(streamEditJobs).set({
          completedClips: completedTasks,
          progress: Math.round((completedTasks / totalTasks) * 100),
          outputFiles,
        }).where(eq(streamEditJobs.id, jobId));
      }
    }

    // Guard: if encoding produced no output files, mark as error rather than
    // silently completing as "done" with nothing to publish.
    if (outputFiles.length === 0) {
      throw new Error(
        `Encoding completed but produced 0 clips from ${numClips} expected — FFmpeg may have failed silently (check disk space or codec errors)`
      );
    }

    // ── AI Post-processing: generate SEO package + Studio videos for every clip ──
    await db.update(streamEditJobs).set({
      currentStage: "AI Packaging (0/" + outputFiles.length + ")",
    }).where(eq(streamEditJobs.id, jobId));

    let packagedOutputFiles = outputFiles;
    let packagingError: string | null = null;
    try {
      const vaultEntry = job.vaultEntryId
        ? await db.select().from(contentVaultBackups).where(eq(contentVaultBackups.id, job.vaultEntryId)).limit(1).then(r => r[0] ?? null)
        : null;
      const sourceTitle = vaultEntry?.title ?? "Gaming Clip";
      const gameName = vaultEntry?.gameName ?? null;

      packagedOutputFiles = await packageClips(
        job.userId,
        sourceTitle,
        gameName,
        outputFiles,
        job.autoPublish ?? false,
        (done, total) => {
          db.update(streamEditJobs).set({
            currentStage: `AI Packaging (${done}/${total})`,
            outputFiles: packagedOutputFiles,
          }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
        },
      );
    } catch (packErr: any) {
      packagingError = String(packErr?.message ?? packErr);
      logger.warn(`[StreamEditor] Job ${jobId}: AI packaging failed:`, packagingError);
    }

    // If no clips were successfully packaged into Studio (no studioVideoId assigned),
    // the YouTube publish chain is broken — surface this as a retryable error.
    const anyPackaged = packagedOutputFiles.some(c => c.studioVideoId != null);
    if (!anyPackaged && outputFiles.length > 0) {
      throw new Error(
        `AI packaging produced no Studio videos — ${packagingError ?? "all clips failed packaging"}. Clips are encoded on disk; retry will re-package.`
      );
    }

    await db.update(streamEditJobs).set({
      status: "done",
      progress: 100,
      completedClips: totalTasks,
      outputFiles: packagedOutputFiles,
      currentStage: "Complete",
      completedAt: new Date(),
    }).where(eq(streamEditJobs.id, jobId));

    logger.info(`[StreamEditor] Job ${jobId} complete — ${packagedOutputFiles.length} clips produced`);
  } catch (err: any) {
    logger.error(`[StreamEditor] Job ${jobId} failed:`, err?.message);
    await db.update(streamEditJobs).set({
      status: "error",
      errorMessage: String(err?.message ?? err).slice(0, 500),
      currentStage: "Failed",
    }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
  } finally {
    activeJobId = null;
    await pickUpNextQueuedJob();
  }
}

export async function getEditJobs(userId: string): Promise<typeof streamEditJobs.$inferSelect[]> {
  return db.select().from(streamEditJobs)
    .where(eq(streamEditJobs.userId, userId))
    .orderBy(streamEditJobs.createdAt);
}

export async function getEditJob(userId: string, jobId: number): Promise<typeof streamEditJobs.$inferSelect | null> {
  const [job] = await db.select().from(streamEditJobs)
    .where(and(eq(streamEditJobs.id, jobId), eq(streamEditJobs.userId, userId)))
    .limit(1);
  return job ?? null;
}

export async function cancelEditJob(userId: string, jobId: number): Promise<void> {
  const [job] = await db.select().from(streamEditJobs)
    .where(and(eq(streamEditJobs.id, jobId), eq(streamEditJobs.userId, userId)))
    .limit(1);
  if (!job) return;
  if (job.status === "processing" || job.status === "queued") {
    await db.update(streamEditJobs).set({
      status: "error",
      errorMessage: "Cancelled by user",
      currentStage: "Cancelled",
    }).where(eq(streamEditJobs.id, jobId));
    if (activeJobId === jobId) {
      activeJobId = null;
      await pickUpNextQueuedJob();
    }
  }
}

export async function deleteEditJob(userId: string, jobId: number): Promise<void> {
  const [job] = await db.select().from(streamEditJobs)
    .where(and(eq(streamEditJobs.id, jobId), eq(streamEditJobs.userId, userId)))
    .limit(1);
  if (!job) return;
  if (job.outputDir && fs.existsSync(job.outputDir)) {
    fs.rmSync(job.outputDir, { recursive: true, force: true });
  }
  await db.delete(streamEditJobs).where(eq(streamEditJobs.id, jobId));
}

/**
 * Re-queue edit jobs that failed only because the source video file was missing
 * (i.e. the vault download hadn't completed yet). Called whenever the vault
 * recovers bot-detected entries so that clip generation picks back up automatically
 * once source footage downloads succeed.
 */
export async function recoverSourceNotFoundJobs(userId: string): Promise<void> {
  try {
    const { rowCount } = await db
      .update(streamEditJobs)
      .set({
        status: "queued",
        errorMessage: null,
        currentStage: "Re-queued (source recovery)",
        startedAt: null,
        completedAt: null,
      })
      .where(
        and(
          eq(streamEditJobs.userId, userId),
          eq(streamEditJobs.status, "error"),
          sql`${streamEditJobs.errorMessage} LIKE '%Source video file not found%'`,
        ),
      );
    if (rowCount && rowCount > 0) {
      logger.info(`[StreamEditor] Source-not-found recovery: reset ${rowCount} error jobs → queued`);
      await pickUpNextQueuedJob();
    }
  } catch (err: any) {
    logger.warn("[StreamEditor] Source-not-found recovery failed:", err?.message);
  }
}

/**
 * Watchdog: finds any jobs that have been stuck in "processing" for longer than
 * STUCK_JOB_THRESHOLD_MS, resets them to "queued", releases the activeJobId lock,
 * and kicks the queue so the next job picks up immediately.
 *
 * Runs once at server startup (to clear any jobs frozen across a restart) and
 * then every WATCHDOG_INTERVAL_MS to catch future hang scenarios.
 */
const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 60 * 1000; // 5 hours — allows 4K encodes to complete
const WATCHDOG_INTERVAL_MS   = 10 * 60 * 1000;     // check every 10 minutes

async function watchdogCheck(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);
    const stuck = await db
      .select({ id: streamEditJobs.id })
      .from(streamEditJobs)
      .where(
        and(
          eq(streamEditJobs.status, "processing"),
          sql`${streamEditJobs.startedAt} < ${cutoff.toISOString()}`,
        ),
      );

    if (stuck.length === 0) return;

    const stuckIds = stuck.map((j) => j.id);
    logger.warn(`[StreamEditor] Watchdog: ${stuckIds.length} job(s) stuck in processing >5 hours — resetting to queued: ${stuckIds.join(", ")}`);

    await db
      .update(streamEditJobs)
      .set({
        status: "queued",
        errorMessage: "Reset by watchdog — was stuck in processing >90 min",
        currentStage: "Re-queued (watchdog)",
        startedAt: null,
        completedAt: null,
      })
      .where(inArray(streamEditJobs.id, stuckIds));

    // Release the in-memory lock if it was held by one of the stuck jobs
    if (activeJobId !== null && stuckIds.includes(activeJobId)) {
      activeJobId = null;
    }

    await pickUpNextQueuedJob();
  } catch (err: any) {
    logger.warn("[StreamEditor] Watchdog check failed:", err?.message);
  }
}

let _watchdogTimer: ReturnType<typeof setInterval> | null = null;

export function startStreamEditorWatchdog(): void {
  if (_watchdogTimer) return; // already running
  // Run immediately to clear any jobs that were frozen before this deploy
  watchdogCheck().catch(() => {});
  _watchdogTimer = setInterval(() => {
    watchdogCheck().catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
  logger.info("[StreamEditor] Watchdog started — checks every 10 min, threshold 90 min");
}

export { PLATFORM_PROFILES };
