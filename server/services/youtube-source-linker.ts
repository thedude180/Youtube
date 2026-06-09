/**
 * youtube-source-linker.ts
 *
 * Source Attribution — "Full video →" Description Links for Shorts
 *
 * Two jobs in one file:
 *
 * 1. linkSourcesToPublishedShorts(userId)
 *    Backfill runner: goes through every published Short on the channel and
 *    injects a "📺 Full video → https://youtu.be/..." line into its YouTube
 *    description pointing at the EXACT original VOD it was clipped from.
 *
 *    Matching cascade (most-precise first):
 *      a. autopilot_queue exact match — queue items for published Shorts carry
 *         metadata.sourceYoutubeId (the source VOD) and
 *         metadata.youtubeVideoId  (the uploaded Short's ID after publish).
 *      b. back_catalog_derivatives join — if the back-catalog engine recorded
 *         a derivative row linking the source backCatalogVideoId to the Short.
 *      c. Game fallback — find the highest-viewed long-form VOD of the same
 *         game from back_catalog_videos (mirrors watch-next-linker logic but
 *         marks it as an approximate match).
 *
 *    Processed Shorts are recorded in short_source_links so the runner is
 *    idempotent — re-runs only pick up newly published Shorts.
 *
 * 2. getSourceLinkerStatus(userId) — dashboard stats.
 *
 * Rate limits: ≤15 description updates per run; runs every ~4h (light cycle).
 * Description update uses v3 videos.update (50 quota units each).
 * The quota breaker is intentionally bypassed — source attribution is a
 * maintenance operation that should complete regardless of autopilot quota.
 */

import { db } from "../db";
import {
  channels,
  backCatalogVideos,
  backCatalogDerivatives,
  autopilotQueue,
  shortSourceLinks,
} from "@shared/schema";
import { eq, and, isNotNull, desc, notInArray, sql, isNull, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("source-linker");

const MAX_PER_RUN = 15;
const SOURCE_LINK_PREFIX = "📺 Full video →";

// ── YouTube API: update video description ─────────────────────────────────────

async function updateShortDescription(
  channelDbId: number,
  youtubeVideoId: string,
  title: string,
  categoryId: string,
  newDescription: string,
): Promise<boolean> {
  try {
    const { getAuthenticatedClient } = await import("../youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    const yt = google.youtube({ version: "v3", auth: oauth2Client as any });
    await yt.videos.update({
      part: ["snippet"],
      requestBody: {
        id: youtubeVideoId,
        snippet: {
          title,
          description: newDescription,
          categoryId: categoryId || "20",
        },
      },
    });
    return true;
  } catch (err: any) {
    logger.warn(`[SourceLinker] videos.update failed for ${youtubeVideoId}: ${String(err?.message ?? err).slice(0, 200)}`);
    return false;
  }
}

// ── Check description ─────────────────────────────────────────────────────────

function alreadyHasSourceLink(description: string): boolean {
  return (
    description.includes("📺 Full video") ||
    description.includes("Full video →") ||
    description.includes("Full video:") ||
    description.includes("youtu.be/")
  );
}

function buildSourceBlock(sourceYoutubeId: string): string {
  return `\n\n📺 Full video → https://youtu.be/${sourceYoutubeId}`;
}

// ── Matching strategy A: autopilot_queue exact match ─────────────────────────
// Published queue items store metadata.youtubeVideoId (the uploaded Short's
// YouTube ID) and metadata.sourceYoutubeId (the source VOD's YouTube ID).

async function matchViaQueue(
  userId: string,
  shortYoutubeId: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select({ src: sql<string>`${autopilotQueue.metadata}->>'sourceYoutubeId'` })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.userId, userId),
        eq(autopilotQueue.status, "published"),
        sql`${autopilotQueue.metadata}->>'youtubeVideoId' = ${shortYoutubeId}`,
        sql`${autopilotQueue.metadata}->>'sourceYoutubeId' IS NOT NULL`,
        sql`${autopilotQueue.metadata}->>'sourceYoutubeId' != ''`,
      ))
      .limit(1);
    return rows[0]?.src ?? null;
  } catch {
    return null;
  }
}

// ── Matching strategy B: back_catalog_derivatives join ────────────────────────
// backCatalogDerivatives records link a source backCatalogVideoId to the
// derivative type.  derivativeYoutubeId is populated when the back-catalog
// engine records the upload.  Also check sourceYoutubeId directly on the
// derivatives row (the source VOD's YouTube ID is always stored).

async function matchViaDerivatives(
  userId: string,
  shortYoutubeId: string,
): Promise<string | null> {
  try {
    // Direct: derivative row where derivativeYoutubeId = this Short's ID
    const direct = await db
      .select({ sourceYtId: backCatalogDerivatives.sourceYoutubeId })
      .from(backCatalogDerivatives)
      .where(and(
        eq(backCatalogDerivatives.userId, userId),
        eq(backCatalogDerivatives.derivativeYoutubeId, shortYoutubeId),
        isNotNull(backCatalogDerivatives.sourceYoutubeId),
      ))
      .limit(1);
    if (direct[0]?.sourceYtId) return direct[0].sourceYtId;

    // Join via backCatalogVideoId: the derivative row points to the source
    // back_catalog_video; get that video's youtubeVideoId
    const joined = await db
      .select({ sourceYtId: backCatalogVideos.youtubeVideoId })
      .from(backCatalogDerivatives)
      .innerJoin(
        backCatalogVideos,
        eq(backCatalogDerivatives.backCatalogVideoId, backCatalogVideos.id),
      )
      .where(and(
        eq(backCatalogDerivatives.userId, userId),
        eq(backCatalogDerivatives.derivativeYoutubeId, shortYoutubeId),
        eq(backCatalogVideos.isShort, false),
      ))
      .limit(1);
    return joined[0]?.sourceYtId ?? null;
  } catch {
    return null;
  }
}

// ── Matching strategy C: best long-form of same game (fallback) ───────────────

async function matchViaGame(
  userId: string,
  gameName: string,
  excludeId: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select({ ytId: backCatalogVideos.youtubeVideoId })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.isShort, false),
        eq(backCatalogVideos.gameName, gameName),
        isNotNull(backCatalogVideos.youtubeVideoId),
        sql`${backCatalogVideos.youtubeVideoId} != ${excludeId}`,
        sql`(${backCatalogVideos.durationSec} IS NULL OR ${backCatalogVideos.durationSec} >= 480)`,
        or(
          eq(backCatalogVideos.privacyStatus, "public"),
          eq(backCatalogVideos.privacyStatus, "unlisted"),
        ),
      ))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(1);
    return rows[0]?.ytId ?? null;
  } catch {
    return null;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export interface SourceLinkerResult {
  linked: number;
  skipped: number;
  failed: number;
  noSource: number;
  errors: string[];
}

export async function linkSourcesToPublishedShorts(
  userId: string,
): Promise<SourceLinkerResult> {
  const result: SourceLinkerResult = { linked: 0, skipped: 0, failed: 0, noSource: 0, errors: [] };

  try {
    // Find authenticated YouTube channel
    const [ytChannel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(
        eq(channels.userId, userId),
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ))
      .limit(1);

    if (!ytChannel) {
      logger.info("[SourceLinker] No authenticated YouTube channel — skipping");
      return result;
    }

    // Shorts already processed (exact match or skipped)
    const alreadyDone = await db
      .select({ shortId: shortSourceLinks.shortYoutubeId })
      .from(shortSourceLinks)
      .where(eq(shortSourceLinks.userId, userId));
    const doneIds = alreadyDone.map(r => r.shortId);

    // All published Shorts from back_catalog_videos not yet processed
    const shortsQuery = db
      .select({
        youtubeVideoId: backCatalogVideos.youtubeVideoId,
        title: backCatalogVideos.title,
        description: backCatalogVideos.description,
        gameName: backCatalogVideos.gameName,
        categoryId: backCatalogVideos.categoryId,
      })
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.isShort, true),
        isNotNull(backCatalogVideos.youtubeVideoId),
        or(
          eq(backCatalogVideos.privacyStatus, "public"),
          eq(backCatalogVideos.privacyStatus, "unlisted"),
        ),
        ...(doneIds.length > 0
          ? [notInArray(backCatalogVideos.youtubeVideoId, doneIds)]
          : []),
      ))
      .orderBy(desc(backCatalogVideos.publishedAt))
      .limit(MAX_PER_RUN);

    const shorts = await shortsQuery;

    if (!shorts.length) {
      logger.info("[SourceLinker] All published Shorts already processed — nothing to do");
      return result;
    }

    logger.info(`[SourceLinker] Processing ${shorts.length} unlinked Shorts`);

    for (const short of shorts) {
      const ytId = short.youtubeVideoId;
      const currentDesc = short.description ?? "";

      // Already has a source link — mark done and skip
      if (alreadyHasSourceLink(currentDesc)) {
        await db.insert(shortSourceLinks).values({
          userId,
          channelId: ytChannel.id,
          shortYoutubeId: ytId,
          matchType: "already_had_link",
          updateSuccess: true,
        }).onConflictDoNothing();
        result.skipped++;
        continue;
      }

      // Match cascade: queue → derivatives → game
      let sourceId: string | null = null;
      let matchType = "no_source_found";

      sourceId = await matchViaQueue(userId, ytId);
      if (sourceId) {
        matchType = "queue_exact";
      } else {
        sourceId = await matchViaDerivatives(userId, ytId);
        if (sourceId) {
          matchType = "derivatives_exact";
        } else if (short.gameName) {
          sourceId = await matchViaGame(userId, short.gameName, ytId);
          if (sourceId) matchType = "game_match";
        }
      }

      if (!sourceId) {
        // No match — record so we don't re-attempt this Short every cycle
        await db.insert(shortSourceLinks).values({
          userId,
          channelId: ytChannel.id,
          shortYoutubeId: ytId,
          matchType: "no_source_found",
          updateSuccess: false,
          failReason: "no-matching-source-found",
        }).onConflictDoNothing();
        result.noSource++;
        logger.debug(`[SourceLinker] No source found for Short ${ytId} (game: ${short.gameName ?? "unknown"})`);
        continue;
      }

      // Build and push the updated description
      const sourceBlock = buildSourceBlock(sourceId);
      const updatedDesc = (currentDesc + sourceBlock).slice(0, 5000);

      const ok = await updateShortDescription(
        ytChannel.id,
        ytId,
        short.title,
        short.categoryId ?? "20",
        updatedDesc,
      );

      await db.insert(shortSourceLinks).values({
        userId,
        channelId: ytChannel.id,
        shortYoutubeId: ytId,
        sourceYoutubeId: sourceId,
        matchType,
        updateSuccess: ok,
        failReason: ok ? null : "api-update-failed",
      }).onConflictDoNothing();

      if (ok) {
        result.linked++;
        logger.info(`[SourceLinker] ✓ Short ${ytId} → source ${sourceId} (${matchType})`);
      } else {
        result.failed++;
        logger.warn(`[SourceLinker] ✗ Description update failed for Short ${ytId}`);
      }
    }

    logger.info(
      `[SourceLinker] Done — ${result.linked} linked, ${result.skipped} already-had-link, ` +
      `${result.noSource} no-source, ${result.failed} api-failed`,
    );
  } catch (err: any) {
    const msg = err?.message?.slice(0, 200) ?? "unknown error";
    result.errors.push(msg);
    logger.error(`[SourceLinker] Fatal error: ${msg}`);
  }

  return result;
}

// ── Dashboard stats ────────────────────────────────────────────────────────────

export async function getSourceLinkerStatus(userId: string): Promise<{
  totalLinked: number;
  totalSkipped: number;
  totalNoSource: number;
  totalFailed: number;
  recentLinks: Array<{
    shortId: string;
    sourceId: string | null;
    matchType: string | null;
    linkedAt: Date | null;
  }>;
}> {
  const rows = await db
    .select()
    .from(shortSourceLinks)
    .where(eq(shortSourceLinks.userId, userId))
    .orderBy(desc(shortSourceLinks.linkedAt))
    .limit(50);

  return {
    totalLinked: rows.filter(r => r.updateSuccess && r.matchType !== "already_had_link").length,
    totalSkipped: rows.filter(r => r.matchType === "already_had_link").length,
    totalNoSource: rows.filter(r => r.matchType === "no_source_found").length,
    totalFailed: rows.filter(r => !r.updateSuccess && r.matchType !== "already_had_link" && r.matchType !== "no_source_found").length,
    recentLinks: rows
      .filter(r => r.updateSuccess && r.matchType !== "already_had_link")
      .slice(0, 10)
      .map(r => ({
        shortId: r.shortYoutubeId,
        sourceId: r.sourceYoutubeId ?? null,
        matchType: r.matchType ?? null,
        linkedAt: r.linkedAt ?? null,
      })),
  };
}
