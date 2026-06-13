---
name: Back-catalog runner quota timing deadlock
description: The back-catalog runner fires into an already-tripped quota window every day and reschedules 22-24h into the same window — an infinite deadlock preventing BF6 catalog from ever being mined.
---

## The Rule
When `scheduleNextRun()` detects `isQuotaBreakerTripped()`, it must schedule for `getNextResetTime() + 5min` (midnight Pacific), NOT the adaptive interval (up to 24h).

**Why:** The runner fires at T+10-15min after boot. The quota breaker loads yesterday's exhausted state immediately on boot and stays tripped until midnight Pacific (~07:00 UTC). So the runner always lands in the tripped window, skips, reschedules 22-24h later — which is the same window the next day. Infinite deadlock.

**How to apply:**
- In `scheduleNextRun()` in `youtube-back-catalog-runner.ts`: check `isQuotaBreakerTripped()` BEFORE computing adaptive interval. If tripped, compute `msUntilReset = getNextResetTime().getTime() - Date.now() + 5min` and use that.
- The `+5min` buffer lets the publishers fire first (they're scheduled for midnight Pacific exactly).
- If `msUntilReset <= 5min` (reset already passed), fall back to 23h (next day's reset).
- This is already implemented in `msUntilQuotaReset()` helper added to the runner file.

## Production state when discovered (2026-06-13)
- 45 BF6 videos (8-12h stream replays) with scores 80-100 → NEVER mined
- All had `mined_for_shorts=false, mined_for_long_form=false`
- `LONG_FORM_OPPORTUNITY_THRESHOLD = 20`, BF6 avg score = 89.8 (well above threshold)
- 29 of 45 BF6 videos have opportunity scores; all 29 long-form candidates (duration > 3600s)
- After fix: runner will fire at ~07:05 UTC every day, right after quota reset
