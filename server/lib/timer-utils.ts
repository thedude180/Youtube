/**
 * timer-utils.ts
 *
 * Human-jitter timers for all background engines.
 *
 * A plain setInterval fires at perfectly regular intervals — easy to detect as
 * a bot pattern and also causes thundering-herd DB / API bursts when many
 * engines align. setJitteredInterval fires each cycle at a randomly varied
 * delay (default ±20%) so the cadence looks organic, spreads load, and avoids
 * synchronized stampedes across services.
 */

/**
 * Returns a base delay randomised by ±jitterFactor.
 * e.g. jitter(60_000, 0.2) → anywhere from 48 000 ms to 72 000 ms.
 */
export function jitter(baseMs: number, jitterFactor = 0.2): number {
  return Math.round(baseMs * (1 + (Math.random() * 2 - 1) * jitterFactor));
}

/**
 * Drop-in replacement for setInterval that jitters every cycle independently.
 * Returns a stop function — call it to cancel all future firings.
 *
 * @param fn          Async or sync function to run each cycle
 * @param baseMs      Base interval in milliseconds
 * @param jitterFactor  Fraction of baseMs to vary by (default 0.2 = ±20%)
 */
export function setJitteredInterval(
  fn: () => Promise<void> | void,
  baseMs: number,
  jitterFactor = 0.2,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  function schedule(): void {
    const delay = jitter(baseMs, jitterFactor);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        await fn();
      } catch {
        // callers supply their own error handling; swallow here so the loop continues
      }
      if (!stopped) schedule();
    }, delay);
  }

  schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
