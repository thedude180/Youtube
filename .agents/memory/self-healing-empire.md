---
name: Self-healing empire services
description: Publishing watchdog 3-layer verification + Channel Intelligence Engine architecture and boot wiring
---

## Publishing Watchdog — 3-layer verification

`server/services/publishing-watchdog.ts`

Layer 1: Public YouTube RSS feed (fastest, but can lag 15-30 min)
Layer 2: `pipeline_traces` WHERE stage='verified_live' AND createdAt > start_of_day — YouTube Data API confirmed public
Layer 3: `autopilot_queue` WHERE status='published' AND publishedAt > start_of_day — our own pipeline pushed it

All 3 layers must confirm 0 videos before recovery is triggered. Previously only Layer 1 was checked, causing false-alarm repairs when RSS lagged.

**Why:** RSS propagation delay was causing unnecessary publisher sweeps mid-day, wasting quota and creating duplicate upload risk.

**How to apply:** If watchdog is over-triggering, check Layer 2 and Layer 3 counts — if either is non-zero but RSS is zero, it's a propagation lag, not a real miss.

## Channel Intelligence Engine

`server/services/channel-intelligence-engine.ts`

Runs every 2 hours (startup delay: 35 min after other services).
Routes: GET/POST `/api/youtube/intelligence/status|run` in `server/routes/autopilot.ts`.
Dashboard: `ChannelIntelligencePanel` in `client/src/pages/dashboard/YouTubeAutopilotStatus.tsx`.

**Signal sources (DB only, no YouTube API calls per cycle):**
- `autopilot_queue` → publish rate (24h, 7d), queue depth next 7 days
- `youtube_output_metrics` → top game, top format, top duration bucket (avg performanceScore)
- `youtube_output_metrics` → zombie detection (views < 50, published 12-72h ago)
- `isQuotaBreakerTripped()` → in-memory quota state

**Health score (0-100):**
- publishRate: 25 pts — avg daily rate / 4 target * 25
- queueDepth: 25 pts — days of content / 7 * 25
- zombieFree: 25 pts — (1 - zombie_rate) * 25
- quotaHealth: 25 pts — 0 if quota breaker tripped, else 25

**Actions taken when triggered:**
- Zombie videos → log learning_event("zombie_detected") + trigger refreshStaleVideoMetrics()
- Queue depth < 7 Shorts → trigger runBackCatalogMonetizationCycle()
- Health < 60 AND 0 published today → run both publishers (long-form + Shorts)
- All decisions logged to learning_events table (sourceAgent="channel-intelligence")

**Boot wiring:**
- Import at index.ts line ~45: `initChannelIntelligenceEngine, stopChannelIntelligenceEngine`
- Init after `initPublishingWatchdog()` in Wave 8
- Shutdown in SIGTERM handler after `stopPublishingWatchdog()`

**Report object** (exported via getIntelligenceReport()): channelHealthScore, publishedLast24h, publishedLast7days, queueDepth, queueHealthDays, zombieCount, topGame, topFormat, topDurationBucket, quotaBlocked, actions[], lastRunAt, nextRunAt, scores{}
