---
name: Shorts segment dead-zone (61–479s)
description: Items with segment duration between 61s and 479s can never publish — too long for the Shorts guard, too short for long-form. Root cause is stream-editor's fallback default being 75s. Fix and detection.
---

## The rule

Any autopilot_queue item whose `endSec - startSec` (or `segmentEndSec - segmentStartSec`) falls between **61s and 479s** is permanently undeliverable:
- Shorts publisher hard-rejects at `>= 60s` ("must be <60s for Shorts")
- Long-form publisher requires `>= 480s` (8 minutes minimum)
- No publisher ever picks them up; they cycle through the queue forever unless cancelled

Status `failed` (set by the Shorts publisher guard) is unsafe — the boot queue reset flips `failed` → `scheduled` on every restart. Must use `cancelled` + `failReason` starting with `'migration-'` to survive boot resets.

## Root cause observed in production

`stream-editor.ts` has `SHORTS_TARGET_SEC_DEFAULT = 75` as the fallback when `chooseBestShortDuration()` throws. Since 75 > 60, every item created from that exception path lands in the dead zone. **Fixed to 58** (2s margin below the 60s gate).

**Why:** `chooseBestShortDuration()` can throw if `youtube_output_metrics` has no data yet (new channel / no analytics). The fallback must always be < 60s.

## How to detect

In prod logs: `[ShortsPublisher] Item XXXXX has segment duration 75s — must be <60s for Shorts. Rejecting.` repeated for multiple items, all with the same exact duration (75s or another specific number). Same duration across many items → single source / single fallback value.

In the queue: `SELECT id, metadata->>'startSec', metadata->>'endSec', (metadata->>'endSec')::float - (metadata->>'startSec')::float AS dur FROM autopilot_queue WHERE content_type IN ('youtube_short','auto-clip') AND status NOT IN ('cancelled','completed') HAVING dur BETWEEN 61 AND 479` catches all dead-zone items.

## Fix pattern

Migration SQL (use 'cancelled' + failReason prefix 'migration-NNN:'):
```sql
UPDATE autopilot_queue
SET status        = 'cancelled',
    error_message = 'migration-NNN: segment duration dead zone (>60s Short max, <480s long-form min)',
    metadata      = COALESCE(metadata, '{}'::jsonb)
                 || '{"failReason":"migration-NNN:segment-duration-dead-zone"}'::jsonb
WHERE content_type IN ('youtube_short','auto-clip','vod-short','platform_short')
  AND status NOT IN ('completed','cancelled')
  AND (
    ((metadata->>'endSec')::float - (metadata->>'startSec')::float) BETWEEN 61 AND 479
    OR
    ((metadata->>'segmentEndSec')::float - (metadata->>'segmentStartSec')::float) BETWEEN 61 AND 479
  )
```

**Migration 090** is the first instance of this pattern; future sessions can add higher-numbered migrations with the same template.

## SHORTS_TARGET_SEC_DEFAULT constraint

`server/services/stream-editor.ts` line ~95: `const SHORTS_TARGET_SEC_DEFAULT = 58;`

If `chooseBestShortDuration()` is refactored or new callers are added, the fallback/default in any Short-duration computation must be ≤ 58 to survive the 60s guard with a safety margin. Never use 60 exactly (boundary condition risk).
