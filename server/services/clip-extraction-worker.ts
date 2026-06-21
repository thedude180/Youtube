/**
 * clip-extraction-worker.ts
 *
 * Bridges daily-content-engine plans to actual MP4 files.
 *
 * The daily content engine generates brilliant content plans (game, timestamps,
 * title variants, clip boundaries) and puts them in a queue — but nothing
 * actually EXTRACTS the video clips.  This service reads pending
 * clipExtractionJobs, downloads the needed segment from YouTube using yt-dlp
 * (reusing the same pattern as long-form-clip-publisher), encodes it with
 * ffmpeg, then hands it off to the existing upload path.
 *
 * Design constraints:
 * - Max 2 concurrent extractions per user to avoid disk exhaustion.
 * - Uses the IO gate so it never runs a yt-dlp download at the same time as
 *   a long-form upload.
 * - Respects the container memory gate before spawning subprocesses.
 * - Cleans up temp files after every attempt (success or failure).
 * - Only vault/temp/ files are ever deleted — the main vault/ is untouched.
 */

import path from "path";
import fs from "fs";
import { promisify } from "util";
import { execFile, spawn } from "child_process";
import { db } from "../db";
import {
  clipExtractionJobs,
  channels,
  autopilotQueue,
} from "@shared/schema";
import type { ClipExtractionJob, InsertClipExtractionJob } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getYtdlpBin } from "../lib/dependency-check";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { getContainerMemory } from "../lib/container-memory";
import { acquireIOSlot, releaseIOSlot } from "../lib/io-gate";
import { uploadVideoToYouTube } from "../youtube";

const logger = createLogger("clip-extraction-worker");

const execFileAsync = promisify(execFile);

// ── Directories ───────────────────────────────────────────────────────────────
const VAULT_TEMP_DIR = path.join(process.cwd(), "vault", "temp");
if (!fs.existsSync(VAULT_TEMP_DIR)) {
  try {
    fs.mkdirSync(VAULT_TEMP_DIR, { recursive: true });
  } catch {
    /* non-fatal — will error on first use */
  }
}

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_DURATION_SEC = 3600; // 60-minute hard ceiling
const MIN_DURATION_SEC = 1;    // at least 1 second
const EXTRACT_TIMEOUT_MS = 10 * 60_000; // 10-minute max per extraction process
const MAX_CONCURRENT_PER_USER = 2;
const MIN_DISK_GB_FOR_EXTRACTION = 1.5; // GB needed before downloading
const MIN_DISK_GB_GLOBAL = 2.0;         // GB needed before any user is processed

// ── Low-level helpers ─────────────────────────────────────────────────────────

function runCmd(bin: string, args: string[], timeoutMs = EXTRACT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr.on("data", (d: Buffer) => errBufs.push(d));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Process timed out after ${Math.round(timeoutMs / 60_000)}m`));
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(errBufs).toString("utf8").slice(-600)));
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function getFreeGb(): Promise<number> {
  try {
    const { stdout } = await execFileAsync("df", ["--output=avail", "-B1", "/"], { timeout: 5000 });
    const lines = stdout.trim().split("\n");
    return parseInt(lines[lines.length - 1].trim(), 10) / (1024 ** 3);
  } catch {
    return 999; // non-fatal — proceed
  }
}

/**
 * Download a YouTube segment using yt-dlp.
 * Reuses the exact same pattern as jitDownloadSegment() in long-form-clip-publisher.ts.
 */
async function downloadSegment(
  youtubeId: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const ytdlp = getYtdlpBin();
  const cookiesPath = path.join(process.cwd(), ".local", "yt-cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;
  const args: string[] = [
    "--download-sections", `*${startSec}-${endSec}`,
    "--force-keyframes-at-cuts",
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-playlist", "--quiet", "--no-warnings",
  ];
  if (hasCookies) args.push("--cookies", cookiesPath);
  args.push(`https://www.youtube.com/watch?v=${youtubeId}`);
  await runCmd(ytdlp, args);
}

/**
 * Encode a clip with ffmpeg for consistent horizontal (16:9) output.
 * Mirrors jitExtractSegment() from long-form-clip-publisher.ts.
 */
async function encodeClipLongForm(inputPath: string, durationSec: number, outputPath: string): Promise<void> {
  await runCmd("ffmpeg", [
    "-y", "-ss", "0", "-i", inputPath, "-t", String(durationSec),
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1",
    "-crf", "23", "-preset", "fast", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-pix_fmt", "yuv420p", "-threads", "2", outputPath,
  ]);
}

/**
 * Encode a clip as a vertical Short (9:16 / 1080x1920).
 */
async function encodeClipShort(inputPath: string, durationSec: number, outputPath: string): Promise<void> {
  await runCmd("ffmpeg", [
    "-y", "-ss", "0", "-i", inputPath, "-t", String(durationSec),
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1",
    "-crf", "23", "-preset", "fast", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-pix_fmt", "yuv420p", "-threads", "2", outputPath,
  ]);
}

// ── Core extraction ───────────────────────────────────────────────────────────

/**
 * Extract a clip from a plan and upload it to YouTube.
 *
 * Steps:
 * 1. Validate duration bounds
 * 2. Disk space gate
 * 3. Download segment (yt-dlp) or use local file
 * 4. Encode (ffmpeg)
 * 5. Upload to YouTube
 * 6. Update job status
 */
export async function extractClipFromPlan(job: ClipExtractionJob, userId: string): Promise<void> {
  // 1. Validate bounds
  if (job.startTimeSec >= job.endTimeSec) {
    throw new Error(`Invalid segment bounds: startTimeSec (${job.startTimeSec}) must be < endTimeSec (${job.endTimeSec})`);
  }
  const durationSec = job.endTimeSec - job.startTimeSec;
  if (durationSec < MIN_DURATION_SEC) {
    throw new Error(`Segment too short (${durationSec}s)`);
  }
  if (durationSec > MAX_DURATION_SEC) {
    throw new Error(`Segment too long (${Math.round(durationSec / 60)}m — max 60m)`);
  }

  // 2. Disk space gate
  const freeGb = await getFreeGb();
  if (freeGb < MIN_DISK_GB_FOR_EXTRACTION) {
    throw new Error(`Insufficient disk space (${freeGb.toFixed(1)} GB free, need ${MIN_DISK_GB_FOR_EXTRACTION} GB)`);
  }

  // 3. Memory gate — don't spawn yt-dlp / ffmpeg into an OOM situation
  const mem = getContainerMemory();
  if (mem.freeBytes < 150 * 1024 * 1024) {
    throw new Error(`Low container memory (${Math.round(mem.freeBytes / 1024 / 1024)} MB free) — deferring extraction`);
  }

  const runId = `cej_${job.id}_${Date.now()}`;
  const tmpRaw = path.join(VAULT_TEMP_DIR, `raw_${runId}.mp4`);
  const tmpEnc = path.join(VAULT_TEMP_DIR, `enc_${runId}.mp4`);

  try {
    // Mark job as downloading
    await db.update(clipExtractionJobs)
      .set({ status: "downloading", startedAt: new Date() })
      .where(eq(clipExtractionJobs.id, job.id));

    const sourceId = job.sourceVideoId;
    const isLocal = sourceId.startsWith("local:") || sourceId.startsWith("/") || fs.existsSync(sourceId);

    if (isLocal) {
      // Skip yt-dlp — use the local file directly
      const localPath = sourceId.startsWith("local:") ? sourceId.slice(6) : sourceId;
      if (!fs.existsSync(localPath)) {
        throw new Error(`Local source file not found: ${localPath}`);
      }
      // Copy so our encode step can use tmpRaw path uniformly
      fs.copyFileSync(localPath, tmpRaw);
      logger.info(`[ClipExtraction] Using local file for job ${job.id}: ${localPath}`);
    } else {
      // Download segment from YouTube
      logger.info(`[ClipExtraction] Downloading segment for job ${job.id} (ytId=${sourceId}, ${job.startTimeSec}-${job.endTimeSec}s, ${freeGb.toFixed(1)}GB free)`);
      await acquireIOSlot("clip-extraction-worker");
      try {
        await downloadSegment(sourceId, job.startTimeSec, job.endTimeSec, tmpRaw);
      } finally {
        releaseIOSlot("clip-extraction-worker");
      }
      if (!fs.existsSync(tmpRaw)) {
        throw new Error("yt-dlp produced no output file");
      }
    }

    // 4. Encode
    await db.update(clipExtractionJobs)
      .set({ status: "encoding" })
      .where(eq(clipExtractionJobs.id, job.id));

    logger.info(`[ClipExtraction] Encoding job ${job.id} as ${job.format}`);
    if (job.format === "shorts") {
      await encodeClipShort(tmpRaw, durationSec, tmpEnc);
    } else {
      await encodeClipLongForm(tmpRaw, durationSec, tmpEnc);
    }
    if (!fs.existsSync(tmpEnc)) {
      throw new Error("ffmpeg produced no output file");
    }

    // Clean up raw download immediately to free disk
    try { fs.unlinkSync(tmpRaw); } catch { /* non-fatal */ }

    // 5. Upload to YouTube
    const ytChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
    const ytChannel = ytChannels.find((c: any) => c.accessToken) || ytChannels[0];
    if (!ytChannel) {
      throw new Error("No YouTube channel connected — cannot upload extracted clip");
    }

    const title = (job.suggestedTitle || `${job.gameTitle || "Gaming"} Gameplay`).substring(0, 100);
    const tags = job.suggestedTags ?? [];
    const isShort = job.format === "shorts";
    const description = `${title}\n\nPS5 no-commentary gameplay.\n\n${isShort ? "#Shorts " : ""}#PS5 #NoCommentary #${(job.gameTitle || "Gaming").replace(/\s+/g, "")} #Gaming`.substring(0, 5000);

    logger.info(`[ClipExtraction] Uploading job ${job.id} to YouTube (title="${title.substring(0, 50)}")`);
    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title,
      description,
      tags: [...tags.slice(0, 15), "Gaming", "PS5", "NoCommentary", job.gameTitle || "Gaming"].filter(Boolean),
      categoryId: "20",
      privacyStatus: "public",
      videoFilePath: tmpEnc,
      enableMonetization: true,
    });

    if (!uploadResult?.youtubeId) {
      throw new Error("YouTube upload returned no video ID");
    }

    // 6. Update job as complete
    await db.update(clipExtractionJobs)
      .set({
        status: "complete",
        outputPath: tmpEnc,
        youtubeVideoId: uploadResult.youtubeId,
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(clipExtractionJobs.id, job.id));

    logger.info(`[ClipExtraction] Job ${job.id} complete — ytId=${uploadResult.youtubeId}`);

    // Link back to autopilot queue item if present
    if (job.autopilotQueueId) {
      await db.update(autopilotQueue)
        .set({
          status: "published",
          publishedAt: new Date(),
          metadata: {
            youtubeVideoId: uploadResult.youtubeId,
            clipExtractionJobId: job.id,
            publishedAt: new Date().toISOString(),
          } as any,
        })
        .where(eq(autopilotQueue.id, job.autopilotQueueId))
        .catch((err: any) => logger.warn(`[ClipExtraction] Failed to update queue item ${job.autopilotQueueId}: ${err?.message?.slice(0, 100)}`));
    }

  } finally {
    // Always clean up temp files (even in production — these are temp work files)
    try { if (fs.existsSync(tmpRaw)) fs.unlinkSync(tmpRaw); } catch { /* non-fatal */ }
    try { if (fs.existsSync(tmpEnc)) fs.unlinkSync(tmpEnc); } catch { /* non-fatal */ }
  }
}

// ── Per-user processing ───────────────────────────────────────────────────────

/**
 * Process up to MAX_CONCURRENT_PER_USER pending extraction jobs for a user.
 * Handles retries (up to 3 attempts) and marks exhausted jobs as failed.
 */
export async function processPendingExtractions(userId: string): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  // Get pending jobs — fetch a larger batch to allow strategy-based reordering,
  // then slice to MAX_CONCURRENT_PER_USER after sorting.
  const jobs = await db.select()
    .from(clipExtractionJobs)
    .where(and(
      eq(clipExtractionJobs.userId, userId),
      eq(clipExtractionJobs.status, "pending"),
    ))
    .orderBy(desc(clipExtractionJobs.createdAt))
    .limit(MAX_CONCURRENT_PER_USER * 5);

  if (jobs.length === 0) return { processed: 0, failed: 0 };

  // Prioritize jobs whose gameTitle matches the strategy brain's top-weighted game.
  let topGame = "";
  try {
    const { getStrategyState } = await import("./strategy-brain");
    const strategy = await getStrategyState(userId);
    const weights = strategy.gameWeights ?? {};
    topGame = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  } catch { /* use original order */ }

  if (topGame) {
    jobs.sort((a, b) => {
      const aMatch = (a.gameTitle ?? "").toLowerCase().includes(topGame.toLowerCase()) ? -1 : 0;
      const bMatch = (b.gameTitle ?? "").toLowerCase().includes(topGame.toLowerCase()) ? -1 : 0;
      return aMatch - bMatch;
    });
  }

  const pendingJobs = jobs.slice(0, MAX_CONCURRENT_PER_USER);

  for (const job of pendingJobs) {
    try {
      await extractClipFromPlan(job, userId);
      processed++;
    } catch (err: any) {
      const errMsg = err?.message?.slice(0, 500) ?? "unknown error";
      logger.warn(`[ClipExtraction] Job ${job.id} failed (attempt ${job.retryCount + 1}): ${errMsg}`);

      const newRetryCount = (job.retryCount ?? 0) + 1;
      if (newRetryCount < 3) {
        // Reset to pending so next cycle retries
        await db.update(clipExtractionJobs)
          .set({
            status: "pending",
            retryCount: newRetryCount,
            errorMessage: errMsg,
          })
          .where(eq(clipExtractionJobs.id, job.id))
          .catch(() => {});
      } else {
        // Exhausted retries — mark as failed
        await db.update(clipExtractionJobs)
          .set({
            status: "failed",
            retryCount: newRetryCount,
            errorMessage: errMsg,
            completedAt: new Date(),
          })
          .where(eq(clipExtractionJobs.id, job.id))
          .catch(() => {});
        failed++;
      }
    }
  }

  return { processed, failed };
}

// ── Queue bridge ──────────────────────────────────────────────────────────────

/**
 * Create a clipExtractionJob row from an autopilotQueue item that carries
 * clip metadata in its `metadata` JSON field.
 *
 * Expected metadata fields (set by daily-content-engine):
 *   sourceYoutubeId | sourceVideoId  — YouTube video ID or local path
 *   segmentStartMin | segmentStartSec — start time (minutes or seconds)
 *   segmentEndMin | segmentEndSec   — end time
 *   contentType                     — "youtube-short" → format=shorts, else long_form
 *   tags                            — string[]
 *   gameName                        — game title
 */
export async function createExtractionJobFromQueueItem(
  queueItem: any,
  userId: string,
): Promise<ClipExtractionJob | null> {
  const meta = (queueItem.metadata ?? {}) as Record<string, unknown>;

  // Resolve source video ID
  const sourceId = (meta.sourceYoutubeId as string)
    || (meta.sourceVideoId as string)
    || (meta.ytVideoId as string)
    || "";
  if (!sourceId) {
    logger.debug(`[ClipExtraction] Queue item ${queueItem.id} has no sourceVideoId — skipping`);
    return null;
  }

  // Resolve time bounds — prefer seconds, fall back to minutes
  let startSec: number;
  let endSec: number;
  if (meta.segmentStartSec !== undefined) {
    startSec = Number(meta.segmentStartSec);
    endSec = Number(meta.segmentEndSec ?? meta.segmentStartSec);
  } else {
    startSec = Number(meta.segmentStartMin ?? 0) * 60;
    endSec = Number(meta.segmentEndMin ?? meta.segmentStartMin ?? 0) * 60;
  }

  if (startSec >= endSec || endSec - startSec < MIN_DURATION_SEC) {
    logger.debug(`[ClipExtraction] Queue item ${queueItem.id} has invalid bounds (${startSec}-${endSec}s) — skipping`);
    return null;
  }

  const format = (meta.contentType === "youtube-short" || meta.style === "short-clip")
    ? "shorts"
    : "long_form";

  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const gameTitle = (meta.gameName as string) || (meta.gameTitle as string) || null;
  const suggestedTitle = (queueItem.caption as string) || (meta.title as string) || null;

  const insertData: InsertClipExtractionJob = {
    userId,
    sourceVideoId: sourceId,
    startTimeSec: startSec,
    endTimeSec: endSec,
    format,
    suggestedTitle,
    suggestedTags: tags,
    gameTitle,
    status: "pending",
    autopilotQueueId: queueItem.id,
    metadata: {
      queueItemId:    queueItem.id,
      batchNumber:    meta.batchNumber ?? null,
      sourceStreamId: meta.sourceStreamId ?? null,
    },
  };

  const [created] = await db.insert(clipExtractionJobs).values(insertData).returning();
  logger.info(`[ClipExtraction] Created job ${created.id} from queue item ${queueItem.id} (${format}, ${Math.round((endSec - startSec) / 60)}m)`);
  return created;
}

// ── Service loop ──────────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startClipExtractionWorker(): void {
  if (_stopFn) {
    logger.warn("[ClipExtraction] Worker already running — ignoring duplicate start");
    return;
  }

  logger.info("[ClipExtractionWorker] Starting (10-min jittered interval)");

  _stopFn = setJitteredInterval(async () => {
    try {
      // Global disk gate — skip entire cycle if disk is critically low
      const globalFreeGb = await getFreeGb();
      if (globalFreeGb < MIN_DISK_GB_GLOBAL) {
        logger.warn(`[ClipExtractionWorker] Disk critically low (${globalFreeGb.toFixed(1)} GB) — skipping cycle`);
        return;
      }

      // Find all users with pending extraction jobs
      const pendingRows = await db.selectDistinct({ userId: clipExtractionJobs.userId })
        .from(clipExtractionJobs)
        .where(eq(clipExtractionJobs.status, "pending"));

      if (pendingRows.length === 0) return;

      let totalProcessed = 0;
      let totalFailed = 0;
      for (const { userId } of pendingRows) {
        const result = await processPendingExtractions(userId);
        totalProcessed += result.processed;
        totalFailed += result.failed;
      }

      if (totalProcessed + totalFailed > 0) {
        logger.info(`[ClipExtractionWorker] Cycle complete — processed=${totalProcessed} failed=${totalFailed}`);
      }
    } catch (err: any) {
      logger.warn(`[ClipExtractionWorker] Cycle error: ${err?.message?.slice(0, 200)}`);
    }
  }, 10 * 60_000); // 10-minute base interval with ±20% jitter
}

export function stopClipExtractionWorker(): void {
  if (_stopFn) {
    _stopFn();
    _stopFn = null;
    logger.info("[ClipExtractionWorker] Stopped");
  }
}
