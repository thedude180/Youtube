---
name: Autonomous OS Upgrade
description: 15-phase production stabilization converting CreatorOS from crash-prone wave startup into a staged self-healing autonomous OS. New library files, services, routes, schema tables, and wiring.
---

## What was built

### New lib files (server/lib/)
- `channel-validator.ts` — `isValidYouTubeChannelId`, `assertValidChannelId`, `isChannelConnected`
- `kill-switches.ts` — `KillSwitches.isEnabled(key)` reads env + DB system_settings; 60s cache
- `log-suppressor.ts` — `LogSuppressor.warn/error`; first occurrence logs, subsequent suppressed 10 min, then summary
- `error-classifier.ts` — classifies error objects into `ErrorCode` enums + repair policy
- `ai-scheduler.ts` — `AIScheduler.enqueue` with priority lanes; wraps semaphore + hourly-cap + memory check
- `command-center.ts` — `CommandCenter.canRun` — single gatekeeper for all background work
- `job-state-machine.ts` — `validateTransition(from, to, context)` blocks illegal state transitions
- `decision-journal.ts` — `logDecision(...)` helper writing to `decision_journal` table
- `performance-memory.ts` — `getMemory/updateMemory/getConfidence` backed by `channel_performance_memory`
- `startup-orchestrator.ts` — `StartupOrchestrator.run()` — 13-stage ordered startup

### New service files (server/services/)
- `self-healing-engine.ts` — Level 1/2 auto-repair; Level 3 staged only; records to `self_healing_actions`
- `growth-experiment-engine.ts` — A/B controlled experiments with confidence gates + auto-rollback

### New route file (server/routes/)
- `system-status.ts` — `GET /api/system/status` full health snapshot; `PATCH /api/system/kill-switch/:name`

### New DB tables (shared/schema.ts, pushed 2026-06-05)
- `self_healing_actions` — records every auto-repair action with severity/confidence/riskLevel/status
- `decision_journal` — logs important automated decisions for audit + future learning
- `channel_performance_memory` — persists per-user learned performance patterns (JSONB)
- `growth_experiments` — A/B experiment records with hypothesis/result/decision/rollbackPlan

### Wiring
- `server/routes.ts` imports and calls `registerSystemStatusRoutes(app)`
- `server/index.ts` Wave 0.6 awaits `StartupOrchestrator.run()` before Wave 1 engines

## Key architectural rules

**Why:** Demo/reviewer accounts (google_api_demo_reviewer, UCdemo_ETGaming247) were consuming AI quota, triggering RSS 404 storms, and contributing to 31 crashes/24h in production.

**How to apply:**
- `isProductionAutomationAllowed(userId, channelId)` — call at top of every engine's per-user iteration; returns false for demo/test/reviewer/seed/placeholder userId or UCdemo/demo channelId
- `CommandCenter.canRun` — call before starting any background job; it checks kill switches + account guard + channel validity + quota + AI capacity + memory pressure in order
- `KillSwitches.isEnabled(key)` — check before starting any module; env var `KILL_SWITCH_<NAME>=true` or DB system_settings key `kill_switch:<name>`
- `AIScheduler.enqueue` — all background AI calls must go through this; enforces priority + concurrency + budget limits
- `LogSuppressor.warn/error` — use for all spammy error paths (quota, token, yt-dlp, parse failures)
- `StartupOrchestrator` fires at Wave 0.6 (after startup-migrations, before all engines); non-fatal stages degrade gracefully, critical failures keep HTTP alive

## getQuotaStatus signature
`getQuotaStatus(userId: string)` — requires a userId argument. The system-status route cannot call it without a user context; use `isQuotaBreakerTripped()` (no args) for the dashboard payload instead.
