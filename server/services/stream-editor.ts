import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { db } from "../db";
import { streamEditJobs, contentVaultBackups } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
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

// ── Encoding CPU budget ───────────────────────────────────────────────────────
// 4K libx264 will use every available core if unconstrained, starving the web
// server and causing 504 timeouts. Two limits work together:
//   1. nice -n 15  — OS scheduler gives the web server priority over FFmpeg
//      whenever both compete for a core. The process still runs, just yields.
//   2. -threads 2  — caps FFmpeg's own thread pool so it can't flood all cores.
// With these in place the web server stays responsive during a long 4K encode.
// If encoding speed is a concern later, raise FFMPEG_ENCODE_THREADS (max = cores−1).
const FFMPEG_ENCODE_THREADS = 2;

function runFFmpeg(args: string[], onProgress?: (pct: number, fps: number, stage: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // Spawn via `nice -n 15` so the OS deprioritises FFmpeg vs the Express server.
    const proc = spawn("nice", ["-n", "15", FFMPEG_BIN, "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let totalDuration = 0;

    const hardTimeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFmpeg hard timeout — encoding exceeded 4 hours, killed"));
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
  sourceWidth: number,
  sourceHeight: number,
): string {
  const parts: string[] = [];

  // Determine whether we are genuinely upscaling or just fitting/downscaling.
  // A source that is already >= the target in both dimensions does NOT need
  // upscaling — applying an upscale filter chain to native 4K source only adds
  // unnecessary re-encoding blur.  We still apply denoise + colour + sharpening;
  // only the scale step changes.
  const needsUpscale = sourceWidth < profile.width || sourceHeight < profile.height;

  if (enhancements.upscale4k) {
    // Denoise at source resolution before any scaling — removes compression
    // artefacts that would otherwise be amplified by the upscale step.
    parts.push("hqdn3d=luma_spatial=2:chroma_spatial=1.5:luma_tmp=3:chroma_tmp=2.5");
  }
  if (enhancements.colorEnhance) {
    parts.push("eq=brightness=0.02:contrast=1.06:saturation=1.12:gamma=0.98");
  }
  if (enhancements.sharpen && needsUpscale) {
    // Pre-upscale sharpening: strengthens edges at source resolution so they
    // survive the interpolation step with less blurring.
    parts.push("unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.9:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3");
  } else if (enhancements.sharpen) {
    // Source already at or above target — lighter sharpen, no need to compensate
    // for upscale blur.
    parts.push("unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.5:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.2");
  }

  if (profile.orientation === "portrait") {
    parts.push(
      `crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-min(iw\\,ih*9/16))/2:(ih-min(ih\\,iw*16/9))/2`,
      // full_chroma_int + full_chroma_inp preserve chroma precision during scale.
      // sws_dither=ed uses error-diffusion dithering to avoid banding.
      `scale=${profile.width}:${profile.height}:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp:sws_dither=ed`,
    );
  } else {
    if (enhancements.upscale4k) {
      parts.push(
        `scale=${profile.width}:${profile.height}:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp:sws_dither=ed:force_original_aspect_ratio=decrease`,
        `pad=${profile.width}:${profile.height}:-1:-1:color=black`,
      );
      if (needsUpscale && enhancements.sharpen) {
        // Post-upscale sharpening: Lanczos interpolation introduces slight
        // blurring at the target resolution — a gentle unsharp mask restores
        // perceived edge crispness without amplifying noise.
        parts.push("unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.5:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.2");
      }
    } else {
      parts.push(`scale=-2:${profile.height}:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp:sws_dither=ed`);
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
  sourceWidth: number,
  sourceHeight: number,
  onProgress?: (pct: number, fps: number, stage: string) => void,
): Promise<void> {
  const profile = PLATFORM_PROFILES[platform];
  const actualDuration = profile.maxClipSecs ? Math.min(durationSecs, profile.maxClipSecs) : durationSecs;
  const vf = buildVideoFilter(enhancements, profile, sourceFps, sourceWidth, sourceHeight);
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
    "-threads", String(FFMPEG_ENCODE_THREADS),
    outputPath,
  ];

  await runFFmpeg(args, onProgress);
}

let activeJobId: number | null = null;
// Prevents concurrent `pickUpNextQueuedJob` calls from each starting a separate
// job.  Without this, watchdog + finally + recovery callbacks that fire at the
// same millisecond each see activeJobId===null, each find a queued job, and each
// call runJobInBackground — causing the simultaneous-failures burst seen in prod.
let _pickingUpJob = false;
// Set to true when runJobInBackground defers a job back to "queued" because the
// vault file isn't ready.  The finally block skips pickUpNextQueuedJob when this
// is true — prevents a rapid spin through all 3,652 queued jobs when no vault
// files are available.  The stream editor stays idle until onVaultDownloadComplete
// or the watchdog wakes it.
let _jobWasDeferred = false;

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
  // Hard-stop: only one pick-up can run at a time.  Multiple concurrent callers
  // (watchdog, finally block, cancel, recovery) used to each find a queued job
  // and each fire runJobInBackground, causing simultaneous job explosions.
  if (_pickingUpJob) return;
  _pickingUpJob = true;
  try {
    if (activeJobId !== null) return; // Already processing — nothing to pick up

    // Prioritise jobs where the vault file is already on disk (download_first = false
    // means the file existed when the job was created).  Jobs that still need a
    // download go last — they must wait for the vault download processor to pull
    // the video before encoding can start, and letting them cut the queue blocks
    // all the ready-to-encode jobs behind them.
    const waiting = await db.select({ id: streamEditJobs.id })
      .from(streamEditJobs)
      .where(eq(streamEditJobs.status, "queued"))
      .orderBy(
        sql`CASE WHEN ${streamEditJobs.downloadFirst} = false THEN 0 ELSE 1 END`,
        streamEditJobs.createdAt,
      )
      .limit(1);

    if (waiting.length > 0) {
      const nextId = waiting[0].id;
      logger.info(`[StreamEditor] Picking up next queued job ${nextId}`);
      setImmediate(() => runJobInBackground(nextId).catch(err =>
        logger.error(`[StreamEditor] Background job ${nextId} crashed:`, err?.message)
      ));
    }
  } finally {
    _pickingUpJob = false;
  }
}

/**
 * Called by the vault download processor immediately after a vault file is
 * successfully saved to disk.  Marks any queued stream_edit_jobs that were
 * waiting for this vault entry as ready-to-encode (downloadFirst=false,
 * sourceFilePath set), then wakes the stream editor if it is idle.
 *
 * This is the "handoff" between vault and stream editor — without it the
 * stream editor would never know a file had arrived and those jobs would
 * stay deferred indefinitely.
 */
export async function onVaultDownloadComplete(vaultEntryId: number, filePath: string): Promise<void> {
  try {
    await db.update(streamEditJobs)
      .set({
        downloadFirst: false,
        sourceFilePath: filePath,
        currentStage: "Ready to encode",
      })
      .where(
        and(
          eq(streamEditJobs.vaultEntryId, vaultEntryId),
          eq(streamEditJobs.status, "queued"),
        )
      );
    logger.info(`[StreamEditor] Vault entry ${vaultEntryId} downloaded — waking stream editor`);
    if (activeJobId === null) {
      await pickUpNextQueuedJob().catch(() => {});
    }
  } catch {}
}

async function runJobInBackground(jobId: number): Promise<void> {
  if (activeJobId !== null) {
    logger.info(`[StreamEditor] Job ${jobId} deferred — job ${activeJobId} is active`);
    return;
  }

  activeJobId = jobId;

  // Track whether failure was a transient DB connection error so the finally
  // block can back off before immediately picking up the next job — otherwise
  // we'd create a tight retry storm that exhausts the pool further.
  let connectionError = false;

  try {
    // Retry the initial DB fetch with exponential backoff.  Under production
    // load the pool (max 30) can be fully saturated by background services;
    // a single 5-second timeout followed by an instant retry just hammers it
    // harder.  Back off up to 60 s before actually giving up.
    let job: typeof streamEditJobs.$inferSelect | undefined;
    let dbAttempts = 0;
    while (true) {
      try {
        const rows = await db.select().from(streamEditJobs).where(eq(streamEditJobs.id, jobId)).limit(1);
        job = rows[0];
        break;
      } catch (dbErr: any) {
        dbAttempts++;
        const isConnErr = /timeout|ETIMEDOUT|ECONNRESET|pool.*empty|too many clients/i.test(dbErr?.message ?? "");
        if (!isConnErr || dbAttempts >= 6) { connectionError = isConnErr; throw dbErr; }
        connectionError = true;
        const delay = Math.min(60_000, 5_000 * Math.pow(2, dbAttempts - 1));
        logger.warn(`[StreamEditor] Job ${jobId}: DB pool saturated (attempt ${dbAttempts}/6) — backing off ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    connectionError = false;
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
      // The stream editor NEVER downloads files itself.  All downloading is done
      // by the vault download processor which has proper memory management and
      // bot-detection avoidance.  The stream editor only encodes files that are
      // already on disk.  Any job whose file isn't ready gets deferred back to
      // "queued" so the vault processor can download it and then wake us up via
      // onVaultDownloadComplete().  This prevents the stream editor from blocking
      // for 10+ minutes on failed download attempts that exhaust the DB pool.
      if (job.vaultEntryId) {
        const [vaultCheck] = await db
          .select({ status: contentVaultBackups.status, filePath: contentVaultBackups.filePath, youtubeId: contentVaultBackups.youtubeId })
          .from(contentVaultBackups)
          .where(eq(contentVaultBackups.id, job.vaultEntryId))
          .limit(1);

        if (vaultCheck?.status === "skipped") {
          // Video is permanently unavailable — fail this job immediately instead
          // of leaving it to block the queue forever.
          throw new Error(`Video permanently unavailable (${vaultCheck.youtubeId}) — skipped by vault downloader`);
        }

        if (vaultCheck?.status === "downloaded" && vaultCheck.filePath && fs.existsSync(vaultCheck.filePath)) {
          // File is on disk — use it directly
          sourceFile = vaultCheck.filePath;
          await db.update(streamEditJobs).set({ sourceFilePath: sourceFile, downloadFirst: false })
            .where(eq(streamEditJobs.id, jobId));
          logger.info(`[StreamEditor] Job ${jobId}: vault file on disk at ${sourceFile}`);
        } else if (vaultCheck?.status === "downloaded" && vaultCheck.youtubeId) {
          // Marked downloaded but file missing (server restart cleared disk).
          // Try cloud storage first — files survive deployments there.
          const expectedPath = path.join(process.cwd(), "vault", `${vaultCheck.youtubeId}.mp4`);
          try {
            const { downloadVaultFileFromStorage } = await import("./vault-object-storage");
            const restored = await downloadVaultFileFromStorage(vaultCheck.youtubeId, expectedPath);
            if (restored) {
              sourceFile = expectedPath;
              await db.update(streamEditJobs).set({ sourceFilePath: sourceFile, downloadFirst: false })
                .where(eq(streamEditJobs.id, jobId));
              logger.info(`[StreamEditor] Job ${jobId}: restored ${vaultCheck.youtubeId} from cloud storage`);
            }
          } catch {}

          if (!sourceFile || !fs.existsSync(sourceFile)) {
            // Nothing in cloud either — reset vault to "indexed" so the vault
            // download processor re-queues it, then defer this job.
            logger.warn(`[StreamEditor] Job ${jobId}: vault ${job.vaultEntryId} has no local/cloud copy — resetting to "indexed", deferring job`);
            await db.update(contentVaultBackups).set({
              status: "indexed",
              filePath: null,
              fileSize: null,
              downloadError: "File missing after restart — queued for re-download",
            }).where(eq(contentVaultBackups.id, job.vaultEntryId));
            await db.update(streamEditJobs).set({
              status: "queued",
              currentStage: "Waiting for vault re-download",
              startedAt: null,
            }).where(eq(streamEditJobs.id, jobId));
            _jobWasDeferred = true;
            activeJobId = null;
            return;
          }
        } else {
          // Vault entry is "indexed", "downloading", "failed", or unknown —
          // vault processor will handle it.  Defer this job rather than blocking.
          const vaultStatus = vaultCheck?.status ?? "unknown";
          logger.info(`[StreamEditor] Job ${jobId}: vault ${job.vaultEntryId} is "${vaultStatus}" — deferring until vault downloads it`);
          await db.update(streamEditJobs).set({
            status: "queued",
            currentStage: `Waiting for vault download (${vaultStatus})`,
            startedAt: null,
          }).where(eq(streamEditJobs.id, jobId));
          _jobWasDeferred = true;
          activeJobId = null;
          return;
        }
      } else {
        throw new Error("Job has downloadFirst=true but no vaultEntryId — cannot download");
      }
    } else if (job.downloadFirst && fileAlreadyOnDisk) {
      logger.info(`[StreamEditor] Job ${jobId}: vault file already on disk at ${sourceFile}, skipping download`);
    }

    // If we still don't have a file, check the vault entry directly.
    // This handles the case where downloadFirst=false (file was on disk when
    // the job was queued) but the file has since been wiped — e.g. after a
    // production deployment restart.  If the vault DB record exists, we
    // re-download rather than failing immediately.
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      if (job.vaultEntryId) {
        const [vaultEntry] = await db
          .select({ filePath: contentVaultBackups.filePath, status: contentVaultBackups.status })
          .from(contentVaultBackups)
          .where(eq(contentVaultBackups.id, job.vaultEntryId))
          .limit(1);
        if (vaultEntry?.filePath && fs.existsSync(vaultEntry.filePath)) {
          sourceFile = vaultEntry.filePath;
          await db.update(streamEditJobs).set({ sourceFilePath: sourceFile })
            .where(eq(streamEditJobs.id, jobId));
          logger.info(`[StreamEditor] Job ${jobId}: found vault file via DB lookup: ${sourceFile}`);
        } else {
          // File is gone from disk — defer back to queue so vault processor
          // can re-download it.  Reset vault status to "indexed" if it was
          // "downloaded" so the vault processor picks it up.
          const vaultStatus = vaultEntry?.status ?? "unknown";
          logger.info(`[StreamEditor] Job ${jobId}: vault file missing from disk (status: ${vaultStatus}) — deferring to vault processor`);
          if (job.vaultEntryId && vaultEntry?.status === "downloaded") {
            await db.update(contentVaultBackups).set({
              status: "indexed",
              filePath: null,
              fileSize: null,
              downloadError: "File missing after restart — queued for re-download",
            }).where(eq(contentVaultBackups.id, job.vaultEntryId));
          }
          await db.update(streamEditJobs).set({
            status: "queued",
            currentStage: `Waiting for vault download (${vaultStatus})`,
            downloadFirst: true,
            startedAt: null,
          }).where(eq(streamEditJobs.id, jobId));
          _jobWasDeferred = true;
          activeJobId = null;
          return;
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
          probe.width,
          probe.height,
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

    // Archive all edited clips to cloud storage in the background.
    // Files on local disk are wiped on deployment; cloud copies survive permanently.
    // When done, each clip's cloudPath is written back into the outputFiles JSON.
    import("./vault-object-storage").then(async ({ uploadEditedClipsToStorage }) => {
      try {
        const cloudPaths = await uploadEditedClipsToStorage(jobId, packagedOutputFiles);
        if (cloudPaths.size > 0) {
          const updatedFiles = packagedOutputFiles.map(clip => {
            const cp = cloudPaths.get(clip.filePath);
            return cp ? { ...clip, cloudPath: cp } : clip;
          });
          await db.update(streamEditJobs)
            .set({ outputFiles: updatedFiles })
            .where(eq(streamEditJobs.id, jobId));
          logger.info(`[StreamEditor] Job ${jobId}: archived ${cloudPaths.size}/${packagedOutputFiles.length} clips to cloud`);
        }
      } catch (archErr: any) {
        logger.warn(`[StreamEditor] Job ${jobId}: cloud archive failed (non-fatal): ${archErr.message}`);
      }
    }).catch(() => {});
  } catch (err: any) {
    logger.error(`[StreamEditor] Job ${jobId} failed:`, err?.message);
    await db.update(streamEditJobs).set({
      status: "error",
      errorMessage: String(err?.message ?? err).slice(0, 500),
      currentStage: "Failed",
    }).where(eq(streamEditJobs.id, jobId)).catch(() => {});
  } finally {
    activeJobId = null;
    // Capture and immediately reset the defer flag BEFORE any async work so
    // a concurrent onVaultDownloadComplete call doesn't race with us.
    const wasDeferred = _jobWasDeferred;
    _jobWasDeferred = false;
    if (wasDeferred) {
      // The job was put back in the queue because the vault file isn't ready.
      // Do NOT immediately pick up the next job — all other queued jobs are
      // also waiting for vault downloads and we'd just spin through all 3,652
      // of them.  The stream editor stays idle until onVaultDownloadComplete
      // or the watchdog wakes it.
      logger.info(`[StreamEditor] Job ${jobId} deferred — stream editor idle, waiting for vault`);
      return;
    }
    // If the failure was a DB connection error, wait 30 s before picking up
    // the next job.  Immediately re-queuing adds more pool pressure and creates
    // a tight storm that prevents the pool from recovering.
    if (connectionError) {
      logger.warn(`[StreamEditor] Job ${jobId}: DB connection error — waiting 30 s before picking up next job`);
      await new Promise(r => setTimeout(r, 30_000));
    }
    await pickUpNextQueuedJob().catch(() => {});
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

async function watchdogCheck(isStartup = false): Promise<void> {
  try {
    // On startup: any "processing" job is stale — it was running before the
    // server restarted and its in-memory state was lost.  Reset them all
    // immediately rather than waiting 5 hours for the normal threshold.
    // After startup: only reset jobs that have been running > 5 hours.
    const stuckQuery = isStartup
      ? db.select({ id: streamEditJobs.id }).from(streamEditJobs)
          .where(eq(streamEditJobs.status, "processing"))
      : db.select({ id: streamEditJobs.id }).from(streamEditJobs)
          .where(
            and(
              eq(streamEditJobs.status, "processing"),
              sql`${streamEditJobs.startedAt} < ${new Date(Date.now() - STUCK_JOB_THRESHOLD_MS).toISOString()}`,
            ),
          );

    const stuck = await stuckQuery;

    if (stuck.length === 0) return;

    const stuckIds = stuck.map((j) => j.id);
    if (isStartup) {
      logger.warn(`[StreamEditor] Startup recovery: ${stuckIds.length} job(s) left in "processing" from previous run — resetting to queued: ${stuckIds.join(", ")}`);
    } else {
      logger.warn(`[StreamEditor] Watchdog: ${stuckIds.length} job(s) stuck in processing >5 hours — resetting to queued: ${stuckIds.join(", ")}`);
    }

    await db
      .update(streamEditJobs)
      .set({
        status: "queued",
        errorMessage: isStartup
          ? "Reset on startup — server restarted while job was running"
          : "Reset by watchdog — was stuck in processing >5 hours",
        currentStage: "Re-queued (restart recovery)",
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
  // Run immediately with isStartup=true to reset any "processing" jobs that
  // were left over from the previous server instance.  Those jobs lost their
  // in-memory state when the process restarted — they must be re-queued so
  // the vault download/encode cycle can pick them up cleanly.
  watchdogCheck(true)
    .then(() => {
      if (activeJobId === null) {
        return pickUpNextQueuedJob().catch(() => {});
      }
    })
    .catch(() => {});
  _watchdogTimer = setInterval(() => {
    watchdogCheck()
      .then(() => {
        if (activeJobId === null) {
          return pickUpNextQueuedJob().catch(() => {});
        }
      })
      .catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
  logger.info("[StreamEditor] Watchdog started — checks every 10 min, threshold 90 min");
}

export { PLATFORM_PROFILES };
