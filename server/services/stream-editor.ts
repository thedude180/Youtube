import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { db } from "../db";
import { streamEditJobs, contentVaultBackups } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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
 * Platform profiles optimised for gaming 4K output.
 *
 * Filter chain strategy (applied in buildVideoFilter):
 *  1. hqdn3d  — temporal + spatial denoise at SOURCE resolution
 *  2. eq      — colour grading at source resolution
 *  3. unsharp — sharpening at source resolution (sharper than post-scale)
 *  4. scale   — Lanczos upscale / resize to target
 *  5. pad/crop — landscape: letterbox pad; portrait: centre 9:16 crop
 *  6. setsar + fps — normalise aspect ratio, cap at 60fps
 */
const PLATFORM_PROFILES: Record<StreamEditPlatform, PlatformProfile> = {
  youtube: {
    label: "YouTube 4K",
    width: 3840,
    height: 2160,
    orientation: "landscape",
    codec: "libx265",
    codecArgs: [
      "-x265-params", "aq-mode=3:aq-strength=1.0:keyint=120:min-keyint=48:no-open-gop=1:bframes=4:ref=4:rc-lookahead=48:psy-rd=1.0:psy-rdoq=1.5",
      "-tag:v", "hvc1",
    ],
    crf: 20,
    preset: "fast",
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
      "-x264-params", "keyint=120:min-keyint=48:no-cabac=0:bframes=3:ref=4:aq-mode=2:aq-strength=1.0:psy-rd=1.0:psy-rdoq=1.0",
    ],
    crf: 21,
    preset: "fast",
    maxClipSecs: null,
    audioBitrate: "192k",
    audioSampleRate: 48000,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
  tiktok: {
    label: "TikTok Vertical",
    width: 1080,
    height: 1920,
    orientation: "portrait",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "4.1",
      "-x264-params", "keyint=60:min-keyint=24:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
    ],
    crf: 22,
    preset: "fast",
    maxClipSecs: 600,
    audioBitrate: "128k",
    audioSampleRate: 44100,
    targetLoudness: "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
  },
  shorts: {
    label: "YouTube Shorts",
    width: 1080,
    height: 1920,
    orientation: "portrait",
    codec: "libx264",
    codecArgs: [
      "-profile:v", "high",
      "-level:v", "4.1",
      "-x264-params", "keyint=60:min-keyint=24:bframes=2:ref=3:aq-mode=2:aq-strength=1.0",
    ],
    crf: 21,
    preset: "fast",
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

function runFFmpeg(args: string[], onProgress?: (pct: number, fps: number, stage: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let totalDuration = 0;

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
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
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
    status: "queued",
    progress: 0,
    currentStage: downloadFirst ? "Waiting to download" : "Waiting to encode",
  }).returning();

  logger.info(`[StreamEditor] Queued job ${job.id} for "${entry.title}" → ${platforms.join(", ")}${downloadFirst ? " (will download first)" : ""}`);

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

    if (job.downloadFirst) {
      await db.update(streamEditJobs).set({
        currentStage: "Downloading from YouTube",
      }).where(eq(streamEditJobs.id, jobId));

      logger.info(`[StreamEditor] Job ${jobId}: downloading vault entry ${job.vaultEntryId}`);
      sourceFile = await downloadVaultEntry(job.userId, job.vaultEntryId!);

      await db.update(streamEditJobs).set({
        sourceFilePath: sourceFile,
        currentStage: "Download complete — probing video",
      }).where(eq(streamEditJobs.id, jobId));
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

    // ── AI Post-processing: generate SEO package + Studio videos for every clip ──
    await db.update(streamEditJobs).set({
      currentStage: "AI Packaging (0/" + outputFiles.length + ")",
    }).where(eq(streamEditJobs.id, jobId));

    let packagedOutputFiles = outputFiles;
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
        (done, total) => {
          db.update(streamEditJobs).set({
            currentStage: `AI Packaging (${done}/${total})`,
            outputFiles: packagedOutputFiles,
          }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
        },
      );
    } catch (packErr: any) {
      logger.warn(`[StreamEditor] Job ${jobId}: AI packaging failed (clips still saved):`, packErr?.message);
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

export { PLATFORM_PROFILES };
