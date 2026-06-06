---
name: Short schedule saturation cache
description: When all 14-day Short windows are full, getNextShortPublishTime does 42 DB queries per call — saturation cache prevents runaway loops and health-check timeouts
---

## The rule
`getNextShortPublishTime` walks 14 days × 3 DB queries = 42 queries per call when no window is found.
When the 14-day queue is already full (normal steady state = 3 Shorts/day × 14 days = 42 slots), every
call from every engine returns the `+6h` fallback after 42 queries. With 9+ concurrent callers
(back-catalog, grinder, output-scheduler, live-copilot, shorts-repurpose, etc.) this saturates the
DB pool, stalls the Node event loop, and health checks return 500 → outage.

## Fix implemented
- **Saturation cache** (`shortScheduleSaturationCache`, Map in `youtube-output-schedule.ts`):
  - Set when `getNextShortPublishTime` exhausts all days (only for `minDaysAhead=0`)
  - TTL: 30 minutes
  - Fast-path at function start: cache hit → return immediately, zero DB queries
- **Cache cleared** in `shorts-clip-publisher.ts` after each successful `published++` so newly
  freed windows are picked up on the next scan.
- **Saturation guard** (`isShortScheduleSaturated(userId)`) added before bulk-queuing loops in:
  - `youtube-output-scheduler.ts` (pre-flight + mid-loop)
  - `relentless-content-grinder.ts` (before each moment)
  - `youtube-back-catalog-engine.ts` (both clip-queue loop sites)

**Why:** `MAX_DAYS_AHEAD=14` (audit-required value) means the in-use steady-state ALWAYS has all
windows filled. Without the cache, every engine run in a full-schedule steady state turns into
a 42-query DB storm that kills health checks.

## How to apply
- Any new service that batch-calls `getNextShortPublishTime` in a loop MUST check
  `isShortScheduleSaturated(userId)` before each call and `break` if true.
- Any new Short publisher MUST call `clearShortScheduleSaturation(userId)` after successful publish.
- Do NOT bypass the cache for catalog callers with `minDaysAhead > 0` — they have their own
  horizon check (`MAX_BACK_CATALOG_DAYS_AHEAD`) and the saturation cache only applies to `minDaysAhead=0`.
