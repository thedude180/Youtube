import { emergencyMemoryRelief } from "./resilience-core";
import { healthBrain } from "./health-brain";
import { createLogger } from "../lib/logger";

const logger = createLogger("memory-guardian");

// Skip leak detection for this long after boot — startup burst from JIT
// compilation, module loading, and concurrent service initialisation creates
// a high, short-lived slope that looks like a genuine leak but isn't.
// Wave 10.5 sequential boot loads 27 modules at 15s intervals starting at
// T+31.6min, finishing at ~T+38.4min.  Extending the holdoff to 42 minutes
// prevents a false-positive restart during that module-load window.
const STARTUP_HOLDOFF_MS = 42 * 60_000; // 42 minutes

// Require this many samples before running leak detection.
// At 60s/tick that means 20 minutes of stable data before we call it a leak.
// Raising from 10→20 prevents the startup burst from triggering a false positive.
const MIN_LEAK_SAMPLES = 20;

// If heap is still above this after emergency relief, trigger a clean restart.
// 350 MB was far too close to the normal post-startup baseline (~200-300 MB).
// Node.js can comfortably handle 500 MB without OOM risk in the Replit container.
const RESTART_THRESHOLD_BYTES = 500_000_000; // 500 MB

class MemoryGuardian {
  private snapshots: number[] = [];
  private lastTriggerAt = 0;
  private cleanCheckAt: number | null = null;
  private readonly startTime = Date.now();

  tick() {
    const heapUsed = process.memoryUsage().heapUsed;

    // During the startup holdoff window do NOT collect samples.  All services
    // fire within the first ~40 seconds; module loads and JIT compilation spike
    // memory for ~3-5 minutes before settling.  Including those spikes in the
    // regression poisons the slope estimate and causes a false-positive restart.
    if (Date.now() - this.startTime < STARTUP_HOLDOFF_MS) {
      return;
    }

    this.snapshots.push(heapUsed);
    if (this.snapshots.length > 60) {
      this.snapshots.shift();
    }

    // Check if we are waiting for a post-cleanup verification
    if (this.cleanCheckAt && Date.now() > this.cleanCheckAt) {
      this.verifyRecovery(heapUsed);
    }

    // Run leak detection if we have enough steady-state samples and haven't
    // triggered recently.  MIN_LEAK_SAMPLES (20 min) ensures the regression
    // reflects sustained growth, not the tail of the startup burst.
    if (this.snapshots.length >= MIN_LEAK_SAMPLES && Date.now() - this.lastTriggerAt > 300_000) {
      const { slope, r2 } = this.linearRegression(this.snapshots);
      
      // Threshold: >5MB/interval leak with high confidence (R2 > 0.85)
      if (slope > 5_000_000 && r2 > 0.85) {
        this.handleLeak(slope, r2);
      }
    }

    // Proactive GC if memory is high
    if (heapUsed > 400_000_000 && typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (e) {
        logger.error("Error during manual GC", { error: String(e) });
      }
    }
  }

  private linearRegression(values: number[]): { slope: number; r2: number } {
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = values[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    let ssRes = 0;
    let ssTot = 0;
    const avgY = sumY / n;

    for (let i = 0; i < n; i++) {
      const y = values[i];
      const regressionY = slope * i + intercept;
      ssRes += Math.pow(y - regressionY, 2);
      ssTot += Math.pow(y - avgY, 2);
    }

    const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);

    return { slope, r2 };
  }

  private handleLeak(slope: number, r2: number) {
    this.lastTriggerAt = Date.now();
    logger.warn("Memory leak detected, initiating emergency relief", { 
      slope: Math.round(slope / 1024 / 1024) + " MB/tick", 
      r2: r2.toFixed(4) 
    });
    
    try {
      emergencyMemoryRelief();
    } catch (e) {
      logger.error("Failed to execute emergencyMemoryRelief", { error: String(e) });
    }

    // Schedule a check in 30 seconds (2 ticks)
    this.cleanCheckAt = Date.now() + 30_000;
  }

  private verifyRecovery(heapUsed: number) {
    this.cleanCheckAt = null;
    
    if (heapUsed > RESTART_THRESHOLD_BYTES) {
      logger.error("Memory leak persisted after emergency relief, escalating to restart", {
        heapUsedMB: Math.round(heapUsed / 1024 / 1024),
        thresholdMB: Math.round(RESTART_THRESHOLD_BYTES / 1024 / 1024),
      });
      healthBrain.drainAndRestart().catch(e => {
        logger.error("Failed to initiate drainAndRestart", { error: String(e) });
      });
    } else {
      logger.info("Memory recovered successfully after emergency relief", {
        heapUsedMB: Math.round(heapUsed / 1024 / 1024)
      });
      // Clear snapshots to start fresh trend analysis
      this.snapshots = [];
    }
  }

  /**
   * Reset the snapshot baseline so leak detection restarts from the current
   * heap level.  Call this once all Wave 10.5 module loads have finished so
   * the linear regression uses only post-startup steady-state samples.
   */
  resetBaseline() {
    this.snapshots = [];
    logger.info("[MemoryGuardian] Baseline reset — leak detection will restart from current heap level");
  }

  getStats() {
    const heapUsed = process.memoryUsage().heapUsed;
    let slope = 0;
    let r2 = 0;
    
    if (this.snapshots.length >= 2) {
      const reg = this.linearRegression(this.snapshots);
      slope = reg.slope;
      r2 = reg.r2;
    }

    const uptimeSec = Math.round((Date.now() - this.startTime) / 1000);
    const holdoffRemainSec = Math.max(0, Math.round((STARTUP_HOLDOFF_MS - (Date.now() - this.startTime)) / 1000));

    return {
      sampleCount: this.snapshots.length,
      latestMB: Math.round(heapUsed / 1024 / 1024),
      slope: Math.round(slope / 1024 / 1024) + " MB/tick",
      r2: parseFloat(r2.toFixed(4)),
      uptimeSec,
      holdoffRemainSec,
    };
  }
}

export const memoryGuardian = new MemoryGuardian();
setInterval(() => {
  try {
    memoryGuardian.tick();
  } catch (e) {
    logger.error("[MemoryGuardian] Error in tick:", e);
  }
}, 60_000);

export function getMemoryStats() {
  return memoryGuardian.getStats();
}
