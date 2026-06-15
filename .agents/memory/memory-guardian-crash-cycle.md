---
name: MemoryGuardian 33-min crash cycle
description: MemoryGuardian's holdoff + sampling window means any sustained memory leak produces a predictable ~33-min crash cycle. Identifying the cycle length points to the root cause.
---

**Rule:** A ~33-minute production crash cycle almost always means MemoryGuardian detected a sustained heap growth of >5MB/min. Count the outage frequency (crashes/hour) to confirm: 43 crashes/24h = one every ~33min.

**MemoryGuardian timing (server/services/memory-guardian.ts):**
- `STARTUP_HOLDOFF_MS = 5 * 60_000` (5 min) — no samples collected during startup burst
- `MIN_LEAK_SAMPLES = 20` — needs 20 consecutive ticks at 60s/tick = 20 more minutes
- Earliest possible trigger: T + 5min (holdoff) + 20min (samples) = **T+25min**
- Typical trigger with moderate growth: **T+30–35min**
- After trigger: `emergencyMemoryRelief()` → if heap still >500MB → sends alert (3s) → `process.exit(1)`
- Total observed cycle including boot time: **~33 minutes**

**Threshold:** `slope > 5_000_000 && r2 > 0.85` — 5MB/min sustained growth with R²>0.85 confidence. At 33-min cycle: 5MB/min × 28min = 140MB growth on top of 200–300MB baseline → ~340–440MB → approaching 500MB restart threshold.

**Diagnosis checklist for 33-min crash cycles:**
1. Check production logs for `[MemoryGuardian]` or `process.exit(1)` near T+30–35min
2. Look for `[StreamEditor] Startup recovery: 1 job(s)` — same job ID every boot = FFmpeg OOM
3. Look for vault download storms (yt-dlp stdout accumulating in Node.js buffers)
4. Look for AI semaphore stuck slots holding all 4 background slots (no relief = memory stays high)
5. Check if Wave 10.5 (T+31.6min) starts multiple engines whose first-run fires heavy AI calls

**Key insight:** The cycle is SELF-CONSISTENT. If the crash happens at the same time every boot, the root cause starts immediately on boot (not triggered by a timer). Services that start with a fixed timer offset can also create periodic crashes, but those would produce non-33-min intervals.

**Related fixes:** migration 094, cancelLongStreamEditJobs(), OOM guard in stream editor (caps FFmpeg to 20min for 2h sources — but cap alone may not be enough if the source is very large).
