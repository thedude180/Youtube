import { db } from "../db";
import { streamLifecycleStates, streamDetectionLog, type InsertStreamLifecycleState, type InsertStreamDetectionLog } from "@shared/schema";
import { ps5Detector, type LiveDetectionResult } from "./ps5-live-detector";
import { fireAgentEvent } from "./agent-events";
import { eq, desc } from "drizzle-orm";
import { jobQueue } from "./intelligent-job-queue";

import { createLogger } from "../lib/logger";

const logger = createLogger("stream-lifecycle");
export type StreamState = "idle" | "pre_live" | "live" | "ending" | "post_processing";

interface ConfirmationState {
  detectedAt: Date;
  videoId: string;
  platform: string;
  title: string;
}

const pendingConfirmation = new Map<string, ConfirmationState>();
const activeManagers = new Set<string>();

/**
 * AUTONOMOUS: Manages the lifecycle of a stream.
 * Handles detection, confirmation (false-positive guard), and state transitions.
 */
export class StreamLifecycleManager {
  private userId: string;
  private interval: NodeJS.Timeout | null = null;
  private lastKnownVideoId: string | undefined;
  private lastKnownPlatform: string | undefined;

  constructor(userId: string) {
    this.userId = userId;
  }

  async start() {
    if (this.interval) return;
    activeManagers.add(this.userId);
    this.interval = setInterval(() => this.tick(), 90000);
    await this.tick(); // Initial run
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    activeManagers.delete(this.userId);
  }

  private async tick() {
    try {
      const currentState = await getState(this.userId);
      const results = await ps5Detector.detect(this.userId);
      const primaryResult = results.find(r => r.isLive);

      if (currentState === "idle") {
        if (primaryResult) {
          await this.handleInitialDetection(primaryResult);
        }
      } else if (currentState === "live") {
        if (!primaryResult) {
          // Verify it's really gone before ending
          const recheck = await ps5Detector.detect(this.userId);
          if (!recheck.some(r => r.isLive)) {
            await transition(this.userId, "ending", { reason: "stream_not_detected" });
            await transition(this.userId, "post_processing", { reason: "cleanup" });
            await transition(this.userId, "idle", { reason: "cycle_complete" });
            
            // Fire stream.ended which is caught by agent-events.ts to start post-stream factory
            // Use lastKnownVideoId captured when stream was confirmed live
            fireAgentEvent("stream.ended", this.userId, {
              videoId: this.lastKnownVideoId,
              platform: this.lastKnownPlatform
            });
          }
        }
      }
    } catch (err) {
      logger.error(`[StreamLifecycle] Error for user ${this.userId}:`, err);
    }
  }

  private async handleInitialDetection(result: LiveDetectionResult) {
    const pending = pendingConfirmation.get(this.userId);
    const now = new Date();

    if (!pending) {
      logger.info(`[StreamLifecycle] Potential live detected for ${this.userId}, starting 3min confirmation window.`);
      pendingConfirmation.set(this.userId, {
        detectedAt: now,
        videoId: result.videoId || "pending",
        platform: result.platform,
        title: result.title || "Untitled"
      });
      return;
    }

    const diffMs = now.getTime() - pending.detectedAt.getTime();
    if (diffMs >= 3 * 60 * 1000) {
      // Confirmed!
      logger.info(`[StreamLifecycle] Stream confirmed for ${this.userId} after ${diffMs/1000}s`);
      pendingConfirmation.delete(this.userId);

      // Capture videoId/platform while we know the stream is live
      this.lastKnownVideoId = result.videoId || pending.videoId;
      this.lastKnownPlatform = result.platform || pending.platform;

      await transition(this.userId, "live", {
        videoId: this.lastKnownVideoId,
        platform: this.lastKnownPlatform,
        title: result.title,
        confirmedAt: now.toISOString()
      });
      
      fireAgentEvent("stream.started", this.userId, {
        videoId: this.lastKnownVideoId,
        platform: this.lastKnownPlatform,
        streamTitle: result.title
      });
    }
  }
}

export async function transition(userId: string, newState: StreamState, context: any = {}) {
  const prevState = await getState(userId);
  
  if (!isValidTransition(prevState, newState)) {
    logger.warn(`[StreamLifecycle] Invalid transition attempt: ${prevState} -> ${newState} for user ${userId}`);
    return;
  }

  await db.insert(streamLifecycleStates).values({
    userId,
    state: newState,
    prevState,
    context,
    transitionedAt: new Date()
  });

  fireAgentEvent(`stream.${newState}` as any, userId, { prevState, context });
}

export async function getState(userId: string): Promise<StreamState> {
  const [latest] = await db.select()
    .from(streamLifecycleStates)
    .where(eq(streamLifecycleStates.userId, userId))
    .orderBy(desc(streamLifecycleStates.transitionedAt))
    .limit(1);
  
  return (latest?.state as StreamState) || "idle";
}

function isValidTransition(from: StreamState, to: StreamState): boolean {
  const allowed: Record<StreamState, StreamState[]> = {
    idle: ["pre_live", "live"],
    pre_live: ["live", "idle"],
    live: ["ending"],
    ending: ["post_processing", "idle"],
    post_processing: ["idle"]
  };
  return allowed[from].includes(to);
}

const managers = new Map<string, StreamLifecycleManager>();

export const streamLifecycle = {
  transition,
  getState
};

export function startLifecycleManager(userId: string) {
  if (managers.has(userId)) return;
  const manager = new StreamLifecycleManager(userId);
  managers.set(userId, manager);
  manager.start();
}

export function stopLifecycleManager(userId: string) {
  const manager = managers.get(userId);
  if (manager) {
    manager.stop();
    managers.delete(userId);
  }
}

export function stopAllLifecycleManagers() {
  for (const [userId, manager] of managers) {
    manager.stop();
  }
  managers.clear();
}
