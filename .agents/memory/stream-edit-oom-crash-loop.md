---
name: Stream edit job OOM crash loop pattern
description: Long stream_edit_jobs (≥2h source) cause a repeating 33-min MemoryGuardian crash cycle via the stream editor's own startup recovery mechanism.
---

**Rule:** Any stream_edit_job that crashes the server while processing must NOT be re-picked immediately. Use three-layer protection in `cancelLongStreamEditJobs()` plus the per-run time gate for segmented processing.

**Crash mechanism:**
1. Container crashes with stream_edit_job N in `processing` state
2. Next boot: `cancelLongStreamEditJobs()` runs at T+3s (Wave 0.5)
3. If job N is NOT cancelled → it stays in `processing`
4. Stream editor `startStreamEditorWatchdog()` runs at ~T+10-16min (Wave 9)
5. Startup recovery resets job N from `processing` → `queued`
6. Stream editor picks up job N → crash at T+15-33min
7. Container restarts → go to step 1 → **infinite crash loop**

**Fix — three-layer protection in `cancelLongStreamEditJobs()` + per-run gate:**

Layer A (general): Cancel ALL `processing` jobs on every boot.
- Any job in `processing` at boot was running when the last crash happened.
- Pre-empts the startup recovery's `WHERE status='processing'` sweep → 0 rows found → no crash-causing job re-queued.

Layer B (specific): Keep `LONG_STREAM_EDIT_JOB_IDS` list for belt-and-suspenders.
- Handles jobs already reset to `queued` before cancelLongStreamEditJobs() ran.
- Current list: `[18117, 18229]` — add future crash-loop job IDs here.

Layer C (CHANGED — log only, NOT cancel): Detect long-source queued jobs and log count.
- Previously cancelled all `queued` jobs where `source_duration_secs > 7200`.
- **Now log-only** — cancellation deleted resume progress from completedClips/outputFiles.
- Blanket cancel replaced by the per-run time gate in stream-editor.ts.

**Per-run time gate (stream-editor.ts) — replaces Layer C cancellation:**
- `PER_RUN_LIMIT_MS = 20 * 60 * 1000` (20 min) constant at module level
- After each clip completes: checks `(Date.now() - runStartedAt) > PER_RUN_LIMIT_MS`
- If limit hit with segments remaining: sets job back to `queued`, adds to `_pausedJobIdsThisSession`
- `pickUpNextQueuedJob()` uses `notInArray(streamEditJobs.id, pausedIds)` to skip paused jobs in same session
- On next container boot: paused set is cleared → job resumes automatically

**Resume cursor (zero schema changes needed):**
- `completedClips` (int column) = number of segments encoded so far
- `outputFiles` (jsonb column) = array of already-encoded clip metadata
- On resume: `resumeFromIdx = job.completedClips ?? 0`, `completedTasks = resumeFromIdx`
- Loop uses `segIdx` counter; skips segments where `segIdx < resumeFromIdx`
- `outputFiles` pre-populated from `job.outputFiles` when `resumeFromIdx > 0`
- Logs "▶ resuming from clip N/M" when resuming

**Result:** A 3h stream = ~3 runs of 20 min each (one per container boot). All clips are eventually encoded. Learning brain receives `logSystemIncident()` on each pause (category="oom_crash", status="resolved") → patterns flow into masterKnowledgeBank.

**How to identify a crash-loop job:**
`[StreamEditor] Startup recovery: 1 job(s) left in "processing" from previous run — resetting to queued: XXXXX` in production logs. Same ID on every boot = crash driver → add to `LONG_STREAM_EDIT_JOB_IDS`.

**Timeline:**
- Job 18117: 2h source, caused 33-min OOM cycle
- Job 18229: active crash-loop job Jun 18 2026, caused 10 outages in 24h at 15-min intervals
- Jun 18 2026: segmented-run approach added; Layer C changed to log-only
