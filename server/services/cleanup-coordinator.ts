type CleanupFn = () => void;

const cleanupTasks: Array<{ name: string; fn: CleanupFn; intervalMs: number; lastRun: number }> = [];
let coordinatorInterval: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 60_000;

export function registerCleanup(name: string, fn: CleanupFn, intervalMs: number): void {
  const existing = cleanupTasks.findIndex(t => t.name === name);
  if (existing >= 0) {
    cleanupTasks[existing] = { name, fn, intervalMs, lastRun: Date.now() };
  } else {
    cleanupTasks.push({ name, fn, intervalMs, lastRun: Date.now() });
  }
}

function runCleanups(): void {
  const now = Date.now();
  for (const task of cleanupTasks) {
    if (now - task.lastRun >= task.intervalMs) {
      try {
        task.fn();
      } catch {}
      task.lastRun = now;
    }
  }
}

export function startCleanupCoordinator(): void {
  if (coordinatorInterval) return;
  coordinatorInterval = setInterval(runCleanups, TICK_MS);
}

export function stopCleanupCoordinator(): void {
  if (coordinatorInterval) {
    clearInterval(coordinatorInterval);
    coordinatorInterval = null;
  }
}

export function getCleanupStats(): { tasks: number; names: string[] } {
  return { tasks: cleanupTasks.length, names: cleanupTasks.map(t => t.name) };
}
