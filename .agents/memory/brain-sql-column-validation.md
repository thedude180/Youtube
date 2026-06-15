---
name: Brain SQL column validation — back_catalog_videos
description: The learning brain uses raw SQL queries that reference back_catalog_videos columns. Several column names are non-obvious; wrong names fail silently because the brain wraps all intake queries in (non-fatal) catch blocks.
---

## The core problem

`youtube-learning-brain.ts` wraps every brain intake query in `try { ... } catch { log.warn('... non-fatal') }`. This means a wrong column name in raw SQL causes a silent failure every daily cycle — the brain accumulates no data from that step, but nothing crashes and nothing alerts loudly.

**Production incident (2026-06-15):** `synthesizePipelineIntelligence()` Step 3 queried `score` on `back_catalog_videos`. That column does not exist. The correct column is `total_revival_score`. Fixed.

## back_catalog_videos column reference (score-related)

| Concept | Correct column name | Wrong names that have been tried |
|---------|---------------------|----------------------------------|
| Composite revival score | `total_revival_score` (real) | `score`, `quality_score`, `back_catalog_score` |
| Metadata opportunity | `metadata_opportunity_score` (real) | — |
| Thumbnail opportunity | `thumbnail_opportunity_score` (real) | — |
| Shorts opportunity | `shorts_opportunity_score` (real) | — |
| Long-form opportunity | `long_form_opportunity_score` (real) | — |
| Monetization opportunity | `monetization_opportunity_score` (real) | — |

All score columns are `real` (nullable). Use `IS NOT NULL AND col >= threshold` guards.

## back_catalog_videos key non-obvious columns

- **No `score` column** — use `total_revival_score`
- **No `is_shorts_mined` / `is_long_form_mined`** in the Drizzle type — raw SQL uses `mined_for_shorts` / `mined_for_long_form` (boolean)
- Duration: `duration_sec` (integer, seconds) — NOT `duration_seconds` or `duration`
- YouTube ID: `youtube_video_id` (text) — NOT `youtube_id` or `video_id`
- Mining flags reset: `is_shorts_mined` and `is_long_form_mined` are what the migrations set; Drizzle schema uses `minedForShorts` / `minedForLongForm`

## How to apply

Before writing any raw SQL query in `youtube-learning-brain.ts` (or any service) that references `back_catalog_videos`:
1. Open `shared/schema.ts` and search for `backCatalogVideos = pgTable`
2. Verify each column name against the Drizzle definition
3. Add an explicit `log.warn` INSIDE the catch block so the failure is visible in prod logs (not just swallowed)

**Pattern:** `catch (err: any) { log.warn(\`[Brain] Step N failed (non-fatal): ${err?.message?.slice(0,200)}\`); }` — never a bare catch or empty catch.

## Why silent catch is dangerous here

The brain's daily cycle is the only feedback loop that feeds `masterKnowledgeBank`. If Step 3 (catalog stock) fails silently every day, the brain never knows how much BF6 catalog remains for mining. The AI orchestrator then makes allocation decisions with stale/missing catalog data. Always add a `log.warn` even if the failure is non-fatal.
