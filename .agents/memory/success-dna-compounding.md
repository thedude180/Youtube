---
name: Success DNA Compounding System
description: How the closed learning→content feedback loop works; key files and the Bayesian confidence mechanism
---

## The problem it solves
`youtube-learning-brain.ts` ran daily and stored insights in `learningInsights`,
but never wrote to `masterKnowledgeBank`. All content generators read from
`masterKnowledgeBank` via `getMasterKnowledgeForPrompt()`. The loop was severed:
real video performance data never improved future AI prompts.

## How it works
1. `refreshSuccessDNA(userId)` is called at the end of every `runDailyLearningCycle()`
2. It reads `youtubeOutputMetrics` (all videos for the user, up to 200)
3. Groups by 6 pattern dimensions: game_focus, duration_bucket, posting_window,
   content_type, thumbnail_style, hook_retention
4. For each pattern value: computes whether it's a winner (top-33%) or loser (bottom-33%)
5. Applies Bayesian confidence update: `newConf = oldConf + α × (target − oldConf)`
   where `α = 0.18 / (1 + 0.008 × sampleCount)` — learning rate slows as evidence grows
6. Upserts into `channel_success_dna` table
7. High-confidence patterns (≥0.68 conf, ≥3 samples) are written to `masterKnowledgeBank`
   with `applicableEngines` set to content-grinder, self-improvement, growth-flywheel, etc.
   → automatically flows into `getMasterKnowledgeForPrompt()` → all AI generators

## Key files
- `server/lib/success-dna.ts` — core engine (refreshSuccessDNA, getSuccessDNAContext, getSuccessDNA)
- `server/services/youtube-learning-brain.ts` — calls refreshSuccessDNA after daily cycle; also
  writes best_duration_bucket + best_posting_window to engineKnowledge via recordEngineKnowledge
- `shared/schema.ts` → `channelSuccessDna` table (channel_success_dna in DB)
- `client/src/pages/dashboard/SuccessDNA.tsx` — dashboard panel
- API: GET /api/youtube/success-dna, POST /api/youtube/success-dna/refresh

## Why Bayesian (not simple average)
Confidence compounds asymptotically toward certainty — confirmed patterns grow MORE
confident with each new video that validates them, but can't reach 100% (always room
for doubt). Early on the system changes its mind easily; after 50+ confirming videos,
the pattern is stable. This mirrors how real expertise is built.

## Important: masterKnowledgeBank upsert
The system checks if a matching principle already exists (substring match on the pattern value)
before inserting — avoids duplicates. Uses `.onConflictDoNothing()` as a fallback safety net.
The `applicableEngines` array is set on insert so getMasterKnowledgeForPrompt routes these
entries to the right generators.
