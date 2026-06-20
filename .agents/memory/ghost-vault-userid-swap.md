---
name: Ghost vault user_id column-swap pattern
description: content_vault_backups rows with user_id=YouTube video ID (columns swapped at creation)
---

## The Rule
Some `content_vault_backups` rows were created with the `user_id` and `youtube_id` columns swapped: `user_id` contains an 11-char YouTube video ID (e.g. `hBylGNbIT88`) and `youtube_id` contains the real user UUID. These rows are invisible to the downloader (which filters by real UUID) but ARE counted by health-monitor's "stuck indexed" query, generating false alarms on every boot.

## Detection Pattern
```sql
WHERE LENGTH(user_id) < 30
  AND user_id NOT LIKE '________-____-____-____-____________'
```
UUID is always 36 chars (8-4-4-4-12). YouTube video IDs are 11 chars. LENGTH < 30 safely identifies them.

## Fix
4th step in `cleanupNonBF6IndexedVaultEntries()` in `server/lib/startup-migrations.ts`:
marks matching rows as `status='skipped'` with `permanentFail:true, failCount:10` in metadata.

**Why:** These rows can never be downloaded (wrong user_id means no auth context). Leaving them as `indexed` permanently inflates the stuck-indexed counter in health dashboards.

## How to Apply
Any new vault creation code that accepts both `userId` and `youtubeId` parameters should validate that `userId` is a UUID (length > 30 or matches UUID regex) before writing to DB. Log a warning and swap if mismatched.
