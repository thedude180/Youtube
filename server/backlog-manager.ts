import { db } from "./db";
import { contentPipeline, channels } from "@shared/schema";
import { eq, and, not, inArray } from "drizzle-orm";
import { storage } from "./storage";
import { sendSSEEvent } from "./routes/events";

export type BacklogState = "idle" | "running" | "paused_for_live" | "finishing_current" | "waiting_for_replay";

interface UserBacklogSession {
  userId: string;
  state: BacklogState;
  currentPipelineId: number | null;
  currentVideoTitle: string | null;
  totalQueued: number;
  totalProcessed: number;
  totalRemaining: number;
  startedAt: Date;
  pausedAt: Date | null;
  lastActivityAt: Date;
  streamId: number | null;
}

const sessions = new Map<string, UserBacklogSession>();
const activeLoops = new Set<string>();

export function getBacklogState(userId: string): UserBacklogSession | null {
  return sessions.get(userId) || null;
}

export async function startBacklogOnLogin(userId: string): Promise<{ started: boolean; message: string; state: BacklogState }> {
  const existing = sessions.get(userId);
  if (existing && (existing.state === "running" || existing.state === "finishing_current")) {
    return { started: false, message: "Backlog already running", state: existing.state };
  }

  if (existing && existing.state === "paused_for_live") {
    return { started: false, message: "Backlog paused for live stream", state: existing.state };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  if (userChannels.length === 0) {
    return { started: false, message: "No channels connected", state: "idle" };
  }

  const allVideos = await storage.getVideosByUser(userId);
  if (allVideos.length === 0) {
    return { started: false, message: "No videos in library", state: "idle" };
  }

  const existingRefreshPipelines = await db.select().from(contentPipeline)
    .where(and(
      eq(contentPipeline.userId, userId),
      eq(contentPipeline.mode, "refresh"),
      inArray(contentPipeline.status, ["completed", "processing", "queued"]),
    ));

  const alreadyDoneVideoIds = new Set(
    existingRefreshPipelines.filter(p => p.videoId).map(p => p.videoId)
  );

  const publishedVideos = allVideos.filter(v => v.status === "published");
  const remaining = publishedVideos.filter(v => !alreadyDoneVideoIds.has(v.id));

  if (remaining.length === 0) {
    sessions.set(userId, {
      userId, state: "idle", currentPipelineId: null, currentVideoTitle: null,
      totalQueued: publishedVideos.length, totalProcessed: publishedVideos.length, totalRemaining: 0,
      startedAt: new Date(), pausedAt: null, lastActivityAt: new Date(), streamId: null,
    });
    return { started: false, message: "All videos already refreshed", state: "idle" };
  }

  const session: UserBacklogSession = {
    userId,
    state: "running",
    currentPipelineId: null,
    currentVideoTitle: null,
    totalQueued: remaining.length,
    totalProcessed: 0,
    totalRemaining: remaining.length,
    startedAt: new Date(),
    pausedAt: null,
    lastActivityAt: new Date(),
    streamId: null,
  };
  sessions.set(userId, session);

  if (!activeLoops.has(userId)) {
    processBacklogContinuously(userId).catch(err => {
      console.error(`[BacklogManager] Continuous backlog failed for ${userId}:`, err);
    });
  }

  sendSSEEvent(userId, "backlog_update", { state: "running", totalRemaining: remaining.length, totalQueued: remaining.length });

  console.log(`[BacklogManager] Started continuous backlog for ${userId}: ${remaining.length} videos to process`);
  return { started: true, message: `Processing ${remaining.length} videos`, state: "running" };
}

export function pauseForLive(userId: string, streamId: number): void {
  const session = sessions.get(userId);
  if (!session) return;

  if (session.state === "running") {
    session.state = "finishing_current";
    session.streamId = streamId;
    session.lastActivityAt = new Date();
    sendSSEEvent(userId, "backlog_update", { state: "finishing_current", streamId });
    console.log(`[BacklogManager] User ${userId} went live — finishing current video then pausing`);
  } else if (session.state === "idle") {
    session.state = "paused_for_live";
    session.streamId = streamId;
    session.pausedAt = new Date();
    session.lastActivityAt = new Date();
    sendSSEEvent(userId, "backlog_update", { state: "paused_for_live", streamId });
    console.log(`[BacklogManager] User ${userId} went live — backlog paused (was idle)`);
  }
}

export async function resumeAfterStream(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) {
    await startBacklogOnLogin(userId);
    return;
  }

  session.state = "waiting_for_replay";
  session.lastActivityAt = new Date();
  console.log(`[BacklogManager] Stream ended for ${userId} — waiting for replay pipeline to complete, then resuming backlog`);

  setTimeout(async () => {
    const current = sessions.get(userId);
    if (!current) return;

    if (current.state === "waiting_for_replay" || current.state === "paused_for_live") {
      current.state = "running";
      current.streamId = null;
      current.pausedAt = null;
      current.lastActivityAt = new Date();
      sendSSEEvent(userId, "backlog_update", { state: "running", resumed: true });
      console.log(`[BacklogManager] Replay done, resuming backlog for ${userId}`);

      if (!activeLoops.has(userId)) {
        processBacklogContinuously(userId).catch(err => {
          console.error(`[BacklogManager] Resume backlog failed for ${userId}:`, err);
        });
      }
    }
  }, 30000);
}

async function processBacklogContinuously(userId: string): Promise<void> {
  if (activeLoops.has(userId)) {
    console.log(`[BacklogManager] Loop already active for ${userId}, skipping`);
    return;
  }
  activeLoops.add(userId);

  const session = sessions.get(userId);
  if (!session) {
    activeLoops.delete(userId);
    return;
  }

  try {
  while (true) {
    const current = sessions.get(userId);
    if (!current) break;

    if (current.state === "finishing_current") {
      current.state = "paused_for_live";
      current.pausedAt = new Date();
      current.currentPipelineId = null;
      current.currentVideoTitle = null;
      sendSSEEvent(userId, "backlog_update", { state: "paused_for_live" });
      console.log(`[BacklogManager] Current video done, pausing backlog for live stream (user ${userId})`);
      break;
    }

    if (current.state !== "running") {
      break;
    }

    const allVideos = await storage.getVideosByUser(userId);
    const existingRefreshPipelines = await db.select().from(contentPipeline)
      .where(and(
        eq(contentPipeline.userId, userId),
        eq(contentPipeline.mode, "refresh"),
        inArray(contentPipeline.status, ["completed", "processing", "queued"]),
      ));

    const alreadyDoneVideoIds = new Set(
      existingRefreshPipelines.filter(p => p.videoId).map(p => p.videoId)
    );

    const publishedVideos = allVideos.filter(v => v.status === "published");
    const remaining = publishedVideos.filter(v => !alreadyDoneVideoIds.has(v.id));

    current.totalRemaining = remaining.length;
    current.totalProcessed = publishedVideos.length - remaining.length;
    current.totalQueued = publishedVideos.length;

    if (remaining.length === 0) {
      current.state = "idle";
      current.currentPipelineId = null;
      current.currentVideoTitle = null;
      current.lastActivityAt = new Date();
      sendSSEEvent(userId, "backlog_update", { state: "idle", completed: true, totalProcessed: publishedVideos.length });
      console.log(`[BacklogManager] All ${publishedVideos.length} videos processed for ${userId}`);

      await storage.createNotification({
        userId,
        type: "backlog_complete",
        title: "Backlog Refresh Complete",
        message: `All ${publishedVideos.length} videos refreshed with updated titles, SEO, thumbnails, and cross-platform posts`,
        severity: "info",
      });
      sendSSEEvent(userId, "notification", { type: "new" });

      await storage.createAuditLog({
        userId,
        action: "backlog_refresh_complete",
        target: `All ${publishedVideos.length} videos refreshed`,
        details: { total: publishedVideos.length },
        riskLevel: "low",
      });
      break;
    }

    const nextVideo = remaining[0];
    current.currentVideoTitle = nextVideo.title;
    current.lastActivityAt = new Date();

    try {
      const [pipeline] = await db.insert(contentPipeline).values({
        userId,
        videoId: nextVideo.id,
        videoTitle: nextVideo.title,
        source: "backlog-refresh",
        mode: "refresh",
        currentStep: "analyze",
        status: "queued",
        completedSteps: [],
        stepResults: {},
      }).returning();

      current.currentPipelineId = pipeline.id;
      console.log(`[BacklogManager] Processing "${nextVideo.title}" (${remaining.length} remaining)`);

      await runSinglePipeline(pipeline.id, nextVideo.title, "refresh");

      current.totalProcessed++;
      current.totalRemaining--;
      current.currentPipelineId = null;
      current.currentVideoTitle = null;
      current.lastActivityAt = new Date();
    } catch (err: any) {
      console.error(`[BacklogManager] Error processing "${nextVideo.title}":`, err.message);
      current.currentPipelineId = null;
      current.currentVideoTitle = null;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  } finally {
    activeLoops.delete(userId);
  }
}

async function runSinglePipeline(pipelineId: number, videoTitle: string, mode: string): Promise<void> {
  await db.update(contentPipeline)
    .set({ status: "processing", startedAt: new Date() })
    .where(eq(contentPipeline.id, pipelineId));

  const { executePipelineInBackground } = await import("./routes/pipeline");
  await executePipelineInBackground(pipelineId, videoTitle, mode, {}, []);
}

export async function getBacklogStatus(userId: string): Promise<{
  state: BacklogState;
  currentVideoTitle: string | null;
  totalQueued: number;
  totalProcessed: number;
  totalRemaining: number;
  currentPipelineId: number | null;
  streamId: number | null;
  startedAt: Date | null;
  pausedAt: Date | null;
}> {
  const session = sessions.get(userId);

  if (!session) {
    const allVideos = await storage.getVideosByUser(userId);
    const publishedVideos = allVideos.filter(v => v.status === "published");

    const existingRefreshPipelines = await db.select().from(contentPipeline)
      .where(and(
        eq(contentPipeline.userId, userId),
        eq(contentPipeline.mode, "refresh"),
        inArray(contentPipeline.status, ["completed", "processing", "queued"]),
      ));

    const doneIds = new Set(existingRefreshPipelines.filter(p => p.videoId).map(p => p.videoId));
    const remaining = publishedVideos.filter(v => !doneIds.has(v.id));

    return {
      state: "idle",
      currentVideoTitle: null,
      totalQueued: publishedVideos.length,
      totalProcessed: publishedVideos.length - remaining.length,
      totalRemaining: remaining.length,
      currentPipelineId: null,
      streamId: null,
      startedAt: null,
      pausedAt: null,
    };
  }

  return {
    state: session.state,
    currentVideoTitle: session.currentVideoTitle,
    totalQueued: session.totalQueued,
    totalProcessed: session.totalProcessed,
    totalRemaining: session.totalRemaining,
    currentPipelineId: session.currentPipelineId,
    streamId: session.streamId,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
  };
}
