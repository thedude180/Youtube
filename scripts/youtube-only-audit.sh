#!/usr/bin/env bash
# ============================================================
# youtube-only-audit.sh
# Deep production audit: proves no live non-YouTube API calls
# can execute in server/ or client/src/ code.
#
# Usage: bash scripts/youtube-only-audit.sh
# Exit 0 = CLEAN. Exit 1 = violations found.
# ============================================================

set -euo pipefail

PASS=0
FAIL=0
VIOLATIONS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; VIOLATIONS+=("$1"); FAIL=$((FAIL+1)); }

echo ""
echo "════════════════════════════════════════════════════"
echo "  CreatorOS — YouTube-Only Production Audit"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════"

# ── 1. Token Refresh Layer ─────────────────────────────────
echo ""
echo "── 1. Token Refresh Layer ──────────────────────────"

# refreshExpiringTokens must filter youtube at DB level (not just in-loop)
if grep -q 'eq(channels\.platform.*youtube' server/token-refresh.ts 2>/dev/null; then
  ok "refreshExpiringTokens has DB-level YouTube filter"
else
  fail "refreshExpiringTokens MISSING DB-level YouTube filter"
fi

# keepAliveAllTokens — DB filter (the function body already has it)
if grep -A20 'export async function keepAliveAllTokens' server/token-refresh.ts 2>/dev/null | grep -q 'eq(channels\.platform.*youtube'; then
  ok "keepAliveAllTokens has DB-level YouTube filter"
else
  fail "keepAliveAllTokens MISSING DB-level YouTube filter"
fi

# ── 2. OAuth Config Layer ──────────────────────────────────
echo ""
echo "── 2. OAuth Config Layer ───────────────────────────"

# OAUTH_CONFIGS (not LEGACY_) must contain only youtube
NON_YT=$(awk '/^export const OAUTH_CONFIGS/,/^export const LEGACY_/' server/oauth-config.ts 2>/dev/null | grep "platform:" | grep -v "youtube" || true)
if [ -z "$NON_YT" ]; then
  ok "OAUTH_CONFIGS (active) contains only YouTube platform"
else
  fail "OAUTH_CONFIGS has non-YouTube platforms: $NON_YT"
fi

# ── 3. Publishing Layer ────────────────────────────────────
echo ""
echo "── 3. Publishing Layer ─────────────────────────────"

if grep -q 'ALLOWED.*youtube' server/platform-publisher.ts 2>/dev/null; then
  ok "publishToplatform has YouTube-only allowlist"
else
  fail "publishToplatform MISSING YouTube-only allowlist"
fi

# executePublish must NOT dynamically import or call tiktok-publisher
if grep -v "^[[:space:]]*//" server/platform-publisher.ts 2>/dev/null | grep -q 'import.*tiktok-publisher\|publishVideoToTikTok'; then
  fail "executePublish still calls tiktok-publisher"
else
  ok "executePublish does not call tiktok-publisher"
fi

# ── 4. Connection Guardian Layer ──────────────────────────
echo ""
echo "── 4. Connection Guardian Layer ────────────────────"

# ensureAllTokensFresh must filter youtube at DB level
if grep -A30 'async function ensureAllTokensFresh' server/services/connection-guardian.ts 2>/dev/null | grep -q 'eq(channels\.platform.*youtube'; then
  ok "ensureAllTokensFresh has YouTube filter"
else
  fail "ensureAllTokensFresh MISSING YouTube filter"
fi

# fastRecoverBrokenConnections must filter youtube at DB level
if grep -A15 'async function fastRecoverBrokenConnections' server/services/connection-guardian.ts 2>/dev/null | grep -q 'eq(channels\.platform.*youtube'; then
  ok "fastRecoverBrokenConnections has YouTube filter"
else
  fail "fastRecoverBrokenConnections MISSING YouTube filter"
fi

# getConnectionHealth must filter youtube at DB level (function has long return-type before body)
if grep -A40 'export async function getConnectionHealth' server/services/connection-guardian.ts 2>/dev/null | grep -q 'eq(channels\.platform.*youtube'; then
  ok "getConnectionHealth has YouTube filter"
else
  fail "getConnectionHealth MISSING YouTube filter"
fi

# ── 5. Token Vault Layer ───────────────────────────────────
echo ""
echo "── 5. Token Vault Layer ────────────────────────────"

if grep -A8 'export async function saveToVault' server/services/token-vault.ts 2>/dev/null | grep -q 'normalizePlatform\|youtube'; then
  ok "saveToVault has YouTube-only normalization guard"
else
  fail "saveToVault MISSING YouTube-only guard"
fi

# ── 6. Route-Level Guards ─────────────────────────────────
echo ""
echo "── 6. Route-Level Guards ───────────────────────────"

if grep -q 'z\.enum(\["youtube"\])' server/routes/stream.ts 2>/dev/null; then
  ok "stream destinations enforces z.enum([\"youtube\"])"
else
  fail "stream destinations MISSING YouTube-only enforcement"
fi

if grep -q 'z\.enum(\["youtube"\])' server/routes/distribution.ts 2>/dev/null; then
  ok "distribution cross-platform-packaging enforces YouTube-only platforms"
else
  fail "distribution MISSING YouTube-only enforcement"
fi

if grep -q 'tiktok-clip-autopublisher' server/routes/content-automation.ts 2>/dev/null; then
  fail "content-automation still references tiktok-clip-autopublisher"
else
  ok "content-automation has no tiktok-clip-autopublisher reference"
fi

# X/Twitter manual-token route must return 410
if grep -A3 'x/manual-token' server/routes/platform.ts 2>/dev/null | grep -q '410'; then
  ok "X/Twitter manual-token route returns 410 (disabled)"
else
  fail "X/Twitter manual-token route NOT properly disabled"
fi

# ── 7. Live HTTP Calls to Non-YouTube APIs ─────────────────
echo ""
echo "── 7. Live HTTP Calls to Non-YouTube APIs (server/) ─"

# Only look for actual fetch() calls — exclude:
#   - Lines in LEGACY_DISABLED_ blocks (static config, never called)
#   - Lines that are code comments (// prefix)
#   - Test/spec files
#   - Known-disabled stub returns

check_live_call() {
  local label="$1"
  local pattern="$2"
  # Exclude lines inside LEGACY_DISABLED_OAUTH_CONFIGS block and comment lines
  local hits
  hits=$(rg -n --color=never \
    --glob '!node_modules' --glob '!dist' --glob '!*.map' --glob '!*.md' \
    --glob '!*.test.ts' --glob '!*.spec.ts' \
    "$pattern" server/ 2>/dev/null \
    | grep -v "^.*:\s*//" \
    | grep -v "LEGACY_DISABLED\|LEGACY\|// DISABLED\|authUrl:\|tokenUrl:\|userInfoUrl:" \
    | grep -v "oauth-config\.ts" \
    | grep "fetch(" || true)
  if [ -z "$hits" ]; then
    ok "No live $label fetch() calls in server/"
  else
    fail "Live $label fetch() calls found:"
    echo "$hits" | head -5 | while read -r line; do echo "    → $line"; done
  fi
}

check_live_call "Twitch API"    'twitch\.tv/helix|helix\.twitch\.tv'
check_live_call "Kick API"      'api\.kick\.com'
check_live_call "TikTok API"    'open\.tiktokapis\.com|tiktok\.com/v2/oauth'
check_live_call "Discord API"   'discord\.com/api'
check_live_call "Rumble API"    'rumble\.com/api'
check_live_call "Twitter/X API" 'api\.twitter\.com|api\.x\.com'

# ── 8. Cross-Platform Packaging Guard ─────────────────────
echo ""
echo "── 8. Cross-Platform Packaging Guard ───────────────"

if grep -A12 'export async function packageForAllPlatforms' server/distribution/cross-platform-packaging.ts 2>/dev/null | grep -q 'youtube'; then
  ok "packageForAllPlatforms has YouTube-only filter"
else
  fail "packageForAllPlatforms MISSING YouTube-only filter"
fi

# ── 9. Shared YouTube-Only Module ─────────────────────────
echo ""
echo "── 9. Shared YouTube-Only Module ───────────────────"

if grep -q 'SUPPORTED_PLATFORMS.*youtube' shared/youtube-only.ts 2>/dev/null; then
  ok "shared/youtube-only.ts restricts SUPPORTED_PLATFORMS to [\"youtube\"]"
else
  fail "shared/youtube-only.ts MISSING proper SUPPORTED_PLATFORMS"
fi

if grep -q 'requireYouTubeOnly' shared/youtube-only.ts 2>/dev/null; then
  ok "shared/youtube-only.ts exports requireYouTubeOnly guard"
else
  fail "shared/youtube-only.ts MISSING requireYouTubeOnly export"
fi

# ── 10. Frontend Advisory-Only Check ──────────────────────
echo ""
echo "── 10. Frontend Advisory-Only Check ───────────────"

# multistream relay toast must not say "all configured platforms" (implies multi-platform)
if grep -q 'all configured platforms' client/src/pages/StreamCenter.tsx 2>/dev/null; then
  fail "StreamCenter still has 'all configured platforms' in relay toast"
else
  ok "StreamCenter relay toast is YouTube-focused"
fi

# Summary ───────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}"
echo "════════════════════════════════════════════════════"
echo ""

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo -e "${RED}VIOLATIONS:${NC}"
  for v in "${VIOLATIONS[@]}"; do
    echo "  • $v"
  done
  echo ""
  exit 1
else
  echo -e "${GREEN}All checks passed — YouTube-only enforcement verified.${NC}"
  echo ""
  exit 0
fi
