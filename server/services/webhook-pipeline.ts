import { db } from "../db";
import { webhookEvents, intelligentJobs } from "@shared/schema";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";
import { eq, and, lt, sql, count } from "drizzle-orm";

const logger = createLogger("webhook-pipeline");

type WebhookHandler = (payload: Record<string, unknown>, eventType: string) => Promise<void>;

type CircuitState = "closed" | "open" | "half_open";

interface ProviderHealthRecord {
  successes: number;
  failures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  circuitState: CircuitState;
  circuitOpenedAt: number | null;
  lastProbeAt: number | null;
  probeIntervalMs: number;
  probeSuccessesNeeded: number;
  consecutiveProbeSuccesses: number;
  failureThreshold: number;
  successRateThreshold: number;
  windowMs: number;
  recentResults: Array<{ success: boolean; timestamp: number }>;
}

export interface ProviderCircuitConfig {
  failureThreshold?: number;
  successRateThreshold?: number;
  windowMs?: number;
  probeIntervalMs?: number;
  probeSuccessesNeeded?: number;
}

const DEFAULT_PROVIDER_CONFIG = {
  failureThreshold: 5,
  successRateThreshold: 0.3,
  windowMs: 300_000,
  probeIntervalMs: 60_000,
  probeSuccessesNeeded: 2,
  maxRecentResults: 50,
};

const providerHealth = new Map<string, ProviderHealthRecord>();

function getProviderHealth(source: string): ProviderHealthRecord {
  let health = providerHealth.get(source);
  if (!health) {
    health = {
      successes: 0,
      failures: 0,
      lastSuccess: null,
      lastFailure: null,
      circuitState: "closed",
      circuitOpenedAt: null,
      lastProbeAt: null,
      probeIntervalMs: DEFAULT_PROVIDER_CONFIG.probeIntervalMs,
      probeSuccessesNeeded: DEFAULT_PROVIDER_CONFIG.probeSuccessesNeeded,
      consecutiveProbeSuccesses: 0,
      failureThreshold: DEFAULT_PROVIDER_CONFIG.failureThreshold,
      successRateThreshold: DEFAULT_PROVIDER_CONFIG.successRateThreshold,
      windowMs: DEFAULT_PROVIDER_CONFIG.windowMs,
      recentResults: [],
    };
    providerHealth.set(source, health);
  }
  return health;
}

export function configureProviderCircuit(source: string, config: ProviderCircuitConfig): void {
  const health = getProviderHealth(source);
  if (config.failureThreshold !== undefined) health.failureThreshold = config.failureThreshold;
  if (config.successRateThreshold !== undefined) health.successRateThreshold = config.successRateThreshold;
  if (config.windowMs !== undefined) health.windowMs = config.windowMs;
  if (config.probeIntervalMs !== undefined) health.probeIntervalMs = config.probeIntervalMs;
  if (config.probeSuccessesNeeded !== undefined) health.probeSuccessesNeeded = config.probeSuccessesNeeded;
}

function pruneRecentResults(health: ProviderHealthRecord): void {
  const cutoff = Date.now() - health.windowMs;
  health.recentResults = health.recentResults.filter(r => r.timestamp > cutoff);
  if (health.recentResults.length > DEFAULT_PROVIDER_CONFIG.maxRecentResults) {
    health.recentResults = health.recentResults.slice(-DEFAULT_PROVIDER_CONFIG.maxRecentResults);
  }
}

function getSuccessRate(health: ProviderHealthRecord): number {
  pruneRecentResults(health);
  if (health.recentResults.length === 0) return 1.0;
  const successes = health.recentResults.filter(r => r.success).length;
  return successes / health.recentResults.length;
}

function recordProviderSuccess(source: string): void {
  const health = getProviderHealth(source);
  health.successes++;
  health.lastSuccess = Date.now();
  health.recentResults.push({ success: true, timestamp: Date.now() });
  pruneRecentResults(health);

  if (health.circuitState === "half_open") {
    health.consecutiveProbeSuccesses++;
    if (health.consecutiveProbeSuccesses >= health.probeSuccessesNeeded) {
      health.circuitState = "closed";
      health.circuitOpenedAt = null;
      health.lastProbeAt = null;
      health.consecutiveProbeSuccesses = 0;
      logger.info(`[WebhookPipeline] Circuit CLOSED for provider: ${source} (${health.probeSuccessesNeeded} consecutive probe successes)`);
      replayDeferredEvents(source).catch((err) => {
        logger.warn(`[WebhookPipeline] Failed to replay deferred events for ${source}: ${(err as Error)?.message}`);
      });
    }
  }
}

function recordProviderFailure(source: string): void {
  const health = getProviderHealth(source);
  health.failures++;
  health.lastFailure = Date.now();
  health.recentResults.push({ success: false, timestamp: Date.now() });
  pruneRecentResults(health);

  if (health.circuitState === "half_open") {
    health.circuitState = "open";
    health.circuitOpenedAt = Date.now();
    health.consecutiveProbeSuccesses = 0;
    logger.warn(`[WebhookPipeline] Circuit re-OPENED for provider: ${source} (probe failed)`);
    return;
  }

  if (health.circuitState === "closed") {
    const recentFailures = health.recentResults.filter(r => !r.success).length;
    const successRate = getSuccessRate(health);

    if (recentFailures >= health.failureThreshold && successRate < health.successRateThreshold) {
      health.circuitState = "open";
      health.circuitOpenedAt = Date.now();
      health.consecutiveProbeSuccesses = 0;
      logger.warn(`[WebhookPipeline] Circuit OPENED for provider: ${source} (${recentFailures} failures, ${Math.round(successRate * 100)}% success rate)`);
    }
  }
}

function shouldAllowProbe(source: string): boolean {
  const health = providerHealth.get(source);
  if (!health) return true;
  if (health.circuitState !== "open") return health.circuitState === "closed";

  const now = Date.now();
  const timeSinceOpen = health.circuitOpenedAt ? now - health.circuitOpenedAt : Infinity;
  const timeSinceProbe = health.lastProbeAt ? now - health.lastProbeAt : Infinity;

  if (timeSinceOpen >= health.probeIntervalMs && timeSinceProbe >= health.probeIntervalMs) {
    health.circuitState = "half_open";
    health.lastProbeAt = now;
    health.consecutiveProbeSuccesses = 0;
    logger.info(`[WebhookPipeline] Circuit HALF_OPEN for provider: ${source} — allowing probe`);
    return true;
  }

  return false;
}

function isProviderCircuitOpen(source: string): boolean {
  const health = providerHealth.get(source);
  if (!health) return false;
  if (health.circuitState === "closed") return false;
  return true;
}

export interface WebhookProviderHealthSummary {
  successes: number;
  failures: number;
  successRate: number;
  circuitState: CircuitState;
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
  lastProbeAt: number | null;
  consecutiveProbeSuccesses: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  recentResultsCount: number;
}

export function getWebhookProviderHealth(): Record<string, WebhookProviderHealthSummary> {
  const result: Record<string, WebhookProviderHealthSummary> = {};
  for (const [source, health] of providerHealth) {
    pruneRecentResults(health);
    result[source] = {
      successes: health.successes,
      failures: health.failures,
      successRate: Math.round(getSuccessRate(health) * 100),
      circuitState: health.circuitState,
      circuitOpen: health.circuitState !== "closed",
      circuitOpenedAt: health.circuitOpenedAt,
      lastProbeAt: health.lastProbeAt,
      consecutiveProbeSuccesses: health.consecutiveProbeSuccesses,
      lastSuccess: health.lastSuccess,
      lastFailure: health.lastFailure,
      recentResultsCount: health.recentResults.length,
    };
  }
  return result;
}

export function resetProviderHealth(source?: string): void {
  if (source) {
    providerHealth.delete(source);
  } else {
    providerHealth.clear();
  }
}

async function replayDeferredEvents(source: string): Promise<void> {
  const deferredEvents = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        sql`${webhookEvents.source} LIKE ${source + ':%'}`,
        eq(webhookEvents.processed, false),
      )
    )
    .limit(50);

  if (deferredEvents.length === 0) return;

  logger.info(`[WebhookPipeline] Replaying ${deferredEvents.length} deferred events for provider: ${source}`);

  for (const event of deferredEvents) {
    try {
      await jobQueue.enqueue({
        type: `webhook_${source}`,
        priority: 5,
        payload: { webhookEventId: event.id },
        dedupeKey: `job:replay:${event.source}`,
      });
    } catch (err) {
      logger.warn(`[WebhookPipeline] Failed to enqueue deferred event ${event.id}: ${(err as Error)?.message}`);
    }
  }
}

class WebhookPipeline {
  private handlers = new Map<string, WebhookHandler>();

  register(source: string, handler: WebhookHandler): void {
    this.handlers.set(source, handler);
    jobQueue.registerHandler(`webhook_${source}`, async (job) => {
      const { webhookEventId } = job.payload as { webhookEventId: number };
      await this.process(webhookEventId, source);
    });
    logger.info(`[WebhookPipeline] Registered handler for source: ${source}`);
  }

  async ingest(
    source: string,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    userId = "system"
  ): Promise<void> {
    const dedupeKey = `${source}:${eventId}`;

    let inserted: { id: number } | undefined;
    try {
      const rows = await db
        .insert(webhookEvents)
        .values({
          userId,
          source: dedupeKey,
          eventType,
          payload,
          processed: false,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      inserted = rows[0];
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code !== "23505") throw err;
    }

    if (!inserted) {
      logger.info(`[WebhookPipeline] Duplicate event skipped: ${dedupeKey}`);
      return;
    }

    const circuitBlocking = isProviderCircuitOpen(source);
    const probeAllowed = !circuitBlocking || shouldAllowProbe(source);

    if (circuitBlocking && !probeAllowed) {
      logger.warn(`[WebhookPipeline] Circuit open for provider ${source} — event ${eventId} persisted as deferred (id: ${inserted.id})`);
      return;
    }

    await jobQueue.enqueue({
      type: `webhook_${source}`,
      priority: probeAllowed && circuitBlocking ? 1 : 10,
      payload: { webhookEventId: inserted.id },
      dedupeKey: `job:${dedupeKey}`,
    });

    logger.info(`[WebhookPipeline] ${circuitBlocking ? "Probe" : "Ingested"} ${source} event ${eventId} (type: ${eventType})`);
  }

  private async process(webhookEventId: number, source: string): Promise<void> {
    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, webhookEventId));

    if (!event) {
      logger.warn(`[WebhookPipeline] Event not found: ${webhookEventId}`);
      return;
    }

    if (event.processed) {
      logger.info(`[WebhookPipeline] Event already processed: ${webhookEventId}`);
      return;
    }

    const handler = this.handlers.get(source);
    if (!handler) {
      logger.warn(`[WebhookPipeline] No handler registered for source: ${source}`);
      return;
    }

    try {
      await handler(event.payload as Record<string, unknown>, event.eventType);
      recordProviderSuccess(source);
    } catch (err: unknown) {
      recordProviderFailure(source);
      throw err;
    }

    await db
      .update(webhookEvents)
      .set({ processed: true })
      .where(eq(webhookEvents.id, webhookEventId));

    logger.info(`[WebhookPipeline] Processed event ${webhookEventId} (${event.eventType})`);
  }

  async drain(): Promise<number> {
    const result = await db.execute(sql`
      SELECT count(*) as count FROM webhook_events WHERE processed = false
    `);
    const pending = parseInt(String(result.rows[0]?.count || "0"), 10);

    if (pending === 0) return 0;

    logger.warn(`[WebhookPipeline] Draining ${pending} unprocessed webhook events`);

    const unprocessed = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.processed, false))
      .limit(100);

    for (const event of unprocessed) {
      const [source] = event.source.split(":");
      if (!source) continue;

      if (isProviderCircuitOpen(source)) {
        logger.info(`[WebhookPipeline] Skipping drain for ${source} — circuit open`);
        continue;
      }

      await jobQueue.enqueue({
        type: `webhook_${source}`,
        priority: 9,
        payload: { webhookEventId: event.id },
        dedupeKey: `drain:${event.source}`,
      }).catch(err =>
        logger.error(`[WebhookPipeline] Drain enqueue failed for event ${event.id}`, { error: err.message })
      );
    }

    return pending;
  }

  async getPendingCount(): Promise<number> {
    const result = await db.execute(sql`
      SELECT count(*) as count FROM webhook_events WHERE processed = false
    `);
    return parseInt(String(result.rows[0]?.count || "0"), 10);
  }

  async getStats(): Promise<{ pending: number; processed: number; sources: string[] }> {
    const [pendingRes, processedRes] = await Promise.all([
      db.execute(sql`SELECT count(*) as count FROM webhook_events WHERE processed = false`),
      db.execute(sql`SELECT count(*) as count FROM webhook_events WHERE processed = true`),
    ]);
    const sources = Array.from(this.handlers.keys());
    return {
      pending: parseInt(String(pendingRes.rows[0]?.count || "0"), 10),
      processed: parseInt(String(processedRes.rows[0]?.count || "0"), 10),
      sources,
    };
  }
}

export const webhookPipeline = new WebhookPipeline();
