---
name: Closed-loop trinity — adaptive mode, fast-learner, growth milestones
description: Three autonomous engines added to close every missing feedback loop in CreatorOS.
---

## The three engines

### 1. Adaptive Mode Engine (`server/services/adaptive-mode-engine.ts`)
- Modes: PEAK (85-100) / NORMAL (60-84) / CONSERVATIVE (35-59) / RECOVERY (0-34)
- `computeAndSetAdaptiveMode(healthScore, quotaRatio, incidentCount)` — called by loop-conductor each cycle
- `getAdaptiveMode()` — read by any service to get current config
- Written to: `service_state("adaptive-mode", "current")`
- Sharp downgrades (PEAK→CONSERVATIVE, NORMAL→RECOVERY) log to incident_log for brain learning

### 2. Fast Learner (`server/services/fast-learner.ts`)
- Scans every 10min (first at T+8min after init)
- Detects: CONTENT_TYPE failures (3+/2h → 4h block), SOURCE_VIDEO failures (3+/2h → 6h block), ERROR_STORM (5+/30min → incident)
- `checkFastBlock(type, target)` — always fails OPEN (returns false on error, never blocks)
- Written to: `service_state("fast-learner", "blocks")` as `{ blocks: FastBlock[] }`
- Brain Step 9v promotes blocks >4h old to masterKnowledgeBank permanent rules

### 3. Growth Milestone Engine (`server/services/growth-milestone-engine.ts`)
- Checks every 6h (first at T+3min after init)
- Tiers 0-4: 0(<1K), 1(1K-5K), 2(5K-10K)←CURRENT, 3(10K-50K), 4(50K+)
- `getMilestoneConfig()` — always returns current tier config, falls back to Tier 2 defaults
- Written to: `service_state("growth-milestones", "current-tier")` and `"tier-config"`
- Brain Step 9w writes growth strategy principle to masterKnowledgeBank

## Loop-conductor integration
- Imports `computeAndSetAdaptiveMode` + `AdaptiveModeConfig`
- VIRAL_VIEWS_THRESHOLD lowered 500→300 (base SQL filter; mode-aware filter applied after)
- Mode threshold applied to `state.highPerformers` after adaptive mode computed
- `writeSnapshot` now includes `adaptiveMode` and `adaptiveModeScore` fields

## Brain integration (Steps 9v + 9w)
- Step 9v: promotes fast-learner blocks >4h old to masterKnowledgeBank (max 5/cycle)
- Step 9w: writes growth tier principle → every AI prompt knows current tier + capabilities

## Boot wiring (index.ts Wave 10 sequential)
- Added after loop-conductor: adaptive-mode-engine, fast-learner, growth-milestone-engine
- All three gated by `isEnabled(s.label)` (standard pattern)

**Why:** These three close the only remaining open loops: system can't adapt its own intensity, failures took 24h to learn from, and channel growth had no effect on system behavior.
