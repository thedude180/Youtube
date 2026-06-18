---
name: Backlog engine AI no-response OOM
description: Backlog engine "No response from AI" errors each hang ~60s, causing stacked TCP connections that trigger MemoryGuardian OOM when AI semaphore is saturated.
---

## The pattern

When the AI background semaphore is fully saturated (all 8 slots held by orchestrator / back-catalog runner / grinder), OpenAI calls made directly by the backlog engine hang for the full TCP timeout (~60 s) before throwing `"No response from AI"`. The old error handler just logged the error and moved to the next video — no break, no backoff.

Result: 4 consecutive hanging calls = 4 open TCP connections + heap held for ~4 min at T+30min, pushing past MemoryGuardian's threshold → OOM crash at T+33min.

## Observed symptoms

- `[backlog-engine] Failed to process video N: {value: "No response from AI"}` × 4 consecutive, at roughly 1-minute intervals (each call hanging ~60s)
- Immediately preceded by `[Pipeline] AI queue full` and `[auto-thumbnail] AI queue full, background semaphore saturated`
- Server crash at T+33min (MemoryGuardian kill)

## Fix (server/backlog-engine.ts)

Added `consecutiveAiNoResponse` counter (initialized before the video loop) and `AI_NO_RESPONSE_BREAK_THRESHOLD = 3`.

In the catch block:
- Detect `errMsg.includes('No response from AI')`
- Increment counter; if `>= 3` → `markViralCapExhausted(reason, true)` (hourlyOnly, same as 401 breaker) + `break`
- For non-no-response errors: reset counter to 0

In the success path (after `await storage.updateVideo`):
- Reset counter to 0

## Why hourlyOnly=true

Mirrors the existing 401 circuit breaker. Marks the hourly viral-cap exhausted → backlog engine skips the rest of the current hour's window, then resumes automatically at the next hourly reset. Does NOT burn the daily budget.

## Recovery

Same as 401: batch resumes automatically after ~1h. No manual intervention needed.
