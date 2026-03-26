import { db } from "../db";
import { webhookEvents, intelligentJobs } from "@shared/schema";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";
import { eq, and, lt, sql, count } from "drizzle-orm";

const logger = createLogger("webhook-pipeline");

type WebhookHandler = (payload: any, eventType: string) => Promise<void>;

interface ProviderHealthRecord {
  successes: number;
  failures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
  probeIntervalMs: number;
  failureThreshold: number;
  successRateThreshold: number;
  windowMs: number;
  recentResults: Array<{ success: boolean; timestamp: number }>;
}

const DEFAULT_PROVIDER_CONFIG = {
  failureThreshold: 5,
  successRateThreshold: 0.3,
  windowMs: 300_000,
  probeIntervalMs: 60_000,
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
      circuitOpen: false,
      circuitOpenedAt: null,
      probeIntervalMs: DEFAULT_PROVIDER_CONFIG.probeIntervalMs,
      failureThreshold: DEFAULT_PROVIDER_CONFIG.failureThreshold,
      successRateThreshold: DEFAULT_PROVIDER_CONFIG.successRateThreshold,
      windowMs: DEFAULT_PROVIDER_CONFIG.windowMs,
      recentResults: [],
    };
    providerHealth.set(source, health);
  }
  return health;
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

  if (health.circuitOpen) {
    const successRate = getSuccessRate(health);
    if (successRate >= 0.5) {
      health.circuitOpen = false;
      health.circuitOpenedAt = null;
      logger.info(`[WebhookPipeline] Circuit closed for provider: ${source} (success rate recovered to ${Math.round(successRate * 100)}%)`);
    }
  }
}

function recordProviderFailure(source: string): void {
  const health = getProviderHealth(source);
  health.failures++;
  health.lastFailure = Date.now();
  health.recentResults.push({ success: false, timestamp: Date.now() });
  pruneRecentResults(health);

  if (!health.circuitOpen) {
    const recentFailures = health.recentResults.filter(r => !r.success).length;
    const successRate = getSuccessRate(health);

    if (recentFailures >= health.failureThreshold && successRate < health.successRateThreshold) {
      health.circuitOpen = true;
      health.circuitOpenedAt = Date.now();
      logger.warn(`[WebhookPipeline] Circuit OPENED for provider: ${source} (${recentFailures} failures, ${Math.round(successRate * 100)}% success rate)`);
    }
  }
}

function isProviderCircuitOpen(source: string): boolean {
  const health = providerHealth.get(source);
  if (!health || !health.circuitOpen) return false;

  if (health.circuitOpenedAt && Date.now() - health.circuitOpenedAt > health.probeIntervalMs) {
    return false;
  }

  return true;
}

export function getWebhookProviderHealth(): Record<string, {
  successes: number;
  failures: number;
  successRate: number;
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
  lastSuccess: number | null;
  lastFailure: number | null;
  recentResultsCount: number;
}> {
  const result: Record<string, any> = {};
  for (const [source, health] of providerHealth) {
    pruneRecentResults(health);
    result[source] = {
      successes: health.successes,
      failures: health.failures,
      successRate: Math.round(getSuccessRate(health) * 100),
      circuitOpen: health.circuitOpen,
      circuitOpenedAt: health.circuitOpenedAt,
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
    payload: any,
    userId = "system"
  ): Promise<void> {
    if (isProviderCircuitOpen(source)) {
      logger.warn(`[WebhookPipeline] Circuit open for provider ${source} — rejecting event ${eventId}`);
      return;
    }

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
    } catch (err: any) {
      if (err.code !== "23505") throw err;
    }

    if (!inserted) {
      logger.info(`[WebhookPipeline] Duplicate event skipped: ${dedupeKey}`);
      return;
    }

    await jobQueue.enqueue({
      type: `webhook_${source}`,
      priority: 10,
      payload: { webhookEventId: inserted.id },
      dedupeKey: `job:${dedupeKey}`,
    });

    logger.info(`[WebhookPipeline] Ingested ${source} event ${eventId} (type: ${eventType})`);
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
      await handler(event.payload, event.eventType);
      recordProviderSuccess(source);
    } catch (err: any) {
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
    const pending = parseInt(result.rows[0]?.count || "0", 10);

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
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  async getStats(): Promise<{ pending: number; processed: number; sources: string[] }> {
    const [pendingRes, processedRes] = await Promise.all([
      db.execute(sql`SELECT count(*) as count FROM webhook_events WHERE processed = false`),
      db.execute(sql`SELECT count(*) as count FROM webhook_events WHERE processed = true`),
    ]);
    const sources = Array.from(this.handlers.keys());
    return {
      pending: parseInt(pendingRes.rows[0]?.count || "0", 10),
      processed: parseInt(processedRes.rows[0]?.count || "0", 10),
      sources,
    };
  }
}

export const webhookPipeline = new WebhookPipeline();
