/**
 * stream-editor-packager.ts
 *
 * After FFmpeg finishes producing clips for a stream edit job, this service:
 *  1. Calls GPT-4o-mini once per clip to generate a platform-specific SEO package
 *     (title, description, tags, seoScore).
 *  2. Creates a Studio video record for each clip so it shows up in the Studio
 *     ready to review and publish.
 *  3. Fires off AI thumbnail generation in the background (non-blocking).
 *
 * Returns an updated outputFiles array with `studioVideoId` filled in for
 * every successfully packaged clip.
 */

import * as fs from "fs";
import * as path from "path";
import { storage } from "../storage";
import { getOpenAIClient } from "../lib/openai";
import { generateThumbnailPrompt } from "../ai-engine";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { channels } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const logger = createLogger("stream-editor-packager");

const STUDIO_DIR = path.resolve(process.cwd(), "data", "studio");
if (!fs.existsSync(STUDIO_DIR)) fs.mkdirSync(STUDIO_DIR, { recursive: true });

export interface RawClip {
  platform: string;
  clipIndex: number;
  label: string;
  filePath: string;
  fileSize: number;
  durationSecs: number;
  studioVideoId?: number;
  scheduledPublishAt?: string;
}

interface ClipSeoPackage {
  title: string;
  description: string;
  tags: string[];
  seoScore: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  rumble: "Rumble",
  tiktok: "TikTok",
  shorts: "YouTube Shorts",
};

/** Generate a full SEO package (title/description/tags) for a single clip. */
async function generateSeoPackage(
  sourceTitle: string,
  gameName: string | null | undefined,
  platform: string,
  clipIndex: number,
  totalClips: number,
  userId: string,
): Promise<ClipSeoPackage> {
  const openai = getOpenAIClient();
  const platformLabel = PLATFORM_LABELS[platform] ?? platform;
  const partLabel = totalClips > 1 ? ` Part ${clipIndex + 1} of ${totalClips}` : "";
  const isShortForm = platform === "tiktok" || platform === "shorts";
  const maxTitle = isShortForm ? 150 : 100;
  const descLen = isShortForm ? "100–200 words" : "300–500 words";
  const game = gameName || "gaming";

  const prompt = `You are an elite YouTube gaming SEO strategist for the channel ET Gaming 274.
Generate a complete content package for this gaming clip being published to ${platformLabel}.

Source Title: "${sourceTitle}"
Game: "${game}"
Platform: ${platformLabel}${partLabel ? `\nClip: ${partLabel}` : ""}

Rules:
- Title must be under ${maxTitle} characters, front-load the game name, include a hook/emotion word
- Description must be ${descLen}, naturally include ${game} keywords, end with a subscribe CTA
- Provide exactly 20 highly relevant gaming tags (mix of broad + niche, include "${game}", "${platform}" gaming)
- seoScore is your estimate 0-100 of how well this package will rank

Respond as strict JSON only:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "seoScore": 85
}`;

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
  });

  const raw = r.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    title: String(parsed.title ?? `${sourceTitle}${partLabel} | ${platformLabel}`).slice(0, 200),
    description: String(parsed.description ?? `${sourceTitle} — gaming highlight clip.`),
    tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]).slice(0, 20) : [game, "gaming"],
    seoScore: typeof parsed.seoScore === "number" ? Math.max(0, Math.min(100, parsed.seoScore)) : 80,
  };
}

/** Fire-and-forget thumbnail generation for a studio video. */
async function generateThumbnailAsync(
  studioVideoId: number,
  title: string,
  description: string,
  gameName: string | null | undefined,
  platform: string,
  userId: string,
): Promise<void> {
  try {
    const thumbnailPrompt = await generateThumbnailPrompt({
      title,
      description,
      platform: platform === "shorts" ? "youtube_shorts" : platform,
      type: "video",
      gameName: gameName ?? null,
    }, userId);

    const { generateImageBuffer } = await import("../replit_integrations/image/client");
    const imageBuffer = await generateImageBuffer(thumbnailPrompt, "1536x1024");
    if (!imageBuffer || imageBuffer.length < 1000) return;

    const sharp = (await import("sharp")).default;
    const isVertical = platform === "tiktok" || platform === "shorts";
    const [thumbW, thumbH] = isVertical ? [1080, 1920] : [1280, 720];
    const jpegBuffer = await sharp(imageBuffer)
      .resize(thumbW, thumbH, { fit: "cover", position: "center" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const thumbPath = path.join(STUDIO_DIR, `thumb_sv${studioVideoId}_${Date.now()}.jpg`);
    fs.writeFileSync(thumbPath, jpegBuffer);

    const base64 = jpegBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    const existing = await storage.getStudioVideo(studioVideoId);
    if (!existing) return;
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const options = (meta.thumbnailOptions as Array<Record<string, unknown>>) ?? [];
    options.push({ url: dataUrl, prompt: thumbnailPrompt });

    await storage.updateStudioVideo(studioVideoId, {
      metadata: { ...meta, thumbnailOptions: options, thumbnailPrompt },
    } as Parameters<typeof storage.updateStudioVideo>[1]);

    logger.info(`[Packager] Thumbnail generated for studio video ${studioVideoId}`);
  } catch (err: unknown) {
    logger.warn(`[Packager] Thumbnail generation failed for sv${studioVideoId}:`, (err as Error)?.message);
  }
}

/**
 * Main entry point.  Called by the stream editor job runner after FFmpeg encoding.
 *
 * @param userId       Owner of the job
 * @param sourceTitle  Human-readable title of the source vault entry
 * @param gameName     Optional game name for better SEO
 * @param clips        Array of finished output clips from the encoding loop
 * @param autoPublish  If true, each clip is scheduled for zero-touch publishing
 * @param onProgress   Optional callback called after each clip is packaged
 * @returns Updated clips array with `studioVideoId` filled in
 */
export async function packageClips(
  userId: string,
  sourceTitle: string,
  gameName: string | null | undefined,
  clips: RawClip[],
  autoPublish: boolean = false,
  onProgress?: (packaged: number, total: number) => void,
): Promise<RawClip[]> {
  const result: RawClip[] = [...clips];

  // Resolve the user's YouTube channel ID once — publishStudioVideo hard-throws
  // if channelId is missing from studio_video.metadata, so we must include it.
  const [youtubeChannel] = await db.select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);
  const youtubeChannelId = youtubeChannel?.id ?? null;
  if (!youtubeChannelId) {
    logger.warn("[Packager] No YouTube channel found for user — clips will be created without channelId, auto-publish will be skipped");
  }
  let packaged = 0;

  // Group by platform so we know the total-clips count per platform
  const clipsPerPlatform: Record<string, number> = {};
  for (const c of clips) clipsPerPlatform[c.platform] = (clipsPerPlatform[c.platform] ?? 0) + 1;

  for (let i = 0; i < result.length; i++) {
    const clip = result[i];
    const totalForPlatform = clipsPerPlatform[clip.platform] ?? 1;

    try {
      const seo = await generateSeoPackage(
        sourceTitle,
        gameName,
        clip.platform,
        clip.clipIndex,
        totalForPlatform,
        userId,
      );

      const sv = await storage.createStudioVideo({
        userId,
        title: seo.title,
        description: seo.description,
        filePath: clip.filePath,
        fileSize: clip.fileSize,
        duration: String(Math.round(clip.durationSecs)),
        status: "ready",
        metadata: {
          tags: seo.tags,
          categoryId: "20",
          seoScore: seo.seoScore,
          privacyStatus: "private",
          channelId: youtubeChannelId,
        },
      });

      result[i] = { ...clip, studioVideoId: sv.id };
      packaged++;
      onProgress?.(packaged, result.length);

      generateThumbnailAsync(sv.id, seo.title, seo.description, gameName, clip.platform, userId)
        .catch(() => {});

      logger.info(`[Packager] Clip ${i + 1}/${result.length} → Studio video ${sv.id} ("${seo.title}")`);
    } catch (err: unknown) {
      logger.warn(`[Packager] Failed to package clip ${i + 1}:`, (err as Error)?.message);
      packaged++;
      onProgress?.(packaged, result.length);
    }
  }

  if (autoPublish) {
    const clipsToSchedule = result
      .filter(c => c.studioVideoId != null)
      .map(c => ({ studioVideoId: c.studioVideoId!, platform: c.platform, label: c.label }));

    if (clipsToSchedule.length > 0) {
      try {
        const { scheduleClipsForAutoPublish } = await import("./stream-editor-auto-publisher");
        const scheduledMap = await scheduleClipsForAutoPublish(userId, clipsToSchedule);
        for (let i = 0; i < result.length; i++) {
          const svId = result[i].studioVideoId;
          if (svId && scheduledMap.has(svId)) {
            result[i] = { ...result[i], scheduledPublishAt: scheduledMap.get(svId) };
          }
        }
        logger.info(`[Packager] Scheduled ${scheduledMap.size} clips for auto-publish`);
      } catch (err: unknown) {
        logger.warn(`[Packager] Auto-publish scheduling failed:`, (err as Error)?.message);
      }
    }
  }

  return result;
}
