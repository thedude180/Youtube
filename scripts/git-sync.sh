#!/bin/bash
set -e

echo "=== GitHub Sync ==="

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "SKIP: No 'origin' remote configured"
  exit 0
fi

CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -eq 0 ]; then
  echo "No changes to push"
  exit 0
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

if [ -f .local/.commit_message ] && [ -s .local/.commit_message ]; then
  MSG=$(head -1 .local/.commit_message)
else
  MSG="CreatorOS auto-sync $TIMESTAMP"
fi

git add -A
git commit -m "$MSG" --no-verify 2>/dev/null || true

echo "Pushing to GitHub..."
if git push origin main --force 2>&1; then
  HASH=$(git rev-parse --short HEAD)
  echo "PASS: Pushed $HASH to origin/main"
else
  echo "WARN: Push failed — will retry next build"
  exit 0
fi
