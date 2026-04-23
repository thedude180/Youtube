#!/bin/bash
set -e

MAX_MB=1500
WARN_MB=1000

echo "=== Deployment Size Check ==="
echo ""

EXCLUDE_DIRS=(
  vault data clips reels recordings streams downloads
  .cache .local .git .upm .config .vscode .replit.nix
  tmp attached_assets screenshots references
  server client shared script scripts
)

DEV_NODE_MODULES=(
  typescript vite @vitejs esbuild @esbuild drizzle-kit tsx
  @types lightningcss-linux-x64-gnu lightningcss-linux-x64-musl
  postcss autoprefixer tailwindcss @tailwindcss @babel rimraf
  @img/sharp-darwin-arm64 @img/sharp-darwin-x64
  @img/sharp-win32-ia32 @img/sharp-win32-x64
  @img/sharp-linuxmusl-arm64 @img/sharp-linuxmusl-x64
  @img/sharp-libvips-linuxmusl-arm64 @img/sharp-libvips-linuxmusl-x64
)

EXCLUDE_ARGS=""
for ex in "${EXCLUDE_DIRS[@]}"; do
  [ -d "$ex" ] && EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./$ex"
done

for pattern in "*.mp4" "*.mkv" "*.webm" "*.avi" "*.mov" "*.mp3" "*.wav" "*.flac" "*.log" "*.md"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$pattern"
done

for bk in .git.backup*; do
  [ -e "$bk" ] && EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./$bk"
done

for devpkg in "${DEV_NODE_MODULES[@]}"; do
  [ -d "node_modules/$devpkg" ] && EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./node_modules/$devpkg"
done

EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./tsconfig.json --exclude=./tailwind.config.ts --exclude=./vite.config.ts"
EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./capacitor.config.ts --exclude=./drizzle.config.ts --exclude=./components.json"
EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./postcss.config.js --exclude=./theme.json"

SIZE_KB=$(du -sk $EXCLUDE_ARGS . 2>/dev/null | tail -1 | awk '{print $1}')
SIZE_MB=$((SIZE_KB / 1024))

echo "Estimated deploy image: ${SIZE_MB}MB (limit: ${MAX_MB}MB, warn: ${WARN_MB}MB)"
echo ""

echo "--- Included in deploy ---"
NM_TOTAL=$(du -sk node_modules/ 2>/dev/null | awk '{print $1}')
DEV_TOTAL=0
for devpkg in "${DEV_NODE_MODULES[@]}"; do
  if [ -d "node_modules/$devpkg" ]; then
    pkg_kb=$(du -sk "node_modules/$devpkg" 2>/dev/null | awk '{print $1}')
    DEV_TOTAL=$((DEV_TOTAL + pkg_kb))
  fi
done
NM_PROD=$((NM_TOTAL - DEV_TOTAL))
NM_PROD_MB=$((NM_PROD / 1024))
DEV_TOTAL_MB=$((DEV_TOTAL / 1024))
echo "  node_modules/ (prod only): ${NM_PROD_MB}MB (${DEV_TOTAL_MB}MB dev excluded)"
for d in dist migrations; do
  if [ -d "$d" ]; then
    D_SIZE=$(du -sk "$d" 2>/dev/null | awk '{print $1}')
    D_MB=$((D_SIZE / 1024))
    echo "  $d/: ${D_MB}MB"
  fi
done
echo ""

echo "--- Excluded by .dockerignore ---"
EXCLUDED_MB=0
for d in vault data clips reels recordings streams downloads .cache .local .git attached_assets screenshots references tmp server client shared script scripts; do
  if [ -d "$d" ]; then
    D_SIZE=$(du -sk "$d" 2>/dev/null | awk '{print $1}')
    D_MB=$((D_SIZE / 1024))
    [ "$D_MB" -gt 0 ] && echo "  $d/: ${D_MB}MB"
    EXCLUDED_MB=$((EXCLUDED_MB + D_MB))
  fi
done
for bk in .git.backup*; do
  if [ -e "$bk" ]; then
    D_SIZE=$(du -sk "$bk" 2>/dev/null | awk '{print $1}')
    D_MB=$((D_SIZE / 1024))
    [ "$D_MB" -gt 0 ] && echo "  $bk: ${D_MB}MB"
    EXCLUDED_MB=$((EXCLUDED_MB + D_MB))
  fi
done
echo "  dev node_modules: ${DEV_TOTAL_MB}MB"
EXCLUDED_MB=$((EXCLUDED_MB + DEV_TOTAL_MB))
echo "  TOTAL excluded: ${EXCLUDED_MB}MB"
echo ""

ISSUES=0

MISSING=""
for critical in vault data clips reels .cache .local .git server/ client/; do
  if ! grep -q "^${critical}" .dockerignore 2>/dev/null; then
    MISSING="$MISSING $critical"
  fi
done
if [ -n "$MISSING" ]; then
  echo "ISSUE: .dockerignore missing critical exclusions:$MISSING"
  ISSUES=$((ISSUES + 1))
fi

STRAY_MEDIA=$(find . -maxdepth 2 \( -name "*.mp4" -o -name "*.mkv" -o -name "*.webm" \) ! -path "./vault/*" ! -path "./node_modules/*" ! -path "./.git/*" ! -path "./clips/*" ! -path "./reels/*" 2>/dev/null | wc -l)
if [ "$STRAY_MEDIA" -gt 0 ]; then
  echo "ISSUE: $STRAY_MEDIA media files found outside vault/"
  ISSUES=$((ISSUES + 1))
fi

echo ""
if [ "$SIZE_MB" -gt "$MAX_MB" ]; then
  echo "FAIL: Deploy size ${SIZE_MB}MB exceeds ${MAX_MB}MB limit"
  echo ""
  echo "Top directories to investigate:"
  du -sk */ .* 2>/dev/null | sort -rn | head -8 | while read kb dir; do
    mb=$((kb / 1024))
    [ "$mb" -gt 5 ] && echo "  $dir: ${mb}MB"
  done
  exit 1
elif [ "$SIZE_MB" -gt "$WARN_MB" ]; then
  echo "WARN: Deploy size ${SIZE_MB}MB approaching limit"
  [ "$ISSUES" -gt 0 ] && echo "($ISSUES issue(s) found above)"
  echo "PASS (with warning)"
  exit 0
else
  echo "PASS: Deploy size ${SIZE_MB}MB — well within limits"
  [ "$ISSUES" -gt 0 ] && echo "($ISSUES issue(s) found above)"
  exit 0
fi
