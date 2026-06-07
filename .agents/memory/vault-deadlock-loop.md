---
name: Vault deadlock loop — permanently failed source videos
description: queue items referencing permanently-undownloadable vault sources loop forever; fix pattern for both publishers + pre-encoder + boot migration
---

## The bug

`queueVaultDownloadForSource()` returned one of `"already_downloaded" | "in_progress" | "queued"` — it had no way to signal that the vault entry was permanently failed (status="failed", failCount >= 3).

Both `long-form-clip-publisher.ts` and `shorts-clip-publisher.ts` treated the `"in_progress"` result as "retry later" and reset the queue item back to `scheduled`. On the next cycle it tried again — found the same permanently-failed vault entry — and looped forever, consuming publisher slots and preventing healthy items from running.

Specific videos known to be undownloadable: `v03vNARoDdY` (live stream never archived, HTTP 400 from all InnerTube clients), `hBylGNbIT88` (section download timed out at 180s for large segment).

## Fix pattern

1. **`queueVaultDownloadForSource`** — early-return `"download_failed"` when the vault entry has `status="failed"` AND `failCount >= 3`. Return type updated to include the new literal.

2. **Both publishers** — check for `"download_failed"` result and throw `__vault_source_unavailable__` instead of `__vault_download_pending__`. Catch blocks handle the new signal: mark item `status="failed"` (not reset to `scheduled`) and `continue`.

3. **Pre-encoder** — at the top of the per-item loop, query `content_vault_backups` for the `sourceYoutubeId`; if `status="failed"` AND `failCount >= 3`, log + `skipped++` + `continue`. Wrapped in `try/catch` so it's non-fatal.

4. **yt-dlp section download timeout** — raised from 180s → 600s default. Pre-encoder now passes a *dynamic* timeout: `min(900_000, max(180_000, sectionDurationSec × 1_500))` ms.

5. **Migration 019** — one-time boot migration in `startup-migrations.ts` that immediately UPDATEs all `scheduled` queue items referencing a permanently-failed vault source to `status="failed"`. Cleans up all pre-existing deadlocked items on next prod deployment.

**Why:** The root cause is that the vault's "permanent failure" state was invisible to callers. Any caller that doesn't check for `"download_failed"` will loop. Apply this same check pattern wherever `queueVaultDownloadForSource` is called.

**How to apply:** Whenever adding a new code path that calls `queueVaultDownloadForSource`, always handle all 4 return values: `"already_downloaded"`, `"in_progress"`, `"queued"`, and `"download_failed"`. The last one means throw `__vault_source_unavailable__` and permanently fail the queue item.
