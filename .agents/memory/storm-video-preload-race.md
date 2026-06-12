---
name: Storm-video preload-race crash loop
description: 21 crashes/day pattern — permanently-inaccessible videos bypass the in-memory block because the async boot preload hasn't completed when the Maximizer fires at T+2s; 24h expiry also re-enables them daily.
---

## The Pattern

When a video fails ALL yt-dlp download clients/formats (e.g. vFEd5Xckrhs — confirmed inaccessible), clip-video-processor should block it permanently via its in-memory `permanentFailList`. But two bugs let it slip through:

1. **Preload race**: `_preloadPromise` loads all `status='failed'` vault entries with `permanentFail:true` from DB into `permanentFailList`. But the Maximizer catch-up fires at T+2s (before the async preload completes), creating 17 queue experiments. Each calls `downloadSourceVideo()`, which checked `permanentFailList` _before_ the preload resolved → all 17 passed through → 25 sequential yt-dlp spawns per experiment → OOM at T+16min → crash → repeat.

2. **24h expiry resets the block**: `permanentFailList` entries older than `PERMANENT_FAIL_EXPIRY_MS` (24h) are removed. Videos confirmed permanently inaccessible were re-tried every 24h, creating a daily storm.

## Confirmed Storm Video IDs (Jun 11-12 2026 outages)
- `vFEd5Xckrhs` — all HTTP clients return 400; primary driver
- `990MjVBCiIA`, `HNXKbE_wcuY`, `xZICplRIdpc` — secondary confirmed

## Three-Layer Fix

**Layer 1 — clip-video-processor.ts preload gate:**
- `downloadSourceVideo()` now `await _preloadPromise.catch(()=>{})` before checking `permanentFailList` or spawning any yt-dlp process.
- DB-loaded entries in the preload get `neverExpire: true` in the map value.
- `isPermFailed()` helper skips the 24h expiry check when `neverExpire=true`.

**Layer 2 — neverExpire flag on map entries:**
- `permanentFailList` map type updated to `Map<string, { ts: number; neverExpire?: boolean }>`.
- DB-loaded entries always get `neverExpire: true`; runtime-added entries use default 24h expiry.
- This means a vault-confirmed permanent failure is never re-enabled in the same server process.

**Layer 3 — Migration 058 sentinel rows:**
- On every boot, Migration 058 runs and ensures all confirmed storm video IDs have a `content_vault_backups` row with `status='failed'` + `metadata.permanentFail=true`.
- This makes Layer 1 effective: preload finds these rows and blocks them from the first millisecond.
- Also cancels all `pending`/`scheduled` autopilot_queue items for these source videos.
- General sweep: any vault entry with format-not-available / geo-blocked / DRM / Permanent error gets `permanentFail=true` stamped — so the preload picks them all up.

## Rule

**Any video that fails ALL download clients must be permanently blacklisted with no time-based expiry.** The 24h `PERMANENT_FAIL_EXPIRY_MS` is only for transient errors. Videos confirmed inaccessible must:
1. Have a `content_vault_backups` row with `permanentFail:true` in metadata.
2. Be loaded by the boot preload with `neverExpire=true`.
3. Have `downloadSourceVideo()` await the preload before any yt-dlp work.

**Why:** The Maximizer and back-catalog-engine fire at T+2s and T+10–20min respectively, well before async preloads complete. A race between "queue experiments are created" and "permanent-fail list is populated" is always losable unless `downloadSourceVideo()` itself blocks on the preload.
