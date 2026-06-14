---
name: VOD optimizer quota burn pattern
description: VOD SEO optimizer must have per-video 7-day cooldown + 12h interval or it burns 50 quota units + 1 AI slot per video every cycle.
---

## Rule
- Interval: `jitter(12 * 60 * 60_000)` in index.ts (was 2h).
- Per-video gate in `_doOptimize`: check `video.metadata.aiOptimizedAt`; skip if age < 7 days.
- After optimizing a video, `aiOptimizedAt` is written to `video.metadata`.

## Why
Without the cooldown, the same 519 catalog videos would be re-processed on every cycle. Even at 10 videos/cycle: 10 × 50 units × 12 cycles/day = 6,000 quota units/day just on metadata updates + 10 AI slots/day. The 7-day cooldown means each video is touched at most once per week.

## How to apply
- Any future background optimizer that calls `videos.update` MUST have a per-item cooldown stored in the item's metadata and checked before the AI + API call.
- Pattern: read metadata timestamp → check age → skip if < cooldown → do work → write new timestamp.
