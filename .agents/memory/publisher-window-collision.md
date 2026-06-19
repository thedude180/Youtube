---
name: Publisher window-collision guard
description: Items queued before window-claim system was solid had clustered scheduledAt; publisher now checks 90-min proximity within a batch run
---

## The Problem

The Shorts publisher only called `getNextShortPublishTime()` for items where
`scheduledAt <= now + 60s` (past-due). Items with FUTURE `scheduledAt` weren't
re-validated for window collisions. When the back-catalog engine queued multiple
items in a batch (before the DB window-claim system was mature), they could all
get `scheduledAt` values within the same 90-minute window. The publisher uploaded
them all to YouTube with those clustered `publishAt` times → YouTube published
3 Shorts within 1 hour instead of spread over the day.

## The Fix (server/services/shorts-clip-publisher.ts)

Added before the `for (const item of dueItems)` loop:
```javascript
const batchClaimedSlots: Date[] = [];
const BATCH_MIN_GAP_MS = 90 * 60_000;
```

After each item's past-due reschedule logic:
```javascript
const hasWindowCollision = batchClaimedSlots.some(
  s => Math.abs(s.getTime() - effectiveScheduledAt!.getTime()) < BATCH_MIN_GAP_MS
);
if (hasWindowCollision) {
  // reschedule via getNextShortPublishTime() + db.update()
}
batchClaimedSlots.push(effectiveScheduledAt!);
```

## Why

**Why:** The DB window-claim system (`short_slot_claims` table) prevents NEW queuing
from creating collisions, but doesn't retroactively fix items already queued with wrong
times. The publisher is the last line of defense before YouTube upload.

**How to apply:** If 3 Shorts appear in the same 1-2 hour window again, check if
`batchClaimedSlots` logic is still in place and that `BATCH_MIN_GAP_MS = 90 * 60_000`.
The 90-minute minimum matches `MIN_ANY_GAP_MS` in `youtube-output-schedule.ts`.
