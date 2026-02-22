import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, isNull, desc, lt, sql } from "drizzle-orm";
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

export async function runAutoThumbnailForUser(userId: string): Promise<number> {
  let generated = 0;
  try {
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
        if (meta.autoThumbnailGenerated) continue;
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
    if (meta.autoThumbnailGenerated) return false;

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
      await db.insert(notifications).values({
        userId,
        type: "autopilot",
        title: "Thumbnails Refreshed",
        message: `Regenerated ${regenerated} thumbnail(s) for underperforming videos to boost CTR.`,
        severity: "info",
      });
      sendSSEEvent(userId, "notification", { type: "new" });
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
