---
name: Stream edit job OOM crash loop pattern
description: Long stream_edit_jobs (≥2h source) cause a repeating 33-min MemoryGuardian crash cycle via the stream editor's own startup recovery mechanism.
---

**Rule:** Any stream_edit_job that crashes the server while processing must be permanently cancelled AND kept cancelled via the general `cancelLongStreamEditJobs()` per-boot cleanup — a one-time flagged migration alone is insufficient.

**Crash mechanism:**
1. Container crashes with stream_edit_job N in `processing` state
2. Next boot: `cancelLongStreamEditJobs()` runs at T+3s (Wave 0.5)
3. If job N is NOT in the cancellation logic → it stays in `processing`
4. Stream editor's `startStreamEditorWatchdog()` runs at ~T+10-16min (Wave 9)
5. Startup recovery resets job N from `processing` → `queued`
6. Stream editor picks up job N → crash at T+15-33min
7. Container restarts → go to step 1 → **infinite crash loop**

**Crash timing varies:**
- 33-min cycle: MemoryGuardian OOM pattern (long 2h+ FFmpeg jobs)
- 15-min cycle: shorter crash from AI queue saturation + FFmpeg combined pressure

**Fix (Jun 2026 update) — two-layer protection in `cancelLongStreamEditJobs()`:**

Layer A (general): Cancel ALL `processing` jobs on every boot.
- Any job in `processing` at boot was running when the last crash happened.
- Pre-empts the startup recovery's `WHERE status='processing'` sweep → 0 rows found → no crash-causing job re-queued.

Layer B (specific): Keep `LONG_STREAM_EDIT_JOB_IDS` list for belt-and-suspenders.
- Handles jobs already reset to `queued` before cancelLongStreamEditJobs() ran.
- Current list: `[18117, 18229]` — add future crash-loop job IDs here.

**How to identify a crash-loop job:**
Look for `[StreamEditor] Startup recovery: 1 job(s) left in "processing" from previous run — resetting to queued: XXXXX` in production deployment logs. The same job ID on every boot = the crash driver. Add it to `LONG_STREAM_EDIT_JOB_IDS` AND ensure Layer A handles it going forward.

**Timeline:**
- Job 18117: 2h source, OOM guard cap to 20min still caused >5MB/min heap growth, 33-min cycle
- Job 18229: active crash-loop job Jun 18 2026, caused 10 outages in 24h at 15-min intervals
