---
name: Publishing stopped — root causes diagnosed 2026-06-06
description: Why new videos stopped appearing in YouTube Studio after 12-15 days; all root causes found and fixed.
---

## The three stacked blockers

### 1. Null OAuth token (primary blocker)
- `[TokenGuardian] No backup token anywhere for channel 52 — user must reconnect`
- When tokens are null, publisher attempts upload → Google returns 401/403
- The 403 was being misinterpreted as a quota error, tripping the circuit breaker
- Fix: added auth-error exclusions to `markQuotaErrorFromResponse` (401, forbidden reason, insufficient permissions, invalid_grant — never trip quota breaker for auth errors)
- Fix: added pre-flight token check in `shorts-clip-publisher.ts` — if no token, reset item to `scheduled` with message and skip without burning quota

### 2. 395 items stuck in `pending` status
- Items accumulated since May 14 — download timeouts + OOM kills left items stuck in `pending`
- Publisher only picks up `scheduled` items (with small exception for `platform_short` with sourceYoutubeId)
- The publish queue appeared empty even though 395 items existed
- Fix: `cleanupStuckPendingItems()` added to `startup-migrations.ts` — runs on EVERY boot (no flag guard), resets all `pending` → `scheduled`

### 3. Quota breaker tripping from auth errors
- `markQuotaErrorFromResponse` was tripping the breaker on ANY 403, including auth-flavoured ones
- When tokens are null, the first YouTube API call returns 403/401 → breaker trips → ALL publishing blocked for the rest of the day
- This is why the channel published nothing despite the quota reset cron running publishers at midnight Pacific
- Fix: improved `markQuotaErrorFromResponse` to exclude 401, rate-limit 403s, and auth-flavoured 403s (forbidden, insufficientPermissions, invalid_grant, access denied)

## Dashboard
- Added reconnect banner to `YouTubeAutopilotStatus.tsx` — polls `/api/oauth/needs-reconnect` every 5 min; shows big red alert with link to `/api/youtube/reconnect` when token is null

## What the user must do
- Go to dashboard → click "Reconnect YouTube now" in the red banner
- After reconnect, publishing resumes at next midnight Pacific reset (publisher runs first after quota reset)

## Quota reset timing
- Quota resets at midnight Pacific = ~07:00-08:00 UTC (PDT offset)
- Quota reset cron (`initQuotaResetCron`) runs publishers FIRST after reset
- Items that are past-due get rescheduled to future slots automatically by publisher

**Why:**
These root causes compounded each other: null token → auth 403 → quota breaker trips → all services blocked. The stuck pending items meant the queue appeared empty anyway.
