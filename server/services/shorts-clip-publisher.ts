/**
 * shorts-clip-publisher.ts
 *
 * Autonomous YouTube Shorts publisher. Runs every 30 minutes and processes
 * autopilot_queue items with type "youtube_short". Each item carries a source
 * video reference plus startTimeSec / endTimeSec from the VOD-shorts-loop's
 * AI viral-moment extraction.
 *
 * Strategy (in preference order):
 *  1. If the source video has a downloaded vault file → extract the segment
 *     directly with FFmpeg (fast, zero network cost, no bot-detection risk).
 *  2. Otherwise → download only the required time-slice from YouTube via
 *     yt-dlp --download-sections (much faster + lighter than full download).
 *
 * After encoding the segment to 1080 × 1920 vertical (9:16) it uploads the
 * clip to the user's YouTube channel as a new Shorts-eligible video.
 *
 * Hard limits per run:
 *  • MAX_PER_RUN = 2  — never upload more than 2 Shorts in a single 30-min
 *    window so we stay well within the 4-per-day platform budget.
 *  • Minimum 90-minute gap between uploads (enforced by upload-scheduler).
 */

import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import cron from "node-cron";
import { db } from "../db";
import { autopilotQueue, videos, channels, contentVaultBackups } from "@shared/schema";
import { eq, and, lte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube } from "../youtube";
import { canPostToPlatformToday } from "./platform-budget-tracker";
import { getYtdlpBin } from "../lib/dependency-check";
import { recordHeartbeat } from "./engine-heartbeat";

const logger = createLogger("shorts-clip-publisher");

const MAX_PER_RUN = 2;
const MAX_DURATION_SEC = 60;
const SHORT_TEMP_DIR = path.join(process.cwd(), "data", "shorts-tmp");

if (!fs.existsSync(SHORT_TEMP_DIR)) {
  fs.mkdirSync(SHORT_TEMP_DIR, { recursive: true });
}

let isRunning = false;

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(errBufs).toString("utf8").slice(-600)));
    });
    proc.on("error", reject);
  });
}

async function extractSegmentFromFile(
  sourcePath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  await runCmd("ffmpeg", [
    "-y",
    "-ss", String(startSec),
    "-i", sourcePath,
    "-t", String(durationSec),
    "-vf", [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      "setsar=1",
    ].join(","),
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-crf", "22",
    "-preset", "ultrafast",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-pix_fmt", "yuv420p",
    "-threads", "2",
    outputPath,
  ]);
}

async function downloadSegmentFromYouTube(
  youtubeId: string,
  startSec: number,
  endSec: number,
  outputPath: string,
): Promise<void> {
  const ytdlp = getYtdlpBin();
  const cookiesPath = path.join(process.cwd(), ".local", "yt-cookies.txt");
  const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;

  const sectionStr = `*${startSec}-${endSec}`;
  const args: string[] = [
    "--download-sections", sectionStr,
    "--force-keyframes-at-cuts",
    "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-playlist",
    "--quiet",
    "--no-warnings",
  ];

  if (hasCookies) {
    args.push("--cookies", cookiesPath);
  }

  args.push(`https://www.youtube.com/watch?v=${youtubeId}`);
  await runCmd(ytdlp, args);
}

async function buildShortTitle(originalTitle: string, hookLine: string | undefined): Promise<string> {
  const hook = hookLine ? hookLine.slice(0, 60) : "";
  const base = hook || originalTitle.slice(0, 60);
  return `${base} #Shorts #Gaming`.slice(0, 100);
}

async function buildShortDescription(originalTitle: string, tags: string[]): Promise<string> {
  const tagStr = tags.slice(0, 5).map(t => `#${t.replace(/\s+/g, "")}`).join(" ");
  return `${originalTitle}\n\n${tagStr}\n\n#Shorts #Gaming #ETGaming`.slice(0, 1000);
}

export async function publishShortClip(
  queueItemId: number,
  userId: string,
  sourceVideoId: number,
  startTimeSec: number,
  endTimeSec: number,
  hookLine: string | undefined,
): Promise<{ success: boolean; youtubeId?: string; error?: string }> {
  const durationSec = Math.min(endTimeSec - startTimeSec, MAX_DURATION_SEC);
  if (durationSec < 3) {
    return { success: false, error: "Clip duration too short (< 3 s)" };
  }

  // Resolve YouTube channel for this user
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), inArray(channels.platform, ["youtube", "youtubeshorts"])));
  const ytChannel = userChannels.find(c => c.platform === "youtube") || userChannels[0];
  if (!ytChannel) {
    return { success: false, error: "No YouTube channel found" };
  }

  // Get source video metadata
  const [srcVideo] = await db.select().from(videos).where(eq(videos.id, sourceVideoId)).limit(1);
  if (!srcVideo) {
    return { success: false, error: "Source video not found" };
  }

  const meta = (srcVideo.metadata ?? {}) as Record<string, unknown>;
  const youtubeVideoId = (meta.youtubeId as string | undefined) || (meta.youtube_id as string | undefined);
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];

  const tmpRaw = path.join(SHORT_TEMP_DIR, `raw_${queueItemId}_${Date.now()}.mp4`);
  const tmpEncoded = path.join(SHORT_TEMP_DIR, `enc_${queueItemId}_${Date.now()}.mp4`);

  try {
    // Step 1: Obtain the raw segment
    let rawSourcePath: string | null = null;

    // Prefer a downloaded vault file — fastest and no bot-detection risk
    if (youtubeVideoId) {
      const [vaultEntry] = await db.select()
        .from(contentVaultBackups)
        .where(and(
          eq(contentVaultBackups.userId, userId),
          eq(contentVaultBackups.youtubeId, youtubeVideoId),
          eq(contentVaultBackups.status, "downloaded"),
        ))
        .limit(1);

      if (vaultEntry?.filePath && fs.existsSync(vaultEntry.filePath)) {
        rawSourcePath = vaultEntry.filePath;
        logger.info("Using vault file for segment extraction", { youtubeVideoId, vaultEntryId: vaultEntry.id });
      }
    }

    if (rawSourcePath) {
      // Extract directly from vault file
      await extractSegmentFromFile(rawSourcePath, startTimeSec, durationSec, tmpEncoded);
    } else if (youtubeVideoId) {
      // Download just the needed slice from YouTube then encode vertically
      await downloadSegmentFromYouTube(youtubeVideoId, startTimeSec, endTimeSec, tmpRaw);
      if (!fs.existsSync(tmpRaw)) throw new Error("yt-dlp produced no output file");
      await extractSegmentFromFile(tmpRaw, 0, durationSec, tmpEncoded);
    } else {
      return { success: false, error: "No vault file and no YouTube ID available" };
    }

    if (!fs.existsSync(tmpEncoded)) {
      throw new Error("FFmpeg produced no encoded output");
    }

    // Step 2: Build metadata
    const shortTitle = await buildShortTitle(srcVideo.title, hookLine);
    const shortDescription = await buildShortDescription(srcVideo.title, tags);

    // Step 3: Upload to YouTube
    const uploadResult = await uploadVideoToYouTube(ytChannel.id, {
      title: shortTitle,
      description: shortDescription,
      tags: [...tags.slice(0, 15), "Shorts", "Gaming"],
      categoryId: "20",
      privacyStatus: "public",
      videoFilePath: tmpEncoded,
      enableMonetization: true,
    });

    if (!uploadResult?.youtubeId) {
      return { success: false, error: "Upload returned no YouTube video ID" };
    }

    logger.info("YouTube Short uploaded", { queueItemId, youtubeId: uploadResult.youtubeId, title: shortTitle });
    return { success: true, youtubeId: uploadResult.youtubeId };
  } finally {
    for (const f of [tmpRaw, tmpEncoded]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

export async function runShortsClipPublisher(): Promise<{ published: number; failed: number; skipped: number }> {
  if (isRunning) {
    logger.debug("Publisher already running — skipping cycle");
    return { published: 0, failed: 0, skipped: 1 };
  }
  isRunning = true;

  let published = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const now = new Date();

    // Fetch due items — scheduled time has passed, status is still "scheduled"
    const dueItems = await db.select().from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.type, "youtube_short"),
        eq(autopilotQueue.status, "scheduled"),
        lte(autopilotQueue.scheduledAt, now),
      ))
      .orderBy(autopilotQueue.scheduledAt)
      .limit(MAX_PER_RUN * 3);

    if (dueItems.length === 0) return { published: 0, failed: 0, skipped: 0 };

    for (const item of dueItems) {
      if (published >= MAX_PER_RUN) break;

      // Check per-user platform budget
      const userId = item.userId;
      const budget = await canPostToPlatformToday(userId, "youtubeshorts");
      if (!budget.allowed) {
        logger.info("Daily Shorts budget exhausted for user — skipping", { userId });
        skipped++;
        continue;
      }

      const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
      const startTimeSec = Number(itemMeta.startSec ?? 0);
      const endTimeSec = Number(itemMeta.endSec ?? 60);
      const hookLine = typeof itemMeta.hookLine === "string" ? itemMeta.hookLine : undefined;

      if (!item.sourceVideoId) {
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "No sourceVideoId" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

      // Mark as processing immediately to prevent double-pick-up
      await db.update(autopilotQueue)
        .set({ status: "processing" })
        .where(eq(autopilotQueue.id, item.id));

      const result = await publishShortClip(
        item.id,
        userId,
        item.sourceVideoId,
        startTimeSec,
        endTimeSec,
        hookLine,
      ).catch((err: unknown) => ({
        success: false,
        error: (err as Error)?.message?.slice(0, 300) ?? "unknown error",
      }));

      if (result.success) {
        const shortId = (result as { success: boolean; youtubeId?: string }).youtubeId;
        await db.update(autopilotQueue)
          .set({
            status: "published",
            publishedAt: new Date(),
            metadata: { ...itemMeta, youtubeVideoId: shortId },
          })
          .where(eq(autopilotQueue.id, item.id));
        published++;
      } else {
        logger.warn("Short clip publish failed", { queueItemId: item.id, error: result.error });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: result.error })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
      }
    }
  } finally {
    isRunning = false;
  }

  if (published > 0) {
    await recordHeartbeat("shortsClipPublisher", "completed").catch(() => {});
  }

  logger.info("Shorts publisher cycle complete", { published, failed, skipped });
  return { published, failed, skipped };
}

export function initShortsClipPublisher(): void {
  // Run every 30 minutes at :05 and :35 past the hour
  cron.schedule("5,35 * * * *", async () => {
    try {
      await runShortsClipPublisher();
    } catch (err: any) {
      logger.error("Shorts publisher cron error", { error: err?.message?.slice(0, 200) });
    }
  });

  // Warm-up run after 12-minute delay so YouTube tokens are verified first
  setTimeout(() => {
    runShortsClipPublisher().catch((err: unknown) =>
      logger.warn("Shorts publisher warm-up error", { error: (err as Error)?.message })
    );
  }, 12 * 60_000);

  logger.info("Shorts Clip Publisher initialised — cron every 30 min at :05 and :35");
}
