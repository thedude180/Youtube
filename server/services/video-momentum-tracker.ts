/**
 * video-momentum-tracker.ts
 *
 * Tracks view velocity for Shorts and VODs WITHOUT touching the YouTube Data
 * API or OAuth Analytics API.  Uses unauthenticated InnerTube (the same
 * endpoint YouTube's own web-app uses anonymously) to snapshot public view /
 * like counts every 2 hours.
 *
 * Flow:
 *   1.  Every 2h — collect all tracked video IDs (from autopilot_queue,
 *       studio_videos, and the tracked_videos registry).
 *   2.  For each video — call InnerTube /youtubei/v1/player (no auth, no API
 *       key quota) → get viewCount + likeCount + title.
 *   3.  Compare with the previous snapshot → compute velocity (views / hr).
 *   4.  Compute momentumScore (velocity × weight + acceleration × weight2 +
 *       vs-channel-average × weight3).
 *   5.  Flag isGainingSteam when score exceeds channel average × 1.5 or
 *       when velocity is accelerating significantly.
 *   6.  When isGainingSteam AND the YouTube Analytics API is available →
 *       trigger recordVideoPerformance for a full deep-dive on that video.
 */

import { db } from "../db";
import {
  trackedVideos, videoMomentumSnapshots,
  autopilotQueue, youtubeOutputMetrics,
} from "@shared/schema";
import { eq, and, desc, gte, lt, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("momentum-tracker");

// ── InnerTube constants ────────────────────────────────────────────────────────
// Public key embedded in every YouTube web page — non-secret, changes rarely.
const IT_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const IT_CLIENT_VERSION = "2.20231219.04.00";
const IT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Tuning ─────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS       = 2 * 60 * 60_000; // 2h between full sweeps
const GAINING_STEAM_RATIO    = 1.5;             // velocity must be > avg × 1.5
const ACCEL_GAINING_THRESHOLD = 5;              // velocity increase > 5 views/hr
const SNAPSHOT_RETENTION_DAYS = 30;
const MAX_VIDEOS_PER_SWEEP   = 100;             // cap to avoid long-running sweeps
const INNERTUBE_TIMEOUT_MS   = 12_000;

interface PublicVideoStats {
  viewCount:    number;
  likeCount:    number;
  commentCount: number;
  title:        string | null;
  isAvailable:  boolean;
}

// ── InnerTube fetch (unauthenticated) ──────────────────────────────────────────
async function fetchPublicVideoStats(youtubeVideoId: string): Promise<PublicVideoStats> {
  const body = {
    videoId: youtubeVideoId,
    context: {
      client: {
        clientName:    "WEB",
        clientVersion: IT_CLIENT_VERSION,
        hl:            "en",
        gl:            "US",
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${IT_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "Content-Type":             "application/json",
          "X-YouTube-Client-Name":    "1",
          "X-YouTube-Client-Version": IT_CLIENT_VERSION,
          "User-Agent":               IT_UA,
          "Origin":                   "https://www.youtube.com",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(INNERTUBE_TIMEOUT_MS),
      },
    );
  } catch (err) {
    logger.debug(`[Momentum] InnerTube fetch timeout/error for ${youtubeVideoId}`, { err });
    return { viewCount: 0, likeCount: 0, commentCount: 0, title: null, isAvailable: false };
  }

  if (!res.ok) {
    logger.debug(`[Momentum] InnerTube HTTP ${res.status} for ${youtubeVideoId}`);
    return { viewCount: 0, likeCount: 0, commentCount: 0, title: null, isAvailable: false };
  }

  let data: Record<string, any>;
  try { data = await res.json(); } catch {
    return { viewCount: 0, likeCount: 0, commentCount: 0, title: null, isAvailable: false };
  }

  const status = data?.playabilityStatus?.status;
  if (status && !["OK", "LIVE_STREAM_OFFLINE"].includes(status)) {
    // VIDEO_NOT_FOUND / PRIVATE / AGE_CHECK etc — stop tracking
    return { viewCount: 0, likeCount: 0, commentCount: 0, title: null, isAvailable: false };
  }

  const vd = data?.videoDetails ?? {};
  const viewCount    = parseInt(vd.viewCount ?? "0", 10) || 0;
  const title        = typeof vd.title === "string" ? vd.title : null;

  // Like/comment counts are not in the player endpoint; use 0 as placeholder.
  // They'll be filled in by the Analytics API when it runs on gaining-steam videos.
  return { viewCount, likeCount: 0, commentCount: 0, title, isAvailable: true };
}

interface TrackedEntry {
  youtubeVideoId: string;
  contentType:    string;
  gameName:       string | null;
  title:          string | null;
  publishedAt:    Date | null;
}

// ── Collect tracked video IDs for a user ──────────────────────────────────────
async function collectTrackedVideoIds(userId: string): Promise<TrackedEntry[]> {
  const seen = new Set<string>();
  const results: TrackedEntry[] = [];

  // 1. From tracked_videos registry (manually added or system-added)
  const registered = await db.select().from(trackedVideos)
    .where(and(eq(trackedVideos.userId, userId), eq(trackedVideos.isActive, true)));
  for (const r of registered) {
    if (seen.has(r.youtubeVideoId)) continue;
    seen.add(r.youtubeVideoId);
    results.push({
      youtubeVideoId: r.youtubeVideoId,
      contentType:    r.contentType,
      gameName:       r.gameName ?? null,
      title:          r.title ?? null,
      publishedAt:    r.publishedAt ?? null,
    });
  }

  // 2. From autopilot_queue (published items with a YouTube video ID)
  const published = await db.select({
    ytId:        sql<string>`metadata->>'youtubeVideoId'`,
    contentType: autopilotQueue.type,
    publishedAt: autopilotQueue.publishedAt,
    caption:     autopilotQueue.caption,
  })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.status, "published"),
      isNotNull(sql`metadata->>'youtubeVideoId'`),
    ))
    .limit(MAX_VIDEOS_PER_SWEEP);

  for (const p of published) {
    const id = p.ytId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const isShort = ["platform_short", "youtube_short", "vod-short", "auto-clip"].includes(p.contentType ?? "");
    results.push({
      youtubeVideoId: id,
      contentType:    isShort ? "short" : "vod",
      gameName:       null,
      title:          p.caption ?? null,
      publishedAt:    p.publishedAt ?? null,
    });
  }

  // 3. From youtube_output_metrics (already tracked by the learner)
  const existing = await db.select({
    youtubeVideoId: youtubeOutputMetrics.youtubeVideoId,
    contentType:    youtubeOutputMetrics.contentType,
    gameName:       youtubeOutputMetrics.gameName,
    publishedAt:    youtubeOutputMetrics.publishedAt,
  })
    .from(youtubeOutputMetrics)
    .where(and(
      eq(youtubeOutputMetrics.userId, userId),
      isNotNull(youtubeOutputMetrics.youtubeVideoId),
    ))
    .limit(MAX_VIDEOS_PER_SWEEP);

  for (const e of existing) {
    if (!e.youtubeVideoId || seen.has(e.youtubeVideoId)) continue;
    seen.add(e.youtubeVideoId);
    results.push({
      youtubeVideoId: e.youtubeVideoId,
      contentType:    e.contentType ?? "short",
      gameName:       e.gameName ?? null,
      title:          null,
      publishedAt:    e.publishedAt ?? null,
    });
  }

  return results.slice(0, MAX_VIDEOS_PER_SWEEP);
}

// ── Compute momentum score ─────────────────────────────────────────────────────
function computeMomentumScore(opts: {
  velocityPerHour:     number;
  prevVelocityPerHour: number | null;
  channelAvgVelocity:  number;
}): { score: number; isGainingSteam: boolean } {
  const { velocityPerHour, prevVelocityPerHour, channelAvgVelocity } = opts;

  const acceleration = prevVelocityPerHour !== null
    ? velocityPerHour - prevVelocityPerHour
    : 0;

  // Relative performance vs channel average (1.0 = at avg, 2.0 = double avg)
  const relativePerformance = channelAvgVelocity > 0
    ? velocityPerHour / channelAvgVelocity
    : velocityPerHour > 0 ? 2.0 : 0;

  // Weighted composite 0–100
  const score = Math.min(100, Math.max(0,
    (velocityPerHour   * 3.0) +
    (acceleration      * 5.0) +
    (relativePerformance * 10.0),
  ));

  const isGainingSteam =
    velocityPerHour > channelAvgVelocity * GAINING_STEAM_RATIO ||
    acceleration > ACCEL_GAINING_THRESHOLD;

  return { score, isGainingSteam };
}

// ── Main snapshot sweep ────────────────────────────────────────────────────────
async function runMomentumSweep(userId: string): Promise<void> {
  const videos = await collectTrackedVideoIds(userId);
  if (videos.length === 0) return;

  logger.info(`[Momentum] Sweep start — ${videos.length} tracked videos for user ${userId}`);

  // Compute channel-wide average velocity from recent snapshots
  const recentSnaps = await db.select({
    vel: videoMomentumSnapshots.velocityPerHour,
  })
    .from(videoMomentumSnapshots)
    .where(and(
      eq(videoMomentumSnapshots.userId, userId),
      gte(videoMomentumSnapshots.snapshotAt, new Date(Date.now() - 7 * 24 * 3600_000)),
      isNotNull(videoMomentumSnapshots.velocityPerHour),
    ))
    .limit(200);

  const channelAvgVelocity = recentSnaps.length > 0
    ? recentSnaps.reduce((s, r) => s + (r.vel ?? 0), 0) / recentSnaps.length
    : 1;

  let gainingSteamCount = 0;

  for (const video of videos) {
    try {
      // Get the most recent snapshot for this video
      const [prevSnap] = await db.select()
        .from(videoMomentumSnapshots)
        .where(and(
          eq(videoMomentumSnapshots.userId, userId),
          eq(videoMomentumSnapshots.youtubeVideoId, video.youtubeVideoId),
        ))
        .orderBy(desc(videoMomentumSnapshots.snapshotAt))
        .limit(1);

      const stats = await fetchPublicVideoStats(video.youtubeVideoId);

      if (!stats.isAvailable) {
        // Mark tracked_videos inactive for permanently unavailable videos
        await db.update(trackedVideos)
          .set({ isActive: false })
          .where(and(
            eq(trackedVideos.userId, userId),
            eq(trackedVideos.youtubeVideoId, video.youtubeVideoId),
          ))
          .catch(() => {});
        continue;
      }

      // Calculate velocity
      let velocityPerHour = 0;
      let prevVelocityPerHour: number | null = null;
      if (prevSnap && prevSnap.snapshotAt) {
        const hoursDelta = (Date.now() - prevSnap.snapshotAt.getTime()) / 3600_000;
        if (hoursDelta >= 0.1) {
          const viewsDelta = Math.max(0, stats.viewCount - prevSnap.viewCount);
          velocityPerHour = viewsDelta / hoursDelta;
          prevVelocityPerHour = prevSnap.velocityPerHour ?? null;
        }
      }

      // Hours since publish
      const hoursSincePublish = video.publishedAt
        ? (Date.now() - video.publishedAt.getTime()) / 3600_000
        : null;

      const { score, isGainingSteam } = computeMomentumScore({
        velocityPerHour,
        prevVelocityPerHour,
        channelAvgVelocity,
      });

      if (isGainingSteam) gainingSteamCount++;

      // Insert snapshot
      await db.insert(videoMomentumSnapshots).values({
        userId,
        youtubeVideoId:    video.youtubeVideoId,
        contentType:       video.contentType,
        gameName:          video.gameName,
        title:             stats.title ?? video.title,
        viewCount:         stats.viewCount,
        likeCount:         stats.likeCount,
        commentCount:      stats.commentCount,
        velocityPerHour,
        momentumScore:     score,
        isGainingSteam,
        hoursSincePublish,
        publishedAt:       video.publishedAt,
        snapshotAt:        new Date(),
      });

      // Update last snapshot timestamp in tracked_videos
      await db.update(trackedVideos)
        .set({ lastSnapshotAt: new Date(), title: stats.title ?? video.title ?? undefined })
        .where(and(
          eq(trackedVideos.userId, userId),
          eq(trackedVideos.youtubeVideoId, video.youtubeVideoId),
        ))
        .catch(() => {});

      // When gaining steam AND analytics API available, schedule a deep-dive
      if (isGainingSteam && velocityPerHour > 0) {
        import("./youtube-performance-learner").then(({ recordVideoPerformance }) => {
          recordVideoPerformance(userId, video.youtubeVideoId, {
            contentType: video.contentType as "short" | "vod",
            gameName:    video.gameName ?? undefined,
            publishedAt: video.publishedAt ?? undefined,
          }).catch(() => {});
        }).catch(() => {});
      }

      // Small pause between InnerTube calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 250));
    } catch (err) {
      logger.debug(`[Momentum] Error snapshotting ${video.youtubeVideoId}`, { err });
    }
  }

  // Prune old snapshots (keep last 30 days)
  await db.delete(videoMomentumSnapshots)
    .where(and(
      eq(videoMomentumSnapshots.userId, userId),
      lt(videoMomentumSnapshots.snapshotAt, new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 3600_000)),
    ))
    .catch(() => {});

  logger.info(`[Momentum] Sweep complete — ${gainingSteamCount} gaining steam, ${videos.length} total for user ${userId}`);
}

// ── Register a video for tracking ─────────────────────────────────────────────
export async function registerTrackedVideo(opts: {
  userId:          string;
  youtubeVideoId:  string;
  contentType:     "short" | "vod";
  gameName?:       string;
  title?:          string;
  publishedAt?:    Date;
  sourceQueueItemId?: number;
}): Promise<void> {
  await db.insert(trackedVideos)
    .values({
      userId:           opts.userId,
      youtubeVideoId:   opts.youtubeVideoId,
      contentType:      opts.contentType,
      gameName:         opts.gameName ?? null,
      title:            opts.title ?? null,
      publishedAt:      opts.publishedAt ?? null,
      isActive:         true,
      sourceQueueItemId:opts.sourceQueueItemId ?? null,
    })
    .onConflictDoUpdate({
      target: [trackedVideos.userId, trackedVideos.youtubeVideoId],
      set: {
        isActive:    true,
        title:       opts.title ?? null,
        publishedAt: opts.publishedAt ?? null,
      },
    })
    .catch(() => {});
}

// ── Public API: get latest momentum snapshot per video ────────────────────────
export async function getMomentumLeaderboard(userId: string, limit = 20) {
  // Most recent snapshot per video, ordered by momentum score desc
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (youtube_video_id)
      youtube_video_id, content_type, game_name, title,
      view_count, like_count, velocity_per_hour,
      momentum_score, is_gaining_steam, hours_since_publish,
      published_at, snapshot_at
    FROM video_momentum_snapshots
    WHERE user_id = ${userId}
    ORDER BY youtube_video_id, snapshot_at DESC
  `);

  const all = rows.rows as Array<Record<string, any>>;
  return all
    .sort((a, b) => (Number(b.momentum_score) || 0) - (Number(a.momentum_score) || 0))
    .slice(0, limit)
    .map(r => ({
      youtubeVideoId:   r.youtube_video_id as string,
      contentType:      r.content_type as string,
      gameName:         r.game_name as string | null,
      title:            r.title as string | null,
      viewCount:        Number(r.view_count) || 0,
      likeCount:        Number(r.like_count) || 0,
      velocityPerHour:  Number(r.velocity_per_hour) || 0,
      momentumScore:    Number(r.momentum_score) || 0,
      isGainingSteam:   Boolean(r.is_gaining_steam),
      hoursSincePublish:r.hours_since_publish !== null ? Number(r.hours_since_publish) : null,
      publishedAt:      r.published_at,
      snapshotAt:       r.snapshot_at,
      youtubeUrl:       `https://www.youtube.com/watch?v=${r.youtube_video_id}`,
      shortsUrl:        r.content_type === "short"
        ? `https://www.youtube.com/shorts/${r.youtube_video_id}`
        : null,
    }));
}

// ── View history sparkline for one video ─────────────────────────────────────
export async function getVideoMomentumHistory(userId: string, youtubeVideoId: string) {
  const snaps = await db.select({
    viewCount:       videoMomentumSnapshots.viewCount,
    velocityPerHour: videoMomentumSnapshots.velocityPerHour,
    momentumScore:   videoMomentumSnapshots.momentumScore,
    isGainingSteam:  videoMomentumSnapshots.isGainingSteam,
    snapshotAt:      videoMomentumSnapshots.snapshotAt,
  })
    .from(videoMomentumSnapshots)
    .where(and(
      eq(videoMomentumSnapshots.userId, userId),
      eq(videoMomentumSnapshots.youtubeVideoId, youtubeVideoId),
    ))
    .orderBy(videoMomentumSnapshots.snapshotAt)
    .limit(60);
  return snaps;
}

// ── Boot ───────────────────────────────────────────────────────────────────────
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function sweepAllUsers(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    // Get distinct user IDs that have tracked videos or published queue items
    const userRows = await db.execute(sql`
      SELECT DISTINCT user_id FROM tracked_videos WHERE is_active = true
      UNION
      SELECT DISTINCT user_id FROM autopilot_queue
        WHERE status = 'published' AND metadata->>'youtubeVideoId' IS NOT NULL
      UNION
      SELECT DISTINCT user_id FROM youtube_output_metrics
    `);
    const userIds = (userRows.rows as Array<{ user_id: string }>).map(r => r.user_id);
    for (const uid of userIds) {
      await runMomentumSweep(uid).catch(err =>
        logger.debug(`[Momentum] Sweep error for user ${uid}`, { err }),
      );
    }
  } finally {
    _running = false;
  }
}

export function initVideoMomentumTracker(): ReturnType<typeof setInterval> {
  if (_timer) return _timer;
  logger.info("[Momentum] Starting video momentum tracker (2h InnerTube polling, no API key required)");

  // First sweep runs after a short delay (not on boot to avoid convergence)
  setTimeout(() => sweepAllUsers().catch(() => {}), 5 * 60_000); // T+5min after init

  _timer = setInterval(() => sweepAllUsers().catch(() => {}), POLL_INTERVAL_MS);
  return _timer;
}
