#!/bin/bash
set -e

MAX_MB=1500
WARN_MB=1000

echo "=== Deployment Size Check ==="
echo ""

EXCLUDES=(
  vault clips reels recordings streams downloads
  .cache .local .git .upm .config .vscode .replit.nix
  tmp attached_assets screenshots references
)

EXCLUDE_ARGS=""
for ex in "${EXCLUDES[@]}"; do
  if [ -d "$ex" ] || [ -d ".$ex" ]; then
    EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./$ex"
  fi
done

for pattern in "*.mp4" "*.mkv" "*.webm" "*.avi" "*.mov" "*.mp3" "*.wav" "*.flac" "*.log"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$pattern"
done

for bk in .git.backup*; do
  [ -e "$bk" ] && EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=./$bk"
done

SIZE_KB=$(du -sk $EXCLUDE_ARGS . 2>/dev/null | tail -1 | awk '{print $1}')
SIZE_MB=$((SIZE_KB / 1024))

echo "Estimated deploy image: ${SIZE_MB}MB (limit: ${MAX_MB}MB, warn: ${WARN_MB}MB)"
echo ""

echo "--- Included in deploy ---"
for d in node_modules dist migrations; do
  if [ -d "$d" ]; then
    D_SIZE=$(du -sk "$d" 2>/dev/null | awk '{print $1}')
    D_MB=$((D_SIZE / 1024))
    echo "  $d/: ${D_MB}MB"
  fi
done
echo ""

echo "--- Excluded by .dockerignore ---"
EXCLUDED_MB=0
for d in vault clips reels recordings streams downloads .cache .local .git attached_assets screenshots references tmp; do
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
MEDIA_SIZE=$(find . -maxdepth 3 \( -name "*.mp4" -o -name "*.mkv" -o -name "*.webm" -o -name "*.avi" -o -name "*.mov" -o -name "*.mp3" -o -name "*.wav" \) ! -path "./node_modules/*" ! -path "./vault/*" ! -path "./.git/*" 2>/dev/null -exec du -ck {} + 2>/dev/null | tail -1 | awk '{print $1}')
MEDIA_MB=$(( (MEDIA_SIZE + 0) / 1024 ))
[ "$MEDIA_MB" -gt 0 ] && echo "  media files: ${MEDIA_MB}MB"
EXCLUDED_MB=$((EXCLUDED_MB + MEDIA_MB))
echo "  TOTAL excluded: ${EXCLUDED_MB}MB"
echo ""

ISSUES=0

MISSING=""
for critical in vault clips reels recordings streams downloads .cache .local .git; do
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
  echo "ISSUE: $STRAY_MEDIA media files found outside vault/ — add to .dockerignore or move"
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
