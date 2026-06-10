---
name: Human brain learning upgrades
description: 4-part upgrade making the AI learning brain work more like a human — internet-aware, associative, forgetful of stale knowledge, weekly strategic synthesis.
---

## The 4 Upgrades

### 1. Game-Aware Harvester (omni-intelligence-harvester.ts)
- All hardcoded "PS5" queries replaced with `getFocusGame()` dynamic calls
- YouTube searches: `${focusGame} best moments ${year}` + `${focusGame} highlights ${year}`
- Reddit: adds game-specific subreddits from focus game name (BF6 → r/battlefield + r/battlefield2042)
- DuckDuckGo: `${focusGame} youtube content strategy` + `${focusGame} trending topics`
- AI synthesis prompt now names the channel correctly + focus game

### 2. Brain Association Engine (NEW: server/services/brain-association-engine.ts)
- Runs every 2h, T+28min startup delay
- Reads: predictiveTrends + nicheVideoSamples + intelligenceSignals (external world)
- Reads: channelSuccessDna + youtubeOutputMetrics + masterKnowledgeBank (channel performance)
- AI makes cross-signal connections → writes to masterKnowledgeBank (category="association_insight")
- Also writes to engineKnowledge for cross-pollination mesh
- Wired in Wave 11 of index.ts after omni-intelligence-harvester

**Why:** The harvester ran every 6h but the synthesis only happened once per 20h daily cycle.
Association engine closes that gap — external events → channel content decisions in 2h not 20h.

### 3. masterKnowledgeBank Temporal Decay (memory-architect.ts)
- Runs inside compressMemoryForUser() (every 2h)
- Staleness: COALESCE(lastReinforcedAt, updatedAt, createdAt) < now - 30 days
- Decay rate: -3 confidence per cycle for unreinforced principles
- Deactivation threshold: confidence < 20 → isActive=false
- Exempt categories: "system_lesson" (permanent operational rules), "daily_digest" (recent history)

**Why:** Knowledge bank grew forever. 6-month-old stale principles were still injected into every
AI prompt at full confidence, potentially guiding bad decisions about current trends.

### 4. Weekly Deep Synthesis (youtube-learning-brain.ts)
- Function: runWeeklySynthesis(userId) — guard: WEEKLY_CYCLE_INTERVAL_MS = 168h
- Triggered fire-and-forget at end of runDailyLearningCycle when 7 days elapsed
- Reads: top 30 active masterKnowledgeBank + 15 learningInsights + 10 systemIncidents + top 10 videos + recent association_insights (7d)
- Writes: masterKnowledgeBank entry with category="weekly_strategy_brief" (confidence 85)
- On failure/no-slot: deletes from _lastWeeklyCycleAt so next daily cycle retries

**Why:** Daily cycle is narrow (channel metrics only). Weekly synthesis does the "step back"
that a human creator does — reviewing all signals holistically to set the next 7-day strategy.

## Column name gotchas (for future edits)
- channelSuccessDna: column is `pattern` (not patternValue), `sampleCount` (not sampleSize)
- youtubeOutputMetrics: no `title` column → use `youtubeVideoId`; `averageViewPercent` (not avgViewDurationPct)
- systemIncidentLog: NO userId column (global log); use `rootCause` (not `summary`)
