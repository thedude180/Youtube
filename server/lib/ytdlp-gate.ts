/**
 * ytdlp-gate.ts
 *
 * Global concurrency gate for ALL yt-dlp subprocess spawns across every service.
 *
 * yt-dlp is a Python process that consumes 150–300 MB of RAM on startup.
 * When vault scraping, section downloads (shorts/long-form publisher),
 * omni-intelligence harvests, and niche-researcher queries all fire at the
 * same time — which happens reliably at T+10–25 min after every boot —
 * the container exceeds its memory limit and is OOM-killed with no log output.
 *
 * Every yt-dlp spawn in every service MUST acquire a slot here before
 * launching a subprocess.  The slot is released automatically in a finally
 * block so it is always returned, even on error or timeout.
 *
 * MAX_CONCURRENT = 1: one yt-dlp process at a time.  Correct and safe.
 * A queued caller waits; it does NOT skip.  Use the memory gate in
 * scrapeTab (container-memory.ts) to SKIP scraping when memory is already
 * high — that is a separate, orthogonal concern.
 */

let _running = 0;
const MAX_CONCURRENT = 1;
const _queue: Array<() => void> = [];

function _release(): void {
  _running--;
  const next = _queue.shift();
  if (next) { _running++; next(); }
}

/**
 * Acquire a yt-dlp execution slot.
 * Returns a release() function you MUST call in a finally block.
 * Blocks (queues) if MAX_CONCURRENT slots are all in use.
 *
 * @example
 *   const release = await acquireYtdlpSlot();
 *   try {
 *     await execFileAsync(ytdlpBin, args, opts);
 *   } finally {
 *     release();
 *   }
 */
export async function acquireYtdlpSlot(): Promise<() => void> {
  if (_running < MAX_CONCURRENT) {
    _running++;
    return _release;
  }
  await new Promise<void>(resolve => _queue.push(resolve));
  _running++;
  return _release;
}

/** Diagnostic — current gate pressure. Safe to call from anywhere. */
export function ytdlpGateStatus(): { running: number; queued: number } {
  return { running: _running, queued: _queue.length };
}
