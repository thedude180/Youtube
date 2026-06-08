---
name: Pre-encoder shelf routing bug
description: auto-clip items were always classified as long-form, causing back-catalog Shorts to be encoded 16:9 landscape and land on the regular video shelf.
---

## Rule
In `server/services/pre-encoder.ts`, `isShortContent` (from `contentType`) must be checked FIRST and used as a veto before any `item.type`-based long-form detection.

**Why:** Back-catalog Shorts are stored in `autopilot_queue` with `type="auto-clip"` AND `metadata.contentType="youtube-short"`. The original `isLongForm` check treated `item.type === "auto-clip"` as an unconditional long-form signal, so back-catalog Shorts got encoded with `encodeLongForm` (3840x2160 16:9 landscape) instead of `encodeShort` (2160x3840 9:16 portrait). YouTube saw a landscape video and placed it on the regular video shelf instead of the Shorts shelf.

**How to apply:**
1. Check `isShortContent` (contentType === "youtube-short" | "platform_short" | "vod-short") BEFORE evaluating `item.type`.
2. `isLongForm = !isShortContent && (contentType long-form OR item.type long-form)`.
3. Also fall back across BOTH timestamp field names when encoding Shorts: back-catalog Shorts store bounds as `segmentStartSec/segmentEndSec`; grinder Shorts use `startSec/endSec`. Use `meta.startSec ?? meta.segmentStartSec` so switching the encoding path doesn't zero the bounds.
