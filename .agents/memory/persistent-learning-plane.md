---
name: Persistent learning data plane
description: service_state table + expanded event_log wiring; how the brain accumulates knowledge across deployments
---

## The rule
Every service with a per-user cycle interval (e.g. `_lastCycleAt`) MUST persist that timestamp to `service_state` so the interval is honoured across container reboots and deployments, not just within one session.

Every significant outcome (publish success, publish failure, quota trip, catalog cycle, orchestrator full cycle) MUST write to `system_event_log` so the brain can query patterns across all time.

## service_state table
- `shared/schema.ts`: `serviceState` pgTable — `(service TEXT, key TEXT)` → `value JSONB`, `updated_at`
- `server/lib/service-state.ts`: `getState<T>(service, key)` (async, never throws) / `setState(service, key, value)` (fire-and-forget) / `setStateAsync(...)` (awaitable)
- Migration 089 creates it; `migrations/0053_wandering_agent_brand.sql` is the Drizzle file

## Wired services and their keys
| service name (in DB) | key pattern | where set |
|---|---|---|
| `learning-brain` | `lastCycleAt:{userId}` | `youtube-learning-brain.ts` `runDailyLearningCycle()` |
| `back-catalog-runner` | `lastRunAt` | `youtube-back-catalog-runner.ts` after cycle |
| `back-catalog-engine` | `lastCycleAt:{userId}` | `youtube-back-catalog-engine.ts` `runBackCatalogMonetizationCycle()` |
| `ai-orchestrator` | `lastFullCycleAt:{userId}` | `youtube-ai-orchestrator.ts` after fullCycle=true |

## Boot restore pattern
```typescript
if (!_lastCycleAt.has(userId)) {
  const { getState } = await import('../lib/service-state');
  const stored = await getState<{ ms: number }>('service-name', `lastCycleAt:${userId}`);
  if (stored?.ms) _lastCycleAt.set(userId, stored.ms);
}
```
This ensures the 20/22/24h interval is checked against the REAL last-run time, not 0 (epoch), after a deployment.

## system_event_log wiring points (full list)
| event_type | service | trigger |
|---|---|---|
| `publish` | `shorts-publisher` | successful Short upload |
| `publish` | `long-form-publisher` | successful long-form upload |
| `error` | `shorts-publisher` | failed Short upload |
| `error` | `longform-publisher` | failed long-form upload |
| `quota` | `quota-tracker` | quota breaker tripped |
| `system` | `back-catalog-runner` | cycle completion |
| `decision` | `ai-orchestrator` | each orchestrator decision |
| `learn` | `learning-brain` | daily cycle completion |
| `heal` | prod-heal | boot self-healing summary |

## synthesizeServiceHealth (brain daily cycle)
`synthesizeServiceHealth(userId)` runs as Step 0b+ in `runDailyLearningCycle()`.
- Reads all 4 service_state entries above
- Compares `hoursSince` vs `expectedH * 1.5`
- Writes MKB `category="service_health"` with healthy/overdue status per service
- `confidenceScore`: 90 if all healthy, 40 if any overdue
- Fires logger.warn so the daily report always surfaces pipeline gaps

**Why:** Before this, the brain had no way to detect "back-catalog-runner hasn't run in 48h" because that state was in-memory and reset on every boot. Service health gaps would go undetected until videos stopped appearing.
