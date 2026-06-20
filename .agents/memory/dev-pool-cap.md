---
name: Dev pool cap prevents PG saturation
description: dev/prod share the same PostgreSQL; dev pool was 50, hitting the 100-connection PG limit together with prod's 50 — root cause of Jun 19 crash loop.
---

## Rule
`server/db.ts` must use `DB_POOL_MAX = process.env.NODE_ENV === "development" ? 10 : 50`.

**Why:** Dev and production share the SAME PostgreSQL instance (same DATABASE_URL). PG default max_connections=100. With dev=50 + prod=50, any concurrent boot by both environments saturates the pool. DB queries fail with ETIMEDOUT → health-brain triggers drainAndRestart → process.exit(1) → 15-min crash loop. Observed as 60 crashes over 24h on Jun 19 2026.

**How to apply:** Never raise dev pool above 10. If this file is ever touched for a schema change, verify the pool max line is still `dev ? 10 : 50`.

## Corollary: FFmpeg memory
FFmpeg runs as a spawned child process. Its memory does NOT contribute to Node.js heap. `process.memoryUsage().heapUsed` (which MemoryGuardian checks) is unaffected by even a 3h FFmpeg encode. The 20-min `source_duration_secs` time gate in stream-editor.ts IS sufficient protection — production proved stable at T+27min with an 11808s (3h) job processing.

## Related
- `server/lib/startup-migrations.ts` Layer C: cancels ALL queued stream_edit_jobs with source_duration_secs > 7200 on every boot (belt-and-suspenders)
- `server/services/live-detection.ts`: `_liveDetectionDbBackoffUntil` circuit breaker on channels query timeout
