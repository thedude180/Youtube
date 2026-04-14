import { emergencyMemoryRelief } from "./resilience-core";
import { healthBrain } from "./health-brain";
import { createLogger } from "../lib/logger";

const logger = createLogger("memory-guardian");

class MemoryGuardian {
  private snapshots: number[] = [];
  private lastTriggerAt = 0;
  private cleanCheckAt: number | null = null;

  tick() {
    const heapUsed = process.memoryUsage().heapUsed;
    this.snapshots.push(heapUsed);
    if (this.snapshots.length > 60) {
      this.snapshots.shift();
    }

    // Check if we are waiting for a post-cleanup verification
    if (this.cleanCheckAt && Date.now() > this.cleanCheckAt) {
      this.verifyRecovery(heapUsed);
    }

    // Run leak detection if we have enough samples and haven't triggered recently
    if (this.snapshots.length >= 10 && Date.now() - this.lastTriggerAt > 300_000) {
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
    
    if (heapUsed > 350_000_000) {
      logger.error("Memory leak persisted after emergency relief, escalating to restart", {
        heapUsedMB: Math.round(heapUsed / 1024 / 1024)
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

  getStats() {
    const heapUsed = process.memoryUsage().heapUsed;
    let slope = 0;
    let r2 = 0;
    
    if (this.snapshots.length >= 2) {
      const reg = this.linearRegression(this.snapshots);
      slope = reg.slope;
      r2 = reg.r2;
    }

    return {
      sampleCount: this.snapshots.length,
      latestMB: Math.round(heapUsed / 1024 / 1024),
      slope: Math.round(slope / 1024 / 1024) + " MB/tick",
      r2: parseFloat(r2.toFixed(4))
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
