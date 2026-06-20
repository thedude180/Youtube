---
name: Live-detection DB circuit breaker
description: live-detection.ts polls the channels table every 45s; circuit breaker added to prevent DB flood when pool is exhausted.
---

## Rule
`_liveDetectionDbBackoffUntil` module-level timestamp in `server/services/live-detection.ts`.

**Why:** Live detection polls for active streams every 45 seconds. When the DB pool is under pressure (e.g., cold-boot convergence), the channels query times out. Without a backoff, 45s polling hammers the remaining pool connections and extends the exhaustion window.

**How to apply:** The guard is at the top of `runMultiPlatformLiveDetection()` — checks `Date.now() < _liveDetectionDbBackoffUntil` before the `running=true` gate, then sets a 3-minute backoff on catch of any DB timeout. Pattern should be applied to any other 30-60s polling loop that queries the DB.
