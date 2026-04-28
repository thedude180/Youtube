import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { getQuotaStatus } from "./youtube-quota-tracker";

const logger = createLogger("content-sweep");

interface SweepState {
  userId: string;
  phase: "idle" | "syncing" | "clipping" | "repurposing" | "complete" | "error" | "cancelled";
  videosSynced: number;
  videosClipped: number;
  videosRepurposed: number;
  videosTotal: number;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  cancelRequested: boolean;
}

const sweepStates = new Map<string, SweepState>();

function getOrCreateState(userId: string): SweepState {
  if (!sweepStates.has(userId)) {
    sweepStates.set(userId, {
      userId,
      phase: "idle",
      videosSynced: 0,
      videosClipped: 0,
      videosRepurposed: 0,
      videosTotal: 0,
      startedAt: null,
      completedAt: null,
      lastError: null,
      cancelRequested: false,
    });
  }
  return sweepStates.get(userId)!;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSweep(userId: string): Promise<void> {
  const state = sweepStates.get(userId)!;

  try {
    const userChannels = await storage.getChannelsByUser(userId);
    const ytChannel = userChannels.find((c: any) => c.platform === "youtube" && c.accessToken);
    if (!ytChannel) {
      state.phase = "error";
      state.lastError = "No YouTube channel connected";
      return;
    }

    state.phase = "syncing";
    logger.info(`[${userId}] Content sweep Phase 1: Syncing from YouTube channel ${ytChannel.id}`);

    try {
      const { syncYouTubeVideosToLibrary } = await import("../youtube");
      const syncResult = await syncYouTubeVideosToLibrary(ytChannel.id, userId);
      state.videosSynced = syncResult.synced?.length ?? 0;
      logger.info(`[${userId}] Sync complete — ${state.videosSynced} total videos in library`);
    } catch (err: any) {
      logger.warn(`[${userId}] Sync error (continuing): ${err.message}`);
    }

    if (state.cancelRequested) { state.phase = "cancelled"; return; }

    state.phase = "clipping";
    logger.info(`[${userId}] Content sweep Phase 2: Starting shorts pipeline`);

    try {
      const { startShortsPipeline } = await import("../shorts-pipeline-engine");
      await startShortsPipeline(userId, "new-only");
      logger.info(`[${userId}] Shorts pipeline kicked off`);
    } catch (err: any) {
      logger.warn(`[${userId}] Shorts pipeline error (continuing): ${err.message}`);
    }

    await delay(3000);
    if (state.cancelRequested) { state.phase = "cancelled"; return; }

    state.phase = "repurposing";
    const allVideos = await storage.getVideosByUser(userId);
    const toRepurpose = allVideos.filter((v: any) => {
      const meta = v.metadata as any;
      return !meta?.repurposedFormats || meta.repurposedFormats.length === 0;
    });

    state.videosTotal = toRepurpose.length;
    logger.info(`[${userId}] Content sweep Phase 3: Repurposing ${toRepurpose.length} videos`);

    const { repurposeVideo } = await import("../repurpose-engine");
    // Process ONE video at a time (was 3 in parallel) — the repurpose engine uses
    // the background AI tier, so serial processing prevents background queue floods.
    const INTER_VIDEO_DELAY_MS = 8000; // 8s between videos gives the semaphore room
    const FORMATS = ["blog", "twitter_thread", "instagram_caption"];

    for (const video of toRepurpose) {
      if (state.cancelRequested) { state.phase = "cancelled"; return; }

      const quota = await getQuotaStatus(userId);
      if (quota.remaining < 200) {
        logger.warn(`[${userId}] Quota too low (${quota.remaining}), pausing repurpose phase`);
        await delay(60_000);
      }

      try {
        await repurposeVideo(userId, video.id, FORMATS);
        const updatedMeta = { ...(video.metadata as any), repurposedFormats: FORMATS };
        await storage.updateVideo(video.id, { metadata: updatedMeta });
        state.videosRepurposed++;
        logger.info(`[${userId}] Repurposed video ${video.id} — ${state.videosRepurposed}/${state.videosTotal}`);
      } catch (err: any) {
        logger.warn(`[${userId}] Repurpose failed for video ${video.id}: ${err.message}`);
      }

      await delay(INTER_VIDEO_DELAY_MS);
    }

    state.phase = "complete";
    state.completedAt = new Date();
    logger.info(`[${userId}] Content sweep complete — ${state.videosRepurposed} videos repurposed`);
    try {
      const { fireAgentEvent } = await import("./agent-events");
      fireAgentEvent("sweep.completed", userId, {
        videosSynced: state.videosSynced,
        videosClipped: state.videosClipped,
        videosRepurposed: state.videosRepurposed,
      });
    } catch {}
  } catch (err: any) {
    state.phase = "error";
    state.lastError = err.message;
    logger.error(`[${userId}] Content sweep failed: ${err.message}`);
  }
}

export async function startContentSweep(userId: string): Promise<{ started: boolean; message: string }> {
  const state = getOrCreateState(userId);
  const activePhases = ["syncing", "clipping", "repurposing"];
  if (activePhases.includes(state.phase)) {
    return { started: false, message: "Sweep already running" };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const hasYouTube = userChannels.some((c: any) => c.platform === "youtube" && c.accessToken);
  if (!hasYouTube) {
    state.lastError = "No YouTube channel connected — connect your channel in Settings first";
    return { started: false, message: "No YouTube channel connected — connect your channel first" };
  }

  state.phase = "syncing";
  state.videosSynced = 0;
  state.videosClipped = 0;
  state.videosRepurposed = 0;
  state.videosTotal = 0;
  state.startedAt = new Date();
  state.completedAt = null;
  state.lastError = null;
  state.cancelRequested = false;

  (async () => { await runSweep(userId); })().catch(() => {});

  return { started: true, message: "Historical content sweep started — syncing your channel and processing all content" };
}

export function cancelContentSweep(userId: string): void {
  const state = sweepStates.get(userId);
  if (state) {
    state.cancelRequested = true;
  }
}

export function getContentSweepStatus(userId: string) {
  const state = getOrCreateState(userId);
  const durationMs = state.startedAt
    ? (state.completedAt ? state.completedAt.getTime() : Date.now()) - state.startedAt.getTime()
    : null;
  return { ...state, durationMs };
}

export function getAllSweepStatuses(): { userId: string; status: ReturnType<typeof getContentSweepStatus> }[] {
  return Array.from(sweepStates.keys()).map(uid => ({ userId: uid, status: getContentSweepStatus(uid) }));
}
