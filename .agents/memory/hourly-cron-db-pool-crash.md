---
name: Hourly cron DB pool exhaustion pattern
description: Short-interval idle-check timers align with hourly cron window → DB pool exhaustion → healthcheck timeout → crash loop.
---

## Rule
Any service that runs an idle-check timer at a short interval (≤5min) will eventually align with the hourly Node-CRON window (00:00 of each UTC hour). When that happens on a production boot, the combined DB queries from cron jobs + idle-check timers + background services all hit the pool simultaneously, exhausting all connections, and the healthcheck times out → container restart.

**Fix:** Idle-check intervals that do lightweight "is there work?" DB queries must be ≥30min. Active-work retry intervals (e.g. retrying after a batch) can be shorter, but a "nothing to do, check again soon" fallback must be ≥30min.

## How to apply
- `IDLE_CHECK_MS` or any constant named `*_IDLE*`, `*_CHECK*`, `*_POLL*` used in a "no work found, schedule next check" branch → must be ≥30min (1_800_000 ms).
- Content-loop: was 5min → raised to 30min (Jun 15 2026). Prior to fix, boot at 07:35 UTC → 5th idle tick at 08:00 UTC → converged with hourly crons → crash.

**Why:** The production container boots at a stable time (~07:35 UTC). With a 5-min idle interval, each tick lands at :35, :40, :45, :50, :55, :00 — the 5th tick always hits the top of the hour where multiple cron jobs also fire. Pool has ~10 connections; 5+ services querying simultaneously exhausts it.

## Also: permanent_fail items with no failReason resurrect
Wave 0.6 boot reset promotes ALL `permanent_fail` items to `scheduled` WHERE `failReason IS NULL OR failReason NOT LIKE 'migration-%'`. If a video processor permanently fails an item but doesn't write a `failReason`, that item will resurrect on every restart. The fix is a startup migration that sets `status='cancelled'` + `failReason='migration-NNN:...'`. The `cancelled` status is also immune to the boot reset and provides a second layer of protection.

Example: T4PKhDhQPp0 (items 42305/42326) — geo-blocked video, no failReason → yt-dlp storm on every boot until migration 082 cancelled them.
