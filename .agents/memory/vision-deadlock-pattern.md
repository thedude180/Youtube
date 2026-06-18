---
name: Factory client + manual slot acquire deadlock
description: Calling acquireAISlotBackground() manually THEN using getOpenAIClientBackground() causes a self-deadlock — the factory client re-acquires the slot inside withRetry(), and neither side ever unblocks.
---

## Rule
**Never call `acquireAISlotBackground()` (or `acquireAISlot()`) manually before a call to `getOpenAIClientBackground()` (or `getOpenAIClient()`).**

The factory clients — `getOpenAIClientBackground()`, `getOpenAIClient()` — have patched `.create()` methods that wrap every call in `withRetry()` → `awaitSystemSlot()` → `acquireAISlotBackground()`. This means the factory client ALWAYS acquires the slot itself.

If the caller also acquires it manually first (`_busy=true`), the factory client's inner `awaitSystemSlot()` waits for release → but release only happens after `.create()` resolves → `.create()` is waiting for the slot → **deadlock**. The 8-minute stuck-slot watchdog eventually force-releases, but every call takes 8–9 minutes instead of 1–2 seconds.

## Why
This bug appeared in `vision-clip-detector.ts` and `cutscene-editor.ts`. Both files:
1. Called `acquireAISlotBackground()` (outer acquire)
2. Called `openai.chat.completions.create()` via `getOpenAIClientBackground()` (inner acquire)
3. Deadlocked → 8/9-minute stuck slot on every batch → all 5 queued callers blocked

## How to apply
- Use factory clients (`getOpenAIClientBackground()`) **without** manual slot calls. The factory handles everything.
- Use raw clients (`getRawOpenAIClientForDirectUse()`) **only** when managing the slot manually (e.g., `tryAcquireAISlotNow()` + manual `releaseAISlot()`).
- Pattern check: if a file imports both `acquireAISlotBackground` AND `getOpenAIClientBackground`, that's a red flag — it's almost certainly a deadlock.
