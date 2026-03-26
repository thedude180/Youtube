
const SLOTS: Record<string, { max: number; active: number; baseMax: number }> = {
  ai:       { max: 2, active: 0, baseMax: 2 },
  db:       { max: 3, active: 0, baseMax: 3 },
  api:      { max: 2, active: 0, baseMax: 2 },
  heavy:    { max: 3, active: 0, baseMax: 3 },
};

let serverStartedAt = Date.now();
const QUIET_PERIOD_MS = 90_000;
const LOAD_SHED_THRESHOLD = 0.85;

interface LoadSignals {
  activeDbConnections: number;
  maxDbConnections: number;
  pendingAiCalls: number;
  maxPendingAiCalls: number;
}

const loadSignals: LoadSignals = {
  activeDbConnections: 0,
  maxDbConnections: 10,
  pendingAiCalls: 0,
  maxPendingAiCalls: 5,
};

export function reportDbConnectionCount(active: number, max?: number): void {
  loadSignals.activeDbConnections = active;
  if (max !== undefined) loadSignals.maxDbConnections = max;
}

export function reportPendingAiCalls(pending: number, max?: number): void {
  loadSignals.pendingAiCalls = pending;
  if (max !== undefined) loadSignals.maxPendingAiCalls = max;
}

export function getLoadSignals(): LoadSignals {
  return { ...loadSignals };
}

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

function getDbPressure(): number {
  return loadSignals.maxDbConnections > 0
    ? loadSignals.activeDbConnections / loadSignals.maxDbConnections
    : 0;
}

function getAiPressure(): number {
  return loadSignals.maxPendingAiCalls > 0
    ? loadSignals.pendingAiCalls / loadSignals.maxPendingAiCalls
    : 0;
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

function getCompositePressure(): number {
  const memPressure = getMemoryPressure();
  const dbPressure = getDbPressure();
  const aiPressure = getAiPressure();
  const slotUtilization = getOverallUtilization();
  return Math.max(memPressure, dbPressure * 0.9, aiPressure * 0.9, slotUtilization);
}

function adjustLimitsForLoad(): void {
  const composite = getCompositePressure();
  const dbPressure = getDbPressure();
  const aiPressure = getAiPressure();

  for (const [category, slot] of Object.entries(SLOTS)) {
    if (composite > 0.9) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.5));
    } else if (composite > 0.8) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.75));
    } else {
      slot.max = slot.baseMax;
    }

    if (category === "db" && dbPressure > 0.8) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.5));
    }
    if (category === "ai" && aiPressure > 0.8) {
      slot.max = Math.max(1, Math.floor(slot.baseMax * 0.5));
    }
  }
}

export function shouldLoadShed(): boolean {
  return getCompositePressure() > LOAD_SHED_THRESHOLD;
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
    throw new Error(`[ResourceGovernor] ${label} load-shed — system under pressure (composite: ${Math.round(getCompositePressure() * 100)}%)`);
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
  dbPressure: number;
  aiPressure: number;
  compositePressure: number;
  overallUtilization: number;
  loadShedding: boolean;
  inQuietPeriod: boolean;
  loadSignals: LoadSignals;
} {
  adjustLimitsForLoad();
  const slots: Record<string, { active: number; max: number; baseMax: number; utilization: number }> = {};
  for (const [k, v] of Object.entries(SLOTS)) {
    slots[k] = { active: v.active, max: v.max, baseMax: v.baseMax, utilization: Math.round((v.active / v.max) * 100) };
  }
  return {
    slots,
    memoryPressure: Math.round(getMemoryPressure() * 100),
    dbPressure: Math.round(getDbPressure() * 100),
    aiPressure: Math.round(getAiPressure() * 100),
    compositePressure: Math.round(getCompositePressure() * 100),
    overallUtilization: Math.round(getOverallUtilization() * 100),
    loadShedding: shouldLoadShed(),
    inQuietPeriod: inQuietPeriod(),
    loadSignals: { ...loadSignals },
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
