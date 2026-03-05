/**
 * Agent Event Bus — lightweight pub/sub for cross-agent coordination.
 * Agents fire events; other agents subscribe and react immediately.
 * No external dependencies — pure in-process event routing.
 */

type AgentEventType =
  | "stream.pre_live"
  | "stream.started"
  | "stream.ended"
  | "stream.post_processing"
  | "upload.detected"
  | "sweep.completed"
  | "sweep.phase_changed"
  | "consistency.completed"
  | "agent.session.started"
  | "agent.session.stopped"
  | "empire.activated";

interface AgentEvent {
  type: AgentEventType;
  userId: string;
  payload?: Record<string, any>;
  firedAt: Date;
}

type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

const subscribers = new Map<AgentEventType, AgentEventHandler[]>();
const recentEvents: AgentEvent[] = [];
const MAX_RECENT = 50;

const logger = {
  info: (msg: string) => console.log(`[agent-events] ${msg}`),
  warn: (msg: string) => console.warn(`[agent-events] WARN ${msg}`),
};

export function onAgentEvent(type: AgentEventType, handler: AgentEventHandler): void {
  const existing = subscribers.get(type) || [];
  existing.push(handler);
  subscribers.set(type, existing);
}

export function fireAgentEvent(type: AgentEventType, userId: string, payload?: Record<string, any>): void {
  const event: AgentEvent = { type, userId, payload, firedAt: new Date() };

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT) recentEvents.length = MAX_RECENT;

  logger.info(`Event fired: ${type} for user ${userId.slice(0, 8)}...`);

  const handlers = subscribers.get(type) || [];
  for (const handler of handlers) {
    Promise.resolve(handler(event)).catch(err => {
      logger.warn(`Handler for ${type} failed: ${err?.message}`);
    });
  }
}

export function getRecentEvents(userId?: string, limit = 20): AgentEvent[] {
  const filtered = userId ? recentEvents.filter(e => e.userId === userId) : recentEvents;
  return filtered.slice(0, limit);
}

// ── Scheduling helpers ─────────────────────────────────────────────────────
function minutesFromNow(n: number): Date {
  return new Date(Date.now() + n * 60_000);
}
function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3_600_000);
}

/**
 * Wire all cross-agent reactions. Call once at startup.
 * This is where the "god level" coordination lives.
 */
export async function wireAgentCoordination(): Promise<void> {
  logger.info("Wiring agent coordination event handlers");

  // ── PRE-STREAM PIPELINE ─────────────────────────────────────────────────
  // When stream.started fires → start the autonomous stream operator + announce
  onAgentEvent("stream.started", async (event) => {
    const { videoId, gameTitle, liveChatId, title } = event.payload || {};
    logger.info(`stream.started for ${event.userId.slice(0, 8)} — launching pre-stream pipeline`);

    // 1. Immediately start the stream operator (if liveChatId available)
    if (liveChatId) {
      setTimeout(async () => {
        try {
          const { startStreamOperator } = await import("./stream-operator");
          await startStreamOperator(event.userId, { liveChatId });
          logger.info(`Stream operator started for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Stream operator startup failed: ${err.message}`);
        }
      }, 0);
    }

    // 2. T+1min: Community post announcing the stream
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "pre_stream_community_post",
          userId: event.userId,
          priority: 9,
          payload: { videoId, gameTitle, title },
          dedupeKey: `pre_stream_announce:${videoId || event.userId}`,
        });
        logger.info(`Pre-stream community post queued for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Pre-stream community post failed: ${err.message}`);
      }
    }, 60_000);

    // 3. T+1min: Discord live announcement
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "discord_live_announce",
          userId: event.userId,
          priority: 9,
          payload: { videoId, gameTitle, title },
          dedupeKey: `discord_announce:${videoId || event.userId}`,
        });
      } catch (err: any) {
        logger.warn(`Discord live announce queue failed: ${err.message}`);
      }
    }, 60_000);
  });

  // When a stream ends → immediately scan for new uploads + run consistency
  onAgentEvent("stream.ended", async (event) => {
    logger.info(`Stream ended for ${event.userId.slice(0, 8)} — triggering upload scan + consistency check`);

    const videoId = event.payload?.videoId;
    const gameTitle = event.payload?.gameTitle || "Gaming Stream";

    // 1. Immediately trigger upload watcher scan
    setTimeout(async () => {
      try {
        const { scanUserNow } = await import("./youtube-upload-watcher");
        await scanUserNow(event.userId);
        logger.info(`Post-stream upload scan done for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Post-stream upload scan failed: ${err.message}`);
      }
    }, 30_000); // Wait 30s for VOD to be available

    // 2. Run consistency agent to audit the new VOD content
    setTimeout(async () => {
      try {
        const { runConsistencyCheckForUser } = await import("./content-consistency-agent");
        await runConsistencyCheckForUser(event.userId);
        logger.info(`Post-stream consistency check done for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Post-stream consistency check failed: ${err.message}`);
      }
    }, 5 * 60_000); // Wait 5 min for content to process

    // --- AUTONOMOUS CONTENT FACTORY CASCADE ---

    // 3. Shorts Factory (T+2min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { shortsFactory } = await import("./shorts-factory");
          await shortsFactory.process(event.userId, videoId, gameTitle);
          logger.info(`Autonomous shorts factory started for user ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Autonomous shorts factory failed: ${err.message}`);
        }
      }, 2 * 60_000);
    }

    // 4. VOD SEO Optimizer (T+15min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { vodSEOOptimizer } = await import("./vod-seo-optimizer");
          await vodSEOOptimizer.optimize(event.userId, videoId);
          logger.info(`Autonomous VOD SEO optimizer started for user ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Autonomous VOD SEO optimizer failed: ${err.message}`);
        }
      }, 15 * 60_000);
    }

    // 5. Multi-Platform Distribution (T+20min)
    // Distribution often depends on clips being ready, but can also distribute VOD link
    setTimeout(async () => {
      try {
        const { multiPlatformDistributor } = await import("./multi-platform-distributor");
        await multiPlatformDistributor.distribute(event.userId, { videoId, gameTitle, title: "Stream Highlights" }, ["tiktok", "x", "discord"]);
        logger.info(`Autonomous distribution started for user ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Autonomous distribution failed: ${err.message}`);
      }
    }, 20 * 60_000);

    // 6. Community Post Job (T+30min)
    setTimeout(async () => {
      try {
        const { jobQueue } = await import("./intelligent-job-queue");
        await jobQueue.enqueue({
          type: "community_post_update",
          userId: event.userId,
          priority: 7,
          payload: { videoId, gameTitle, type: "stream_summary" },
          dedupeKey: `post_stream_community:${videoId || event.userId}`,
        });
        logger.info(`Autonomous community post job enqueued for user ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Autonomous community post job failed: ${err.message}`);
      }
    }, 30 * 60_000);

    // 7. Stream Performance Analysis (T+60min)
    if (videoId) {
      setTimeout(async () => {
        try {
          const { jobQueue } = await import("./intelligent-job-queue");
          await jobQueue.enqueue({
            type: "stream_performance_analysis",
            userId: event.userId,
            priority: 5,
            payload: { videoId, gameTitle },
            scheduledFor: minutesFromNow(60),
            dedupeKey: `stream_analysis:${videoId}`,
          });
          logger.info(`Stream performance analysis queued for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Stream performance analysis queue failed: ${err.message}`);
        }
      }, 60 * 60_000);
    }

    // 8. Evergreen Recycler (T+24hr) — repurpose best moments as new content
    if (videoId) {
      setTimeout(async () => {
        try {
          const { jobQueue } = await import("./intelligent-job-queue");
          await jobQueue.enqueue({
            type: "evergreen_recycler",
            userId: event.userId,
            priority: 3,
            payload: { videoId, gameTitle },
            scheduledFor: hoursFromNow(24),
            dedupeKey: `evergreen:${videoId}`,
          });
          logger.info(`Evergreen recycler queued for ${event.userId.slice(0, 8)}`);
        } catch (err: any) {
          logger.warn(`Evergreen recycler queue failed: ${err.message}`);
        }
      }, 24 * 60 * 60_000);
    }

    // 9. Stop stream operator when stream ends
    setTimeout(async () => {
      try {
        const { stopStreamOperator } = await import("./stream-operator");
        await stopStreamOperator(event.userId);
        logger.info(`Stream operator stopped for ${event.userId.slice(0, 8)}`);
      } catch (err: any) {
        logger.warn(`Stream operator stop failed: ${err.message}`);
      }
    }, 5_000); // 5s grace period
  });

  // When a new upload is detected → run consistency check on it
  onAgentEvent("upload.detected", async (event) => {
    logger.info(`New upload for ${event.userId.slice(0, 8)} — scheduling consistency audit`);
    setTimeout(async () => {
      try {
        const { runConsistencyCheckForUser } = await import("./content-consistency-agent");
        await runConsistencyCheckForUser(event.userId);
      } catch (err: any) {
        logger.warn(`Upload-triggered consistency check failed: ${err.message}`);
      }
    }, 2 * 60_000); // Wait 2 min for upload processing
  });

  // When empire is activated → start stream agent if not already running
  onAgentEvent("empire.activated", async (event) => {
    logger.info(`Empire activated for ${event.userId.slice(0, 8)} — ensuring stream agent is running`);
    try {
      const { initStreamAgentForUser } = await import("./stream-agent");
      await initStreamAgentForUser(event.userId);
    } catch (err: any) {
      logger.warn(`Empire stream agent init failed: ${err.message}`);
    }
  });

  // When sweep completes → immediately trigger TikTok autopublisher for new clips
  onAgentEvent("sweep.completed", async (event) => {
    logger.info(`Sweep completed for ${event.userId.slice(0, 8)} — triggering TikTok autopublisher`);
    setTimeout(async () => {
      try {
        const { startTikTokAutopublisher } = await import("./tiktok-clip-autopublisher");
        await startTikTokAutopublisher(event.userId);
      } catch (err: any) {
        logger.warn(`Sweep-triggered TikTok autopublisher failed: ${err.message}`);
      }
    }, 30_000); // 30s delay for clip processing to complete
  });

  // When an agent session starts → log it
  onAgentEvent("agent.session.started", async (event) => {
    logger.info(`Agent session started for ${event.userId.slice(0, 8)} — tier: ${event.payload?.tier}`);
  });

  logger.info("Agent coordination wired — all cross-agent reactions active");
}
