#!/bin/bash
set -euo pipefail

echo "=== GitHub Sync (manual only) ==="

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
  MSG="CreatorOS manual sync $TIMESTAMP"
fi

git add -A
git commit -m "$MSG" --no-verify 2>/dev/null || true

# If GITHUB_PAT is set, push directly with it. Otherwise use the configured origin.
# Never force-push from this helper. History rewrites must be manual and intentional.
if [ -n "${GITHUB_PAT:-}" ]; then
  REPO_URL="https://x-access-token:${GITHUB_PAT}@github.com/thedude180/Youtube.git"
  echo "Pushing to GitHub (PAT)..."
  if git push "$REPO_URL" HEAD:main 2>&1; then
    HASH=$(git rev-parse --short HEAD)
    echo "PASS: Pushed $HASH to origin/main (PAT)"
  else
    echo "FAIL: Push failed"
    exit 1
  fi
else
  echo "Pushing to GitHub (origin)..."
  if git push origin HEAD:main 2>&1; then
    HASH=$(git rev-parse --short HEAD)
    echo "PASS: Pushed $HASH to origin/main"
  else
    echo "FAIL: Push failed. Pull/rebase first, or set GITHUB_PAT with proper scopes."
    exit 1
  fi
fi
