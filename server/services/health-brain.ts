import { pool } from "../db";
import { createLogger } from "../lib/logger";
import { jitter } from "../lib/timer-utils";
import { sendCriticalAlert, writeCrashMarker } from "./critical-alert";

const logger = createLogger("health-brain");

export interface RegisteredEngine {
  name: string;
  priority: 1 | 2 | 3; // 1=critical(auth/billing), 2=important, 3=background
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  ping?: () => boolean | Promise<boolean>;
  intervalMs: number;
  maxRestarts?: number;
  dependsOn?: string[];
}

type EngineStatus = "healthy" | "degraded" | "failed" | "recovering" | "paused";

interface EngineRecord extends RegisteredEngine {
  status: EngineStatus;
  restartCount: number;
  lastRestartAt: number;
  lastFailedAt: number;   // when the engine first entered "failed" (maxRestarts hit)
  inFlight: Promise<void> | null;
}

// After this much time in "failed" state, reset restartCount so the engine
// can attempt another round of retries. Transient infra issues (OOM, DB blip)
// resolve on their own within minutes — we shouldn't leave engines permanently
// dead just because they crashed 5 times during that window.
const ENGINE_COOLDOWN_RESET_MS = 30 * 60_000; // 30 minutes

class HealthBrain {
  private engines = new Map<string, EngineRecord>();
  dbPressure = 0;   // 0-100
  memPressure = 0;  // 0-100
  private tickCount = 0;

  register(engine: RegisteredEngine): void {
    if (this.engines.has(engine.name)) return;
    this.engines.set(engine.name, {
      ...engine,
      status: "healthy",
      restartCount: 0,
      lastRestartAt: 0,
      lastFailedAt: 0,
      inFlight: null,
    });
  }

  isThrottled(priority: 1 | 2 | 3): boolean {
    if (priority === 1) return false; // critical never throttled
    if (priority === 2) return this.dbPressure > 80;
    return this.dbPressure > 60; // p3 background
  }

  private dbQueryFailCount = 0;

  async measurePressure(): Promise<void> {
    try {
      const res = await pool.query(
        `SELECT count(*) FILTER (WHERE state != 'idle') AS active FROM pg_stat_activity WHERE datname = current_database()`
      );
      const active = parseInt(res.rows[0]?.active || "0", 10);
      this.dbPressure = Math.min(100, Math.round((active / 20) * 100));
      this.dbQueryFailCount = 0;
    } catch (err: any) {
      this.dbQueryFailCount++;
      if (this.dbQueryFailCount >= 3) {
        this.dbPressure = 100;
        logger.error(`[HealthBrain] DB pressure query failed ${this.dbQueryFailCount}x consecutively — reporting 100% pressure: ${err.message}`);
      } else {
        this.dbPressure = Math.max(this.dbPressure, 75);
        logger.warn(`[HealthBrain] DB pressure query failed (${this.dbQueryFailCount}/3): ${err.message}`);
      }
    }
    const heapUsed = process.memoryUsage().heapUsed;
    this.memPressure = Math.min(100, Math.round((heapUsed / 536_870_912) * 100)); // 512MB
  }

  private sortedByDependency(): EngineRecord[] {
    const records = Array.from(this.engines.values());
    // Simple topological sort: engines with no dependsOn first
    return records.sort((a, b) => {
      const aDeps = a.dependsOn?.length ?? 0;
      const bDeps = b.dependsOn?.length ?? 0;
      return aDeps - bDeps;
    });
  }

  private async restart(record: EngineRecord): Promise<void> {
    if (record.inFlight) {
      await Promise.race([record.inFlight, new Promise(r => setTimeout(r, 5000))]);
    }
    const backoff = Math.min(1000 * Math.pow(2, record.restartCount), 30_000);
    await new Promise(r => setTimeout(r, backoff));
    record.status = "recovering";
    try {
      await Promise.resolve(record.stop()).catch(() => {});
      await Promise.resolve(record.start());
      record.status = "healthy";
      record.restartCount = 0;
      logger.info(`[HealthBrain] Engine ${record.name} recovered successfully`);
    } catch (err: any) {
      record.restartCount++;
      const maxR = record.maxRestarts ?? 5;
      const nowHit = record.restartCount >= maxR;
      record.status = nowHit ? "failed" : "recovering";
      // Record when the engine first entered "failed" so the cooldown reset can fire
      if (nowHit && record.lastFailedAt === 0) record.lastFailedAt = Date.now();
      logger.error(`[HealthBrain] Engine ${record.name} restart failed (attempt ${record.restartCount}/${maxR}): ${err.message}`);
    }
    record.lastRestartAt = Date.now();
  }

  async tick(): Promise<void> {
    this.tickCount++;
    await this.measurePressure();

    // Pressure-aware load shedding — shed background engines first, important second
    if (this.dbPressure > 95) {
      this.pauseByPriority(2); // shed priority-2 and -3 under extreme pressure
    } else if (this.dbPressure > 80) {
      this.pauseByPriority(3); // shed only priority-3 background engines
    }

    // Resume as pressure drops
    if (this.dbPressure < 50) {
      this.resumeByPriority(3);
      this.resumeByPriority(2);
    } else if (this.dbPressure < 70) {
      this.resumeByPriority(3);
    }

    // Log summary every 10 ticks (~2.5 min) — silent otherwise
    if (this.tickCount % 10 === 0) {
      const statuses = Object.fromEntries(
        Array.from(this.engines.entries()).map(([k, v]) => [k, v.status])
      );
      logger.info("[HealthBrain] Tick summary", { dbPressure: this.dbPressure, memPressure: this.memPressure, engines: statuses });
    }

    // Cooldown reset: if an engine has been hard-failed for >30 min, clear its
    // restart counter so it gets another round of retries. This handles transient
    // infra blips (OOM, DB hiccup) that would otherwise permanently strand engines.
    const now = Date.now();
    for (const record of this.engines.values()) {
      if (record.status === "failed" && record.lastFailedAt > 0 && now - record.lastFailedAt > ENGINE_COOLDOWN_RESET_MS) {
        logger.info(`[HealthBrain] Engine ${record.name} cooldown expired — resetting restart counter for another round`);
        record.restartCount = 0;
        record.lastFailedAt = 0;
        record.status = "recovering";
      }
    }

    // Restart failed/recovering engines in dependency order
    for (const record of this.sortedByDependency()) {
      if (record.status === "failed" || record.status === "recovering") {
        const maxR = record.maxRestarts ?? 5;
        if (record.restartCount < maxR) {
          record.inFlight = this.restart(record);
          record.inFlight.finally(() => { record.inFlight = null; });
        }
      }
    }
  }

  pauseByPriority(priority: number): void {
    for (const [, record] of this.engines) {
      if (record.priority >= priority && record.status === "healthy") {
        record.status = "paused";
        try { Promise.resolve(record.stop()).catch(() => {}); } catch {}
      }
    }
  }

  resumeByPriority(priority: number): void {
    for (const [, record] of this.engines) {
      if (record.priority >= priority && record.status === "paused") {
        record.status = "healthy";
        try { Promise.resolve(record.start()).catch(() => {}); } catch {}
      }
    }
  }

  async drainAndRestart(): Promise<void> {
    logger.warn("[HealthBrain] Drain and restart initiated — stopping all engines");
    for (const [, record] of this.engines) {
      try { await Promise.resolve(record.stop()); } catch {}
    }
    const reason = "Unrecoverable memory leak — server restarting";
    const detail = "Memory usage remained above 350 MB after emergency relief. The server will restart automatically and resume all operations.";
    writeCrashMarker(reason, detail);
    await sendCriticalAlert(reason, detail);
    await new Promise(r => setTimeout(r, 3000));
    process.exit(1);
  }

  async forceRestart(name: string): Promise<void> {
    const record = this.engines.get(name);
    if (!record) {
      logger.error(`[HealthBrain] forceRestart failed: engine ${name} not found`);
      return;
    }
    logger.info(`[HealthBrain] Force restarting engine: ${name}`);
    await this.restart(record);
  }

  getStatus() {
    const result: Record<string, any> = {
      dbPressure: this.dbPressure,
      memPressure: this.memPressure,
      engines: {} as Record<string, any>,
    };
    for (const [name, record] of this.engines) {
      result.engines[name] = {
        status: record.status,
        restartCount: record.restartCount,
        priority: record.priority,
        lastRestartAt: record.lastRestartAt ? new Date(record.lastRestartAt).toISOString() : null,
      };
    }
    return result;
  }
}

export const healthBrain = new HealthBrain();

// ~15s tick with ±20% jitter — self-managing, non-overlapping
let tickRunning = false;
setInterval(async () => {
  if (tickRunning) return;
  tickRunning = true;
  try { await healthBrain.tick(); } catch (e: any) {
    // Never let tick crash the interval
    logger.error("[HealthBrain] Tick error:", e.message);
  } finally { tickRunning = false; }
}, jitter(15_000));
