---
name: permanentFail status leak
description: Vault downloader ignores permanentFail:true metadata flag when row status is still indexed/downloading — retries indefinitely.
---

## The rule
Any vault row with `metadata.permanentFail = true` must also have `status = 'failed'`. If a migration sets `permanentFail:true` but the row was `indexed` or `downloading` at query time, the UPDATE skips it (e.g. `WHERE status != 'failed'` doesn't match `downloading` if the downloader already acquired it). The row then stays in an active status and the SELECT loop picks it up again on the next tick.

**Why:** The `processVaultDownloads` SELECT historically only checked `status IN ('indexed'…)` — it did NOT check `permanentFail`. So `permanentFail:true` in metadata had no effect unless the status was simultaneously `failed`.

**How to apply:**
1. The SELECT in `processVaultDownloads` (video-vault.ts) now includes `AND COALESCE((metadata->>'permanentFail')::boolean, false) = false` — this is the permanent guard.
2. `queueVaultDownloadForSource` checks `permanentFail` before falling through to insert/download.
3. Any future migration that sets `permanentFail:true` should use `WHERE status IN ('indexed','downloading','queued','failed')` — not `WHERE status != 'failed'` — to catch rows mid-download.
4. Migration 026 is a general sweep: resets ALL entries with `permanentFail:true AND status IN ('indexed','downloading','queued')` to `failed` on every fresh boot (idempotent via flag).
