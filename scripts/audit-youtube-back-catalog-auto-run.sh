#!/usr/bin/env bash
# audit-youtube-back-catalog-auto-run.sh
# Verifies the back catalog runner is correctly wired for autonomous operation.
set -euo pipefail

PASS=0; WARN=0; FAIL=0
ok()   { echo "  ✓  $*"; PASS=$((PASS+1)); }
warn() { echo "  ⚠  $*"; WARN=$((WARN+1)); }
fail() { echo "  ✗  $*"; FAIL=$((FAIL+1)); }
check() { grep -q "$2" "$3" 2>/dev/null && ok "$1" || fail "$1"; }

echo "─── Runner file ──────────────────────────────────────────────────────────────"
RUNNER="server/services/youtube-back-catalog-runner.ts"
[ -f "$RUNNER" ] && ok "youtube-back-catalog-runner.ts exists" || fail "youtube-back-catalog-runner.ts MISSING"
check "  export: initBackCatalogRunner"           "initBackCatalogRunner"           "$RUNNER"
check "  export: runBackCatalogForAllEligibleUsers" "runBackCatalogForAllEligibleUsers" "$RUNNER"
check "  export: stopBackCatalogRunner"           "stopBackCatalogRunner"           "$RUNNER"

echo "─── Runner behavior ──────────────────────────────────────────────────────────"
check "  Calls runBackCatalogMonetizationCycle"   "runBackCatalogMonetizationCycle" "$RUNNER"
check "  Filters platform = youtube"              "platform.*youtube\|youtube.*platform" "$RUNNER"
check "  Skips dev_bypass_user"                   "dev_bypass_user\|DEV_BYPASS_USER" "$RUNNER"
check "  Has startup delay (setTimeout)"          "setTimeout"                      "$RUNNER"
check "  Has daily repeat (setInterval)"          "setInterval"                     "$RUNNER"
check "  Checks quota breaker"                    "isQuotaBreakerTripped"           "$RUNNER"
check "  Skips in test env"                       "NODE_ENV.*test\|test.*NODE_ENV"  "$RUNNER"
check "  Dev gate (ENABLE_BACK_CATALOG_RUNNER)"   "ENABLE_BACK_CATALOG_RUNNER"      "$RUNNER"
check "  Per-user error isolation (catch)"        "catch"                           "$RUNNER"
check "  Clear log prefix [BackCatalogRunner]"    "BackCatalogRunner"               "$RUNNER"

echo "─── index.ts wiring ──────────────────────────────────────────────────────────"
INDEX="server/index.ts"
check "  Imports initBackCatalogRunner"    "initBackCatalogRunner"    "$INDEX"
check "  Calls initBackCatalogRunner()"   "initBackCatalogRunner()"  "$INDEX"
check "  Calls stopBackCatalogRunner()"   "stopBackCatalogRunner()"  "$INDEX"

echo "─── Daily cap enforcement (inside engine, not runner) ────────────────────────"
ENGINE="server/services/youtube-back-catalog-engine.ts"
check "  3 Shorts/day cap"             "canQueueShortToday\|MAX_SHORTS"   "$ENGINE"
check "  1 long-form/day cap"          "canQueueLongFormToday\|MAX_LONG"  "$ENGINE"
check "  10 metadata/day cap"          "METADATA_REFRESH_PER_DAY"         "$ENGINE"

echo "───────────────────────────────────────────────────────────────────────────────"
echo "  Results: ${PASS} passed   ${WARN} warned   ${FAIL} failed"
echo "───────────────────────────────────────────────────────────────────────────────"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "AUDIT FAILED — fix the above issues."
  exit 1
else
  echo ""
  echo "AUDIT PASSED — Back catalog auto-run is correctly wired."
  exit 0
fi
