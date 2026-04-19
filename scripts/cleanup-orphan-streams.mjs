#!/usr/bin/env node
/**
 * Deletes streams whose user_id has no matching row in users.
 * Must run before db:push when adding the streams_user_id_users_id_fk constraint.
 */
import pg from "pg";

const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const count = await client.query(`
    SELECT COUNT(*) AS n
    FROM streams
    WHERE user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = streams.user_id)
  `);
  const n = parseInt(count.rows[0].n, 10);

  if (n === 0) {
    console.log("[cleanup-orphan-streams] No orphan rows — nothing to do.");
  } else {
    const del = await client.query(`
      DELETE FROM streams
      WHERE user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = streams.user_id)
    `);
    console.log(`[cleanup-orphan-streams] Deleted ${del.rowCount} orphan stream(s).`);
  }
} finally {
  await client.end();
}
