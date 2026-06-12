---
name: Focus gate bypass mines off-brand games
description: When BF6 catalog was exhausted, back-catalog engine set gameFilter=null → queued AC Valhalla Shorts. Fixed by keeping gameFilter=matchesGame always. Never bypass to null while a focus game is set.
---

## The Bug

In `youtube-back-catalog-engine.ts`, the focus gate had two states:
- `hasUnminedForGame = true` → `gameFilter = matchesGame` (BF6 only)
- `hasUnminedForGame = false` → `gameFilter = null` (ALL games allowed — the bypass)

When BF6 catalog was "exhausted" (all source videos flagged `minedForShorts=true`), the bypass fired. `(!gameFilter || gameFilter(v))` always passes when `gameFilter = null`. AC Valhalla, Spider-Man, and other back-catalog games filled the Short queue.

The publisher orders by focus-game priority but that only matters when BF6 items exist. With `gameFilter=null`, non-BF6 items fill the queue → they're the only Shorts available to publish.

Confirmed: Jun 12 2026 screenshot — two AC Valhalla Shorts with identical titles in window 3, -13 subscribers in 28 days.

## Fix

Changed the bypass branch from `gameFilter = null` to `gameFilter = matchesGame`. Engine idles for Shorts when BF6 catalog is exhausted. The catalog-rotation block resets `minedForShorts=false` for all videos once the entire catalog is exhausted AND Shorts queue drops below 21 (7 days × 3/day) — this self-heals without needing manual intervention.

Migration 060 purges existing non-BF6 Shorts already in the queue (`status='permanent_fail'`).

## Rule

**Never set `gameFilter = null` while a focus game is set.** Always keep `gameFilter = matchesGame`. If the focus catalog is exhausted, the pipeline should idle for Shorts rather than publish off-brand content. The catalog-rotation mechanism handles the self-heal automatically.

Long-form content uses the same `gameFilter` — also BF6-only now. This is intentional for a dedicated BF6 channel.
