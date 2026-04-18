#!/usr/bin/env bash
# ============================================================
# generate-code-export.sh — CreatorOS full codebase export
# Writes every source file (line by line) into CODEBASE_EXPORT.txt
# ============================================================

OUT="CODEBASE_EXPORT.txt"
DATE=$(date -u "+%Y-%m-%dT%H:%M:%SZ")

echo "Generating code export to $OUT ..."

cat > "$OUT" << HEADER
# ============================================================
# CREATOROS CODEBASE EXPORT
# Generated: $DATE
# ============================================================

HEADER

EXTENSIONS="ts tsx css html json"
DIRS="client/src server shared scripts"

for DIR in $DIRS; do
  [ -d "$DIR" ] || continue
  while IFS= read -r -d '' FILE; do
    # Skip generated/lock files
    case "$FILE" in
      *node_modules*|*/.git/*|*/dist/*|*/build/*|*/.cache/*) continue ;;
      *.min.js|*-lock.json|*.lock) continue ;;
    esac

    EXT="${FILE##*.}"
    MATCH=0
    for E in $EXTENSIONS; do
      [ "$EXT" = "$E" ] && MATCH=1 && break
    done
    [ $MATCH -eq 0 ] && continue

    {
      echo ""
      echo "# ============================================================"
      echo "# FILE: $FILE"
      echo "# ============================================================"
      cat "$FILE"
      echo ""
    } >> "$OUT"

  done < <(find "$DIR" -type f -print0 | sort -z)
done

# Also include root config files
for F in drizzle.config.ts tsconfig.json vite.config.ts tailwind.config.ts; do
  [ -f "$F" ] || continue
  {
    echo ""
    echo "# ============================================================"
    echo "# FILE: $F"
    echo "# ============================================================"
    cat "$F"
    echo ""
  } >> "$OUT"
done

LINES=$(wc -l < "$OUT")
SIZE=$(du -sh "$OUT" | cut -f1)
echo "Done: $OUT — $LINES lines, $SIZE"
