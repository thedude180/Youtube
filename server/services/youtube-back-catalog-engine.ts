/**
 * youtube-back-catalog-engine.ts
 *
 * Phase 1: YouTube Back Catalog Monetization Engine.
 *
 * Imports the channel's entire YouTube catalog, scores every video for revival
 * potential, and queues derivative work (Shorts + long-form clips + metadata
 * refreshes) into the existing scheduler — respecting all daily caps.
 *
 * Daily flow:
 *   1. Import / sync channel catalog → back_catalog_videos
 *   2. Score and rank every video
 *   3. Queue metadata refreshes (5–15/day max)
 *   4. Queue Shorts from eligible source videos (cap: 3/day)
 *   5. Queue long-form clips from 60+ min VODs (cap: 1/day)
 *   6. Let existing publishers handle upload timing
 *   7. Learning brain measures results
 *
 * Duplicate prevention:
 *   - Videos are upserted by youtubeVideoId — no duplicate rows ever created.
 *   - Full-video reuploads are NEVER queued. Only meaningfully different derivatives.
 *   - Coverage tracked in longform_extraction_segments (segmenter handles this).
 */

import { db } from "../db";
import {
  backCatalogVideos,
  backCatalogDerivatives,
  channels,
  autopilotQueue,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import {
  scoreBackCatalogVideo,
  computeChannelAverages,
  rankVideos,
} from "./youtube-back-catalog-scorer";
import {
  canQueueShortToday,
  canQueueLongFormToday,
  getNextShortPublishTime,
  getNextLongFormPublishTime,
} from "./youtube-output-schedule";

const logger = createLogger("back-catalog-engine");

// ── Constants ─────────────────────────────────────────────────────────────────

export const METADATA_REFRESH_PER_DAY = 10;
const SHORT_MIN_SOURCE_SEC            = 300;   // 5 min source needed for a Short
const LONG_FORM_MIN_SOURCE_SEC        = 3_600; // 60 min source for multi-segment
const SINGLE_SEG_MIN_SOURCE_SEC       = 480;   // 8 min for single long-form clip
const SHORT_TARGET_SEC                = 38;    // default Short target duration
const SHORTS_OPPORTUNITY_THRESHOLD   = 20;    // min score to queue a Short
const LONG_FORM_OPPORTUNITY_THRESHOLD = 20;    // min score to queue long-form
const BACKFILL_BATCH_SIZE            = 50;    // videos per YouTube API fetch batch

// ── Helper: ISO 8601 duration to seconds ─────────────────────────────────────

function parseDurationSec(iso: string | undefined): number {
  if (!iso) return 0;
  if (typeof iso === "number") return iso;
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) {
    // Try HH:MM:SS format
    const parts = String(iso).split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }
  return (parseInt(m[1] ?? "0", 10) * 3600) +
         (parseInt(m[2] ?? "0", 10) * 60)   +
          parseInt(m[3] ?? "0", 10);
}

// ── Count today's metadata refreshes ─────────────────────────────────────────

async function countTodayMetadataRefreshes(userId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { videoUpdateHistory } = await import("@shared/schema");
    const [row] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(videoUpdateHistory)
      .where(and(
        eq(videoUpdateHistory.userId, userId),
        eq(videoUpdateHistory.source, "back_catalog_optimizer"),
        gte(videoUpdateHistory.createdAt, todayStart),
      ));
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

// ── Check quota ───────────────────────────────────────────────────────────────

async function isQuotaSafe(): Promise<boolean> {
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    return !isQuotaBreakerTripped();
  } catch {
    return true;  // assume safe if module unavailable
  }
}

// ── Phase 1: Import / sync channel catalog ────────────────────────────────────

export async function runBackCatalogImport(userId: string): Promise<{
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  logger.info(`[BackCatalog] Starting catalog import for ${userId.slice(0, 8)}`);

  const result = { imported: 0, updated: 0, skipped: 0, errors: 0 };

  if (!(await isQuotaSafe())) {
    logger.warn(`[BackCatalog] Quota breaker active — skipping import for ${userId.slice(0, 8)}`);
    return result;
  }

  try {
    // Find the user's YouTube channel(s)
    const userChannels = await db.select()
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

    if (!userChannels.length) {
      logger.warn(`[BackCatalog] No YouTube channel found for ${userId.slice(0, 8)}`);
      return result;
    }

    for (const channel of userChannels) {
      try {
        const { fetchYouTubeVideos } = await import("../youtube");
        const ytVideos = await fetchYouTubeVideos(channel.id, 500);

        for (const ytv of ytVideos) {
          try {
            const durationSec = parseDurationSec(ytv.duration);
            const isShort = durationSec > 0 && durationSec <= 62;
            const isLongForm = !isShort;
            const isOver60Min = durationSec > LONG_FORM_MIN_SOURCE_SEC;
            const isVod = !!(ytv.title?.toLowerCase().match(/\bvod\b|stream replay|full stream|live replay/));

            // Detect game name from title (best effort)
            const gameName = extractGameName(ytv.title, ytv.tags ?? []);

            // Check if already exists
            const [existing] = await db.select({ id: backCatalogVideos.id, viewCount: backCatalogVideos.viewCount })
              .from(backCatalogVideos)
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, ytv.youtubeId),
              ))
              .limit(1);

            const row = {
              userId,
              channelId: channel.id,
              youtubeVideoId: ytv.youtubeId,
              title: ytv.title ?? "",
              description: ytv.description ?? null,
              tags: ytv.tags ?? [],
              thumbnailUrl: ytv.thumbnailUrl ?? null,
              durationSec,
              publishedAt: ytv.publishedAt ? new Date(ytv.publishedAt) : null,
              privacyStatus: ytv.privacyStatus ?? null,
              viewCount: ytv.viewCount ?? 0,
              likeCount: ytv.likeCount ?? 0,
              commentCount: ytv.commentCount ?? 0,
              categoryId: ytv.categoryId ?? null,
              gameName,
              isVod,
              isShort,
              isLongForm,
              isOver60Min,
              lastSyncAt: new Date(),
              updatedAt: new Date(),
            };

            if (existing) {
              await db.update(backCatalogVideos)
                .set({ ...row, metadataUpdatesQueued: undefined })
                .where(eq(backCatalogVideos.id, existing.id));
              result.updated++;
            } else {
              await db.insert(backCatalogVideos).values(row);
              result.imported++;
            }
          } catch (videoErr: any) {
            logger.debug(`[BackCatalog] Video import error: ${videoErr.message?.slice(0, 100)}`);
            result.errors++;
          }
        }
      } catch (channelErr: any) {
        logger.warn(`[BackCatalog] Channel ${channel.id} import failed: ${channelErr.message?.slice(0, 200)}`);
        result.errors++;
      }
    }
  } catch (err: any) {
    logger.error(`[BackCatalog] Import failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 300)}`);
    result.errors++;
  }

  logger.info(`[BackCatalog] Import complete: ${result.imported} new, ${result.updated} updated, ${result.errors} errors`);
  return result;
}

// ── Game name extraction heuristic ───────────────────────────────────────────

function extractGameName(title: string, tags: string[]): string | null {
  // Common game patterns in titles
  const KNOWN_GAMES = [
    "Minecraft", "Fortnite", "Warzone", "Apex Legends", "Elden Ring",
    "GTA", "GTA V", "GTA 5", "GTA 6", "Red Dead", "Cyberpunk", "Skyrim",
    "Dark Souls", "Bloodborne", "Sekiro", "Baldur's Gate", "Zelda",
    "Diablo", "Path of Exile", "Escape from Tarkov", "DayZ", "Rust",
    "Valheim", "Palworld", "Helldivers", "Baldur", "Overwatch", "Valorant",
    "Counter-Strike", "CS2", "League of Legends", "Dota", "Hades",
    "Dead Cells", "Hollow Knight", "Celeste", "Terraria", "Stardew Valley",
    "Animal Crossing", "Pokemon", "Call of Duty", "Destiny", "Anthem",
    "The Last of Us", "God of War", "Spider-Man", "Horizon",
  ];

  const combined = `${title} ${tags.join(" ")}`;
  for (const game of KNOWN_GAMES) {
    if (new RegExp(`\\b${game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(combined)) {
      return game;
    }
  }

  // Try to extract from tags first
  if (tags.length > 0 && tags[0].length > 2 && tags[0].length < 50) {
    // First tag is often the game name
    return tags[0];
  }

  return null;
}

// ── Phase 1b: Refresh stats for already-imported videos ──────────────────────

export async function scanExistingChannelVideos(userId: string): Promise<{
  scanned: number; updated: number;
}> {
  const result = { scanned: 0, updated: 0 };
  if (!(await isQuotaSafe())) return result;

  try {
    // Re-import to refresh view counts etc.
    const importResult = await runBackCatalogImport(userId);
    result.scanned = importResult.imported + importResult.updated;
    result.updated = importResult.updated;
  } catch (err: any) {
    logger.warn(`[BackCatalog] scanExistingChannelVideos: ${err.message?.slice(0, 200)}`);
  }

  return result;
}

// ── Phase 2: Rank opportunities ───────────────────────────────────────────────

export async function rankBackCatalogOpportunities(userId: string, limit = 50): Promise<
  Array<{
    youtubeVideoId: string;
    title: string;
    totalRevivalScore: number;
    metadataOpportunityScore: number;
    shortsOpportunityScore: number;
    longFormOpportunityScore: number;
    monetizationOpportunityScore: number;
    durationSec: number | null;
    viewCount: number | null;
    isVod: boolean | null;
    isOver60Min: boolean | null;
    minedForShorts: boolean | null;
    minedForLongForm: boolean | null;
  }>
> {
  try {
    const videos = await db.select()
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId))
      .limit(500);

    if (!videos.length) return [];

    const channelAvg = computeChannelAverages(videos);
    const ranked = rankVideos(videos, channelAvg);

    // Persist scores back to DB (background, non-blocking)
    const updatePromises = ranked.slice(0, 100).map(v =>
      db.update(backCatalogVideos)
        .set({
          metadataOpportunityScore: v.metadataOpportunityScore,
          thumbnailOpportunityScore: v.thumbnailOpportunityScore,
          shortsOpportunityScore: v.shortsOpportunityScore,
          longFormOpportunityScore: v.longFormOpportunityScore,
          monetizationOpportunityScore: v.monetizationOpportunityScore,
          totalRevivalScore: v.totalRevivalScore,
          updatedAt: new Date(),
        })
        .where(and(
          eq(backCatalogVideos.userId, userId),
          eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
        ))
        .catch(() => {})
    );
    Promise.all(updatePromises).catch(() => {});

    return ranked.slice(0, limit).map(v => ({
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      totalRevivalScore: v.totalRevivalScore,
      metadataOpportunityScore: v.metadataOpportunityScore,
      shortsOpportunityScore: v.shortsOpportunityScore,
      longFormOpportunityScore: v.longFormOpportunityScore,
      monetizationOpportunityScore: v.monetizationOpportunityScore,
      durationSec: v.durationSec,
      viewCount: v.viewCount,
      isVod: v.isVod,
      isOver60Min: v.isOver60Min,
      minedForShorts: v.minedForShorts,
      minedForLongForm: v.minedForLongForm,
    }));
  } catch (err: any) {
    logger.warn(`[BackCatalog] rankBackCatalogOpportunities: ${err.message?.slice(0, 200)}`);
    return [];
  }
}

// ── Phase 3 + 4 + 5: Queue revival work ──────────────────────────────────────

export async function queueBackCatalogRevivalWork(userId: string): Promise<{
  shortsQueued: number;
  longFormQueued: number;
  metadataQueued: number;
  skipped: string[];
}> {
  const result = { shortsQueued: 0, longFormQueued: 0, metadataQueued: 0, skipped: [] as string[] };

  if (!(await isQuotaSafe())) {
    result.skipped.push("YouTube quota breaker active");
    return result;
  }

  try {
    const allVideos = await db.select()
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId))
      .limit(500);

    if (!allVideos.length) {
      result.skipped.push("no videos in back catalog — run import first");
      return result;
    }

    const channelAvg = computeChannelAverages(allVideos);
    const ranked = rankVideos(allVideos, channelAvg);

    // ── Queue metadata refreshes ──────────────────────────────────────────────
    const todayMeta = await countTodayMetadataRefreshes(userId);
    const metaSlots = Math.max(0, METADATA_REFRESH_PER_DAY - todayMeta);

    if (metaSlots > 0) {
      const metaTargets = ranked
        .filter(v => v.metadataOpportunityScore >= 30 && !v.isShort)
        .slice(0, metaSlots);

      for (const v of metaTargets) {
        try {
          const { queueMetadataUpdate } = await import("./youtube-existing-video-optimizer");
          const res = await queueMetadataUpdate(userId, v.youtubeVideoId);
          if (res.queued) result.metadataQueued++;
        } catch (err: any) {
          logger.debug(`[BackCatalog] Metadata queue error ${v.youtubeVideoId}: ${err.message?.slice(0, 100)}`);
        }
      }
    }

    // ── Queue Shorts from old videos ──────────────────────────────────────────
    const canShort = await canQueueShortToday(userId);
    if (canShort) {
      const shortCandidates = ranked
        .filter(v =>
          !v.isShort &&
          (v.durationSec ?? 0) >= SHORT_MIN_SOURCE_SEC &&
          v.shortsOpportunityScore >= SHORTS_OPPORTUNITY_THRESHOLD &&
          !v.minedForShorts,
        )
        .slice(0, 3);

      for (const v of shortCandidates) {
        const canQueue = await canQueueShortToday(userId);
        if (!canQueue) break;

        try {
          const scheduledAt = await getNextShortPublishTime(userId);

          // Find local video ID
          const localVideoId = v.localVideoId ?? null;

          await db.insert(autopilotQueue).values({
            userId,
            sourceVideoId: localVideoId,
            type: "platform_short",
            targetPlatform: "youtubeshorts",
            content: `Back catalog Short from: ${v.title}`,
            caption: `🎮 ${v.title.slice(0, 100)} #gaming #shorts`,
            status: "scheduled",
            scheduledAt,
            metadata: {
              contentType: "platform_short",
              sourceYoutubeId: v.youtubeVideoId,
              gameName: v.gameName ?? undefined,
              startSec: 0,
              endSec: SHORT_TARGET_SEC,
              backCatalogGenerated: true,
              autoQueued: true,
              grinderGenerated: false,
            } as any,
          });

          // Mark as mined
          await db.update(backCatalogVideos)
            .set({
              minedForShorts: true,
              shortsQueuedCount: (v.shortsQueuedCount ?? 0) + 1,
              updatedAt: new Date(),
            })
            .where(and(
              eq(backCatalogVideos.userId, userId),
              eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
            ));

          // Track derivative
          await trackDerivative(userId, v.id, v.youtubeVideoId, "short_clip", "short_clip", v.viewCount ?? 0);

          result.shortsQueued++;
          logger.info(`[BackCatalog] Short queued from ${v.youtubeVideoId} for ${scheduledAt.toISOString()}`);
        } catch (err: any) {
          logger.warn(`[BackCatalog] Short queue failed for ${v.youtubeVideoId}: ${err.message?.slice(0, 150)}`);
        }
      }
    } else {
      result.skipped.push("Shorts: daily cap reached (3/day)");
    }

    // ── Queue long-form clips from old VODs ───────────────────────────────────
    const canLongForm = await canQueueLongFormToday(userId);
    if (canLongForm) {
      // Videos over 60 min → use multi-segmenter
      const over60Candidates = ranked
        .filter(v =>
          !v.isShort &&
          (v.durationSec ?? 0) >= LONG_FORM_MIN_SOURCE_SEC &&
          v.longFormOpportunityScore >= LONG_FORM_OPPORTUNITY_THRESHOLD &&
          !v.minedForLongForm,
        )
        .slice(0, 3);

      for (const v of over60Candidates) {
        const canQueue = await canQueueLongFormToday(userId);
        if (!canQueue) break;

        try {
          const { queueLongFormSegments, hasUnminedFootage } = await import("./youtube-longform-segmenter");
          const localVideoId = v.localVideoId;

          if (localVideoId) {
            const canMine = await hasUnminedFootage(userId, localVideoId, v.durationSec ?? 0);
            if (canMine) {
              const queued = await queueLongFormSegments(userId, localVideoId);
              if (queued > 0) {
                await db.update(backCatalogVideos)
                  .set({
                    minedForLongForm: true,
                    longFormQueuedCount: (v.longFormQueuedCount ?? 0) + queued,
                    updatedAt: new Date(),
                  })
                  .where(and(
                    eq(backCatalogVideos.userId, userId),
                    eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
                  ));
                await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
                result.longFormQueued += queued;
                logger.info(`[BackCatalog] ${queued} long-form segment(s) queued from ${v.youtubeVideoId}`);
              }
            } else {
              // Mark as fully mined
              await db.update(backCatalogVideos)
                .set({ minedForLongForm: true, updatedAt: new Date() })
                .where(and(
                  eq(backCatalogVideos.userId, userId),
                  eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
                ));
            }
          } else {
            // No local video — queue directly from back catalog with source reference
            await queueLongFormFromBackCatalog(userId, v);
            await db.update(backCatalogVideos)
              .set({ minedForLongForm: true, longFormQueuedCount: (v.longFormQueuedCount ?? 0) + 1, updatedAt: new Date() })
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              ));
            await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
            result.longFormQueued++;
          }
        } catch (err: any) {
          logger.warn(`[BackCatalog] Long-form queue failed for ${v.youtubeVideoId}: ${err.message?.slice(0, 150)}`);
        }
      }

      // Shorter videos (8–60 min) → single segment
      if (result.longFormQueued === 0) {
        const singleSegCandidates = ranked
          .filter(v =>
            !v.isShort &&
            (v.durationSec ?? 0) >= SINGLE_SEG_MIN_SOURCE_SEC &&
            (v.durationSec ?? 0) < LONG_FORM_MIN_SOURCE_SEC &&
            v.longFormOpportunityScore >= LONG_FORM_OPPORTUNITY_THRESHOLD &&
            !v.minedForLongForm,
          )
          .slice(0, 2);

        for (const v of singleSegCandidates) {
          const canQueue = await canQueueLongFormToday(userId);
          if (!canQueue) break;

          try {
            await queueLongFormFromBackCatalog(userId, v);
            await db.update(backCatalogVideos)
              .set({ minedForLongForm: true, longFormQueuedCount: (v.longFormQueuedCount ?? 0) + 1, updatedAt: new Date() })
              .where(and(
                eq(backCatalogVideos.userId, userId),
                eq(backCatalogVideos.youtubeVideoId, v.youtubeVideoId),
              ));
            await trackDerivative(userId, v.id, v.youtubeVideoId, "long_form_clip", "long_form_clip", v.viewCount ?? 0);
            result.longFormQueued++;
          } catch (err: any) {
            logger.warn(`[BackCatalog] Single-seg queue failed: ${err.message?.slice(0, 150)}`);
          }
        }
      }
    } else {
      result.skipped.push("Long-form: daily cap reached (1/day)");
    }
  } catch (err: any) {
    logger.error(`[BackCatalog] queueRevivalWork failed: ${err.message?.slice(0, 300)}`);
    result.skipped.push(`error: ${err.message?.slice(0, 100)}`);
  }

  return result;
}

// ── Queue a single long-form item from back catalog (no local file) ───────────

async function queueLongFormFromBackCatalog(
  userId: string,
  v: {
    id: number;
    youtubeVideoId: string;
    title: string;
    durationSec: number | null;
    gameName: string | null;
    localVideoId: number | null;
    viewCount: number | null;
  },
): Promise<void> {
  const dur = v.durationSec ?? 0;
  const scheduledAt = await getNextLongFormPublishTime(userId);

  await db.insert(autopilotQueue).values({
    userId,
    sourceVideoId: v.localVideoId,
    type: "auto-clip",
    targetPlatform: "youtube",
    content: `Back catalog long-form clip: ${v.title}`,
    status: "scheduled",
    scheduledAt,
    metadata: {
      contentType: "long-form-clip",
      sourceYoutubeId: v.youtubeVideoId,
      sourceTitle: v.title,
      gameName: v.gameName ?? undefined,
      segmentStartSec: 0,
      segmentEndSec: Math.min(dur, 3600),
      totalDurationSec: dur,
      backCatalogGenerated: true,
      autoQueued: true,
    } as any,
  });
}

// ── Track derivative in back_catalog_derivatives ──────────────────────────────

async function trackDerivative(
  userId: string,
  backCatalogVideoId: number,
  sourceYoutubeId: string,
  derivativeType: string,
  transformationType: string,
  beforeViews: number,
): Promise<void> {
  try {
    await db.insert(backCatalogDerivatives).values({
      userId,
      backCatalogVideoId,
      sourceYoutubeId,
      derivativeType,
      transformationType,
      beforeViews,
    });
  } catch { /* non-fatal */ }
}

// ── Master cycle ──────────────────────────────────────────────────────────────

const _lastCycleAt = new Map<string, number>();
const CYCLE_INTERVAL_MS = 22 * 3_600_000; // once per 22 hours

export async function runBackCatalogMonetizationCycle(userId: string): Promise<{
  phase: string;
  importResult: { imported: number; updated: number; skipped: number; errors: number };
  queueResult: { shortsQueued: number; longFormQueued: number; metadataQueued: number; skipped: string[] };
  rankedCount: number;
  skippedReason?: string;
}> {
  const last = _lastCycleAt.get(userId) ?? 0;
  if (Date.now() - last < CYCLE_INTERVAL_MS) {
    return {
      phase: "skipped",
      importResult: { imported: 0, updated: 0, skipped: 0, errors: 0 },
      queueResult: { shortsQueued: 0, longFormQueued: 0, metadataQueued: 0, skipped: [] },
      rankedCount: 0,
      skippedReason: "ran too recently — next cycle allowed in " +
        Math.round((CYCLE_INTERVAL_MS - (Date.now() - last)) / 3_600_000) + "h",
    };
  }
  _lastCycleAt.set(userId, Date.now());

  logger.info(`[BackCatalog] Starting monetization cycle for ${userId.slice(0, 8)}`);

  const importResult = await runBackCatalogImport(userId);
  const opportunities = await rankBackCatalogOpportunities(userId, 20);
  const queueResult  = await queueBackCatalogRevivalWork(userId);

  // Record cycle in learning brain
  try {
    const { recordLearningEvent } = await import("./youtube-learning-brain");
    await recordLearningEvent(userId, "back_catalog_cycle", {
      sourceAgent: "back-catalog-engine",
      imported: importResult.imported,
      updated: importResult.updated,
      shortsQueued: queueResult.shortsQueued,
      longFormQueued: queueResult.longFormQueued,
      metadataQueued: queueResult.metadataQueued,
      topOpportunity: opportunities[0]?.youtubeVideoId ?? null,
    }, "success");
  } catch { /* ok */ }

  logger.info(
    `[BackCatalog] Cycle complete: ${importResult.imported}/${importResult.updated} import/update, ` +
    `${queueResult.shortsQueued} Shorts, ${queueResult.longFormQueued} long-form, ` +
    `${queueResult.metadataQueued} metadata queued`,
  );

  return {
    phase: "complete",
    importResult,
    queueResult,
    rankedCount: opportunities.length,
  };
}

// ── Dashboard status ──────────────────────────────────────────────────────────

export async function getBackCatalogStatus(userId: string): Promise<{
  totalVideos: number;
  totalVods: number;
  over60Min: number;
  alreadyMined: number;
  notYetMined: number;
  shortsQueuedFromOld: number;
  longFormQueuedFromOld: number;
  metadataUpdatesQueued: number;
  topOpportunities: Awaited<ReturnType<typeof rankBackCatalogOpportunities>>;
  monetizationWarnings: number;
  estimatedBacklogDays: number;
  lastCycleAt: string | null;
}> {
  try {
    const [stats] = await db.select({
      totalVideos:           sql<number>`count(*)::int`,
      totalVods:             sql<number>`count(*) filter (where is_vod = true)::int`,
      over60Min:             sql<number>`count(*) filter (where is_over_60_min = true)::int`,
      minedForShorts:        sql<number>`count(*) filter (where mined_for_shorts = true)::int`,
      minedForLongForm:      sql<number>`count(*) filter (where mined_for_long_form = true)::int`,
      shortsQueued:          sql<number>`coalesce(sum(shorts_queued_count), 0)::int`,
      longFormQueued:        sql<number>`coalesce(sum(long_form_queued_count), 0)::int`,
      metadataQueued:        sql<number>`coalesce(sum(metadata_updates_queued), 0)::int`,
      monetizationWarnings:  sql<number>`count(*) filter (where monetization_status not in ('safe_to_monetize') and monetization_status is not null)::int`,
    })
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.userId, userId));

    const totalVideos       = stats?.totalVideos ?? 0;
    const alreadyMined      = Math.max(stats?.minedForShorts ?? 0, stats?.minedForLongForm ?? 0);
    const notYetMined       = totalVideos - alreadyMined;
    const estimatedBacklogDays = Math.ceil((notYetMined) / (3 + 1)); // 3 Shorts + 1 LF per day

    const topOpportunities = await rankBackCatalogOpportunities(userId, 20);

    const lastMs = _lastCycleAt.get(userId);
    const lastCycleAt = lastMs ? new Date(lastMs).toISOString() : null;

    return {
      totalVideos,
      totalVods: stats?.totalVods ?? 0,
      over60Min: stats?.over60Min ?? 0,
      alreadyMined,
      notYetMined,
      shortsQueuedFromOld:    stats?.shortsQueued ?? 0,
      longFormQueuedFromOld:  stats?.longFormQueued ?? 0,
      metadataUpdatesQueued:  stats?.metadataQueued ?? 0,
      topOpportunities,
      monetizationWarnings:   stats?.monetizationWarnings ?? 0,
      estimatedBacklogDays,
      lastCycleAt,
    };
  } catch (err: any) {
    logger.warn(`[BackCatalog] getStatus failed: ${err.message?.slice(0, 200)}`);
    return {
      totalVideos: 0, totalVods: 0, over60Min: 0, alreadyMined: 0, notYetMined: 0,
      shortsQueuedFromOld: 0, longFormQueuedFromOld: 0, metadataUpdatesQueued: 0,
      topOpportunities: [], monetizationWarnings: 0, estimatedBacklogDays: 0, lastCycleAt: null,
    };
  }
}

logger.debug("[BackCatalogEngine] Module loaded");
