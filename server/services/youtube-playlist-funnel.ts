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
 *   - Shorts are positioned first (position 0–N), long-form after (N+1…)
 *   - Only published (public/unlisted) back-catalog videos are included
 *   - Runs in the AI orchestrator light cycle (~4h)
 *   - Quota-safe: uses playlists.insert (50) + playlistItems.insert (50) only
 */

import { db } from "../db";
import { channels, backCatalogVideos, playlistFunnels } from "@shared/schema";
import { eq, and, isNotNull, desc, asc, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("playlist-funnel");

const MAX_VIDEOS_PER_RUN = 20;
const MAX_NEW_PLAYLISTS_PER_RUN = 3;

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

async function ytAddToPlaylist(channelId: number, youtubePlaylistId: string, videoId: string, position: number): Promise<boolean> {
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
          position,
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
  return `${gameName} — ET Gaming 274`;
}

function buildPlaylistDescription(gameName: string): string {
  return [
    `${gameName} no-commentary gameplay — ET Gaming 274.`,
    `Starts with quick Shorts, then full sessions. No facecam. No fake reactions. Just the game.`,
    `Subscribe to stay in the loop: https://www.youtube.com/@etgaming274`,
  ].join("\n");
}

// ── Core: sync funnel for one game ───────────────────────────────────────────

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
    }).returning();

    funnel = inserted;
    created = true;
    logger.info(`[PlaylistFunnel] Created funnel for "${gameName}" → ${ytPlaylistId}`);
  }

  const currentShortsCount = funnel.shortsCount ?? 0;
  const currentLongFormCount = funnel.longFormCount ?? 0;

  const shorts = videos.filter(v => v.isShort).sort((a, b) =>
    (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0)
  );
  const longForms = videos.filter(v => !v.isShort).sort((a, b) =>
    (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0)
  );

  let added = 0;

  for (let i = currentShortsCount; i < shorts.length && added < MAX_VIDEOS_PER_RUN; i++) {
    const ok = await ytAddToPlaylist(channelId, funnel.youtubePlaylistId, shorts[i].youtubeVideoId, i);
    if (ok) added++;
  }

  for (let i = currentLongFormCount; i < longForms.length && added < MAX_VIDEOS_PER_RUN; i++) {
    const position = shorts.length + i;
    const ok = await ytAddToPlaylist(channelId, funnel.youtubePlaylistId, longForms[i].youtubeVideoId, position);
    if (ok) added++;
  }

  if (added > 0) {
    await db.update(playlistFunnels)
      .set({
        videoCount: shorts.length + longForms.length,
        shortsCount: shorts.length,
        longFormCount: longForms.length,
        lastVideoAddedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playlistFunnels.id, funnel.id));
  }

  return { created, added };
}

// ── Public entry point ────────────────────────────────────────────────────────

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

    const publishedVideos = await db
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
        inArray(backCatalogVideos.privacyStatus as any, ["public", "unlisted"]),
      ))
      .orderBy(desc(backCatalogVideos.publishedAt));

    const byGame = new Map<string, typeof publishedVideos>();
    for (const v of publishedVideos) {
      const game = v.gameName!;
      if (!byGame.has(game)) byGame.set(game, []);
      byGame.get(game)!.push(v);
    }

    const gamesWithContent = [...byGame.entries()]
      .filter(([, vids]) => vids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    let newPlaylists = 0;
    for (const [gameName, videos] of gamesWithContent) {
      if (newPlaylists >= MAX_NEW_PLAYLISTS_PER_RUN) break;
      try {
        const { created, added } = await syncGameFunnel(userId, channelId, gameName, videos as any);
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
