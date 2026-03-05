import { pool } from "../db";

const MAX_HEAP_MB = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || "512", 10);
const HEAP_WARNING_MB = Math.floor(MAX_HEAP_MB * 0.75);
const HEAP_CRITICAL_MB = Math.floor(MAX_HEAP_MB * 0.88);
let lastMemoryWarning = 0;
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let engineCrashCounts = new Map<string, { count: number; lastCrash: number }>();
const ENGINE_CRASH_THRESHOLD = 5;
const ENGINE_CRASH_WINDOW_MS = 10 * 60 * 1000;
let serverStartTime = Date.now();
let consecutiveDbFailures = 0;
let lastDbRecovery = 0;
let totalWatchdogRuns = 0;
let totalEmergencyReliefs = 0;

export function timedFetch(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...fetchOptions, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function isolateEngine(name: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (isEngineThrottled(name)) return;
    try {
      await fn();
      const entry = engineCrashCounts.get(name);
      if (entry) {
        if (Date.now() - entry.lastCrash > ENGINE_CRASH_WINDOW_MS) {
          engineCrashCounts.delete(name);
        }
      }
    } catch (err) {
      const entry = engineCrashCounts.get(name) || { count: 0, lastCrash: 0 };
      if (Date.now() - entry.lastCrash > ENGINE_CRASH_WINDOW_MS) {
        entry.count = 1;
      } else {
        entry.count++;
      }
      entry.lastCrash = Date.now();
      engineCrashCounts.set(name, entry);

      if (entry.count >= ENGINE_CRASH_THRESHOLD) {
        console.error(`[Resilience] Engine "${name}" crashed ${entry.count} times in ${ENGINE_CRASH_WINDOW_MS / 60000}min — suppressing further runs until cooldown`);
      } else {
        console.error(`[Resilience] Engine "${name}" crashed (${entry.count}/${ENGINE_CRASH_THRESHOLD}):`, String(err).substring(0, 150));
      }
    }
  };
}

export function isEngineThrottled(name: string): boolean {
  const entry = engineCrashCounts.get(name);
  if (!entry) return false;
  if (entry.count >= ENGINE_CRASH_THRESHOLD && Date.now() - entry.lastCrash < ENGINE_CRASH_WINDOW_MS) {
    return true;
  }
  return false;
}

function getHeapPressure(): { ratio: number; heapUsedMB: number; heapTotalMB: number; maxHeapMB: number; rssMB: number } {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  return {
    ratio: heapUsedMB / MAX_HEAP_MB,
    heapUsedMB,
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    maxHeapMB: MAX_HEAP_MB,
    rssMB: Math.round(mem.rss / 1024 / 1024),
  };
}

export function capMap<K, V>(map: Map<K, V>, maxSize: number, name: string): void {
  if (map.size > maxSize) {
    const toDelete = map.size - Math.floor(maxSize * 0.8);
    let deleted = 0;
    for (const key of map.keys()) {
      if (deleted >= toDelete) break;
      map.delete(key);
      deleted++;
    }
    console.warn(`[Resilience] Capped ${name} map from ${map.size + deleted} to ${map.size} entries`);
  }
}

const registeredCaches: Array<{ name: string; clear: () => void }> = [];
const registeredMaps: Array<{ name: string; map: Map<any, any>; maxSize: number }> = [];

export function registerCache(name: string, clearFn: () => void): void {
  registeredCaches.push({ name, clear: clearFn });
}

export function registerMap(name: string, map: Map<any, any>, maxSize: number): void {
  registeredMaps.push({ name, map, maxSize });
}

export function emergencyMemoryRelief(): void {
  totalEmergencyReliefs++;
  console.warn("[Resilience] EMERGENCY memory relief — clearing all registered caches and capping maps");

  for (const cache of registeredCaches) {
    try {
      cache.clear();
      console.warn(`[Resilience] Cleared cache: ${cache.name}`);
    } catch {}
  }

  for (const { name, map, maxSize } of registeredMaps) {
    try {
      const halfMax = Math.floor(maxSize * 0.5);
      if (map.size > halfMax) {
        const toDelete = map.size - halfMax;
        let deleted = 0;
        for (const key of map.keys()) {
          if (deleted >= toDelete) break;
          map.delete(key);
          deleted++;
        }
        console.warn(`[Resilience] Emergency-capped ${name}: ${map.size} entries (deleted ${deleted})`);
      }
    } catch {}
  }

  if (global.gc) {
    global.gc();
    console.warn("[Resilience] Forced garbage collection");
  }
}

function enforceMapCaps(): void {
  for (const { name, map, maxSize } of registeredMaps) {
    if (map.size > maxSize) {
      capMap(map, maxSize, name);
    }
  }
}

async function probeDbHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    consecutiveDbFailures = 0;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    consecutiveDbFailures++;
    const latencyMs = Date.now() - start;
    console.error(`[Resilience] DB probe failed (consecutive: ${consecutiveDbFailures}):`, String(err).substring(0, 100));

    if (consecutiveDbFailures >= 3 && Date.now() - lastDbRecovery > 60_000) {
      lastDbRecovery = Date.now();
      console.warn("[Resilience] Attempting DB pool recovery — draining idle connections");
      try {
        const idleCount = pool.idleCount;
        if (idleCount > 0) {
          console.warn(`[Resilience] Pool has ${idleCount} idle connections, ${pool.waitingCount} waiting`);
        }
      } catch {}
    }
    return { healthy: false, latencyMs };
  }
}

function runWatchdog(): void {
  totalWatchdogRuns++;
  const pressure = getHeapPressure();

  const stalled = detectEventLoopStall();
  if (stalled) {
    processHealthy = false;
    emergencyMemoryRelief();
  } else {
    processHealthy = true;
  }

  enforceMapCaps();

  if (pressure.heapUsedMB > HEAP_CRITICAL_MB) {
    emergencyMemoryRelief();
    lastMemoryWarning = Date.now();
  } else if (pressure.heapUsedMB > HEAP_WARNING_MB) {
    if (Date.now() - lastMemoryWarning > 300_000) {
      console.warn(`[Resilience] Memory pressure warning: ${pressure.heapUsedMB}MB / ${MAX_HEAP_MB}MB max (${Math.round(pressure.ratio * 100)}%) RSS: ${pressure.rssMB}MB`);
      lastMemoryWarning = Date.now();
    }
  }

  if (totalWatchdogRuns % 10 === 0) {
    probeDbHealth().catch(() => {});
  }

  if (engineCrashCounts.size > 100) {
    const now = Date.now();
    for (const [key, val] of engineCrashCounts) {
      if (now - val.lastCrash > ENGINE_CRASH_WINDOW_MS * 2) {
        engineCrashCounts.delete(key);
      }
    }
  }
}

export function checkDbPool(): { healthy: boolean; total: number; idle: number; waiting: number } {
  const total = pool.totalCount;
  const idle = pool.idleCount;
  const waiting = pool.waitingCount;
  return { healthy: waiting < 10 && total <= 20, total, idle, waiting };
}

export function startResilienceWatchdog(): void {
  if (watchdogInterval) return;
  serverStartTime = Date.now();
  // Reset tick baseline to now so the first detectEventLoopStall() call measures
  // from watchdog-start, not from module-load — prevents a false-positive "stall"
  // that would otherwise show the full startup time as a stall.
  lastHealthCheckMs = Date.now();
  watchdogInterval = setInterval(runWatchdog, 30_000);
}

export function stopResilienceWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

export function getUptimeMs(): number {
  return Date.now() - serverStartTime;
}

let processHealthy = true;
let lastHealthCheckMs = Date.now();
const HEALTH_CHECK_STALL_MS = 120_000;

function detectEventLoopStall(): boolean {
  const now = Date.now();
  const delta = now - lastHealthCheckMs;
  lastHealthCheckMs = now;
  if (delta > HEALTH_CHECK_STALL_MS) {
    console.error(`[Resilience] EVENT LOOP STALL detected: ${delta}ms since last tick (threshold: ${HEALTH_CHECK_STALL_MS}ms)`);
    return true;
  }
  return false;
}

export function isProcessHealthy(): boolean {
  return processHealthy;
}

export function getResilienceStatus(): {
  memory: ReturnType<typeof getHeapPressure>;
  dbPool: ReturnType<typeof checkDbPool>;
  engineCrashes: Record<string, { count: number; lastCrash: number; throttled: boolean }>;
  registeredCaches: number;
  registeredMaps: Array<{ name: string; size: number; maxSize: number }>;
  uptime: { seconds: number; formatted: string };
  watchdog: { runs: number; emergencyReliefs: number; consecutiveDbFailures: number };
} {
  const crashes: Record<string, any> = {};
  for (const [name, entry] of engineCrashCounts) {
    crashes[name] = { ...entry, throttled: isEngineThrottled(name) };
  }
  const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);
  const h = Math.floor(uptimeSec / 3600);
  const m = Math.floor((uptimeSec % 3600) / 60);
  return {
    memory: getHeapPressure(),
    dbPool: checkDbPool(),
    engineCrashes: crashes,
    registeredCaches: registeredCaches.length,
    registeredMaps: registeredMaps.map(m => ({ name: m.name, size: m.map.size, maxSize: m.maxSize })),
    uptime: { seconds: uptimeSec, formatted: `${h}h ${m}m` },
    watchdog: { runs: totalWatchdogRuns, emergencyReliefs: totalEmergencyReliefs, consecutiveDbFailures },
  };
}
