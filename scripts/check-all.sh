#!/usr/bin/env bash
# check-all.sh
#
# Runs all CI quality gates locally without requiring a commit.
# Executes the same checks in the same order as pre-commit.sh:
#   1. Import paths   — blocks double-slash typos in TypeScript imports
#   2. Channel tables — validates DB channel table structure
#   3. Deploy size    — flags oversized deployment bundles
#   4. Drizzle sync   — ensures schema.ts changes have a matching drizzle-kit snapshot

set -euo pipefail

echo "Running all quality checks..."

bash scripts/check-import-paths.sh
node scripts/check-channel-tables.mjs
bash scripts/check-deploy-size.sh
bash scripts/check-drizzle-sync.sh

echo "All quality checks passed."
