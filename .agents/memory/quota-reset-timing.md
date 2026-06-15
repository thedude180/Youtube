---
name: YouTube quota reset timing — UTC midnight vs Pacific
description: YouTube Data API quota resets at midnight UTC, which is 5 PM Pacific (PDT, UTC-7). Token budgets exhaust by 10 AM Pacific every day, leaving a 7-hour dead window before the reset.
---

## The rule

YouTube Data API quota (10,000 units/day) resets at **00:00 UTC** = **5:00 PM Pacific (PDT)** = **4:00 PM Pacific (PST)**.

This means:
- The effective work window is **5 PM → ~10 AM Pacific** (17 hours)
- By 10:00 AM Pacific, most AI engines are at 80–100% budget exhaustion (observed in prod logs)
- From ~10 AM → 5 PM Pacific (~7 hours) the system is effectively throttled

## Observed in production (2026-06-15)

| Engine | Exhaustion time (UTC) | Pacific equivalent |
|--------|----------------------|-------------------|
| RepurposeEngine | 16:18 UTC | 9:18 AM PDT |
| viral-optimizer | 16:45 UTC (hourly cap: 6k/8k) | 9:45 AM PDT |
| content-grinder | 16:54 UTC (82% of daily budget) | 9:54 AM PDT |

All three near-exhausted before 10 AM Pacific.

## Why it matters for scheduling

- **Publishers must be front-loaded** to the 00:00–08:00 UTC window (5 PM–1 AM Pacific) — this is right after quota resets, when there are plenty of units available
- Back-catalog runner and AI orchestrator full cycles should fire shortly after quota reset, not 22–24h from an arbitrary boot time
- The `scheduleNextRun()` function in the back-catalog runner already targets `getNextResetTime() + 5min` when the breaker is active (fixes quota-timing deadlock)

## How to apply

When diagnosing "engines not running" or "quota already exhausted at boot": check the current UTC time. If it's 08:00–23:59 UTC (1 AM–5 PM Pacific), the quota was consumed during the prior cycle window. Wait for 00:00 UTC or check if the reset cron fired.

When scheduling new engine cycles: prefer UTC 00:00–06:00 for heavy batch work. Avoid scheduling new heavy loops to start at random boot times — they will fire during the exhaustion window half the time.
