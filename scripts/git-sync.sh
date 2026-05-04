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

# If GITHUB_PAT is set, push directly with it (required for workflow scope).
# Otherwise fall back to the configured origin remote (OAuth app, no workflow scope).
if [ -n "${GITHUB_PAT:-}" ]; then
  REPO_URL="https://x-access-token:${GITHUB_PAT}@github.com/thedude180/Youtube.git"
  echo "Pushing to GitHub (PAT)..."
  if git push "$REPO_URL" main 2>&1; then
    HASH=$(git rev-parse --short HEAD)
    echo "PASS: Pushed $HASH to origin/main (PAT)"
  else
    echo "WARN: Push failed — will retry next build"
    exit 0
  fi
else
  echo "Pushing to GitHub (OAuth — workflow files may be blocked)..."
  if git push origin main --force 2>&1; then
    HASH=$(git rev-parse --short HEAD)
    echo "PASS: Pushed $HASH to origin/main"
  else
    echo "WARN: Push failed (hint: set GITHUB_PAT secret with repo+workflow scopes)"
    exit 0
  fi
fi
