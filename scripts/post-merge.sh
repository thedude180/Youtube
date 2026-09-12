#!/bin/bash
set -e
npm install --prefer-offline
node scripts/cleanup-orphan-streams.mjs
npm run db:push -- --force

# db:push above only manages the v2 modular schema (shared/schema.drizzle.ts).
# The v1 monolithic schema (shared/schema.ts) — which the autonomous ASI
# services depend on — is not covered by drizzle-kit here, so bootstrap the
# v1 tables those services need. Idempotent (CREATE TABLE IF NOT EXISTS);
# non-fatal so a missing psql or transient DB blip never aborts the merge.
if command -v psql >/dev/null 2>&1 && [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -f scripts/create-asi-tables.sql \
    || echo "warn: ASI v1 table bootstrap failed (non-fatal) — run scripts/create-asi-tables.sql manually"
else
  echo "warn: psql or DATABASE_URL unavailable — skipping ASI v1 table bootstrap (run scripts/create-asi-tables.sql manually)"
fi
