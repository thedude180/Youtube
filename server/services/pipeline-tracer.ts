/**
 * Pipeline Tracer — End-to-End Content Verification Agent
 *
 * Follows every published piece of content from autopilot_queue through to
 * confirmed live on YouTube. Runs every 30 minutes, batch-verifies video IDs
 * against the YouTube Data API, detects stuck/missing content, and records
 * every finding in pipeline_traces.
 *
 * Quota cost: 1 unit per batch of up to 50 video IDs (videos.list).
 */

import cron from "node-cron";
import { google } from "googleapis";
import { db } from "../db";
import {
  autopilotQueue,
  channels as channelsTable,
  pipelineTraces,
} from "@shared/schema";
import { eq, and, gte, lte, inArray, not, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { getAuthenticatedClient } from "../youtube";
import {
  isQuotaBreakerTripped,
  canAffordOperation,
  trackQuotaUsage,
} from "./youtube-quota-tracker";
import { createLogger } from "../lib/logger";

const logger = createLogger("pipeline-tracer");

let tracerCron: ReturnType<typeof cron.schedule> | null = null;
let running = false;

// ── helpers ────────────────────────────────────────────────────────────────

function jitter(base: number) {
  return base + Math.floor(Math.random() * base * 0.1);
}

/**
 * Batch-verify up to 50 YouTube video IDs in one API call (1 quota unit).
 * Returns a Map from videoId → {title, privacyStatus, uploadStatus, viewCount}.
 */
async function batchCheckYouTubeVideos(
  channelId: number,
  userId: string,
  videoIds: string[],
): Promise<Map<string, { title: string; privacyStatus: string; uploadStatus: string; viewCount: number; publishedAt: string }>> {
  const results = new Map<string, any>();
  if (!videoIds.length) return results;
  if (isQuotaBreakerTripped()) {
    logger.warn("[PipelineTracer] Quota breaker tripped — skipping batch verify");
    return results;
  }
  if (!(await canAffordOperation(userId, "read").catch(() => true))) {
    logger.warn("[PipelineTracer] Quota budget too low — skipping batch verify");
    return results;
  }

  try {
    const { oauth2Client } = await getAuthenticatedClient(channelId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const resp = await youtube.videos.list({
      part: ["snippet", "status", "statistics"],
      id: videoIds,
    });

    await trackQuotaUsage(userId, "list", 1).catch(() => {});

    for (const v of resp.data.items ?? []) {
      if (!v.id) continue;
      results.set(v.id, {
        title: v.snippet?.title ?? "",
        privacyStatus: v.status?.privacyStatus ?? "unknown",
        uploadStatus: v.status?.uploadStatus ?? "unknown",
        viewCount: Number(v.statistics?.viewCount ?? 0),
        publishedAt: v.snippet?.publishedAt ?? "",
      });
    }
  } catch (err: any) {
    logger.error("[PipelineTracer] batch YouTube verify failed", { error: err?.message });
  }

  return results;
}

/**
 * Record a trace event. Swallows errors so the tracer never kills other services.
 */
async function recordTrace(fields: {
  userId: string;
  queueItemId?: number | null;
  youtubeVideoId?: string | null;
  contentType?: string | null;
  gameName?: string | null;
  stage: string;
  status: string;
  durationMs?: number | null;
  detail?: Record<string, any>;
}) {
  try {
    await db.insert(pipelineTraces).values({
      userId: fields.userId,
      queueItemId: fields.queueItemId ?? null,
      youtubeVideoId: fields.youtubeVideoId ?? null,
      contentType: fields.contentType ?? null,
      gameName: fields.gameName ?? null,
      stage: fields.stage,
      status: fields.status,
      durationMs: fields.durationMs ?? null,
      detail: fields.detail ?? {},
    });
  } catch (err: any) {
    logger.error("[PipelineTracer] recordTrace failed", { error: err?.message, stage: fields.stage });
  }
}

// ── already-traced guard ───────────────────────────────────────────────────

async function alreadyVerified(youtubeVideoId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: pipelineTraces.id })
      .from(pipelineTraces)
      .where(
        and(
          eq(pipelineTraces.youtubeVideoId, youtubeVideoId),
          inArray(pipelineTraces.stage, ["verified_live", "verified_missing"]),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function alreadyTracedStuck(queueItemId: number, stage: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 6 * 3600_000); // only flag once per 6h
    const rows = await db
      .select({ id: pipelineTraces.id })
      .from(pipelineTraces)
      .where(
        and(
          eq(pipelineTraces.queueItemId, queueItemId),
          eq(pipelineTraces.stage, stage),
          gte(pipelineTraces.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ── main trace cycle ───────────────────────────────────────────────────────

async function runTraceCycle() {
  if (running) {
    logger.info("[PipelineTracer] previous cycle still running — skipping");
    return;
  }
  running = true;
  logger.info("[PipelineTracer] cycle start");

  try {
    // ── 1. Get all users who have a YouTube channel ──────────────────────
    const channelRows = await db
      .select({ userId: channelsTable.userId, channelId: channelsTable.id })
      .from(channelsTable)
      .where(eq(channelsTable.platform, "youtube"));

    if (!channelRows.length) {
      logger.info("[PipelineTracer] no YouTube channels found — skipping");
      return;
    }

    for (const { userId, channelId } of channelRows) {
      await runUserCycle(userId, channelId);
    }
  } catch (err: any) {
    logger.error("[PipelineTracer] cycle error", { error: err?.message });
  } finally {
    running = false;
    logger.info("[PipelineTracer] cycle complete");
  }
}

async function runUserCycle(userId: string, channelId: number) {
  const window48h = new Date(Date.now() - 48 * 3600_000);

  // ── 1. Verify recently published items ──────────────────────────────────
  let publishedItems: any[] = [];
  try {
    publishedItems = await db
      .select({
        id: autopilotQueue.id,
        type: autopilotQueue.type,
        scheduledAt: autopilotQueue.scheduledAt,
        publishedAt: autopilotQueue.publishedAt,
        metadata: autopilotQueue.metadata,
        createdAt: autopilotQueue.createdAt,
      })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
          gte(autopilotQueue.publishedAt, window48h),
        ),
      )
      .limit(100);
  } catch (err: any) {
    logger.error("[PipelineTracer] failed to fetch published items", { error: err?.message });
  }

  // Collect video IDs that haven't been verified yet
  const toVerify: Array<{ queueItemId: number; videoId: string; item: any }> = [];
  for (const item of publishedItems) {
    const videoId: string | undefined =
      item.metadata?.youtubeVideoId ?? item.metadata?.youtubeId ?? undefined;
    if (!videoId) continue;
    const done = await alreadyVerified(videoId);
    if (!done) toVerify.push({ queueItemId: item.id, videoId, item });
  }

  // Batch-check in groups of 50
  if (toVerify.length > 0) {
    logger.info(`[PipelineTracer] verifying ${toVerify.length} videos for user ${userId}`);
    const BATCH = 50;
    for (let i = 0; i < toVerify.length; i += BATCH) {
      const batch = toVerify.slice(i, i + BATCH);
      const ids = batch.map(b => b.videoId);
      const ytMap = await batchCheckYouTubeVideos(channelId, userId, ids);

      for (const { queueItemId, videoId, item } of batch) {
        const yt = ytMap.get(videoId);
        const durationMs =
          item.scheduledAt
            ? Date.now() - new Date(item.scheduledAt).getTime()
            : null;

        if (yt) {
          await recordTrace({
            userId,
            queueItemId,
            youtubeVideoId: videoId,
            contentType: item.type,
            gameName: item.metadata?.gameName ?? null,
            stage: "verified_live",
            status: "ok",
            durationMs,
            detail: {
              title: yt.title,
              privacyStatus: yt.privacyStatus,
              uploadStatus: yt.uploadStatus,
              viewCount: yt.viewCount,
              youtubePublishedAt: yt.publishedAt,
              youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
              queueScheduledAt: item.scheduledAt,
              queuePublishedAt: item.publishedAt,
            },
          });
          logger.info(`[PipelineTracer] ✓ verified_live ${videoId} — "${yt.title}"`);
        } else {
          // Video ID returned by YouTube upload but now missing from API
          await recordTrace({
            userId,
            queueItemId,
            youtubeVideoId: videoId,
            contentType: item.type,
            gameName: item.metadata?.gameName ?? null,
            stage: "verified_missing",
            status: "error",
            durationMs,
            detail: {
              reason:
                "Video ID not returned by YouTube videos.list — may be processing, deleted, or private in error",
              youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
              queueScheduledAt: item.scheduledAt,
              queuePublishedAt: item.publishedAt,
            },
          });
          logger.warn(`[PipelineTracer] ✗ verified_missing ${videoId} — not found via YouTube API`);
        }
      }
    }
  }

  // ── 2. Detect stuck scheduled items (past scheduledAt by > 3h) ──────────
  try {
    const stuckCutoff = new Date(Date.now() - 3 * 3600_000);
    const stuckScheduled = await db
      .select({
        id: autopilotQueue.id,
        type: autopilotQueue.type,
        scheduledAt: autopilotQueue.scheduledAt,
        createdAt: autopilotQueue.createdAt,
        metadata: autopilotQueue.metadata,
      })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "scheduled"),
          isNotNull(autopilotQueue.scheduledAt),
          lt(autopilotQueue.scheduledAt, stuckCutoff),
        ),
      )
      .limit(50);

    for (const item of stuckScheduled) {
      const alreadyFlagged = await alreadyTracedStuck(item.id, "stuck_scheduled");
      if (alreadyFlagged) continue;

      const stuckMs = item.scheduledAt
        ? Date.now() - new Date(item.scheduledAt).getTime()
        : null;

      await recordTrace({
        userId,
        queueItemId: item.id,
        contentType: item.type,
        gameName: item.metadata?.gameName ?? null,
        stage: "stuck_scheduled",
        status: "warning",
        durationMs: stuckMs,
        detail: {
          scheduledAt: item.scheduledAt,
          overdueByMs: stuckMs,
          overdueByMin: stuckMs ? Math.round(stuckMs / 60_000) : null,
          contentType: item.metadata?.contentType ?? item.type,
          reason:
            "Item is in 'scheduled' status but its scheduledAt is more than 3 hours in the past — publisher may have missed this item",
        },
      });
      logger.warn(
        `[PipelineTracer] ⚠ stuck_scheduled queueItemId=${item.id} type=${item.type} overdue=${Math.round((stuckMs ?? 0) / 60_000)}min`,
      );
    }
  } catch (err: any) {
    logger.error("[PipelineTracer] stuck-scheduled check failed", { error: err?.message });
  }

  // ── 3. Detect published items with no youtubeVideoId (upload likely failed silently) ──
  try {
    const noIdWindow = new Date(Date.now() - 24 * 3600_000);
    const noIdItems = await db
      .select({ id: autopilotQueue.id, type: autopilotQueue.type, publishedAt: autopilotQueue.publishedAt })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
          gte(autopilotQueue.publishedAt, noIdWindow),
          // jsonb check: youtubeVideoId and youtubeId both absent
          sql`(metadata->>'youtubeVideoId') IS NULL AND (metadata->>'youtubeId') IS NULL`,
        ),
      )
      .limit(20);

    for (const item of noIdItems) {
      const alreadyFlagged = await alreadyTracedStuck(item.id, "failed");
      if (alreadyFlagged) continue;
      await recordTrace({
        userId,
        queueItemId: item.id,
        contentType: item.type,
        stage: "failed",
        status: "error",
        detail: {
          reason:
            "Item status is 'published' but metadata contains no youtubeVideoId — upload completed without returning a video ID",
          publishedAt: item.publishedAt,
        },
      });
      logger.warn(`[PipelineTracer] ✗ published without video ID queueItemId=${item.id}`);
    }
  } catch (err: any) {
    logger.error("[PipelineTracer] no-video-id check failed", { error: err?.message });
  }
}

// ── public API ─────────────────────────────────────────────────────────────

export function initPipelineTracer() {
  if (tracerCron) return;

  // First run: 8–12 min after boot (lets publishers + other services settle)
  const startDelay = jitter(8 * 60_000);
  logger.info(`[PipelineTracer] scheduling first run in ${Math.round(startDelay / 60_000)} min`);

  setTimeout(() => {
    runTraceCycle().catch(err =>
      logger.error("[PipelineTracer] first run error", { error: err?.message }),
    );

    // Then every 30 min
    tracerCron = cron.schedule("*/30 * * * *", () => {
      runTraceCycle().catch(err =>
        logger.error("[PipelineTracer] cron error", { error: err?.message }),
      );
    });
  }, startDelay);

  logger.info("[PipelineTracer] initialized");
}

export function stopPipelineTracer() {
  tracerCron?.stop();
  tracerCron = null;
}

/** Force an immediate trace cycle (used by the API for manual triggers). */
export async function triggerPipelineTrace(): Promise<void> {
  await runTraceCycle();
}

/** Returns the health summary used by the dashboard API endpoint. */
export async function getPipelineHealth(userId: string) {
  try {
    const since72h = new Date(Date.now() - 72 * 3600_000);

    const traces = await db
      .select()
      .from(pipelineTraces)
      .where(
        and(
          eq(pipelineTraces.userId, userId),
          gte(pipelineTraces.createdAt, since72h),
        ),
      )
      .orderBy(sql`${pipelineTraces.createdAt} DESC`)
      .limit(200);

    const verifiedLive = traces.filter(t => t.stage === "verified_live");
    const verifiedMissing = traces.filter(t => t.stage === "verified_missing");
    const stuckScheduled = traces.filter(t => t.stage === "stuck_scheduled");
    const failed = traces.filter(t => t.stage === "failed");

    const totalPublished = verifiedLive.length + verifiedMissing.length;
    const successRate = totalPublished > 0
      ? Math.round((verifiedLive.length / totalPublished) * 100)
      : null;

    // Average pipeline latency for successfully verified items
    const latencies = verifiedLive
      .map(t => t.durationMs)
      .filter((d): d is number => d != null && d > 0);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    return {
      successRate,
      avgLatencyMs,
      counts: {
        verifiedLive: verifiedLive.length,
        verifiedMissing: verifiedMissing.length,
        stuckScheduled: stuckScheduled.length,
        failed: failed.length,
      },
      recentVerified: verifiedLive.slice(0, 10).map(t => ({
        id: t.id,
        youtubeVideoId: t.youtubeVideoId,
        contentType: t.contentType,
        gameName: t.gameName,
        durationMs: t.durationMs,
        detail: t.detail,
        createdAt: t.createdAt,
      })),
      issues: [
        ...verifiedMissing.map(t => ({ ...t, issueType: "missing" })),
        ...stuckScheduled.map(t => ({ ...t, issueType: "stuck" })),
        ...failed.map(t => ({ ...t, issueType: "failed" })),
      ]
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 20),
      allTraces: traces.slice(0, 50),
    };
  } catch (err: any) {
    logger.error("[PipelineTracer] getPipelineHealth error", { error: err?.message });
    throw err;
  }
}
