#!/usr/bin/env bash
# check-drizzle-sync.sh
#
# Verifies that the Drizzle migration snapshot chain is in sync with the
# TypeScript schema.  Runs `drizzle-kit generate` and fails if it produces
# any new migration file (which would mean a schema change was committed
# without a corresponding snapshot update).
#
# Exit codes:
#   0 — schema and snapshots are in sync; nothing new was generated
#   1 — schema drift detected (drizzle-kit generated one or more new migrations)

set -euo pipefail

JOURNAL="migrations/meta/_journal.json"

echo "Checking Drizzle schema sync..."

# ── snapshot the journal before we run ────────────────────────────────────────
JOURNAL_BACKUP=$(cat "$JOURNAL")
ENTRIES_BEFORE=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(len(d['entries']))" <<< "$JOURNAL_BACKUP")

# ── run drizzle-kit generate and capture output ────────────────────────────────
OUTPUT=$(npx drizzle-kit generate 2>&1)

# ── check for new migration ────────────────────────────────────────────────────
if echo "$OUTPUT" | grep -q "Your SQL migration file"; then
    # Determine how many new entries appeared and clean them up
    ENTRIES_AFTER=$(python3 -c "import json; d=json.load(open('$JOURNAL')); print(len(d['entries']))" 2>/dev/null || echo "$ENTRIES_BEFORE")
    NEW_COUNT=$(( ENTRIES_AFTER - ENTRIES_BEFORE ))

    # Remove newly generated SQL migrations and meta snapshots
    if [ "$NEW_COUNT" -gt 0 ]; then
        python3 - "$JOURNAL" "$ENTRIES_BEFORE" <<'PYEOF'
import json, sys, os, glob

journal_path = sys.argv[1]
keep_count   = int(sys.argv[2])

with open(journal_path) as f:
    journal = json.load(f)

removed_tags = [e["tag"] for e in journal["entries"][keep_count:]]
journal["entries"] = journal["entries"][:keep_count]

with open(journal_path, "w") as f:
    json.dump(journal, f, indent=2)

for tag in removed_tags:
    sql_path  = f"migrations/{tag}.sql"
    snap_path = f"migrations/meta/{tag.split('_')[0]}_snapshot.json"
    for p in [sql_path, snap_path]:
        if os.path.exists(p):
            os.remove(p)
            print(f"  Removed: {p}")
PYEOF
    fi

    echo ""
    echo "ERROR: Schema drift detected — drizzle-kit generated new migration(s)."
    echo "Run 'npx drizzle-kit generate' locally and commit the resulting files."
    exit 1
fi

echo "OK — schema and snapshots are in sync."
exit 0
