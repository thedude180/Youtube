#!/usr/bin/env bash
# check-publisher-routing.sh
#
# Proves that every queue-producer's type/targetPlatform/contentType fields
# are accepted by the correct publisher's query filter.
#
# Checks:
#   1. relentless-content-grinder  → shorts-clip-publisher   (Shorts)
#   2. vod-shorts-loop-engine      → shorts-clip-publisher   (Shorts)
#   3. relentless-content-grinder  → long-form-clip-publisher (Long-form)
#   4. daily-content-engine        → shorts-clip-publisher   (Shorts, fixed)
#   5. daily-content-engine        → long-form-clip-publisher (Long-form, fixed)
#   6. youtube-output-scheduler    → shorts-clip-publisher   (Shorts)
#   7. youtube-output-scheduler    → long-form-clip-publisher (Long-form)
#
# Exit 0 = all routing checks pass.
# Exit 1 = one or more mismatches found.

set -euo pipefail

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; ERRORS+=("$1"); FAIL=$((FAIL + 1)); }

check_grep() {
  local label="$1"
  local pattern="$2"
  local file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label — pattern '$pattern' not found in $file"
  fi
}

check_absent() {
  local label="$1"
  local pattern="$2"
  local file="$3"
  if ! grep -qE "$pattern" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label — forbidden pattern '$pattern' still present in $file"
  fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Publisher Routing Audit"
echo "════════════════════════════════════════════════════════"

# ── Reference files ───────────────────────────────────────────────────────────
GRINDER="server/services/relentless-content-grinder.ts"
VOD_LOOP="server/vod-shorts-loop-engine.ts"
DAILY="server/daily-content-engine.ts"
SCHEDULER="server/services/youtube-output-scheduler.ts"
SHORTS_PUB="server/services/shorts-clip-publisher.ts"
LONG_PUB="server/services/long-form-clip-publisher.ts"

echo ""
echo "── 1. shorts-clip-publisher accepted types ──────────────"
check_grep \
  "Publisher picks up platform_short" \
  '"platform_short"' \
  "$SHORTS_PUB"
check_grep \
  "Publisher picks up youtube_short" \
  '"youtube_short"' \
  "$SHORTS_PUB"
check_grep \
  "Publisher accepts youtubeshorts targetPlatform" \
  'youtubeshorts' \
  "$SHORTS_PUB"

echo ""
echo "── 2. long-form-clip-publisher accepted types ───────────"
check_grep \
  "Publisher picks up type=auto-clip" \
  "type.*auto-clip|auto-clip.*type" \
  "$LONG_PUB"
check_grep \
  "Publisher picks up contentType=long-form-clip" \
  "long-form-clip" \
  "$LONG_PUB"

echo ""
echo "── 3. relentless-content-grinder → shorts-clip-publisher ─"
check_grep \
  "Grinder Shorts: type=platform_short" \
  'type:.*"platform_short"' \
  "$GRINDER"
check_grep \
  "Grinder Shorts: targetPlatform=youtubeshorts" \
  'targetPlatform:.*"youtubeshorts"' \
  "$GRINDER"
check_grep \
  "Grinder Shorts: contentType=platform_short" \
  'contentType:.*"platform_short"' \
  "$GRINDER"
check_grep \
  "Grinder Shorts: metadata uses startSec (not segmentStartSec)" \
  'startSec: moment\.startSec' \
  "$GRINDER"
check_absent \
  "Grinder Shorts: old type=auto-clip for Shorts gone" \
  'type:.*"auto-clip".*\n.*targetPlatform:.*"youtube".*\n.*contentType.*youtube-short' \
  "$GRINDER"

echo ""
echo "── 4. relentless-content-grinder → long-form-clip-publisher ─"
check_grep \
  "Grinder long-form: contentType=long-form-clip" \
  'contentType:.*"long-form-clip"' \
  "$GRINDER"
check_grep \
  "Grinder long-form: uses segmentStartSec" \
  'segmentStartSec' \
  "$GRINDER"
check_grep \
  "Grinder long-form: uses segmentEndSec" \
  'segmentEndSec' \
  "$GRINDER"

echo ""
echo "── 5. vod-shorts-loop-engine → shorts-clip-publisher ───────"
check_grep \
  "VOD-loop Shorts: type=platform_short" \
  'type:.*"platform_short"' \
  "$VOD_LOOP"
check_grep \
  "VOD-loop Shorts: contentType=platform_short" \
  'contentType:.*"platform_short"' \
  "$VOD_LOOP"

echo ""
echo "── 6. daily-content-engine → shorts-clip-publisher ─────────"
check_grep \
  "Daily engine Shorts: type=youtube_short" \
  'type:.*"youtube_short"' \
  "$DAILY"
check_grep \
  "Daily engine Shorts: has startSec field" \
  'startSec:.*\* 60' \
  "$DAILY"
check_absent \
  "Daily engine Shorts: old type=auto-clip for Shorts gone" \
  'type:.*"auto-clip".*(\n.*){0,3}contentType.*youtube-short' \
  "$DAILY"

echo ""
echo "── 7. daily-content-engine → long-form-clip-publisher ──────"
check_grep \
  "Daily engine long-form: contentType=long-form-clip" \
  'contentType:.*"long-form-clip"' \
  "$DAILY"
check_grep \
  "Daily engine long-form: segmentStartSec in metadata" \
  'segmentStartSec:' \
  "$DAILY"
check_grep \
  "Daily engine long-form: segmentEndSec in metadata" \
  'segmentEndSec:' \
  "$DAILY"

echo ""
echo "── 8. youtube-output-scheduler → publishers ─────────────────"
check_grep \
  "Scheduler long-form: contentType=long-form-clip" \
  'contentType:.*"long-form-clip"' \
  "$SCHEDULER"
check_grep \
  "Scheduler Shorts: type=youtube_short" \
  'type:.*"youtube_short"' \
  "$SCHEDULER"
check_grep \
  "Scheduler Shorts: startSec/endSec in metadata" \
  'startSec,' \
  "$SCHEDULER"

echo ""
echo "── 9. publisher YouTube-only guards intact ───────────────────"
check_grep \
  "Shorts publisher skips non-YouTube platforms" \
  'platform.*!==.*"youtube".*&&.*platform.*!==.*"youtubeshorts"' \
  "$SHORTS_PUB"
check_grep \
  "Long-form publisher only fetches YouTube channels" \
  'channels\.platform.*"youtube"' \
  "$LONG_PUB"

echo ""
echo "════════════════════════════════════════════════════════"
printf "  Results: %d passed  %d failed\n" "$PASS" "$FAIL"
echo "════════════════════════════════════════════════════════"

if [ "${#ERRORS[@]}" -gt 0 ]; then
  echo ""
  echo "  Failed checks:"
  for e in "${ERRORS[@]}"; do
    echo "    • $e"
  done
  echo ""
  exit 1
fi

echo ""
echo "All routing checks passed."
echo ""
