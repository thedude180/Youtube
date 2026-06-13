/**
 * server/routes/system-status.ts
 *
 * Phase 15 — Status Dashboard API
 *
 * GET /api/system/status
 * Returns a full system health snapshot for the dashboard.
 * No new DB queries — all from in-memory state objects.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { requireAdmin } from "./helpers";

const log = createLogger("system-status");

export function registerSystemStatusRoutes(app: Express): void {
  /**
   * GET /api/system/status
   * Full system health snapshot.
   */
  app.get("/api/system/status", async (_req: Request, res: Response) => {
    try {
      const [
        { StartupOrchestrator } ,
        { KillSwitches },
        { AIScheduler },
        { LogSuppressor },
        { getContainerMemory },
        { ytdlpGateStatus },
        { getAISemaphoreStats, getAiQueueStatus },
        { getHourlyCapStatus, getDailyCapStatus },
      ] = await Promise.all([
        import("../lib/startup-orchestrator"),
        import("../lib/kill-switches"),
        import("../lib/ai-scheduler"),
        import("../lib/log-suppressor"),
        import("../lib/container-memory"),
        import("../lib/ytdlp-gate"),
        import("../lib/ai-semaphore"),
        import("../lib/token-hourly-cap"),
      ]);

      let quotaActive = false;
      let quotaResetTime: string | null = null;
      try {
        const { isQuotaBreakerTripped } = await import("../services/youtube-quota-tracker");
        quotaActive = isQuotaBreakerTripped();
        quotaResetTime = quotaActive ? "midnight Pacific" : null;
      } catch { /* quota tracker may not be loaded yet */ }

      let selfHealRecent: unknown[] = [];
      try {
        const { SelfHealingEngine } = await import("../services/self-healing-engine");
        selfHealRecent = await SelfHealingEngine.getRecentActions(10);
      } catch { /* non-fatal */ }

      let growthStatus: unknown = null;
      try {
        const { GrowthExperimentEngine } = await import("../services/growth-experiment-engine");
        growthStatus = GrowthExperimentEngine.getStatus();
      } catch { /* non-fatal */ }

      const mem = getContainerMemory();
      const schedulerStatus = AIScheduler.getStatus();
      const killStatus = KillSwitches.getStatus();
      const startupStatus = StartupOrchestrator.getStatus();
      const suppressions = LogSuppressor.getStats();
      const ytdlp = ytdlpGateStatus();
      const semaphore = getAISemaphoreStats();
      const queues = getAiQueueStatus();
      const hourly = getHourlyCapStatus();
      const daily  = getDailyCapStatus();

      // Active workers from cron heartbeat registry.
      let workers: { registeredJobs: number; heartbeats: Array<{ jobName: string; expectedIntervalMs: number }> } = {
        registeredJobs: 0,
        heartbeats: [],
      };
      try {
        const { getCronHealthReport } = await import("../lib/cron-lock");
        workers = getCronHealthReport();
      } catch { /* non-fatal */ }

      // YouTube connection status: check for channels with valid tokens.
      let youtubeConnection: { status: "connected" | "disconnected" | "partial" | "unknown"; connectedCount: number; disconnectedCount: number } = {
        status: "unknown",
        connectedCount: 0,
        disconnectedCount: 0,
      };
      try {
        const { db } = await import("../db");
        const { channels } = await import("@shared/schema");
        const { isNull, isNotNull, and, or } = await import("drizzle-orm");
        const [connected, disconnected] = await Promise.all([
          db.select({ id: channels.id }).from(channels).where(
            and(
              isNotNull(channels.accessToken),
              isNotNull(channels.refreshToken),
            )
          ),
          db.select({ id: channels.id }).from(channels).where(
            or(
              isNull(channels.accessToken),
              isNull(channels.refreshToken),
            )
          ),
        ]);
        const cc = connected.length;
        const dc = disconnected.length;
        youtubeConnection = {
          connectedCount: cc,
          disconnectedCount: dc,
          status: cc === 0 && dc === 0 ? "unknown"
                : cc > 0 && dc === 0 ? "connected"
                : cc === 0 ? "disconnected"
                : "partial",
        };
      } catch { /* non-fatal — channels table may not have token columns in all envs */ }

      const payload = {
        timestamp: new Date().toISOString(),

        startup: {
          ...startupStatus,
          criticalBootDone: StartupOrchestrator.isCriticalBootDone(),
        },

        youtube: {
          quotaBreakerActive: quotaActive,
          quotaResetTime,
          connection: youtubeConnection,
        },

        workers,

        ai: {
          semaphore,
          queues,
          hourly,
          daily,
          scheduler: schedulerStatus,
        },

        memory: {
          usedMB:      Math.round(mem.usageBytes / 1024 / 1024),
          limitMB:     Math.round(mem.limitBytes / 1024 / 1024),
          freeMB:      Math.round(mem.freeBytes / 1024 / 1024),
          usedPct:     Math.round(mem.usedRatio * 100),
          ytdlpGate:   ytdlp,
        },

        killSwitches: killStatus,

        logSuppression: {
          activeKeys: suppressions.length,
          entries: suppressions.slice(0, 20),
        },

        selfHealing: {
          recentActions: selfHealRecent,
        },

        growth: growthStatus,
      };

      res.json(payload);
    } catch (err: any) {
      log.error(`[SystemStatus] Error building status: ${err?.message}`);
      res.status(500).json({ error: "Failed to build system status", message: err?.message });
    }
  });

  /**
   * POST /api/system/kill-switch/:name
   * Enable or disable a kill switch. Admin only.
   */
  app.patch("/api/system/kill-switch/:name", async (req: Request, res: Response) => {
    try {
      const adminUserId = requireAdmin(req, res);
      if (!adminUserId) return; // requireAdmin already sent 401/403

      const { KillSwitches } = await import("../lib/kill-switches");
      const name = req.params.name;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      await KillSwitches.set(name as any, enabled);
      log.warn(`[KillSwitch] ${name} set to ${enabled} by admin ${adminUserId}`);
      return res.json({ ok: true, switch: name, enabled });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  /**
   * GET /api/admin/boot-registry
   * Returns actual service start timestamps + convergence analysis.
   * Admin only.
   */
  app.get("/api/admin/boot-registry", async (req: Request, res: Response) => {
    try {
      const adminUserId = requireAdmin(req, res);
      if (!adminUserId) return;
      const { getBootRegistrySnapshot } = await import("../lib/boot-registry");
      return res.json(getBootRegistrySnapshot());
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  /**
   * GET /api/admin/vault-health
   * Returns vault status distribution, fail rate, disk state, circuit state.
   * Admin only.
   */
  app.get("/api/admin/vault-health", async (req: Request, res: Response) => {
    try {
      const adminUserId = requireAdmin(req, res);
      if (!adminUserId) return;

      const { db } = await import("../db");
      const { contentVaultBackups } = await import("@shared/schema");
      const { eq, sql: drizzleSql, and, gte } = await import("drizzle-orm");

      // Get the real ET Gaming user — channel 53 owns all real vault data
      const { channels } = await import("@shared/schema");
      const { isNotNull } = await import("drizzle-orm");
      const [ch] = await db.select({ userId: channels.userId })
        .from(channels)
        .where(and(isNotNull(channels.accessToken), isNotNull(channels.userId)))
        .limit(1);
      const userId = ch?.userId ?? adminUserId;

      // Status distribution + permanentFail count
      const [statusRows, permFailRows, recentRows] = await Promise.all([
        db.select({
          status: contentVaultBackups.status,
          count: drizzleSql<number>`count(*)::int`,
        })
          .from(contentVaultBackups)
          .where(eq(contentVaultBackups.userId, userId))
          .groupBy(contentVaultBackups.status),
        db.select({ count: drizzleSql<number>`count(*)::int` })
          .from(contentVaultBackups)
          .where(
            and(
              eq(contentVaultBackups.userId, userId),
              drizzleSql`(metadata->>'permanentFail')::boolean = true`,
            )
          ),
        db.select({
          status: contentVaultBackups.status,
          count: drizzleSql<number>`count(*)::int`,
        })
          .from(contentVaultBackups)
          .where(
            and(
              eq(contentVaultBackups.userId, userId),
              gte(contentVaultBackups.createdAt, new Date(Date.now() - 24 * 3_600_000)),
            )
          )
          .groupBy(contentVaultBackups.status),
      ]);

      const statusCounts: Record<string, number> = {};
      for (const r of statusRows) statusCounts[r.status ?? "unknown"] = Number(r.count);

      const recentCounts: Record<string, number> = {};
      for (const r of recentRows) recentCounts[r.status ?? "unknown"] = Number(r.count);

      const recentFailed  = recentCounts["failed"] ?? 0;
      const recentTotal   = Object.values(recentCounts).reduce((s, n) => s + n, 0);
      const recentFailRate = recentTotal > 0 ? Math.round((recentFailed / recentTotal) * 100) : 0;

      // Disk circuit state (in-memory variable from video-vault)
      let diskCircuit: { isOpen: boolean; backoffUntil: number | null; freeGb: number | null } = {
        isOpen: false, backoffUntil: null, freeGb: null,
      };
      try {
        const { getVaultStats } = await import("../services/video-vault");
        const vs = await getVaultStats(userId);
        diskCircuit.freeGb = vs.freeSpaceGB;
        diskCircuit.isOpen = vs.freeSpaceGB < 0.5;
      } catch { /* non-fatal */ }

      return res.json({
        statusCounts,
        permanentFailCount: Number(permFailRows[0]?.count ?? 0),
        recentFailRate,
        recentCounts,
        diskCircuit,
        backlogSize: statusCounts["indexed"] ?? 0,
        activeDownloads: statusCounts["downloading"] ?? 0,
        totalDownloaded: statusCounts["downloaded"] ?? 0,
        totalFailed: statusCounts["failed"] ?? 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  /**
   * GET /api/admin/migrations
   * Returns migration catalog + which ones have run (from system_settings flags).
   * Admin only.
   */
  app.get("/api/admin/migrations", async (req: Request, res: Response) => {
    try {
      const adminUserId = requireAdmin(req, res);
      if (!adminUserId) return;

      const { db } = await import("../db");
      const { systemSettings } = await import("@shared/schema");
      const { like } = await import("drizzle-orm");
      const { MIGRATION_CATALOG } = await import("../lib/startup-migrations");

      // Read all system_settings keys that look like migration flags
      const rows = await db
        .select({ key: systemSettings.key, value: systemSettings.value, updatedAt: systemSettings.updatedAt })
        .from(systemSettings)
        .where(like(systemSettings.key, "migration%"));

      const flagMap = new Map(rows.map(r => [r.key.toLowerCase(), r]));

      // Match catalog entries to their flags (best-effort; flag naming is not fully consistent)
      const migrations = Object.entries(MIGRATION_CATALOG).map(([numStr, info]) => {
        const num = parseInt(numStr, 10);
        const paddedNum = String(num).padStart(3, "0");
        // Try several flag key patterns used across the codebase
        const candidates = [
          `migration:${paddedNum}:`,
          `migration_${paddedNum}_`,
          `migration:${num}:`,
          `migration_${num}_`,
        ];
        let matchedRow: typeof rows[0] | undefined;
        for (const cand of candidates) {
          for (const [key, row] of flagMap) {
            if (key.startsWith(cand)) { matchedRow = row; break; }
          }
          if (matchedRow) break;
        }
        return {
          id: num,
          name: info.name,
          description: info.description,
          category: info.category,
          ran: matchedRow?.value === "true",
          ranAt: matchedRow?.updatedAt?.toISOString() ?? null,
          flagKey: matchedRow?.key ?? null,
        };
      });

      const ran    = migrations.filter(m => m.ran).length;
      const notRan = migrations.filter(m => !m.ran).length;

      return res.json({ total: migrations.length, ran, notRan, migrations });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  log.info("[SystemStatus] Routes registered: GET /api/system/status + admin: boot-registry, vault-health, migrations");
}
