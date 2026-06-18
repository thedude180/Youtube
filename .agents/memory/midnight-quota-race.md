---
name: Midnight quota-reset race condition
description: quota-reset-audit re-trips breaker at midnight before publishers run; bypassBreakerCheck pattern fixes it
---

## The Race

At 00:00 Pacific (07:00 UTC), two crons fire in the same event-loop tick:

1. `initQuotaResetCron` → `clearQuotaBreaker()` → acquires IO slot → calls publishers
2. `automation-engine` "QuotaResetAudit" cron → `indexAllChannelVideos()` + `fetchViewsByDayAndHour()` → YouTube API → **QUOTA_EXCEEDED** (Google's reset isn't instantaneous) → `markQuotaErrorFromResponse` → **re-trips** global breaker for the new day

Publishers check `isQuotaBreakerTripped()` and see tripped → return `{published:0}` → `[QuotaReset] Still 0 published after retry`.

This silently blocked ALL publishing for 5+ days while 320 items accumulated.

## Evidence

Production log at `2026-06-17T07:00:00.692Z`:
```
[QuotaBreaker] YouTube API quota circuit breaker TRIPPED for 2026-06-17 — all YouTube API calls blocked until midnight Pacific
```
Triggered at exactly midnight by the quota-reset-audit's API call.

## Fix (applied 2026-06-18)

**Why:** `bypassBreakerCheck: true` passed by the midnight cron only; daytime perpetual loops still respect the gate.

1. `runShortsClipPublisher(opts?: { bypassBreakerCheck?: boolean })` — breaker check skipped when `opts.bypassBreakerCheck === true`
2. `runLongFormClipPublisher(opts?: { bypassBreakerCheck?: boolean })` — same
3. Midnight cron in `youtube-quota-tracker.ts` passes `bypassBreakerCheck: true` + calls `clearQuotaBreaker()` again just before each phase (belt-and-suspenders)
4. `automation-engine.ts` QuotaResetAudit cron: 5-minute `setTimeout` delay before `runQuotaResetAudit()` — lets publishers finish first AND gives Google's backend time to propagate the reset

**How to apply:** Any future midnight-window publisher call from a trusted cron should pass `bypassBreakerCheck: true`. Never pass it from regular service loops.
