/**
 * Morgan Wells — Autonomous Operations Director
 *
 * The guardian of the system. Runs every 30 minutes to:
 * 1. DETECT GAPS — scan every agent's last activity and kickstart any that have gone quiet
 * 2. HEAL THE QUEUE — repair failed or stuck autopilotQueue items automatically
 * 3. REFILL INVENTORY — if the content pipeline runs low, trigger content agents to produce more
 * 4. REPORT HEALTH — every 6 hours, generate a full system health report
 *
 * No human touch required. The machine watches itself.
 */
import { db } from "../db";
import { aiAgentActivities, autopilotQueue, channels } from "@shared/schema";
import { eq, and, lt, gt, count, or, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import { enqueueAgentTask } from "../ai-team-engine";
import { createLogger } from "../lib/logger";

const logger = createLogger("continuity-engine");

// --------------------------------------------------------------------------
// AGENT GAP REGISTRY
// Defines the maximum idle period for each agent before the Continuity
// Engine considers them "gapped" and fires a kickstart task.
// --------------------------------------------------------------------------
const AGENT_GAP_REGISTRY = [
  {
    agentId: "ai-social-media-manager",
    maxIdleHours: 8,
    taskType: "social_media_management",
    title: "Auto-generate and distribute social posts across all platforms",
    priority: 6,
  },
  {
    agentId: "ai-seo-manager",
    maxIdleHours: 26,
    taskType: "full_seo_package",
    title: "Run a full SEO audit, update tags, thumbnails, and titles",
    priority: 5,
  },
  {
    agentId: "ai-shorts-specialist",
    maxIdleHours: 14,
    taskType: "full_shorts_strategy",
    title: "Identify new YouTube Shorts opportunities and queue production",
    priority: 6,
  },
  {
    agentId: "ai-scriptwriter",
    maxIdleHours: 24,
    taskType: "full_script_writing",
    title: "Write a new video script based on the latest research",
    priority: 5,
  },
  {
    agentId: "ai-research-lead",
    maxIdleHours: 20,
    taskType: "content_brief",
    title: "Research trending topics and produce the next content brief",
    priority: 6,
  },
  {
    agentId: "ai-thumbnail-artist",
    maxIdleHours: 20,
    taskType: "thumbnail_concept",
    title: "Design thumbnail concepts for the next scheduled video",
    priority: 5,
  },
  {
    agentId: "ai-analyst",
    maxIdleHours: 28,
    taskType: "performance_analysis",
    title: "Run a deep performance analysis and surface growth opportunities",
    priority: 4,
  },
  {
    agentId: "ai-moderator",
    maxIdleHours: 10,
    taskType: "community_management",
    title: "Review community engagement and respond to high-priority comments",
    priority: 6,
  },
  {
    agentId: "ai-premium",
    maxIdleHours: 48,
    taskType: "revenue_optimization",
    title: "Review all revenue streams and propose new monetization opportunities",
    priority: 4,
  },
  {
    agentId: "ai-brand-manager",
    maxIdleHours: 72,
    taskType: "brand_partnership_outreach",
    title: "Review sponsorship pipeline and reach out to new brand prospects",
    priority: 4,
  },
  {
    agentId: "ai-catalog-director",
    maxIdleHours: 5,
    taskType: "catalog_mining",
    title: "Mine the YouTube catalog for new repurposing opportunities",
    priority: 7,
  },
] as const;

// Minimum number of pending items in the autopilotQueue before a refill is triggered
const INVENTORY_THRESHOLD = 6;
// Minimum hours between full health reports
const HEALTH_REPORT_INTERVAL_HOURS = 6;
// Minimum hours between queue doctor runs
const QUEUE_DOCTOR_INTERVAL_MINUTES = 30;
// How long a "pending" item can sit before it's considered stuck
const STUCK_PENDING_HOURS = 2;

let continuityInterval: ReturnType<typeof setInterval> | null = null;
let lastHealthReportAt = 0;
let totalGapsFilled = 0;
let totalItemsRepaired = 0;
let isInitialized = false;

// --------------------------------------------------------------------------
// 1. QUEUE DOCTOR
// Finds failed or stuck pending items and resets them for retry.
// --------------------------------------------------------------------------
async function runQueueDoctor(userId: string): Promise<number> {
  const stuckCutoff = new Date(Date.now() - STUCK_PENDING_HOURS * 60 * 60 * 1000);
  const repairedIds: number[] = [];

  try {
    // Repair failed items
    const failedItems = await db
      .select({ id: autopilotQueue.id, type: autopilotQueue.type })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "failed")
        )
      )
      .limit(15);

    for (const item of failedItems) {
      await db
        .update(autopilotQueue)
        .set({ status: "pending", scheduledAt: new Date() })
        .where(eq(autopilotQueue.id, item.id));
      repairedIds.push(item.id);
    }

    // Repair stuck pending items (pending for longer than STUCK_PENDING_HOURS)
    const stuckItems = await db
      .select({ id: autopilotQueue.id })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "pending"),
          lt(autopilotQueue.scheduledAt, stuckCutoff)
        )
      )
      .limit(10);

    for (const item of stuckItems) {
      await db
        .update(autopilotQueue)
        .set({ scheduledAt: new Date() })
        .where(eq(autopilotQueue.id, item.id));
      repairedIds.push(item.id);
    }

    if (repairedIds.length > 0) {
      totalItemsRepaired += repairedIds.length;
      logger.info(`[${userId}] Queue Doctor: repaired ${repairedIds.length} items`);
    }

    return repairedIds.length;
  } catch (err: any) {
    logger.error(`[${userId}] Queue Doctor failed: ${err.message}`);
    return 0;
  }
}

// --------------------------------------------------------------------------
// 2. ACTIVITY GAP SCANNER
// Checks each registered agent's last activity time and kickstarts idle agents.
// --------------------------------------------------------------------------
async function runGapScanner(userId: string): Promise<string[]> {
  const kickstarted: string[] = [];

  for (const agent of AGENT_GAP_REGISTRY) {
    try {
      const activities = await storage.getAgentActivities(userId, agent.agentId, 1);
      const lastActivity = activities[0];

      const idleThreshold = new Date(Date.now() - agent.maxIdleHours * 60 * 60 * 1000);
      const isGapped = !lastActivity || new Date(lastActivity.createdAt!) < idleThreshold;

      if (isGapped) {
        const idleHours = lastActivity
          ? Math.round((Date.now() - new Date(lastActivity.createdAt!).getTime()) / 3_600_000)
          : 999;

        logger.info(`[${userId}] Gap detected: ${agent.agentId} idle for ${idleHours}h — kickstarting`);

        await enqueueAgentTask(
          userId,
          agent.agentId,
          agent.taskType as string,
          agent.title,
          { triggeredBy: "continuity-engine", idleHours },
          agent.priority
        );

        kickstarted.push(agent.agentId);
        totalGapsFilled++;

        // Small delay to avoid hammering the queue
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (err: any) {
      logger.warn(`[${userId}] Gap scan failed for ${agent.agentId}: ${err.message}`);
    }
  }

  return kickstarted;
}

// --------------------------------------------------------------------------
// 3. CONTENT INVENTORY GUARDIAN
// Counts pending items in the pipeline. If below threshold, triggers content agents.
// --------------------------------------------------------------------------
async function runInventoryGuardian(userId: string): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "pending")
        )
      );

    const pendingCount = Number(result?.count || 0);

    if (pendingCount < INVENTORY_THRESHOLD) {
      logger.info(`[${userId}] Inventory low (${pendingCount} items) — triggering content refill`);

      await enqueueAgentTask(
        userId,
        "ai-social-media-manager",
        "distribution_plan",
        `Emergency content refill — pipeline has only ${pendingCount} items queued`,
        { triggeredBy: "continuity-engine", reason: "inventory_low", pendingCount },
        8
      );

      await enqueueAgentTask(
        userId,
        "ai-shorts-specialist",
        "full_shorts_strategy",
        "Immediate Shorts production batch — pipeline inventory is low",
        { triggeredBy: "continuity-engine", reason: "inventory_low" },
        8
      );

      return true;
    }

    return false;
  } catch (err: any) {
    logger.warn(`[${userId}] Inventory check failed: ${err.message}`);
    return false;
  }
}

// --------------------------------------------------------------------------
// 4. HEALTH REPORTER
// Every 6 hours, writes a system health summary to agent activities.
// --------------------------------------------------------------------------
async function runHealthReport(userId: string): Promise<void> {
  if (Date.now() - lastHealthReportAt < HEALTH_REPORT_INTERVAL_HOURS * 3_600_000) return;

  try {
    const [queueResult] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "pending")));

    const [publishedResult] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "published")));

    const [failedResult] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed")));

    const pendingCount = Number(queueResult?.count || 0);
    const publishedCount = Number(publishedResult?.count || 0);
    const failedCount = Number(failedResult?.count || 0);

    const healthScore = Math.max(0, 100 - failedCount * 5 - Math.max(0, INVENTORY_THRESHOLD - pendingCount) * 8);

    const report = {
      systemHealthScore: healthScore,
      pendingQueueItems: pendingCount,
      publishedTotal: publishedCount,
      failedItems: failedCount,
      gapsFilledLifetime: totalGapsFilled,
      itemsRepairedLifetime: totalItemsRepaired,
      status: healthScore >= 80 ? "healthy" : healthScore >= 50 ? "degraded" : "critical",
    };

    await storage.createAgentActivity({
      userId,
      agentId: "ai-continuity",
      action: "system_health_report",
      target: "Full pipeline",
      status: "completed",
      details: {
        description: `System health: ${report.status.toUpperCase()} (score: ${healthScore}/100). Pipeline: ${pendingCount} queued, ${publishedCount} published, ${failedCount} failed. Gaps filled: ${totalGapsFilled}. Items repaired: ${totalItemsRepaired}.`,
        impact: "Continuous autonomous operation maintained",
        metrics: report as unknown as Record<string, number>,
      },
    });

    lastHealthReportAt = Date.now();
    logger.info(`[${userId}] Health report: ${report.status} (${healthScore}/100)`);
  } catch (err: any) {
    logger.warn(`[${userId}] Health report failed: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// 5. TOKEN KEEPALIVE
// Proactively refreshes all platform tokens before they expire.
// Retries channels previously marked expired — the refresh token may still work.
// --------------------------------------------------------------------------
async function runTokenKeepalive(): Promise<{ kept: number; failed: number; retried: number }> {
  try {
    const { keepAliveAllTokens } = await import("../token-refresh");
    const result = await keepAliveAllTokens();

    if (result.kept > 0 || result.failed > 0) {
      logger.info(`Token keepalive: ${result.kept} refreshed, ${result.failed} failed`);
    }

    return { kept: result.kept, failed: result.failed, retried: 0 };
  } catch (err: any) {
    logger.warn(`Token keepalive error: ${err.message}`);
    return { kept: 0, failed: 0, retried: 0 };
  }
}

// --------------------------------------------------------------------------
// MAIN CYCLE — runs every 30 minutes per user
// --------------------------------------------------------------------------
async function runContinuityCycle(): Promise<void> {
  try {
    const users = await db
      .selectDistinct({ userId: aiAgentActivities.userId })
      .from(aiAgentActivities)
      .where(
        and(
          gt(aiAgentActivities.createdAt!, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
          eq(aiAgentActivities.status, "completed")
        )
      )
      .limit(50);

    const activeUserIds = users
      .map(u => u.userId)
      .filter((id): id is string => id !== null && id !== undefined);

    if (activeUserIds.length === 0) {
      logger.info("No active users found — continuity engine standing by");
      return;
    }

    // Run token keepalive globally (not per-user, since keepAliveAllTokens handles all users)
    await runTokenKeepalive().catch(err =>
      logger.warn(`Token keepalive failed: ${err.message}`)
    );

    for (const userId of activeUserIds) {
      try {
        // Run Queue Doctor every cycle
        const repaired = await runQueueDoctor(userId);

        // Run Gap Scanner every cycle
        const kickstarted = await runGapScanner(userId);

        // Run Inventory Guardian every cycle
        const refilled = await runInventoryGuardian(userId);

        // Run Health Report only every 6 hours
        await runHealthReport(userId);

        if (repaired > 0 || kickstarted.length > 0 || refilled) {
          await storage.createAgentActivity({
            userId,
            agentId: "ai-continuity",
            action: "continuity_cycle",
            target: "System pipeline",
            status: "completed",
            details: {
              description: `Morgan ran a continuity sweep: ${kickstarted.length} agents kickstarted, ${repaired} queue items repaired${refilled ? ", content inventory refilled" : ""}`,
              impact: "Zero-touch autonomous operation maintained",
              metrics: {
                agentsKickstarted: kickstarted.length,
                queueItemsRepaired: repaired,
                inventoryRefilled: refilled ? 1 : 0,
                totalGapsFilledLifetime: totalGapsFilled,
              },
            },
          });
        }

      } catch (err: any) {
        logger.error(`[${userId}] Continuity cycle error: ${err.message}`);
      }
    }
  } catch (err: any) {
    logger.error(`Continuity cycle top-level error: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// PUBLIC API
// --------------------------------------------------------------------------
export function initContinuityEngine(): void {
  if (isInitialized) {
    logger.info("Continuity Engine already initialized");
    return;
  }
  isInitialized = true;

  const CYCLE_INTERVAL_MS = QUEUE_DOCTOR_INTERVAL_MINUTES * 60 * 1000;

  // Run immediately on boot (with a short delay so other agents initialize first)
  setTimeout(() => {
    runContinuityCycle().catch(err =>
      logger.error(`Initial continuity cycle failed: ${err.message}`)
    );
  }, 10_000);

  continuityInterval = setInterval(() => {
    runContinuityCycle().catch(err =>
      logger.error(`Continuity cycle failed: ${err.message}`)
    );
  }, CYCLE_INTERVAL_MS);

  logger.info(`Continuity Engine (Morgan Wells) initialized — scanning every ${QUEUE_DOCTOR_INTERVAL_MINUTES} minutes`);
}

export function stopContinuityEngine(): void {
  if (continuityInterval) {
    clearInterval(continuityInterval);
    continuityInterval = null;
  }
  isInitialized = false;
  logger.info("Continuity Engine stopped");
}
