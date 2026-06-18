---
name: AI 401 Circuit Breaker
description: Global circuit breaker for Replit AI integration 401 errors — prevents hot-loop when key expires/rotates
---

## The rule
When any AI call returns 401, trip a global 1-hour backoff and fail-fast (no TCP wait).

## Why
Replit AI integration key rotation or quota expiry causes every AI call to return 401
after ~15-16s TCP timeout. backlog-engine iterates 78,000+ video rows with a 4s
inter-video delay → at 20s/video that's weeks of useless spinning. Without a circuit
breaker ALL AI slots are consumed by timeout waits.

## How to apply
- `server/lib/ai-auth-guard.ts`: `checkAI401Circuit()` / `tripAI401Circuit()` / `isAI401CircuitOpen()`
- In every top-level AI call function: call `checkAI401Circuit()` BEFORE the budget check;
  wrap `openai.create()` in try/catch → call `tripAI401Circuit(context)` on 401, then rethrow
- In any loop that calls AI: catch the `AI_401_CIRCUIT_OPEN` error (or check `err.status===401`)
  and immediately `break` the loop (not `continue`)
- Pattern: `err.status === 401 || err.message?.includes('401 status code') || err.message?.includes('AI_401_CIRCUIT_OPEN')`
- Applied to: `generateVideoMetadata` + `runAgentTask` in server/ai-engine.ts;
  backlog-engine processBacklogAsync() catch block

## Backlog-engine specific
`markViralCapExhausted(reason, true)` with `hourlyOnly=true` tells the backlog-engine
not to restart for the next hour — matches the circuit breaker window.
