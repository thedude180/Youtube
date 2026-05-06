#!/usr/bin/env bash
# audit-youtube-ai-orchestrator.sh
# Verifies the YouTube AI Orchestrator is complete and correctly enforced.
set -euo pipefail

PASS=0; WARN=0; FAIL=0
ok()   { echo "  ✓  $*"; PASS=$((PASS+1)); }
warn() { echo "  ⚠  $*"; WARN=$((WARN+1)); }
fail() { echo "  ✗  $*"; FAIL=$((FAIL+1)); }
check() { grep -q "$2" "$3" 2>/dev/null && ok "$1" || fail "$1"; }
nocheck() { grep -v "^\s*//" "$3" 2>/dev/null | grep -q "$2" && fail "$1 (found forbidden pattern)" || ok "$1"; }

ORCH="server/services/youtube-ai-orchestrator.ts"
INDEX="server/index.ts"
AUTO="server/autonomy-controller.ts"

echo "─── Orchestrator file ────────────────────────────────────────────────────────"
[ -f "$ORCH" ] && ok "youtube-ai-orchestrator.ts exists" || fail "youtube-ai-orchestrator.ts MISSING"
check "  export: initYouTubeAIOrchestrator"        "initYouTubeAIOrchestrator"        "$ORCH"
check "  export: stopYouTubeAIOrchestrator"        "stopYouTubeAIOrchestrator"        "$ORCH"
check "  export: runYouTubeAICycle"                "runYouTubeAICycle"                "$ORCH"
check "  export: runYouTubeAIForAllEligibleUsers"  "runYouTubeAIForAllEligibleUsers"  "$ORCH"
check "  export: forceYouTubeAICycle"              "forceYouTubeAICycle"              "$ORCH"
check "  export: getYouTubeAIOrchestratorStatus"   "getYouTubeAIOrchestratorStatus"   "$ORCH"

echo "─── Orchestrator behavior ────────────────────────────────────────────────────"
check "  Calls runBackCatalogImport"               "runBackCatalogImport"             "$ORCH"
check "  Calls queueBackCatalogRevivalWork"        "queueBackCatalogRevivalWork"      "$ORCH"
check "  Calls runDailyLearningCycle"              "runDailyLearningCycle"            "$ORCH"
check "  Calls auditBatchForUser"                  "auditBatchForUser"                "$ORCH"
check "  Checks quota breaker"                     "isQuotaBreakerTripped"            "$ORCH"
check "  Filters platform = youtube"               "platform.*youtube"                "$ORCH"
check "  Skips dev_bypass_user"                    "DEV_BYPASS_USER\|dev_bypass_user" "$ORCH"
check "  Has startup delay"                        "STARTUP_DELAY_MS\|setTimeout"     "$ORCH"
check "  Has light repeat interval"                "LIGHT_CYCLE_MS\|setInterval"      "$ORCH"
check "  Has full daily cycle interval"            "FULL_CYCLE_MS\|fullInterval"      "$ORCH"
check "  Prevents duplicate active cycles"         "activeCycles"                     "$ORCH"
check "  Approval-required rules exist"            "requiresApproval"                 "$ORCH"
check "  Log prefix [YouTubeAI]"                   "YouTubeAI"                        "$ORCH"
check "  Auto-approved: catalog import"            "sync_channel_catalog"             "$ORCH"
check "  Auto-approved: queue revival"             "queue_back_catalog_revival"       "$ORCH"
check "  Auto-approved: learning cycle"            "run_learning_cycle"               "$ORCH"
check "  Daily report generation"                  "generate_daily_report"            "$ORCH"

echo "─── YouTube-only enforcement in orchestrator ─────────────────────────────────"
nocheck "  No TikTok in orchestrator"    "tiktok\|TikTok"         "$ORCH"
nocheck "  No Twitch in orchestrator"    "twitch\|Twitch"         "$ORCH"
nocheck "  No Discord in orchestrator"   "discord\|Discord"       "$ORCH"
nocheck "  No Kick in orchestrator"      "\"kick\"\|'kick'"       "$ORCH"
nocheck "  No Rumble in orchestrator"    "rumble\|Rumble"         "$ORCH"
nocheck "  No bot-evasion language"      "stealth\|shadow.ban\|bot.evas\|evade\|evad" "$ORCH"
nocheck "  No fake engagement language"  "fake.*view\|fake.*like\|fake.*subscriber"    "$ORCH"

echo "─── index.ts wiring ──────────────────────────────────────────────────────────"
check "  Imports initYouTubeAIOrchestrator"   "initYouTubeAIOrchestrator"   "$INDEX"
check "  Calls initYouTubeAIOrchestrator()"   "initYouTubeAIOrchestrator()" "$INDEX"
check "  Calls stopYouTubeAIOrchestrator()"   "stopYouTubeAIOrchestrator()" "$INDEX"

echo "─── Autonomy controller cleanup ──────────────────────────────────────────────"
nocheck "  shadow_ban_detector removed"   "shadow_ban_detector"                             "$AUTO"
nocheck "  Multi-platform policy removed" "TikTok.*Twitch.*Kick\|Kick.*Discord.*Rumble"     "$AUTO"
nocheck "  content_recycler removed"      "\"content_recycler\"\|'content_recycler'"        "$AUTO"

echo "─── Dashboard routes ─────────────────────────────────────────────────────────"
STREAM="server/routes/stream.ts"
check "  GET /ai-orchestrator/status"      "ai-orchestrator/status"      "$STREAM"
check "  POST /ai-orchestrator/run"        "ai-orchestrator/run"         "$STREAM"
check "  POST /ai-orchestrator/pause"      "ai-orchestrator/pause"       "$STREAM"
check "  POST /ai-orchestrator/resume"     "ai-orchestrator/resume"      "$STREAM"
check "  GET /ai-orchestrator/decision-log" "ai-orchestrator/decision-log" "$STREAM"
check "  GET /ai-orchestrator/daily-report" "ai-orchestrator/daily-report" "$STREAM"

echo "───────────────────────────────────────────────────────────────────────────────"
echo "  Results: ${PASS} passed   ${WARN} warned   ${FAIL} failed"
echo "───────────────────────────────────────────────────────────────────────────────"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "AUDIT FAILED — fix the above issues."
  exit 1
else
  echo ""
  echo "AUDIT PASSED — YouTube AI Orchestrator enforcement is intact."
  exit 0
fi
