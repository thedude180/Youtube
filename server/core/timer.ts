/** Returns baseMs ±jitterFactor (default ±20%). */
export function jitter(baseMs: number, factor = 0.2): number {
  return Math.round(baseMs * (1 + (Math.random() * 2 - 1) * factor));
}

/**
 * Recursive setTimeout that re-jitters every cycle.
 * Returns a stop() function. Errors inside fn are swallowed so the loop continues.
 */
export function setJitteredInterval(
  fn: () => Promise<void> | void,
  baseMs: number,
  factor = 0.2,
): () => void {
  let stopped = false;
  let handle: ReturnType<typeof setTimeout>;

  function schedule() {
    handle = setTimeout(async () => {
      if (stopped) return;
      try { await fn(); } catch { /* caller supplies own error handling */ }
      if (!stopped) schedule();
    }, jitter(baseMs, factor));
  }

  schedule();
  return () => { stopped = true; clearTimeout(handle); };
}
