#!/usr/bin/env bash
# Dumps every source file into CODEBASE_EXPORT.txt
# Scopes to key source dirs to avoid traversing node_modules/build artifacts
set -euo pipefail

OUTFILE="CODEBASE_EXPORT.txt"
cd "$(dirname "$0")/.."

echo "Generating code export to $OUTFILE ..."

{
  echo "========================================================"
  echo "CREATOS CODEBASE EXPORT — $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "========================================================"
  echo ""

  DIRS=(server client/src shared scripts)

  for dir in "${DIRS[@]}"; do
    [ -d "$dir" ] || continue
    find "$dir" -type f \( \
      -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
      -o -name "*.css" -o -name "*.html" -o -name "*.sh" -o -name "*.sql" \
    \) | sort | while IFS= read -r filepath; do
      echo "════════════════════════════════════════════════════════"
      echo "FILE: $filepath"
      echo "════════════════════════════════════════════════════════"
      cat "$filepath" 2>/dev/null || echo "[unreadable]"
      echo ""
    done
  done

  # Also include root config files
  for f in package.json tsconfig.json tailwind.config.ts vite.config.ts drizzle.config.ts; do
    [ -f "$f" ] || continue
    echo "════════════════════════════════════════════════════════"
    echo "FILE: ./$f"
    echo "════════════════════════════════════════════════════════"
    cat "$f"
    echo ""
  done

  # shared schema
  if [ -f "shared/schema.ts" ]; then
    echo "════════════════════════════════════════════════════════"
    echo "FILE: shared/schema.ts"
    echo "════════════════════════════════════════════════════════"
    cat shared/schema.ts
    echo ""
  fi

  echo "========================================================"
  echo "END OF EXPORT"
  echo "========================================================"
} > "$OUTFILE"

LINES=$(wc -l < "$OUTFILE")
SIZE=$(du -sh "$OUTFILE" | cut -f1)
echo "Export complete: $OUTFILE — $LINES lines, $SIZE"
