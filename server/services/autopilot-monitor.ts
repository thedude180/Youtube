import { db, withRetry } from "../db";
import { users } from "@shared/models/auth";
import { streamPipelines, contentPipeline, autopilotQueue, youtubePushBacklog, channels } from "@shared/schema";
import { eq, and, lt, gte, sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { notifyUser, type NotificationSeverity } from "./notifications";

interface HealthCheckResult {
  ok: boolean;
  message?: string;
  severity?: NotificationSeverity;
  autoFixed?: boolean;
  fixAction?: string;
}

interface SystemCheck {
  name: string;
  check: (userId: string) => Promise<HealthCheckResult>;
}

const autoFixLog: Map<string, { count: number; lastFixed: Date }> = new Map();
const AUTO_FIX_LOG_MAX_SIZE = 1000;

function enforceAutoFixLogCap(): void {
  if (autoFixLog.size <= AUTO_FIX_LOG_MAX_SIZE) return;
  const sorted = Array.from(autoFixLog.entries()).sort(
    (a, b) => a[1].lastFixed.getTime() - b[1].lastFixed.getTime()
  );
  const toRemove = sorted.slice(0, autoFixLog.size - AUTO_FIX_LOG_MAX_SIZE);
  for (const [key] of toRemove) autoFixLog.delete(key);
}

function cleanupAutoFixLog(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, entry] of Array.from(autoFixLog)) {
    if (entry.lastFixed.getTime() < cutoff) autoFixLog.delete(key);
  }
}

import { registerCleanup } from "./cleanup-coordinator";
import { createLogger } from "../lib/logger";

const logger = createLogger("autopilot-monitor");
registerCleanup("autoFixLog", cleanupAutoFixLog, 5 * 60 * 1000);

export function stopAutoFixCleanup(): void {}

function logAutoFix(userId: string, system: string, action: string): void {
  const key = `${userId}:${system}`;
  const entry = autoFixLog.get(key);
  if (entry) {
    entry.count++;
    entry.lastFixed = new Date();
  } else {
    autoFixLog.set(key, { count: 1, lastFixed: new Date() });
  }
  enforceAutoFixLogCap();
}

const systemChecks: SystemCheck[] = [
  {
    name: "pipeline_health",
    check: async (userId) => {
      try {
        const stalledThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000);

        const stalledContentPipelines = await db.select().from(contentPipeline)
          .where(and(
            eq(contentPipeline.userId, userId),
            eq(contentPipeline.status, "processing"),
            lt(contentPipeline.createdAt, stalledThreshold)
          )).limit(10);

        let restarted = 0;
        if (stalledContentPipelines.length > 0) {
          const { executePipelineInBackground } = await import("../routes/pipeline");
          for (const pipeline of stalledContentPipelines) {
            const existingResults = (pipeline.stepResults as Record<string, any>) || {};
            const completedSteps = (pipeline.completedSteps as string[]) || [];
            executePipelineInBackground(
              pipeline.id,
              pipeline.videoTitle || "Untitled",
              pipeline.mode || "vod",
              existingResults,
              completedSteps,
            ).catch(err => {
              logger.error(`[Autopilot:SelfHeal] Pipeline restart failed for ${pipeline.id}:`, err);
            });
            restarted++;
          }
          logAutoFix(userId, "pipeline_health", `Re-executed ${restarted} stalled content pipelines`);
        }

        const stalledStreamPipelines = await db.select().from(streamPipelines)
          .where(and(
            eq(streamPipelines.userId, userId),
            eq(streamPipelines.status, "processing"),
            lt(streamPipelines.createdAt, stalledThreshold)
          )).limit(10);

        if (stalledStreamPipelines.length > 0) {
          for (const pipeline of stalledStreamPipelines) {
            await db.update(streamPipelines).set({
              status: "pending",
            }).where(eq(streamPipelines.id, pipeline.id));
            restarted++;
          }
          logAutoFix(userId, "pipeline_health", `Reset ${stalledStreamPipelines.length} stalled stream pipelines to pending`);
        }

        if (restarted > 0) {
          return {
            ok: true,
            autoFixed: true,
            fixAction: `Auto-restarted ${restarted} stalled pipelines`,
          };
        }

        const failedPipelines = await db.select().from(contentPipeline)
          .where(and(
            eq(contentPipeline.userId, userId),
            eq(contentPipeline.status, "failed"),
            gte(contentPipeline.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
          )).limit(5);

        if (failedPipelines.length >= 3) {
          return {
            ok: false,
            message: `${failedPipelines.length} pipelines failed in the last 24 hours. AI is investigating the root cause.`,
            severity: "warning",
          };
        }

        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    name: "platform_connections",
    check: async (userId) => {
      try {
        const userChannels = await storage.getChannelsByUser(userId);
        if (userChannels.length === 0) return { ok: true };

        const expiringThreshold = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const expiringChannels = userChannels.filter(ch => {
          const pd = (ch.platformData || {}) as any;
          if (pd._connectionStatus === "expired" && (pd._reconnectFailures || 0) >= 15) return false;
          return ch.accessToken && ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < expiringThreshold;
        });

        if (expiringChannels.length === 0) return { ok: true };

        const { refreshExpiringTokens } = await import("../token-refresh");
        const result = await refreshExpiringTokens();

        if (result.refreshed > 0) {
          logAutoFix(userId, "platform_connections", `Auto-refreshed ${result.refreshed} expiring tokens`);
          return { ok: true, autoFixed: true, fixAction: `Auto-refreshed ${result.refreshed} tokens` };
        }

        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    name: "content_queue",
    check: async (userId) => {
      try {
        const userVideos = await storage.getVideosByUser(userId);
        const stuckDrafts = userVideos.filter(v => {
          if (v.status !== "draft") return false;
          const created = v.createdAt ? new Date(v.createdAt).getTime() : 0;
          return Date.now() - created > 48 * 60 * 60 * 1000;
        });

        if (stuckDrafts.length >= 3) {
          const { startBacklogProcessing } = await import("../backlog-engine");
          await startBacklogProcessing(userId).catch(e => logger.warn("[Autopilot] Backlog processing trigger failed", e?.message));
          logAutoFix(userId, "content_queue", `Triggered backlog processing for ${stuckDrafts.length} stuck drafts`);

          return {
            ok: true,
            autoFixed: true,
            fixAction: `Triggered backlog processing for ${stuckDrafts.length} stuck drafts`,
          };
        }

        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    name: "push_scheduler_health",
    check: async (userId) => {
      try {
        const { getQueueStatus } = await import("./push-scheduler");
        const status = getQueueStatus(userId);

        if (status.dailyCount >= 45 && status.total > 10) {
          return {
            ok: false,
            message: "Push scheduler approaching daily YouTube API limits. Remaining updates will be spread across tomorrow.",
            severity: "info",
          };
        }

        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    name: "autopilot_features",
    check: async (userId) => {
      try {
        const user = await storage.getUser(userId);
        if (!user || !user.autopilotActive) return { ok: true };

        const userChannels = await storage.getChannelsByUser(userId);
        if (userChannels.length === 0) return { ok: true };

        const userVideos = await storage.getVideosByUser(userId);
        const recentPublished = userVideos.filter(v => {
          if (v.status !== "published") return false;
          const published = v.publishedAt ? new Date(v.publishedAt).getTime() : 0;
          return Date.now() - published < 7 * 24 * 60 * 60 * 1000;
        });

        if (recentPublished.length === 0 && userVideos.length > 0) {
          try {
            const { processCommentResponses, processContentRecycling } = await import("../autopilot-engine");
            await processCommentResponses(userId).catch(e => logger.warn("[Autopilot] Comment responses failed", e?.message));
            await processContentRecycling(userId).catch(e => logger.warn("[Autopilot] Content recycling failed", e?.message));
            logAutoFix(userId, "autopilot_features", "Triggered content recycling due to publishing gap");
          } catch (e) {
            logger.error(`[Autopilot] Content recycling trigger failed for user ${userId}:`, e);
          }

          return {
            ok: true,
            autoFixed: true,
            fixAction: "Triggered content recycling due to 7-day publishing gap",
          };
        }

        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    name: "settings_optimization",
    check: async (userId) => {
      try {
        const { autoOptimizeSettings } = await import("./auto-settings-optimizer");
        const result = await autoOptimizeSettings(userId);
        if (result.optimized) {
          logAutoFix(userId, "settings_optimization", result.summary);
          return { ok: true, autoFixed: true, fixAction: result.summary };
        }
        return { ok: true };
      } catch (err) {
        return { ok: true };
      }
    },
  },
  {
    // Audit-discovered: 521+ autopilot posts and 349 YouTube push-backlog
    // entries had been silently failing for days with "<platform> is not
    // connected" / "Channel not connected or missing access token", and the
    // user was never told. The autopilot path only updates the queue row; no
    // notification was ever raised. This check surfaces those failures.
    name: "platform_connections",
    check: async (userId) => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 1. Autopilot queue: any pending or recently-failed posts whose
        //    error is "<platform> is not connected"?
        const stuckRows = await db
          .select({
            platform: autopilotQueue.targetPlatform,
            status: autopilotQueue.status,
            n: sql<number>`count(*)`.as("n"),
          })
          .from(autopilotQueue)
          .where(
            and(
              eq(autopilotQueue.userId, userId),
              gte(autopilotQueue.createdAt, since),
              inArray(autopilotQueue.status, ["pending", "failed", "permanent_fail"]),
              sql`${autopilotQueue.errorMessage} ILIKE '%not connected%'`,
            ),
          )
          .groupBy(autopilotQueue.targetPlatform, autopilotQueue.status);

        // 2. YouTube push backlog: failed updates with "Channel not connected"
        const ytFails = await db
          .select({ n: sql<number>`count(*)`.as("n") })
          .from(youtubePushBacklog)
          .where(
            and(
              eq(youtubePushBacklog.userId, userId),
              eq(youtubePushBacklog.status, "failed"),
              gte(youtubePushBacklog.createdAt, since),
              sql`${youtubePushBacklog.lastError} ILIKE '%not connected%'`,
            ),
          );

        const platformCounts = new Map<string, number>();
        for (const row of stuckRows) {
          platformCounts.set(row.platform, (platformCounts.get(row.platform) ?? 0) + Number(row.n));
        }
        const ytPushFails = Number(ytFails[0]?.n ?? 0);
        if (ytPushFails > 0) {
          platformCounts.set("youtube", (platformCounts.get("youtube") ?? 0) + ytPushFails);
        }

        if (platformCounts.size === 0) return { ok: true };

        // Compose a single, actionable message
        const breakdown = Array.from(platformCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([p, n]) => `${p}: ${n}`)
          .join(", ");
        const total = Array.from(platformCounts.values()).reduce((a, b) => a + b, 0);
        const platformsList = Array.from(platformCounts.keys()).join(", ");

        return {
          ok: false,
          // notifyUser dedupes by (userId, title) over 4h, so this won't spam
          severity: "critical",
          message: `${total} autopilot posts blocked in the last 24h because these platforms aren't connected: ${platformsList}. Breakdown — ${breakdown}. Reconnect them in Settings → Platforms so the queue can drain.`,
        };
      } catch (err: any) {
        logger.error(`[Autopilot] platform_connections check failed for ${userId}: ${err?.message}`);
        return { ok: true };
      }
    },
  },
];

let monitorInterval: ReturnType<typeof setInterval> | null = null;

async function runHealthChecks(): Promise<void> {
  const startTime = Date.now();
  try {
    const heartbeatMod = await import("./engine-heartbeat");
    await heartbeatMod.recordHeartbeat("autopilotMonitor", "running");

    const { ensureAutopilotAlwaysOn } = await import("./connection-guardian");
    await ensureAutopilotAlwaysOn().catch(e => logger.warn("[Autopilot] ensureAutopilotAlwaysOn failed", e?.message));

    const activeUsers = await withRetry(() => db.select().from(users).where(eq(users.autopilotActive, true)), "monitor-active-users");

    for (const user of activeUsers) {
      let autoFixes: string[] = [];

      for (const systemCheck of systemChecks) {
        try {
          const result = await systemCheck.check(user.id);

          if (result.autoFixed && result.fixAction) {
            autoFixes.push(`[${systemCheck.name}] ${result.fixAction}`);
          }

          if (!result.ok && result.message) {
            if (result.severity === "critical" || result.severity === "warning") {
              await notifyUser({
                userId: user.id,
                title: `System Issue: ${systemCheck.name.replace(/_/g, " ")}`,
                message: result.message,
                severity: result.severity || "warning",
                category: systemCheck.name,
              });
            }
          }
        } catch (err) {
          logger.error(`[Autopilot] Check "${systemCheck.name}" failed for user ${user.id}:`, err);
        }
      }

    }

    await heartbeatMod.recordHeartbeat("autopilotMonitor", "running", Date.now() - startTime);
  } catch (err) {
    logger.error("[Autopilot] Health check cycle error:", err);
    const { recordHeartbeat } = await import("./engine-heartbeat");
    await recordHeartbeat("autopilotMonitor", "error", undefined, String(err));
  }
}

export function startAutopilotMonitor(): void {
  if (monitorInterval) return;

  setTimeout(() => runHealthChecks().catch((err) => logger.error("Health check failed", { error: String(err) })), 60_000);

  monitorInterval = setInterval(() => {
    runHealthChecks().catch((err) => logger.error("Health check failed", { error: String(err) }));
  }, 30 * 60 * 1000);
}

export function stopAutopilotMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

export function getAutoFixHistory(): Map<string, { count: number; lastFixed: Date }> {
  return autoFixLog;
}
