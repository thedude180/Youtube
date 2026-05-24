/**
 * shorts-clip-publisher.ts
 *
 * Autonomous multi-platform Shorts publisher. Runs every 30 minutes and
 * processes autopilot_queue items of three types:
 *
 *   • "platform_short"      — video clip upload (YouTube Shorts, TikTok)
 *   • "platform_text_short" — platform-tailored text post + original video link
 *                             (Twitter/X, Discord, Kick, Instagram)
 *   • "youtube_short"       — legacy alias for YouTube Shorts (backward compat)
 *
 * Video extraction strategy (preference order):
 *   1. Downloaded vault file → ffmpeg segment extract (fast, zero network cost)
 *   2. yt-dlp --download-sections from YouTube URL (targeted, light download)
 *
 * Caption strategy:
 *   AI generates platform-native captions tailored to each platform's voice.
 *   Every caption includes a cross-link to the original full YouTube video so
 *   audiences can discover the full VOD from any platform.
 *
 * Upload strategy:
 *   Batch-upload all items scheduled within the next 14 days to YouTube NOW,
 *   passing each item's scheduledAt as YouTube's publishAt so YouTube's own
 *   scheduler publishes them at the right spaced time.  This lets the channel
 *   batch-prepare a full fortnight of content in one session while keeping
 *   the feed evenly spaced (6 h between Shorts, 48 h between long-form).
 *
 *   MAX_PER_RUN = 20  — capped by YouTube API quota, not by artificial limit.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import cron from "node-cron";
import { db } from "../db";
import { autopilotQueue, videos, channels, contentVaultBackups } from "@shared/schema";
import { eq, and, lte, inArray, or, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube } from "../youtube";
import { getYtdlpBin } from "../lib/dependency-check";
import { recordHeartbeat } from "./engine-heartbeat";
import { getOpenAIClientBackground } from "../lib/openai";
import { MAX_SHORTS_PER_DAY, countUploadedShortsForDate, getNextShortPublishTime } from "./youtube-output-schedule";

const logger = createLogger("shorts-publisher");

const MAX_PER_RUN = 100; // quota is the real gate; 100 processes a deep queue in one pass
// How far ahead to look when picking up shadow-scheduled items for batch-upload to YouTube
const BATCH_WINDOW_DAYS = 365; // 365-day window — shadow schedule is unlimited; quota + MAX_PER_RUN cap actual uploads per night
const MAX_DURATION_SEC = 60;
const SHORT_TEMP_DIR = path.join(process.cwd(), "data", "shorts-tmp");

if (!fs.existsSync(SHORT_TEMP_DIR)) {
  fs.mkdirSync(SHORT_TEMP_DIR, { recursive: true });
}

let isRunning = false;

// ---------------------------------------------------------------------------
// FFmpeg / yt-dlp helpers
// ---------------------------------------------------------------------------

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const msg = Buffer.concat(errBufs).toString("utf8").slice(-600);
      const err = new Error(msg) as Error & { exitCode?: number };
      err.exitCode = code ?? -1;
      reject(err);
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
      "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos",
      "crop=2160:3840",
      "pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black",
      "setsar=1",
    ].join(","),
    "-af", "loudnorm=I=-14:TP=-1.0:LRA=7:linear=true",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "5.1",
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
  const baseArgs = (formatStr: string): string[] => {
    const args: string[] = [
      "--download-sections", sectionStr,
      "--force-keyframes-at-cuts",
      "-f", formatStr,
      "--merge-output-format", "mp4",
      "-o", outputPath,
      "--no-playlist",
      "--quiet",
      "--no-warnings",
    ];
    if (hasCookies) args.push("--cookies", cookiesPath);
    args.push(`https://www.youtube.com/watch?v=${youtubeId}`);
    return args;
  };

  // Format fallback chain: preferred → standard → last-resort
  const formats = [
    "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "best[height<=1080]/best[height<=720]/best",
  ];

  let lastErr: Error | null = null;
  for (const fmt of formats) {
    try {
      // Remove stale output from a failed previous attempt before retrying
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      await runCmd(ytdlp, baseArgs(fmt));
      return;
    } catch (err: any) {
      lastErr = err;
      const msg: string = err?.message || String(err);
      // "Requested format is not available" — try next format
      // Other errors (network, DRM) — propagate immediately
      if (!msg.includes("Requested format is not available") && !msg.includes("not available")) {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error(`All format fallbacks failed for ${youtubeId}`);
}

// ---------------------------------------------------------------------------
// AI caption generation — platform-native, cross-linked to original video
// ---------------------------------------------------------------------------

const PLATFORM_CAPTION_GUIDE: Record<string, string> = {
  youtube: "YouTube Shorts: write a punchy, curiosity-driven title that hooks viewers in the first 3 words. Include #Shorts + 2-3 gaming hashtags. Keep under 100 chars.",
  youtubeshorts: "YouTube Shorts: write a punchy, curiosity-driven title that hooks viewers in the first 3 words. Include #Shorts + 2-3 gaming hashtags. Keep under 100 chars.",
};

async function generateShortCaption(opts: {
  platform: string;
  sourceTitle: string;
  hookLine?: string;
  sourceYoutubeId?: string;
  gameName?: string;
}): Promise<string> {
  const { platform, sourceTitle, hookLine, sourceYoutubeId, gameName } = opts;
  const isBF6 = /battlefield\s*6|bf\s*6/i.test(gameName ?? "") || /battlefield\s*6|bf\s*6/i.test(sourceTitle);

  // Fast fallback if AI is unavailable
  const fallback = buildFallbackCaption(platform, sourceTitle, hookLine);

  try {
    const openai = getOpenAIClientBackground();

    // The moment/hook line is the single most important input — it's what
    // actually happened in the clip.  Build the entire prompt around it.
    const momentContext = hookLine
      ? `The specific moment in this clip: "${hookLine.slice(0, 150)}"`
      : `Clip from: "${sourceTitle.slice(0, 120)}"`;

    const bf6Voice = isBF6 ? `
This is Battlefield 6 PS5 gameplay — no commentary, no facecam, no reaction, just raw match footage.
BF6-specific context: Conquest or Breakthrough matches. Infantry, armor, helicopters, jets.
Channel name: ETGaming247. No team — solo player. PS5 controller, no mods.` : "";

    const prompt = `You are writing a YouTube Shorts title for a real gaming clip on the ET Gaming 247 channel.
${bf6Voice}

${momentContext}
${gameName ? `Game: ${gameName}` : ""}

Rules — follow every single one:
1. Title must be 50–80 characters MAX. No exceptions.
2. Sound like a REAL gamer wrote it — casual, direct, no corporate language.
3. Start with the action or reaction — NOT with a hashtag, NOT with the channel name.
4. Forbidden words and phrases: "Ultimate", "Epic", "Amazing", "Incredible", "Watch more", "Full video", "Check out", "You won't believe", "Insane gameplay", "No Commentary Gaming", "raw footage", emojis in the title.
5. Hashtags go at the END only — max 3, all lowercase: #shorts #bf6 #ps5
6. Write about the specific moment — not generic "gameplay highlights".
7. Tone: dry, confident, like a player who's seen it all. No hype for its own sake.
8. If you don't have a specific moment, write a title from the perspective of the player in that situation — first-person implied ("Ran straight through their squad", "Took the flag before they even noticed").

Examples of GOOD titles:
- "Ran straight through their entire squad #shorts #bf6 #ps5"
- "They didn't see the back-cap coming #shorts #bf6"
- "Four in the open. Clean. #shorts #bf6 #ps5"
- "Chopper down, infantry clear, flag capped #shorts #bf6"

Examples of BAD titles (do NOT write these):
- "EPIC Battlefield 6 Gameplay Moments! #Shorts #Gaming"
- "Incredible No Commentary PS5 Gameplay | Watch More!"
- "You Won't Believe This BF6 Clip 😱 #shorts"

Respond with ONLY the title text. No JSON, no quotes, no explanation.`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 120,
    });

    const text = (res.choices[0].message.content || "").trim()
      // Strip surrounding quotes if the model adds them
      .replace(/^["']|["']$/g, "")
      .trim();

    if (text.length < 8 || text.length > 200) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

function buildFallbackCaption(
  _platform: string,
  title: string,
  hookLine: string | undefined,
): string {
  // Fallback titles also avoid template language — use the moment label directly
  // if available, otherwise clean up the source title.
  if (hookLine && hookLine.length >= 8) {
    const clean = hookLine.charAt(0).toUpperCase() + hookLine.slice(1);
    return `${clean.slice(0, 70)} #shorts #bf6 #ps5`;
  }
  // Strip generic suffixes from back-catalog titles before using as fallback
  const stripped = title
    .replace(/\s*\|.*$/, "")
    .replace(/\s*#.*$/, "")
    .replace(/\bno commentary\b/gi, "")
    .replace(/\bno facecam\b/gi, "")
    .replace(/\bPS5\b/gi, "")
    .trim();
  return `${stripped.slice(0, 70)} #shorts #bf6 #ps5`;
}

// ---------------------------------------------------------------------------
// Video extraction — vault-preferred, yt-dlp fallback
// ---------------------------------------------------------------------------

async function getEncodedSegment(opts: {
  userId: string;
  sourceVideoId: number | null | undefined;
  youtubeId: string | undefined;
  startSec: number;
  endSec: number;
  runId: string;
}): Promise<string | null> {
  const { userId, sourceVideoId, youtubeId, startSec, endSec, runId } = opts;
  const durationSec = Math.min(endSec - startSec, MAX_DURATION_SEC);
  if (durationSec < 3) return null;

  const tmpRaw = path.join(SHORT_TEMP_DIR, `raw_${runId}.mp4`);
  const tmpEncoded = path.join(SHORT_TEMP_DIR, `enc_${runId}.mp4`);

  let rawSourcePath: string | null = null;

  // Prefer downloaded vault file — only use it if the file is present and non-trivial
  // (corrupt/truncated vault files trigger ffmpeg exit code 8: invalid data in input)
  const MIN_VAULT_FILE_BYTES = 10 * 1024; // 10 KB
  if (youtubeId) {
    const [vaultEntry] = await db.select()
      .from(contentVaultBackups)
      .where(and(
        eq(contentVaultBackups.userId, userId),
        eq(contentVaultBackups.youtubeId, youtubeId),
        eq(contentVaultBackups.status, "downloaded"),
      ))
      .limit(1);

    if (vaultEntry?.filePath && fs.existsSync(vaultEntry.filePath)) {
      const stat = fs.statSync(vaultEntry.filePath);
      if (stat.size >= MIN_VAULT_FILE_BYTES) {
        rawSourcePath = vaultEntry.filePath;
      } else {
        logger.warn(`[ShortsPublisher] Vault file too small (${stat.size}B) for ${youtubeId} — skipping vault, will download`);
      }
    }
  }

  try {
    if (rawSourcePath) {
      try {
        await extractSegmentFromFile(rawSourcePath, startSec, durationSec, tmpEncoded);
      } catch (vaultErr: any) {
        // exit code 8 = invalid data in input — vault file is corrupt or not a valid video
        if (vaultErr?.exitCode === 8) {
          logger.warn(`[ShortsPublisher] Vault file corrupt for ${youtubeId} (ffmpeg exit 8) — falling back to yt-dlp download`);
          rawSourcePath = null; // fall through to yt-dlp branch below
        } else {
          throw vaultErr;
        }
      }
    }

    if (!rawSourcePath && !fs.existsSync(tmpEncoded)) {
      // Either no vault file was found, or vault was corrupt and we cleared rawSourcePath above
      if (!youtubeId) return null;
      await downloadSegmentFromYouTube(youtubeId, startSec, endSec, tmpRaw);
      if (!fs.existsSync(tmpRaw)) throw new Error("yt-dlp produced no output");
      await extractSegmentFromFile(tmpRaw, 0, durationSec, tmpEncoded);
    }

    if (!fs.existsSync(tmpEncoded)) throw new Error("FFmpeg produced no output");
    return tmpEncoded;
  } finally {
    if (fs.existsSync(tmpRaw)) fs.unlinkSync(tmpRaw);
  }
}

// ---------------------------------------------------------------------------
// Per-platform publish helpers
// ---------------------------------------------------------------------------

async function uploadToYouTube(opts: {
  channelId: number;
  title: string;
  description: string;
  tags: string[];
  videoFilePath: string;
  scheduledStartTime?: string;
}): Promise<{ success: boolean; youtubeId?: string; error?: string }> {
  try {
    const result = await uploadVideoToYouTube(opts.channelId, {
      title: opts.title.slice(0, 100),
      description: opts.description.slice(0, 5000),
      tags: [...opts.tags.slice(0, 15), "Shorts", "Gaming"],
      categoryId: "20",
      // YouTube requires privacyStatus=private for scheduled future uploads.
      // Immediate uploads (no scheduledStartTime or time is past) use public.
      privacyStatus: (opts.scheduledStartTime && new Date(opts.scheduledStartTime).getTime() > Date.now() + 60_000)
        ? "private"
        : "public",
      scheduledStartTime: opts.scheduledStartTime,
      videoFilePath: opts.videoFilePath,
      enableMonetization: true,
    });
    if (!result?.youtubeId) return { success: false, error: "Upload returned no YouTube ID" };
    return { success: true, youtubeId: result.youtubeId };
  } catch (err: any) {
    return { success: false, error: err?.message?.slice(0, 300) ?? "unknown error" };
  }
}


// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------

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
    // Batch window: pick up everything scheduled within the next 14 days so we
    // can upload them all to YouTube NOW with publishAt set → YouTube publishes
    // each one at its spaced time automatically.
    const batchWindow = new Date(now.getTime() + BATCH_WINDOW_DAYS * 86400_000);

    const dueItems = await db.select().from(autopilotQueue)
      .where(and(
        // youtube_short / platform_short / platform_text_short — legacy types
        // vod-short — created by vod-continuous-engine with clipId + startSec/endSec
        // auto-clip with contentType='youtube-short' — back-catalog engine Shorts
        or(
          inArray(autopilotQueue.type, ["youtube_short", "platform_short", "platform_text_short", "vod-short"]),
          and(
            eq(autopilotQueue.type, "auto-clip"),
            sql`${autopilotQueue.metadata}->>'contentType' = 'youtube-short'`,
          ),
        ),
        eq(autopilotQueue.status, "scheduled"),
        lte(autopilotQueue.scheduledAt, batchWindow),
      ))
      // Live stream highlights and stream replays always upload before back-catalog items.
      // YouTube then publishes each at its pre-assigned publishAt time — upload order
      // only determines which items get processed first within the quota budget.
      .orderBy(
        sql`CASE
          WHEN metadata->>'isStreamHighlight' = 'true'
            OR metadata->>'isStreamReplay'   = 'true'
            OR metadata->>'copilotGenerated' = 'true'
          THEN 0 ELSE 1 END`,
        autopilotQueue.scheduledAt,
      )
      .limit(MAX_PER_RUN * 4);

    if (dueItems.length === 0) return { published: 0, failed: 0, skipped: 0 };

    // Check YouTube API quota once before the loop — stop the entire batch if tripped
    const { isQuotaBreakerTripped, canAffordOperation } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn("YouTube quota breaker active — skipping shorts batch");
      return { published: 0, failed: 0, skipped: dueItems.length };
    }

    for (const item of dueItems) {
      if (published >= MAX_PER_RUN) break;

      // Per-upload budget check — stops the batch the moment remaining quota
      // can no longer cover another upload (1,600 units + 200 safety buffer).
      // This lets each batch run use as much of the daily 10k as possible
      // without tipping the breaker, building one more day ahead each cycle.
      if (!await canAffordOperation(item.userId, "upload")) {
        logger.info(`[ShortsPublisher] Upload budget at ceiling — stopping batch (${published} uploaded this run)`);
        break;
      }

      const userId = item.userId;
      const platform = item.targetPlatform;

      // YouTube-only: skip any non-YouTube items that may exist in the queue
      if (platform !== "youtube" && platform !== "youtubeshorts") {
        logger.warn("[ShortsPublisher] Skipping non-YouTube queue item", { platform, itemId: item.id });
        await db.update(autopilotQueue)
          .set({ status: "skipped", errorMessage: "YouTube-only mode: non-YouTube platform" })
          .where(eq(autopilotQueue.id, item.id));
        skipped++;
        continue;
      }

      // ── Reschedule past-due items ─────────────────────────────────────────
      // Items that accumulated while the quota breaker was tripped carry a
      // scheduledAt in the past.  Uploading them as-is causes a burst right
      // at midnight (all publish immediately as public).  Instead, bump each
      // one to the next valid future slot so YouTube spaces the releases
      // properly across the day.
      let effectiveScheduledAt: Date | null = item.scheduledAt ? new Date(item.scheduledAt) : null;
      if (!effectiveScheduledAt || effectiveScheduledAt.getTime() <= Date.now() + 60_000) {
        try {
          const newSlot = await getNextShortPublishTime(item.userId);
          await db.update(autopilotQueue)
            .set({ scheduledAt: newSlot })
            .where(eq(autopilotQueue.id, item.id));
          effectiveScheduledAt = newSlot;
          logger.info(`[ShortsPublisher] Past-due item ${item.id} rescheduled to ${newSlot.toISOString()}`);
        } catch (err: any) {
          logger.warn(`[ShortsPublisher] Reschedule failed for item ${item.id}: ${err.message?.slice(0, 100)} — skipping to avoid burst`);
          skipped++;
          continue;
        }
      }

      // Daily cap safety net — max MAX_SHORTS_PER_DAY Shorts per local calendar day.
      // Uses effectiveScheduledAt (the possibly-rescheduled future slot) so the
      // cap check always targets the correct upcoming date, not a stale past date.
      const shortsAlreadyDone = await countUploadedShortsForDate(
        userId,
        effectiveScheduledAt!, // guaranteed non-null: null path above always hits `continue`
      );
      if (shortsAlreadyDone >= MAX_SHORTS_PER_DAY) {
        logger.info(`[YouTubeSchedule] Shorts daily cap (${MAX_SHORTS_PER_DAY}/day) reached for scheduled date — deferring item ${item.id}`);
        skipped++;
        continue;
      }

      const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
      // back-catalog auto-clip Shorts store segment bounds as segmentStartSec/segmentEndSec;
      // content-grinder Shorts use startSec/endSec.  Fall back gracefully for either shape.
      const startSec = Number(itemMeta.startSec ?? itemMeta.segmentStartSec ?? 0);
      const endSec   = Number(itemMeta.endSec   ?? itemMeta.segmentEndSec   ?? 60);
      const clipId = typeof itemMeta.clipId === "number" ? itemMeta.clipId : undefined;
      const sourceYoutubeId = typeof itemMeta.sourceYoutubeId === "string" ? itemMeta.sourceYoutubeId : undefined;
      const hookLine = typeof itemMeta.hookLine === "string" ? itemMeta.hookLine : undefined;

      // Back-catalog Shorts have sourceVideoId=null but carry sourceYoutubeId in
      // metadata — getEncodedSegment yt-dlp downloads directly from that URL.
      // Only hard-fail if BOTH are absent.
      if (!item.sourceVideoId && !sourceYoutubeId) {
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "No sourceVideoId and no sourceYoutubeId in metadata" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

      // Mark processing immediately to prevent double pick-up
      await db.update(autopilotQueue)
        .set({ status: "processing" })
        .where(eq(autopilotQueue.id, item.id));

      // Get source video metadata for caption generation
      const [srcVideo] = item.sourceVideoId != null
        ? await db.select().from(videos).where(eq(videos.id, item.sourceVideoId)).limit(1)
        : [];
      const srcMeta = (srcVideo?.metadata ?? {}) as Record<string, unknown>;
      const resolvedYoutubeId = sourceYoutubeId
        || (srcMeta.youtubeId as string | undefined)
        || (srcMeta.youtube_id as string | undefined);
      const gameName = typeof srcMeta.gameName === "string" ? srcMeta.gameName : undefined;
      const tags = Array.isArray(srcMeta.tags) ? (srcMeta.tags as string[]) : [];
      const sourceTitle = srcVideo?.title ?? (item.caption ?? "Gaming Clip");

      let result: { success: boolean; error?: string; postId?: string };

      {
        // ---- YouTube Shorts video clip upload ----
        const isYouTube = platform === "youtube" || platform === "youtubeshorts";

        if (isYouTube) {
          // YouTube Shorts: extract segment ourselves, upload via YouTube Data API
          const userChannels = await db.select().from(channels)
            .where(and(
              eq(channels.userId, userId),
              inArray(channels.platform, ["youtube", "youtubeshorts"]),
            ));
          const ytChannel = userChannels.find(c => c.platform === "youtube") || userChannels[0];

          if (!ytChannel) {
            result = { success: false, error: "No YouTube channel found" };
          } else {
            const runId = `${item.id}_${Date.now()}`;
            let encodedPath: string | null = null;

            // Fast path: pre-encoder already built this file ahead of time.
            // Skip download + encode entirely — just use the ready file.
            const preBuiltPath = typeof itemMeta.preEncodedPath === "string"
              ? (itemMeta.preEncodedPath as string) : null;
            if (preBuiltPath && fs.existsSync(preBuiltPath)) {
              encodedPath = preBuiltPath;
              logger.info(`[ShortsPublisher] Pre-encoded file ready for item ${item.id} — skipping download+encode`);
            }

            if (!encodedPath) {
              try {
                encodedPath = await getEncodedSegment({
                  userId,
                  sourceVideoId: item.sourceVideoId,
                  youtubeId: resolvedYoutubeId,
                  startSec,
                  endSec,
                  runId,
                });
              } catch (downloadErr: any) {
                const errMsg = String(downloadErr?.message ?? downloadErr);
                const isPermanent = /unavailable|removed by the uploader|not available|format is not available/i.test(errMsg);
                logger.warn(`[ShortsPublisher] Source video download failed — ${isPermanent ? "permanent" : "transient"}`, { itemId: item.id, youtubeId: resolvedYoutubeId, error: errMsg.slice(0, 200) });
                await db.update(autopilotQueue)
                  .set({ status: isPermanent ? "permanent_fail" : "failed", errorMessage: errMsg.slice(0, 500) })
                  .where(eq(autopilotQueue.id, item.id));
                failed++;
                continue;
              }
            }

            if (!encodedPath) {
              result = { success: false, error: "Could not extract video segment" };
            } else {
              try {
                // Use pre-generated SEO from pre-seo service (runs at 8 PM Pacific)
                // Fall back to on-demand AI generation if not yet available
                const titleCaption =
                  (typeof itemMeta.seoTitle === "string" && itemMeta.seoTitle.length > 5
                    ? itemMeta.seoTitle
                    : null)
                  ?? await generateShortCaption({
                    platform,
                    sourceTitle,
                    hookLine,
                    sourceYoutubeId: resolvedYoutubeId,
                    gameName,
                  });

                const ytDesc =
                  (typeof itemMeta.seoDescription === "string" && itemMeta.seoDescription.length > 5
                    ? itemMeta.seoDescription
                    : null)
                  ?? (resolvedYoutubeId
                    ? `${sourceTitle}\n\nFull video → https://youtu.be/${resolvedYoutubeId}\n\n#Shorts #Gaming #PS5 #ETGaming247`
                    : `${sourceTitle}\n\n#Shorts #Gaming #PS5`);

                const preBuiltTags = Array.isArray(itemMeta.seoTags) ? itemMeta.seoTags as string[] : null;

                const shortScheduledAt = effectiveScheduledAt;
                const shortIsScheduled = shortScheduledAt && shortScheduledAt.getTime() > Date.now() + 60_000;

                if (shortScheduledAt) {
                  logger.info(`[YouTubeSchedule] Short scheduled for ${shortScheduledAt.toISOString()}`, { itemId: item.id });
                }

                // Guarantee #Shorts in the final 100-char title regardless of AI output.
                // YouTube uses the title as its primary Short classification signal.
                // Check the TRUNCATED title — #Shorts may exist past position 93 in the
                // original and be silently dropped by the slice.
                const shortsTag = " #Shorts";
                const truncated = titleCaption.slice(0, 100);
                const safeTitle = /\#shorts/i.test(truncated)
                  ? truncated
                  : (titleCaption.slice(0, 100 - shortsTag.length) + shortsTag);

                result = await uploadToYouTube({
                  channelId: ytChannel.id,
                  title: safeTitle,
                  description: ytDesc.slice(0, 5000),
                  tags: preBuiltTags ?? [...tags.slice(0, 12), "Shorts", "Gaming", "PS5"],
                  videoFilePath: encodedPath,
                  // Pass the item's original scheduledAt so YouTube publishes it
                  // at the right spaced time rather than immediately.
                  scheduledStartTime: shortScheduledAt ? shortScheduledAt.toISOString() : undefined,
                });

                if (result.success) {
                  if (shortIsScheduled) {
                    logger.info(`[YouTubeSchedule] Short uploaded as private scheduled publish — publishAt ${shortScheduledAt!.toISOString()}`);
                  } else {
                    logger.info("[YouTubeSchedule] Short published immediately as public");
                  }
                  // NOTE: Do NOT upload a pre-generated thumbnailPath here.
                  // Pre-generated thumbnails are produced for the landscape source
                  // video (16:9) and must not be applied to portrait Shorts (9:16).
                  // YouTube auto-selects a frame from the encoded portrait video —
                  // that is the correct Short thumbnail.
                }
                logger.info("YouTube Short upload", { channelId: ytChannel.id, success: result.success, userId });
              } finally {
                if (fs.existsSync(encodedPath)) fs.unlinkSync(encodedPath);
              }
            }
          }
        } else {
          result = { success: false, error: `Unsupported platform: ${platform}` };
        }
      }

      // Persist result
      if (result.success) {
        await db.update(autopilotQueue)
          .set({
            status: "published",
            publishedAt: new Date(),
            metadata: {
              ...itemMeta,
              youtubeVideoId: (result as any).youtubeId,
              publishedPostId: result.postId,
            } as any,
          })
          .where(eq(autopilotQueue.id, item.id));
        published++;

        // Seed the metrics row immediately so the learning model has a record
        // even before YouTube processes analytics (which takes 24-48 h).
        // Analytics numbers are refreshed automatically by refreshStaleVideoMetrics.
        if ((result as any).youtubeId) {
          const publishedYtId = (result as any).youtubeId as string;
          const clipDurationSec = Math.max(1, endSec - startSec);
          const schedAt = effectiveScheduledAt ?? new Date();
          const h = schedAt.getUTCHours();
          const postingWindow = h >= 6 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "late_night";
          Promise.all([
            import("./youtube-performance-learner").then(({ recordVideoPerformance }) =>
              recordVideoPerformance(userId, publishedYtId, {
                contentType: "short",
                durationSec: clipDurationSec,
                gameName: gameName ?? undefined,
                postingWindow,
                sourceVideoId: item.sourceVideoId ?? undefined,
                publishedAt: new Date(),
              })
            ),
            import("./youtube-learning-brain").then(({ recordLearningEvent }) =>
              recordLearningEvent(userId, "short_published", {
                sourceAgent: "shorts-publisher",
                youtubeVideoId: publishedYtId,
                gameName: gameName ?? "Gaming",
                durationSec: clipDurationSec,
                postingWindow,
                scheduledAt: item.scheduledAt?.toISOString(),
              })
            ),
          ]).catch(() => {});
        }
      } else {
        logger.warn("Short publish failed", { queueItemId: item.id, platform, error: result.error });
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

  logger.info("Shorts Clip Publisher initialised — platform: YouTube Shorts");
}
