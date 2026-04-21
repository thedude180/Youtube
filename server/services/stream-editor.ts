import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { db } from "../db";
import { streamEditJobs, contentVaultBackups } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

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
  codec: string;
  crf: number;
  preset: string;
  maxClipSecs: number | null;
  audioBitrate: string;
  scaleFilter: string;
}

const PLATFORM_PROFILES: Record<StreamEditPlatform, PlatformProfile> = {
  youtube: {
    label: "YouTube 4K",
    width: 3840,
    height: 2160,
    codec: "libx265",
    crf: 22,
    preset: "medium",
    maxClipSecs: null,
    audioBitrate: "192k",
    scaleFilter: "scale=3840:2160:flags=lanczos:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black",
  },
  rumble: {
    label: "Rumble 4K",
    width: 3840,
    height: 2160,
    codec: "libx264",
    crf: 23,
    preset: "medium",
    maxClipSecs: null,
    audioBitrate: "192k",
    scaleFilter: "scale=3840:2160:flags=lanczos:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black",
  },
  tiktok: {
    label: "TikTok Vertical",
    width: 1080,
    height: 1920,
    codec: "libx264",
    crf: 23,
    preset: "medium",
    maxClipSecs: 600,
    audioBitrate: "128k",
    scaleFilter: "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
  },
  shorts: {
    label: "YouTube Shorts",
    width: 1080,
    height: 1920,
    codec: "libx264",
    crf: 22,
    preset: "medium",
    maxClipSecs: 60,
    audioBitrate: "128k",
    scaleFilter: "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
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
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } else {
        reject(new Error(Buffer.concat(errChunks).toString("utf8").slice(-500)));
      }
    });
    proc.on("error", reject);
  });
}

function runFFmpeg(args: string[], onProgress?: (pct: number, fps: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let totalDuration = 0;

    const handleStderr = (data: Buffer) => {
      const text = data.toString();
      const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch && !totalDuration) {
        totalDuration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
      }
      if (onProgress && totalDuration > 0) {
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        const fpsMatch = text.match(/fps=\s*(\d+\.?\d*)/);
        if (timeMatch) {
          const elapsed = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          onProgress(Math.min(99, Math.round((elapsed / totalDuration) * 100)), fps);
        }
      }
    };

    proc.stderr.on("data", handleStderr);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function probeVideo(filePath: string): Promise<{ durationSecs: number; width: number; height: number }> {
  const raw = await runProcess(FFPROBE_BIN, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const info = JSON.parse(raw);
  const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
  const durationSecs = parseFloat(info.format?.duration ?? "0");
  return {
    durationSecs,
    width: videoStream?.width ?? 1920,
    height: videoStream?.height ?? 1080,
  };
}

function buildVideoFilters(enhancements: { upscale4k: boolean; colorEnhance: boolean; sharpen: boolean }, profile: PlatformProfile): string {
  const filters: string[] = [];

  filters.push(profile.scaleFilter);

  if (enhancements.colorEnhance) {
    filters.push("eq=brightness=0.02:contrast=1.05:saturation=1.1");
  }

  if (enhancements.sharpen) {
    filters.push("unsharp=5:5:0.8:3:3:0.4");
  }

  return filters.join(",");
}

function buildAudioFilters(normalize: boolean): string {
  return normalize ? "loudnorm=I=-14:TP=-1:LRA=11" : "anull";
}

async function processClip(
  sourcePath: string,
  startSecs: number,
  durationSecs: number,
  outputPath: string,
  platform: StreamEditPlatform,
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean },
  onProgress?: (pct: number) => void,
): Promise<void> {
  const profile = PLATFORM_PROFILES[platform];
  const actualDuration = profile.maxClipSecs ? Math.min(durationSecs, profile.maxClipSecs) : durationSecs;

  const vf = buildVideoFilters(enhancements, profile);
  const af = buildAudioFilters(enhancements.audioNormalize);

  const args = [
    "-ss", String(startSecs),
    "-i", sourcePath,
    "-t", String(actualDuration),
    "-vf", vf,
    "-af", af,
    "-c:v", profile.codec,
    "-crf", String(profile.crf),
    "-preset", profile.preset,
    "-c:a", "aac",
    "-b:a", profile.audioBitrate,
    "-movflags", "+faststart",
    "-threads", "0",
    outputPath,
  ];

  if (profile.codec === "libx265") {
    args.splice(args.indexOf("-crf") + 2, 0, "-tag:v", "hvc1");
  }

  await runFFmpeg(args, (pct) => onProgress?.(pct));
}

let activeJobId: number | null = null;

export async function queueStreamEditJob(
  userId: string,
  vaultEntryId: number,
  platforms: StreamEditPlatform[],
  clipDurationMins: number,
  enhancements: { upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean },
): Promise<{ jobId: number }> {
  const [entry] = await db.select()
    .from(contentVaultBackups)
    .where(and(eq(contentVaultBackups.id, vaultEntryId), eq(contentVaultBackups.userId, userId)))
    .limit(1);

  if (!entry) throw new Error("Vault entry not found");
  if (!entry.filePath || !fs.existsSync(entry.filePath)) {
    throw new Error("Video file not downloaded yet — download it from the Vault first");
  }

  const [job] = await db.insert(streamEditJobs).values({
    userId,
    vaultEntryId,
    sourceTitle: entry.title ?? "Untitled",
    sourceFilePath: entry.filePath,
    platforms,
    clipDurationMins,
    enhancements,
    status: "queued",
    progress: 0,
  }).returning();

  logger.info(`[StreamEditor] Queued job ${job.id} for "${entry.title}" → ${platforms.join(", ")}`);

  setImmediate(() => runJobInBackground(job.id).catch(err =>
    logger.error(`[StreamEditor] Background job ${job.id} crashed:`, err?.message)
  ));

  return { jobId: job.id };
}

async function runJobInBackground(jobId: number): Promise<void> {
  if (activeJobId !== null) {
    logger.info(`[StreamEditor] Job ${jobId} waiting — job ${activeJobId} is running`);
    return;
  }

  activeJobId = jobId;

  try {
    const [job] = await db.select().from(streamEditJobs).where(eq(streamEditJobs.id, jobId)).limit(1);
    if (!job || job.status !== "queued") return;

    await db.update(streamEditJobs).set({ status: "processing", startedAt: new Date() }).where(eq(streamEditJobs.id, jobId));

    const sourceFile = job.sourceFilePath!;
    const probe = await probeVideo(sourceFile);

    const jobOutputDir = path.join(EDITOR_OUTPUT_DIR, `job_${jobId}`);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const clipSecs = (job.clipDurationMins ?? 60) * 60;
    const platforms = (job.platforms ?? []) as StreamEditPlatform[];
    const enhancements = (job.enhancements ?? { upscale4k: true, audioNormalize: true, colorEnhance: true, sharpen: true }) as {
      upscale4k: boolean; audioNormalize: boolean; colorEnhance: boolean; sharpen: boolean;
    };

    const numClips = Math.ceil(probe.durationSecs / clipSecs);
    const totalTasks = numClips * platforms.length;
    let completedTasks = 0;
    const outputFiles: Array<{ platform: string; clipIndex: number; label: string; filePath: string; fileSize: number; durationSecs: number }> = [];

    await db.update(streamEditJobs).set({
      sourceDurationSecs: Math.round(probe.durationSecs),
      totalClips: totalTasks,
      outputDir: jobOutputDir,
    }).where(eq(streamEditJobs.id, jobId));

    for (const platform of platforms) {
      const profile = PLATFORM_PROFILES[platform];
      const platformDir = path.join(jobOutputDir, platform);
      fs.mkdirSync(platformDir, { recursive: true });

      for (let i = 0; i < numClips; i++) {
        const startSecs = i * clipSecs;
        const actualDuration = Math.min(clipSecs, probe.durationSecs - startSecs);
        const clipLabel = `Part ${i + 1} of ${numClips} — ${profile.label}`;
        const ext = "mp4";
        const outputPath = path.join(platformDir, `clip_${String(i + 1).padStart(3, "0")}.${ext}`);

        logger.info(`[StreamEditor] Job ${jobId}: ${clipLabel}`);

        await processClip(
          sourceFile,
          startSecs,
          actualDuration,
          outputPath,
          platform,
          enhancements,
          (pct) => {
            const overallPct = Math.round(((completedTasks + pct / 100) / totalTasks) * 100);
            db.update(streamEditJobs).set({ progress: overallPct }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
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

    await db.update(streamEditJobs).set({
      status: "done",
      progress: 100,
      completedClips: totalTasks,
      outputFiles,
      completedAt: new Date(),
    }).where(eq(streamEditJobs.id, jobId));

    logger.info(`[StreamEditor] Job ${jobId} complete — ${outputFiles.length} files produced`);
  } catch (err: any) {
    logger.error(`[StreamEditor] Job ${jobId} failed:`, err?.message);
    await db.update(streamEditJobs).set({
      status: "error",
      errorMessage: String(err?.message ?? err).slice(0, 500),
    }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
  } finally {
    activeJobId = null;
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
  if (job.status === "processing") {
    await db.update(streamEditJobs).set({ status: "error", errorMessage: "Cancelled by user" }).where(eq(streamEditJobs.id, jobId));
  } else if (job.status === "queued") {
    await db.update(streamEditJobs).set({ status: "error", errorMessage: "Cancelled before starting" }).where(eq(streamEditJobs.id, jobId));
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
