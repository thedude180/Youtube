
const SLOTS: Record<string, { max: number; active: number }> = {
  ai:       { max: 2, active: 0 },
  db:       { max: 3, active: 0 },
  api:      { max: 2, active: 0 },
  heavy:    { max: 3, active: 0 },
};

let serverStartedAt = Date.now();
const QUIET_PERIOD_MS = 90_000;

export function setServerStartTime(t: number): void {
  serverStartedAt = t;
}

function inQuietPeriod(): boolean {
  return Date.now() - serverStartedAt < QUIET_PERIOD_MS;
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

  const slot = SLOTS[category];
  if (!slot) return fn();

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

export function getGovernorStats(): Record<string, { active: number; max: number; utilization: string }> {
  return Object.fromEntries(
    Object.entries(SLOTS).map(([k, v]) => [
      k,
      { active: v.active, max: v.max, utilization: `${Math.round((v.active / v.max) * 100)}%` },
    ])
  );
}

export function canRun(category: keyof typeof SLOTS): boolean {
  const slot = SLOTS[category];
  return slot ? slot.active < slot.max : true;
}

export function isQuietPeriod(): boolean {
  return inQuietPeriod();
}
