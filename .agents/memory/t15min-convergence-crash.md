---
name: T+15min convergence crash pattern
description: Why 31 production outages happened in rapid 15-16min cycles and the three fixes applied.
---

## The Pattern
After every restart, production crashed again in exactly 15–16 minutes. The crash was silent (no logs) — a container OOM kill.

## Root Cause — Three services converge at T+10–20min

| Time after boot | Service | What it does |
|---|---|---|
| T+4min | Content grinder (first run) | Completes, schedules next at T+14min (10 min urgent interval when queue < 7) |
| T+10–15min | Back-catalog runner (startup delay) | Runs AI scoring + queuing cycle **and** fires direct `runGrindCycle()` |
| T+14min | Content grinder (second run) | Fires from scheduler independently of runner-triggered grind |
| T+15min | Publisher sweep | Second run of shorts + long-form publishers |

The runner's direct `runGrindCycle()` call bypassed the `grinderRunning` scheduler guard, so the runner-triggered grind and the scheduler-triggered grind ran **concurrently** — doubling in-flight AI call load. All four events in a ~1 min window pushed container RSS over the cgroup OOM limit.

## Fixes Applied

1. **Container memory gate in `runBackCatalogForAllEligibleUsers()`** — skips the cycle if container free memory < 300MB, with a log warning. Prevents the runner from being the tipping point.

2. **Grinder urgent interval raised 10min → 20min** — `GRIND_INTERVAL_URGENT_MS = grindJitter(20*60_000, 2*60_000)`. The second grinder run now fires at T+24min (not T+14min), safely after the back-catalog runner and publisher sweep have settled.

3. **Container memory gate in `runGrindCycle()`** — skips the cycle if container free memory < 250MB.

4. **Removed direct `runGrindCycle()` fire-and-forget from back-catalog runner** — the runner was calling `runGrindCycle()` directly (bypassing the `grinderRunning` flag) after generating new content. Removed; the adaptive grinder scheduler picks up new content on its own next tick.

## Why

The `grinderRunning` flag is only set by the **scheduler loop** (`startContentGrinder` → `scheduleNextGrind`). A direct `runGrindCycle()` call from another service does NOT set this flag, so two concurrent grind cycles can run simultaneously.

**How to apply:** Never call `runGrindCycle()` directly from outside the grinder's own scheduler. Always let the adaptive scheduler drive it. For urgent queue refills, lower the interval via the schedule logic, not a direct call.
