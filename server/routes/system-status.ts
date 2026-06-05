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
        { getHourlyCapStatus },
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

      const payload = {
        timestamp: new Date().toISOString(),

        startup: {
          ...startupStatus,
          criticalBootDone: StartupOrchestrator.isCriticalBootDone(),
        },

        youtube: {
          quotaBreakerActive: quotaActive,
          quotaResetTime,
        },

        ai: {
          semaphore,
          queues,
          hourly,
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
  app.post("/api/system/kill-switch/:name", async (req: Request, res: Response) => {
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

  log.info("[SystemStatus] Routes registered: GET /api/system/status");
}
