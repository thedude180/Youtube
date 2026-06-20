---
name: Back-catalog runner log level + deferral bypass
description: Production deployment logs only capture WARN+; runner lifecycle messages must be WARN not INFO; AI-semaphore pressure causes perpetual silent deferral.
---

## Rule
All key lifecycle log lines in `youtube-back-catalog-runner.ts` MUST use `logger.warn`, not `logger.info`. Deployment logs only capture WARN and ERROR levels — INFO is invisible in production monitoring.

Affected messages: Scheduled, Startup delay complete, Starting cycle, All users complete, No eligible users found, Last run deferred/retrying, Deferred (N/12).

## Why
The backlog-engine viral-optimizer runs AI calls continuously. When AI API returns "No response", calls hang for up to 90s before failing. With 4+ concurrent calls, `aiSlotsPct >= 62` → system phase = "recovering" → `canRunHeavyWork()` = false → back-catalog runner defers. Since the deferral log was `logger.info`, zero runner entries appeared in deployment logs despite the runner being initialized and retrying every 5 min.

## Bypass gate
`_consecutiveDeferrals` counter increments on each phase/AI-slot deferral. After 12 deferrals (~60 min), the phase/AI gate is bypassed and the catalog import is forced. Memory and quota gates are never bypassed. Counter resets to 0 when the gate passes cleanly.

## How to apply
- Any new runner that defers to `canRunHeavyWork()` must log at WARN level.
- A consecutive-deferral bypass is appropriate for pipeline-critical services where indefinite blocking starves the entire content pipeline.
- Do NOT bypass the memory gate (< 300MB free) — that protects against OOM.
- Do NOT bypass the quota gate — that prevents unnecessary YouTube API burns.
