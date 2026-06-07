---
name: Job queue thundering herd crash loop
description: startRecoveryPump() immediately processes all stale queued jobs from crashed sessions, saturating background AI queue and causing 9 MB/min memory growth → MemoryGuardian restart loop
---

## The pattern

`startRecoveryPump()` in `server/services/intelligent-job-queue.ts` previously ran `await sweep()` immediately on boot.  After N production crashes, there are N×(jobs-per-crash) stale `vod_seo_optimize`, `vod_wait_and_process`, `shorts_factory`, etc. jobs in the DB with `status='queued'`.  The sweep finds all of them and starts one background chain per job type.  Each chain holds a background AI slot.  With >4 concurrent chains all 4 background AI slots fill permanently → every other AI service fails → memory grows at ~9 MB/min from accumulated Promise chains and error objects → MemoryGuardian triggers `drainAndRestart()` at T+25min → crash → repeat.

After 11 crashes in 24h the backlog is huge and each boot is worse than the last.

**Why:** The `processNext` chain had zero delay between jobs (immediately chained in `finally` block), so one chain per type runs at maximum speed indefinitely.

## The fix (applied 2026-06-07)

1. **Boot-time stale job cleanup**: `startRecoveryPump()` now runs a SQL UPDATE at boot that fails all AI-intensive queued jobs older than 10 minutes, clearing the crash backlog before any sweep starts.
2. **Deferred first sweep**: Removed `await sweep()` call from `startRecoveryPump()`.  First sweep now runs 5 minutes after the call (via `setInterval`), not immediately.
3. **5-second chain delay**: The `processNext` `finally` block now wraps the chain call in `setTimeout(5_000)` instead of calling it synchronously.

## How to apply

Any time you see "4/4 background callers waiting" within 10 minutes of boot + memory growth at >5 MB/min + crash at T+25-35min from boot → suspect the job queue thundering herd.  Check `intelligent_jobs` table for large counts of `status='queued'` rows older than 30 minutes.
