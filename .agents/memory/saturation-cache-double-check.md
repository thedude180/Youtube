---
name: Saturation cache double-check crash
description: getNextShortPublishTime() fast-path check was outside mutex; concurrent Wave 10.5 callers each ran the full 42-query DB scan independently.
---

## The Rule
`getNextShortPublishTime` (and any similar mutex-protected function with a pre-mutex fast-path cache check) MUST re-check the cache **inside** the mutex before doing the expensive work. This is the classic double-checked locking pattern.

**Why:** The fast-path check at the top of the function is intentionally outside the mutex (zero overhead when the cache is warm). But when 18+ services start simultaneously at T+30min (Wave 10.5), they ALL pass the fast-path check before any single caller sets the cache. They then all queue up in the per-user async mutex and each runs the full 42-query DB scan sequentially — taking ~3s each, producing 24 consecutive "No Short window found" warnings over 75 seconds. This stalls the event loop, causes health-check 500s, and triggers the MemoryGuardian restart loop (one crash every ~16 minutes, matching the 30-min saturation cache TTL cycle).

**How to apply:** Any function that follows this pattern:
```
// fast-path (outside mutex)
if (cache.has(key)) return cache.get(key);

return withMutex(key, () => {
  // ← Must re-check cache HERE before expensive work
  if (cache.has(key)) return cache.get(key);
  // ... expensive DB scan ...
  cache.set(key, result);
  return result;
});
```

## Files changed
- `server/services/youtube-output-schedule.ts` — added inner re-check of `shortScheduleSaturationCache` inside `withShortScheduleMutex`, before `withShortAdvisoryLock`
- `server/services/autopilot-queue-rescheduler.ts` — added `isShortScheduleSaturated()` break guard inside the inner item loop

## Crash timeline
- Boot at T+0
- Wave 10.5 fires at T+30min: 18 engines start, all call `getNextShortPublishTime`
- All 18 pass the empty fast-path check simultaneously
- All 18 queue up in the per-user mutex
- Each runs the full scan (42 queries × ~3s = ~3s per caller)
- 18 callers × 3s = 54s of hot-spin logging "No Short window found"
- Event loop stalled → health check /api/health returns 500 after timeout
- Replit detects unhealthy → kills container → restart
- Next restart: same cycle ~30min later (when saturation cache TTL expires)
- Result: 16 crashes in ~24 hours (one crash every ~16 min after T+30 mark)
