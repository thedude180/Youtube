---
name: System Incident Log
description: Living institutional memory table — all crashes, bugs, fixes, lessons. Feeds learning brain daily cycle.
---

## What it is
`system_incident_log` DB table + `server/lib/incident-log.ts` helper.

Every structural bug, crash pattern, hot-loop, storm video, schema quirk — one row per incident. Builds forever. Never purged.

## How knowledge flows
1. `promoteIncidentLessonsToKnowledge(userId)` in `incident-log.ts` reads all un-promoted resolved incidents with severity critical|high
2. Writes each lesson to `masterKnowledgeBank` (category="system_lesson", confidence 85-95)
3. masterKnowledgeBank flows into every AI prompt via `getMasterKnowledgeForPrompt()`
4. Learning brain calls this after `refreshSuccessDNA()` in its daily cycle (step 9b)

## logSystemIncident()
Call from any service when it detects + resolves a new issue:
```ts
import { logSystemIncident } from "../lib/incident-log";
await logSystemIncident({
  category: "hot_loop",      // oom_crash | hot_loop | storm_video | db_saturation | boot_timing | schema_bug | vault_failure | publisher_loop | quota_breach | ai_queue | auth_failure | other
  service: "my-service",
  rootCause: "...",
  fixDescription: "...",
  lesson: "...",             // the durable rule for the AI brain
  severity: "high",          // critical | high | medium | low
  crashesPerDay: 20,
  migrationNumber: 37,       // if a startup migration was part of the fix
  tags: ["vault", "boot-timing"],
});
```

## Migration 037
Seeds 30 historical incidents. Runs once on boot (flag-guarded). Idempotent.

**Why:** The AI learning brain previously only learned from content performance (views, CTR, watch time). It had no awareness of the system's operational failure modes. This closes that loop — the same machinery that teaches the AI "20-30 min videos perform best" now also teaches it "every AI slot loop needs 30s backoff on queue full".
