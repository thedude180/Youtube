#!/usr/bin/env node
/**
 * check-channel-tables.mjs
 *
 * Audits the deleteChannel() function in server/storage.ts to confirm that
 * every table referencing channel_id, video_id, or source_video_id is covered.
 *
 * Usage:
 *   node scripts/check-channel-tables.mjs
 *
 * Exit codes:
 *   0 — all expected tables are present
 *   1 — one or more expected tables are missing from deleteChannel
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const storagePath = resolve(__dirname, "../server/storage.ts");
const source = readFileSync(storagePath, "utf-8");

// Extract the deleteChannel function body
const fnMatch = source.match(/async deleteChannel\(id: number\)[\s\S]*?(?=\n  async |\n}$)/);
if (!fnMatch) {
  console.error("ERROR: Could not locate deleteChannel() in server/storage.ts");
  process.exit(1);
}
const fnBody = fnMatch[0];

// Pull every quoted table name from the function body (single-quoted strings in JS arrays)
const quotedMatches = fnBody.matchAll(/'([a-z_]+)'/g);
const foundTables = new Set([...quotedMatches].map(m => m[1]));

// Also detect table names embedded in raw SQL template literals:
//   sql`DELETE FROM some_table WHERE ...`
const sqlLiteralMatches = fnBody.matchAll(/DELETE\s+FROM\s+([a-z_]+)\b/gi);
for (const m of sqlLiteralMatches) {
  foundTables.add(m[1].toLowerCase());
}

// Also detect tables via sql.identifier pattern (used inside for..of loops)
// These are already covered by the single-quote extraction above.

// Canonical set of tables that MUST appear in deleteChannel.
// Keep this list in sync with the doc-comment in storage.ts.
const REQUIRED_TABLES = new Set([
  // GROUP A — direct channel_id FK
  "compliance_records",
  "growth_strategies",
  "channel_baseline_snapshots",
  "platform_health",
  "compliance_checks",
  "copyright_claims",
  "disclosure_requirements",
  "youtube_push_backlog",
  "creator_credibility_scores",
  "channel_immune_events",
  "source_quality_profiles",
  "archive_master_records",

  // GROUP B — video_id FK
  "playlist_items",
  "ab_tests",
  "comment_responses",
  "comment_sentiments",
  "content_lifecycle",
  "content_pipeline",
  "content_quality_scores",
  "ctr_optimizations",
  "editing_notes",
  "evergreen_classifications",
  "optimization_passes",
  "search_rankings",
  "seo_scores",
  "stream_pipelines",
  "upload_queue",
  "video_versions",
  "schedule_items",
  "content_kanban",
  "compounding_jobs",
  "video_update_history",
  "ab_test_results",

  // GROUP C — dual-column
  "cannibalization_alerts",

  // GROUP D — source_video_id FK
  "autopilot_queue",
  "content_clips",
  "repurposed_content",
  "vod_cuts",
  "content_atoms",
  "clip_queue_items",
  "moment_genome_classifications",

  // GROUP E — clip_id FK
  "clip_virality_scores",

  // GROUP F — thumbnails
  "thumbnails",
]);

let missing = [];
for (const table of REQUIRED_TABLES) {
  if (!foundTables.has(table)) {
    missing.push(table);
  }
}

console.log(`\ndeleteChannel audit — server/storage.ts`);
console.log(`  Required tables : ${REQUIRED_TABLES.size}`);
console.log(`  Found in source : ${foundTables.size}`);

if (missing.length > 0) {
  console.error(`\n  MISSING (${missing.length}):`);
  for (const t of missing) {
    console.error(`    - ${t}`);
  }
  console.error(`\nFAIL: Add DELETE statements for the missing tables to deleteChannel().`);
  process.exit(1);
} else {
  console.log(`\n  All ${REQUIRED_TABLES.size} required tables are covered.`);
  console.log("PASS");
  process.exit(0);
}
