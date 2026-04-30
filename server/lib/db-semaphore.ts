/**
 * db-semaphore.ts
 *
 * Global concurrency limiter for database operations.
 * Prevents connection-pool exhaustion when many async callers fire at once.
 *
 * Usage:
 *   import { runWithDbLimit, runInBatches } from "../lib/db-semaphore";
 *
 *   // Single operation:
 *   const result = await runWithDbLimit(() => db.select(...));
 *
 *   // Batch array (replaces Promise.all(items.map(...))):
 *   const results = await runInBatches(items, (item) => db.update(...), 3);
 */

const MAX_CONCURRENT_DB_OPS = 5;

let _active = 0;
const _queue: Array<() => void> = [];

function _acquire(): Promise<void> {
  if (_active < MAX_CONCURRENT_DB_OPS) {
    _active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    _queue.push(resolve);
  });
}

function _release(): void {
  const next = _queue.shift();
  if (next) {
    next();
  } else {
    _active--;
  }
}

/**
 * Run a single DB operation through the global semaphore.
 * At most MAX_CONCURRENT_DB_OPS calls will be in-flight at any moment.
 */
export async function runWithDbLimit<T>(fn: () => Promise<T>): Promise<T> {
  await _acquire();
  try {
    return await fn();
  } finally {
    _release();
  }
}

/**
 * Process an array of items with bounded concurrency instead of
 * Promise.all(items.map(...)) which fires everything at once.
 *
 * @param items    Array to process
 * @param fn       Async function to apply to each item
 * @param limit    Max concurrent operations (default: MAX_CONCURRENT_DB_OPS)
 */
export async function runInBatches<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = MAX_CONCURRENT_DB_OPS,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Run async tasks sequentially — one at a time, in order.
 * Use when ordering matters or parallelism offers no benefit.
 */
export async function runSequentially<T>(
  fns: Array<() => Promise<T>>,
): Promise<T[]> {
  const results: T[] = [];
  for (const fn of fns) {
    results.push(await fn());
  }
  return results;
}
