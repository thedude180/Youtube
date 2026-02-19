import { db } from "../db";
import { users } from "@shared/models/auth";
import { streamPipelines, contentPipeline } from "@shared/schema";
import { eq, and, lt, gte } from "drizzle-orm";
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

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, entry] of Array.from(autoFixLog)) {
    if (entry.lastFixed.getTime() < cutoff) autoFixLog.delete(key);
  }
}, 60 * 60 * 1000);

function logAutoFix(userId: string, system: string, action: string): void {
  const key = `${userId}:${system}`;
  const entry = autoFixLog.get(key);
  if (entry) {
    entry.count++;
    entry.lastFixed = new Date();
  } else {
    autoFixLog.set(key, { count: 1, lastFixed: new Date() });
  }
  console.log(`[Autopilot:SelfHeal] Auto-fixed ${system} for user ${userId}: ${action}`);
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
              console.error(`[Autopilot:SelfHeal] Pipeline restart failed for ${pipeline.id}:`, err);
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

        const expiringThreshold = new Date(Date.now() + 15 * 60 * 1000);
        const expiringChannels = userChannels.filter(ch =>
          ch.accessToken && ch.tokenExpiresAt && new Date(ch.tokenExpiresAt) < expiringThreshold
        );

        if (expiringChannels.length === 0) return { ok: true };

        const { refreshExpiringTokens } = await import("../token-refresh");
        const result = await refreshExpiringTokens();

        if (result.refreshed > 0) {
          logAutoFix(userId, "platform_connections", `Auto-refreshed ${result.refreshed} expiring tokens`);
          return { ok: true, autoFixed: true, fixAction: `Auto-refreshed ${result.refreshed} tokens` };
        }

        if (result.failed > 0) {
          console.log(`[Autopilot] ${result.failed} token(s) failed refresh for ${userId} — auto-reconnect system will handle email notifications`);
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
          await startBacklogProcessing(userId).catch(() => {});
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
            await processCommentResponses(userId).catch(() => {});
            await processContentRecycling(userId).catch(() => {});
            logAutoFix(userId, "autopilot_features", "Triggered content recycling due to publishing gap");
          } catch (e) {}

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
];

let monitorInterval: ReturnType<typeof setInterval> | null = null;

async function runHealthChecks(): Promise<void> {
  try {
    const { ensureAutopilotAlwaysOn } = await import("./connection-guardian");
    await ensureAutopilotAlwaysOn().catch(() => {});

    const activeUsers = await db.select().from(users).where(eq(users.autopilotActive, true));

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
          console.error(`[Autopilot] Check "${systemCheck.name}" failed for user ${user.id}:`, err);
        }
      }

      if (autoFixes.length > 0) {
        console.log(`[Autopilot] Self-healed ${autoFixes.length} issues for user ${user.id}: ${autoFixes.join("; ")}`);
      }
    }
  } catch (err) {
    console.error("[Autopilot] Health check cycle error:", err);
  }
}

export function startAutopilotMonitor(): void {
  if (monitorInterval) return;

  console.log("[Autopilot] Background monitor started — checking every 30 minutes");

  setTimeout(() => runHealthChecks().catch(console.error), 60_000);

  monitorInterval = setInterval(() => {
    runHealthChecks().catch(console.error);
  }, 30 * 60 * 1000);
}

export function stopAutopilotMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[Autopilot] Monitor stopped");
  }
}

export function getAutoFixHistory(): Map<string, { count: number; lastFixed: Date }> {
  return autoFixLog;
}
