import { db } from "./db";
import { streams, channels, videos, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, sql, desc, isNotNull, gte } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";

const logger = createLogger("content-loop");

export type LoopPhase = "idle" | "livestream" | "stream-exhaust" | "vod-optimize" | "thumbnail-gen" | "cooldown";

interface UserLoopState {
  phase: LoopPhase;
  activeStreamId: number | null;
  lastRunAt: number;
  consecutiveNoWork: number;
  interrupted: boolean;
  backoffMs: number;
}

const userLoops = new Map<string, UserLoopState>();
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 10 * 60_000;
const IDLE_CHECK_MS = 15 * 60_000;
const POST_BATCH_DELAY_MS = 60_000;

function getState(userId: string): UserLoopState {
  if (!userLoops.has(userId)) {
    userLoops.set(userId, {
      phase: "idle",
      activeStreamId: null,
      lastRunAt: 0,
      consecutiveNoWork: 0,
      interrupted: false,
      backoffMs: MIN_DELAY_MS,
    });
  }
  return userLoops.get(userId)!;
}

function clearTimer(userId: string) {
  const timer = activeTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(userId);
  }
}

function scheduleNext(userId: string, delayMs: number) {
  clearTimer(userId);
  const timer = setTimeout(() => {
    activeTimers.delete(userId);
    runLoopIteration(userId).catch(err => {
      logger.error("Loop iteration error", { userId, error: String(err) });
      scheduleNext(userId, MAX_DELAY_MS);
    });
  }, delayMs);
  activeTimers.set(userId, timer);
}

export function onLivestreamDetected(userId: string, streamId: number) {
  const state = getState(userId);
  state.phase = "livestream";
  state.activeStreamId = streamId;
  state.interrupted = true;
  state.consecutiveNoWork = 0;
  state.backoffMs = MIN_DELAY_MS;

  clearTimer(userId);

  logger.info("Content loop PAUSED — livestream detected", { userId, streamId });
  sendSSEEvent(userId, "content-loop", { phase: "livestream", streamId });
}

export function onStreamEnded(userId: string, streamId: number) {
  const state = getState(userId);
  state.phase = "stream-exhaust";
  state.activeStreamId = streamId;
  state.interrupted = false;
  state.consecutiveNoWork = 0;
  state.backoffMs = MIN_DELAY_MS;

  logger.info("Content loop ACTIVATED — stream ended, beginning content extraction", { userId, streamId });
  sendSSEEvent(userId, "content-loop", { phase: "stream-exhaust", streamId });

  scheduleNext(userId, 5_000);
}

export async function bootContentLoops() {
  try {
    const userRows = await db
      .selectDistinct({ userId: channels.userId })
      .from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        sql`${channels.accessToken} IS NOT NULL`,
        sql`${channels.userId} IS NOT NULL`,
      ));

    for (const row of userRows) {
      if (!row.userId) continue;

      const liveStreams = await db.select().from(streams)
        .where(and(eq(streams.userId, row.userId), eq(streams.status, "live")))
        .limit(1);

      if (liveStreams.length > 0) {
        const state = getState(row.userId);
        state.phase = "livestream";
        state.activeStreamId = liveStreams[0].id;
        logger.info("Boot: user has live stream, loop paused", { userId: row.userId });
        continue;
      }

      const hasWork = await checkAnyWorkRemaining(row.userId);
      if (hasWork) {
        const state = getState(row.userId);
        state.phase = "stream-exhaust";
        state.backoffMs = MIN_DELAY_MS;
        logger.info("Boot: user has unexhausted content, starting loop", { userId: row.userId });
        scheduleNext(row.userId, 10_000 + Math.random() * 20_000);
      } else {
        const state = getState(row.userId);
        state.phase = "idle";
        scheduleNext(row.userId, IDLE_CHECK_MS);
        logger.info("Boot: user idle, scheduling periodic check", { userId: row.userId });
      }
    }

    logger.info("Content loops booted", { users: userRows.length });
  } catch (err) {
    logger.error("Failed to boot content loops", { error: String(err) });
  }
}

async function checkAnyWorkRemaining(userId: string): Promise<boolean> {
  const unexhausted = await db.select({ id: streams.id }).from(streams)
    .where(and(
      eq(streams.userId, userId),
      isNotNull(streams.endedAt),
      isNotNull(streams.startedAt),
      eq(streams.contentFullyExhausted, false),
    ))
    .limit(1);

  return unexhausted.length > 0;
}

async function checkVodWorkRemaining(userId: string): Promise<boolean> {
  const { findOptimizableVodCount } = await import("./vod-optimizer-engine");
  const count = await findOptimizableVodCount(userId);
  return count > 0;
}

async function runStreamExhaustBatch(userId: string): Promise<{ didWork: boolean; exhausted: boolean }> {
  try {
    const { runSingleBatchForUser } = await import("./daily-content-engine");
    const result = await runSingleBatchForUser(userId);
    return result;
  } catch (err) {
    logger.error("Stream exhaust batch failed", { userId, error: String(err) });
    return { didWork: false, exhausted: false };
  }
}

async function runVodOptimizeBatch(userId: string): Promise<{ didWork: boolean; allDone: boolean }> {
  try {
    const { runSingleVodBatchForUser } = await import("./vod-optimizer-engine");
    const result = await runSingleVodBatchForUser(userId);
    return result;
  } catch (err) {
    logger.error("VOD optimize batch failed", { userId, error: String(err) });
    return { didWork: false, allDone: false };
  }
}

async function runThumbnailBatch(userId: string): Promise<{ didWork: boolean }> {
  try {
    const { runAutoThumbnailForUser } = await import("./auto-thumbnail-engine");
    const result = await runAutoThumbnailForUser(userId);
    return { didWork: result > 0 };
  } catch (err) {
    logger.error("Thumbnail batch failed", { userId, error: String(err) });
    return { didWork: false };
  }
}

async function runLoopIteration(userId: string) {
  const state = getState(userId);

  if (state.phase === "livestream") {
    return;
  }

  if (state.interrupted) {
    state.interrupted = false;
    state.phase = "idle";
    scheduleNext(userId, IDLE_CHECK_MS);
    return;
  }

  state.lastRunAt = Date.now();

  if (state.phase === "stream-exhaust" || state.phase === "idle") {
    const hasStreamContent = await checkAnyWorkRemaining(userId);

    if (hasStreamContent) {
      state.phase = "stream-exhaust";
      sendSSEEvent(userId, "content-loop", { phase: "stream-exhaust" });

      const { didWork, exhausted } = await runStreamExhaustBatch(userId);

      if (didWork) {
        state.consecutiveNoWork = 0;
        state.backoffMs = POST_BATCH_DELAY_MS;

        const thumbResult = await runThumbnailBatch(userId);

        if (exhausted) {
          logger.info("Stream batch done + stream exhausted, checking for more streams", { userId });
          const moreStreams = await checkAnyWorkRemaining(userId);
          if (moreStreams) {
            scheduleNext(userId, POST_BATCH_DELAY_MS);
          } else {
            state.phase = "vod-optimize";
            logger.info("All streams exhausted, moving to VOD optimization", { userId });
            sendSSEEvent(userId, "content-loop", { phase: "vod-optimize" });
            scheduleNext(userId, POST_BATCH_DELAY_MS);
          }
        } else {
          scheduleNext(userId, POST_BATCH_DELAY_MS);
        }
        return;
      } else {
        state.consecutiveNoWork++;
      }
    } else {
      state.phase = "vod-optimize";
    }
  }

  if (state.phase === "vod-optimize") {
    sendSSEEvent(userId, "content-loop", { phase: "vod-optimize" });

    const hasVodWork = await checkVodWorkRemaining(userId);
    if (hasVodWork) {
      const { didWork, allDone } = await runVodOptimizeBatch(userId);

      if (didWork) {
        state.consecutiveNoWork = 0;
        state.backoffMs = POST_BATCH_DELAY_MS * 2;

        await runThumbnailBatch(userId);

        const newStreamContent = await checkAnyWorkRemaining(userId);
        if (newStreamContent) {
          state.phase = "stream-exhaust";
          logger.info("New stream content found during VOD phase, cycling back", { userId });
          scheduleNext(userId, MIN_DELAY_MS);
          return;
        }

        if (allDone) {
          state.phase = "thumbnail-gen";
          scheduleNext(userId, POST_BATCH_DELAY_MS);
        } else {
          scheduleNext(userId, POST_BATCH_DELAY_MS * 2);
        }
        return;
      }
    }

    state.phase = "thumbnail-gen";
  }

  if (state.phase === "thumbnail-gen") {
    sendSSEEvent(userId, "content-loop", { phase: "thumbnail-gen" });

    const { didWork } = await runThumbnailBatch(userId);

    const newStreamContent = await checkAnyWorkRemaining(userId);
    if (newStreamContent) {
      state.phase = "stream-exhaust";
      state.consecutiveNoWork = 0;
      logger.info("New stream content found after thumbnails, cycling back", { userId });
      scheduleNext(userId, MIN_DELAY_MS);
      return;
    }

    if (didWork) {
      state.consecutiveNoWork = 0;
      scheduleNext(userId, POST_BATCH_DELAY_MS);
      return;
    }

    try {
      const { regenerateThumbnailsForUnderperformers } = await import("./auto-thumbnail-engine");
      const refreshed = await regenerateThumbnailsForUnderperformers(userId);
      if (refreshed > 0) {
        logger.info("Refreshed thumbnails for underperformers", { userId, count: refreshed });
      }
    } catch (err) {
      logger.error("Underperformer thumbnail refresh failed in loop", { userId, error: String(err) });
    }

    try {
      const { organizePlaylistsForUser } = await import("./playlist-manager");
      const { assigned, playlistsCreated } = await organizePlaylistsForUser(userId);
      if (assigned > 0 || playlistsCreated > 0) {
        logger.info("Auto-organized playlists", { userId, assigned, playlistsCreated });
      }
    } catch (err) {
      logger.error("Playlist organization failed in loop", { userId, error: String(err) });
    }

    state.phase = "idle";
  }

  if (state.phase === "idle" || state.phase === "cooldown") {
    state.phase = "idle";
    state.consecutiveNoWork++;

    try {
      const { resumeNormalPriorities, getUserPriorityState } = await import("./priority-orchestrator");
      const priorityState = await getUserPriorityState(userId);
      if (priorityState.mode === "post-stream-harvest") {
        resumeNormalPriorities(userId);
      }
    } catch {}

    const backoff = Math.min(
      IDLE_CHECK_MS * Math.pow(1.5, Math.min(state.consecutiveNoWork - 1, 5)),
      MAX_DELAY_MS * 3
    );
    state.backoffMs = backoff;

    sendSSEEvent(userId, "content-loop", { phase: "idle", nextCheckIn: Math.round(backoff / 1000) });

    logger.info("Content loop idle — all content squeezed, waiting for new streams", {
      userId,
      consecutiveNoWork: state.consecutiveNoWork,
      nextCheckMs: Math.round(backoff),
    });

    scheduleNext(userId, backoff);
  }
}

export function getLoopStatus(userId: string): {
  phase: LoopPhase;
  activeStreamId: number | null;
  lastRunAt: number;
  consecutiveNoWork: number;
  isRunning: boolean;
} {
  const state = getState(userId);
  return {
    phase: state.phase,
    activeStreamId: state.activeStreamId,
    lastRunAt: state.lastRunAt,
    consecutiveNoWork: state.consecutiveNoWork,
    isRunning: state.phase !== "idle" && state.phase !== "livestream",
  };
}

export function forceStartLoop(userId: string) {
  const state = getState(userId);
  if (state.phase === "livestream") return;

  state.phase = "stream-exhaust";
  state.consecutiveNoWork = 0;
  state.backoffMs = MIN_DELAY_MS;
  state.interrupted = false;

  scheduleNext(userId, 1_000);
  logger.info("Content loop force-started", { userId });
}

setInterval(() => {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const [userId, state] of userLoops) {
    if (state.phase === "idle" && state.lastRunAt < cutoff && state.lastRunAt > 0) {
      clearTimer(userId);
      userLoops.delete(userId);
    }
  }
}, 6 * 60 * 60 * 1000);

process.on("SIGTERM", () => {
  for (const [userId] of activeTimers) clearTimer(userId);
});
process.on("SIGINT", () => {
  for (const [userId] of activeTimers) clearTimer(userId);
});
