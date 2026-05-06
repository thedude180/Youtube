/**
 * youtube-output-scheduler.ts
 *
 * Ensures a steady cadence of YouTube long-form and Shorts uploads by
 * comparing current-week / today counts against configurable targets and
 * automatically queuing additional items from the published video catalog
 * when the pipeline falls short.
 *
 * Targets (override via env vars):
 *   YOUTUBE_LONGFORM_TARGET_PER_WEEK  (default: 3)
 *   YOUTUBE_SHORTS_TARGET_PER_DAY     (default: 2)
 *
 * Schedule: startup warm-up after 3 min, then every 2 hours.
 * YouTube-only: never queues non-YouTube platforms.
 */

import { db } from "../db";
import { autopilotQueue, videos, channels } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("yt-output-scheduler");

const LONGFORM_TARGET_PER_WEEK = parseInt(
  process.env.YOUTUBE_LONGFORM_TARGET_PER_WEEK || "3",
  10,
);
const SHORTS_TARGET_PER_DAY = parseInt(
  process.env.YOUTUBE_SHORTS_TARGET_PER_DAY || "2",
  10,
);

// ── Time helpers ─────────────────────────────────────────────────────────────

function getWeekBoundaries(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMon);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);
  return { start: monday, end: sunday };
}

function getDayBoundaries(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

function getOptimalScheduleTime(baseDelayHours: number): Date {
  const t = new Date(Date.now() + baseDelayHours * 3_600_000);
  const h = t.getUTCHours();
  if (h < 14) {
    t.setUTCHours(14, Math.floor(Math.random() * 59), 0, 0);
  } else if (h > 20) {
    t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(14, Math.floor(Math.random() * 59), 0, 0);
  }
  return t;
}

// ── ISO 8601 / seconds parser ─────────────────────────────────────────────────

function parseDurationToSec(duration: unknown): number {
  if (!duration) return 0;
  if (typeof duration === "number") return duration;
  const str = String(duration);
  const iso = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (iso) {
    return (
      parseInt(iso[1] || "0") * 3600 +
      parseInt(iso[2] || "0") * 60 +
      parseInt(iso[3] || "0")
    );
  }
  const n = parseInt(str);
  return isNaN(n) ? 0 : n;
}

// ── Counting helpers ──────────────────────────────────────────────────────────

async function countWeeklyLongForm(userId: string): Promise<number> {
  const { start, end } = getWeekBoundaries();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(
      and(
        eq(autopilotQueue.userId, userId),
        inArray(autopilotQueue.status, ["published", "processing", "scheduled"]),
        sql`${autopilotQueue.metadata}->>'contentType' = 'long-form-clip'`,
        gte(autopilotQueue.scheduledAt, start),
        lte(autopilotQueue.scheduledAt, end),
      ),
    );
  return row?.count ?? 0;
}

async function countDailyShorts(userId: string): Promise<number> {
  const { start, end } = getDayBoundaries();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(
      and(
        eq(autopilotQueue.userId, userId),
        inArray(autopilotQueue.status, ["published", "processing", "scheduled"]),
        inArray(autopilotQueue.type, ["youtube_short", "platform_short"]),
        gte(autopilotQueue.scheduledAt, start),
        lte(autopilotQueue.scheduledAt, end),
      ),
    );
  return row?.count ?? 0;
}

// ── Catalog queries ───────────────────────────────────────────────────────────

async function getYouTubeChannelIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  return rows.map((r) => r.id);
}

async function getEligibleLongFormVideos(
  userId: string,
  limit: number,
): Promise<any[]> {
  const channelIds = await getYouTubeChannelIds(userId);
  if (!channelIds.length) return [];
  const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000);
  return db
    .select()
    .from(videos)
    .where(
      and(
        inArray(videos.channelId, channelIds),
        sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
        sql`(
          ${videos.metadata}->>'longFormClipExtractedAt' IS NULL
          OR (${videos.metadata}->>'longFormClipExtractedAt')::timestamptz < ${cutoff.toISOString()}::timestamptz
        )`,
      ),
    )
    .orderBy(desc(videos.createdAt))
    .limit(limit);
}

async function getEligibleShortsVideos(
  userId: string,
  limit: number,
): Promise<any[]> {
  const channelIds = await getYouTubeChannelIds(userId);
  if (!channelIds.length) return [];
  const cutoff = new Date(Date.now() - 3 * 24 * 3_600_000);
  return db
    .select()
    .from(videos)
    .where(
      and(
        inArray(videos.channelId, channelIds),
        sql`${videos.metadata}->>'youtubeId' IS NOT NULL`,
        sql`(
          ${videos.metadata}->>'shortsExtractedAt' IS NULL
          OR (${videos.metadata}->>'shortsExtractedAt')::timestamptz < ${cutoff.toISOString()}::timestamptz
        )`,
      ),
    )
    .orderBy(desc(videos.createdAt))
    .limit(limit);
}

// ── User list ─────────────────────────────────────────────────────────────────

async function getUserIdsWithYouTube(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: channels.userId })
    .from(channels)
    .where(
      and(
        eq(channels.platform, "youtube"),
        sql`${channels.accessToken} IS NOT NULL`,
      ),
    );
  return rows.map((r) => r.userId);
}

// ── Per-user cycle ────────────────────────────────────────────────────────────

async function runForUser(userId: string): Promise<void> {
  const [weeklyLongForm, dailyShorts] = await Promise.all([
    countWeeklyLongForm(userId),
    countDailyShorts(userId),
  ]);

  const longFormGap = Math.max(0, LONGFORM_TARGET_PER_WEEK - weeklyLongForm);
  const shortsGap = Math.max(0, SHORTS_TARGET_PER_DAY - dailyShorts);

  logger.info("Output scheduler status check", {
    userId: userId.slice(0, 8),
    longForm: `${weeklyLongForm}/${LONGFORM_TARGET_PER_WEEK} this week`,
    shorts: `${dailyShorts}/${SHORTS_TARGET_PER_DAY} today`,
    longFormGap,
    shortsGap,
  });

  // ── Long-form gap fill ────────────────────────────────────────────────────
  if (longFormGap > 0) {
    const eligible = await getEligibleLongFormVideos(userId, longFormGap);
    let queued = 0;

    for (const video of eligible) {
      if (queued >= longFormGap) break;

      const meta = (video.metadata as any) || {};
      const youtubeId: string | undefined = meta.youtubeId || meta.youtubeVideoId;
      if (!youtubeId) continue;

      const durationSec = parseDurationToSec(meta.duration);
      if (durationSec < 480) continue; // need at least 8 min

      const capSec = Math.min(3600, durationSec);
      const BUCKETS = [8, 10, 15, 20, 30, 45, 60].map((m) => m * 60);
      const eligible2 = BUCKETS.filter((s) => s <= capSec);
      const experimentDurationSec =
        eligible2.length > 0
          ? eligible2[Math.floor(Math.random() * eligible2.length)]
          : 480;

      const scheduledAt = getOptimalScheduleTime(queued * 48 + 2);
      const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
      const gameName: string = meta.gameName || "PS5 Gameplay";

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: video.id,
          type: "auto-clip",
          targetPlatform: "youtube",
          content: video.description || "",
          caption: `${gameName} — ${Math.round(experimentDurationSec / 60)} Minute Gameplay`,
          status: "scheduled",
          scheduledAt,
          metadata: {
            contentType: "long-form-clip",
            segmentStartSec: 0,
            segmentEndSec: experimentDurationSec,
            targetDurationSec: experimentDurationSec,
            experimentDurationMin: Math.round(experimentDurationSec / 60),
            gameName,
            sourceYoutubeId: youtubeId,
            tags: [...tags.slice(0, 8), "Gaming", "PS5", "NoCommentary"],
            schedulerGenerated: true,
            noCommentary: true,
          } as any,
        });
        queued++;
        logger.info("Output scheduler queued long-form", {
          userId: userId.slice(0, 8),
          videoId: video.id,
          youtubeId,
          experimentDurationMin: Math.round(experimentDurationSec / 60),
          scheduledAt: scheduledAt.toISOString(),
        });
      } catch (err: any) {
        logger.warn("Output scheduler failed to queue long-form item", {
          userId: userId.slice(0, 8),
          videoId: video.id,
          error: err.message,
        });
      }
    }

    if (queued > 0) {
      logger.info(
        `Output scheduler: queued ${queued}/${longFormGap} long-form clips`,
        { userId: userId.slice(0, 8) },
      );
    } else if (longFormGap > 0 && eligible.length === 0) {
      logger.info(
        "Output scheduler: no eligible catalog videos for long-form gap fill",
        { userId: userId.slice(0, 8), gap: longFormGap },
      );
    }
  }

  // ── Shorts gap fill ────────────────────────────────────────────────────────
  if (shortsGap > 0) {
    const eligible = await getEligibleShortsVideos(userId, shortsGap * 2);
    let queued = 0;

    for (const video of eligible) {
      if (queued >= shortsGap) break;

      const meta = (video.metadata as any) || {};
      const youtubeId: string | undefined = meta.youtubeId || meta.youtubeVideoId;
      if (!youtubeId) continue;

      const durationSec = parseDurationToSec(meta.duration);
      if (durationSec < 60) continue;

      const maxStart = Math.max(0, Math.min(durationSec * 0.75, durationSec - 60));
      const startSec = Math.floor(Math.random() * maxStart);
      const clipDuration = 30 + Math.floor(Math.random() * 29); // 30–58 s
      const endSec = Math.min(startSec + clipDuration, durationSec);

      const scheduledAt = new Date(Date.now() + (queued * 6 + 1) * 3_600_000);
      const gameName: string = meta.gameName || "PS5 Gaming";
      const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: video.id,
          type: "youtube_short",
          targetPlatform: "youtube",
          content: video.description || "",
          caption: `${gameName} #Shorts`,
          status: "scheduled",
          scheduledAt,
          metadata: {
            contentType: "youtube-short",
            startSec,
            endSec,
            sourceYoutubeId: youtubeId,
            gameName,
            tags: [...tags.slice(0, 8), "Shorts", "Gaming", "PS5"],
            schedulerGenerated: true,
          } as any,
        });
        queued++;
        logger.info("Output scheduler queued Short", {
          userId: userId.slice(0, 8),
          videoId: video.id,
          youtubeId,
          startSec,
          endSec,
          scheduledAt: scheduledAt.toISOString(),
        });
      } catch (err: any) {
        logger.warn("Output scheduler failed to queue Short item", {
          userId: userId.slice(0, 8),
          videoId: video.id,
          error: err.message,
        });
      }
    }

    if (queued > 0) {
      logger.info(
        `Output scheduler: queued ${queued}/${shortsGap} Shorts`,
        { userId: userId.slice(0, 8) },
      );
    } else if (shortsGap > 0 && eligible.length === 0) {
      logger.info(
        "Output scheduler: no eligible catalog videos for Shorts gap fill",
        { userId: userId.slice(0, 8), gap: shortsGap },
      );
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface OutputSchedulerStatus {
  userId: string;
  week: { longFormTarget: number; longFormQueued: number; gap: number };
  day: { shortsTarget: number; shortsQueued: number; gap: number };
  lastRun: string | null;
}

const lastRunTimes = new Map<string, string>();

export async function runOutputSchedulerCycle(): Promise<void> {
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.info("Quota breaker active — skipping output scheduler cycle");
      return;
    }
  } catch {
    // quota tracker unavailable — proceed cautiously
  }

  const userIds = await getUserIdsWithYouTube();
  for (const userId of userIds) {
    try {
      await runForUser(userId);
      lastRunTimes.set(userId, new Date().toISOString());
    } catch (err: any) {
      logger.error("Output scheduler failed for user", {
        userId: userId.slice(0, 8),
        error: err.message,
      });
    }
  }
}

export async function getOutputSchedulerStatus(
  userId?: string,
): Promise<OutputSchedulerStatus[]> {
  const userIds = userId ? [userId] : await getUserIdsWithYouTube();
  const results: OutputSchedulerStatus[] = [];

  for (const uid of userIds) {
    const [weeklyLongForm, dailyShorts] = await Promise.all([
      countWeeklyLongForm(uid),
      countDailyShorts(uid),
    ]);
    results.push({
      userId: uid,
      week: {
        longFormTarget: LONGFORM_TARGET_PER_WEEK,
        longFormQueued: weeklyLongForm,
        gap: Math.max(0, LONGFORM_TARGET_PER_WEEK - weeklyLongForm),
      },
      day: {
        shortsTarget: SHORTS_TARGET_PER_DAY,
        shortsQueued: dailyShorts,
        gap: Math.max(0, SHORTS_TARGET_PER_DAY - dailyShorts),
      },
      lastRun: lastRunTimes.get(uid) ?? null,
    });
  }

  return results;
}

export function initYouTubeOutputScheduler(): ReturnType<typeof setInterval> {
  logger.info(
    `YouTube Output Scheduler initialised — targets: ${LONGFORM_TARGET_PER_WEEK} long-form/week, ${SHORTS_TARGET_PER_DAY} Shorts/day`,
  );

  // Warm-up run 3 min after boot (let other engines settle first)
  setTimeout(
    () =>
      runOutputSchedulerCycle().catch((err) =>
        logger.error("Output scheduler warm-up error", { error: err.message }),
      ),
    3 * 60_000,
  );

  // Then every 2 hours
  return setInterval(() => {
    runOutputSchedulerCycle().catch((err) =>
      logger.error("Output scheduler interval error", { error: err.message }),
    );
  }, 2 * 60 * 60_000);
}
