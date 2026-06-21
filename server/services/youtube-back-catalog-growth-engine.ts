/**
 * youtube-back-catalog-growth-engine.ts
 *
 * Runs after every back-catalog monetization cycle and applies every available
 * YouTube growth lever to published clips:
 *
 *   Phase A — SEO sweep        (AI game-matched title / description / tags)
 *   Phase B — Thumbnail sweep  (AI-generated custom thumbnail for every clip)
 *   Phase C — Pinned comments  (engagement comment + source-VOD link on Shorts)
 *   Phase D — Playlist funnels (per-game playlist; Shorts first, long-form after)
 *
 * End screens are advisory only — the YouTube Data API no longer exposes a
 * public endScreens.insert endpoint; end screens must be set via YouTube Studio.
 * The best programmatic substitute is a pinned comment + description link.
 *
 * Limits per cycle (keeps AI + quota spend low):
 *   SEO updates    : 5
 *   Pinned comments: 3
 *   Thumbnails     : handled internally by runThumbnailBackfillSweep()
 *   Playlists      : handled internally by syncPlaylistFunnels()
 */

import { db } from "../db";
import {
  autopilotQueue,
  backCatalogDerivatives,
  channels,
  backCatalogVideos,
} from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { executeRoutedAICall } from "./ai-model-router";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { isAutonomousMode } from "../lib/autonomous";
import { updateYouTubeVideo, postAndPinComment } from "../youtube";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("back-catalog-growth");

const MAX_SEO_PER_CYCLE = 5;
const MAX_COMMENTS_PER_CYCLE = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublishedClip {
  queueId: number;
  youtubeVideoId: string;
  gameName: string | null;
  sourceYoutubeId: string | null;
  sourceTitle: string | null;
  contentType: string | null;
  title: string;
  publishedAt: Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getYouTubeChannelId(userId: string): Promise<number | null> {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** All published YouTube clips from the last 90 days that have a YouTube video ID. */
async function getPublishedClips(userId: string): Promise<PublishedClip[]> {
  const rows = await db.execute(sql`
    SELECT
      id,
      COALESCE(metadata->>'youtubeVideoId', metadata->>'youtubeId') AS yt_video_id,
      metadata->>'gameName'        AS game_name,
      metadata->>'sourceYoutubeId' AS source_yt_id,
      metadata->>'sourceTitle'     AS source_title,
      metadata->>'contentType'     AS content_type,
      COALESCE(metadata->>'title', caption, LEFT(content, 120)) AS title,
      published_at
    FROM autopilot_queue
    WHERE user_id       = ${userId}
      AND status        = 'published'
      AND (platform = 'youtube' OR target_platform = 'youtube')
      AND published_at  > NOW() - INTERVAL '90 days'
      AND (
        metadata->>'youtubeVideoId' IS NOT NULL
        OR metadata->>'youtubeId'   IS NOT NULL
      )
    ORDER BY published_at DESC
    LIMIT 60
  `);

  return (rows.rows as any[])
    .map((r) => ({
      queueId: r.id as number,
      youtubeVideoId: r.yt_video_id as string,
      gameName: (r.game_name as string | null),
      sourceYoutubeId: (r.source_yt_id as string | null),
      sourceTitle: (r.source_title as string | null),
      contentType: (r.content_type as string | null),
      title: (r.title as string) ?? "",
      publishedAt: r.published_at ? new Date(r.published_at as string) : null,
    }))
    .filter((r) => !!r.youtubeVideoId);
}

/** Set of YouTube video IDs that already have a given growth action recorded. */
async function getAlreadyProcessed(userId: string, derivativeType: string): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT derivative_youtube_id
    FROM back_catalog_derivatives
    WHERE user_id         = ${userId}
      AND derivative_type = ${derivativeType}
      AND derivative_youtube_id IS NOT NULL
  `);
  return new Set((rows.rows as any[]).map((r) => r.derivative_youtube_id as string));
}

/** Resolve the back_catalog_videos.id for a given YouTube video ID (source VOD). */
async function resolveBackCatalogId(userId: string, youtubeVideoId: string): Promise<number | null> {
  const rows = await db
    .select({ id: backCatalogVideos.id })
    .from(backCatalogVideos)
    .where(
      and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Record that a growth action was applied to a clip. */
async function recordGrowthAction(
  userId: string,
  clipYoutubeId: string,
  derivativeType: string,
  sourceYoutubeId?: string,
): Promise<void> {
  let bcvId: number | null = null;
  if (sourceYoutubeId) {
    bcvId = await resolveBackCatalogId(userId, sourceYoutubeId);
  }
  await db
    .insert(backCatalogDerivatives)
    .values({
      userId,
      backCatalogVideoId: bcvId ?? undefined,
      sourceYoutubeId: sourceYoutubeId ?? null,
      derivativeYoutubeId: clipYoutubeId,
      derivativeType,
      transformationType: derivativeType,
      createdAt: new Date(),
    } as any)
    .onConflictDoNothing()
    .catch(() => {});
}

function isShortClip(contentType: string | null, title: string): boolean {
  if (!contentType) return /short|shorts|#shorts/i.test(title);
  return /youtube.?short|short/i.test(contentType);
}

// ── Phase A: SEO Sweep ────────────────────────────────────────────────────────

async function runSEOSweep(userId: string, channelId: number): Promise<number> {
  if (isQuotaBreakerTripped()) return 0;

  const clips = await getPublishedClips(userId);
  const done = await getAlreadyProcessed(userId, "metadata_refresh");
  const toProcess = clips.filter((c) => !done.has(c.youtubeVideoId)).slice(0, MAX_SEO_PER_CYCLE);

  if (!toProcess.length) {
    logger.info("[BCGrowth] SEO sweep — all clips already optimized");
    return 0;
  }

  const focusGame = await getFocusGame();
  let updated = 0;

  for (const clip of toProcess) {
    if (isQuotaBreakerTripped()) break;
    try {
      const gameName = clip.gameName || focusGame;
      const short = isShortClip(clip.contentType, clip.title);
      const safeGame = sanitizeForPrompt(gameName, 80);
      const safeTitle = sanitizeForPrompt(clip.title, 200);
      const safeSource = clip.sourceTitle ? sanitizeForPrompt(clip.sourceTitle, 150) : null;

      const prompt = `You are an SEO expert for a YouTube PS5 no-commentary gaming channel called "ET Gaming 274".

Optimize the metadata for this ${short ? "YouTube Short" : "long-form gameplay clip"}:
Game: ${safeGame}
Current title: ${safeTitle}${safeSource ? `\nSource VOD: ${safeSource}` : ""}

Return a JSON object with EXACTLY these keys:
1. "title": ${short ? "50–60 char title, must end with #Shorts" : "60–90 char title"} — must include "${safeGame}", energetic hook, no clickbait
2. "description": 150–350 char description — include "${safeGame}", "no commentary", "PS5"${safeSource && short ? `, and a "Full session:" note` : ""}; end with 3–5 hashtags
3. "tags": array of 15–20 keyword tags (no # sign) — game name, gameplay terms, platform, style

RULES:
- NEVER mention AI, artificial intelligence, ChatGPT, Claude, or any AI tool in any field.
- NEVER use "PS5 Gameplay" as the game name — always use "${safeGame}".
- Title must deliver on its hook — no misleading claims.`;

      const aiResult = await executeRoutedAICall(
        { taskType: "vod_seo", userId, priority: "low" },
        "You are an SEO expert for YouTube. Respond with valid JSON only.",
        prompt,
      );

      const parsed = safeParseJSON(aiResult.content, {} as Record<string, unknown>);
      const newTitle = (parsed.title as string | undefined)?.slice(0, 100);
      const newDesc = (parsed.description as string | undefined)?.slice(0, 5000);
      const newTags = Array.isArray(parsed.tags) ? (parsed.tags as string[]).slice(0, 30) : [];

      if (!newTitle || !newDesc) {
        logger.warn(`[BCGrowth] SEO parse failed for ${clip.youtubeVideoId}`);
        continue;
      }

      await updateYouTubeVideo(channelId, clip.youtubeVideoId, {
        title: newTitle,
        description: newDesc,
        tags: newTags,
      }, "backlogWrite");

      await recordGrowthAction(userId, clip.youtubeVideoId, "metadata_refresh", clip.sourceYoutubeId ?? undefined);
      updated++;
      logger.info(`[BCGrowth] SEO updated: ${clip.youtubeVideoId} — "${newTitle.slice(0, 60)}"`);
    } catch (err: any) {
      logger.warn(`[BCGrowth] SEO failed for ${clip.youtubeVideoId}: ${err?.message?.slice(0, 120)}`);
    }
  }

  return updated;
}

// ── Phase B: Thumbnail Backfill ───────────────────────────────────────────────

async function runThumbnailPhase(userId: string): Promise<number> {
  try {
    const { runThumbnailBackfillSweep } = await import("../auto-thumbnail-engine");
    const result = await runThumbnailBackfillSweep(userId);
    if (result.processed > 0) {
      logger.info(`[BCGrowth] Thumbnail backfill: ${result.processed} generated, ${result.remaining} remaining`);
    }
    return result.processed;
  } catch (err: any) {
    logger.warn(`[BCGrowth] Thumbnail backfill error: ${err?.message?.slice(0, 120)}`);
    return 0;
  }
}

// ── Phase C: Pinned Comments ──────────────────────────────────────────────────
// Posts a pinned comment on each published clip that links back to the source
// VOD (for Shorts) or surfaces related content (for long-form). This is the
// best API-available substitute for end-screen linking (end screens require
// YouTube Studio since the API endpoint was deprecated in 2023).

async function runPinnedCommentPhase(userId: string, channelId: number): Promise<number> {
  if (isQuotaBreakerTripped()) return 0;

  const clips = await getPublishedClips(userId);
  const done = await getAlreadyProcessed(userId, "pinned_comment");

  // Only clips that have a source VOD and haven't been commented on yet
  const toProcess = clips
    .filter((c) => !done.has(c.youtubeVideoId) && !!c.sourceYoutubeId)
    .slice(0, MAX_COMMENTS_PER_CYCLE);

  if (!toProcess.length) {
    logger.info("[BCGrowth] Pinned comments — nothing new to comment on");
    return 0;
  }

  const focusGame = await getFocusGame();
  let posted = 0;

  for (const clip of toProcess) {
    if (isQuotaBreakerTripped()) break;
    try {
      const gameName = clip.gameName || focusGame;
      const short = isShortClip(clip.contentType, clip.title);
      const sourceUrl = `https://www.youtube.com/watch?v=${clip.sourceYoutubeId}`;
      const channelUrl = "https://www.youtube.com/@etgaming274";

      const commentText = short
        ? `🎮 This is a highlight from the full ${gameName} session — watch the complete match here:\n${sourceUrl}\n\n📌 Subscribe for daily no-commentary ${gameName} gameplay → ${channelUrl}`
        : `🎮 Full ${gameName} match — no commentary, no facecam, just the game.\n\nSource stream: ${sourceUrl}\n\n📌 Subscribe for daily uploads → ${channelUrl}`;

      const result = await postAndPinComment(channelId, clip.youtubeVideoId, commentText);
      if (result.success) {
        await recordGrowthAction(userId, clip.youtubeVideoId, "pinned_comment", clip.sourceYoutubeId ?? undefined);
        posted++;
        logger.info(`[BCGrowth] Pinned comment posted on ${clip.youtubeVideoId}`);
      } else {
        logger.warn(`[BCGrowth] Comment failed on ${clip.youtubeVideoId}: ${result.error}`);
      }
    } catch (err: any) {
      logger.warn(`[BCGrowth] Comment error on ${clip.youtubeVideoId}: ${err?.message?.slice(0, 120)}`);
    }
  }

  return posted;
}

// ── Phase D: Playlist Funnels ─────────────────────────────────────────────────

async function runPlaylistPhase(userId: string): Promise<{ created: number; added: number }> {
  try {
    const { syncPlaylistFunnels } = await import("./youtube-playlist-funnel");
    const result = await syncPlaylistFunnels(userId);
    if (result.videosAdded > 0 || result.playlistsCreated > 0) {
      logger.info(
        `[BCGrowth] Playlists: ${result.playlistsCreated} created, ${result.videosAdded} videos added across ${result.gamesProcessed} games`,
      );
    }
    return { created: result.playlistsCreated, added: result.videosAdded };
  } catch (err: any) {
    logger.warn(`[BCGrowth] Playlist sync error: ${err?.message?.slice(0, 120)}`);
    return { created: 0, added: 0 };
  }
}

// ── Phase E: Analytics-driven Shorts Optimization ────────────────────────────
// For every Short already on the channel (from video_catalog_links), fetch its
// real analytics and push AI-improved title/description/tags back to YouTube.
// These are PUBLISHED Shorts — they are NOT used as source material for new clips.
// The goal is purely to improve discoverability: better hooks, better keywords.
//
// Limits: 5/cycle, 7-day cooldown per video (tracked in back_catalog_derivatives
// with derivative_type = 'channel_short_seo').

const MAX_SHORTS_SEO_PER_CYCLE = 5;
const SHORTS_SEO_COOLDOWN_DAYS = 7;

async function runChannelShortsOptimization(userId: string, channelId: number): Promise<number> {
  if (isQuotaBreakerTripped()) return 0;

  // Fetch channel Shorts from video_catalog_links that haven't been optimized recently.
  // Cooldown = 7 days, limit = 5/cycle (hardcoded to avoid Drizzle INTERVAL param issues).
  const rows = await db.execute(sql`
    SELECT
      vcl.youtube_id,
      vcl.title,
      vcl.view_count,
      vcl.like_count,
      vcl.published_at
    FROM video_catalog_links vcl
    WHERE vcl.user_id       = ${userId}
      AND vcl.video_type    = 'short'
      AND vcl.youtube_id    IS NOT NULL
      AND vcl.title         IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM back_catalog_derivatives bcd
        WHERE bcd.user_id                = ${userId}
          AND bcd.derivative_type        = 'channel_short_seo'
          AND bcd.derivative_youtube_id  = vcl.youtube_id
          AND bcd.created_at             > NOW() - INTERVAL '7 days'
      )
    ORDER BY vcl.view_count DESC NULLS LAST
    LIMIT 5
  `);

  const shorts = (rows.rows as any[]).filter(r => !!r.youtube_id && !!r.title);
  if (!shorts.length) {
    logger.info("[BCGrowth] Phase E — all channel Shorts recently optimized");
    return 0;
  }

  const focusGame = await getFocusGame();
  let updated = 0;

  for (const short of shorts) {
    if (isQuotaBreakerTripped()) break;
    try {
      const ytId   = short.youtube_id as string;
      const views  = (short.view_count as number) ?? 0;
      const likes  = (short.like_count  as number) ?? 0;
      const safeTitle = sanitizeForPrompt(short.title as string, 200);
      const safeGame  = sanitizeForPrompt(focusGame, 80);

      const prompt = `You are an analytics-driven YouTube SEO expert for "ET Gaming 274" (no-commentary gaming channel, 6.1K subs, primarily Battlefield 6).

Analyze this SHORT already published on the channel and suggest IMPROVED metadata to drive MORE views and subscribers:

Current title: ${safeTitle}
Current stats: ${views.toLocaleString()} views, ${likes.toLocaleString()} likes

Your goal: maximize Click-Through Rate (CTR) and Watch Time. This is a SHORT (vertical, ≤60s).

Return a JSON object with EXACTLY these keys:
1. "title": 50–60 chars — punchy hook, ends with #Shorts, includes game name or moment type, NO clickbait
2. "description": 150–300 chars — strong opening line, game name, "no commentary", relevant hashtags (#BF6 #Battlefield6 #Shorts)
3. "tags": array of 15–20 tags (no # sign) — prioritize trending gaming terms

RULES:
- NEVER mention AI, ChatGPT, Claude, or any AI tool
- Make the hook specific to the gameplay moment (e.g. "insane sniper kill" not "great moment")
- Study what made high-view Shorts work: specificity + curiosity gap`;

      const aiResult = await executeRoutedAICall(
        { taskType: "vod_seo", userId, priority: "low" },
        "You are an SEO expert for YouTube. Respond with valid JSON only.",
        prompt,
      );

      const parsed = safeParseJSON(aiResult.content, {} as Record<string, unknown>);
      const newTitle = (parsed.title as string | undefined)?.slice(0, 100);
      const newDesc  = (parsed.description as string | undefined)?.slice(0, 5000);
      const newTags  = Array.isArray(parsed.tags) ? (parsed.tags as string[]).slice(0, 30) : [];

      if (!newTitle || !newDesc) {
        logger.warn(`[BCGrowth] Phase E — SEO parse failed for Short ${ytId}`);
        continue;
      }

      await updateYouTubeVideo(channelId, ytId, {
        title: newTitle,
        description: newDesc,
        tags: newTags,
      }, "backlogWrite");

      // Record cooldown so this Short isn't re-processed for 7 days
      await db.insert(backCatalogDerivatives).values({
        userId,
        backCatalogVideoId: undefined,
        sourceYoutubeId: null,
        derivativeYoutubeId: ytId,
        derivativeType: "channel_short_seo",
        transformationType: "channel_short_seo",
        createdAt: new Date(),
      } as any).onConflictDoNothing().catch(() => {});

      updated++;
      logger.info(`[BCGrowth] Phase E — Short ${ytId} SEO updated: "${newTitle.slice(0, 60)}"`);
    } catch (err: any) {
      logger.warn(`[BCGrowth] Phase E — failed for ${short.youtube_id}: ${err?.message?.slice(0, 120)}`);
    }
  }

  return updated;
}

// ── Per-boot: seed vault entries for channel Shorts (backup only) ─────────────
// The user's 2,775 published Shorts should be backed up to the vault.
// We create vault entries for any Short in video_catalog_links that doesn't
// have one yet, marked backupOnly=true so:
//   1. The perpetual downloader downloads them (backup copy on disk)
//   2. The BF6/non-BF6 vault cleanup exempts them (not source material)
//   3. The pre-encoder and back-catalog engine ignore them (no clips made)
// Rate-limited: seed at most 20 per cycle to avoid spamming the DB on boot.

export async function seedChannelShortsVaultEntries(userId: string): Promise<void> {
  try {
    const result = await db.execute(sql`
      INSERT INTO content_vault_backups
        (user_id, youtube_id, status, metadata, created_at, updated_at)
      SELECT
        vcl.user_id,
        vcl.youtube_id,
        'indexed',
        '{"backupOnly":true,"source":"channel_short_backup"}'::jsonb,
        NOW(),
        NOW()
      FROM video_catalog_links vcl
      WHERE vcl.user_id    = ${userId}
        AND vcl.video_type = 'short'
        AND vcl.youtube_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM content_vault_backups cvb
          WHERE cvb.user_id    = ${userId}
            AND cvb.youtube_id = vcl.youtube_id
        )
      ORDER BY vcl.published_at DESC NULLS LAST
      LIMIT 20
      ON CONFLICT DO NOTHING
    `);
    const seeded = (result as any)?.rowCount ?? 0;
    if (seeded > 0) {
      logger.info(`[BCGrowth] Seeded ${seeded} channel Short vault backup entries`);
    }
  } catch (err: any) {
    logger.warn(`[BCGrowth] Short vault seeding failed: ${err?.message?.slice(0, 120)}`);
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export interface BackCatalogGrowthResult {
  seoUpdated: number;
  thumbnailsGenerated: number;
  commentsPosted: number;
  playlistsCreated: number;
  videosAddedToPlaylists: number;
  shortsOptimized?: number;
  skipped?: string;
}

export async function runBackCatalogGrowthEngine(userId: string): Promise<BackCatalogGrowthResult> {
  const empty: BackCatalogGrowthResult = {
    seoUpdated: 0,
    thumbnailsGenerated: 0,
    commentsPosted: 0,
    playlistsCreated: 0,
    videosAddedToPlaylists: 0,
    shortsOptimized: 0,
  };

  const autonomous = await isAutonomousMode(userId);
  if (!autonomous) return { ...empty, skipped: "not in autonomous mode" };

  if (isQuotaBreakerTripped()) return { ...empty, skipped: "quota breaker active" };

  const channelId = await getYouTubeChannelId(userId);
  if (!channelId) return { ...empty, skipped: "no authenticated YouTube channel" };

  logger.info(`[BCGrowth] Starting growth engine cycle for ${userId.slice(0, 8)}`);

  // Seed vault entries for channel Shorts backup (non-blocking, 20/cycle max)
  seedChannelShortsVaultEntries(userId).catch(() => {});

  // Phase A — SEO sweep for published clips (autopilot_queue origin)
  const seoUpdated = await runSEOSweep(userId, channelId);

  // Phase B — Thumbnails
  const thumbnailsGenerated = await runThumbnailPhase(userId);

  // Phase C — Pinned comments (source-VOD links — best substitute for end screens)
  const commentsPosted = await runPinnedCommentPhase(userId, channelId);

  // Phase D — Playlist funnels
  const { created: playlistsCreated, added: videosAddedToPlaylists } = await runPlaylistPhase(userId);

  // Phase E — Analytics-driven Shorts optimization (channel Shorts from video_catalog_links)
  // Only pushes metadata improvements to existing published Shorts — no new clips made
  const shortsOptimized = await runChannelShortsOptimization(userId, channelId);

  logger.info(
    `[BCGrowth] Cycle complete — SEO: ${seoUpdated}, thumbs: ${thumbnailsGenerated}, ` +
    `comments: ${commentsPosted}, playlists: ${playlistsCreated}, playlist videos: ${videosAddedToPlaylists}, ` +
    `shorts optimized: ${shortsOptimized}`,
  );

  return { seoUpdated, thumbnailsGenerated, commentsPosted, playlistsCreated, videosAddedToPlaylists, shortsOptimized };
}
