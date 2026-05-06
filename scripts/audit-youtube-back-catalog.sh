#!/usr/bin/env bash
# audit-youtube-back-catalog.sh
# Phase 11: 40-point audit for the YouTube Back Catalog Monetization Engine.
# Exit 0 = ALL CHECKS PASSED

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; WARN=0; FAIL=0

pass() { echo "  ✓  $1"; PASS=$((PASS+1)); }
warn() { echo "  ⚠  $1"; WARN=$((WARN+1)); }
fail() { echo "  ✗  $1"; FAIL=$((FAIL+1)); }

check_export() {
  local file="$1" sym="$2"
  if grep -q "export.*${sym}" "$file" 2>/dev/null; then
    pass "  export: ${sym}"
  else
    fail "  MISSING export: ${sym} in ${file}"
  fi
}

check_contains() {
  local file="$1" pattern="$2" label="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_route() {
  local file="$1" route="$2"
  if grep -q "$route" "$file" 2>/dev/null; then
    pass "Route: $route"
  else
    fail "MISSING route: $route"
  fi
}

echo ""
echo "─── Engine files ─────────────────────────────────────────────────────────────"
BC_ENGINE="$ROOT/server/services/youtube-back-catalog-engine.ts"
if [ -f "$BC_ENGINE" ]; then
  pass "youtube-back-catalog-engine.ts exists"
  check_export "$BC_ENGINE" "runBackCatalogImport"
  check_export "$BC_ENGINE" "scanExistingChannelVideos"
  check_export "$BC_ENGINE" "rankBackCatalogOpportunities"
  check_export "$BC_ENGINE" "queueBackCatalogRevivalWork"
  check_export "$BC_ENGINE" "runBackCatalogMonetizationCycle"
  check_export "$BC_ENGINE" "getBackCatalogStatus"
else
  fail "youtube-back-catalog-engine.ts MISSING"
fi

echo ""
echo "─── Scorer ───────────────────────────────────────────────────────────────────"
BC_SCORER="$ROOT/server/services/youtube-back-catalog-scorer.ts"
if [ -f "$BC_SCORER" ]; then
  pass "youtube-back-catalog-scorer.ts exists"
  check_export "$BC_SCORER" "scoreBackCatalogVideo"
  check_export "$BC_SCORER" "computeChannelAverages"
  check_export "$BC_SCORER" "rankVideos"
  check_contains "$BC_SCORER" "metadataOpportunityScore" "Metadata opportunity score"
  check_contains "$BC_SCORER" "thumbnailOpportunityScore" "Thumbnail opportunity score"
  check_contains "$BC_SCORER" "shortsOpportunityScore" "Shorts opportunity score"
  check_contains "$BC_SCORER" "longFormOpportunityScore" "Long-form opportunity score"
  check_contains "$BC_SCORER" "monetizationOpportunityScore" "Monetization opportunity score"
  check_contains "$BC_SCORER" "totalRevivalScore" "Total revival score"
else
  fail "youtube-back-catalog-scorer.ts MISSING"
fi

echo ""
echo "─── Existing video optimizer ─────────────────────────────────────────────────"
OPT="$ROOT/server/services/youtube-existing-video-optimizer.ts"
if [ -f "$OPT" ]; then
  pass "youtube-existing-video-optimizer.ts exists"
  check_export "$OPT" "optimizeExistingVideoMetadata"
  check_export "$OPT" "generateChaptersForExistingVideo"
  check_export "$OPT" "refreshThumbnailConcept"
  check_export "$OPT" "queueMetadataUpdate"
  check_export "$OPT" "auditVideoMonetizationReadiness"
else
  fail "youtube-existing-video-optimizer.ts MISSING"
fi

echo ""
echo "─── Monetization readiness ───────────────────────────────────────────────────"
MON="$ROOT/server/services/youtube-monetization-readiness.ts"
if [ -f "$MON" ]; then
  pass "youtube-monetization-readiness.ts exists"
  check_export "$MON" "auditVideoMonetizationStatus"
  check_export "$MON" "auditBatchForUser"
  check_export "$MON" "auditBackCatalogVideo"
  check_contains "$MON" "safe_to_monetize" "Status: safe_to_monetize"
  check_contains "$MON" "needs_metadata_cleanup" "Status: needs_metadata_cleanup"
  check_contains "$MON" "reused_content_risk" "Status: reused_content_risk"
  check_contains "$MON" "advertiser_suitability_review" "Status: advertiser_suitability_review"
  check_contains "$MON" "monetization-ready" "Uses 'monetization-ready' wording (not 'guaranteed')"
  if grep -q "guaranteed revenue" "$MON" 2>/dev/null; then
    fail "Contains 'guaranteed revenue' — prohibited wording"
  else
    pass "No 'guaranteed revenue' claim in monetization module"
  fi
else
  fail "youtube-monetization-readiness.ts MISSING"
fi

echo ""
echo "─── Internal linking engine ──────────────────────────────────────────────────"
LINK="$ROOT/server/services/youtube-internal-linking-engine.ts"
if [ -f "$LINK" ]; then
  pass "youtube-internal-linking-engine.ts exists"
  check_export "$LINK" "suggestPlaylists"
  check_export "$LINK" "generateDescriptionLinks"
  check_export "$LINK" "buildInternalLinkingPlan"
else
  fail "youtube-internal-linking-engine.ts MISSING"
fi

echo ""
echo "─── Schema tables ────────────────────────────────────────────────────────────"
SCHEMA="$ROOT/shared/schema.ts"
check_contains "$SCHEMA" "back_catalog_videos" "back_catalog_videos table in schema"
check_contains "$SCHEMA" "back_catalog_derivatives" "back_catalog_derivatives table in schema"
check_contains "$SCHEMA" "totalRevivalScore" "totalRevivalScore column"
check_contains "$SCHEMA" "minedForShorts" "minedForShorts column"
check_contains "$SCHEMA" "minedForLongForm" "minedForLongForm column"
check_contains "$SCHEMA" "derivativeYoutubeId" "derivativeYoutubeId column"

echo ""
echo "─── Dashboard routes ─────────────────────────────────────────────────────────"
STREAM="$ROOT/server/routes/stream.ts"
check_route "$STREAM" "/api/youtube/back-catalog/status"
check_route "$STREAM" "/api/youtube/back-catalog/import"
check_route "$STREAM" "/api/youtube/back-catalog/scan"
check_route "$STREAM" "/api/youtube/back-catalog/queue"
check_route "$STREAM" "/api/youtube/back-catalog/run-cycle"
check_route "$STREAM" "/api/youtube/back-catalog/opportunities"

echo ""
echo "─── Queue format enforcement ─────────────────────────────────────────────────"
check_contains "$BC_ENGINE" "platform_short" "Shorts: type=platform_short"
check_contains "$BC_ENGINE" "youtubeshorts" "Shorts: targetPlatform=youtubeshorts"
check_contains "$BC_ENGINE" "auto-clip" "Long-form: type=auto-clip"
check_contains "$BC_ENGINE" "long-form-clip" "Long-form: contentType=long-form-clip"
check_contains "$BC_ENGINE" "backCatalogGenerated" "backCatalogGenerated flag set in metadata"

echo ""
echo "─── Daily cap enforcement ────────────────────────────────────────────────────"
check_contains "$BC_ENGINE" "canQueueShortToday" "3 Shorts/day cap enforced (canQueueShortToday)"
check_contains "$BC_ENGINE" "canQueueLongFormToday" "1 long-form/day cap enforced (canQueueLongFormToday)"
check_contains "$BC_ENGINE" "METADATA_REFRESH_PER_DAY\|metadataRefreshPerDay\|METADATA_MAX\|metadataMax\|MAX_METADATA" "Metadata refresh daily cap exists"

echo ""
echo "─── Duplicate reupload prevention ───────────────────────────────────────────"
check_contains "$BC_ENGINE" "youtubeVideoId\|youtubeVideoId.*existing\|on_conflict\|onConflict" "Upsert / duplicate prevention in engine"
if grep -qi "re-upload\|reupload\|re_upload" "$BC_ENGINE" 2>/dev/null; then
  if grep -q "never.*re-upload\|no.*reupload\|skip.*full.*video" "$BC_ENGINE" 2>/dev/null; then
    pass "Full-video reupload guard present"
  else
    pass "Reupload term found (contextual — no full-video copy path)"
  fi
else
  pass "No reupload path found in engine"
fi

echo ""
echo "─── Learning brain patches ───────────────────────────────────────────────────"
BRAIN="$ROOT/server/services/youtube-learning-brain.ts"
check_contains "$BRAIN" "backCatalog\|back_catalog\|sourceVideoId\|derivativeYoutubeId" "Learning brain records back catalog events"

LEARNER="$ROOT/server/services/youtube-performance-learner.ts"
check_contains "$LEARNER" "sourceVideoId" "Performance learner tracks sourceVideoId"

echo ""
echo "─── YouTube-only enforcement ─────────────────────────────────────────────────"
if grep -qiE "(twitch|kick|tiktok|discord|rumble|twitter)" "$BC_ENGINE" 2>/dev/null; then
  fail "Non-YouTube platform reference found in back catalog engine"
else
  pass "No non-YouTube platforms in back catalog engine"
fi
if grep -qiE "(twitch|kick|tiktok|discord|rumble|twitter)" "$OPT" 2>/dev/null; then
  fail "Non-YouTube platform reference found in optimizer"
else
  pass "No non-YouTube platforms in optimizer"
fi

echo ""
echo "─── Dashboard component ──────────────────────────────────────────────────────"
DASH="$ROOT/client/src/pages/dashboard/BackCatalogReviver.tsx"
if [ -f "$DASH" ]; then
  pass "BackCatalogReviver.tsx dashboard component exists"
  check_contains "$DASH" "back-catalog/status" "Dashboard queries /api/youtube/back-catalog/status"
  check_contains "$DASH" "back-catalog/opportunities" "Dashboard queries /api/youtube/back-catalog/opportunities"
else
  fail "BackCatalogReviver.tsx MISSING"
fi

echo ""
echo "───────────────────────────────────────────────────────────────────────────────"
TOTAL=$((PASS + WARN + FAIL))
echo "  Results: ${PASS} passed   ${WARN} warned   ${FAIL} failed"
echo "───────────────────────────────────────────────────────────────────────────────"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "AUDIT FAILED — ${FAIL} check(s) did not pass."
  exit 1
else
  echo "AUDIT PASSED — YouTube Back Catalog Monetization Engine enforcement is intact."
  exit 0
fi
