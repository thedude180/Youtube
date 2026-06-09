---
name: yt-dlp startup-phase stall blind spot
description: Stall watcher in yt-dlp-section-download.ts silently reset its timer when the output file had never been created, letting a hung yt-dlp process run for the full hard cap (2 hours).
---

## The Rule
Any yt-dlp stall watcher that resets its stall counter when `currentSize === -1` (file not yet created) has a blind spot: if yt-dlp hangs in the startup/auth/metadata phase and never creates the output file, the stall timer is reset on every poll tick forever, and only the hard cap terminates it.

**Why:** The original logic treated "file not created yet" as "still starting up — don't penalise". That reasoning is sound for the first ~30-60 s, but unbounded. A hung process that never writes a file will hold the slot for the full `hardTimeoutMs`.

**How to apply:** Track a separate `startupMs` counter that increments every poll when `currentSize === -1`. If it exceeds `STARTUP_PHASE_TIMEOUT_MS` (3 min), kill the process. This is independent of the stall counter, which only applies once the file exists.

## What was changed
- `server/lib/yt-dlp-section-download.ts`:
  - Added `startupMs` counter alongside `stalledMs`
  - When `currentSize === -1`, increment `startupMs`; kill + reject if `startupMs >= STARTUP_PHASE_TIMEOUT_MS` (3 min)
  - When file first appears, reset `startupMs = 0` as well
  - Reduced default `hardTimeoutMs` from `2 * 60 * 60_000` (2 h) to `20 * 60_000` (20 min) — section downloads are bounded clips; 20 min is ample

## Incident context
Video `Po4WNli5ZLY` triggered an 11:24 UTC MemoryGuardian emergency restart. yt-dlp entered the metadata/auth phase, never created the output file, `startupMs` was never tracked, `stalledMs` was reset to 0 every 5 s, and the process ran for 7200 s (the 2-hour hard cap). The held yt-dlp slot + memory growth caused the OOM crash. Migration 030 permanently blacklists this video in `pre_encoder_queue` and `content_vault_backups`.
