---
name: MrBeast acceleration framework
description: 5-part upgrade applying MrBeast creator methodology across the entire content pipeline — hook scoring, hot streak doubling, 24h feedback loop, game-aware SEO, and brain-guided clip selection.
---

## The 5 Parts

### 1. mrbeast-hook-scorer.ts (NEW utility)
- `scoreMomentHook(moment, videoDurationSec)` → HookScore (0-100)
- `rankMomentsByHook(moments[], videoDurationSec)` → sorted by score desc
- Dimensions: retention score (40pts) + position (25pts) + duration fit (20pts) + title power words (15pts)
- Power words dict includes BF6-specific terms (sundance, mackay, conquest, breakthrough)
- No DB calls — pure math, safe to call anywhere

### 2. creator-acceleration-engine.ts (NEW service)
- Runs every 2h, startup at T+32min (after Wave 11 association engine settles)
- Hot streak: video performing 2× channel avg in 12-42h window → queue 2 more clips from same game
- Cold autopsy: video <25% avg after 48h → writes "avoid_pattern" to masterKnowledgeBank
- Queue velocity check: <9 Shorts in next 3 days → writes "acceleration_needed" signal
- Uses golden-ratio offset (0.618) for clip positions to avoid duplicating existing timestamps
- Cooldown: `_hotStreakProcessed` Map; same video skipped for 40h after processing
- Wired in Wave 11 (same sequential boot list as brain-association-engine)
- initCreatorAccelerationEngine() returns a dummy interval (real logic uses setTimeout + setInterval)

### 3. vod-seo-optimizer.ts upgrades
- Now imports getFocusGame() (no args) — persona is now "ET Gaming 274 — no-commentary {game} highlights channel"
- Added getBrainTitlePatterns(userId) — queries top 6 active masterKnowledgeBank entries by confidence
- Brain patterns injected as `${brainPatterns}` in the basePrompt context block
- CHANNEL STYLE directive added: "lead with action/intensity, not channel name"
- PS5 system prompt persona fully removed from both the prompt and the system message fallback

### 4. youtube-performance-learner.ts — runRapidFeedback24h(userId)
- Finds videos published 2-39h ago not refreshed in last 2h (limit 10)
- Calls recordVideoPerformance() to refresh analytics
- Gets 30-day channel avg views (Shorts only) as baseline
- Hot (2× avg, short) → masterKnowledgeBank category="hot_streak_formula", confidence=min(92, 50+mult*15)
- Cold (<25% avg, short, >36h old) → category="avoid_pattern", confidence=55
- Called by creator-acceleration-engine every 2h (and also from daily brain cycle)
- Guard: returns early if channelAvgViews < 10 (not enough history)

### 5. youtube-back-catalog-engine.ts — hook ranking
- After all 3 extraction tiers complete (Vision AI → retention curve → transcript AI)
- Before the queuing loop: `rankMomentsByHook(clipTimestamps, dur)` re-sorts
- Only runs when clipTimestamps.length > 1 (sorting 1 item is pointless)
- Falls back to original order silently on any error (non-critical path)
- `dur` (videoDurationSec) was already in scope from the outer loop

## Key column/API gotchas
- getFocusGame() takes NO arguments (not userId) — it reads from system_settings
- initCreatorAccelerationEngine() must be called synchronously (not via async import), hence the direct import in index.ts rather than a lazy `import().then()`
- Hot streak queuing respects isShortScheduleSaturated() + getNextShortPublishTime()
- masterKnowledgeBank inserts use `.catch(() => {})` to suppress duplicate key errors
