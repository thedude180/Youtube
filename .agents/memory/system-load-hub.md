---
name: System Load Signal Hub
description: Central nervous system for CreatorOS — cross-service load signaling so heavy services defer gracefully instead of crashing into each other.
---

# System Load Signal Hub

**File:** `server/lib/system-load.ts`

## What it does
Single module every background service can query before doing heavy work. Replaces the pattern where services ran independently on timers and only discovered contention by crashing.

## Signals tracked (auto-polled every 30s)
- `aiSlotsPct` — background AI slot saturation 0–100 (from `getAISemaphoreStats()`)
- `quotaTripped` — YouTube quota circuit-breaker state (from `isQuotaBreakerTripped()`)
- `heapMB` — Node.js heap in use
- `phase` — computed boot/load phase

## Boot phases
- `startup` — before Wave 3 fires `signalBootComplete()` 
- `warming` — Wave 3 to T+10min after boot complete
- `steady` — all vitals nominal, full operation allowed
- `stressed` — heapMB>850 OR aiSlotsPct≥87
- `recovering` — heapMB>650 OR aiSlotsPct≥62 OR quotaTripped

## Key exports
- `canRunHeavyWork()` — returns false during startup/warming/stressed/recovering; used by back-catalog-runner, ai-orchestrator, learning-brain before running heavy cycles
- `canRunAIWork()` — lighter gate (allows warming), for services that start early
- `signalBootComplete()` — called in Wave 3 after watchers/live-detection up; transitions startup→warming; automatically transitions to steady 10min later
- `pushLoadSignal(partial)` — real-time push from external services; used by quota-tracker on trip/clear so phase updates within ms, not 30s

## Services wired
- `server/index.ts` Wave 3: `signalBootComplete()` after watchers start
- `server/services/youtube-back-catalog-runner.ts`: `canRunHeavyWork()` after memory gate
- `server/services/youtube-ai-orchestrator.ts`: `canRunHeavyWork()` after quota breaker check
- `server/services/youtube-learning-brain.ts`: `canRunHeavyWork()` after time gate (resets lastCycleAt on defer so retry fires next interval)
- `server/services/youtube-quota-tracker.ts`: `pushLoadSignal({ quotaTripped: true/false })` on trip/clear

## API exposure
- `GET /api/system/health` — includes `systemLoad` snapshot
- `GET /api/system/load` — dedicated endpoint for dashboard polling

**Why:** Services ran on independent timers with no shared awareness of system state → thundering herd → OOM crashes. The hub gives every organ a way to ask "is the body ready?" before taxing it further.

**How to apply:** Any new heavy background service (AI scoring, metadata sweeps, bulk catalog work) MUST call `canRunHeavyWork()` at the top of its run function before doing real work. Wrap in try/catch so a missing import is non-fatal.
