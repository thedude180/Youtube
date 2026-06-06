---
name: Live stream director architecture
description: live-stream-director.ts — master coordinator for the full stream lifecycle, what it does, what gaps it closed, and critical constraints.
---

## What it does

`server/services/live-stream-director.ts` is the single entry point that coordinates the full live stream lifecycle. Initialized via `initLiveStreamDirector()` in index.ts Wave 6, alongside live-chat-agent/idle-engagement.

### On `stream.started` (45 s delay):
1. Calls `prepareLiveStream(userId, streamId)` → AI-generated title, description, pinned message, FAQ
2. Applies title + description to the YouTube broadcast via `liveBroadcasts.update` (50 quota units, tracked as `broadcast`)
3. Posts the opening pinned message to YouTube Live Chat via `liveChatMessages.insert`
4. Starts director cycle (every 5 min)

### Director cycle (every 5 min):
- Emits `director_heartbeat` SSE with session stats (dashboard stays live without polling)
- Broadcast beats every 25–35 min (randomized): subscribe CTAs, clip teasers, hype checks, AI-generated game facts
- Initial 20-min silence enforced (INITIAL_BEAT_OFFSET_MS) — no beats in first 20 min

### On `stream.ended`:
- Stops cycle
- Auto-calls `afterStreamCopilot(userId, streamId)` → queues Shorts from clip moments, long-form replay, fires hype wave

## Gaps closed

Before the director:
- `prepareLiveStream` was never called automatically (manual API call required)
- YouTube broadcast title/description was never updated via API
- Pinned message was never posted to live chat
- `afterStreamCopilot` required manual `POST /api/youtube/copilot/after-stream/:streamId`

## Critical constraints

- **45 s startup delay** on `stream.started` — live detection system needs time to cache liveChatId; live-chat-agent uses 30 s, director uses 45 s
- **`stream.started` payload** includes `videoId` (broadcastId), `liveChatId`, `streamTitle` — but NOT `streamId` (DB ID). Director looks up the active stream from DB (`status = 'live'`, newest first)
- **`stream.ended` payload** DOES include `streamId` (DB ID) — use it directly for `afterStreamCopilot`
- **`liveBroadcasts.update`** costs 50 quota units (tracked as `broadcast`, NOT `upload` — `upload` = 1600 units)
- **`afterStreamFired` guard** prevents double-firing afterStreamCopilot if `onStreamEnded` is called multiple times
- **All YouTube API calls are non-fatal** — prep failure, metadata apply failure, pinned message failure all warn-log and continue

## Status endpoint

`GET /api/youtube/stream/director-status` — returns `{ isActive, streamId, streamTitle, gameName, durationMin, beatsPosted, nextBeatInMin }`

## Complementary services (do NOT remove or replace these)

- `live-chat-agent.ts` — polls YouTube chat every 2 min, answers questions, shouts out members, posts replies
- `stream-idle-engagement.ts` — fires engagement messages when chat goes quiet (6+ min idle)
- These are independent from the director and must all run in parallel
