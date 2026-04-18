import { db } from "./db";
import { videos, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, isNull, desc, lt, sql } from "drizzle-orm";
import { getOpenAIClient } from "./lib/openai";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";
import { getQuotaStatus, trackQuotaUsage, isQuotaBreakerTripped, markQuotaErrorFromResponse } from "./services/youtube-quota-tracker";

const logger = createLogger("auto-thumbnail");
const openai = getOpenAIClient();

const MAX_THUMBNAILS_PER_RUN = 3;
const disconnectedChannels = new Set<number>();
let disconnectedChannelsTTL = 0;

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
  try {
    const researchSection = researchContext
      ? `\n\nWEB RESEARCH — REAL THUMBNAIL INTELLIGENCE:\nYou have studied real successful gaming thumbnails from the internet. Use these findings to inform your design:\n\n${researchContext}\n\nAPPLY these research-backed patterns. Do NOT ignore this intelligence — it comes from analyzing what actually works on YouTube right now.`
      : "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the world's best YouTube thumbnail designer — your thumbnails consistently achieve 8-15% CTR, outperforming 99% of creators. You combine the skills of:

ELITE VISUAL DESIGNER: You understand color psychology (red/yellow = urgency, blue = trust), visual hierarchy, the rule of thirds, and how to create depth and dimension in a single frame.

AUDIENCE PSYCHOLOGIST: You know that viewers decide to click in 0.3 seconds. You design thumbnails that trigger emotional responses — shock, curiosity, excitement, FOMO — that make clicking feel involuntary.

DATA-DRIVEN OPTIMIZER: You study what gets 10M+ views. High-contrast color blocking. Dramatic lighting with strong shadows. Clear focal point with bokeh/blur backgrounds. Expressive character reactions. Visual tension that implies a story.

ANTI-CLICKBAIT PRINCIPLE: Your thumbnails are compelling but HONEST. They accurately represent the video content. They create curiosity without deception. They build long-term viewer trust, not short-term clicks that lead to disappointment.

RULES FOR THE IMAGE PROMPT:
- Create EXTREME visual contrast (light vs dark, warm vs cool)
- Feature dramatic action, reaction, or emotion as the focal point
- Use cinematic lighting — golden hour, rim lighting, or dramatic spotlights
- Include depth of field (sharp subject, blurred background)
- Feature the most compelling action or peak intensity moments from the content
- Colors must POP against YouTube's white/dark backgrounds
- Never include text overlays — YouTube handles text separately
- The image should tell a story or create a question in the viewer's mind
- NEVER use misleading imagery — the thumbnail must truthfully represent what's in the video${researchSection}`,
        },
        {
          role: "user",
          content: `Create a thumbnail image generation prompt for this video:
Title: "${sanitizeForPrompt(videoTitle)}"
Description: "${sanitizeForPrompt((videoDescription || "").substring(0, 300))}"
Type: ${videoType}${gameName ? `\nGame: ${sanitizeForPrompt(gameName)}\n\nCRITICAL: This video is about "${sanitizeForPrompt(gameName)}". The thumbnail MUST visually represent "${sanitizeForPrompt(gameName)}" — its art style, characters, environments, and aesthetic. Do NOT depict any other game.` : ""}

Return ONLY the image generation prompt, nothing else. Design for a LANDSCAPE 16:9 frame (1280x720 YouTube thumbnail). The composition must fill the widescreen frame — wide, horizontal scene with the focal point centered or rule-of-thirds. No vertical or square framing.`,
        },
      ],
      max_completion_tokens: 400,
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
        sql`${sanitizeForPrompt(channels.accessToken)} IS NOT NULL`,
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
        sql`${sanitizeForPrompt(channels.accessToken)} IS NOT NULL`,
        sql`${channels.userId} IS NOT NULL`,
      ));

    if (ytChannels.length === 0) return { generated, skipped };

    for (const ytChannel of ytChannels) {
      if (generated >= MAX_THUMBNAILS_PER_RUN) break;

      if (isChannelDisconnected(ytChannel.id)) continue;
      if (ytChannel.tokenExpiresAt && ytChannel.tokenExpiresAt.getTime() < Date.now() - 86400_000) continue;

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
        sql`${sanitizeForPrompt(channels.accessToken)} IS NOT NULL`,
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
