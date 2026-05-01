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
import { eq, and, lte, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { uploadVideoToYouTube } from "../youtube";
import { canPostToPlatformToday } from "./platform-budget-tracker";
import { getYtdlpBin } from "../lib/dependency-check";
import { recordHeartbeat } from "./engine-heartbeat";
import { getOpenAIClientBackground } from "../lib/openai";

const logger = createLogger("shorts-publisher");

const MAX_PER_RUN = 20;
// How far ahead to look when picking up scheduled items for batch-upload
const BATCH_WINDOW_DAYS = 14;
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

// ---------------------------------------------------------------------------
// AI caption generation — platform-native, cross-linked to original video
// ---------------------------------------------------------------------------

const PLATFORM_CAPTION_GUIDE: Record<string, string> = {
  youtube: "YouTube Shorts: write a punchy, curiosity-driven title that hooks viewers in the first 3 words. Include #Shorts + 2-3 gaming hashtags. Keep under 100 chars.",
  youtubeshorts: "YouTube Shorts: write a punchy, curiosity-driven title that hooks viewers in the first 3 words. Include #Shorts + 2-3 gaming hashtags. Keep under 100 chars.",
  tiktok: "TikTok FYP: open with a 3-word visual/emotional hook, use native TikTok slang (no 'subscribe', no 'notification bell'), under 150 chars. Include #fyp, #gaming, and the game name. Add 'Full video → link in bio' at the end.",
  twitter: "X (Twitter): one punchy hook line that stops the scroll, optional second line with context, end with the YouTube link. Total under 250 chars. Use 1-2 hashtags max.",
  x: "X (Twitter): one punchy hook line that stops the scroll, optional second line with context, end with the YouTube link. Total under 250 chars. Use 1-2 hashtags max.",
  discord: "Discord: community-focused gaming announcement, conversational tone, include the full YouTube link. Under 500 chars. No hashtags — this is a server chat, not social media.",
  kick: "Kick: streaming-community style, hype energy, mention it's a clip from a PS5 session, include the full YouTube link for the full video. Under 300 chars.",
  instagram: "Instagram Reels: visually-driven storytelling hook line, then 1-2 sentences of context. Use 5-8 hashtags mixing niche + broad gaming reach. Add 'Full video link in bio' at the end.",
};

async function generateShortCaption(opts: {
  platform: string;
  sourceTitle: string;
  hookLine?: string;
  sourceYoutubeId?: string;
  gameName?: string;
}): Promise<string> {
  const { platform, sourceTitle, hookLine, sourceYoutubeId, gameName } = opts;
  const fullVideoUrl = sourceYoutubeId ? `https://youtu.be/${sourceYoutubeId}` : null;
  const guide = PLATFORM_CAPTION_GUIDE[platform] ?? `Platform ${platform}: concise, engaging post for a short gaming clip.`;

  // Fast fallback if AI is unavailable
  const fallback = buildFallbackCaption(platform, sourceTitle, hookLine, fullVideoUrl);

  try {
    const openai = getOpenAIClientBackground();
    const prompt = `You are a viral short-form content strategist for a no-commentary PS5 gaming channel called "ET Gaming 247".

Source clip context:
- Full video title: "${sourceTitle.slice(0, 150)}"
${gameName ? `- Game: ${gameName}` : ""}
${hookLine ? `- Hook/moment: "${hookLine.slice(0, 120)}"` : ""}
${fullVideoUrl ? `- Full video URL: ${fullVideoUrl}` : ""}

Target platform: ${platform.toUpperCase()}
Platform rules: ${guide}

Write a SINGLE platform-native caption for this clip. Make it distinctly different from just copying the YouTube title — rewrite for the ${platform} voice and audience.
${fullVideoUrl && !["youtube", "youtubeshorts"].includes(platform) ? `IMPORTANT: Always include the full video URL (${fullVideoUrl}) somewhere in your caption so viewers can watch the whole video.` : ""}
${["youtube", "youtubeshorts"].includes(platform) ? `For the description section, include: "Watch more at youtube.com/ETGaming247"` : ""}

Respond with ONLY the caption text, no JSON, no quotes, no explanation.`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 300,
    });

    const text = (res.choices[0].message.content || "").trim();
    if (text.length < 10) return fallback;

    // Safety: ensure the URL is in the caption for non-YouTube platforms
    if (fullVideoUrl && !["youtube", "youtubeshorts"].includes(platform) && !text.includes(fullVideoUrl)) {
      return `${text}\n${fullVideoUrl}`.slice(0, 2000);
    }

    return text.slice(0, 2000);
  } catch {
    return fallback;
  }
}

function buildFallbackCaption(
  platform: string,
  title: string,
  hookLine: string | undefined,
  fullVideoUrl: string | null,
): string {
  const base = hookLine || title;
  const link = fullVideoUrl ? `\n${fullVideoUrl}` : "";

  switch (platform) {
    case "youtube":
    case "youtubeshorts":
      return `${base.slice(0, 90)} #Shorts #Gaming #PS5`;
    case "tiktok":
      return `${base.slice(0, 120)} #fyp #gaming #ps5${link}`.slice(0, 2200);
    case "twitter":
    case "x":
      return `${base.slice(0, 200)}${link}`.slice(0, 280);
    case "discord":
      return `🎮 New clip just dropped!\n${base.slice(0, 200)}${link}`.slice(0, 2000);
    case "kick":
      return `Clip from our PS5 stream! ${base.slice(0, 150)}${link}`.slice(0, 500);
    case "instagram":
      return `${base.slice(0, 200)}\n\n#gaming #ps5 #clips #fyp #gamer${link}`.slice(0, 2200);
    default:
      return `${base.slice(0, 300)}${link}`.slice(0, 2000);
  }
}

// ---------------------------------------------------------------------------
// Video extraction — vault-preferred, yt-dlp fallback
// ---------------------------------------------------------------------------

async function getEncodedSegment(opts: {
  userId: string;
  sourceVideoId: number;
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

  // Prefer downloaded vault file
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
      rawSourcePath = vaultEntry.filePath;
    }
  }

  try {
    if (rawSourcePath) {
      await extractSegmentFromFile(rawSourcePath, startSec, durationSec, tmpEncoded);
    } else if (youtubeId) {
      await downloadSegmentFromYouTube(youtubeId, startSec, endSec, tmpRaw);
      if (!fs.existsSync(tmpRaw)) throw new Error("yt-dlp produced no output");
      await extractSegmentFromFile(tmpRaw, 0, durationSec, tmpEncoded);
    } else {
      return null;
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
      // If publishing in the future use YouTube's built-in scheduler (publishAt)
      // so all items can be batch-uploaded now and go live at their spaced times.
      privacyStatus: "public",
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

async function uploadToTikTok(opts: {
  userId: string;
  clipId: number;
  caption: string;
}): Promise<{ success: boolean; publishId?: string; error?: string }> {
  try {
    const { publishVideoToTikTok } = await import("../tiktok-publisher");
    const result = await publishVideoToTikTok(opts.userId, opts.caption, { clipId: opts.clipId });
    return {
      success: result.success,
      publishId: result.publishId,
      error: result.error,
    };
  } catch (err: any) {
    return { success: false, error: err?.message?.slice(0, 300) ?? "unknown error" };
  }
}

async function postTextToPlatform(opts: {
  userId: string;
  platform: string;
  caption: string;
  metadata: Record<string, unknown>;
}): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string }> {
  try {
    const { publishToplatform } = await import("../platform-publisher");
    const result = await publishToplatform(opts.userId, opts.platform, opts.caption, opts.metadata);
    return {
      success: result.success,
      postId: result.postId,
      postUrl: result.postUrl,
      error: result.error,
    };
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
        inArray(autopilotQueue.type, ["youtube_short", "platform_short", "platform_text_short"]),
        eq(autopilotQueue.status, "scheduled"),
        lte(autopilotQueue.scheduledAt, batchWindow),
      ))
      .orderBy(autopilotQueue.scheduledAt)
      .limit(MAX_PER_RUN * 4);

    if (dueItems.length === 0) return { published: 0, failed: 0, skipped: 0 };

    // Check YouTube API quota once before the loop — stop the entire batch if tripped
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn("YouTube quota breaker active — skipping shorts batch");
      return { published: 0, failed: 0, skipped: dueItems.length };
    }

    for (const item of dueItems) {
      if (published >= MAX_PER_RUN) break;

      const userId = item.userId;
      const platform = item.targetPlatform;

      // For non-YouTube platforms still respect the daily budget so we don't
      // spam TikTok / Discord / etc.
      if (platform !== "youtube" && platform !== "youtubeshorts") {
        const budget = await canPostToPlatformToday(userId, platform);
        if (!budget.allowed) {
          logger.info("Daily budget exhausted — skipping", { userId, platform });
          skipped++;
          continue;
        }
      }

      const itemMeta = (item.metadata ?? {}) as Record<string, unknown>;
      const startSec = Number(itemMeta.startSec ?? 0);
      const endSec = Number(itemMeta.endSec ?? 60);
      const clipId = typeof itemMeta.clipId === "number" ? itemMeta.clipId : undefined;
      const sourceYoutubeId = typeof itemMeta.sourceYoutubeId === "string" ? itemMeta.sourceYoutubeId : undefined;
      const hookLine = typeof itemMeta.hookLine === "string" ? itemMeta.hookLine : undefined;

      if (!item.sourceVideoId) {
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: "No sourceVideoId" })
          .where(eq(autopilotQueue.id, item.id));
        failed++;
        continue;
      }

      // Mark processing immediately to prevent double pick-up
      await db.update(autopilotQueue)
        .set({ status: "processing" })
        .where(eq(autopilotQueue.id, item.id));

      // Get source video metadata for caption generation
      const [srcVideo] = await db.select().from(videos)
        .where(eq(videos.id, item.sourceVideoId)).limit(1);
      const srcMeta = (srcVideo?.metadata ?? {}) as Record<string, unknown>;
      const resolvedYoutubeId = sourceYoutubeId
        || (srcMeta.youtubeId as string | undefined)
        || (srcMeta.youtube_id as string | undefined);
      const gameName = typeof srcMeta.gameName === "string" ? srcMeta.gameName : undefined;
      const tags = Array.isArray(srcMeta.tags) ? (srcMeta.tags as string[]) : [];
      const sourceTitle = srcVideo?.title ?? (item.caption ?? "Gaming Clip");

      const isTextPost = item.type === "platform_text_short";
      let result: { success: boolean; error?: string; postId?: string };

      if (isTextPost) {
        // ---- Text + link post ----
        const caption = await generateShortCaption({
          platform,
          sourceTitle,
          hookLine,
          sourceYoutubeId: resolvedYoutubeId,
          gameName,
        });

        result = await postTextToPlatform({
          userId,
          platform,
          caption,
          metadata: {
            ...itemMeta,
            sourceYoutubeId: resolvedYoutubeId,
            tags: tags.slice(0, 10),
          },
        }).catch((err: unknown) => ({
          success: false,
          error: (err as Error)?.message?.slice(0, 300) ?? "unknown",
        }));

        logger.info("Text short post", { platform, success: result.success, userId });
      } else {
        // ---- Video clip upload ----
        const isYouTube = platform === "youtube" || platform === "youtubeshorts";
        const isTikTok = platform === "tiktok";

        if (isTikTok) {
          // TikTok: delegate to publishVideoToTikTok which handles its own extraction
          if (!clipId) {
            result = { success: false, error: "TikTok requires a clipId in metadata" };
          } else {
            const caption = await generateShortCaption({
              platform,
              sourceTitle,
              hookLine,
              sourceYoutubeId: resolvedYoutubeId,
              gameName,
            });

            result = await uploadToTikTok({ userId, clipId, caption }).catch((err: unknown) => ({
              success: false,
              error: (err as Error)?.message?.slice(0, 300) ?? "unknown",
            }));

            logger.info("TikTok short upload", { clipId, success: result.success, userId });
          }
        } else if (isYouTube) {
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
            const encodedPath = await getEncodedSegment({
              userId,
              sourceVideoId: item.sourceVideoId,
              youtubeId: resolvedYoutubeId,
              startSec,
              endSec,
              runId,
            });

            if (!encodedPath) {
              result = { success: false, error: "Could not extract video segment" };
            } else {
              try {
                const titleCaption = await generateShortCaption({
                  platform,
                  sourceTitle,
                  hookLine,
                  sourceYoutubeId: resolvedYoutubeId,
                  gameName,
                });

                const ytDesc = resolvedYoutubeId
                  ? `${sourceTitle}\n\n${resolvedYoutubeId ? `Full video → https://youtu.be/${resolvedYoutubeId}` : ""}\n\n#Shorts #Gaming #PS5 #ETGaming247`
                  : `${sourceTitle}\n\n#Shorts #Gaming #PS5`;

                result = await uploadToYouTube({
                  channelId: ytChannel.id,
                  title: titleCaption.slice(0, 100),
                  description: ytDesc.slice(0, 5000),
                  tags: [...tags.slice(0, 12), "Shorts", "Gaming", "PS5"],
                  videoFilePath: encodedPath,
                  // Pass the item's original scheduledAt so YouTube publishes it
                  // at the right spaced time rather than immediately.
                  scheduledStartTime: item.scheduledAt ? item.scheduledAt.toISOString() : undefined,
                });

                logger.info("YouTube Short upload", { channelId: ytChannel.id, success: result.success, userId });
              } finally {
                if (fs.existsSync(encodedPath)) fs.unlinkSync(encodedPath);
              }
            }
          }
        } else {
          result = { success: false, error: `Unsupported video platform: ${platform}` };
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

  logger.info("Shorts Clip Publisher initialised — platforms: YouTube Shorts, TikTok, Twitter/X, Discord, Kick, Instagram");
}
