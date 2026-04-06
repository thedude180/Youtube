import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, isNull, desc, lt, sql } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { getQuotaStatus, trackQuotaUsage } from "./services/youtube-quota-tracker";

const logger = createLogger("auto-thumbnail");
const openai = getOpenAIClient();

const MAX_THUMBNAILS_PER_RUN = 3;

async function generateThumbnailPrompt(videoTitle: string, videoDescription: string, videoType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the world's best YouTube thumbnail designer — your thumbnails consistently achieve 8-15% CTR, outperforming 99% of creators. You combine the skills of:

🎨 ELITE VISUAL DESIGNER: You understand color psychology (red/yellow = urgency, blue = trust), visual hierarchy, the rule of thirds, and how to create depth and dimension in a single frame.

🧠 AUDIENCE PSYCHOLOGIST: You know that viewers decide to click in 0.3 seconds. You design thumbnails that trigger emotional responses — shock, curiosity, excitement, FOMO — that make clicking feel involuntary.

📊 DATA-DRIVEN OPTIMIZER: You study what gets 10M+ views. High-contrast color blocking. Dramatic lighting with strong shadows. Clear focal point with bokeh/blur backgrounds. Expressive character reactions. Visual tension that implies a story.

RULES FOR THE IMAGE PROMPT:
- Create EXTREME visual contrast (light vs dark, warm vs cool)
- Feature dramatic action, reaction, or emotion as the focal point
- Use cinematic lighting — golden hour, rim lighting, or dramatic spotlights
- Include depth of field (sharp subject, blurred background)
- Feature the most compelling action or peak intensity moments from the content
- Colors must POP against YouTube's white/dark backgrounds
- Never include text overlays — YouTube handles text separately
- The image should tell a story or create a question in the viewer's mind`,
        },
        {
          role: "user",
          content: `Create a thumbnail image generation prompt for this video:
Title: "${videoTitle}"
Description: "${(videoDescription || "").substring(0, 300)}"
Type: ${videoType}

Return ONLY the image generation prompt, nothing else. Design for a LANDSCAPE 16:9 frame (1280x720 YouTube thumbnail). The composition must fill the widescreen frame — wide, horizontal scene with the focal point centered or rule-of-thirds. No vertical or square framing.`,
        },
      ],
// AUDIT FIX: Use max_tokens (standard Chat Completions parameter)
      max_completion_tokens: 300,
    });
    return response.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    logger.error("Failed to generate thumbnail prompt", { error: String(err) });
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
  channelId: number
): Promise<boolean> {
  try {
    const prompt = await generateThumbnailPrompt(videoTitle, videoDescription, videoType);
    if (!prompt) {
      logger.warn("Empty thumbnail prompt, skipping", { videoDbId });
      return false;
    }

    logger.info("Generating thumbnail image", { videoDbId, youtubeId, promptLength: prompt.length });

    let imageBuffer: Buffer;
    try {
      const { generateImageBuffer: genImg } = await import("./replit_integrations/image/client");
      // YouTube thumbnails are 16:9 landscape — use 1536x1024 for correct aspect ratio
      imageBuffer = await genImg(prompt, "1536x1024");
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
      let quality = 82;
      finalBuffer = await sharp(imageBuffer)
        .resize(1280, 720, { fit: "cover", position: "center" })
        .jpeg({ quality })
        .toBuffer();
      while (finalBuffer.length > 1.9 * 1024 * 1024 && quality > 30) {
        quality -= 10;
        finalBuffer = await sharp(imageBuffer)
          .resize(1280, 720, { fit: "cover", position: "center" })
          .jpeg({ quality })
          .toBuffer();
      }
      logger.info("Converted thumbnail to JPEG", { 
        originalSize: imageBuffer.length, 
        newSize: finalBuffer.length,
        quality,
      });
    } catch (sharpErr) {
      logger.warn("Sharp conversion failed, falling back to original buffer", { error: String(sharpErr) });
      finalMimeType = "image/png";
    }

    const YOUTUBE_THUMBNAIL_LIMIT = 2_000_000;
    if (finalBuffer.length > YOUTUBE_THUMBNAIL_LIMIT) {
      logger.warn("Thumbnail still exceeds 2 MB after compression — skipping", { videoDbId, size: finalBuffer.length });
      try {
        const [row] = await db.select().from(videos).where(eq(videos.id, videoDbId));
        const existMeta = (row?.metadata as any) || {};
        await db.update(videos).set({
          metadata: { ...existMeta, autoThumbnailFailed: "image_too_large", autoThumbnailRetryAt: null },
        }).where(eq(videos.id, videoDbId));
      } catch {}
      return false;
    }

    await setYouTubeThumbnail(channelId, youtubeId, finalBuffer, finalMimeType);

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
      logger.error("Auto-thumbnail generation failed", { videoDbId, error: errMsg });
    }
    return false;
  }
}

export async function runAutoThumbnailForUser(userId: string): Promise<number> {
  let generated = 0;
  try {
    // thumbnails.set costs 50 quota units — skip if quota is too low
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

    for (const ytChannel of ytChannels) {
      if (generated >= MAX_THUMBNAILS_PER_RUN) break;

      const userVideos = await db.select().from(videos)
        .where(eq(videos.channelId, ytChannel.id))
        .orderBy(desc(videos.createdAt))
        .limit(10);

      for (const video of userVideos) {
        if (generated >= MAX_THUMBNAILS_PER_RUN) break;
        const meta = (video.metadata as any) || {};
        if (meta.autoThumbnailGenerated || meta.autoThumbnailFailed) continue;
        const youtubeId = meta.youtubeId;
        if (!youtubeId) continue;
        if (video.thumbnailUrl && !video.thumbnailUrl.includes("default")) {
          await db.update(videos).set({
            metadata: { ...meta, autoThumbnailGenerated: true, autoThumbnailSkipped: "already_has_custom_thumbnail" },
          }).where(eq(videos.id, video.id));
          continue;
        }
        const success = await generateAndUploadThumbnail(userId, video.id, video.title, video.description || "", video.type || "video", youtubeId, ytChannel.id);
        if (success) generated++;
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

      const userId = ytChannel.userId!;
      const userVideos = await db.select().from(videos)
        .where(eq(videos.channelId, ytChannel.id))
        .orderBy(desc(videos.createdAt))
        .limit(20);

      for (const video of userVideos) {
        if (generated >= MAX_THUMBNAILS_PER_RUN) break;

        const meta = (video.metadata as any) || {};
        if (meta.autoThumbnailGenerated) {
          skipped++;
          continue;
        }

        const youtubeId = meta.youtubeId;
        if (!youtubeId) {
          skipped++;
          continue;
        }

        if (video.thumbnailUrl && !video.thumbnailUrl.includes("default")) {
          const existingMeta = meta;
          await db.update(videos).set({
            metadata: { ...existingMeta, autoThumbnailGenerated: true, autoThumbnailSkipped: "already_has_custom_thumbnail" },
          }).where(eq(videos.id, video.id));
          skipped++;
          continue;
        }

        const success = await generateAndUploadThumbnail(
          userId,
          video.id,
          video.title,
          video.description || "",
          video.type || "video",
          youtubeId,
          ytChannel.id
        );

        if (success) {
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

    if (meta.sourceVideoId) {
      const [sourceVideo] = await db.select().from(videos).where(eq(videos.id, meta.sourceVideoId));
      if (sourceVideo) {
        if (!enrichedDescription || enrichedDescription.length < 30) {
          enrichedDescription = `${enrichedDescription ? enrichedDescription + " | " : ""}From: ${sourceVideo.title}. ${(sourceVideo.description || "").substring(0, 200)}`;
        }
      }
    }

    if (meta.thumbnailConcept) {
      enrichedDescription = `${enrichedDescription}\n\nThumbnail concept: ${meta.thumbnailConcept}`;
    }

    return await generateAndUploadThumbnail(
      userId,
      videoDbId,
      enrichedTitle,
      enrichedDescription,
      video.type || "video",
      youtubeId,
      video.channelId
    );
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

      const success = await generateAndUploadThumbnail(
        userId, video.id, video.title, video.description || "",
        video.type || "video", youtubeId, video.channelId
      );

      if (success) {
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
