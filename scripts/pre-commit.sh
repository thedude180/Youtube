#!/usr/bin/env bash
# pre-commit.sh
#
# Git pre-commit hook logic.  Installed into .git/hooks/pre-commit by
# scripts/install-hooks.sh.
#
# Checks run before every commit (fastest first so failures are caught early):
#   1. Import paths   — blocks double-slash typos in TypeScript imports
#   2. Channel tables — validates DB channel table structure
#   3. Deploy size    — flags oversized deployment bundles
#   4. Drizzle sync   — ensures schema.ts changes have a matching drizzle-kit snapshot

set -euo pipefail

echo "Running pre-commit checks..."

bash scripts/check-import-paths.sh
node scripts/check-channel-tables.mjs
bash scripts/check-deploy-size.sh
bash scripts/check-drizzle-sync.sh

echo "All pre-commit checks passed."
