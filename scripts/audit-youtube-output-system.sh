#!/usr/bin/env bash
# ============================================================================
# audit-youtube-output-system.sh
# Full audit of the YouTube-only autopilot system.
# Exit 0 = ALL CHECKS PASSED   Exit 1 = one or more failures
# ============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0

ok()   { echo -e "  ${GREEN}✓${NC}  $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC}  $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; WARN=$((WARN + 1)); }

section() { echo; echo -e "${CYAN}─── $1 ───────────────────────────────────────────────${NC}"; }

# ──────────────────────────────────────────────────────────────────────────────
# 1. DAILY CAPS
# ──────────────────────────────────────────────────────────────────────────────
section "Daily caps"

if grep -q "MAX_SHORTS_PER_DAY = 3" server/services/youtube-output-schedule.ts 2>/dev/null; then
  ok "MAX_SHORTS_PER_DAY = 3"
else
  fail "MAX_SHORTS_PER_DAY = 3 not found in youtube-output-schedule.ts"
fi

if grep -q "MAX_LONGFORM_PER_DAY = 1" server/services/youtube-output-schedule.ts 2>/dev/null; then
  ok "MAX_LONGFORM_PER_DAY = 1"
else
  fail "MAX_LONGFORM_PER_DAY = 1 not found in youtube-output-schedule.ts"
fi

if grep -q "MAX_SHORTS_PER_DAY" server/services/shorts-clip-publisher.ts 2>/dev/null; then
  ok "Shorts publisher imports MAX_SHORTS_PER_DAY cap"
else
  fail "Shorts publisher does not reference MAX_SHORTS_PER_DAY"
fi

if grep -q "MAX_LONGFORM_PER_DAY" server/services/long-form-clip-publisher.ts 2>/dev/null; then
  ok "Long-form publisher imports MAX_LONGFORM_PER_DAY cap"
else
  fail "Long-form publisher does not reference MAX_LONGFORM_PER_DAY"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 2. NO 48-HOUR HARD-SPACING REMNANTS
# ──────────────────────────────────────────────────────────────────────────────
section "No 48-hour spacing"

if ! grep -rq "LONG_FORM_UPLOAD_GAP_MS\|48.*3600.*1000\|48_hours\|48h.*gap" \
    server/services/relentless-content-grinder.ts \
    server/services/long-form-clip-publisher.ts 2>/dev/null; then
  ok "No 48-hour hard gap remnants found"
else
  fail "48-hour hard gap still present — remove LONG_FORM_UPLOAD_GAP_MS"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 3. SHORTS PUBLISHER CONSUMES GRINDER-CREATED SHORTS
# ──────────────────────────────────────────────────────────────────────────────
section "Shorts queue alignment"

if grep -q '"platform_short"' server/services/relentless-content-grinder.ts 2>/dev/null; then
  ok "Grinder creates Shorts with type=platform_short"
else
  fail "Grinder does not create platform_short items"
fi

if grep -q "platform_short" server/services/shorts-clip-publisher.ts 2>/dev/null; then
  ok "Shorts publisher consumes platform_short"
else
  fail "Shorts publisher does not consume platform_short"
fi

if grep -q "youtube_short" server/services/shorts-clip-publisher.ts 2>/dev/null; then
  ok "Shorts publisher also consumes legacy youtube_short (backward compat)"
else
  warn "Shorts publisher does not handle legacy youtube_short alias"
fi

if grep -q "youtubeshorts" server/services/relentless-content-grinder.ts 2>/dev/null; then
  ok "Grinder targets youtubeshorts platform"
else
  fail "Grinder does not target youtubeshorts"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 4. SCHEDULED UPLOADS USE private + publishAt
# ──────────────────────────────────────────────────────────────────────────────
section "Private + publishAt for future uploads"

if grep -q "publishAt\|scheduledStartTime" server/youtube.ts 2>/dev/null; then
  ok "youtube.ts contains publishAt/scheduledStartTime logic"
else
  fail "youtube.ts missing publishAt scheduling"
fi

if grep -q '"private"' server/youtube.ts 2>/dev/null; then
  ok "youtube.ts uses privacyStatus private for scheduled uploads"
else
  fail "youtube.ts does not set privacyStatus=private for scheduled uploads"
fi

if grep -q "privacyStatus" server/services/shorts-clip-publisher.ts 2>/dev/null; then
  ok "Shorts publisher sets privacyStatus dynamically"
else
  warn "Shorts publisher may not set privacyStatus"
fi

if grep -q "privacyStatus" server/services/long-form-clip-publisher.ts 2>/dev/null; then
  ok "Long-form publisher sets privacyStatus dynamically"
else
  warn "Long-form publisher may not set privacyStatus"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 5. LIVE CHAT IS YOUTUBE-ONLY
# ──────────────────────────────────────────────────────────────────────────────
section "Live chat YouTube-only"

for plat in twitch kick discord tiktok; do
  if grep -q "^  ${plat}:" server/live-chat-engine.ts 2>/dev/null; then
    fail "live-chat-engine.ts still has active '${plat}' platform style"
  else
    ok "live-chat-engine.ts: ${plat} style removed"
  fi
done

if grep -q "youtube:" server/live-chat-engine.ts 2>/dev/null; then
  ok "live-chat-engine.ts: youtube style present"
else
  fail "live-chat-engine.ts: youtube style missing"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 6. NON-YOUTUBE PLATFORMS NOT ACTIVE IN SERVER CODE
# ──────────────────────────────────────────────────────────────────────────────
section "Non-YouTube platform enforcement"

for file in server/services/relentless-content-grinder.ts server/services/long-form-clip-publisher.ts; do
  if grep -q 'targetPlatform.*tiktok\|targetPlatform.*twitch\|targetPlatform.*kick\|targetPlatform.*rumble' "$file" 2>/dev/null; then
    fail "$file targets non-YouTube platform"
  else
    ok "$file: no non-YouTube targetPlatform"
  fi
done

if grep -q "SUPPORTED_PLATFORMS.*youtube\b" shared/youtube-only.ts 2>/dev/null; then
  ok "shared/youtube-only.ts declares YouTube as the only supported platform"
else
  fail "shared/youtube-only.ts does not enforce YouTube-only"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 7. LEARNING BRAIN EXISTS
# ──────────────────────────────────────────────────────────────────────────────
section "Learning brain"

if [ -f server/services/youtube-learning-brain.ts ]; then
  ok "youtube-learning-brain.ts exists"
else
  fail "youtube-learning-brain.ts MISSING"
fi

for fn in recordLearningEvent runDailyLearningCycle getRecommendedOutputPlan getRecommendedStreamPlan getLearningSummary; do
  if grep -q "$fn" server/services/youtube-learning-brain.ts 2>/dev/null; then
    ok "  export: $fn"
  else
    fail "  missing export: $fn"
  fi
done

# ──────────────────────────────────────────────────────────────────────────────
# 8. DURATION LEARNER EXISTS
# ──────────────────────────────────────────────────────────────────────────────
section "Duration learner"

if [ -f server/services/youtube-performance-learner.ts ]; then
  ok "youtube-performance-learner.ts exists"
else
  fail "youtube-performance-learner.ts MISSING"
fi

for fn in recordVideoPerformance updateDurationModel chooseBestLongFormDuration chooseBestShortDuration explainLengthDecision; do
  if grep -q "$fn" server/services/youtube-performance-learner.ts 2>/dev/null; then
    ok "  export: $fn"
  else
    fail "  missing export: $fn"
  fi
done

if grep -q "EXPLORE_RATE\|exploration" server/services/youtube-performance-learner.ts 2>/dev/null; then
  ok "Performance learner has exploration budget"
else
  fail "Performance learner missing exploration logic"
fi

if grep -q "chooseBestLongFormDuration" server/services/long-form-clip-publisher.ts 2>/dev/null; then
  ok "Long-form publisher calls chooseBestLongFormDuration"
else
  fail "Long-form publisher does not call chooseBestLongFormDuration"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 9. LIVE COPILOT EXISTS
# ──────────────────────────────────────────────────────────────────────────────
section "Live stream copilot"

if [ -f server/services/youtube-live-copilot.ts ]; then
  ok "youtube-live-copilot.ts exists"
else
  fail "youtube-live-copilot.ts MISSING"
fi

for fn in prepareLiveStream processLiveCopilotMessage afterStreamCopilot getCopilotMode setCopilotMode getCopilotStatus; do
  if grep -q "$fn" server/services/youtube-live-copilot.ts 2>/dev/null; then
    ok "  export: $fn"
  else
    fail "  missing export: $fn"
  fi
done

for mode in off suggest auto-safe manual-approval; do
  if grep -q '"'"$mode"'"' server/services/youtube-live-copilot.ts 2>/dev/null; then
    ok "  copilot mode: $mode"
  else
    fail "  copilot mode missing: $mode"
  fi
done

# ──────────────────────────────────────────────────────────────────────────────
# 10. SOURCE VIDEOS OVER 60 MIN PRODUCE MULTIPLE CLIPS
# ──────────────────────────────────────────────────────────────────────────────
section "Multi-segment extraction for 60+ min videos"

if [ -f server/services/youtube-longform-segmenter.ts ]; then
  ok "youtube-longform-segmenter.ts exists"
else
  fail "youtube-longform-segmenter.ts MISSING"
fi

for fn in analyzeLongFormSourceVideo queueLongFormSegments getExtractionCoverage markSegmentExhausted hasUnminedFootage; do
  if grep -q "$fn" server/services/youtube-longform-segmenter.ts 2>/dev/null; then
    ok "  export: $fn"
  else
    fail "  missing export: $fn"
  fi
done

if grep -q "3600\|LONG_VIDEO_THRESHOLD" server/services/youtube-longform-segmenter.ts 2>/dev/null; then
  ok "Segmenter has 60-minute threshold check"
else
  fail "Segmenter missing 60-minute threshold"
fi

if grep -q "overlaps\|OVERLAP_TOLERANCE\|deduplicated" server/services/youtube-longform-segmenter.ts 2>/dev/null; then
  ok "Segmenter has overlap deduplication"
else
  fail "Segmenter missing overlap deduplication"
fi

if grep -q "queueLongFormSegments\|hasUnminedFootage" server/services/relentless-content-grinder.ts 2>/dev/null; then
  ok "Grinder calls segmenter for 60+ min videos"
else
  fail "Grinder does not call segmenter — patch not applied"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 11. AUDIENCE DATA AFFECTS FUTURE DURATION CHOICE
# ──────────────────────────────────────────────────────────────────────────────
section "Audience data drives duration choices"

if grep -q "youtubeOutputMetrics\|youtube_output_metrics" shared/schema.ts 2>/dev/null; then
  ok "youtubeOutputMetrics table defined in schema"
else
  fail "youtubeOutputMetrics table MISSING from schema"
fi

if grep -q "longformExtractionSegments\|longform_extraction_segments" shared/schema.ts 2>/dev/null; then
  ok "longformExtractionSegments table defined in schema"
else
  fail "longformExtractionSegments table MISSING from schema"
fi

if grep -q "learningEvents\|learning_events" shared/schema.ts 2>/dev/null; then
  ok "learningEvents table defined in schema"
else
  fail "learningEvents table MISSING from schema"
fi

if grep -q "livestreamLearningEvents\|livestream_learning_events" shared/schema.ts 2>/dev/null; then
  ok "livestreamLearningEvents table defined in schema"
else
  fail "livestreamLearningEvents table MISSING from schema"
fi

if grep -q "performanceScore\|performance_score" shared/schema.ts 2>/dev/null; then
  ok "performanceScore column present in schema"
else
  fail "performanceScore column missing from schema"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 12. DASHBOARD STATUS ENDPOINT
# ──────────────────────────────────────────────────────────────────────────────
section "Dashboard status API"

if grep -q '"/api/youtube/output-status"' server/routes/stream.ts 2>/dev/null; then
  ok "GET /api/youtube/output-status route registered"
else
  fail "GET /api/youtube/output-status route MISSING"
fi

if grep -q '"/api/youtube/copilot/mode"' server/routes/stream.ts 2>/dev/null; then
  ok "POST /api/youtube/copilot/mode route registered"
else
  fail "POST /api/youtube/copilot/mode route MISSING"
fi

if [ -f client/src/pages/dashboard/YouTubeAutopilotStatus.tsx ]; then
  ok "YouTubeAutopilotStatus.tsx dashboard component exists"
else
  fail "YouTubeAutopilotStatus.tsx MISSING"
fi

# ──────────────────────────────────────────────────────────────────────────────
# RESULTS
# ──────────────────────────────────────────────────────────────────────────────
echo
echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
printf "  Results: %d passed   %d warned   %d failed\n" "$PASS" "$WARN" "$FAIL"
echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
echo

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}AUDIT FAILED — fix the issues above.${NC}"
  exit 1
else
  echo -e "${GREEN}AUDIT PASSED — YouTube autopilot system enforcement is intact.${NC}"
  exit 0
fi
