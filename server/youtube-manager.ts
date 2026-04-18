import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import {
  managedPlaylists, playlistItems, descriptionTemplates, linkedChannels,
  videos, channels,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

import { createLogger } from "./lib/logger";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";

const logger = createLogger("youtube-manager");
const openai = getOpenAIClient();

export async function createManagedPlaylist(
  userId: string,
  data: { title: string; description?: string; strategy?: string }
) {
  try {
    const [playlist] = await db.insert(managedPlaylists).values({
      userId,
      title: data.title,
      description: data.description || "",
      strategy: data.strategy || "topic",
      videoCount: 0,
      autoManaged: false,
    }).returning();
    return playlist;
  } catch (error) {
    logger.error("Failed to create managed playlist:", error);
    throw new Error("Could not create playlist");
  }
}

export async function getPlaylists(userId: string) {
  try {
    return await db.select().from(managedPlaylists)
      .where(eq(managedPlaylists.userId, userId))
      .orderBy(desc(managedPlaylists.createdAt));
  } catch (error) {
    logger.error("Failed to get playlists:", error);
    return [];
  }
}

export async function autoOrganizePlaylists(userId: string) {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    if (userChannels.length === 0) {
      return { suggestions: [], message: "No channels found" };
    }

    const userVideos = await storage.getVideosByUser(userId);
    const videoSummary = userVideos.slice(0, 50).map(v =>
      `- "${sanitizeForPrompt(v.title)}" (${sanitizeForPrompt(v.type)}, tags: ${sanitizeForPrompt(v.metadata?.tags?.join(", ") || "none")})`
    ).join("\n");

    const existingPlaylists = await db.select().from(managedPlaylists)
      .where(eq(managedPlaylists.userId, userId));

    const prompt = `You are a YouTube playlist strategist. Analyze these videos and suggest optimal playlist groupings.

Videos:
${videoSummary || "No videos yet"}

Existing playlists: ${sanitizeForPrompt(existingPlaylists.map(p => p.title).join(", ")) || "None"}

Suggest playlist groupings as JSON:
{
  "suggestions": [
    {
      "title": "Playlist name",
      "description": "SEO-optimized playlist description",
      "strategy": "series | topic | best-of | tutorial | seasonal",
      "videoTitles": ["titles of videos that belong here"],
      "reasoning": "Why this grouping works for growth"
    }
  ],
  "message": "Brief summary of the organization strategy"
}

Focus on:
- Series detection (Part 1, Part 2, Episode, etc.)
- Topic clustering for SEO
- Best-of compilations for new subscriber funnels
- Tutorial sequences for watch-time optimization`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      // AUDIT FIX: typeof guard handles already-parsed objects from proxy; log snippet on failure for diagnostics
      return typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      logger.error("[YoutubeManager] Failed to parse playlist organization response:", content?.substring?.(0, 200));
      return {};
    }
  } catch (error) {
    logger.error("Failed to auto-organize playlists:", error);
    return { suggestions: [], message: "Unable to analyze videos at this time" };
  }
}

export async function addToPlaylist(playlistId: number, videoId: number, position?: number) {
  try {
    const existingItems = await db.select().from(playlistItems)
      .where(eq(playlistItems.playlistId, playlistId))
      .orderBy(desc(playlistItems.position));

    const nextPosition = position ?? ((existingItems[0]?.position ?? -1) + 1);

    const [item] = await db.insert(playlistItems).values({
      playlistId,
      videoId,
      position: nextPosition,
      addedAt: new Date(),
    }).returning();

    await db.update(managedPlaylists)
      .set({
        videoCount: sql`${managedPlaylists.videoCount} + 1`,
        lastUpdatedAt: new Date(),
      })
      .where(eq(managedPlaylists.id, playlistId));

    return item;
  } catch (error) {
    logger.error("Failed to add to playlist:", error);
    throw new Error("Could not add video to playlist");
  }
}

export async function getPlaylistSeoScore(playlistId: number) {
  try {
    const [playlist] = await db.select().from(managedPlaylists)
      .where(eq(managedPlaylists.id, playlistId));
    if (!playlist) return { score: 0, recommendations: ["Playlist not found"] };

    const items = await db.select().from(playlistItems)
      .where(eq(playlistItems.playlistId, playlistId))
      .orderBy(playlistItems.position);

    const videoIds = items.map(i => i.videoId).filter(Boolean) as number[];
    const playlistVideos: Array<{ title: string; description: string | null; metadata: any }> = [];
    for (const vid of videoIds) {
      const v = await storage.getVideo(vid);
      if (v) playlistVideos.push({ title: v.title, description: v.description, metadata: v.metadata });
    }

    const prompt = `You are a YouTube SEO expert. Score this playlist's SEO effectiveness.

Playlist Title: "${sanitizeForPrompt(playlist.title)}"
Playlist Description: "${sanitizeForPrompt(playlist.description || "None")}"
Strategy: ${sanitizeForPrompt(playlist.strategy)}
Videos (${playlistVideos.length}):
${playlistVideos.map((v, i) => `${i + 1}. "${sanitizeForPrompt(v.title)}" - tags: ${sanitizeForPrompt(v.metadata?.tags?.join(", ") || "none")}`).join("\n")}

Score and analyze as JSON:
{
  "score": 0-100,
  "titleScore": 0-100,
  "descriptionScore": 0-100,
  "orderingScore": 0-100,
  "keywordCoverage": 0-100,
  "recommendations": ["5 specific improvements"],
  "suggestedTitle": "Optimized playlist title if current is weak",
  "suggestedDescription": "Optimized description if current is weak"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    let result;
    try {
      // AUDIT FIX: typeof guard handles already-parsed objects from proxy; log snippet on failure for diagnostics
      result = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      logger.error("[YoutubeManager] Failed to parse SEO score response:", content?.substring?.(0, 200));
      result = {};
    }

    await db.update(managedPlaylists)
      .set({ seoScore: result.score })
      .where(eq(managedPlaylists.id, playlistId));

    return result;
  } catch (error) {
    logger.error("Failed to get playlist SEO score:", error);
    return { score: 0, recommendations: ["Unable to analyze playlist SEO at this time"] };
  }
}

function detectVideoContentType(video: { title: string; description?: string | null; metadata?: any }): "live_stream" | "clip" | "short" | "regular" {
  const meta = video.metadata as any || {};
  const title = (video.title || "").toLowerCase();

  if (meta.isLive === true || meta.videoType === "live_stream" ||
      /\b(full\s*stream|live\s*stream|live\s*vod|vod|full\s*vod|\bstream\b|\blive\b)\b/.test(title)) {
    return "live_stream";
  }
  if (meta.videoType === "short" || /\b(#shorts?|short\s*form|60\s*sec)\b/.test(title) ||
      (meta.duration && Number(meta.duration) <= 60)) {
    return "short";
  }
  if (meta.videoType === "clip" ||
      /\b(clip|highlight|moment|best\s*(moment|play|kills?)|montage|compilation|funniest|reaction)\b/.test(title) ||
      (meta.duration && Number(meta.duration) <= 300)) {
    return "clip";
  }
  return "regular";
}

export async function generatePinnedComment(userId: string, videoId: number) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { comment: "", error: "Video not found" };

    const userChannels = await storage.getChannelsByUser(userId);
    const socialLinks = await db.select().from(linkedChannels)
      .where(eq(linkedChannels.userId, userId));

    const linksContext = socialLinks.map(l =>
      `${sanitizeForPrompt(l.platform)}: ${l.profileUrl || l.username || "connected"}`
    ).join(", ");

    const contentType = detectVideoContentType({ title: video.title, description: video.description, metadata: video.metadata });

    const typeGuidance: Record<string, string> = {
      live_stream: `This is a live stream VOD. The comment should:
- Mention key timestamps or moments from the stream (if known from title/description)
- Ask viewers which part they enjoyed most
- Promote upcoming live stream schedule
- CTA: "Follow/subscribe to catch us live next time!"`,
      clip: `This is a highlight clip. The comment should:
- Reference the specific moment shown in the clip
- Ask viewers to share their reaction
- Direct them to the full video or channel
- CTA: "Watch the full stream/video on the channel!"`,
      short: `This is a YouTube Short. The comment should:
- Be very brief and punchy (max 200 chars)
- Start with a bold statement or question
- Drive to subscribe for more
- CTA: "Subscribe for daily clips!"`,
      regular: `This is a regular video. The comment should:
- Start with a question or bold statement about the video content
- Include a clear CTA (subscribe, comment, share)
- Reference specific content from the video
- Keep it authentic and not spammy`,
    };

    const prompt = `You are a YouTube engagement expert. Generate a pinned comment for this video that maximizes engagement.

Video Title: "${sanitizeForPrompt(video.title)}"
Video Description: "${sanitizeForPrompt((video.description || "None").substring(0, 300))}"
Content Type: ${contentType}
Creator's channels: ${sanitizeForPrompt(userChannels.map(c => c.channelName).join(", ")) || "ET Gaming 274"}
Social links: ${linksContext || "None provided"}

${typeGuidance[contentType]}

Generate as JSON with exactly these fields:
{
  "comment": "The full pinned comment text. Max 450 characters. Must be type-appropriate per the guidance above.",
  "strategy": "One sentence: why this comment drives engagement for this content type",
  "expectedImpact": "Brief impact estimate"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      // AUDIT FIX: typeof guard handles already-parsed objects from proxy; log snippet on failure for diagnostics
      return typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      logger.error("[YoutubeManager] Failed to parse pinned comment response:", content?.substring?.(0, 200));
      return {};
    }
  } catch (error) {
    logger.error("Failed to generate pinned comment:", error);
    return { comment: "", strategy: "", expectedImpact: "", error: "Unable to generate comment" };
  }
}

export async function buildDescriptionLinks(userId: string) {
  try {
    const socialLinks = await db.select().from(linkedChannels)
      .where(eq(linkedChannels.userId, userId));

    const userChannels = await storage.getChannelsByUser(userId);

    const linksData = socialLinks.map(l => ({
      platform: l.platform,
      url: l.profileUrl || "",
      username: l.username || "",
    }));

    const prompt = `You are a YouTube description optimization expert. Build a reusable description template with social links.

Creator's platforms:
${linksData.map(l => `- ${sanitizeForPrompt(l.platform)}: ${l.url || l.username || "connected"}`).join("\n") || "No links provided"}

YouTube channels: ${sanitizeForPrompt(userChannels.map(c => c.channelName).join(", ")) || "None"}

Generate as JSON:
{
  "template": "A full reusable description template with placeholders like {{VIDEO_DESCRIPTION}}, {{TIMESTAMPS}}, and all social links formatted professionally. Include sections: video description area, timestamps placeholder, social links, hashtags placeholder, affiliate disclaimer placeholder.",
  "variables": ["list of placeholder variables used"],
  "seoTips": ["3 tips for using this template effectively"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    let result;
    try {
      // AUDIT FIX: typeof guard handles already-parsed objects from proxy; log snippet on failure for diagnostics
      result = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      logger.error("[YoutubeManager] Failed to parse description links response:", content?.substring?.(0, 200));
      result = {};
    }

    await db.insert(descriptionTemplates).values({
      userId,
      name: "Auto-Generated Links Template",
      category: "social-links",
      content: result.template,
      variables: result.variables || [],
    });

    return result;
  } catch (error) {
    logger.error("Failed to build description links:", error);
    return { template: "", variables: [], seoTips: [] };
  }
}

export async function generateMultiLanguageMetadata(
  userId: string,
  videoId: number,
  languages: string[]
) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) return { translations: {}, error: "Video not found" };

    const prompt = `You are a professional translator specializing in YouTube SEO. Translate this video's metadata into the requested languages while maintaining SEO effectiveness.

Original Title: "${sanitizeForPrompt(video.title)}"
Original Description: "${sanitizeForPrompt(video.description || "None")}"
Original Tags: ${video.metadata?.tags?.join(", ") || "None"}
Target Languages: ${sanitizeForPrompt(languages.join(", "))}

Generate translations as JSON:
{
  "translations": {
${languages.map(lang => `    "${lang}": {
      "title": "SEO-optimized translated title",
      "description": "Translated description maintaining keywords",
      "tags": ["translated and localized tags"]
    }`).join(",\n")}
  }
}

Important:
- Adapt idioms and cultural references, don't just literally translate
- Maintain keyword density for local SEO
- Include local trending terms where relevant
- Keep titles under 100 characters`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");
    try {
      // AUDIT FIX: typeof guard handles already-parsed objects from proxy; log snippet on failure for diagnostics
      return typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      logger.error("[YoutubeManager] Failed to parse multi-language metadata response:", content?.substring?.(0, 200));
      return {};
    }
  } catch (error) {
    logger.error("Failed to generate multi-language metadata:", error);
    return { translations: {} };
  }
}

export async function batchPushOptimizations(userId: string, videoIds: number[]) {
  try {
    const results: Array<{ videoId: number; status: string }> = [];

    for (const videoId of videoIds) {
      try {
        const video = await storage.getVideo(videoId);
        if (!video) {
          results.push({ videoId, status: "not_found" });
          continue;
        }

        const currentMetadata = video.metadata || { tags: [] };
        await storage.updateVideo(videoId, {
          metadata: {
            ...currentMetadata,
            tags: currentMetadata.tags || [],
            aiOptimized: true,
            aiOptimizedAt: new Date().toISOString(),
          },
        });
        results.push({ videoId, status: "marked_for_push" });
      } catch {
        results.push({ videoId, status: "failed" });
      }
    }

    return {
      total: videoIds.length,
      successful: results.filter(r => r.status === "marked_for_push").length,
      failed: results.filter(r => r.status === "failed").length,
      results,
    };
  } catch (error) {
    logger.error("Failed to batch push optimizations:", error);
    return { total: videoIds.length, successful: 0, failed: videoIds.length, results: [] };
  }
}
