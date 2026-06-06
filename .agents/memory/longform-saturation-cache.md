---
name: Long-form schedule saturation cache
description: getNextLongFormPublishTime has the same 28-DB-query storm as Shorts when saturated; same cache pattern applied; also viral-optimizer log debounced
---

## The rule
`getNextLongFormPublishTime` walks 14 days × 2 DB queries = 28 queries per call when no window
is found (1 long-form slot/day, so 14 days = 14 slots to check). In steady state (14 days fully
booked), every batch-queue loop triggers the full 28-query scan before getting the +24h fallback.

## Fix implemented
- **longFormScheduleSaturationCache** (Map) in `youtube-output-schedule.ts`:
  - Set when `getNextLongFormPublishTime` exhausts all 14 days (minDaysAhead=0 only)
  - TTL: 30 minutes (same as Short saturation cache)
  - Fast-path at function start returns cached fallback immediately, zero DB queries
- **Exports**: `isLongFormScheduleSaturated(userId)` and `clearLongFormScheduleSaturation(userId)`
- **Cache cleared** in `long-form-clip-publisher.ts` after each `published++`
- **Guards added** before `getNextLongFormPublishTime` calls in:
  - `relentless-content-grinder.ts` — returns 0 early if saturated
  - `youtube-back-catalog-engine.ts` — both bucket-queue loop and past-streams site
  - `youtube-longform-segmenter.ts` — breaks out of segment loop if saturated
  - `longform-prep-pipeline.ts` — uses +24h fallback if saturated
  - `long-form-clip-publisher.ts` — uses +24h fallback inline (no DB call)

## Viral-optimizer log debounce
`checkHourlyTokenBudget` in `token-hourly-cap.ts` logged every single cap rejection
(×134, ×135… ×153 per hour = every 2 seconds). Added `_capWarnedAt` Map + 5-min
debounce per module so the same module can only log once per 5 minutes.

**Why:** Both functions follow the same saturation pattern as Shorts — without a fast-path
cache, any tight batch-queue loop in steady state becomes a DB query storm. Apply the
same cure to any new schedule function that walks day-by-day windows.

**How to apply:**
- New schedule functions that walk N days × M queries: add saturation cache
- New bulk-queue callers: check `isSaturated` before the loop, clear cache on publish
- New tight-loop log.warn calls: add per-key debounce map at module level
