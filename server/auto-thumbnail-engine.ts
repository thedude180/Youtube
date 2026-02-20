import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";

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
          content: `You are a YouTube thumbnail design expert. Create a detailed image generation prompt for a click-worthy thumbnail. The thumbnail must be vivid, high-contrast, and instantly attention-grabbing. For gaming content: feature dramatic in-game action, use bold colors, and create visual tension. Never include text overlays in the image prompt — YouTube handles text separately.`,
        },
        {
          role: "user",
          content: `Create a thumbnail image generation prompt for this video:
Title: "${videoTitle}"
Description: "${(videoDescription || "").substring(0, 300)}"
Type: ${videoType}

Return ONLY the image generation prompt, nothing else. Make it specific, visual, and optimized for a 1280x720 YouTube thumbnail.`,
        },
      ],
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

    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      logger.warn("Image generation credentials not configured, skipping thumbnail", { videoDbId });
      return false;
    }

    logger.info("Generating thumbnail image", { videoDbId, youtubeId, promptLength: prompt.length });

    let imageBuffer: Buffer;
    try {
      const { generateImageBuffer: genImg } = await import("./replit_integrations/image/client");
      imageBuffer = await genImg(prompt, "1024x1024");
    } catch (imgErr) {
      logger.error("Image generation API failed", { videoDbId, error: String(imgErr) });
      return false;
    }

    if (!imageBuffer || imageBuffer.length < 1000) {
      logger.warn("Generated image too small, skipping upload", { videoDbId, size: imageBuffer?.length });
      return false;
    }

    const { setYouTubeThumbnail } = await import("./youtube");
    await setYouTubeThumbnail(channelId, youtubeId, imageBuffer, "image/png");

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

    await db.insert(notifications).values({
      userId,
      type: "autopilot",
      title: "Auto-Thumbnail Generated",
      message: `AI-generated thumbnail uploaded for "${videoTitle}"`,
      severity: "info",
    });
    sendSSEEvent(userId, "notification", { type: "new" });
    sendSSEEvent(userId, "content-update", { type: "thumbnail_generated", videoId: videoDbId });

    return true;
  } catch (err) {
    logger.error("Auto-thumbnail generation failed", { videoDbId, error: String(err) });
    return false;
  }
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
    if (meta.autoThumbnailGenerated) return false;

    const youtubeId = meta.youtubeId;
    if (!youtubeId || !video.channelId) return false;

    return await generateAndUploadThumbnail(
      userId,
      videoDbId,
      video.title,
      video.description || "",
      video.type || "video",
      youtubeId,
      video.channelId
    );
  } catch (err) {
    logger.error("Thumbnail generation for new video failed", { videoDbId, error: String(err) });
    return false;
  }
}
