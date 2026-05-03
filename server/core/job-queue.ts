/**
 * pg-boss job queue — survives restarts, inspectable, per-job retry history.
 * Use this instead of setInterval chains for any work that must not be lost.
 *
 * Usage:
 *   import { queue } from "./job-queue.js";
 *   await queue.send("content.generate", { videoId: 42 });
 *   await queue.work("content.generate", async ({ data }) => { ... });
 */
import PgBoss from "pg-boss";
import { createLogger } from "./logger.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for job queue");

const log = createLogger("job-queue");

export const queue = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
  // Retain completed/failed jobs for 7 days for inspection
  archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
  deleteAfterSeconds: 60 * 60 * 24 * 14,
  monitorStateIntervalSeconds: 30,
  // Keep schema changes non-destructive
  onComplete: false,
});

queue.on("error", (err) => log.error("pg-boss error", err));

let started = false;

export async function startJobQueue(): Promise<void> {
  if (started) return;
  await queue.start();
  started = true;
  log.info("Job queue started");
}

export async function stopJobQueue(): Promise<void> {
  if (!started) return;
  await queue.stop({ graceful: true, timeout: 10_000 });
  started = false;
  log.info("Job queue stopped");
}

/** Convenience: send a job, ignoring duplicate-within-ttl errors. */
export async function enqueue<T extends object>(
  name: string,
  data: T,
  opts?: PgBoss.SendOptions,
): Promise<string | null> {
  return queue.send(name, data, opts ?? {});
}
