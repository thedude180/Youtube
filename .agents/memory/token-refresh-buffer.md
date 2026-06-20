---
name: Token refresh REFRESH_BUFFER_MS=24h cascade
description: How refreshExpiringTokens + keepAliveAllTokens interact for OAuth token freshness
---

## The Rule
`REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000` in `server/token-refresh.ts`. This means `refreshExpiringTokens()` queries for channels where `tokenExpiresAt < NOW() + 24h`. Since Google gives 1-hour access tokens, ALL active tokens always satisfy this condition → every call to `refreshExpiringTokens()` refreshes all active tokens.

`pipeline-self-heal` calls `refreshExpiringTokens()` (via `healTokens()`) every 30 minutes. So active tokens are effectively refreshed every 30 minutes.

## The Gap Fixed
`keepAliveAllTokens()` (in `server/token-refresh.ts`) had a guard: skip if refreshed in the last 20 hours. This meant after a boot refresh at T+10min, the next keepalive was at T+12h — but the 1h Google token would expire at T+1h10min with no proactive refresh from keepAlive.

**Fix:** Added `tokenExpiringSoon` override — if `token_expires_at < NOW() + 2h`, force a refresh regardless of last-refresh time.

**Why the fix is belt-and-suspenders:** The pipeline-self-heal 30-min cycle already handles it via `refreshExpiringTokens`. The keepalive fix covers the window before self-heal's first cycle fires (T+0 to T+30min).

## How to Apply
- Any service that checks token validity before publishing should use `channelCanPublish()` (threshold: < 5min remaining → `canPublish: false, shouldRefresh: true`).
- The publisher loop MUST call `refreshExpiringTokens()` or wait for self-heal when `shouldRefresh: true` — do NOT simply bail without retry.
- Do not lower `REFRESH_BUFFER_MS` — it is intentionally 24h to catch all 1h tokens.
