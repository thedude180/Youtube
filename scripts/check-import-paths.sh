#!/usr/bin/env bash
# check-import-paths.sh
#
# Fails if any .ts, .tsx, .js, or .jsx file under server/ or client/ contains
# a double-slash import path such as ".//logger" or '//something' which are
# typos that Node.js silently resolves but break IDEs and type-checking tools.
#
# Exit codes:
#   0 — no malformed import paths found
#   1 — one or more malformed import paths detected

set -euo pipefail

PATTERN='(from\s+['"'"'"]\.?\/\/|import\s+['"'"'"]\.?\/\/)'

echo "Checking for malformed import paths (double-slash) in server/ and client/..."

MATCHES=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -E "$PATTERN" server/ client/ 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo ""
  echo "FAIL: Malformed import paths found:"
  echo "$MATCHES"
  echo ""
  echo "Fix by removing the extra slash (e.g. './/logger' -> './logger')."
  exit 1
fi

echo "PASS: No malformed import paths found."
exit 0
