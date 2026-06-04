/**
 * youtube-watch-next-linker.ts
 *
 * Retention Feature — Watch-Next Description Links
 *
 * After a Short is published, automatically appends a "📺 Watch next:" link
 * to its YouTube description pointing to the best related long-form video
 * from the same game.
 *
 * Why: YouTube's end-screen/card API is read-only for most third-party apps.
 * The best available mechanism to drive viewers from a Short into the full
 * session is a clickable link in the description.
 *
 * Logic:
 *   1. Find published Shorts in back_catalog_videos not yet in watch_next_links
 *   2. For each, find the highest-viewed long-form video of the same game
 *   3. Append the link to the Short's current description via videos.update
 *   4. Record result in watch_next_links (success or fail)
 *
 * Rate limits: max 10 updates per run, runs every ~4h in the light cycle.
 */

import { db } from "../db";
import { channels, backCatalogVideos, watchNextLinks } from "@shared/schema";
import { eq, and, isNotNull, desc, notInArray, sql, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("watch-next-linker");

const MAX_LINKS_PER_RUN = 10;
const WATCH_NEXT_SEPARATOR = "\n\n━━━━━━━━━━━━━━━━━━━━\n";

export interface WatchNextResult {
  linked: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ── YouTube API: update video description ─────────────────────────────────────

async function updateVideoDescription(
  channelId: number,
  youtubeVideoId: string,
  newDescription: string,
  title: string,
  categoryId: string,
): Promise<boolean> {
  try {
    const { getAuthenticatedClient } = await import("../youtube");
    const { google } = await import("googleapis");
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    await youtube.videos.update({
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
    logger.warn("[WatchNext] Description update failed", {
      youtubeVideoId,
      error: String(err).slice(0, 200),
    });
    return false;
  }
}

// ── Build the watch-next block ────────────────────────────────────────────────

function buildWatchNextBlock(longFormTitle: string, longFormId: string): string {
  const safeTitle = longFormTitle.slice(0, 80);
  return [
    WATCH_NEXT_SEPARATOR,
    `📺 Watch next: ${safeTitle}`,
    `https://youtu.be/${longFormId}`,
    "\n━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

function alreadyHasWatchNext(description: string): boolean {
  return description.includes("📺 Watch next:") || description.includes("youtu.be/");
}

// ── Find the best long-form for a game ───────────────────────────────────────

async function findBestLongForm(
  userId: string,
  gameName: string,
  excludeId: string,
): Promise<{ youtubeVideoId: string; title: string } | null> {
  const rows = await db
    .select({
      youtubeVideoId: backCatalogVideos.youtubeVideoId,
      title: backCatalogVideos.title,
      viewCount: backCatalogVideos.viewCount,
    })
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.gameName, gameName),
      eq(backCatalogVideos.isShort, false),
      isNotNull(backCatalogVideos.youtubeVideoId),
      sql`${backCatalogVideos.youtubeVideoId} != ${excludeId}`,
      sql`(${backCatalogVideos.durationSec} IS NULL OR ${backCatalogVideos.durationSec} >= 480)`,
    ))
    .orderBy(desc(backCatalogVideos.viewCount))
    .limit(1);

  return rows[0] ?? null;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function linkWatchNextForUser(userId: string): Promise<WatchNextResult> {
  const result: WatchNextResult = { linked: 0, failed: 0, skipped: 0, errors: [] };

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
      logger.info("[WatchNext] No authenticated YouTube channel — skipping");
      return result;
    }

    const channelId = ytChannel[0].id;

    const alreadyLinked = await db
      .select({ shortYoutubeId: watchNextLinks.shortYoutubeId })
      .from(watchNextLinks)
      .where(eq(watchNextLinks.userId, userId));

    const linkedIds = alreadyLinked.map(r => r.shortYoutubeId);

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
        isNotNull(backCatalogVideos.gameName),
        isNotNull(backCatalogVideos.youtubeVideoId),
        sql`${backCatalogVideos.privacyStatus} IN ('public', 'unlisted')`,
        ...(linkedIds.length > 0
          ? [notInArray(backCatalogVideos.youtubeVideoId, linkedIds)]
          : []),
      ))
      .orderBy(desc(backCatalogVideos.publishedAt))
      .limit(MAX_LINKS_PER_RUN);

    const unlinkedShorts = await shortsQuery;

    if (!unlinkedShorts.length) {
      logger.info("[WatchNext] All published Shorts already linked — nothing to do");
      return result;
    }

    for (const short of unlinkedShorts) {
      if (result.linked + result.failed >= MAX_LINKS_PER_RUN) break;

      const currentDesc = short.description ?? "";

      if (alreadyHasWatchNext(currentDesc)) {
        await db.insert(watchNextLinks).values({
          userId,
          channelId,
          shortYoutubeId: short.youtubeVideoId,
          gameName: short.gameName,
          updateSuccess: true,
          failReason: "already-had-link",
        }).onConflictDoNothing();
        result.skipped++;
        continue;
      }

      const longForm = await findBestLongForm(userId, short.gameName!, short.youtubeVideoId);

      if (!longForm) {
        await db.insert(watchNextLinks).values({
          userId,
          channelId,
          shortYoutubeId: short.youtubeVideoId,
          gameName: short.gameName,
          updateSuccess: false,
          failReason: "no-long-form-found",
        }).onConflictDoNothing();
        result.skipped++;
        continue;
      }

      const watchNextBlock = buildWatchNextBlock(longForm.title, longForm.youtubeVideoId);
      const updatedDesc = (currentDesc + watchNextBlock).slice(0, 5000);

      const ok = await updateVideoDescription(
        channelId,
        short.youtubeVideoId,
        updatedDesc,
        short.title,
        short.categoryId ?? "20",
      );

      await db.insert(watchNextLinks).values({
        userId,
        channelId,
        shortYoutubeId: short.youtubeVideoId,
        longFormYoutubeId: ok ? longForm.youtubeVideoId : null,
        gameName: short.gameName,
        updateSuccess: ok,
        failReason: ok ? null : "api-update-failed",
      }).onConflictDoNothing();

      if (ok) {
        result.linked++;
        logger.info(`[WatchNext] Linked Short ${short.youtubeVideoId} → ${longForm.youtubeVideoId} (${short.gameName})`);
      } else {
        result.failed++;
      }
    }

    logger.info(`[WatchNext] Done — ${result.linked} linked, ${result.failed} failed, ${result.skipped} skipped`);
  } catch (err: any) {
    result.errors.push(err?.message?.slice(0, 200) ?? "unknown error");
    logger.error("[WatchNext] Fatal error", { error: String(err).slice(0, 300) });
  }

  return result;
}

export async function getWatchNextStatus(userId: string): Promise<{
  totalLinked: number;
  totalFailed: number;
  recentLinks: Array<{ shortId: string; longFormId: string | null; game: string | null; linkedAt: Date | null }>;
}> {
  const links = await db
    .select()
    .from(watchNextLinks)
    .where(eq(watchNextLinks.userId, userId))
    .orderBy(desc(watchNextLinks.linkedAt))
    .limit(20);

  return {
    totalLinked: links.filter(l => l.updateSuccess).length,
    totalFailed: links.filter(l => !l.updateSuccess && l.failReason === "api-update-failed").length,
    recentLinks: links.slice(0, 10).map(l => ({
      shortId: l.shortYoutubeId,
      longFormId: l.longFormYoutubeId ?? null,
      game: l.gameName ?? null,
      linkedAt: l.linkedAt ?? null,
    })),
  };
}
