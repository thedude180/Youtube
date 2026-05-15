#!/usr/bin/env bash
# push-to-github.sh — push local main to GitHub, handling diverged history
# Run this from the Replit Shell: bash scripts/push-to-github.sh

set -e

REMOTE="origin"
BRANCH="main"

echo "=== Fetching remote state ==="
git fetch "$REMOTE" "$BRANCH"

LOCAL=$(git rev-parse "$BRANCH")
REMOTE_SHA=$(git rev-parse "$REMOTE/$BRANCH")
BASE=$(git merge-base "$BRANCH" "$REMOTE/$BRANCH")

echo "Local HEAD : $LOCAL"
echo "Remote HEAD: $REMOTE_SHA"

if [ "$LOCAL" = "$REMOTE_SHA" ]; then
  echo "Already up to date — nothing to push."
  exit 0
fi

if [ "$BASE" = "$REMOTE_SHA" ]; then
  echo "Remote is behind local — fast-forward push."
  git push "$REMOTE" "$BRANCH"
  echo "Done. All commits pushed to GitHub."
  exit 0
fi

# Remote has commits local doesn't have — show them
REMOTE_ONLY=$(git log --oneline "$BRANCH".."$REMOTE/$BRANCH")
echo ""
echo "=== Remote-only commits (not in local) ==="
echo "$REMOTE_ONLY"
echo ""
echo "These exist on GitHub but not in Replit."
echo "Replit is the source of truth for this project."
echo "Force-pushing local main over remote (--force-with-lease)..."
git push --force-with-lease "$REMOTE" "$BRANCH"
echo ""
echo "Done. GitHub is now in sync with Replit."
