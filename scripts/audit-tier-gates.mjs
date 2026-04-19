#!/usr/bin/env node
/**
 * audit-tier-gates.mjs
 * Scans server/routes for requireAuth calls in paid-feature route files.
 * Alerts on any new requireAuth usage in content.ts, money.ts, stream.ts, ai.ts
 * that is NOT on a known-safe (non-paid-feature) path.
 *
 * Usage: node scripts/audit-tier-gates.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const FILES_TO_AUDIT = [
  "server/routes/content.ts",
  "server/routes/money.ts",
  "server/routes/stream.ts",
  "server/routes/ai.ts",
];

// Lines whose requireAuth usage is intentional (not a paid-feature gate)
const KNOWN_SAFE_PATTERNS = [
  "/api/auto-connect-youtube",          // dev-only, blocked in production
  "api.jobs.list.path",                 // internal job worker
  "api.jobs.create.path",               // internal job worker
  "api.dashboard.stats.path",           // universal - all tiers
  "api.auditLogs.list.path",            // universal - all tiers
  "/api/notifications/subscribe",       // push notification prefs - universal
  "/api/stripe/",                       // billing infrastructure
  "/api/billing/",                      // billing infrastructure
  "/api/affiliate-links",               // billing infrastructure
  // FREE_AI_ROUTES whitelist (routes.ts) — explicitly whitelisted for free tier
  "/api/ai/content-ideas",              // free tier AI feature
  "/api/ai/dashboard-actions",          // free tier AI feature
  "/api/ai/advisor",                    // free tier AI feature
  "/api/ai/daily-briefing",             // free tier AI feature
  "/api/ai/health-score",               // free tier AI feature
];

let totalViolations = 0;

for (const relPath of FILES_TO_AUDIT) {
  const fullPath = path.join(ROOT, relPath);
  let source;
  try {
    source = readFileSync(fullPath, "utf8");
  } catch {
    console.warn(`[SKIP] Cannot read ${relPath}`);
    continue;
  }

  const lines = source.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("requireAuth(req, res)")) continue;

    // Look back up to 20 lines for the route definition
    const contextStart = Math.max(0, i - 20);
    const context = lines.slice(contextStart, i + 1).join("\n");

    const isSafe = KNOWN_SAFE_PATTERNS.some((pat) => context.includes(pat));
    if (!isSafe) {
      violations.push({ lineNum: i + 1, line: line.trim() });
    }
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${relPath}: ${violations.length} potential tier-bypass(es):`);
    for (const v of violations) {
      console.error(`   Line ${v.lineNum}: ${v.line}`);
    }
    totalViolations += violations.length;
  } else {
    console.log(`✅ ${relPath}: all paid-feature routes are tier-gated`);
  }
}

console.log("");
if (totalViolations > 0) {
  console.error(`FAIL: ${totalViolations} route(s) use requireAuth instead of requireTier in paid-feature files.`);
  console.error("Replace with: await requireTier(req, res, \"<tier>\", \"<Feature Label>\")");
  process.exit(1);
} else {
  console.log("PASS: All paid-feature routes in audited files use requireTier.");
  process.exit(0);
}
