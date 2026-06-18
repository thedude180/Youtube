---
name: Wave startup DB contention window
description: Services inside Wave 8/9 that fire at T+90s hit peak DB pool contention at T+21-23min; must use ≥5min delay instead
---

## Rule
Any service that fires after a `wave(async () => { await sleep(N * 60_000); ... })` block must use a **minimum 5-minute initial delay** (not 90s) for its first DB query, if the wave starts at T+20min or later.

## Why
Wave 9 fires at T+20min. A 90s setTimeout inside the wave block fires at T+21.5min. This is exactly the peak DB pool contention window (T+21-23min) when 12 engines × 8s gap from Wave 10 are all starting simultaneously. The DB pool exhausts, the query throws "Failed query" / "Connection terminated due to connection timeout", and the startup call fails. The subsequent `setInterval` recovers, but logs an alarming "[Boot] ... startup failed" error.

## How to apply
- Services with critical first-run DB queries that are inside Wave 8/9/10 blocks: use `setTimeout(..., 5 * 60_000)` for the initial call, not 90_000.
- The 5-min delay aligns with common `setInterval(5 * 60_000)` patterns, so startup and recurring cadence are naturally staggered.
- Current example: `processAutoPublishQueue` in `stream-editor-auto-publisher` — changed from 90s to 5min.
