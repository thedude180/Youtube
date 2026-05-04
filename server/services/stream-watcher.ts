/**
 * Stream Watcher — the always-on autonomous stream monitor.
 *
 * Polls YouTube for live streams across all connected users every 2 minutes.
 * When a stream starts: announces it cross-platform.
 * When a stream ends: triggers the full post-stream pipeline.
 *
 * This is the heartbeat of the "it runs completely on its own" promise.
 */
import { db } from "../core/db.js";
import { channels } from "../../shared/schema/index.js";
import { streamService } from "../features/stream/service.js";
import { setJitteredInterval } from "../lib/timer-utils.js";
import { createLogger } from "../core/logger.js";

const log = createLogger("stream-watcher");

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let stopFn: (() => void) | null = null;

export function startStreamWatcher(): void {
  if (stopFn) return;

  log.info("Stream watcher starting", { intervalMs: POLL_INTERVAL_MS });

  stopFn = setJitteredInterval(async () => {
    try {
      await scanAllUsers();
    } catch (err: any) {
      log.error("Stream watcher scan error", { error: err.message });
    }
  }, POLL_INTERVAL_MS);
}

export function stopStreamWatcher(): void {
  if (stopFn) {
    stopFn();
    stopFn = null;
    log.info("Stream watcher stopped");
  }
}

async function scanAllUsers(): Promise<void> {
  // Find all users with active YouTube channels (have access token)
  const activeYtChannels = await db
    .select({ userId: channels.userId })
    .from(channels)
    .then((rows) => rows.filter((r, i, arr) =>
      // deduplicate userIds
      arr.findIndex((x) => x.userId === r.userId) === i,
    ));

  if (activeYtChannels.length === 0) return;

  log.info("Scanning users for live streams", { count: activeYtChannels.length });

  // Fan out — check all users concurrently with concurrency cap of 5
  const chunks = chunkArray(activeYtChannels, 5);
  for (const chunk of chunks) {
    await Promise.allSettled(
      chunk.map(({ userId }) =>
        streamService.detectAndSync(userId).catch((err) =>
          log.error("detectAndSync failed", { userId, error: err.message }),
        ),
      ),
    );
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
