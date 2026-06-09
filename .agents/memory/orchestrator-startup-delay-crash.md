---
name: Orchestrator startup delay crash loop
description: YouTube AI Orchestrator's 30–40s STARTUP_DELAY_MS caused T+15.5min OOM crash loop — 69 crashes/day; fixed by pushing to 20–25min after Wave 8 (T+35–40min total).
---

## The rule
`STARTUP_DELAY_MS` in `youtube-ai-orchestrator.ts` must stay at `jitter(20 * 60_000, 5 * 60_000)` (20–25 min after Wave 8 fires). Do NOT reduce it back below 10 minutes.

**Why:** Wave 8 fires at T+15min and calls `initYouTubeAIOrchestrator()`. With the old 30–40s delay, the orchestrator's first full AI cycle fired at T+15:30 — exactly when all 8 Wave 7 services were starting their first cycles. This saturated AI slots → OOM → MemoryGuardian restart → 69-crash-per-day loop. Confirmed by production log: `[YouTubeAI] Skipped — quota breaker active` appeared at T+16min exactly (matching crash interval). The crash only happened when quota was available; quota-depleted sessions were stable because the orchestrator skipped all work.

**How to apply:** Any time you touch the orchestrator timing, verify `STARTUP_DELAY_MS >= 15 * 60_000`. The light cycle interval (LIGHT_CYCLE_MS ~4h) and full cycle (FULL_CYCLE_MS ~22–24h) are fine as-is. The first-run delay is the only dangerous one.

## What was also fixed in the same session
- `intelligent-job-queue.ts`: Added `post_upload_thumbnail` to the boot-time stale job cleanup type list. Stale thumbnail jobs survived restarts and processed in sequence (72179→72178→72177 log pattern) — now cleared on boot if >10 min old.
- `server/index.ts` Wave 7: Removed `resilience-watchdog` from `staggeredBoot`. It was also registered in Wave 11 via `healthBrain.register()` — two concurrent instances both polling every 30s.
