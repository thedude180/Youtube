#!/bin/bash
set -e

echo "=== CreatorOS Production Build ==="
echo ""

echo "[1/4] Building client + server..."
npx tsx script/build.ts 2>&1 | grep -v "^syncing to GitHub" | grep -v "^=== GitHub" | grep -v "^Pushing" | grep -v "^PASS: Pushed" | grep -v "^No changes"

echo ""
echo "[2/4] Pruning dev dependencies..."
npm prune --omit=dev 2>&1 | tail -3

echo ""
echo "[3/4] Removing client-only packages (already bundled in dist/)..."
CLIENT_ONLY_PKGS=(
  react-icons lucide-react recharts
  @radix-ui react-dom react @tanstack
  framer-motion react-resizable-panels react-i18next
  react-hook-form react-day-picker wouter vaul
  tailwind-merge input-otp i18next embla-carousel-react
  cmdk clsx class-variance-authority sonner
  @hookform caniuse-lite @rollup
)

SAVED=0
for pkg in "${CLIENT_ONLY_PKGS[@]}"; do
  if [ -d "node_modules/$pkg" ]; then
    sz=$(du -sk "node_modules/$pkg" 2>/dev/null | awk '{print $1}')
    rm -rf "node_modules/$pkg"
    SAVED=$((SAVED + sz))
  fi
done
SAVED_MB=$((SAVED / 1024))
echo "  Removed ${SAVED_MB}MB of client-only packages"

echo ""
echo "[4/4] Final size check..."
NM_SIZE=$(du -sm node_modules/ 2>/dev/null | awk '{print $1}')
DIST_SIZE=$(du -sm dist/ 2>/dev/null | awk '{print $1}')
MIG_SIZE=$(du -sm migrations/ 2>/dev/null | awk '{print $1}')
TOTAL=$((NM_SIZE + DIST_SIZE + MIG_SIZE))
echo "  node_modules/: ${NM_SIZE}MB"
echo "  dist/: ${DIST_SIZE}MB"
echo "  migrations/: ${MIG_SIZE}MB"
echo "  TOTAL: ${TOTAL}MB"
echo ""

if [ "$TOTAL" -gt 512 ]; then
  echo "WARN: Deploy size ${TOTAL}MB — still large"
elif [ "$TOTAL" -gt 256 ]; then
  echo "PASS: Deploy size ${TOTAL}MB — within limits"
else
  echo "PASS: Deploy size ${TOTAL}MB — lean"
fi
