#!/usr/bin/env bash
# check-all.sh
#
# Runs the local production quality gates without requiring a commit.
# Keep this boring and explicit: typecheck, tests, audits, deploy-size, schema sync.

set -euo pipefail

echo "Running all quality checks..."

echo "\n== TypeScript =="
npm run check

echo "\n== Unit tests =="
npm test -- --runInBand 2>/dev/null || npm test

echo "\n== Import paths =="
bash scripts/check-import-paths.sh

echo "\n== Channel table structure =="
node scripts/check-channel-tables.mjs

echo "\n== YouTube-only enforcement =="
bash scripts/youtube-only-audit.sh

echo "\n== Deployment size =="
bash scripts/check-deploy-size.sh

echo "\n== Drizzle schema sync =="
bash scripts/check-drizzle-sync.sh

echo "All quality checks passed."
