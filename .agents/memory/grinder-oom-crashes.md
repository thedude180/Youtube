---
name: Grinder OOM crashes 2026-06-06
description: 20 production crashes/day root causes and fixes — grinder queue-depth bug + 5-min follow-up + catalog sync timing + VODSEOOptimizer AI slot starvation
---

## Root Cause 1 — getGrindQueueDepth excluded overdue items
`getGrindQueueDepth()` in `relentless-content-grinder.ts` filtered `scheduledAt >= now`.
When 353+ items had past-due scheduledAt values, they were invisible → depth=0 → URGENT interval (~20-22 min).

**Why:** The query was designed to count "upcoming" work, but a full backlog of overdue items is equally important for throttling.

**How to apply:** Any queue-depth probe that selects by `scheduledAt >= now` will undercount in normal operating conditions. Always count ALL pending/scheduled items.

**Fix:** Removed the `scheduledAt >= now` filter.

---

## Root Cause 2 — Grinder 5-min immediate follow-up caused OOM convergence
After each grind cycle that produced >5 clips, the grinder rescheduled at 5-6 min (`madeProgress` fast-path). This caused the T+4min initial run to trigger a T+9min second run, which then converged with:
- Catalog sync at T+10min (heavy YouTube API + DB writes)
- Back-catalog runner at T+10-20min (heaviest memory consumer)

Three heavy operations simultaneously → OOM kill.

**Why:** The 5-min follow-up was intended to "keep the pipeline full" but was never conditioned on queue depth. With a full queue it's wasteful and dangerous.

**Fix:** Removed the `madeProgress` fast-path entirely. Always call `scheduleNextGrind()` (adaptive interval based on actual queue depth).

---

## Root Cause 3 — Catalog sync initial delay too short
`startCatalogSync()` used a 600_000ms (10 min) initial delay. With the grinder at T+4min and back-catalog runner at T+10-20min, a 10-min sync lands exactly in the crash window.

**Fix:** Pushed to 2_400_000ms (40 min) — after grinder first run (T+4min), back-catalog runner (T+10-20min), and grinder adaptive follow-up (~T+24-26min when depth=0 forces URGENT).

---

## Root Cause 4 — VODSEOOptimizer no concurrency limit
Each `optimize()` call uses 2 AI background slots:
1. `executeRoutedAICall` (primary SEO generation)
2. `critiqueAndRefine` (self-critique of the generated title)

Without a concurrency guard, 2 concurrent `optimize()` calls hold all 4/4 background AI slots permanently, starving every other AI-dependent service (back-catalog engine, orchestrator, publishers).

**Fix:** Added `private _running` mutex to `VODSEOOptimizer`. Only one `optimize()` in-flight at a time. Moved body to `_doOptimize()` private method. Callers that arrive while `_running=true` return immediately (skip and log debug).

---

## Boot sequence after all fixes
- T+4min: grinder first run (adaptive, depth-based interval)
- T+10-20min: back-catalog runner starts (isolated, no grinder convergence)
- ~T+24-26min: grinder adaptive follow-up (URGENT=20-22min if depth=0, HEALTHY=60-70min if depth≥42)
- T+40min: catalog sync first run (clear of all heavy boot services)

No convergence window remains.
