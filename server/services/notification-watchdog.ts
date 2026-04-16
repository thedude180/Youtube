import { db } from "../db";
import { notifications } from "@shared/schema";
import { and, eq, desc, gte, sql, inArray, ne } from "drizzle-orm";
import { classifyFailure } from "../auto-fix-engine";
import { createLogger } from "../lib/logger";

const logger = createLogger("notification-watchdog");

const SCAN_INTERVAL_MS = 10 * 60_000;
const LOOKBACK_MS = 30 * 60_000;

const WATCHDOG_TYPE = "watchdog_summary";

interface PatternCluster {
  category: string;
  platform: string | null;
  count: number;
  sample: string;
  notificationIds: number[];
}

function clusterNotifications(rows: Array<{ id: number; message: string; type: string; severity: string; metadata: any }>): PatternCluster[] {
  const buckets = new Map<string, PatternCluster>();

  for (const row of rows) {
    if (row.type === WATCHDOG_TYPE) continue;

    const category = classifyFailure(row.message || "");
    const platform = row.metadata?.platformAffected || null;
    const key = `${category}::${platform || "system"}`;

    if (!buckets.has(key)) {
      buckets.set(key, { category, platform, count: 0, sample: row.message, notificationIds: [] });
    }
    const bucket = buckets.get(key)!;
    bucket.count++;
    bucket.notificationIds.push(row.id);
  }

  return Array.from(buckets.values()).filter(b => b.count >= 2);
}

async function executeAction(cluster: PatternCluster): Promise<string | null> {
  try {
    switch (cluster.category) {
      case "quota_cap": {
        const { isQuotaBreakerTripped, tripGlobalQuotaBreaker } = await import("./youtube-quota-tracker");
        if (!isQuotaBreakerTripped()) {
          tripGlobalQuotaBreaker();
          return `Tripped quota breaker for ${cluster.platform || "youtube"} (${cluster.count} quota errors detected)`;
        }
        return `Quota breaker already active — ${cluster.count} notifications acknowledged`;
      }

      case "rate_limit": {
        return `Rate limiting active — ${cluster.count} rate-limit notifications acknowledged, engines will back off automatically`;
      }

      case "auth_expired": {
        const { jobQueue } = await import("./intelligent-job-queue");
        const channelsResult = await db.execute(sql`
          SELECT id, user_id FROM channels
          WHERE token_expires_at < NOW() + INTERVAL '30 minutes'
          AND refresh_token IS NOT NULL
          LIMIT 20
        `);
        let queued = 0;
        for (const ch of channelsResult.rows) {
          await jobQueue.enqueue({
            type: "token_refresh",
            userId: ch.user_id as string,
            priority: 9,
            payload: { channelId: ch.id },
            dedupeKey: `token_refresh:${ch.id}`,
          }).catch(() => {});
          queued++;
        }
        return queued > 0
          ? `Queued token refresh for ${queued} channels (${cluster.count} auth errors detected)`
          : `No channels need refresh — ${cluster.count} auth errors acknowledged`;
      }

      case "network":
      case "platform_down": {
        return `Platform ${cluster.platform || "unknown"} appears down — ${cluster.count} errors acknowledged, retries deferred`;
      }

      case "config_missing": {
        return `Configuration issue detected for ${cluster.platform || "system"} — ${cluster.count} config errors acknowledged`;
      }

      case "video_unavailable":
      case "copyright":
      case "compliance_violation": {
        const { runAutoFixCycle } = await import("../auto-fix-engine");
        await runAutoFixCycle().catch(() => {});
        return `Triggered auto-fix sweep for ${cluster.category} (${cluster.count} content errors)`;
      }

      default: {
        const { jobQueue } = await import("./intelligent-job-queue");
        const stuck = await jobQueue.clearStuck(15);
        if (stuck > 0) {
          return `Cleared ${stuck} stuck jobs while investigating ${cluster.count} unknown errors`;
        }
        return null;
      }
    }
  } catch (err: any) {
    logger.warn("Action execution failed", { category: cluster.category, error: err.message });
    return null;
  }
}

export async function runWatchdogSweep(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - LOOKBACK_MS);

    const unreadErrors = await db
      .select({
        id: notifications.id,
        message: notifications.message,
        type: notifications.type,
        severity: notifications.severity,
        metadata: notifications.metadata,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.read, false),
          gte(notifications.createdAt, cutoff),
          ne(notifications.type, WATCHDOG_TYPE),
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(200);

    if (unreadErrors.length === 0) return;

    const errorNotifs = unreadErrors.filter(
      n => n.severity === "critical" || n.severity === "error" || n.severity === "warning"
    );

    if (errorNotifs.length === 0) return;

    const clusters = clusterNotifications(errorNotifs);
    if (clusters.length === 0) return;

    logger.info("Watchdog detected notification clusters", {
      clusters: clusters.map(c => ({ category: c.category, platform: c.platform, count: c.count })),
    });

    const actions: string[] = [];

    for (const cluster of clusters) {
      const result = await executeAction(cluster);
      if (result) {
        actions.push(result);
        logger.info("Watchdog action taken", { action: result });
      }

      if (cluster.notificationIds.length > 0) {
        await db
          .update(notifications)
          .set({ read: true, readAt: new Date() })
          .where(inArray(notifications.id, cluster.notificationIds))
          .catch(() => {});
      }
    }

    if (actions.length > 0) {
      const adminResult = await db.execute(sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
      const adminId = adminResult.rows[0]?.id as string | undefined;
      if (adminId) {
        const { storage } = await import("../storage");
        await storage.createNotification({
          userId: adminId,
          type: WATCHDOG_TYPE,
          title: `Watchdog: ${actions.length} auto-fixes applied`,
          message: actions.join(" | "),
          severity: "info",
        });
      }
    }

    logger.info("Watchdog sweep complete", { notificationsProcessed: errorNotifs.length, actionsExecuted: actions.length });
  } catch (err: any) {
    logger.error("Watchdog sweep failed", { error: err.message });
  }
}

let watchdogInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationWatchdog(): void {
  if (watchdogInterval) return;
  logger.info("Notification watchdog started — scanning every 10 minutes");
  watchdogInterval = setInterval(() => {
    runWatchdogSweep().catch(err => logger.error("Watchdog tick failed", { error: err.message }));
  }, SCAN_INTERVAL_MS);
}

export function stopNotificationWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}
