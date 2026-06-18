---
name: Vault stale-downloaded post-deployment
description: vault DB says 'downloaded' but file lost across container restart → pre-encoder section-dl storm fix
---

## The Problem

After a new deployment (container restart), local vault files at `/home/runner/workspace/vault/<id>.mp4` are lost. But `content_vault_backups` still shows `status='downloaded'` with those file paths.

**Pre-encoder vault check (before fix):**
1. Finds `downloadedEntry` with filePath in DB
2. `fs.existsSync(filePath)` → `false` (file gone)
3. Falls into `else` branch — checks `indexed` (status is 'downloaded', not match), checks `failed` (not match)
4. Falls through to `downloadSection()` → YouTube rejects → "Failed to extract any player response"
5. Error not in `isFormatError` → gradual retry (count+1), keeps retrying every cycle

**Additional blind spot:** vault `status='skipped'` was not checked — only `'failed'`. YstycEObOiU had `status='skipped'` with `permanentFail=true` but was bypassing the guard entirely.

## The Fix (3 layers)

### 1. Pre-encoder stale-downloaded branch (pre-encoder.ts)
```
} else if (downloadedEntry?.filePath) {
  // file missing on disk — reset vault to 'indexed', queue re-download, defer
  UPDATE content_vault_backups SET status='indexed', file_path=NULL
  WHERE youtube_id=... AND status='downloaded'
  queueVaultDownloadForSource(userId, sourceYoutubeId)
  skipped++; continue;
}
```

### 2. Pre-encoder skipped+failed check
Changed `status='failed'` WHERE clause to `status IN ('failed', 'skipped')` so permanently-skipped vault entries also block section-dl attempts.

### 3. isFormatError expansion
Added to the error string checks:
- `"Failed to extract any player response"` 
- `"No video formats found"`
- `"Unable to extract"`

These now trigger hard-fail (count=3) immediately instead of gradual retry.

## Per-Boot Cleanup

`resetStaleDownloadedVaultEntries()` in startup-migrations.ts runs every boot:
- SELECTs all `downloaded` vault entries with a `file_path`
- Checks each with `fs.existsSync()`
- Resets missing files to `indexed` (file_path=NULL, download_error=NULL)
- Vault downloader picks them up automatically

## Migration 103 (One-Shot)

- Cancels all `YstycEObOiU` autopilot_queue items (vault=skipped/permanentFail)
- Resets `oOvbZwsaeKI`, `njNPrR65YBs`, `vwrQy2LdGJU` vault entries from `downloaded` → `indexed`

## Why This Matters

**Why:** Container deployments wipe local disk. Vault DB retains stale 'downloaded' status. Pre-encoder then burns yt-dlp gate slots on section-dl attempts that always fail → 0 real video uploads at quota reset.

**How to apply:** Any time production logs show "Failed to extract any player response" from pre-encoder — suspect stale vault 'downloaded' entries first before assuming the video is actually inaccessible.
