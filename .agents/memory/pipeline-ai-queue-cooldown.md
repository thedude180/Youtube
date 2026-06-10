---
name: Pipeline AI queue cooldown fix
description: Pipeline executor sets status='error' (not 'pending') on AI queue full to prevent tight retry loops
---

## Rule
When `executePipelineInBackground` hits "AI queue full" on any step, it now sets
`status='error'` with `errorMessage='AI queue full — auto-retry pending'` instead
of `status='pending'`.

**Why:** Resetting to `pending` immediately re-exposes the pipeline to the drip-feed
on its next tick (~2.5 min). On a crash/restart, the drip-feed's in-memory cooldown
map (`pipelineLastKicked`) is cleared, so ALL previously-cooled pipelines flood back
simultaneously. This created a burst of 20+ pipelines every 2-3 seconds at boot,
permanently holding all AI semaphore slots and starving every other engine.

**How to apply:**
- `status='error'` keeps the pipeline invisible to the drip-feed (which only selects
  `status='pending'`).
- `pipeline-self-heal.ts` `transientConditions` includes `%AI queue full%` —
  the 20-min self-heal cycle resets these errors back to `pending` automatically.
- On the next boot, `prod-heal` step 5 also resets "AI queue full" errors to pending
  (lines 929-944 in index.ts) — intentional, gives them one chance per boot.
- The `TRANSIENT_AI` list in pipeline-self-heal.ts must always include
  `%AI queue full%` and `%queue full%` or these pipelines will be orphaned.
