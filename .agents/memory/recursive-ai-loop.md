---
name: Recursive AI loop closure
description: How the self-improvement stack's dead loops were closed — what was missing and how it was fixed.
---

## The Dead Loops That Existed

1. **promptVersions write-only trap**: prompt-evolution-engine, autonomous-capability-engine, and internet-benchmark-engine all evolved prompts and wrote new versions to the `promptVersions` table every 90 min. But every content generator (vod-seo-optimizer, catalog-content-engine, shorts publisher, etc.) used hardcoded system prompt strings. The evolved prompts accumulated in the DB and were never read. Complete dead loop.

2. **One-shot generation**: Content (title, description, tags) was generated once and published as-is. No self-review, no improvement pass.

3. **No velocity measurement**: The system had no way to know if its weekly output was actually getting better or worse. All the learning engines ran but nobody measured the compound effect.

## How Each Was Fixed

### 1. `server/lib/prompt-loader.ts` — closes the write-only trap
- `loadActivePrompt(promptKey, defaults)` reads the latest `status="active"` row from `promptVersions` for a given key
- 10-minute in-memory cache to avoid per-request DB queries
- Falls back to `defaults.systemPrompt` if no evolved version exists yet
- `invalidatePromptCache(key)` / `invalidateAllPromptCaches()` for manual eviction
- **Wired into**: vod-seo-optimizer uses `"seo_optimization"` key; catalog-content-engine uses `"content_strategy"` key

### 2. `server/services/recursive-critique-loop.ts` — closes the one-shot trap
- `critiqueAndRefine(draft, context, userId)` runs a single AI critique+refine round
- Uses `tryAcquireAISlotNow()` — non-blocking; skips gracefully if all AI slots busy
- Returns improved title (and optionally improved first description hook line)
- Stores critique findings in `engineKnowledge` (topic `title_weakness:*`) for prompt-evolution-engine to learn from
- Token budget: max 400 tokens per critique call (gpt-4o-mini)
- **Wired into**: vod-seo-optimizer calls it on every generated title before DB write

### 3. `server/services/generation-cohort-tracker.ts` — closes the velocity blind spot
- `runCohortAnalysis(userId)` groups `youtubeOutputMetrics` by ISO week
- Computes avg performance score per cohort, calculates velocity: `(G_n - G_{n-1}) / G_{n-1} * 100`
- Upserts a `"improvement_velocity"` row in `masterKnowledgeBank` (all engines read this)
- Also writes to `engineKnowledge` with topic `cohort_YYYY-WNN`
- Trend thresholds: >+5% = improving, <-5% = declining, otherwise stable
- **Wired into**: youtube-learning-brain calls it after `refreshSuccessDNA` each daily cycle; also runs standalone via `initCohortTracker` in Wave 10.5 at T+35min

## Key Design Principles
- All three additions are **non-fatal** — if they fail, the original content/flow proceeds unchanged
- `prompt-loader` has a 10-min cache (prompt evolution runs every 90 min, so cache never goes stale relative to evolution cadence)
- `critiqueAndRefine` skips if AI semaphore is full — never blocks a publish
- Cohort tracker requires ≥4 `youtubeOutputMetrics` rows and ≥2 complete weeks to produce a velocity signal

**Why:** The system had the brain (15+ improvement engines) but the feedback wires weren't connected. Content generators ignored evolved prompts, one-shot content never self-improved, and nobody measured whether any of the learning was actually working.
