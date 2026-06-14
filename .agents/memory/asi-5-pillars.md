---
name: ASI 5 pillars
description: Architecture and wiring of the 5 ASI-level reasoning pillars built for CreatorOS.
---

## The 5 pillars

**Pillar 1 — Adversarial Evaluator** (`server/services/adversarial-evaluator.ts`)
- Called from `omni-intelligence-harvester.ts` `synthesizeIntelligence()` before writing to `growthStrategies`
- Batches all strategy candidates in ONE AI call; rejects any scoring below SURVIVE_THRESHOLD=40
- Non-fatal: on AI failure all candidates pass through

**Pillar 2 — Causal Synthesis** (`server/services/causal-synthesis.ts`)
- Called as step 9h in `youtube-learning-brain.ts` `runDailyLearningCycle()`
- Reads cross-domain `intelligenceSignals` (curiosity + web + non-gaming RSS, last 48h)
- Extracts [FIELD] → [mechanism] → [viewerEffect] → [CHANNEL RULE] chains
- Writes to `masterKnowledgeBank` category="causal_chain"; 20h cooldown per user

**Pillar 3 — Prompt Self-Improver** (`server/services/prompt-self-improver.ts`)
- Called from `runWeeklySynthesis()` after the weekly brief is written
- IMPROVABLE_KEYS: title_generation, thumbnail_concept, short_hook, description_generation, seo_tags, clip_selection, video_scoring
- Retires old `promptVersions` row + inserts improved version; calls `invalidatePromptCache()`
- Max 3 prompts improved per weekly run (AI budget)

**Pillar 4 — Prediction Tracker** (`server/services/prediction-tracker.ts`)
- Called as step 9i in daily learning cycle
- Finds `growthStrategies` older than 14d with `estimatedImpact` set
- Checks `masterKnowledgeBank` for existing `prediction_calibration` entry (metadata->>'strategyId')
- Measures publishing proxy (autopilotQueue published counts by userId, last 14d)
- Writes calibration learning to `masterKnowledgeBank` category="prediction_calibration"

**Pillar 5 — Goal Planner** (`server/services/goal-planner.ts`)
- `getGoalContext(userId)` called from `buildExecutionPlan()` in orchestrator (pillar 5 injection point)
- Goals stored in `systemSettings` key `goal_planner:goals:{userId}`; refresh every 30 days
- Defaults: 21 Shorts/week (3/day), 7 long-form/week (1/day)
- When URGENT gap detected: `queue_shorts`/`queue_long_form` task priority boosted 7→9

## Key gotcha
`autopilotQueue` has NO `channelId` column — always filter by `userId` not channelId.
`growthStrategies` has NO `metadata` jsonb column — prediction tracking stored in masterKnowledgeBank only.
