---
name: Pre-encoder vault-indexed strict gate
description: Pre-encoder must never attempt yt-dlp section downloads for vault-indexed videos; strict early return + priority queue fix.
---

## The rule

If `content_vault_backups` has an entry with `status = 'indexed'` for a source video,
the pre-encoder **must immediately skip** that queue item — never fall through to a
yt-dlp `--download-sections` call.

## Why

`status = 'indexed'` means the vault knows the video exists but hasn't downloaded it
yet. When pre-encoder attempted a section download for such a video:

- yt-dlp returns "Requested format is not available" (no DASH/fragmented formats)
- Each failure stalls the single yt-dlp gate slot for 3+ minutes
- 13 such items × 3 min each = 39 min of gate starvation → DB pool exhausted → crash loop

Root case: `mAz2whE1ruI` (storm video, 11h 4K stream) had vault `status=indexed`;
13 queue items referencing it triggered the cascade.

## How to apply

In `server/services/pre-encoder.ts`, after the vault-indexed check:

```typescript
if (indexedEntry) {
  vaultIsIndexedOnly = true;
  // Trigger vault download + defer item; NEVER fall through to section download
  queueVaultDownloadForSource(userId, resolvedSourceYoutubeId).catch(() => {});
  // update metadata with preEncoderDeferCount
  skipped++; continue;
}
```

Vault downloads use `acquireYtdlpSlot(0)` (priority 0 = highest).
Section downloads use default `acquireYtdlpSlot()` → priority 1.
This ensures vault full-video downloads always proceed ahead of section downloads
in the single-slot serialized gate queue (`server/lib/ytdlp-gate.ts`).

## Related migrations

- Migration 065: blacklists `mAz2whE1ruI` + `LlQFaMvy5_k` in vault (permanentFail)
  and autopilot_queue (permanent_fail)
- These storm videos should never re-enter the vault or queue after this migration
