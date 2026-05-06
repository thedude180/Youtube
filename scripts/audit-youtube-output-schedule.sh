#!/usr/bin/env bash
# audit-youtube-output-schedule.sh
# Verifies all YouTube output-scheduling enforcement points are intact.
# Exit 0 = CLEAN.  Exit 1 = one or more checks failed.

set -euo pipefail

PASS=0
FAIL=0
RESULTS=()

check() {
  local label="$1"
  local result="$2"   # "pass" | "fail"
  local detail="${3:-}"
  if [[ "$result" == "pass" ]]; then
    RESULTS+=("  ✓  $label")
    PASS=$((PASS + 1))
  else
    RESULTS+=("  ✗  $label${detail:+  ← $detail}")
    FAIL=$((FAIL + 1))
  fi
}

grep_pass() {
  local label="$1"; local pattern="$2"; local file="$3"
  if grep -qP "$pattern" "$file" 2>/dev/null; then
    check "$label" "pass"
  else
    check "$label" "fail" "pattern not found in $file"
  fi
}

grep_absent() {
  local label="$1"; local pattern="$2"; local file="$3"
  if ! grep -qP "$pattern" "$file" 2>/dev/null; then
    check "$label" "pass"
  else
    check "$label" "fail" "forbidden pattern still present in $file"
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   YouTube Output Schedule Audit"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── 1. Scheduler constants ────────────────────────────────────────────────────
grep_pass \
  "MAX_SHORTS_PER_DAY = 3 defined in scheduler" \
  "MAX_SHORTS_PER_DAY\s*=\s*3" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "MAX_LONGFORM_PER_DAY = 1 defined in scheduler" \
  "MAX_LONGFORM_PER_DAY\s*=\s*1" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Shorts window 1 (07:00–09:30) present" \
  "startH:\s*7.*startM:\s*0.*endH:\s*9.*endM:\s*30" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Shorts window 2 (13:00–16:30) present" \
  "startH:\s*13.*startM:\s*0.*endH:\s*16.*endM:\s*30" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Shorts window 3 (20:30–23:00) present" \
  "startH:\s*20.*startM:\s*30.*endH:\s*23.*endM:\s*0" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Long-form window (17:30–19:30) present" \
  "startH:\s*17.*startM:\s*30.*endH:\s*19.*endM:\s*30" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Min Shorts gap = 5.5 h enforced" \
  "MIN_SHORT_GAP_MS\s*=\s*5\.5\s*\*" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Min long-form gap = 20 h enforced" \
  "MIN_LONGFORM_GAP_MS\s*=\s*20\s*\*" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "90-min any-gap constraint present" \
  "MIN_ANY_GAP_MS\s*=\s*90\s*\*" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Jitter 7–28 min present" \
  "JITTER_MIN_MS\s*=\s*7" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Max 4 total/day constraint present" \
  "MAX_TOTAL_PER_DAY\s*=\s*4" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Max 14 days ahead cap present" \
  "MAX_DAYS_AHEAD\s*=\s*14" \
  "server/services/youtube-output-schedule.ts"

grep_pass \
  "Fallback timezone America/Chicago present" \
  "DEFAULT_TZ\s*=\s*['\"]America/Chicago['\"]" \
  "server/services/youtube-output-schedule.ts"

# ── 2. Old 48-hour long-form spacing removed ─────────────────────────────────
grep_absent \
  "48-hour LONG_FORM_UPLOAD_GAP_MS removed from grinder" \
  "LONG_FORM_UPLOAD_GAP_MS\s*=\s*48" \
  "server/services/relentless-content-grinder.ts"

grep_absent \
  "getOptimalLongFormScheduleTime removed from grinder" \
  "async function getOptimalLongFormScheduleTime" \
  "server/services/relentless-content-grinder.ts"

grep_absent \
  "getOptimalClipScheduleTime removed from grinder" \
  "async function getOptimalClipScheduleTime" \
  "server/services/relentless-content-grinder.ts"

# ── 3. Grinder uses new scheduler ────────────────────────────────────────────
grep_pass \
  "Grinder uses getNextShortPublishTime for Shorts" \
  "getNextShortPublishTime\(userId\)" \
  "server/services/relentless-content-grinder.ts"

grep_pass \
  "Grinder uses getNextLongFormPublishTime for long-form" \
  "getNextLongFormPublishTime\(userId\)" \
  "server/services/relentless-content-grinder.ts"

# ── 4. Shorts publisher daily cap ────────────────────────────────────────────
grep_pass \
  "Shorts publisher imports MAX_SHORTS_PER_DAY" \
  "MAX_SHORTS_PER_DAY" \
  "server/services/shorts-clip-publisher.ts"

grep_pass \
  "Shorts publisher enforces daily cap (countUploadedShortsForDate)" \
  "countUploadedShortsForDate" \
  "server/services/shorts-clip-publisher.ts"

grep_pass \
  "Shorts publisher defers when cap reached" \
  "Shorts daily cap.*reached.*deferring" \
  "server/services/shorts-clip-publisher.ts"

# ── 5. Long-form publisher daily cap ─────────────────────────────────────────
grep_pass \
  "Long-form publisher imports MAX_LONGFORM_PER_DAY" \
  "MAX_LONGFORM_PER_DAY" \
  "server/services/long-form-clip-publisher.ts"

grep_pass \
  "Long-form publisher enforces daily cap (countUploadedLongFormForDate)" \
  "countUploadedLongFormForDate" \
  "server/services/long-form-clip-publisher.ts"

grep_pass \
  "Long-form publisher defers when cap reached" \
  "Long-form daily cap.*reached.*deferring" \
  "server/services/long-form-clip-publisher.ts"

# ── 6. Private + publishAt for future scheduled uploads ──────────────────────
grep_pass \
  "Shorts publisher uses private for future scheduledStartTime" \
  "scheduledStartTime.*getTime\(\)\s*>\s*Date\.now\(\)" \
  "server/services/shorts-clip-publisher.ts"

grep_pass \
  "Long-form publisher uses private for future scheduledAt" \
  "lfIsScheduled \? ['\"]private['\"] : ['\"]public['\"]" \
  "server/services/long-form-clip-publisher.ts"

grep_pass \
  "youtube.ts overrides public→private when scheduledStartTime is future" \
  "statusBody\.privacyStatus = ['\"]private['\"]" \
  "server/youtube.ts"

grep_pass \
  "youtube.ts sets publishAt from scheduledStartTime" \
  "statusBody\.publishAt = scheduledDate\.toISOString\(\)" \
  "server/youtube.ts"

grep_pass \
  "youtube.ts validates scheduledStartTime (isNaN guard)" \
  "isNaN\(scheduledDate\.getTime\(\)\)" \
  "server/youtube.ts"

# ── 7. Grinder Shorts type consumed by Shorts publisher ──────────────────────
grep_pass \
  "Grinder queues Shorts as type platform_short" \
  "type:\s*['\"]platform_short['\"]" \
  "server/services/relentless-content-grinder.ts"

grep_pass \
  "Grinder sets targetPlatform youtubeshorts for Shorts" \
  "targetPlatform:\s*['\"]youtubeshorts['\"]" \
  "server/services/relentless-content-grinder.ts"

grep_pass \
  "Shorts publisher accepts platform_short type" \
  "platform_short" \
  "server/services/shorts-clip-publisher.ts"

# ── 8. YouTube-only enforcement intact ───────────────────────────────────────
grep_pass \
  "Shorts publisher rejects non-YouTube platforms" \
  "YouTube-only mode: non-YouTube platform" \
  "server/services/shorts-clip-publisher.ts"

grep_pass \
  "Long-form publisher queries YouTube channels only" \
  "eq\(channels\.platform,\s*['\"]youtube['\"]" \
  "server/services/long-form-clip-publisher.ts"

grep_pass \
  "[YouTubeSchedule] log tag present in shorts publisher" \
  "\[YouTubeSchedule\]" \
  "server/services/shorts-clip-publisher.ts"

grep_pass \
  "[YouTubeSchedule] log tag present in long-form publisher" \
  "\[YouTubeSchedule\]" \
  "server/services/long-form-clip-publisher.ts"

grep_pass \
  "[YouTubeSchedule] log tag present in youtube.ts" \
  "\[YouTubeSchedule\]" \
  "server/youtube.ts"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
for r in "${RESULTS[@]}"; do echo "$r"; done
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "  Results: ${PASS} passed   ${FAIL} failed"
echo "───────────────────────────────────────────────────────────────"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "AUDIT FAILED — fix the items marked ✗ above."
  exit 1
else
  echo "AUDIT PASSED — YouTube output scheduling enforcement is intact."
  exit 0
fi
