---
name: Wave 8 simultaneous-import OOM crash pattern
description: Wave 8 fires at T+20min; 8+ simultaneous import() calls cause JIT/parse memory spike → OS SIGKILL every ~22min. Fix: stagger imports across T+20-52min.
---

## Rule
Wave 8 in server/index.ts fires at ~T+20min. Any services added to Wave 8 MUST use
a staggered setTimeout wrapper for their import() calls — NOT an immediate import with
an internal delay. The import() itself triggers V8 JIT parsing regardless of whether
the work is deferred inside .then().

## Why
65 OOM crashes/day when 8+ modules imported simultaneously at T+20min:
- Each module = 2-10 MB of V8 JIT-parsed code
- Combined with existing heap (~400 MB at T+20min), simultaneous loads push over OOM limit
- OS issues SIGKILL instantly — no app-level log, no graceful shutdown
- Crash cycle: T+0 boot → T+20min import spike → OOM kill → T+20.5min restart → repeat

## How to apply
When adding a service to Wave 8 that has a delayed first run:
  WRONG: `import("./engine").then(async m => { await new Promise(r => setTimeout(r, Xmin)); await m.run(); })`
  RIGHT: `setTimeout(() => import("./engine").then(m => m.run()), Xmin)`

Services already staggered (as of this fix):
- weekly-report-engine: +30s
- daily-upload-digest: +60s
- trust-governance: +90s
- shorts-repurpose-engine: +5min
- automation-engine: +7min
- trend-rider-engine: +9min
- marketer-engine: +10min
- playlist-manager: +13min
- vod-optimizer-engine: +32min
- initPublishingWatchdog: +2min
- initChannelIntelligenceEngine: +3min
- startQueueRescheduler: +4min
- pipeline-self-heal: IMMEDIATE (lightweight, critical for recovery)
- initBackCatalogRunner: IMMEDIATE (has own 10-15min internal delay)

## Diagnosis signal
OS-level OOM: crash every ~22min, no WARN/ERROR app logs before crash, only
"starting up user application" [Info] entries in deployment logs at regular intervals.
