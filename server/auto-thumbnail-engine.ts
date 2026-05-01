import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, isNull, desc, lt, sql } from "drizzle-orm";
import { getOpenAIClientBackground as getOpenAIClientBackground } from "./lib/openai";
import { sanitizeForPrompt, tokenBudget } from "./lib/ai-attack-shield";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { getQuotaStatus, trackQuotaUsage, canAffordOperation, isQuotaBreakerTripped, markQuotaErrorFromResponse } from "./services/youtube-quota-tracker";

const logger = createLogger("auto-thumbnail");
const openai = getOpenAIClientBackground();

// ── 4K Thumbnail Feature Flag ─────────────────────────────────────────────────
// YouTube currently supports a maximum of 2048×1152 for custom thumbnails.
// When YouTube officially launches 4K thumbnail support, flip this to true —
// no further code changes needed. The upload path, size budget, and Sharp
// pipeline all scale automatically based on this single constant.
//
// HOW TO ACTIVATE (future):
//   1. YouTube announces 4K thumbnail support
//   2. Set YT_4K_THUMBNAILS_ENABLED = true
//   3. Optionally raise YOUTUBE_THUMBNAIL_UPLOAD_LIMIT_BYTES to match the new
//      file-size cap YouTube publishes with the feature
//   Done — every newly generated thumbnail will be uploaded at 4K.
const YT_4K_THUMBNAILS_ENABLED = false;

// Dimensions used for Sharp post-processing and YouTube upload.
// Current YouTube maximum: 2048×1152 (better quality than the old 1280×720).
// 4K (ready, dormant): 3840×2160.
const THUMB_W = YT_4K_THUMBNAILS_ENABLED ? 3840 : 2048;
const THUMB_H = YT_4K_THUMBNAILS_ENABLED ? 2160 : 1152;

// YouTube's upload size cap is currently 2 MB for custom thumbnails.
// When they support 4K, they will likely raise this; update the constant then.
const YOUTUBE_THUMBNAIL_UPLOAD_LIMIT_BYTES = 2_000_000;

const MAX_THUMBNAILS_PER_RUN = 10;
const disconnectedChannels = new Set<number>();
let disconnectedChannelsTTL = 0;

const THUMBNAIL_PROMPT_TOKENS = 600;
const THUMBNAIL_RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;
let thumbnailRateLimitCooldownUntil = 0;

function isChannelDisconnected(channelId: number): boolean {
  if (Date.now() > disconnectedChannelsTTL) {
    disconnectedChannels.clear();
    disconnectedChannelsTTL = Date.now() + 3600_000;
  }
  return disconnectedChannels.has(channelId);
}

function markChannelDisconnected(channelId: number): void {
  disconnectedChannels.add(channelId);
}

async function generateThumbnailPrompt(videoTitle: string, videoDescription: string, videoType: string, researchContext?: string, gameName?: string): Promise<string> {
  if (Date.now() < thumbnailRateLimitCooldownUntil) {
    logger.info("Auto-thumbnail in rate-limit cooldown — skipping prompt generation", {
      cooldownRemainingMs: thumbnailRateLimitCooldownUntil - Date.now(),
    });
    return "";
  }
  if (!tokenBudget.checkBudget("auto-thumbnail", THUMBNAIL_PROMPT_TOKENS)) {
    logger.info("Auto-thumbnail daily token budget exhausted — skipping prompt generation");
    return "";
  }

  const isShort = videoType === "short";

  try {
    const researchSection = researchContext
      ? `\n\nWEB RESEARCH — REAL THUMBNAIL INTELLIGENCE FOR "${gameName ? sanitizeForPrompt(gameName).toUpperCase() : "THIS GAME"}":\nYou have studied real successful ${gameName ? sanitizeForPrompt(gameName) : "gaming"} thumbnails from the internet. Use these findings to inform your design:\n\n${researchContext}\n\n⚠️ APPLY only patterns that are authentic to ${gameName ? `"${sanitizeForPrompt(gameName)}"` : "this specific game"}. Ignore any cross-game patterns that may have slipped into the research. The thumbnail must look like a ${gameName ? `"${sanitizeForPrompt(gameName)}"` : "this game"} video — not any other game.`
      : "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the world's best YouTube thumbnail designer, specialising in PS5 NO-COMMENTARY gaming channels. Your thumbnails consistently achieve 8–15% CTR.

CHANNEL IDENTITY — ET Gaming 247:
- PS5 gaming, no face cam, no commentary — the thumbnail must rely entirely on in-game visuals
- Brand aesthetic: cinematic dark backgrounds, high-contrast warm/neon accent colours (deep navy or dark charcoal base + vivid orange, electric blue, or gold highlights)
- Every thumbnail must feel like a movie poster for the game being played

VISUAL DESIGN RULES:
- EXTREME contrast: dark background + bright subject or vice versa
- Single clear focal point (rule of thirds or centred)
- Cinematic lighting: rim light, god rays, dramatic spotlight — never flat lighting
- Depth of field: sharp subject, blurred/bokeh background
- Rich colour saturation that pops on both YouTube's white and dark mode backgrounds
- No clutter — one hero subject dominates ≥ 50 % of the frame

TEXT OVERLAY — CRITICAL BEST PRACTICE:
YouTube does NOT add text to thumbnails. You MUST include a bold 2–4 word text hook rendered INTO the image.
- Font style: thick bold sans-serif (like Impact or Anton), large enough to read at 336×188 px (thumbnail preview size)
- Placement: top-left or top-right third, NEVER overlapping the main subject's face/key action
- Text colour: white or bright yellow with a dark drop shadow or thick black stroke so it reads on any background
- The text must be a punchy hook, NOT the full title (e.g. "FINAL BOSS", "THIS IS INSANE", "PERFECT RUN", "NO WAY OUT")
- Keep it 2–4 words maximum — shorter is more readable

SAFE-ZONE RULE (CRITICAL):
The generated image is 1536×1024 (3:2) but will be centre-cropped to 16:9. The top and bottom ~8% of pixels will be cut off. Keep ALL critical content — subject, text, key action — within the central 85% of the vertical frame.

GAME ACCURACY — NON-NEGOTIABLE:
If a game is specified, the thumbnail MUST faithfully reproduce that game's art style, character designs, colour palette, and environment. Do NOT substitute generic "video game" imagery or characters from a different game.

ANTI-CLICKBAIT:
Thumbnails must accurately represent the video. No misleading imagery. Build viewer trust.${researchSection}`,
        },
        {
          role: "user",
          content: `Create a DALL-E image generation prompt for this YouTube thumbnail:

Title: "${sanitizeForPrompt(videoTitle)}"
Description: "${sanitizeForPrompt((videoDescription || "").substring(0, 300))}"
Type: ${videoType}${gameName ? `\nGame: "${sanitizeForPrompt(gameName)}"

CRITICAL GAME ACCURACY: This video is about "${sanitizeForPrompt(gameName)}". Every visual element must match the authentic art style, characters, environments, colour palette, and aesthetic of "${sanitizeForPrompt(gameName)}". Do NOT depict any other game or use generic imagery.` : ""}

REQUIRED IN YOUR PROMPT:
1. Specify the 2–4 word bold text hook to render in the image (derive it from the most exciting/curiosity-driving aspect of the title)
2. Specify exact placement of that text (top-left or top-right, with dark stroke/drop-shadow)
3. Describe the hero visual: the single most dramatic in-game moment, character, or environment that hooks the viewer
4. Describe the lighting: cinematic and directional, not flat
5. Describe the colour scheme: dark base + one or two vivid accent colours${isShort ? `\n6. SHORTS NOTE: The focal subject must fit within the central square (1:1) crop zone — YouTube Shorts shelf displays a square crop of the thumbnail` : ""}

Output format: Return ONLY the image generation prompt as a single paragraph. No preamble, no labels, no JSON. The prompt must produce a photorealistic or hyper-cinematic 1536×1024 landscape image.`,
        },
      ],
      max_completion_tokens: 500,
    });
    const result = response.choices[0]?.message?.content?.trim() || "";
    if (result) {
      tokenBudget.consumeBudget("auto-thumbnail", response.usage?.total_tokens ?? THUMBNAIL_PROMPT_TOKENS);
    }
    return result;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      thumbnailRateLimitCooldownUntil = Date.now() + THUMBNAIL_RATE_LIMIT_COOLDOWN_MS;
      logger.warn("Auto-thumbnail hit 429 rate limit — pausing for 10 minutes", {
        cooldownUntil: new Date(thumbnailRateLimitCooldownUntil).toISOString(),
      });
    } else {
      logger.error("Failed to generate thumbnail prompt", { error: msg.substring(0, 200) });
    }
    return "";
  }
}

async function generateAndUploadThumbnail(
  userId: string,
  videoDbId: number,
  videoTitle: string,
  videoDescription: string,
  videoType: string,
  youtubeId: string,
  channelId: number,
  detectedGameName?: string
): Promise<boolean | "channel_disconnected"> {
  if (isChannelDisconnected(channelId)) return "channel_disconnected";
  try {
    let researchContext = "";
    try {
      const gameName = detectedGameName && detectedGameName !== "Unknown" && detectedGameName !== "Gaming" && detectedGameName !== "Uncategorized"
        ? detectedGameName
        : extractGameName(videoTitle, videoDescription);
      const { getThumbnailContext } = await import("./services/thumbnail-intelligence");
      researchContext = await getThumbnailContext(userId, gameName);
      if (researchContext) {
        logger.info("Thumbnail intelligence loaded", { videoDbId, gameName, contextLength: researchContext.length });
      }
    } catch (err: any) {
      logger.debug("Thumbnail intelligence unavailable, proceeding without", { error: err.message?.substring(0, 100) });
    }

    const resolvedGame = detectedGameName && detectedGameName !== "Unknown" && detectedGameName !== "Gaming" && detectedGameName !== "Uncategorized"
      ? detectedGameName
      : extractGameName(videoTitle, videoDescription);
    const prompt = await generateThumbnailPrompt(videoTitle, videoDescription, videoType, researchContext, resolvedGame !== "PS5 Gameplay" ? resolvedGame : undefined);
    if (!prompt) {
      logger.warn("Empty thumbnail prompt, skipping", { videoDbId });
      return false;
    }

    logger.info("Generating thumbnail image", { videoDbId, youtubeId, promptLength: prompt.length });

    let imageBuffer: Buffer;
    try {
      const { generateImageBuffer: genImg } = await import("./replit_integrations/image/client");
      imageBuffer = await genImg(prompt, "1536x1024", "high");
    } catch (imgErr) {
      logger.error("Image generation failed (AI integration may be unavailable)", { videoDbId, error: String(imgErr) });
      return false;
    }

    if (!imageBuffer || imageBuffer.length < 1000) {
      logger.warn("Generated image too small, skipping upload", { videoDbId, size: imageBuffer?.length });
      return false;
    }

    const { setYouTubeThumbnail } = await import("./youtube");
    
    let finalBuffer = imageBuffer;
    let finalMimeType = "image/jpeg";
    try {
      const sharp = (await import("sharp")).default;
      // Start at high quality and step down until within the upload limit.
      // Lanczos3 kernel gives the sharpest upscale from the AI-generated source.
      let quality = 85;
      const doResize = (q: number) =>
        sharp(imageBuffer)
          .resize(THUMB_W, THUMB_H, { fit: "cover", position: "center", kernel: "lanczos3" })
          .jpeg({ quality: q, progressive: true })
          .toBuffer();
      finalBuffer = await doResize(quality);
      while (finalBuffer.length > YOUTUBE_THUMBNAIL_UPLOAD_LIMIT_BYTES * 0.97 && quality > 30) {
        quality -= 8;
        finalBuffer = await doResize(quality);
      }
      logger.info("Converted thumbnail to JPEG", {
        originalSize: imageBuffer.length,
        newSize: finalBuffer.length,
        quality,
        dimensions: `${THUMB_W}x${THUMB_H}`,
        is4k: YT_4K_THUMBNAILS_ENABLED,
      });
    } catch (sharpErr) {
      logger.warn("Sharp conversion failed, falling back to original buffer", { error: String(sharpErr) });
      finalMimeType = "image/png";
    }

    if (finalBuffer.length > YOUTUBE_THUMBNAIL_UPLOAD_LIMIT_BYTES) {
      logger.warn("Thumbnail still exceeds upload limit after compression — skipping", { videoDbId, size: finalBuffer.length, limitBytes: YOUTUBE_THUMBNAIL_UPLOAD_LIMIT_BYTES });
      try {
        const [row] = await db.select().from(videos).where(eq(videos.id, videoDbId));
        const existMeta = (row?.metadata as any) || {};
        await db.update(videos).set({
          metadata: { ...existMeta, autoThumbnailFailed: "image_too_large", autoThumbnailRetryAt: null },
        }).where(eq(videos.id, videoDbId));
      } catch {}
      return false;
    }

    const canUpload = await canAffordOperation(userId, "thumbnail").catch(() => false);
    if (!canUpload) {
      logger.warn("Auto-thumbnail skipped — insufficient quota for thumbnail upload", { videoDbId, youtubeId });
      return false;
    }

    await setYouTubeThumbnail(channelId, youtubeId, finalBuffer, finalMimeType);
    await trackQuotaUsage(userId, "thumbnail").catch(() => {});

    const meta = ((await db.select().from(videos).where(eq(videos.id, videoDbId)))[0]?.metadata as any) || {};
    await db.update(videos).set({
      metadata: {
        ...meta,
        autoThumbnailGenerated: true,
        autoThumbnailGeneratedAt: new Date().toISOString(),
        thumbnailPrompt: prompt.substring(0, 500),
      },
    }).where(eq(videos.id, videoDbId));

    logger.info("Auto-thumbnail uploaded to YouTube", { videoDbId, youtubeId, videoTitle });

    sendSSEEvent(userId, "content-update", { type: "thumbnail_generated", videoId: videoDbId });

    return true;
  } catch (err: any) {
    const errMsg = String(err);
    const isNotFound = errMsg.includes("cannot be found") || (errMsg.includes("videoId") && errMsg.includes("not found")) || errMsg.includes("404");
    const isTooLarge = errMsg.includes("Media is too large") || errMsg.includes("2097152") || errMsg.includes("media_too_large");
    const isNotConnected = errMsg.includes("not connected") || errMsg.includes("missing access token");
    if (isNotConnected) {
      markChannelDisconnected(channelId);
      logger.info("Auto-thumbnail skipped — channel not connected, caching for 1h", { channelId, videoDbId });
      return "channel_disconnected";
    }
    if (isNotFound || isTooLarge) {
      const failReason = isNotFound ? "video_not_found_on_youtube" : "image_too_large";
      try {
        const [row] = await db.select().from(videos).where(eq(videos.id, videoDbId));
        const existMeta = (row?.metadata as any) || {};
        // AUDIT FIX: Do not mark autoThumbnailGenerated=true on failure — only set on confirmed successful upload
        await db.update(videos).set({
          metadata: { ...existMeta, autoThumbnailFailed: failReason },
        }).where(eq(videos.id, videoDbId));
        logger.warn(`Auto-thumbnail permanently skipped — ${failReason}`, { videoDbId, youtubeId });
      } catch {}
    } else {
      markQuotaErrorFromResponse(err);
      logger.error("Auto-thumbnail generation failed", { videoDbId, error: errMsg });
    }
    return false;
  }
}

export async function runAutoThumbnailForUser(userId: string): Promise<number> {
  let generated = 0;
  try {
    if (isQuotaBreakerTripped()) return 0;
    const quota = await getQuotaStatus(userId).catch(() => ({ remaining: 0 }));
    if (quota.remaining < 100) {
      logger.warn("Auto-thumbnail skipped — quota too low", { userId, remaining: quota.remaining });
      return 0;
    }

    const ytChannels = await db.select().from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        eq(channels.userId, userId),
        sql`${channels.accessToken} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) {
      return 0;
    }

    for (const ytChannel of ytChannels) {
      if (generated >= MAX_THUMBNAILS_PER_RUN) break;

      if (ytChannel.tokenExpiresAt && ytChannel.tokenExpiresAt.getTime() < Date.now() - 86400_000) {
        logger.info("Auto-thumbnail skipped — channel token expired", { channelId: ytChannel.id });
        continue;
      }

      const userVideos = await db.select().from(videos)
        .where(and(
          eq(videos.channelId, ytChannel.id),
          sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
          sql`(${videos.metadata}->>'autoThumbnailGenerated')::text IS DISTINCT FROM 'true'`,
          sql`(${videos.metadata}->>'autoThumbnailFailed') IS NULL`,
        ))
        .orderBy(desc(videos.createdAt))
        .limit(500);

      for (const video of userVideos) {
        if (generated >= MAX_THUMBNAILS_PER_RUN) break;
        const meta = (video.metadata as any) || {};
        const youtubeId = meta.youtubeId;
        if (!youtubeId) continue;
        if (video.thumbnailUrl && !video.thumbnailUrl.includes("default") && !video.thumbnailUrl.includes("hqdefault")) {
          await db.update(videos).set({
            metadata: { ...meta, autoThumbnailGenerated: true, autoThumbnailSkipped: "already_has_custom_thumbnail" },
          }).where(eq(videos.id, video.id));
          continue;
        }
        const result = await generateAndUploadThumbnail(userId, video.id, video.title, video.description || "", video.type || "video", youtubeId, ytChannel.id, meta.gameName);
        if (result === "channel_disconnected") break;
        if (result === true) generated++;
      }
    }
  } catch (err) {
    logger.error("Auto-thumbnail for user failed", { userId, error: String(err) });
  }
  return generated;
}

export async function runAutoThumbnailGeneration(): Promise<{ generated: number; skipped: number }> {
  let generated = 0;
  let skipped = 0;

  try {
    const ytChannels = await db.select().from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        sql`${channels.accessToken} IS NOT NULL`,
        sql`${channels.userId} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) return { generated, skipped };

    for (const ytChannel of ytChannels) {
      if (generated >= MAX_THUMBNAILS_PER_RUN) break;

      if (isChannelDisconnected(ytChannel.id)) continue;
      if (ytChannel.tokenExpiresAt && ytChannel.tokenExpiresAt.getTime() < Date.now() - 86400_000) continue;

      const userId = ytChannel.userId!;
      const userVideos = await db.select().from(videos)
        .where(and(
          eq(videos.channelId, ytChannel.id),
          sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
          sql`(${videos.metadata}->>'autoThumbnailGenerated')::text IS DISTINCT FROM 'true'`,
          sql`(${videos.metadata}->>'autoThumbnailFailed') IS NULL`,
        ))
        .orderBy(desc(videos.createdAt))
        .limit(500);

      for (const video of userVideos) {
        if (generated >= MAX_THUMBNAILS_PER_RUN) break;

        const meta = (video.metadata as any) || {};

        const youtubeId = meta.youtubeId;
        if (!youtubeId) {
          skipped++;
          continue;
        }

        if (video.thumbnailUrl && !video.thumbnailUrl.includes("default") && !video.thumbnailUrl.includes("hqdefault")) {
          await db.update(videos).set({
            metadata: { ...meta, autoThumbnailGenerated: true, autoThumbnailSkipped: "already_has_custom_thumbnail" },
          }).where(eq(videos.id, video.id));
          skipped++;
          continue;
        }

        const result = await generateAndUploadThumbnail(
          userId,
          video.id,
          video.title,
          video.description || "",
          video.type || "video",
          youtubeId,
          ytChannel.id,
          meta.gameName
        );

        if (result === "channel_disconnected") break;
        if (result === true) {
          generated++;
        } else {
          skipped++;
        }
      }
    }

    if (generated > 0) {
      logger.info("Auto-thumbnail generation cycle complete", { generated, skipped });
    }
  } catch (err) {
    logger.error("Auto-thumbnail engine error", { error: String(err) });
  }

  return { generated, skipped };
}

/**
 * Full-channel thumbnail backfill sweep.
 * Processes ALL videos without custom thumbnails across the entire channel,
 * prioritising long-form → stream_vod → regular → short, newest first within each type.
 * Stops as soon as quota is exhausted. Safe to call repeatedly; already-processed
 * videos are filtered out in the DB query.
 */
export async function runThumbnailBackfillSweep(userId: string): Promise<{ processed: number; remaining: number; quotaExhausted: boolean }> {
  let processed = 0;
  let quotaExhausted = false;

  try {
    if (isQuotaBreakerTripped()) {
      logger.warn("Thumbnail backfill skipped — quota circuit breaker active", { userId });
      return { processed, remaining: -1, quotaExhausted: true };
    }

    const ytChannels = await db.select().from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        eq(channels.userId, userId),
        sql`${channels.accessToken} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) return { processed, remaining: 0, quotaExhausted: false };

    for (const ytChannel of ytChannels) {
      if (isChannelDisconnected(ytChannel.id)) continue;
      if (ytChannel.tokenExpiresAt && ytChannel.tokenExpiresAt.getTime() < Date.now() - 86400_000) {
        logger.info("Thumbnail backfill skipped — channel token expired", { channelId: ytChannel.id });
        continue;
      }

      const typeOrder = sql`CASE
        WHEN ${videos.type} = 'long' THEN 1
        WHEN ${videos.type} = 'stream_vod' THEN 2
        WHEN ${videos.type} = 'regular' THEN 3
        WHEN ${videos.type} = 'short' THEN 4
        ELSE 5
      END`;

      const needingThumbnails = await db.select().from(videos)
        .where(and(
          eq(videos.channelId, ytChannel.id),
          sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
          sql`(${videos.metadata}->>'autoThumbnailGenerated')::text IS DISTINCT FROM 'true'`,
          sql`(${videos.metadata}->>'autoThumbnailFailed') IS NULL`,
        ))
        .orderBy(typeOrder, desc(videos.createdAt))
        .limit(2500);

      logger.info("Thumbnail backfill sweep starting", {
        userId,
        channelId: ytChannel.id,
        totalNeedingThumbnails: needingThumbnails.length,
      });

      for (const video of needingThumbnails) {
        const canUpload = await canAffordOperation(userId, "thumbnail").catch(() => false);
        if (!canUpload) {
          logger.info("Thumbnail backfill paused — quota exhausted", { userId, processedThisRun: processed, stillRemaining: needingThumbnails.length - processed });
          quotaExhausted = true;
          return { processed, remaining: needingThumbnails.length - processed, quotaExhausted: true };
        }

        const meta = (video.metadata as any) || {};
        const youtubeId = meta.youtubeId;
        if (!youtubeId) continue;

        if (video.thumbnailUrl && !video.thumbnailUrl.includes("default") && !video.thumbnailUrl.includes("hqdefault")) {
          await db.update(videos).set({
            metadata: { ...meta, autoThumbnailGenerated: true, autoThumbnailSkipped: "already_has_custom_thumbnail" },
          }).where(eq(videos.id, video.id));
          continue;
        }

        const result = await generateAndUploadThumbnail(
          userId, video.id, video.title, video.description || "",
          video.type || "video", youtubeId, ytChannel.id, meta.gameName
        );

        if (result === "channel_disconnected") {
          logger.warn("Thumbnail backfill: channel disconnected, stopping", { channelId: ytChannel.id });
          break;
        }
        if (result === true) {
          processed++;
          if (processed % 10 === 0) {
            logger.info("Thumbnail backfill progress", { userId, processed, remainingEstimate: needingThumbnails.length - processed });
          }
        }
      }

      logger.info("Thumbnail backfill sweep complete for channel", {
        userId, channelId: ytChannel.id, processed,
        stillRemaining: needingThumbnails.length - processed,
      });
    }
  } catch (err) {
    logger.error("Thumbnail backfill sweep failed", { userId, error: String(err) });
  }

  return { processed, remaining: 0, quotaExhausted };
}

export async function generateThumbnailForNewVideo(userId: string, videoDbId: number): Promise<boolean> {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoDbId));
    if (!video) return false;

    const meta = (video.metadata as any) || {};
    // AUDIT FIX: Skip videos with successful thumbnails OR permanent failures; don't skip transient errors
    if (meta.autoThumbnailGenerated || meta.autoThumbnailFailed) return false;

    const youtubeId = meta.youtubeId;
    if (!youtubeId || !video.channelId) return false;

    let enrichedTitle = video.title;
    let enrichedDescription = video.description || "";

    const detectedGame = meta.gameName;
    if (detectedGame && detectedGame !== "Unknown" && detectedGame !== "Gaming") {
      enrichedDescription = `Game: ${detectedGame}. ${enrichedDescription}`;
    }

    if (meta.sourceVideoId) {
      const [sourceVideo] = await db.select().from(videos).where(eq(videos.id, meta.sourceVideoId));
      if (sourceVideo) {
        if (!enrichedDescription || enrichedDescription.length < 30) {
          enrichedDescription = `${enrichedDescription ? enrichedDescription + " | " : ""}From: ${sanitizeForPrompt(sourceVideo.title)}. ${(sourceVideo.description || "").substring(0, 200)}`;
        }
      }
    }

    if (meta.thumbnailConcept) {
      enrichedDescription = `${enrichedDescription}\n\nThumbnail concept: ${sanitizeForPrompt(meta.thumbnailConcept)}`;
    }

    if (meta.seoTitleHook) {
      enrichedDescription = `${enrichedDescription}\n\nSEO TITLE HOOK (thumbnail must visually match this promise): ${sanitizeForPrompt(meta.seoTitleHook)}`;
    }

    const freshVideo = await db.select({ title: videos.title }).from(videos).where(eq(videos.id, videoDbId)).limit(1);
    if (freshVideo[0] && freshVideo[0].title !== enrichedTitle) {
      enrichedTitle = freshVideo[0].title;
      logger.info("Using SEO-optimized title for thumbnail", { videoDbId, optimizedTitle: enrichedTitle.substring(0, 60) });
    }

    const result = await generateAndUploadThumbnail(
      userId,
      videoDbId,
      enrichedTitle,
      enrichedDescription,
      video.type || "video",
      youtubeId,
      video.channelId,
      detectedGame
    );
    return result === true;
  } catch (err) {
    logger.error("Thumbnail generation for new video failed", { videoDbId, error: String(err) });
    return false;
  }
}

const UNDERPERFORM_CTR_THRESHOLD = 4.0;
const UNDERPERFORM_VIEW_RATIO = 0.3;
const THUMBNAIL_REFRESH_COOLDOWN_DAYS = 14;

export async function regenerateThumbnailsForUnderperformers(userId: string): Promise<number> {
  let regenerated = 0;
  try {
    const ytChannels = await db.select().from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        eq(channels.userId, userId),
        sql`${channels.accessToken} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) return 0;
    const channelIds = ytChannels.map(c => c.id);

    const minAge = new Date(Date.now() - 7 * 86400000);
    const cooldownCutoff = new Date(Date.now() - THUMBNAIL_REFRESH_COOLDOWN_DAYS * 86400000);

    const userVids = await db.select().from(videos)
      .where(and(
        lt(videos.createdAt, minAge),
        sql`${videos.channelId} IN (${sql.join(channelIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(desc(videos.createdAt))
      .limit(50);

    for (const video of userVids) {
      if (regenerated >= MAX_THUMBNAILS_PER_RUN) break;

      const meta = (video.metadata as any) || {};
      const youtubeId = meta.youtubeId;
      if (!youtubeId || !video.channelId) continue;

      if (meta.autoThumbnailFailed) continue;

      const lastRefresh = meta.thumbnailRefreshedAt ? new Date(meta.thumbnailRefreshedAt) : null;
      if (lastRefresh && lastRefresh > cooldownCutoff) continue;

      const stats = meta.stats || {};
      const ctr = stats.ctr || 0;
      const views = meta.viewCount || stats.views || 0;

      const avgViews = await getChannelAvgViews(video.channelId);
      const isUnderperforming = (ctr > 0 && ctr < UNDERPERFORM_CTR_THRESHOLD) ||
        (avgViews > 0 && views < avgViews * UNDERPERFORM_VIEW_RATIO);

      if (!isUnderperforming) continue;

      logger.info("Regenerating thumbnail for underperforming video", {
        videoId: video.id, title: video.title, ctr, views, avgViews
      });

      await db.update(videos).set({
        metadata: {
          ...meta,
          autoThumbnailGenerated: false,
          thumbnailRefreshReason: `underperforming (CTR: ${ctr}%, views: ${views} vs avg: ${avgViews})`,
        },
      }).where(eq(videos.id, video.id));

      const result = await generateAndUploadThumbnail(
        userId, video.id, video.title, video.description || "",
        video.type || "video", youtubeId, video.channelId, meta.gameName
      );

      if (result === "channel_disconnected") break;
      if (result === true) {
        await db.update(videos).set({
          metadata: {
            ...((await db.select().from(videos).where(eq(videos.id, video.id)))[0]?.metadata as any || {}),
            thumbnailRefreshedAt: new Date().toISOString(),
            thumbnailRefreshCount: (meta.thumbnailRefreshCount || 0) + 1,
          },
        }).where(eq(videos.id, video.id));
        regenerated++;
      }
    }

    if (regenerated > 0) {
      logger.info("Thumbnails refreshed for underperformers", { userId, regenerated });
    }
  } catch (err) {
    logger.error("Thumbnail refresh for underperformers failed", { userId, error: String(err) });
  }
  return regenerated;
}

function extractGameName(title: string, description: string): string {
  const combined = `${sanitizeForPrompt(title)} ${sanitizeForPrompt(description)}`.toLowerCase();

  try {
    const { detectGameFromLearned } = require("./services/web-game-lookup");
    const learnedMatch = detectGameFromLearned(combined);
    if (learnedMatch) return learnedMatch;
  } catch {}

  const knownGames = [
    "god of war", "spider-man", "spiderman", "elden ring", "final fantasy",
    "horizon", "the last of us", "ghost of tsushima", "demon's souls",
    "ratchet and clank", "returnal", "gran turismo", "uncharted",
    "resident evil", "death stranding", "bloodborne", "astro bot",
    "hogwarts legacy", "stellar blade", "black myth wukong",
    "call of duty", "gta", "grand theft auto", "assassin's creed",
    "cyberpunk", "dark souls", "sekiro", "lies of p", "armored core",
    "tekken", "street fighter", "mortal kombat", "diablo", "baldur's gate",
    "starfield", "helldivers", "palworld", "dragon's dogma", "silent hill",
    "alan wake", "the witcher", "red dead redemption", "monster hunter",
    "battlefield", "fortnite", "apex legends", "overwatch", "destiny",
    "halo", "doom", "wolfenstein", "far cry", "watch dogs",
    "rainbow six", "ghost recon", "the division", "just cause",
    "metal gear", "devil may cry", "bayonetta", "nioh", "persona",
    "yakuza", "like a dragon", "detroit become human", "until dawn",
    "days gone", "infamous", "gravity rush", "little big planet",
    "sackboy", "astro's playroom", "marvel's wolverine", "concord",
  ];

  for (const game of knownGames) {
    if (combined.includes(game)) {
      return game.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  const titleWords = title.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2);
  const stopWords = new Set(["the", "and", "for", "with", "part", "episode", "gameplay", "walkthrough", "playthrough", "full", "game", "ps5", "4k", "hdr"]);
  const meaningful = titleWords.filter(w => !stopWords.has(w.toLowerCase()));
  return meaningful.slice(0, 3).join(" ") || "PS5 Gameplay";
}

async function getChannelAvgViews(channelId: number): Promise<number> {
  try {
    const channelVids = await db.select().from(videos)
      .where(eq(videos.channelId, channelId))
      .limit(20);
    if (channelVids.length === 0) return 0;
    const totalViews = channelVids.reduce((sum, v) => {
      const meta = (v.metadata as any) || {};
      return sum + (meta.viewCount || meta.stats?.views || 0);
    }, 0);
    return Math.floor(totalViews / channelVids.length);
  } catch {
    return 0;
  }
}
