import { db } from "./db";
import { streams, channels, autopilotQueue, notifications } from "@shared/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sendSSEEvent } from "./routes/events";

const logger = createLogger("priority-orchestrator");

export type PriorityMode = "livestream" | "post-stream-harvest" | "daily-content" | "vod-optimization" | "idle";

interface UserPriorityState {
  mode: PriorityMode;
  activeStreamId: number | null;
  streamTitle: string | null;
  streamStartedAt: Date | null;
  previousMode: PriorityMode;
  modeChangedAt: Date;
  postStreamCooldownUntil: Date | null;
}

const userStates = new Map<string, UserPriorityState>();

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const entries = Array.from(userStates.entries());
    for (const [userId, state] of entries) {
      if ((state.mode === "idle" || state.mode === "daily-content") && state.modeChangedAt.getTime() < cutoff) {
        userStates.delete(userId);
      }
    }
    logger.info("Priority state cleanup", { remaining: userStates.size });
  }, CLEANUP_INTERVAL);
}

startCleanup();

function getDefaultState(): UserPriorityState {
  return {
    mode: "daily-content",
    activeStreamId: null,
    streamTitle: null,
    streamStartedAt: null,
    previousMode: "daily-content",
    modeChangedAt: new Date(),
    postStreamCooldownUntil: null,
  };
}

export async function getUserPriorityState(userId: string): Promise<UserPriorityState> {
  if (userStates.has(userId)) {
    const state = userStates.get(userId)!;
    if (state.mode === "post-stream-harvest" && state.postStreamCooldownUntil && new Date() > state.postStreamCooldownUntil) {
      resumeNormalPriorities(userId);
      return userStates.get(userId)!;
    }
    return state;
  }

  const liveStreams = await db.select().from(streams)
    .where(and(eq(streams.userId, userId), eq(streams.status, "live")));

  if (liveStreams.length > 0) {
    const live = liveStreams[0];
    const state: UserPriorityState = {
      mode: "livestream",
      activeStreamId: live.id,
      streamTitle: live.title,
      streamStartedAt: live.startedAt || new Date(),
      previousMode: "daily-content",
      modeChangedAt: new Date(),
      postStreamCooldownUntil: null,
    };
    userStates.set(userId, state);
    return state;
  }

  const defaultState = getDefaultState();
  userStates.set(userId, defaultState);
  return defaultState;
}

function getUserPriorityStateSync(userId: string): UserPriorityState {
  if (userStates.has(userId)) {
    const state = userStates.get(userId)!;
    if (state.mode === "post-stream-harvest" && state.postStreamCooldownUntil && new Date() > state.postStreamCooldownUntil) {
      resumeNormalPriorities(userId);
      return userStates.get(userId)!;
    }
    return state;
  }
  const defaultState = getDefaultState();
  userStates.set(userId, defaultState);
  return defaultState;
}

export function setLivestreamPriority(userId: string, streamId: number, streamTitle: string): void {
  const current = getUserPriorityStateSync(userId);
  const previousMode = current.mode === "livestream" ? current.previousMode : current.mode;

  userStates.set(userId, {
    mode: "livestream",
    activeStreamId: streamId,
    streamTitle,
    streamStartedAt: new Date(),
    previousMode,
    modeChangedAt: new Date(),
    postStreamCooldownUntil: null,
  });

  logger.info("PRIORITY OVERRIDE: Livestream detected", {
    userId,
    streamId,
    streamTitle,
    previousMode,
  });

  sendSSEEvent(userId, "priority_change", {
    mode: "livestream",
    streamId,
    streamTitle,
    message: "LIVE STREAM DETECTED — All systems pivoting to livestream support",
  });
}

export function setPostStreamHarvest(userId: string, streamId: number, streamTitle: string): void {
  const current = getUserPriorityStateSync(userId);
  const cooldownEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const previousMode = current.previousMode;

  userStates.set(userId, {
    mode: "post-stream-harvest",
    activeStreamId: streamId,
    streamTitle,
    streamStartedAt: current.streamStartedAt,
    previousMode,
    modeChangedAt: new Date(),
    postStreamCooldownUntil: cooldownEnd,
  });

  logger.info("PRIORITY SHIFT: Post-stream harvest mode", {
    userId,
    streamId,
    streamTitle,
    previousMode,
    cooldownUntil: cooldownEnd.toISOString(),
  });

  sendSSEEvent(userId, "priority_change", {
    mode: "post-stream-harvest",
    streamId,
    streamTitle,
    message: "Stream ended — Harvesting highlights, clips, and content from stream",
  });

  setTimeout(() => {
    const state = getUserPriorityStateSync(userId);
    if (state.mode === "post-stream-harvest" && state.activeStreamId === streamId) {
      resumeNormalPriorities(userId);
    }
  }, 2 * 60 * 60 * 1000);
}

export function resumeNormalPriorities(userId: string): void {
  const current = getUserPriorityStateSync(userId);
  const restoredMode = current.previousMode === "livestream" || current.previousMode === "post-stream-harvest"
    ? "daily-content"
    : current.previousMode;

  userStates.set(userId, {
    mode: restoredMode,
    activeStreamId: null,
    streamTitle: null,
    streamStartedAt: null,
    previousMode: current.mode,
    modeChangedAt: new Date(),
    postStreamCooldownUntil: null,
  });

  logger.info("PRIORITY RESTORED: Normal priorities resumed", {
    userId,
    previousMode: current.mode,
    restoredTo: restoredMode,
  });

  sendSSEEvent(userId, "priority_change", {
    mode: restoredMode,
    message: "Normal priorities restored — Daily content + VOD optimization active",
  });
}

export function getCurrentPriority(userId: string): {
  mode: PriorityMode;
  label: string;
  description: string;
  priorities: Array<{ rank: number; name: string; status: string; active: boolean }>;
} {
  const state = getUserPriorityStateSync(userId);

  const isLive = state.mode === "livestream";
  const isHarvesting = state.mode === "post-stream-harvest";

  const priorities = [
    {
      rank: 0,
      name: "Livestream Pipeline",
      status: isLive ? `ACTIVE — "${state.streamTitle}" — live to YouTube/Twitch/Kick, text alerts to X/Discord` : "Standby (auto-activates on stream detection)",
      active: isLive,
    },
    {
      rank: 1,
      name: "Post-Stream Harvest",
      status: isHarvesting ? `ACTIVE — Extracting clips & content from "${state.streamTitle}" — videos → YouTube/TikTok, text → X/Discord` : "Standby (auto-activates after stream ends)",
      active: isHarvesting,
    },
    {
      rank: 2,
      name: "Top YouTuber Growth",
      status: isLive || isHarvesting ? "Paused (livestream/harvest priority)" : "Active — Algorithmic optimization running",
      active: !isLive && !isHarvesting,
    },
    {
      rank: 3,
      name: "Daily Content Upload",
      status: isLive || isHarvesting
        ? isHarvesting ? "Paused (harvesting stream content)" : "Paused (livestream priority)"
        : "Active — 1 long-form + 3 shorts daily, videos → YouTube/TikTok, text → X/Discord",
      active: !isLive && !isHarvesting,
    },
    {
      rank: 4,
      name: "VOD Optimization",
      status: isLive || isHarvesting
        ? "Paused (higher priority active)"
        : "Active — Optimizing old videos, resurfacing on X/Discord to drive traffic",
      active: !isLive && !isHarvesting,
    },
  ];

  const labels: Record<PriorityMode, string> = {
    livestream: "LIVESTREAM MODE",
    "post-stream-harvest": "POST-STREAM HARVEST",
    "daily-content": "CONTENT CREATION MODE",
    "vod-optimization": "VOD OPTIMIZATION MODE",
    idle: "IDLE",
  };

  const descriptions: Record<PriorityMode, string> = {
    livestream: `Live stream "${state.streamTitle}" detected — streaming to YouTube/Twitch/Kick, text alerts firing on X/Discord`,
    "post-stream-harvest": `Harvesting content from "${state.streamTitle}" — video clips → YouTube/TikTok, text announcements → X/Discord`,
    "daily-content": "Creating daily content — videos uploaded to YouTube/TikTok, optimized text posts to X/Discord, driving traffic across all platforms",
    "vod-optimization": "Optimizing old videos — refreshing metadata on YouTube, resurfacing on X/Discord to drive new traffic",
    idle: "All systems on standby",
  };

  return {
    mode: state.mode,
    label: labels[state.mode],
    description: descriptions[state.mode],
    priorities,
  };
}

export function shouldRunDailyContent(userId: string): boolean {
  const state = getUserPriorityStateSync(userId);
  return state.mode !== "livestream" && state.mode !== "post-stream-harvest";
}

export function shouldRunVodOptimization(userId: string): boolean {
  const state = getUserPriorityStateSync(userId);
  return state.mode !== "livestream" && state.mode !== "post-stream-harvest";
}

export function shouldRunBacklogProcessing(userId: string): boolean {
  const state = getUserPriorityStateSync(userId);
  return state.mode !== "livestream";
}

export function isLiveStreamActive(userId: string): boolean {
  const state = getUserPriorityStateSync(userId);
  return state.mode === "livestream";
}

export async function getPriorityDashboard(userId: string): Promise<{
  currentPriority: ReturnType<typeof getCurrentPriority>;
  stats: {
    todayContentQueued: number;
    vodsOptimizedThisWeek: number;
    liveStreamsThisWeek: number;
    totalContentCreatedThisWeek: number;
  };
}> {
  await getUserPriorityState(userId);
  const currentPriority = getCurrentPriority(userId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 86400000);

  const [todayContent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.targetPlatform, "youtube"),
      gte(autopilotQueue.createdAt, todayStart),
    ));

  const [weekContent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      gte(autopilotQueue.createdAt, weekStart),
    ));

  const [weekStreams] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(streams)
    .where(and(
      eq(streams.userId, userId),
      gte(streams.startedAt, weekStart),
    ));

  const [vodsOptimized] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.type, "vod-optimization"),
      gte(autopilotQueue.createdAt, weekStart),
    ));

  return {
    currentPriority,
    stats: {
      todayContentQueued: todayContent?.count || 0,
      vodsOptimizedThisWeek: vodsOptimized?.count || 0,
      liveStreamsThisWeek: weekStreams?.count || 0,
      totalContentCreatedThisWeek: weekContent?.count || 0,
    },
  };
}

process.on("SIGTERM", () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
});

process.on("SIGINT", () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
});
