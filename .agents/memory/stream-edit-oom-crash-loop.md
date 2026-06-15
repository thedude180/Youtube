---
name: Stream edit job OOM crash loop pattern
description: Long stream_edit_jobs (≥2h source) cause a repeating 33-min MemoryGuardian crash cycle via the stream editor's own startup recovery mechanism.
---

**Rule:** Any stream_edit_job for a source video ≥2h must be permanently cancelled AND kept cancelled via a non-flagged per-boot cleanup — a one-time flagged migration alone is insufficient.

**Crash mechanism:**
1. Container crashes with stream_edit_job N in `processing` state
2. Next boot: startup migrations run at T+3s (Wave 0.5)
3. If migration N is already **flagged** → it skips; job N stays in `processing`
4. Stream editor's `startStreamEditorWatchdog()` runs at ~T+16min (Wave 9)
5. Startup recovery resets job N from `processing` → `queued`
6. Stream editor picks up job N and starts FFmpeg for the 2h source
7. Heap grows at >5MB/min; MemoryGuardian fires `process.exit(1)` at T+33min
8. Container restarts → go to step 1 → **infinite 33-min crash loop**

**Fix — two-layer protection:**
1. **One-time flagged migration** (e.g. migration094): Cancels the job on the first boot after deployment. Runs at T+3s BEFORE the stream editor's T+16min startup recovery. Enough to break the cycle for this boot.
2. **Non-flagged per-boot cleanup** `cancelLongStreamEditJobs()` in `server/lib/startup-migrations.ts`: Cancels the same job IDs on **every** boot. Runs alongside other per-boot cleanups (before stream editor). Survives crash/restart cycles indefinitely.

**Implementation:**
```typescript
const LONG_STREAM_EDIT_JOB_IDS = [18117]; // add future problem job IDs here
async function cancelLongStreamEditJobs(): Promise<void> {
  const idsSql = LONG_STREAM_EDIT_JOB_IDS.join(',');
  await db.execute(sql.raw(`
    UPDATE stream_edit_jobs SET status = 'cancelled'
    WHERE id IN (${idsSql}) AND status IN ('queued','processing','failed')
  `));
}
```
Call this in `runStartupMigrations()` in the non-flagged cleanup section (after `cleanupStuckPendingItems`).

**Timeline (confirmed job 18117, Jun 15 2026):**
- Job 18117: 2h source video, stream editor log: "capping smart-cut 60min → 20min (OOM guard)"
- Even with the OOM guard capping FFmpeg work to 20min, heap growth was still >5MB/min
- Migration 087 cancelled job 18102 but missed 18117 → crash loop shifted to 18117
- Migration 094 + cancelLongStreamEditJobs() fixed it permanently

**How to identify:** Look for `[StreamEditor] Startup recovery: 1 job(s) left in "processing" from previous run — resetting to queued: XXXXX` in production logs. The same job ID appearing on every boot is the OOM crash driver.
