import { healthBrain } from "./health-brain";
import { jobQueue } from "./intelligent-job-queue";
import { adaptiveThrottle } from "./adaptive-throttle";
import { getMemoryStats } from "./memory-guardian";
import { anomalyResponder } from "./anomaly-responder";
import { webhookPipeline } from "./webhook-pipeline";
import { db } from "../db";
import { intelligentJobs, channels, securityEvents } from "@shared/schema";
import { routeNotification } from "./notification-system";
import { createLogger } from "../lib/logger";
import { sql, lt, count, and, eq, gte } from "drizzle-orm";

const logger = createLogger("self-healing-agent");

export class SelfHealingAgent {
  async collectSignals() {
    try {
      // 1. Stuck Job Count
      const stuckJobsResult = await db.execute(sql`
        SELECT count(*) as count FROM intelligent_jobs 
        WHERE status = 'processing' AND started_at < NOW() - INTERVAL '15 minutes'
      `);
      const stuckJobCount = parseInt(stuckJobsResult.rows[0]?.count || "0", 10);

      // 2. Expired Token Count
      const expiredTokensResult = await db.execute(sql`
        SELECT count(*) as count FROM channels 
        WHERE token_expires_at < NOW() + INTERVAL '30 minutes'
      `);
      const expiredTokenCount = parseInt(expiredTokensResult.rows[0]?.count || "0", 10);

      // 3. Quota Status
      const quotaStatus = adaptiveThrottle.getStatus();
      const quotaExhausted = Object.entries(quotaStatus).filter(
        ([_, status]: [string, any]) => status.percentUsed > 95
      );

      // 4. Failed Webhook Count (last 1h)
      const failedWebhooksResult = await db.execute(sql`
        SELECT count(*) as count FROM security_events 
        WHERE event_type LIKE 'webhook_%' AND severity = 'error' AND created_at > NOW() - INTERVAL '1 hour'
      `);
      const failedWebhookCount = parseInt(failedWebhooksResult.rows[0]?.count || "0", 10);

      // 5. Error Spikes (last 5 min vs last 60 min baseline)
      const recentErrorsResult = await db.execute(sql`
        SELECT count(*) as count FROM security_events 
        WHERE severity = 'error' AND created_at > NOW() - INTERVAL '5 minutes'
      `);
      const recentErrorCount = parseInt(recentErrorsResult.rows[0]?.count || "0", 10);

      const baselineErrorsResult = await db.execute(sql`
        SELECT count(*) as count FROM security_events 
        WHERE severity = 'error' AND created_at > NOW() - INTERVAL '1 hour'
      `);
      const baselineTotal = parseInt(baselineErrorsResult.rows[0]?.count || "0", 10);
      const baselineErrorCount = baselineTotal / 12; // average per 5 min

      const thresholds = (await import("./anomaly-responder")).getAnomalyThresholds();
      const errorSpike = recentErrorCount > baselineErrorCount * thresholds.errorSpikeMultiplier && recentErrorCount > thresholds.minErrorsForSpike;

      // 6. Memory Stats
      const memStats = getMemoryStats();
      const memSlopeRaw = typeof memStats.slope === 'string' ? parseInt(memStats.slope) : memStats.slope;
      const memLeaking = memSlopeRaw > 5; // 5MB/tick as defined in memory-guardian

      return {
        stuckJobCount,
        expiredTokenCount,
        quotaStatus,
        quotaExhausted,
        failedWebhookCount,
        recentErrorCount,
        baselineErrorCount,
        errorSpike,
        memStats,
        memLeaking
      };
    } catch (err: any) {
      logger.error(`[SelfHealingAgent] Failed to collect signals: ${err.message}`);
      return null;
    }
  }

  async diagnoseAndHeal() {
    const signals = await this.collectSignals();
    if (!signals) return;

    logger.info("[SelfHealingAgent] Diagnostic cycle started", { 
      stuckJobs: signals.stuckJobCount,
      spike: signals.errorSpike,
      memLeak: signals.memLeaking
    });

    const feedHealth = async (issue: string, severity: "critical" | "high" | "medium" | "low", details?: Record<string, unknown>) => {
      try {
        const { feedSystemHealthToExceptionDesk } = await import("./exception-desk");
        await feedSystemHealthToExceptionDesk({ source: "self_healing_agent", issue, severity, details });
      } catch {}
    };

    if (signals.stuckJobCount > 0) {
      logger.warn(`[SelfHealingAgent] Found ${signals.stuckJobCount} stuck jobs, triggering cleanup`);
      await jobQueue.clearStuck(15);
      await feedHealth(`${signals.stuckJobCount} stuck jobs detected and cleaned`, "medium", { stuckJobCount: signals.stuckJobCount });
    }

    if (signals.expiredTokenCount > 10) {
      logger.warn(`[SelfHealingAgent] ${signals.expiredTokenCount} tokens expiring soon — queuing refresh jobs`);
      await this.refreshExpiredTokens(signals.expiredTokenCount);
      await feedHealth(`${signals.expiredTokenCount} tokens expiring soon`, "high", { expiredTokenCount: signals.expiredTokenCount });
    }

    if (signals.quotaExhausted.length > 0) {
      const services = signals.quotaExhausted.map(([s]) => s).join(", ");
      logger.error(`[SelfHealingAgent] CRITICAL: Quota exhausted for services: ${services}`);
      await feedHealth(`Quota exhausted for: ${services}`, "critical", { services: signals.quotaExhausted.map(([s]) => s) });
      
      const adminUsers = await db.execute(sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
      if (adminUsers.rows.length > 0) {
        await routeNotification(adminUsers.rows[0].id as string, {
          title: "Critical Quota Exhaustion",
          message: `API Quota for ${services} is above 95%. Actions are being throttled.`,
          severity: "critical",
          category: "system"
        });
      }
    }

    if (signals.failedWebhookCount > 10) {
      logger.warn(`[SelfHealingAgent] High webhook failure rate: ${signals.failedWebhookCount} — draining backlog`);
      await this.drainWebhookBacklog();
      await feedHealth(`High webhook failure rate: ${signals.failedWebhookCount}`, "high", { failedWebhookCount: signals.failedWebhookCount });
    }

    if (signals.errorSpike) {
      logger.error(`[SelfHealingAgent] Error spike detected! Rate: ${signals.recentErrorCount}/5min (Baseline: ${signals.baselineErrorCount.toFixed(1)})`);
      await anomalyResponder.respond({
        type: "error_spike",
        description: `Error rate surged to ${signals.recentErrorCount} in 5 minutes.`,
        data: { recentErrorCount: signals.recentErrorCount, baseline: signals.baselineErrorCount }
      });
    }

    if (signals.memLeaking) {
      logger.warn(`[SelfHealingAgent] Memory leak detected by MemoryGuardian: ${signals.memStats.slope}`);
      await feedHealth(`Memory leak detected: slope ${signals.memStats.slope}`, "high", { memStats: signals.memStats as unknown as Record<string, unknown> });
    }
  }

  private async refreshExpiredTokens(count: number): Promise<void> {
    try {
      const expiredChannels = await db.execute(sql`
        SELECT id, user_id FROM channels
        WHERE token_expires_at < NOW() + INTERVAL '30 minutes'
        AND refresh_token IS NOT NULL
        LIMIT 50
      `);
      for (const row of expiredChannels.rows) {
        await jobQueue.enqueue({
          type: "token_refresh",
          userId: row.user_id as string,
          priority: 8,
          payload: { channelId: row.id },
          dedupeKey: `token_refresh:${row.id}:${Date.now()}`,
        }).catch(() => {});
      }
      logger.info(`[SelfHealingAgent] Queued token refresh for ${expiredChannels.rows.length} channels`);
    } catch (err: any) {
      logger.error(`[SelfHealingAgent] refreshExpiredTokens failed: ${err.message}`);
    }
  }

  private async drainWebhookBacklog(): Promise<void> {
    try {
      const drained = await webhookPipeline.drain();
      logger.info(`[SelfHealingAgent] Drained ${drained} unprocessed webhooks back into job queue`);
    } catch (err: any) {
      logger.error(`[SelfHealingAgent] drainWebhookBacklog failed: ${err.message}`);
    }
  }
}

export const selfHealingAgent = new SelfHealingAgent();

// 5-minute diagnostic interval
setInterval(() => {
  selfHealingAgent.diagnoseAndHeal().catch((err) => {
    logger.error(`[SelfHealingAgent] Error in diagnostic loop: ${err.message}`);
  });
}, 5 * 60_000);
