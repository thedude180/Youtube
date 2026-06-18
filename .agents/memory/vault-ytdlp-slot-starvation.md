---
name: Vault yt-dlp slot starvation pattern
description: Non-BF6 catalog videos in indexed status fill all yt-dlp slots, blocking BF6 pre-encoder
---

## The rule
Any `indexed` vault entry with no downloaded file and a non-BF6 game name MUST be marked
`skipped` on every boot before any downloader or publisher fires.

## Why
ET Gaming 274 played AC Valhalla, Dragon Age, God of War, BF2042 etc. before the BF6 pivot.
Those videos ARE in `back_catalog_videos` (so migration100's NOT EXISTS guard doesn't skip them)
and land in `indexed` status when the vault indexer runs. The perpetual downloader picks them up
and fills all 4 yt-dlp slots → pre-encoder can't acquire a slot → 689+ BF6 clips stay stuck
in `pending` indefinitely → publishing pipeline stops.

## How to apply
Non-flagged per-boot cleanup: `cleanupNonBF6IndexedVaultEntries()` in
`server/lib/startup-migrations.ts`. Three-step:
1. JOIN back_catalog_videos → skip indexed vault entries for non-BF6 games
   (filter: NOT (game_name ILIKE '%battlefield%' OR '%bf6%' OR '%bf 6%'))
   Note: BF2042 MATCHES this filter (has 'battlefield') so it is NOT skipped here.
2. Skip orphaned indexed entries (no catalog record, no file)
3. Sweep `permanentFail=true` entries still in indexed/downloading → set status=failed
   (catches migration031 gaps like hBylGNbIT88: BF2042, failCount=10, permanentFail=true,
   but status still=indexed)

Must run BEFORE `cleanupOrphanedQueueItems()` so that dead-source queue items
(e.g. 42 from hBylGNbIT88, 27 from FGv-w4tvc0M) are cancelled in the same boot cycle.

## Sentinel: permanentFail=true but status≠failed
migration031 sweeps `permanentFail=true` to `status=failed` on boot, but only catches
entries that EXISTED at the time it ran. New entries with this state need the step-3
general sweep in `cleanupNonBF6IndexedVaultEntries()` (non-flagged, runs every boot).
