/**
 * ytdlp-gate.ts
 *
 * Global concurrency + memory gate for ALL yt-dlp subprocess spawns across every service.
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
 *
 * MEMORY GATE (added): before handing a slot to ANY caller, we also verify
 * the container has at least MIN_SPAWN_HEADROOM_BYTES of free memory.  This
 * catches the case where Node.js's own RSS has grown large (post-startup
 * burst) to the point that one more yt-dlp process would push the container
 * over its cgroup limit and trigger an OOM kill.  Previously this check was
 * only in video-vault; section downloads (shorts-publisher, pre-encoder)
 * bypassed it and could still OOM the container.
 */

import { getContainerMemory, hasSpawnHeadroom, MIN_SPAWN_HEADROOM_BYTES } from "./container-memory";
import { createLogger } from "./logger";

const logger = createLogger("ytdlp-gate");

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
 * Throws if the container does not have enough free memory to safely
 * spawn a yt-dlp subprocess, even after the concurrency slot is free.
 * Callers should catch this and skip/defer the download.
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
  // ── Step 1: concurrency gate ──────────────────────────────────────────────
  if (_running < MAX_CONCURRENT) {
    _running++;
  } else {
    await new Promise<void>(resolve => _queue.push(resolve));
    _running++;
  }

  // ── Step 2: container memory gate ─────────────────────────────────────────
  // We now hold the concurrency slot — no other yt-dlp is running.  Check
  // whether the container has enough headroom to add one more yt-dlp process
  // (150–300 MB).  If not, release the slot immediately and throw so the
  // caller can skip or defer this download instead of OOM-killing the container.
  const mem = getContainerMemory();
  if (!hasSpawnHeadroom(mem)) {
    _release(); // give the slot to the next queued caller, if any
    const freeMB = Math.round(mem.freeBytes / 1024 / 1024);
    const needMB = Math.round(MIN_SPAWN_HEADROOM_BYTES / 1024 / 1024);
    const usedMB = Math.round(mem.usageBytes / 1024 / 1024);
    const limitMB = Math.round(mem.limitBytes / 1024 / 1024);
    logger.warn(
      `[ytdlp-gate] Insufficient container memory for yt-dlp spawn — ` +
      `${freeMB}MB free (need ${needMB}MB), container ${usedMB}/${limitMB}MB used. ` +
      `Skipping this download to prevent OOM.`
    );
    throw new Error(
      `yt-dlp spawn blocked: only ${freeMB}MB free in container (need ${needMB}MB). ` +
      `Download deferred to avoid OOM.`
    );
  }

  return _release;
}

/** Diagnostic — current gate pressure. Safe to call from anywhere. */
export function ytdlpGateStatus(): { running: number; queued: number; containerFreeMB: number } {
  const mem = getContainerMemory();
  return {
    running: _running,
    queued: _queue.length,
    containerFreeMB: Math.round(mem.freeBytes / 1024 / 1024),
  };
}
