---
name: Quota breaker false-trip from internal pre-gate
description: studio-publisher's canAffordOperation() pre-check throws {code:"QUOTA_EXCEEDED"} (string), markQuotaErrorFromResponse matched it and killed all publishing at 4,786/10,000 real units. Two fixes applied.
---

## What happened (Jun 12 2026)

Google Cloud Console showed only 4,786/10,000 YouTube API units used when the circuit breaker tripped at 9:21 AM UTC, killing all publishers for the rest of the day.

**Failure chain:**
1. `studio-publisher.ts`: `canAffordOperation(userId, "write")` returned false (UPLOAD_RESERVE too aggressive — see below)
2. Publisher threw: `Object.assign(new Error("YouTube API quota too low..."), { code: "QUOTA_EXCEEDED" })`
3. Catch block called `markQuotaErrorFromResponse(err)`
4. `markQuotaErrorFromResponse()` line 561: `code === "QUOTA_EXCEEDED"` → matched → `tripGlobalQuotaBreaker()` fired
5. All publishers globally blocked for the rest of the day from an **internal pre-gate error**, not a real YouTube API 403

## Fix 1 — Internal pre-gate guard in `markQuotaErrorFromResponse()`

Added at the top of the function (after the 401 guard):
```javascript
const isInternalPreGate = code === "QUOTA_EXCEEDED" && !status && !err?.errors && !err?.response;
if (isInternalPreGate) return false;
```

**Why this works:** Real YouTube API 403 errors always have:
- `err.code = 403` (numeric HTTP status), OR
- `err.errors[]` (Google API client error array), OR  
- `err.response` (axios/fetch response object)

Internal pre-gate errors have none of these — just a plain JavaScript Error with a string code we assigned ourselves. The guard catches exactly this case.

## Fix 2 — UPLOAD_RESERVE: 4,000 → 1,800

The old 4,000 reserve blocked ALL non-upload ops (writes, thumbnails) when:
- `remaining < cost + SAFETY_BUFFER + UPLOAD_RESERVE`
- `remaining < 50 + 200 + 4,000 = 4,250`
- i.e. after **5,750 units used** (57.5% of daily budget)

The new 1,800 reserve (1 upload slot × 1,600 + 200 safety):
- Non-upload ops blocked when remaining < 2,050
- i.e. after **7,950 units used** (79.5% of daily budget)
- Recovers ~2,200 usable units per day

## Rule

**`markQuotaErrorFromResponse()` must only trip the breaker for real YouTube API HTTP errors.** Any error thrown by internal quota pre-gate code (canAffordOperation returning false) must be excluded. The distinguishing signal: real YouTube errors have a numeric HTTP status or `errors[]` array; internal errors don't.

Never increase UPLOAD_RESERVE above 1,800 without checking Google Cloud Console first. The real unit cost of operations is the source of truth, not what the app's internal tracker shows.
