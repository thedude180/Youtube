---
name: MemoryGuardian Wave 10.5 false-positive holdoff
description: Wave 10.5 sequential module loading triggers a false-positive MemoryGuardian restart at T+36min; fix is STARTUP_HOLDOFF_MS=42min + resetBaseline() after Wave 10.5
---

## The rule

`STARTUP_HOLDOFF_MS` in `server/services/memory-guardian.ts` must be ≥42 minutes.  
Call `memoryGuardian.resetBaseline()` in `server/index.ts` immediately after the Wave 10.5 `sequentialBoot(...)` completes.

**Why:** Wave 10.5 loads 27 modules sequentially at 15s intervals, starting at T+31.6min and finishing at T+38.4min. Each `import()` permanently adds heap. The MemoryGuardian's linear regression sees slope >5MB/tick with R2>0.85 from this module-load growth and triggers `emergencyMemoryRelief()` + `drainAndRestart()` → `process.exit(1)` at ~T+36min. This is a false positive — the heap growth is expected module memory, not a leak.

**How to apply:**
- If STARTUP_HOLDOFF_MS is ever reduced below 42min, the T+36min crash loop returns.
- After adding new engines to Wave 10.5: recalculate end time as `T+31.6 + N_engines × 15s / 60` and bump holdoff accordingly.
- The `resetBaseline()` call clears stale growth samples so steady-state detection starts from the stable post-load heap.

## MemoryGuardian trigger conditions (for reference)

- Samples collected every 60s starting at T+STARTUP_HOLDOFF_MS
- Needs MIN_LEAK_SAMPLES=20 samples (20 min) before first regression
- Fires when: slope > 5MB/tick AND R2 > 0.85
- After trigger: `emergencyMemoryRelief()` → 30s later → if heap >500MB → `process.exit(1)`
- 5-min cooldown between triggers
