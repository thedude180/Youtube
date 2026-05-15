#!/usr/bin/env bash
# push-to-github.sh — push local main to one or both GitHub remotes
# Run from the Replit Shell: bash scripts/push-to-github.sh
#
# Remotes:
#   origin  → github.com/thedude180/Youtube
#   polsia  → github.com/Polsia-Inc/creatoros

set -e

BRANCH="main"

# ── Extract PAT from the existing origin remote URL ───────────────────────────
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || true)
PAT=$(echo "$ORIGIN_URL" | sed -n 's|https://x-access-token:\([^@]*\)@.*|\1|p')

if [ -z "$PAT" ]; then
  echo "ERROR: Could not extract PAT from origin remote URL."
  echo "Make sure origin is set to: https://x-access-token:<PAT>@github.com/..."
  exit 1
fi

POLSIA_URL="https://x-access-token:${PAT}@github.com/Polsia-Inc/creatoros.git"

# ── Ensure polsia remote exists ───────────────────────────────────────────────
if git remote get-url polsia &>/dev/null; then
  git remote set-url polsia "$POLSIA_URL"
else
  git remote add polsia "$POLSIA_URL"
  echo "Added remote: polsia → github.com/Polsia-Inc/oakstoneos"
fi

# ── Push to a single remote, handling diverged history ───────────────────────
push_remote() {
  local NAME="$1"
  local URL="$2"
  echo ""
  echo "══════════════════════════════════════════════"
  echo " Pushing to $NAME"
  echo "══════════════════════════════════════════════"

  git fetch "$NAME" "$BRANCH" 2>/dev/null || {
    echo "NOTE: Could not fetch $NAME — treating as empty remote."
    git push "$NAME" "$BRANCH"
    return
  }

  LOCAL=$(git rev-parse "$BRANCH")
  REMOTE_SHA=$(git rev-parse "$NAME/$BRANCH" 2>/dev/null || echo "none")

  if [ "$LOCAL" = "$REMOTE_SHA" ]; then
    echo "Already up to date — nothing to push."
    return
  fi

  if [ "$REMOTE_SHA" = "none" ]; then
    echo "Remote branch does not exist yet — pushing fresh."
    git push "$NAME" "$BRANCH"
    return
  fi

  BASE=$(git merge-base "$BRANCH" "$NAME/$BRANCH" 2>/dev/null || echo "none")

  if [ "$BASE" = "$REMOTE_SHA" ]; then
    echo "Remote is behind local — fast-forward push."
    git push "$NAME" "$BRANCH"
  else
    REMOTE_ONLY=$(git log --oneline "$BRANCH".."$NAME/$BRANCH")
    echo "Remote-only commits being overwritten:"
    echo "$REMOTE_ONLY"
    echo ""
    echo "Replit is source of truth — force-pushing (--force-with-lease)..."
    git push --force-with-lease "$NAME" "$BRANCH"
  fi

  echo "Done → $NAME"
}

# ── Run both ──────────────────────────────────────────────────────────────────
push_remote "origin"  "$ORIGIN_URL"
push_remote "polsia"  "$POLSIA_URL"

echo ""
echo "All remotes synced."
