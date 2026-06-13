/**
 * server/lib/boot-registry.ts
 *
 * Lightweight in-memory registry: service name → actual first-execution timestamp.
 *
 * Services call recordBootStart(name) the moment they execute their first real
 * work (not when setTimeout fires, not when init() is called).  This gives an
 * accurate picture of when services actually converge on CPU/memory/API quota.
 *
 * Convergence detection: if more than 3 services start within a 90-second window
 * a warning is printed to stdout and saved for the /api/admin/boot-registry route
 * so production crash patterns can be traced without trawling deployment logs.
 */

const registry = new Map<string, number>(); // service → epoch-ms of first execution
const convergenceWarnings: string[] = [];    // capped at 30 entries

const CONVERGENCE_WINDOW_MS = 90_000; // 90 seconds
const CONVERGENCE_THRESHOLD  = 3;     // more than this many → warning

export function recordBootStart(service: string): void {
  if (registry.has(service)) return; // first-start only
  const now = Date.now();
  registry.set(service, now);

  // Check how many other services started in the last 90 seconds
  const recentCount = [...registry.values()].filter(t => now - t < CONVERGENCE_WINDOW_MS).length;
  if (recentCount > CONVERGENCE_THRESHOLD) {
    const msg =
      `[BootRegistry] ⚠️  Convergence: ${recentCount} services started within ${CONVERGENCE_WINDOW_MS / 1000}s ` +
      `(latest: ${service})`;
    process.stdout.write(msg + "\n");
    convergenceWarnings.push(`${new Date(now).toISOString()} — ${recentCount} services in 90s, latest: ${service}`);
    if (convergenceWarnings.length > 30) convergenceWarnings.shift();
  }
}

export interface BootRegistryEntry {
  service: string;
  startedAt: number;      // epoch-ms
  startedAtIso: string;   // human-readable
  elapsedSec: number;     // seconds since server process started (if available)
  msSinceLastService: number | null; // gap to previous service start
}

export interface BootRegistrySnapshot {
  processUptimeSec: number;
  services: BootRegistryEntry[];
  convergenceWarnings: string[];
  maxGapMs: number | null;         // largest gap between consecutive service starts
  tightest90sWindow: number;       // most services that started in any 90s window
}

export function getBootRegistrySnapshot(): BootRegistrySnapshot {
  const now = Date.now();
  const uptimeSec = Math.round(process.uptime());

  const sorted = [...registry.entries()]
    .sort((a, b) => a[1] - b[1]);

  const services: BootRegistryEntry[] = sorted.map(([service, startedAt], i) => ({
    service,
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
    elapsedSec: Math.round((now - startedAt) / 1000),
    msSinceLastService: i === 0 ? null : startedAt - sorted[i - 1][1],
  }));

  // Find the tightest 90-second window
  let maxInWindow = 0;
  for (let i = 0; i < sorted.length; i++) {
    const windowEnd = sorted[i][1] + CONVERGENCE_WINDOW_MS;
    const inWindow = sorted.filter(([, t]) => t >= sorted[i][1] && t <= windowEnd).length;
    if (inWindow > maxInWindow) maxInWindow = inWindow;
  }

  const gaps = services.map(s => s.msSinceLastService).filter((g): g is number => g !== null);
  const maxGapMs = gaps.length > 0 ? Math.max(...gaps) : null;

  return {
    processUptimeSec: uptimeSec,
    services,
    convergenceWarnings,
    maxGapMs,
    tightest90sWindow: maxInWindow,
  };
}
