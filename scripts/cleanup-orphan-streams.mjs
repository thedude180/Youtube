#!/usr/bin/env node
/**
 * Pre-deploy database cleanup.
 * Runs before db:push during deployment to remove stale data that would
 * block schema migrations or cause production bloat.
 *
 * Safe to run repeatedly — each DELETE is a no-op when there is nothing to remove.
 */
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function del(label, sql) {
  const res = await client.query(sql);
  const n = res.rowCount ?? 0;
  console.log(`[cleanup] ${label}: ${n === 0 ? "nothing to do" : `deleted ${n} row(s)`}`);
}

try {
  // 1. Orphan streams — user was deleted but stream row remains
  await del(
    "streams with missing user_id",
    `DELETE FROM streams
     WHERE user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = streams.user_id)`
  );

  // 2. Domain events older than 7 days — already fired, no longer needed
  await del(
    "domain_events older than 7 days",
    `DELETE FROM domain_events WHERE emitted_at < NOW() - INTERVAL '7 days'`
  );

  // 3. Completed / failed jobs older than 7 days
  await del(
    "completed/failed jobs older than 7 days",
    `DELETE FROM jobs
     WHERE status IN ('completed', 'failed')
       AND completed_at < NOW() - INTERVAL '7 days'`
  );

  // 4. Completed / failed intelligent_jobs older than 7 days
  await del(
    "completed/failed intelligent_jobs older than 7 days",
    `DELETE FROM intelligent_jobs
     WHERE status IN ('completed', 'failed')
       AND completed_at < NOW() - INTERVAL '7 days'`
  );

  // 5. Expired cron locks
  await del(
    "expired cron_locks",
    `DELETE FROM cron_locks WHERE expires_at < NOW()`
  );

  console.log("[cleanup] Done.");
} finally {
  await client.end();
}
