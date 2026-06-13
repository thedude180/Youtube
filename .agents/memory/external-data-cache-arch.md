---
name: External data cache architecture
description: Central cache for all non-YouTube external API reads (Wikipedia, DuckDuckGo, Reddit). No background engine may call these directly.
---

## Rule
`server/services/external-data-cache.ts` is the ONLY place that may fetch from Wikipedia, DuckDuckGo, or Reddit for background-engine reads. All callers use the exported getters.

## Getters
- `getCachedWikiResults(query, maxResults?)` → `string` — pre-formatted "Title: snippet\n..." lines, HTML-stripped. Key: `extcache:wiki:<query>`. TTL: 24h.
- `getCachedDDGResult(query)` → `{ abstract: string, related: string[] }`. Key: `extcache:ddg:<query>`. TTL: 24h.
- `getCachedRedditFeed(subreddit, type)` → `CachedRedditPost[]`. Key: `extcache:reddit:<sub>:<type>`. TTL: 2h.
- `getCachedSubredditFeeds(subs[])` → multi-sub deduped array (used by routes/ai.ts demand-feed route).

## Storage
All cached in `system_settings` table as JSON with `{ value, fetchedAt }` envelope. Same `readCache`/`writeCache` helpers as youtube-data-cache.ts.

## Init
`initExternalDataCache()` wired at Wave 11 (T+45min) in `server/index.ts` alongside `initYouTubeDataCache()`. Pre-warms Reddit feeds at T+2min then every 2h. `stopExternalDataCache()` in shutdown handler.

## Callers redirected (all 7)
- `self-improvement-engine.ts` ×2 — curiosity pursuit + strategy scan → `getCachedWikiResults`
- `growth-flywheel-engine.ts` ×1 — competitive intel → `getCachedWikiResults` + `getCachedDDGResult`
- `thumbnail-intelligence.ts` ×1 — searchWebForThumbnailArticles → `getCachedWikiResults`
- `internet-benchmark-engine.ts` ×1 — searchWebForDomain (loops per query) → both getters
- `live-chat-agent.ts` ×1 — researchQuestion → wiki first, DDG fallback
- `routes/ai.ts` ×1 — /api/reddit/demand-feed → `getCachedSubredditFeeds`
- `shadow-analytics-engine.ts` ×1 — `fetchChannelPublicStats` (InnerTube browse) REMOVED; replaced with DB read from `channels` table (subscriberCount/videoCount already fresh via platform-sync every 12h)

**Why:** These 5+ services independently fetched the same Wikipedia/DuckDuckGo/Reddit URLs on each cycle. With a focused channel (BF6), many queries are identical. One fetch per 24h replaces dozens of redundant external calls.

**How to apply:** Any new service needing Wikipedia, DDG, or Reddit content must import from `external-data-cache.ts`. Never add `fetch("https://en.wikipedia.org/...` or `fetch("https://api.duckduckgo.com/..."` to a background service.
