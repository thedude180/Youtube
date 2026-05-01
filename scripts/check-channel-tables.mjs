#!/usr/bin/env node
/**
 * check-channel-tables.mjs
 *
 * Schema-driven audit of deleteChannel() in server/storage.ts.
 *
 * Strategy:
 *  1. Query the live database's information_schema to find every table that has
 *     a `channel_id`, `video_id`, or `source_video_id` column (the three FK
 *     patterns that must be cleaned up when a channel is deleted).
 *  2. Parse deleteChannel() in server/storage.ts to extract the table names it
 *     covers (both string arrays and inline SQL template literals).
 *  3. Report any tables found in the DB that are NOT covered by deleteChannel.
 *     These are the dangerous gaps that would leave orphaned rows after a channel
 *     is deleted.
 *
 * Usage:
 *   node scripts/check-channel-tables.mjs
 *
 * Exit codes:
 *   0 — all channel/video/source-video-referencing tables are covered
 *   1 — one or more referencing tables are missing from deleteChannel
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const storagePath = resolve(__dirname, "../server/storage.ts");

// ── 1. Parse deleteChannel() from source ───────────────────────────────────────
const source = readFileSync(storagePath, "utf-8");

const fnMatch = source.match(/async deleteChannel\(id: number\)[\s\S]*?(?=\n  async |\n}$)/);
if (!fnMatch) {
  console.error("ERROR: Could not locate deleteChannel() in server/storage.ts");
  process.exit(1);
}
const fnBody = fnMatch[0];

// Tables referenced in single-quoted JS string arrays: 'table_name'
const quotedMatches = fnBody.matchAll(/'([a-z_]+)'/g);
const coveredTables = new Set([...quotedMatches].map(m => m[1]));

// Tables embedded in raw SQL template literals: DELETE FROM table_name
const sqlMatches = fnBody.matchAll(/DELETE\s+FROM\s+([a-z_]+)\b/gi);
for (const m of sqlMatches) {
  coveredTables.add(m[1].toLowerCase());
}

// ── 2. Query DB for all tables with the FK columns we care about ─────────────
const { default: pg } = await import("pg");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let dbTables;
try {
  const result = await pool.query(`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('channel_id', 'video_id', 'source_video_id')
    ORDER BY table_name
  `);
  dbTables = result.rows.map(r => r.table_name);
} finally {
  await pool.end();
}

// ── 3. Tables to ignore (not orphanable / handled differently) ────────────────
// These tables either:
//  - Are the source tables themselves (videos, channels)
//  - Have CASCADE FK constraints in Postgres that auto-delete when parent is deleted
const IGNORE = new Set([
  "videos",            // deleted directly in deleteChannel via Drizzle
  "channels",          // the target table being deleted
  "content_insights",  // has channel_id FK with onDelete: "cascade" — auto-deleted
  "video_catalog_links", // has channel_id FK with onDelete: "cascade" — auto-deleted
  "token_vault",       // intentionally NOT deleted — channel_id is nulled via UPDATE so
                       // the vault token survives channel deletion as a Layer 3 backup.
                       // Rows remain accessible by (user_id, platform) for token recovery.
]);

// ── 4. Cross-reference ────────────────────────────────────────────────────────
const missing = dbTables.filter(t => !IGNORE.has(t) && !coveredTables.has(t));

console.log("\ndeleteChannel schema-driven audit");
console.log(`  DB tables with channel_id/video_id/source_video_id : ${dbTables.length}`);
console.log(`  Tables covered by deleteChannel                     : ${coveredTables.size}`);
console.log(`  Ignored (self-referential / source tables)          : ${IGNORE.size}`);

if (missing.length > 0) {
  console.error(`\n  ⚠️  MISSING (${missing.length}) — these tables have channel/video FK columns`);
  console.error("  but are NOT covered by deleteChannel():\n");
  for (const t of missing) {
    console.error(`    - ${t}`);
  }
  console.error(
    "\nFAIL: Add DELETE statements for these tables to deleteChannel() in server/storage.ts."
  );
  process.exit(1);
} else {
  console.log(`\n  All ${dbTables.length - IGNORE.size} referencing tables are covered.`);
  console.log("PASS");
  process.exit(0);
}
