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
- **CRITICAL: normalize `err.message` before `.includes()`.** Some logger transports
  wrap the message as an object `{value: "401 status code (no body)"}` instead of a
  plain string — `err.message?.includes('...')` silently returns undefined/false.
  Always normalize first:
  ```ts
  const errMsg = typeof err?.message === 'string'
    ? err.message
    : String(err?.message?.value ?? err?.message ?? err ?? '');
  const is401 = (err as any)?.status === 401 || errMsg.includes('401 status code') || errMsg.includes('AI_401_CIRCUIT_OPEN');
  ```
- Same normalization applies in any `.catch()` that checks for 401 or budget messages.
- Applied to: `generateVideoMetadata` + `runAgentTask` in server/ai-engine.ts;
  backlog-engine processBacklogAsync() catch block;
  autopilot-engine viral optimizer per-video catch (with _viralAuth401BackoffUntil 30-min backoff)

## Backlog-engine specific
`markViralCapExhausted(reason, true)` with `hourlyOnly=true` tells the backlog-engine
not to restart for the next hour — matches the circuit breaker window.
