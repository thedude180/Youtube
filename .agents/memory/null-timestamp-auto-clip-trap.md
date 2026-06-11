---
name: Null-timestamp auto-clip duplicate trap
description: Auto-clips missing startSec/endSec silently extract 0–60s for every item → all identical; vod-long-form missing segmentStartSec/segmentEndSec fails as "Segment too short (0m)"
---

## Rule
Auto-clip queue items MUST have explicit timestamps. Missing fields are NOT safe to default.

**Shorts (contentType=youtube-short / platform_short / vod-short):**  
Pre-encoder defaults `startSec=0, endSec=60` when both are null. With N clips all from the same source, every single one extracts the identical first minute → duplicate Shorts spam. Pre-encoder now hard-cancels null-timestamp Short items instead of silently using the fallback.

**Long-form / vod-long-form:**  
Publisher reads `segmentStartSec/segmentEndSec`; both null → `rawDurationSec=0` → fails immediately with "Segment too short (0m)". Always set `segmentStartSec=0` and `segmentEndSec=<large value>` (e.g. 28800 for 8h) when creating vod-long-form items without a known duration.

## Why
Back-catalog runners and AI clip generators sometimes create queue items with descriptive text ("A tense boss fight…") but without the actual video timestamps that locate the moment. When those items reach the pre-encoder, the 0/60 fallback looks like valid data — no error, no log — and each encode produces byte-for-byte identical content.

## How to apply
- Any code path that creates auto-clip type items must set `startSec` + `endSec` (Short) or `segmentStartSec` + `segmentEndSec` (long-form) before inserting.  
- If timestamps can't be computed at insert time, don't insert — wait until the timestamp analysis completes.
- Migration 043 is the one-time cleanup for the existing null-timestamp batch.
- Pre-encoder guard (added 2026-06-11) cancels at encode time as a safety net.
