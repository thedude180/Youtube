import { intelligentJobs, type IntelligentJob } from "@shared/schema";
import { db } from "../db";
import { sql, eq, and, lt, desc, asc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("job-queue");

const CONCURRENCY = new Map<string, number>([
  ['ai_generation', 3],
  ['youtube_api', 2],
  ['thumbnail_gen', 1],
  ['db_heavy', 4],
  ['webhook_stripe', 5],
  ['webhook_youtube', 5],
  ['default', 2],
]);

class IntelligentJobQueue {
  private handlers = new Map<string, (job: IntelligentJob) => Promise<any>>();

  registerHandler(type: string, fn: (job: IntelligentJob) => Promise<any>): void {
    this.handlers.set(type, fn);
    logger.info(`[JobQueue] Registered handler for ${type}`);
  }

  async enqueue(opts: {
    type: string;
    userId?: string;
    priority?: number;
    payload: any;
    dedupeKey?: string;
    scheduledFor?: Date;
  }): Promise<number | null> {
    try {
      if (opts.dedupeKey) {
        const existing = await db.query.intelligentJobs.findFirst({
          where: and(
            eq(intelligentJobs.dedupeKey, opts.dedupeKey),
            sql`${intelligentJobs.status} IN ('queued', 'processing')`
          ),
        });
        if (existing) {
          logger.info(`[JobQueue] Job with dedupeKey ${opts.dedupeKey} already exists, skipping`);
          return null;
        }
      }

      let scheduledFor = opts.scheduledFor || new Date();

      if (opts.userId) {
        const result = await db.execute(sql`
          SELECT count(*) as count FROM intelligent_jobs 
          WHERE user_id = ${opts.userId} AND status IN ('queued', 'processing')
        `);
        const activeCount = parseInt(result.rows[0]?.count || "0", 10);
        if (activeCount > 10) {
          scheduledFor = new Date(Date.now() + 60_000);
          logger.info(`[JobQueue] User ${opts.userId} has >10 active jobs, delaying job ${opts.type}`);
        }
      }

      const [inserted] = await db.insert(intelligentJobs).values({
        type: opts.type,
        userId: opts.userId,
        priority: opts.priority ?? 5,
        payload: opts.payload,
        dedupeKey: opts.dedupeKey,
        scheduledFor: scheduledFor,
        status: "queued",
      }).returning({ id: intelligentJobs.id });

      logger.info(`[JobQueue] Enqueued job ${opts.type} (id: ${inserted.id})`);
      
      // Fire and forget
      this.processNext(opts.type).catch((err) => {
        logger.error(`[JobQueue] Error in fire-and-forget processNext: ${err.message}`);
      });

      return inserted.id;
    } catch (err: any) {
      logger.error(`[JobQueue] Failed to enqueue job: ${err.message}`);
      throw err;
    }
  }

  async processNext(type: string): Promise<void> {
    const limit = CONCURRENCY.get(type) || CONCURRENCY.get('default') || 2;
    const activeCount = await this.countActive(type);

    if (activeCount >= limit) {
      return;
    }

    try {
      const result = await db.execute(sql`
        UPDATE intelligent_jobs
        SET status = 'processing', started_at = NOW()
        WHERE id = (
          SELECT id FROM intelligent_jobs
          WHERE status = 'queued' AND type = ${type} AND scheduled_for <= NOW()
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      const job = result.rows[0] as IntelligentJob | undefined;
      if (!job) return;

      logger.info(`[JobQueue] Processing job ${job.id} (type: ${job.type})`);

      const handler = this.handlers.get(job.type);
      if (!handler) {
        await db.update(intelligentJobs)
          .set({ 
            status: 'failed', 
            errorMessage: 'no handler registered',
            completedAt: new Date()
          })
          .where(eq(intelligentJobs.id, job.id));
        logger.error(`[JobQueue] No handler registered for job type: ${job.type}`);
        return;
      }

      try {
        const resultPayload = await handler(job);
        await db.update(intelligentJobs)
          .set({ 
            status: 'done', 
            completedAt: new Date(), 
            result: resultPayload 
          })
          .where(eq(intelligentJobs.id, job.id));
        logger.info(`[JobQueue] Job ${job.id} completed successfully`);
      } catch (err: any) {
        logger.error(`[JobQueue] Job ${job.id} failed: ${err.message}`);
        
        if (job.retryCount < job.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, job.retryCount), 300_000); // max 5 min
          await db.update(intelligentJobs)
            .set({ 
              status: 'queued', 
              retryCount: job.retryCount + 1, 
              scheduledFor: new Date(Date.now() + backoff),
              errorMessage: err.message
            })
            .where(eq(intelligentJobs.id, job.id));
          logger.info(`[JobQueue] Job ${job.id} scheduled for retry in ${backoff}ms`);
        } else {
          await db.update(intelligentJobs)
            .set({ 
              status: 'failed', 
              errorMessage: err.message,
              completedAt: new Date()
            })
            .where(eq(intelligentJobs.id, job.id));
          logger.error(`[JobQueue] Job ${job.id} exceeded max retries and failed`);
        }
      } finally {
        // Try to process the next one if capacity available
        this.processNext(type).catch(() => {});
      }
    } catch (err: any) {
      logger.error(`[JobQueue] Fatal error in processNext for ${type}: ${err.message}`);
    }
  }

  async countActive(type: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT count(*) as count FROM intelligent_jobs 
      WHERE type = ${type} AND status = 'processing'
    `);
    return parseInt(result.rows[0]?.count || "0", 10);
  }

  async clearStuck(olderThanMinutes = 15): Promise<number> {
    const olderThan = new Date(Date.now() - olderThanMinutes * 60_000);
    
    // Find stuck jobs
    const stuckJobs = await db.query.intelligentJobs.findMany({
      where: and(
        eq(intelligentJobs.status, 'processing'),
        lt(intelligentJobs.startedAt, olderThan)
      )
    });

    if (stuckJobs.length === 0) return 0;

    logger.warn(`[JobQueue] Found ${stuckJobs.length} stuck jobs, clearing them...`);

    let cleared = 0;
    for (const job of stuckJobs) {
      if (job.retryCount < job.maxRetries) {
        await db.update(intelligentJobs)
          .set({ 
            status: 'queued', 
            retryCount: job.retryCount + 1,
            scheduledFor: new Date(),
            errorMessage: 'Job cleared after becoming stuck'
          })
          .where(eq(intelligentJobs.id, job.id));
      } else {
        await db.update(intelligentJobs)
          .set({ 
            status: 'failed', 
            errorMessage: 'Job failed after becoming stuck multiple times',
            completedAt: new Date()
          })
          .where(eq(intelligentJobs.id, job.id));
      }
      cleared++;
    }

    return cleared;
  }

  async getStats(): Promise<{ queued: number; processing: number; done: number; failed: number }> {
    const result = await db.execute(sql`
      SELECT status, count(*) as count 
      FROM intelligent_jobs 
      GROUP BY status
    `);
    
    const stats = { queued: 0, processing: 0, done: 0, failed: 0 };
    result.rows.forEach((row: any) => {
      if (row.status in stats) {
        (stats as any)[row.status] = parseInt(row.count, 10);
      }
    });
    return stats;
  }
}

export const jobQueue = new IntelligentJobQueue();

// Stuck job cleanup every 5 minutes
setInterval(() => {
  jobQueue.clearStuck(15).catch((err) => {
    logger.error(`[JobQueue] Error in periodic clearStuck: ${err.message}`);
  });
}, 5 * 60_000);
