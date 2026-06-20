---
name: Midnight publish empty-queue fix
description: Why the quota reset cron gets 0 published and how Phase 3 fixes it
---

## The problem
At 07:00 UTC (midnight Pacific) the quota reset fires. Publishers run but queue is empty →
0 published. Back-catalog runner was scheduled for reset+5min = 07:05. The retry check
fires at 07:02 — still 0 because the runner hasn't seeded the queue yet. System warned
"Still 0 published after retry" and gave up. Loop-conductor caught it ~55 min later.

## The fix (quota-reset cron Phase 3)
When both retry passes return 0 AND quota is not exhausted:
1. `setImmediate` fires `runBackCatalogForAllEligibleUsers()` (5-min cap via Promise.race)
2. Kicks `runPreEncodeCycle()` immediately after
3. Waits 10 min for encoding, then does a final `runLongFormClipPublisher` + `runShortsClipPublisher`
4. Entirely fire-and-forget — never blocks the main cron

## Timer change
`msUntilQuotaReset()` in back-catalog-runner: changed from +5min to +2min after reset.
Phase 3 handles the immediate seed; runner provides the follow-up top-up at +2min.

**Why:** The +5min gap meant the runner always missed the cron's retry window. Phase 3
bridges the gap so the midnight quota day starts with at least one publish attempt succeeding.

**How to apply:** Any future rescheduling of the back-catalog-runner quota-deadlock timer
should remain ≤5min so it doesn't miss the cron's Phase 3 window (which fires immediately
and waits up to 15 min total).
