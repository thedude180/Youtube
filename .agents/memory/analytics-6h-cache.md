---
name: Analytics 6h cache
description: fetchAnalyticsReport had zero caching — 8 callers all made live API calls; in-memory cache added with 6h TTL.
---

## Rule
Every call to `fetchAnalyticsReport` in `server/services/youtube-analytics.ts` now checks a module-level `analyticsCache` Map before making an HTTP request. Key = `${channelYtId}::${JSON.stringify(params)}`. TTL = 6 hours.

## Why
8 report functions (heatmap, retention curves, scheduling insights, audience retention, etc.) all called `fetchAnalyticsReport` with no caching whatsoever. Any service requesting analytics data re-fetched from the API every time. Analytics data changes at most once per hour on YouTube's side.

## How to apply
- Do NOT add a second cache layer elsewhere for analytics data — the cache is at the `fetchAnalyticsReport` level so all 8 callers share it.
- If you add a new analytics report function that calls `fetchAnalyticsReport`, it gets cache benefits automatically.
- Cache is process-scoped (in-memory Map) — clears on server restart, which is fine since restarts reset the 6h window.
