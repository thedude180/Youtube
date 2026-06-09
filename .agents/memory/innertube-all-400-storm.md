---
name: InnerTube all-clients-400 storm
description: When all InnerTube clients return HTTP 400, the downloader fell through to yt-dlp which also failed — triggering an unending retry storm per-video.
---

## The rule
If ALL InnerTube clients return HTTP 400 (auth + unauth both rejected), the video is definitively private, deleted, or age-restricted. Do NOT fall through to yt-dlp — it will also fail with "No video formats found!" and the whole cycle repeats every session.

**Why:** `downloadViaInnerTube` iterated clients, and on 400 called `continue`. After the loop, it `return false`. The caller logged "InnerTube produced no file" and started the full yt-dlp multi-client storm. yt-dlp also failed, incrementing failCount. If the server crashed before failCount reached 5, the loop never self-limited. New sessions restarted the storm from scratch.

**How to apply:**
1. `downloadViaInnerTube` now counts `http400FailCount` per client. If `http400FailCount >= INNERTUBE_CLIENTS.length`, throws `PERM_UNAVAILABLE:HTTP_400_ALL_CLIENTS:...`
2. The existing PERM_UNAVAILABLE handler in `downloadSingleVideo` catches this and sets `status='skipped', permanentSkip:true, failCount:5` — no yt-dlp attempted.
3. Migration 028 is a sweep: any vault entry with `download_error ILIKE '%permanently inaccessible%' OR '%No video formats found%' OR '%video unavailable%' OR '%HTTP_400_ALL_CLIENTS%'` → `status='failed', permanentFail:true`.
4. Individual video migrations (027, etc.) are still needed for videos already mid-storm at deploy time.

## Scale concern
The back-catalog imported 11,000+ vault entries. Many are private live streams that were never archived. Without this fix, each one triggers a fresh storm on its first attempt. The structural fix stops new storms; migration 028 cleans up entries already flagged by past attempts.
