---
name: Schedule type filter blind spot (auto-clip invisible to window system)
description: getShortsOnDay/getLastScheduledShortTime/countUploadedShortsForDate only queried youtube_short + platform_short; auto-clip (back-catalog) and vod-short were invisible — two clips from same window published minutes apart.
---

## The Bug

Three functions in `server/services/youtube-output-schedule.ts` used an incomplete type filter:

```js
inArray(autopilotQueue.type, ["youtube_short", "platform_short"])
```

Missing types:
- `"auto-clip"` — items queued by `youtube-back-catalog-engine.ts`
- `"vod-short"` — items queued by the VOD pipeline

**Effect**: When the back-catalog engine queues item A (auto-clip) for Window 3 at 9:05 PM, then queues item B, `getShortsOnDay()` doesn't see item A → Window 3 appears empty → item B also lands in Window 3 at 8:27 PM → both Shorts publish within 38 minutes of each other.

`getLastScheduledShortTime()` had the same missing types → the 5.5h MIN_SHORT_GAP_MS check also failed to enforce spacing between back-catalog clips.

Confirmed by screenshot: two AC Valhalla Shorts with identical titles, 38 min apart, both in YouTube Studio "Latest published content".

## Affected Functions (all in youtube-output-schedule.ts)

1. `getShortsOnDay()` — `winOccupied` check
2. `getLastScheduledShortTime()` — `MIN_SHORT_GAP_MS` gap enforcement
3. `countUploadedShortsForDate()` — `MAX_SHORTS_PER_DAY` daily cap

## Fix

Changed all three `inArray(autopilotQueue.type, ...)` filters from:
```js
["youtube_short", "platform_short"]
```
to:
```js
["youtube_short", "platform_short", "vod-short", "auto-clip"]
```

## Rule

Any function that counts or checks scheduled Shorts must include ALL Short-producing types: `youtube_short`, `platform_short`, `vod-short`, `auto-clip`. `getUploadsOnDay()` correctly has no type filter (counts all upload types).
