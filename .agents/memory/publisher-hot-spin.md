---
name: Publisher perpetual-loop hot-spin
description: Both shorts and long-form perpetual publisher loops can enter a 2-5 second tight-spin when all items are skipped due to missing OAuth token.
---

## The Rule
Any perpetual publisher loop that returns `skipped > 0, published == 0, failed == 0` must NOT fall through to the "work done" fast-retry branch. It must use the same idle-backoff timing as an empty queue.

**Why:** When a YouTube channel has no OAuth token, the publisher sets each item back to `scheduled` status and increments `skipped`. The perpetual loop then sees `skipped > 0` which satisfies the else branch ("work done → retry in 2s"). The same items get picked up again 2 seconds later, creating an infinite hot-spin at 30 DB queries/sec. This hammers the database, burns CPU, and contributed to 19 production outage periods in 24h via crash-restart cycles.

**How to apply:**
In any perpetual publisher loop, the branch order must be:
1. `quotaExhausted` → sleep until midnight Pacific reset
2. `published == 0 && failed == 0 && skipped == 0` → genuinely empty → run recycler / idle backoff
3. **`published == 0 && failed == 0` (skipped > 0)** → no-token skip → idle backoff (90s shorts, 2min long-form). Do NOT run the recycler here — queue has items, just no token.
4. `else` (published > 0 or failed > 0) → work was done → fast retry (2s/5s)

Files fixed: `server/services/shorts-clip-publisher.ts`, `server/services/long-form-clip-publisher.ts`

## Symptoms
- Dev logs: `[ShortsPublisher] Channel N has no OAuth token — skipping item XXXX` repeating every 2 seconds
- Production: quota breaker trips at T+31s (not T+17min) because previous run burned quota via rapid DB+API calls before crashing
- Health check `/` returns 500 during the crash-restart window (~34s per cycle)
- 19+ outage periods per day correlating with the restart storm
