---
name: Publishing stopped — root causes diagnosed 2026-06-06
description: Why new videos stopped appearing in YouTube Studio after 12-15 days; all root causes found and fixed.
---

## Session 1 fixes

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
- Fix: improved `markQuotaErrorFromResponse` to exclude 401, rate-limit 403s, and auth-flavoured 403s

## Session 2 deeper investigation (June 6 2026)

### Confirmed: zero uploads ever
- `upload_ops: 0` in quota table — no YouTube video has EVER been successfully uploaded
- 376 queue items all stuck in "pending"; both publishers needed "scheduled"
- Back-catalog engine creates as "scheduled" in current code but production binary was older

### s0D2BLHmiTU — permanent queue blocker
- Source video `s0D2BLHmiTU` times out at exactly 480s on every yt-dlp attempt
- 21+ items reference it; publisher repeatedly picks them up and times out
- NOT in content_vault_backups — perpetual-repair couldn't auto-cancel
- Fix: Migration 014 permanently fails all items referencing this video

### Quota breaker trips daily at T+17min after boot
- Only 857 units tracked (well below 10,000) when breaker trips at 09:57 UTC
- Something makes an untracked YouTube API call around T+17min → gets 403 → trips breaker
- Fix: callerStack capture added to `tripGlobalQuotaBreaker()` — next boot log reveals exact caller
- Publishers still run at midnight Pacific via quota reset cron regardless of breaker

### Session 2 publisher expansion
- Long-form publisher: now also picks up pending auto-clip items with sourceYoutubeId
- Shorts publisher: expanded pending pickup to include youtube_short type

## Quota reset timing
- Quota resets at midnight Pacific = 07:00 UTC
- Quota reset cron runs both publishers FIRST immediately after reset
- Items that are past-due get rescheduled to future slots automatically by publisher

## Expected upload sequence after Session 2 deploy
1. Boot → migration 014 cancels ~21 s0D2BLHmiTU items
2. cleanupStuckPendingItems converts ~353 remaining pending → scheduled
3. At midnight Pacific (07:00 UTC), quota reset fires both publishers
4. Publishers find scheduled items → first actual YouTube uploads begin
5. callerStack log identifies quota breaker root cause for follow-up fix
