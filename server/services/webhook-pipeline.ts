import { db } from "../db";
import { webhookEvents, intelligentJobs } from "@shared/schema";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";
import { eq, and, lt, sql, count } from "drizzle-orm";

const logger = createLogger("webhook-pipeline");

type WebhookHandler = (payload: any, eventType: string) => Promise<void>;

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

    await handler(event.payload, event.eventType);

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
      const eventId = event.source.slice(source.length + 1);

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
