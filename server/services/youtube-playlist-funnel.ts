/**
 * youtube-playlist-funnel.ts
 *
 * Retention Feature — Playlist Funneling
 *
 * Creates and maintains per-game "funnel" playlists that sequence content as:
 *   Shorts → Long-form → More Long-form
 *
 * The goal: a viewer who finishes a 45-second Short sees the full session
 * auto-queued next. The playlist converts casual passers-by into dedicated
 * viewers who binge the whole back catalog for a game.
 *
 * Rules:
 *   - One playlist per game per user ("Battlefield 6 — ET Gaming 274")
 *   - Shorts are positioned first (oldest → newest), long-form after
 *   - Includes BOTH back-catalog source videos AND autopilot-published clips
 *   - Uses addedVideoIds (jsonb set) for exact deduplication — quota-safe
 *   - Publishers call addToFunnelPlaylistImmediate() for real-time inclusion
 *   - Batch sync runs in the AI orchestrator light cycle (~4h)
 *   - Quota cost: playlists.insert (50) + playlistItems.insert (50) per add
 */

import { db } from "../db";
import { channels, backCatalogVideos, playlistFunnels } from "@shared/schema";
import { eq, and, isNotNull, desc, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("playlist-funnel");

const MAX_VIDEOS_PER_RUN = 20;
const MAX_NEW_PLAYLISTS_PER_RUN = 3;

const SHORT_TYPES = new Set([
  "youtube_short", "auto-clip", "vod-short", "platform_short",
  "youtube_shorts", "short", "shorts",
]);

export interface PlaylistFunnelResult {
  playlistsCreated: number;
  videosAdded: number;
  gamesProcessed: number;
  errors: string[];
}

// ── YouTube API helpers (inline to avoid coupling to internal playlist-manager) ─

async function ytCreatePlaylist(channelId: number, title: string, description: string): Promise<string | null> {
  try {
    const { getAuthenticatedClient } = await import("../youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const res = await youtube.playlists.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: "public" },
      },
    });
    return res.data.id ?? null;
  } catch (err: any) {
    logger.error("[PlaylistFunnel] Failed to create playlist", { title, error: String(err).slice(0, 200) });
    return null;
  }
}

async function ytAddToPlaylist(channelId: number, youtubePlaylistId: string, videoId: string): Promise<boolean> {
  try {
    const { getAuthenticatedClient } = await import("../youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId: youtubePlaylistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      },
    });
    return true;
  } catch (err: any) {
    const msg = String(err).slice(0, 200);
    if (msg.includes("duplicate") || msg.includes("already") || msg.includes("409")) {
      return true;
    }
    logger.warn("[PlaylistFunnel] Failed to add video to playlist", { videoId, youtubePlaylistId, error: msg });
    return false;
  }
}

// ── Playlist title/description for a game ─────────────────────────────────────

function buildPlaylistTitle(gameName: string): string {
  const formatted = gameName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return `${formatted} — ET Gaming 274`;
}

function buildPlaylistDescription(gameName: string): string {
  const formatted = gameName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return [
    `${formatted} no-commentary gameplay — ET Gaming 274.`,
    `Starts with quick Shorts, then full sessions. No facecam. No fake reactions. Just the game.`,
    `Subscribe to stay in the loop: https://www.youtube.com/@etgaming274`,
  ].join("\n");
}

// ── Core: sync funnel for one game ───────────────────────────────────────────
// Uses addedVideoIds (jsonb set) for exact dedup instead of positional counts.
// This correctly handles the union of back_catalog_videos + autopilot_queue sources.

async function syncGameFunnel(
  userId: string,
  channelId: number,
  gameName: string,
  videos: Array<{ youtubeVideoId: string; isShort: boolean; publishedAt: Date | null }>,
): Promise<{ created: boolean; added: number }> {
  const existing = await db
    .select()
    .from(playlistFunnels)
    .where(and(eq(playlistFunnels.userId, userId), eq(playlistFunnels.gameName, gameName)))
    .limit(1);

  let funnel = existing[0] ?? null;
  let created = false;

  if (!funnel) {
    const ytPlaylistId = await ytCreatePlaylist(
      channelId,
      buildPlaylistTitle(gameName),
      buildPlaylistDescription(gameName),
    );
    if (!ytPlaylistId) return { created: false, added: 0 };

    const [inserted] = await db.insert(playlistFunnels).values({
      userId,
      channelId,
      gameName,
      youtubePlaylistId: ytPlaylistId,
      funnelType: "mixed",
      videoCount: 0,
      shortsCount: 0,
      longFormCount: 0,
      addedVideoIds: [] as any,
    }).returning();

    funnel = inserted;
    created = true;
    logger.info(`[PlaylistFunnel] Created funnel for "${gameName}" → ${ytPlaylistId}`);
  }

  // Set-based dedup: check exact YouTube IDs already added to this funnel
  const addedIds = new Set<string>((funnel.addedVideoIds as string[] | null) ?? []);

  // Separate and filter out already-added videos
  const newShorts = videos
    .filter(v => v.isShort && !addedIds.has(v.youtubeVideoId))
    .sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
  const newLongForms = videos
    .filter(v => !v.isShort && !addedIds.has(v.youtubeVideoId))
    .sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));

  let added = 0;
  let newShortsAdded = 0;
  let newLongFormsAdded = 0;

  for (const v of newShorts) {
    if (added >= MAX_VIDEOS_PER_RUN) break;
    const ok = await ytAddToPlaylist(channelId, funnel.youtubePlaylistId, v.youtubeVideoId);
    if (ok) {
      addedIds.add(v.youtubeVideoId);
      added++;
      newShortsAdded++;
    }
  }

  for (const v of newLongForms) {
    if (added >= MAX_VIDEOS_PER_RUN) break;
    const ok = await ytAddToPlaylist(channelId, funnel.youtubePlaylistId, v.youtubeVideoId);
    if (ok) {
      addedIds.add(v.youtubeVideoId);
      added++;
      newLongFormsAdded++;
    }
  }

  if (added > 0) {
    await db.update(playlistFunnels)
      .set({
        videoCount: addedIds.size,
        shortsCount: (funnel.shortsCount ?? 0) + newShortsAdded,
        longFormCount: (funnel.longFormCount ?? 0) + newLongFormsAdded,
        addedVideoIds: [...addedIds] as any,
        lastVideoAddedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playlistFunnels.id, funnel.id));
  }

  return { created, added };
}

// ── Immediate add: called by publishers right after each upload ───────────────
// Non-fatal — a playlist failure never blocks the upload status update.
// Uses the same addedVideoIds set dedup as the batch sync for quota safety.

export async function addToFunnelPlaylistImmediate(
  userId: string,
  channelId: number,
  youtubeVideoId: string,
  gameName: string,
  isShort: boolean,
): Promise<void> {
  try {
    const normalizedGame = (gameName || "").toLowerCase().trim();
    if (!normalizedGame) return;

    const existing = await db
      .select()
      .from(playlistFunnels)
      .where(and(eq(playlistFunnels.userId, userId), eq(playlistFunnels.gameName, normalizedGame)))
      .limit(1);

    let funnel = existing[0] ?? null;

    if (!funnel) {
      const ytPlaylistId = await ytCreatePlaylist(
        channelId,
        buildPlaylistTitle(normalizedGame),
        buildPlaylistDescription(normalizedGame),
      );
      if (!ytPlaylistId) return;

      const [inserted] = await db.insert(playlistFunnels).values({
        userId,
        channelId,
        gameName: normalizedGame,
        youtubePlaylistId: ytPlaylistId,
        funnelType: "mixed",
        videoCount: 0,
        shortsCount: 0,
        longFormCount: 0,
        addedVideoIds: [] as any,
      }).returning();
      funnel = inserted;
      logger.info(`[PlaylistFunnel] Created funnel (immediate) for "${normalizedGame}" → ${ytPlaylistId}`);
    }

    const addedIds = new Set<string>((funnel.addedVideoIds as string[] | null) ?? []);
    if (addedIds.has(youtubeVideoId)) return;

    const ok = await ytAddToPlaylist(channelId, funnel.youtubePlaylistId, youtubeVideoId);
    if (!ok) return;

    addedIds.add(youtubeVideoId);
    await db.update(playlistFunnels)
      .set({
        videoCount: addedIds.size,
        shortsCount: isShort ? (funnel.shortsCount ?? 0) + 1 : funnel.shortsCount,
        longFormCount: !isShort ? (funnel.longFormCount ?? 0) + 1 : funnel.longFormCount,
        addedVideoIds: [...addedIds] as any,
        lastVideoAddedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playlistFunnels.id, funnel.id));

    logger.info(`[PlaylistFunnel] Immediate add: ${youtubeVideoId} → "${normalizedGame}" funnel (${isShort ? "short" : "long-form"})`);
  } catch (err: any) {
    logger.warn(`[PlaylistFunnel] addToFunnelPlaylistImmediate non-fatal: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Batch sync: wired in orchestrator light cycle (~4h) ───────────────────────
// Merges two content sources per game:
//   1. back_catalog_videos (public/unlisted source streams)
//   2. autopilot_queue (uploaded clips — Shorts and long-form)
// Dedup is handled by addedVideoIds so both sources can be mixed safely.

export async function syncPlaylistFunnels(userId: string): Promise<PlaylistFunnelResult> {
  const result: PlaylistFunnelResult = { playlistsCreated: 0, videosAdded: 0, gamesProcessed: 0, errors: [] };

  try {
    const ytChannel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(
        eq(channels.userId, userId),
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ))
      .limit(1);

    if (!ytChannel.length) {
      logger.info("[PlaylistFunnel] No authenticated YouTube channel — skipping");
      return result;
    }

    const channelId = ytChannel[0].id;

    // Source 1: back_catalog_videos (published source streams)
    const catalogVideos = await db
      .select({
        youtubeVideoId: backCatalogVideos.youtubeVideoId,
        gameName: backCatalogVideos.gameName,
        isShort: backCatalogVideos.isShort,
        publishedAt: backCatalogVideos.publishedAt,
      })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        isNotNull(backCatalogVideos.gameName),
        isNotNull(backCatalogVideos.youtubeVideoId),
        inArray(backCatalogVideos.privacyStatus as any, ["public", "unlisted"]),
      ))
      .orderBy(desc(backCatalogVideos.publishedAt));

    // Source 2: autopilot_queue uploaded clips (Shorts + long-form generated by the system)
    type ClipRow = { youtubeVideoId: string; gameName: string; isShort: boolean; publishedAt: Date | null };
    let autopilotClips: ClipRow[] = [];
    try {
      const rows = await db.execute(sql`
        SELECT
          metadata->>'youtubeId'   AS youtube_video_id,
          LOWER(COALESCE(metadata->>'gameName', '')) AS game_name,
          CASE
            WHEN type IN ('youtube_short','auto-clip','vod-short','platform_short','youtube_shorts','short','shorts')
              OR LOWER(COALESCE(metadata->>'contentType','')) LIKE '%short%'
            THEN true ELSE false
          END AS is_short,
          updated_at AS published_at
        FROM autopilot_queue
        WHERE user_id = ${userId}
          AND status = 'uploaded'
          AND metadata->>'youtubeId' IS NOT NULL
          AND metadata->>'gameName'  IS NOT NULL
          AND metadata->>'gameName'  != ''
        ORDER BY updated_at DESC
        LIMIT 500
      `);
      autopilotClips = (rows.rows as any[]).map(r => ({
        youtubeVideoId: r.youtube_video_id as string,
        gameName: r.game_name as string,
        isShort: r.is_short === true || r.is_short === "true" || r.is_short === "t",
        publishedAt: r.published_at ? new Date(r.published_at as string) : null,
      })).filter(r => r.youtubeVideoId && r.gameName);
    } catch (err: any) {
      logger.warn(`[PlaylistFunnel] autopilot_queue clip fetch failed (non-fatal): ${err?.message?.slice(0, 120)}`);
    }

    // Merge both sources per game, deduplicated by YouTube ID
    type VideoEntry = { youtubeVideoId: string; isShort: boolean; publishedAt: Date | null };
    const byGame = new Map<string, Map<string, VideoEntry>>();

    for (const v of catalogVideos) {
      const game = (v.gameName ?? "").toLowerCase().trim();
      if (!game) continue;
      if (!byGame.has(game)) byGame.set(game, new Map());
      byGame.get(game)!.set(v.youtubeVideoId!, {
        youtubeVideoId: v.youtubeVideoId!,
        isShort: v.isShort ?? false,
        publishedAt: v.publishedAt,
      });
    }

    for (const v of autopilotClips) {
      const game = v.gameName;
      if (!game) continue;
      if (!byGame.has(game)) byGame.set(game, new Map());
      if (!byGame.get(game)!.has(v.youtubeVideoId)) {
        byGame.get(game)!.set(v.youtubeVideoId, v);
      }
    }

    // Only process games with at least 1 video; prioritise games with most content
    const gamesWithContent = [...byGame.entries()]
      .filter(([, vids]) => vids.size >= 1)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 10);

    let newPlaylists = 0;
    for (const [gameName, vidMap] of gamesWithContent) {
      if (newPlaylists >= MAX_NEW_PLAYLISTS_PER_RUN) break;
      try {
        const videos = [...vidMap.values()];
        const { created, added } = await syncGameFunnel(userId, channelId, gameName, videos);
        if (created) newPlaylists++;
        result.playlistsCreated += created ? 1 : 0;
        result.videosAdded += added;
        result.gamesProcessed++;
      } catch (err: any) {
        result.errors.push(`${gameName}: ${err?.message?.slice(0, 100)}`);
      }
    }

    logger.info(`[PlaylistFunnel] Done — ${result.playlistsCreated} created, ${result.videosAdded} videos added across ${result.gamesProcessed} games`);
  } catch (err: any) {
    result.errors.push(err?.message?.slice(0, 200) ?? "unknown error");
    logger.error("[PlaylistFunnel] Fatal error", { error: String(err).slice(0, 300) });
  }

  return result;
}

export async function getPlaylistFunnelStatus(userId: string): Promise<{
  totalFunnels: number;
  totalVideosIndexed: number;
  games: Array<{ gameName: string; videoCount: number; shortsCount: number; longFormCount: number; youtubePlaylistId: string }>;
}> {
  const funnels = await db
    .select()
    .from(playlistFunnels)
    .where(eq(playlistFunnels.userId, userId))
    .orderBy(desc(playlistFunnels.videoCount));

  return {
    totalFunnels: funnels.length,
    totalVideosIndexed: funnels.reduce((s, f) => s + (f.videoCount ?? 0), 0),
    games: funnels.map(f => ({
      gameName: f.gameName,
      videoCount: f.videoCount ?? 0,
      shortsCount: f.shortsCount ?? 0,
      longFormCount: f.longFormCount ?? 0,
      youtubePlaylistId: f.youtubePlaylistId,
    })),
  };
}
