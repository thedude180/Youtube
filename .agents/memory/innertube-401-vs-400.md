---
name: InnerTube 401 vs 400 confusion
description: HTTP 401 (auth expired) must NOT trigger PERM_UNAVAILABLE like HTTP 400 (video unavailable) — they need separate counters
---

# InnerTube 401 ≠ Video Unavailable

## The Rule
`downloadViaInnerTube` must track 401 (auth error) and 400 (video unavailable) with SEPARATE counters.

- **HTTP 400**: bad request — video may be private/deleted/age-restricted → count in `http400FailCount`
- **HTTP 401**: unauthorized — OAuth Bearer token is expired/invalid → count in `http401FailCount`

Only throw `PERM_UNAVAILABLE:HTTP_400_ALL_CLIENTS` when **all** clients returned 400 AND `http401FailCount === 0`.

If all failures were 401s → log and return false → yt-dlp will attempt the download as a public video.

**Why:** When the OAuth token expires, ALL InnerTube clients return 401. The original code counted 401 in `http400FailCount`, so 2 clients returning 401 = http400FailCount(2) ≥ INNERTUBE_CLIENTS.length(2) → PERM_UNAVAILABLE thrown → caller permanently skips the video. But the video IS downloadable via yt-dlp without auth. This permanently blocked 283 videos.

**How to apply:** In `downloadViaInnerTube` (video-vault.ts):
1. Track `http400FailCount` (video-unavailable 400s only) and `http401FailCount` separately
2. Both 400 and 401 should try the unauthenticated fallback first
3. In the fail branch: `if (status === 401) http401FailCount++ else http400FailCount++`
4. PERM_UNAVAILABLE gate: `http400FailCount >= clients.length && http401FailCount === 0`

**Recovery:** Migration 056 resets all vault entries with `download_error ILIKE '%HTTP_400_ALL_CLIENTS%'` back to `indexed` status.
