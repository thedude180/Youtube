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

// Track when we last performed a live YouTube token health probe (every 6 hours).
// This probes the real Google API — not just "token not expired on paper" — so we
// catch revoked/rotated refresh tokens before they silently kill the system.
let lastTokenHealthProbeAt = 0;
const TOKEN_HEALTH_PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
// Minimum hours between queue doctor runs
const QUEUE_DOCTOR_INTERVAL_MINUTES = 30;
// How long a "pending" item can sit before it's considered stuck
const STUCK_PENDING_HOURS = 2;

let continuityInterval: ReturnType<typeof setInterval> | null = null;
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
// 4. HEALTH SNAPSHOT
// Returns health data to be folded into the single continuity_cycle log entry.
// --------------------------------------------------------------------------
async function getHealthSnapshot(userId: string): Promise<{ score: number; status: string } | null> {
  try {
    const [queueResult] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "pending")));

    const [failedResult] = await db
      .select({ count: count() })
      .from(autopilotQueue)
      .where(and(eq(autopilotQueue.userId, userId), eq(autopilotQueue.status, "failed")));

    const pendingCount = Number(queueResult?.count || 0);
    const failedCount = Number(failedResult?.count || 0);

    const score = Math.max(0, 100 - failedCount * 5 - Math.max(0, INVENTORY_THRESHOLD - pendingCount) * 8);
    const status = score >= 80 ? "healthy" : score >= 50 ? "degraded" : "critical";

    return { score, status };
  } catch (err: any) {
    logger.warn(`[${userId}] Health snapshot failed: ${err.message}`);
    return null;
  }
}

// --------------------------------------------------------------------------
// 5. TOKEN KEEPALIVE
// Proactively refreshes all platform tokens before they expire.
// Retries channels previously marked expired — the refresh token may still work.
// --------------------------------------------------------------------------

/**
 * Every 6 hours: make a live YouTube API probe (channels.list with part=id)
 * against every YouTube channel that has an accessToken.  This catches:
 *   - Revoked refresh tokens (user removes app access in Google account)
 *   - Token rotation drift (vault refreshed accessToken but lost refreshToken)
 *   - Any other reason Google silently invalidated the credentials
 *
 * If we get 401 we immediately call markChannelExpired which fires the
 * reconnect banner — BEFORE the next scheduled video upload would fail.
 */
async function runYouTubeTokenHealthProbe(): Promise<void> {
  const now = Date.now();
  if (now - lastTokenHealthProbeAt < TOKEN_HEALTH_PROBE_INTERVAL_MS) return;
  lastTokenHealthProbeAt = now;

  try {
    const { isNotNull: isNotNullFn } = await import("drizzle-orm");
    const ytChannels = await db.select().from(channels).where(
      and(
        eq(channels.platform, "youtube"),
        isNotNullFn(channels.accessToken),
      )
    );

    for (const ch of ytChannels) {
      if (!ch.accessToken || !ch.userId) continue;
      try {
        const probeRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true`,
          { headers: { Authorization: `Bearer ${ch.accessToken}`, Accept: "application/json" } }
        );

        if (probeRes.status === 401) {
          // Access token is definitely invalid — try refresh before giving up
          logger.warn(`[TokenProbe] 401 from YouTube for channel ${ch.id} (${ch.channelName}) — attempting recovery`);
          const { refreshGoogleToken } = await import("../token-refresh");
          if (ch.refreshToken) {
            const refreshed = await refreshGoogleToken(ch.refreshToken);
            if (refreshed.success && refreshed.accessToken) {
              const newRefresh = refreshed.refreshToken || ch.refreshToken;
              await db.update(channels).set({
                accessToken: refreshed.accessToken,
                refreshToken: newRefresh,
                tokenExpiresAt: refreshed.expiresAt ?? new Date(Date.now() + 3600 * 1000),
              }).where(eq(channels.id, ch.id));
              // Sync to users-table backup
              try {
                const { users: usersTable } = await import("../../shared/models/auth");
                await db.update(usersTable).set({
                  googleAccessToken: refreshed.accessToken,
                  googleRefreshToken: newRefresh,
                  googleTokenExpiresAt: refreshed.expiresAt ?? null,
                }).where(eq(usersTable.id, ch.userId));
              } catch { /* non-fatal */ }
              logger.info(`[TokenProbe] ✓ Proactively refreshed token for channel ${ch.id} after 401`);
              continue; // Channel is recovered — no banner needed
            }
          }
          // Refresh also failed — fire the banner NOW before anything else breaks
          const { markChannelExpiredPublic } = await import("../token-refresh");
          await markChannelExpiredPublic(ch.id, ch.userId, ch.platformData);
          logger.error(`[TokenProbe] ✗ Channel ${ch.id} (${ch.channelName}) is dead — user notified`);
        } else if (probeRes.ok) {
          logger.info(`[TokenProbe] ✓ YouTube token healthy for channel ${ch.id}`);
        }
        // 403 = quota/scope issue (not auth failure) — don't fire banner
      } catch (chErr: any) {
        logger.warn(`[TokenProbe] Probe failed for channel ${ch.id}: ${chErr.message}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[TokenProbe] YouTube token health probe error: ${err.message}`);
  }
}

async function runTokenKeepalive(): Promise<{ kept: number; failed: number; retried: number }> {
  try {
    const { keepAliveAllTokens, repairNullTokenChannels } = await import("../token-refresh");

    // Standard keepalive — refreshes channels that still have a refresh_token
    const result = await keepAliveAllTokens();
    if (result.kept > 0 || result.failed > 0) {
      logger.info(`Token keepalive: ${result.kept} refreshed, ${result.failed} failed`);
    }

    // Guardian repair — targets channels where BOTH tokens became null (blind spot in keepalive)
    // This is the safety net that catches post-rotation wipes or accidental DB clears.
    const repair = await repairNullTokenChannels();
    if (repair.repaired > 0) {
      logger.info(`[TokenGuardian] Auto-repaired ${repair.repaired} null-token YouTube channel(s) from backup`);
    }
    if (repair.alerted > 0) {
      logger.warn(`[TokenGuardian] ${repair.alerted} channel(s) could not be repaired — users have been notified to reconnect`);
    }

    // Live probe — every 6 hours verify the token is actually accepted by Google
    await runYouTubeTokenHealthProbe().catch(e =>
      logger.warn(`[TokenProbe] Probe cycle threw: ${e.message}`)
    );

    return { kept: result.kept, failed: result.failed, retried: repair.repaired };
  } catch (err: any) {
    logger.warn(`Token keepalive error: ${err.message}`);
    return { kept: 0, failed: 0, retried: 0 };
  }
}

// --------------------------------------------------------------------------
// MAIN CYCLE — runs every 30 minutes per user
// --------------------------------------------------------------------------
const MIN_CONTINUITY_GAP_MINUTES = 20;

async function wasAgentRecentlyActive(agentId: string, minGapMinutes: number): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - minGapMinutes * 60 * 1000);
    const [recent] = await db
      .select({ id: aiAgentActivities.id })
      .from(aiAgentActivities)
      .where(
        and(
          eq(aiAgentActivities.agentId, agentId),
          eq(aiAgentActivities.status, "completed"),
          gt(aiAgentActivities.createdAt!, cutoff)
        )
      )
      .limit(1);
    return !!recent;
  } catch {
    return false;
  }
}

async function runContinuityCycle(): Promise<void> {
  try {
    if (await wasAgentRecentlyActive("ai-continuity", MIN_CONTINUITY_GAP_MINUTES)) {
      logger.info("Continuity cycle skipped — last run was less than 20 minutes ago");
      return;
    }

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

    await runTokenKeepalive().catch(err =>
      logger.warn(`Token keepalive failed: ${err.message}`)
    );

    for (const userId of activeUserIds) {
      try {
        const repaired = await runQueueDoctor(userId);
        const kickstarted = await runGapScanner(userId);
        const refilled = await runInventoryGuardian(userId);

        const healthData = await getHealthSnapshot(userId);

        const parts: string[] = [];
        if (kickstarted.length > 0) parts.push(`${kickstarted.length} agents kickstarted`);
        if (repaired > 0) parts.push(`${repaired} queue items repaired`);
        if (refilled) parts.push("content inventory refilled");
        if (healthData) parts.push(`health: ${healthData.status} (${healthData.score}/100)`);

        await storage.createAgentActivity({
          userId,
          agentId: "ai-continuity",
          action: "continuity_cycle",
          target: "System pipeline",
          status: "completed",
          details: {
            description: parts.length > 0
              ? `Morgan ran a continuity sweep: ${parts.join(", ")}`
              : "Morgan ran a routine continuity sweep — all systems nominal",
            impact: "Zero-touch autonomous operation maintained",
            metrics: {
              agentsKickstarted: kickstarted.length,
              queueItemsRepaired: repaired,
              inventoryRefilled: refilled ? 1 : 0,
              totalGapsFilledLifetime: totalGapsFilled,
              ...(healthData ? { systemHealthScore: healthData.score, pipelineStatus: healthData.status } : {}),
            },
          },
        });

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
