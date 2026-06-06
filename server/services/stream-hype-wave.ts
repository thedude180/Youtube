/**
 * Stream Hype Wave
 *
 * When a focus-game stream ends, this module:
 *  1. Reads analytics to compute how many days BF6 historically outperforms
 *     other games → that becomes the "hype window" (3–7 days).
 *  2. Pushes ONLY non-focus-game scheduled content out by that window.
 *  3. Fills the freed near-term slots with focus-game back-catalog clips.
 *
 * This is smarter than the old uniform bumpScheduleForNewStream(3):
 *  – window is data-driven, not fixed
 *  – only other-game content moves; BF6 content stays or gets pulled forward
 *  – freed slots are backfilled with the best BF6 clips ranked by opportunity score
 */

import { db } from "../db";
import {
  autopilotQueue,
  backCatalogVideos,
  pipelineTraces,
  youtubeOutputMetrics,
} from "@shared/schema";
import { eq, and, sql, ilike, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getFocusGame } from "../lib/game-focus";
import {
  getNextShortPublishTime,
  getNextLongFormPublishTime,
  isShortScheduleSaturated,
  isLongFormScheduleSaturated,
} from "./youtube-output-schedule";

const logger = createLogger("StreamHypeWave");

const MIN_HYPE_DAYS = 3;
const MAX_HYPE_DAYS = 7;
const DEFAULT_HYPE_DAYS = 5;

export interface HypeWaveResult {
  skipped: boolean;
  skipReason?: string;
  focusGame: string;
  hypeDays: number;
  analyticsConfidence: "high" | "low" | "none";
  otherGameItemsBumped: number;
  focusShortsQueued: number;
  focusLongFormQueued: number;
}

async function computeHypeDays(
  userId: string,
  focusKeyword: string,
): Promise<{ days: number; confidence: "high" | "low" | "none" }> {
  try {
    const rows = (await db.execute(sql`
      SELECT
        CASE
          WHEN LOWER(game_name) LIKE ${"%" + focusKeyword.toLowerCase() + "%"}
          THEN 'focus'
          ELSE 'other'
        END AS grp,
        AVG(performance_score)::float  AS avg_score,
        COUNT(*)::int                  AS samples
      FROM youtube_output_metrics
      WHERE user_id         = ${userId}
        AND performance_score IS NOT NULL
        AND performance_score > 0
        AND published_at    > NOW() - INTERVAL '90 days'
      GROUP BY 1
    `)) as any;

    const data: Array<{ grp: string; avg_score: number; samples: number }> =
      rows?.rows ?? [];

    const focus = data.find((r) => r.grp === "focus");
    const other = data.find((r) => r.grp === "other");

    if (!focus || (focus.samples ?? 0) < 3) {
      logger.info(
        `[HypeWave] Not enough analytics data (focusSamples=${focus?.samples ?? 0}) — default ${DEFAULT_HYPE_DAYS}d`,
      );
      return { days: DEFAULT_HYPE_DAYS, confidence: "none" };
    }

    const focusScore = focus.avg_score ?? 0;
    const otherScore = other?.avg_score ?? focusScore * 0.7; // if no other-game data, assume 30% uplift
    const ratio = focusScore / Math.max(otherScore, 1);

    // ratio 1.0 → 3 days, ratio 3.0+ → 7 days (linear interpolation)
    const days = Math.round(
      Math.min(
        MAX_HYPE_DAYS,
        Math.max(MIN_HYPE_DAYS, MIN_HYPE_DAYS + (ratio - 1) * 2),
      ),
    );
    const confidence: "high" | "low" =
      (focus.samples ?? 0) >= 10 ? "high" : "low";

    logger.info(
      `[HypeWave] Analytics: focus=${focusScore.toFixed(1)} other=${otherScore.toFixed(1)} ` +
        `ratio=${ratio.toFixed(2)} → ${days}d window (${confidence} confidence, n=${focus.samples})`,
    );
    return { days, confidence };
  } catch (err: any) {
    logger.warn(
      `[HypeWave] computeHypeDays error: ${err?.message?.slice(0, 120)} — using default`,
    );
    return { days: DEFAULT_HYPE_DAYS, confidence: "none" };
  }
}

export async function triggerStreamHypeWave(
  userId: string,
  streamId: number | null,
  streamGameName: string,
): Promise<HypeWaveResult> {
  const focusGame = await getFocusGame().catch(() => "Battlefield 6");
  const focusKeyword = focusGame.split(" ")[0]; // "Battlefield"
  const streamKeyword = streamGameName.split(" ")[0].toLowerCase();

  const isFocusStream =
    streamKeyword.includes(focusKeyword.toLowerCase()) ||
    focusKeyword.toLowerCase().includes(streamKeyword);

  if (!isFocusStream) {
    const reason = `stream game "${streamGameName}" ≠ focus game "${focusGame}"`;
    logger.info(`[HypeWave] Skipping — ${reason}`);
    return {
      skipped: true,
      skipReason: reason,
      focusGame,
      hypeDays: 0,
      analyticsConfidence: "none",
      otherGameItemsBumped: 0,
      focusShortsQueued: 0,
      focusLongFormQueued: 0,
    };
  }

  const { days: hypeDays, confidence: analyticsConfidence } =
    await computeHypeDays(userId, focusKeyword);

  logger.info(
    `[HypeWave] FIRING — game=${focusGame} stream=${streamId ?? "manual"} ` +
      `window=${hypeDays}d confidence=${analyticsConfidence}`,
  );

  // ── 1. Push non-focus-game content out by the hype window ────────────────────
  let otherGameItemsBumped = 0;
  try {
    const bump = (await db.execute(sql`
      UPDATE autopilot_queue
      SET
        scheduled_at = scheduled_at + (${hypeDays} || ' days')::interval,
        updated_at   = now()
      WHERE user_id     = ${userId}
        AND status      = 'scheduled'
        AND scheduled_at > now()
        AND (metadata->>'isStreamHighlight' IS NULL OR metadata->>'isStreamHighlight' = 'false')
        AND (metadata->>'copilotGenerated'  IS NULL OR metadata->>'copilotGenerated'  = 'false')
        AND (metadata->>'hypeWave'          IS NULL OR metadata->>'hypeWave'          = 'false')
        AND (
          metadata->>'gameName' IS NULL
          OR (
            LOWER(metadata->>'gameName') NOT LIKE ${"%" + focusKeyword.toLowerCase() + "%"}
            AND metadata->>'gameName' <> ''
          )
        )
    `)) as any;
    otherGameItemsBumped = bump?.rowCount ?? 0;
    logger.info(
      `[HypeWave] Bumped ${otherGameItemsBumped} non-focus items by ${hypeDays} days`,
    );
  } catch (err: any) {
    logger.warn(
      `[HypeWave] Schedule bump failed (non-fatal): ${err?.message?.slice(0, 120)}`,
    );
  }

  // ── 2. Queue focus-game Shorts (up to hypeDays × 2 items) ───────────────────
  let focusShortsQueued = 0;
  const shortSaturated = isShortScheduleSaturated(userId);

  if (!shortSaturated) {
    const shortLimit = hypeDays * 2;
    try {
      const shortCandidates = await db
        .select({
          id: backCatalogVideos.id,
          youtubeVideoId: backCatalogVideos.youtubeVideoId,
          title: backCatalogVideos.title,
          gameName: backCatalogVideos.gameName,
          durationSec: backCatalogVideos.durationSec,
        })
        .from(backCatalogVideos)
        .where(
          and(
            eq(backCatalogVideos.userId, userId),
            ilike(backCatalogVideos.gameName, `%${focusKeyword}%`),
            sql`${backCatalogVideos.shortsQueuedCount} < 3`,
            sql`COALESCE(${backCatalogVideos.durationSec}, 0) >= 60`,
          ),
        )
        .orderBy(desc(backCatalogVideos.shortsOpportunityScore))
        .limit(shortLimit);

      for (const vid of shortCandidates) {
        try {
          const scheduledAt = await getNextShortPublishTime(userId);
          await db.insert(autopilotQueue).values({
            userId,
            type: "youtube_short" as any,
            targetPlatform: "youtubeshorts",
            content: `${vid.title ?? focusGame} — hype wave Short`,
            caption: `${vid.gameName ?? focusGame} #Shorts`.substring(0, 90),
            status: "scheduled",
            scheduledAt,
            metadata: {
              contentType: "youtube_short",
              gameName: vid.gameName ?? focusGame,
              backCatalogVideoId: vid.id,
              sourceYoutubeId: vid.youtubeVideoId,
              sourceDurationSec: vid.durationSec,
              hypeWave: true,
              streamId: streamId ?? null,
              tags: ["no commentary", "PS5", focusGame, "shorts", "gaming"],
            } as any,
          });
          focusShortsQueued++;
        } catch {
          /* continue to next candidate */
        }
      }
      logger.info(`[HypeWave] Queued ${focusShortsQueued}/${shortLimit} focus Shorts`);
    } catch (err: any) {
      logger.warn(
        `[HypeWave] Shorts queuing error (non-fatal): ${err?.message?.slice(0, 120)}`,
      );
    }
  } else {
    logger.info("[HypeWave] Short schedule saturated — skipping Short backfill");
  }

  // ── 3. Queue focus-game long-form (up to hypeDays items) ────────────────────
  let focusLongFormQueued = 0;
  const lfSaturated = isLongFormScheduleSaturated(userId);

  if (!lfSaturated) {
    try {
      const lfCandidates = await db
        .select({
          id: backCatalogVideos.id,
          youtubeVideoId: backCatalogVideos.youtubeVideoId,
          title: backCatalogVideos.title,
          gameName: backCatalogVideos.gameName,
          durationSec: backCatalogVideos.durationSec,
        })
        .from(backCatalogVideos)
        .where(
          and(
            eq(backCatalogVideos.userId, userId),
            ilike(backCatalogVideos.gameName, `%${focusKeyword}%`),
            eq(backCatalogVideos.isOver60Min, true),
            sql`${backCatalogVideos.longFormQueuedCount} < 2`,
          ),
        )
        .orderBy(desc(backCatalogVideos.longFormOpportunityScore))
        .limit(hypeDays);

      for (const vid of lfCandidates) {
        try {
          const scheduledAt = await getNextLongFormPublishTime(userId);
          await db.insert(autopilotQueue).values({
            userId,
            type: "vod-long-form" as any,
            targetPlatform: "youtube",
            content: `${vid.title ?? focusGame} — hype wave long-form`,
            caption: `${vid.gameName ?? focusGame} long-form`.substring(0, 90),
            status: "scheduled",
            scheduledAt,
            metadata: {
              contentType: "vod-long-form",
              gameName: vid.gameName ?? focusGame,
              backCatalogVideoId: vid.id,
              sourceYoutubeId: vid.youtubeVideoId,
              sourceDurationSec: vid.durationSec,
              hypeWave: true,
              streamId: streamId ?? null,
              tags: ["no commentary", "PS5", focusGame, "gaming"],
            } as any,
          });
          focusLongFormQueued++;
        } catch {
          /* continue */
        }
      }
      logger.info(
        `[HypeWave] Queued ${focusLongFormQueued}/${hypeDays} focus long-form items`,
      );
    } catch (err: any) {
      logger.warn(
        `[HypeWave] Long-form queuing error (non-fatal): ${err?.message?.slice(0, 120)}`,
      );
    }
  } else {
    logger.info(
      "[HypeWave] Long-form schedule saturated — skipping long-form backfill",
    );
  }

  // ── 4. Log trace ─────────────────────────────────────────────────────────────
  try {
    await db.insert(pipelineTraces).values({
      userId,
      stage: "hype_wave",
      status: "ok",
      gameName: focusGame,
      detail: {
        focusGame,
        streamGameName,
        streamId: streamId ?? null,
        hypeDays,
        analyticsConfidence,
        otherGameItemsBumped,
        focusShortsQueued,
        focusLongFormQueued,
      },
    } as any);
  } catch {
    /* non-fatal */
  }

  logger.info(
    `[HypeWave] Complete — bumped=${otherGameItemsBumped} shorts=${focusShortsQueued} lf=${focusLongFormQueued}`,
  );

  return {
    skipped: false,
    focusGame,
    hypeDays,
    analyticsConfidence,
    otherGameItemsBumped,
    focusShortsQueued,
    focusLongFormQueued,
  };
}
