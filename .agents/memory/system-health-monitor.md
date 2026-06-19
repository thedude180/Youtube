---
name: System health monitor + learning loop
description: App-wide health detection layer wired into pipeline-self-heal; closes the detect→log→learn loop to the brain.
---

## What it is
`server/services/system-health-monitor.ts` — exported `runHealthMonitor()` called after every `runPipelineSelfHeal()` cycle (~every 20min + boot T+5s).

## 5 health checks
1. **Publishing velocity** — zero `autopilot_queue status='completed'` in 4h → `publisher_loop` incident
2. **Queue failure spike** — >20 new `permanent_fail` in 1h → `publisher_loop` incident
3. **Vault stuck** — >30 `content_vault_backups status='indexed'` for >2h → `vault_failure` incident
4. **Dead engines** — `engine_heartbeats`: critical engine (`shorts-clip-publisher`, `long-form-clip-publisher`, `back-catalog-runner`, `youtube-ai-orchestrator`, `youtube-grinder`) with `status='error'` + `failure_count>=3` + `last_run_at < NOW()-35min` → `other` incident
5. **Quota breaker** — `isQuotaBreakerTripped()` tripped → `quota_breach` incident with units/limit from `youtube_quota_usage`

## The closed learning loop
```
detect → logIncidentOnce() [24h deduped per service+category]
       → system_incident_log (status='active', autoDetected=true)
       → brain daily cycle: promoteIncidentLessonsToKnowledge()
       → masterKnowledgeBank (category='system_lesson')
       → flows into every AI prompt forever
```

## Recovery incident logging
When `pipeline-self-heal.ts` fixes items (`totalRecovered > 0`), it calls `logSystemIncident()` (non-deduped) with `status='resolved'`. Brain learns which tables get stuck, how often, and in what pattern.

**Why:** Every resolved recovery and every active detection creates a permanent record. The brain reads and promotes them to `masterKnowledgeBank` so the system gets smarter about each recurring problem automatically.

## How to apply
- Add new checks to `runHealthMonitor()` in `system-health-monitor.ts` by adding a new async function and appending to the `Promise.allSettled` array
- Use `logIncidentOnce()` (deduped) for active/ongoing issues
- Use `logSystemIncident()` (non-deduped) for resolved fixes
- Always pass `autoDetected: true` for runtime-detected issues
- Category taxonomy is in `INCIDENT_CATEGORIES` in `server/lib/incident-log.ts`
