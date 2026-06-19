---
name: Loop Conductor — four closed loops
description: server/services/loop-conductor.ts — the central nervous system; closes content performance, system health, brain config, and snapshot→brain loops every 30min.
---

## What it is
`server/services/loop-conductor.ts` — `initLoopConductor()` registered in Wave 10 sequential boot. 5min internal delay → first cycle at T+30min. Subsequent cycles every 30–32min (jitter).

## The four closed loops

### Loop 1 — Content performance → source video revival score
- Reads `youtube_output_metrics` for Shorts with `views >= 500`, `source_video_id IS NOT NULL`, `metadata->>'revivalScoreBoosted' IS NULL`, published last 7 days
- For each: `UPDATE back_catalog_videos SET total_revival_score = LEAST(COALESCE(total_revival_score,50)+15, 100)`
- Marks metric row: `metadata.revivalScoreBoosted = true` (one-time; won't re-boost same Short)
- Logs to `system_incident_log` (status=resolved) → brain learns which source videos produce viral content
- **Why:** Brain Step 9t only runs daily and uses CTR. Loop conductor closes the same loop every 30min using raw view counts — a complementary signal that acts faster.

### Loop 2 — Publishing stall → immediate intervention
- When `publishingCompletions4h === 0` AND `quotaBreakerTripped === false` AND 2h cooldown not active
- Fires `runPipelineSelfHeal(true)` immediately (fire-and-forget) via dynamic import
- Rate-limited: `_lastEmergencyHealAt` in-memory, resets on each successful trigger; 2h cooldown
- Logs to `system_incident_log` → brain learns stall timing patterns
- **Why:** Self-heal runs on 20min cycle; loop conductor cuts the median response time from 10min to seconds.

### Loop 3 — Brain config → service-aware decisions
- Reads `service_state("brain","quota_safe_window")` → `quotaSafeEndUtcHour` (default 15 UTC)
- Reads `service_state("brain","best_short_duration")` → `bestShortDurationSec` (default 45s)
- Reads `service_state("brain","best_publish_window")` → `bestPublishWindow` (default "evening")
- These populate `state.brainConfig` and are included in the snapshot written to service_state
- **Why:** Brain writes operational config once/day; loop conductor reads it so its decisions are informed by brain's learned patterns, not hardcoded defaults.

### Loop 4 — Snapshot → brain daily synthesis → every AI prompt
- After each cycle, writes `service_state("loop-conductor","snapshot")` with full metrics
- Brain Step 9u (added to `youtube-learning-brain.ts` after Step 9t): reads snapshot, deletes stale `[System Health]` principle, inserts fresh one with current health score + metrics
- That principle flows into `getMasterKnowledgeForPrompt()` → 6 AI services get current system state
- **Why:** Without this, AI agents never know if the pipeline is stalled, quota tripped, or healthy. With it, the orchestrator can reason "system is degraded → defer non-critical AI work."

## Health score formula (0–100)
| Condition | Penalty |
|---|---|
| Quota breaker tripped | -30 |
| 0 publishing completions in 4h | -25 |
| >20 permanent_fail in last 1h | -15 |
| >50 vault entries stuck in indexed >2h | -10 |
| Any critical engine with error+stale heartbeat | -10 |
| >5 active incidents in 24h | -10 |

## Critical engines watched
`shorts-clip-publisher`, `long-form-clip-publisher`, `back-catalog-runner`, `youtube-ai-orchestrator`, `youtube-grinder`

## Brain Step 9u (youtube-learning-brain.ts, inserted after 9t)
- Dynamic import `getState("loop-conductor","snapshot")`
- Deletes stale `[System Health]%` principles with source_engines ILIKE `%loop-conductor%`
- Inserts fresh principle: healthy (score≥80) → strategy category; degraded → system_lesson
- confidenceScore = 75, applicableEngines = orchestrator + back-catalog-runner + grinder + publisher

## How to add new loops
1. Add a new `async function applyXxx(state)` in `loop-conductor.ts`
2. Call it in `Promise.all([..., applyXxx(state).catch(() => defaultValue)])` inside `runLoopCycle()`
3. Include the result in `writeSnapshot(state, actions)` for brain visibility
4. Log meaningful patterns to `logSystemIncident()` so brain learns from them
