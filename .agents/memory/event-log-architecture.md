---
name: Persistent event log architecture
description: system_event_log DB table + fire-and-forget logEvent() + brain synthesizer pattern
---

## The rule
`system_event_log` is the permanent cross-deployment audit trail. Every significant
system action must be written here so the learning brain can detect patterns across
all boots and deployments — not just the current container's in-memory state.

## What it is
- **Table**: `system_event_log` in `shared/schema.ts` — columns: id, event_type,
  service, title, detail (jsonb), user_id, severity, occurred_at (timestamptz)
- **Logger**: `server/lib/event-log.ts` — `logEvent()` (fire-and-forget via setImmediate)
  and `logEventAsync()` (awaitable, for cycle completions). Never throws.
- **Created in prod**: startup migration 088 — `CREATE TABLE IF NOT EXISTS` + 5 indexes

## Event types
- `publish` — Short or long-form successfully uploaded to YouTube
- `heal` — prod-heal boot summary (stuckCount, processingJobsReset, etc.)
- `decision` — AI orchestrator task outcome (persisted from in-memory decisionLog)
- `migration` — startup migration ran (use for significant migrations)
- `quota` — quota trip, budget warning, reset
- `error` — service-level error worth tracking across deployments
- `learn` — learning brain cycle completion
- `system` — general system event

## Wired into (fire-and-forget, non-blocking)
1. `server/index.ts` prod-heal → logEvent('heal') with full stats dict
2. `server/services/shorts-clip-publisher.ts` → logEvent('publish') on each Short upload
3. `server/services/long-form-clip-publisher.ts` → logEvent('publish') on each long-form
4. `server/services/youtube-ai-orchestrator.ts` log() closure → logEvent('decision')
   for every orchestrator task outcome (runs inside the existing log() local function)
5. `server/services/youtube-learning-brain.ts` → logEventAsync('learn') at daily cycle end

## Brain synthesizer
`synthesizeEventLog(userId)` in `youtube-learning-brain.ts` runs in daily Step 0
(alongside `synthesizeSystemTelemetry`). Three SQL patterns → `masterKnowledgeBank`
category `"event_log_intelligence"`:
1. Publish cadence: Shorts + long-forms per day over 30 days
2. Boot health: avg processing-jobs-reset / pipelines-unstuck per boot over 7 days
   (high avgReset triggers WARN flag → brain learns about crash-loop patterns)
3. Orchestrator decisions: which tasks ran, how many needed approval (7 days)

Also calls `pruneOldEvents(90)` to keep the table bounded to a 90-day rolling window.

## Why
Application logs vanish on every container restart/redeployment. The brain previously
had no record of publishing history, boot health trends, or orchestrator decisions
across past deployments — only the current boot's in-memory state and the MKB entries
generated from it. This table closes that gap permanently.

## How to apply
- Any new service that does something significant (new publisher, new heal step,
  new orchestrator task type) should call `logEvent()` on success/failure.
- `logEvent()` is always fire-and-forget. Never await it in the hot path.
- Only use `logEventAsync()` at the very end of long-lived cycle functions where
  waiting for the DB write is acceptable (e.g., brain daily cycle completion).
- The table will self-heal even if migration 088 failed on first boot — the CREATE
  TABLE IF NOT EXISTS guard means it runs once and succeeds on any subsequent boot.
