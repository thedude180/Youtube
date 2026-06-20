---
name: ASI capability closure — 5 gaps
description: The 5 remaining ASI gaps and how they were closed; design decisions for the 5 new services.
---

## The 5 gaps and their closures

### Gap 1 — Unbounded goal space
`server/services/autonomous-goal-engine.ts`
- Reads `youtube_output_metrics` (30d) → computes trajectory → AI sets/revises `improvementGoals` every 24h
- Writes `catalog_exhaustion_signal` to masterKnowledgeBank when BF6 catalog ≥85% mined
- Wave 10.5 delay: 8 min after wave start

### Gap 2 — Self-modification limited to prompts
`server/services/safe-self-implementer.ts`
- Reads `masterKnowledgeBank` where category="action_required" AND timesApplied=0
- Classifies each: SAFE (system_settings, engine_interval, strategy_toggle) vs UNSAFE (code)
- SAFE → implements immediately → marks timesApplied+1 → logs to systemImprovements
- UNSAFE → left for human/self-architect email flow
- Wave 10.5 delay: 12 min after wave start

### Gap 3 — No unified reasoning context
`server/lib/reasoning-hub.ts`
- `getReasoningContext(userId)` → aggregates goals, causal attributions, top MKB principles, active strategies, recent incidents
- Cached 15 min per userId
- `getContextString(userId)` returns pre-formatted string for direct prompt injection
- **Injected into youtube-ai-orchestrator's synthesizeChannelStrategy** — every full AI cycle has cross-system awareness
- `invalidateReasoningContext(userId)` for manual cache busting

### Gap 4 — No causal world model
`server/services/causal-attribution-engine.ts`
- Runs weekly; queries `youtube_output_metrics` (90d, views>0)
- Groups by: contentType, postingWindow, durationBucket, thumbnailStyleTag
- Computes mean views/CTR/watchPct per group, writes winners to masterKnowledgeBank (category="causal_attribution")
- Also seeds untested `hypotheses` for autonomous-experimenter
- Wave 10.5 delay: 20 min after wave start (heavy query)

### Gap 5 — Fixed content scope
`server/services/content-expansion-engine.ts`
- Every 48h: checks BF6 mined ratio + 14d growth trend vs prior 14d
- Expansion trigger: BF6 >85% mined OR growth flattening (±10% threshold)
- AI evaluates next game, writes to improvementGoals + discoveredStrategies + MKB (category="action_required")
- safe-self-implementer picks up the action_required entry and evaluates safety
- Wave 10.5 delay: 25 min after wave start

## Key design decisions

**Why:** action_required → safe-self-implementer flow keeps AI from silently rewriting config without any audit trail. Every implemented change is logged to systemImprovements.

**How to apply:** When adding a new autonomous config-change capability, write to masterKnowledgeBank with category="action_required" and timesApplied=0. Safe-self-implementer will classify and implement within 6h.

**Table usage:** Zero new tables. Uses improvementGoals, discoveredStrategies, masterKnowledgeBank, systemImprovements, hypotheses, engineIntervalConfigs, youtubeOutputMetrics, backCatalogVideos.
