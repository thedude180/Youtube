---
name: file_size INT4 overflow on large video downloads
description: content_vault_backups (and studio_videos, asset_library) had INT4 file_size column, max ~2.1 GB. BF6 full-session streams are 2-4+ GB — download succeeds but DB update throws overflow, leaving the record un-marked downloaded.
---

## The Bug

`content_vault_backups.file_size` was `integer` (INT4 in PostgreSQL, max 2,147,483,647 ≈ 2.1 GB).

When a file >2.1 GB is downloaded successfully:
1. File lands on disk (e.g. `/vault/vPapOhtN3dQ.mp4`, 2,780,652,886 bytes)
2. `UPDATE content_vault_backups SET file_size=$1, status='downloaded'...` THROWS integer overflow
3. Drizzle wraps as "Failed query" — vault record stays in previous status
4. System falls back to yt-dlp which also fails → file orphaned on disk
5. Next boot: vault record still `indexed`/`queued`, download attempted again → infinite loop

Confirmed from prod logs:
```
[Vault] InnerTube failed for vPapOhtN3dQ:
Failed query: update "content_vault_backups" set "file_path" = $1, "file_size" = $2 ...
params: /home/runner/workspace/vault/vPapOhtN3dQ.mp4,2780652886,...
— falling back to yt-dlp clients
```

## Affected Tables (all had INT4 in prod)
- `content_vault_backups` — critical; causes vault download loop
- `studio_videos` — stream editor output
- `asset_library` — creative assets

## Fix

**Schema (`shared/schema.ts`):** changed all three from `integer("file_size")` to `bigint("file_size", { mode: "number" })`.

`mode: "number"` means Drizzle returns a regular JS number (not BigInt). Node.js `stat.size` and all consuming code already use JS numbers, so no other code changes needed.

**Migration 059** (`startup-migrations.ts`): `ALTER TABLE ... ALTER COLUMN file_size TYPE bigint USING file_size::bigint` for all three tables. Runs once on next deploy.

## Rule

**Never use `integer` for file size columns.** Even "small" video files easily exceed 2.1 GB for a full gaming session. Always use `bigint("file_size", { mode: "number" })` in Drizzle schemas and `bigint` in PostgreSQL DDL.
