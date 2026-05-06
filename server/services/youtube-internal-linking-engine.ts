/**
 * youtube-internal-linking-engine.ts
 *
 * Phase 6: Internal linking and playlist engine for back catalog revival.
 *
 * Makes old and new videos feed each other through:
 *   1. Game/category grouping into playlists
 *   2. Description links — source VOD on Shorts, original on long-form clips
 *   3. Pinned comment text suggestions
 *   4. End screen / card action checklists (manual, as API support is limited)
 *   5. Series/franchise grouping
 */

import { db } from "../db";
import { backCatalogVideos, channels } from "@shared/schema";
import { eq, and, desc, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
const logger = createLogger("internal-linking");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaylistSuggestion {
  name: string;
  description: string;
  videoIds: string[];  // YouTube video IDs
  rationale: string;
  priority: "high" | "medium" | "low";
}

export interface DescriptionLinkBlock {
  youtubeVideoId: string;
  linkType: "source_vod" | "original_source" | "playlist" | "related_series";
  linkText: string;
  linkUrl: string;
  insertPosition: "start" | "end";
}

export interface InternalLinkingPlan {
  userId: string;
  generatedAt: string;
  playlistSuggestions: PlaylistSuggestion[];
  descriptionLinkBlocks: DescriptionLinkBlock[];
  pinnedCommentSuggestions: Array<{ youtubeVideoId: string; text: string }>;
  endScreenChecklist: string[];
  manualActionItems: string[];
}

// ── Group videos by game/category ────────────────────────────────────────────

function groupByGame(videos: Array<{ youtubeVideoId: string; title: string; gameName?: string | null; isVod: boolean | null; isShort: boolean | null; durationSec: number | null }>): Record<string, typeof videos> {
  const groups: Record<string, typeof videos> = {};
  for (const v of videos) {
    const key = (v.gameName ?? "unknown").toLowerCase().replace(/\s+/g, "_");
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }
  return groups;
}

// ── Suggest playlists ─────────────────────────────────────────────────────────

export async function suggestPlaylists(userId: string): Promise<PlaylistSuggestion[]> {
  try {
    const videos = await db.select({
      youtubeVideoId: backCatalogVideos.youtubeVideoId,
      title: backCatalogVideos.title,
      gameName: backCatalogVideos.gameName,
      isVod: backCatalogVideos.isVod,
      isShort: backCatalogVideos.isShort,
      isOver60Min: backCatalogVideos.isOver60Min,
      durationSec: backCatalogVideos.durationSec,
      viewCount: backCatalogVideos.viewCount,
    })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        ne(backCatalogVideos.privacyStatus, "private"),
      ))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(200);

    const suggestions: PlaylistSuggestion[] = [];
    const groups = groupByGame(videos);

    for (const [gameKey, vids] of Object.entries(groups)) {
      if (gameKey === "unknown" || vids.length < 2) continue;

      const gameName = vids[0].gameName ?? gameKey;
      const videoIds = vids.map(v => v.youtubeVideoId);

      // Full playthrough playlist (VODs only)
      const vods = vids.filter(v => v.isVod && !v.isShort);
      if (vods.length >= 2) {
        suggestions.push({
          name: `${gameName} — Full Playthrough`,
          description: `Complete ${gameName} gameplay sessions from start to finish. Every stream, every moment.`,
          videoIds: vods.map(v => v.youtubeVideoId),
          rationale: `${vods.length} VODs available from ${gameName}`,
          priority: vods.length >= 5 ? "high" : "medium",
        });
      }

      // Highlights / clips playlist
      const clips = vids.filter(v => !v.isVod && !v.isShort && (v.durationSec ?? 0) < 3600);
      if (clips.length >= 3) {
        suggestions.push({
          name: `${gameName} — Best Moments & Highlights`,
          description: `The best clips and highlight moments from ${gameName} gameplay.`,
          videoIds: clips.map(v => v.youtubeVideoId),
          rationale: `${clips.length} highlight clips from ${gameName}`,
          priority: "medium",
        });
      }

      // Shorts playlist
      const shorts = vids.filter(v => v.isShort);
      if (shorts.length >= 3) {
        suggestions.push({
          name: `${gameName} Shorts`,
          description: `Short clips and quick moments from ${gameName}.`,
          videoIds: shorts.map(v => v.youtubeVideoId),
          rationale: `${shorts.length} Shorts from ${gameName}`,
          priority: "low",
        });
      }

      // Long-form segments playlist
      const longForm = vids.filter(v => !v.isShort && (v.durationSec ?? 0) >= 480 && (v.durationSec ?? 0) < 7200);
      if (longForm.length >= 3) {
        suggestions.push({
          name: `${gameName} — Curated Gameplay`,
          description: `Edited gameplay segments from ${gameName}. Each video is a standalone complete session.`,
          videoIds: longForm.map(v => v.youtubeVideoId),
          rationale: `${longForm.length} curated long-form clips from ${gameName}`,
          priority: longForm.length >= 5 ? "high" : "medium",
        });
      }
    }

    // Best Moments channel-wide playlist (top 20 by views)
    const topVideos = videos
      .filter(v => !v.isShort && (v.viewCount ?? 0) > 0)
      .slice(0, 20);
    if (topVideos.length >= 5) {
      suggestions.push({
        name: "Top Videos — Best of the Channel",
        description: "The most-watched videos on the channel. A great starting point for new viewers.",
        videoIds: topVideos.map(v => v.youtubeVideoId),
        rationale: `Channel's top ${topVideos.length} most-viewed videos`,
        priority: "high",
      });
    }

    return suggestions.slice(0, 10);  // cap at 10 suggestions
  } catch (err: any) {
    logger.warn(`[InternalLinking] suggestPlaylists failed: ${err.message?.slice(0, 200)}`);
    return [];
  }
}

// ── Generate description link blocks ─────────────────────────────────────────

export async function generateDescriptionLinks(
  userId: string,
  youtubeVideoId: string,
  sourceYoutubeId?: string,
): Promise<DescriptionLinkBlock[]> {
  const links: DescriptionLinkBlock[] = [];

  // If this is a derivative, link back to source
  if (sourceYoutubeId && sourceYoutubeId !== youtubeVideoId) {
    links.push({
      youtubeVideoId,
      linkType: "source_vod",
      linkText: "📺 Full VOD: https://youtube.com/watch?v=" + sourceYoutubeId,
      linkUrl: "https://youtube.com/watch?v=" + sourceYoutubeId,
      insertPosition: "end",
    });
  }

  // Find related videos from same game
  try {
    const [thisVideo] = await db.select({ gameName: backCatalogVideos.gameName })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
      ))
      .limit(1);

    if (thisVideo?.gameName) {
      const related = await db.select({
        youtubeVideoId: backCatalogVideos.youtubeVideoId,
        title: backCatalogVideos.title,
      })
        .from(backCatalogVideos)
        .where(and(
          eq(backCatalogVideos.userId, userId),
          eq(backCatalogVideos.gameName, thisVideo.gameName),
          ne(backCatalogVideos.youtubeVideoId, youtubeVideoId),
        ))
        .orderBy(desc(backCatalogVideos.viewCount))
        .limit(3);

      if (related.length > 0) {
        const relatedText = related
          .map(r => `🎮 ${r.title}: https://youtube.com/watch?v=${r.youtubeVideoId}`)
          .join("\n");
        links.push({
          youtubeVideoId,
          linkType: "related_series",
          linkText: `More ${thisVideo.gameName} videos:\n${relatedText}`,
          linkUrl: "",
          insertPosition: "end",
        });
      }
    }
  } catch { /* non-fatal */ }

  return links;
}

// ── Generate pinned comment suggestion ───────────────────────────────────────

export function generatePinnedCommentText(video: {
  title: string;
  gameName?: string | null;
  isVod?: boolean | null;
  sourceYoutubeId?: string | null;
}): string {
  const game = video.gameName ? ` playing ${video.gameName}` : "";
  if (video.sourceYoutubeId) {
    return `🎬 This clip is from a full stream${game}! Watch the complete VOD here: https://youtube.com/watch?v=${video.sourceYoutubeId}\n\nLike and subscribe if you want to see more!`;
  }
  if (video.isVod) {
    return `📺 This is the full stream${game}. Check out highlights and shorter clips on the channel!\n\nTimestamps are in the description. Like and subscribe for more!`;
  }
  return `🎮 Thanks for watching${game ? " — " + game : ""}! Check out more videos on the channel.\n\nLike and subscribe to see more content like this!`;
}

// ── Build full internal linking plan ─────────────────────────────────────────

export async function buildInternalLinkingPlan(userId: string): Promise<InternalLinkingPlan> {
  try {
    const [playlists] = await Promise.all([suggestPlaylists(userId)]);

    const endScreenChecklist = [
      "Add 'Subscribe' button to end screen on every video over 3 minutes",
      "Add 1-2 'Video' end screen elements linking to related uploads",
      "Use 'Best for viewer' option on the second end screen video slot",
      "Add end screens starting at 20 seconds before the video ends",
      "For Shorts, use the description link to the full VOD instead (end screens not supported on Shorts)",
    ];

    const manualActionItems = [
      "Review playlist suggestions and create the top 3 in YouTube Studio",
      "Add description links to new derivative clips referencing their source VOD",
      "Pin a comment on each high-view video with a link to related content",
      "Set up cards at 70% view time pointing to the next related video",
      "Link new Shorts back to full VOD in description",
    ];

    const pinnedCommentSuggestions = await generatePinnedCommentsForTopVideos(userId);

    logger.info(`[InternalLinking] Plan built for ${userId.slice(0, 8)}: ${playlists.length} playlists suggested`);

    return {
      userId,
      generatedAt: new Date().toISOString(),
      playlistSuggestions: playlists,
      descriptionLinkBlocks: [],
      pinnedCommentSuggestions,
      endScreenChecklist,
      manualActionItems,
    };
  } catch (err: any) {
    logger.warn(`[InternalLinking] Plan build failed: ${err.message?.slice(0, 200)}`);
    return {
      userId,
      generatedAt: new Date().toISOString(),
      playlistSuggestions: [],
      descriptionLinkBlocks: [],
      pinnedCommentSuggestions: [],
      endScreenChecklist: [],
      manualActionItems: [],
    };
  }
}

async function generatePinnedCommentsForTopVideos(userId: string): Promise<Array<{ youtubeVideoId: string; text: string }>> {
  try {
    const topVideos = await db.select()
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(5);

    return topVideos.map(v => ({
      youtubeVideoId: v.youtubeVideoId,
      text: generatePinnedCommentText({ title: v.title, gameName: v.gameName, isVod: v.isVod }),
    }));
  } catch {
    return [];
  }
}

logger.debug("[InternalLinking] Module loaded");
