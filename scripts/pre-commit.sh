#!/usr/bin/env bash
# pre-commit.sh
#
# Git pre-commit hook logic.  Installed into .git/hooks/pre-commit by
# scripts/install-hooks.sh.
#
# Checks run before every commit:
#   1. Drizzle schema sync — ensures shared/schema.ts changes are accompanied
#      by the corresponding drizzle-kit generate output.
#
# Add additional checks here as new quality gates are introduced.

set -euo pipefail

echo "Running pre-commit checks..."

bash scripts/check-drizzle-sync.sh

echo "All pre-commit checks passed."
