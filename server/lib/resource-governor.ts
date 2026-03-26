
const SLOTS: Record<string, { max: number; active: number; baseMax: number }> = {
  ai:       { max: 2, active: 0, baseMax: 2 },
  db:       { max: 3, active: 0, baseMax: 3 },
  api:      { max: 2, active: 0, baseMax: 2 },
  heavy:    { max: 3, active: 0, baseMax: 3 },
};

let serverStartedAt = Date.now();
const QUIET_PERIOD_MS = 90_000;
const LOAD_SHED_THRESHOLD = 0.85;

export function setServerStartTime(t: number): void {
  serverStartedAt = t;
}

function inQuietPeriod(): boolean {
  return Date.now() - serverStartedAt < QUIET_PERIOD_MS;
}

function getMemoryPressure(): number {
  const usage = process.memoryUsage();
  const heapUsed = usage.heapUsed;
  const heapTotal = usage.heapTotal;
  return heapTotal > 0 ? heapUsed / heapTotal : 0;
}

function getOverallUtilization(): number {
  let totalActive = 0;
  let totalMax = 0;
  for (const slot of Object.values(SLOTS)) {
    totalActive += slot.active;
    totalMax += slot.max;
  }
  return totalMax > 0 ? totalActive / totalMax : 0;
}

function adjustLimitsForLoad(): void {
  const memPressure = getMemoryPressure();
  const utilization = getOverallUtilization();

  for (const [, slot] of Object.entries(SLOTS)) {
    if (memPressure > 0.9) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.5));
    } else if (memPressure > 0.8 || utilization > LOAD_SHED_THRESHOLD) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.75));
    } else {
      slot.max = slot.baseMax;
    }
  }
}

export function shouldLoadShed(): boolean {
  const memPressure = getMemoryPressure();
  const utilization = getOverallUtilization();
  return memPressure > LOAD_SHED_THRESHOLD || utilization > LOAD_SHED_THRESHOLD;
}

export async function withResourceSlot<T>(
  category: keyof typeof SLOTS,
  label: string,
  fn: () => Promise<T>,
  opts: { skipDuringQuiet?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  if (opts.skipDuringQuiet && inQuietPeriod()) {
    throw new Error(`[ResourceGovernor] ${label} skipped — server quiet period`);
  }

  adjustLimitsForLoad();

  const slot = SLOTS[category];
  if (!slot) return fn();

  if (shouldLoadShed() && slot.active >= Math.max(1, Math.floor(slot.max * 0.75))) {
    throw new Error(`[ResourceGovernor] ${label} load-shed — system under pressure (memory: ${Math.round(getMemoryPressure() * 100)}%, utilization: ${Math.round(getOverallUtilization() * 100)}%)`);
  }

  const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : null;

  while (slot.active >= slot.max) {
    if (deadline && Date.now() > deadline) {
      throw new Error(`[ResourceGovernor] ${label} timed out waiting for ${category} slot`);
    }
    await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
  }

  slot.active++;
  try {
    return await fn();
  } finally {
    slot.active--;
  }
}

export function getGovernorStats(): Record<string, { active: number; max: number; baseMax: number; utilization: string }> {
  adjustLimitsForLoad();
  return Object.fromEntries(
    Object.entries(SLOTS).map(([k, v]) => [
      k,
      { active: v.active, max: v.max, baseMax: v.baseMax, utilization: `${Math.round((v.active / v.max) * 100)}%` },
    ])
  );
}

export function getResourceUtilizationSummary(): {
  slots: Record<string, { active: number; max: number; baseMax: number; utilization: number }>;
  memoryPressure: number;
  overallUtilization: number;
  loadShedding: boolean;
  inQuietPeriod: boolean;
} {
  adjustLimitsForLoad();
  const slots: Record<string, { active: number; max: number; baseMax: number; utilization: number }> = {};
  for (const [k, v] of Object.entries(SLOTS)) {
    slots[k] = { active: v.active, max: v.max, baseMax: v.baseMax, utilization: Math.round((v.active / v.max) * 100) };
  }
  return {
    slots,
    memoryPressure: Math.round(getMemoryPressure() * 100),
    overallUtilization: Math.round(getOverallUtilization() * 100),
    loadShedding: shouldLoadShed(),
    inQuietPeriod: inQuietPeriod(),
  };
}

export function canRun(category: keyof typeof SLOTS): boolean {
  adjustLimitsForLoad();
  const slot = SLOTS[category];
  return slot ? slot.active < slot.max : true;
}

export function isQuietPeriod(): boolean {
  return inQuietPeriod();
}
