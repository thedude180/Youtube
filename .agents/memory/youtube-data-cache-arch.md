---
name: YouTube data cache architecture
description: Single hub service owns all YouTube read API calls; all background engines read from DB via cache getters.
---

## Rule
`server/services/youtube-data-cache.ts` is the **only** place that may call YouTube Analytics API or YouTube Data API for read-only purposes in background engines.

All other services must use:
- `getCachedVideoMetrics(userId, youtubeVideoId)` — DB-first (youtube_output_metrics, 4h TTL), API fallback
- `getCachedChannelStats(channelId)` — reads channels table, zero quota (platform-sync keeps it fresh)
- `getCachedChannelCTR(userId)` — system_settings backed, 6h TTL

## Scheduled refresh
`initYouTubeDataCache()` is wired in Wave 11 (T+40 min). First refresh fires 5 min later (T+45 min). Repeats every 4 h. Quota-gated: skips if breaker tripped or canAffordOperation returns false.

## Exemptions (intentional live API callers)
- `pipeline-tracer.ts` — must verify actual YouTube publish status in real time
- `stream-operator.ts` — needs live video state during active streams
- All upload / metadata write functions — unchanged (these are writes, not reads)

## Storage mapping
- Per-video metrics → `youtube_output_metrics` (measuredAt = freshness stamp)
- Channel stats → `channels` table (subscriberCount, viewCount, videoCount, lastSyncAt)
- Channel CTR → `system_settings` key = `ytcache:ctr:{userId}`, val = JSON `{ctr, impressions, fetchedAt}`

**Why:** Multiple background engines (shadow-analytics, performance-learner, live-director, growth-flywheel, brand-partnerships) were each calling YouTube Analytics API independently on their own schedules. Same data fetched 4–5× per afternoon → daily quota trip by 6 AM Pacific.

**How to apply:** Any new background service that needs YouTube stats must import from `youtube-data-cache.ts`, not from `youtube-analytics.ts` directly. If you need a new cached field type, add it to the cache service (new getter + batch refresh step), not to the individual engine.
