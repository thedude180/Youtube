/**
 * Agent Event Bus — lightweight pub/sub for cross-agent coordination.
 * Agents fire events; other agents subscribe and react immediately.
 * No external dependencies — pure in-process event routing.
 */

type AgentEventType =
  | "stream.started"
  | "stream.ended"
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

/**
 * Wire all cross-agent reactions. Call once at startup.
 * This is where the "god level" coordination lives.
 */
export async function wireAgentCoordination(): Promise<void> {
  logger.info("Wiring agent coordination event handlers");

  // When a stream ends → immediately scan for new uploads + run consistency
  onAgentEvent("stream.ended", async (event) => {
    logger.info(`Stream ended for ${event.userId.slice(0, 8)} — triggering upload scan + consistency check`);

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
